'use strict';
require('dotenv').config();

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const path     = require('path');
const { MongoClient } = require('mongodb');

const app    = express();
const PORT   = process.env.PORT || 3000;
const PROD   = process.env.NODE_ENV === 'production';
const DOMAIN = (process.env.ALLOWED_DOMAIN || 'triviatrens.com.br').toLowerCase();
const TZ     = 'America/Sao_Paulo';

// Em produção a chave do JWT é obrigatória (sem ela qualquer um poderia forjar um login).
if (PROD && !process.env.JWT_SECRET) {
  console.error('❌ Defina a variável JWT_SECRET antes de iniciar em produção.');
  process.exit(1);
}
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// ── Utilidades ────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gestaoequipe';
let db;

const norm   = e => String(e || '').trim().toLowerCase();
const domOk  = e => norm(e).split('@')[1] === DOMAIN;
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isPer  = s => typeof s === 'string' && /^\d{4}-S[12]$/.test(s);
const pick   = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

// Data "de hoje" no fuso de São Paulo (toISOString usa UTC e vira o dia às 21h)
function hojeBR(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

// Cálculo da nota (o servidor é a fonte da verdade; o navegador só mostra a prévia)
const PESOS      = { conhecimentoTecnico: .20, segurancaOperacional: .20, iniciativaAtuacao: .15, disponibilidade: .15, trabalhoEquipe: .12, comunicacao: .10, proatividade: .08 };
const ORG_FIELDS = ['focoResultados', 'posturaEtica', 'alinhamentoValores'];
const ALL_FIELDS = [...Object.keys(PESOS), ...ORG_FIELDS];
function calcNotas(criterios) {
  const c = {};
  for (const f of ALL_FIELDS) {
    const v = Math.round(Number(criterios?.[f]));
    if (!(v >= 1 && v <= 5)) return null;
    c[f] = v;
  }
  const nota_base     = Math.round(Object.keys(PESOS).reduce((s, f) => s + c[f] * PESOS[f], 0) * 100) / 100;
  const mediaOrg      = ORG_FIELDS.reduce((s, f) => s + c[f], 0) / ORG_FIELDS.length;
  const multiplicador = Math.round((0.80 + (mediaOrg - 1) * 0.10) * 100) / 100;
  const nota_final    = Math.round(nota_base * multiplicador * 100) / 100;
  return { criterios: c, nota_base, multiplicador, nota_final };
}

async function nextId(col) {
  const r = await db.collection('counters').findOneAndUpdate(
    { _id: col }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return (r && r.value !== undefined ? r.value : r).seq;
}

async function userByEmail(email) { return db.collection('users').findOne({ email: norm(email) }); }
async function tecnicoDoUsuario(userId) {
  const u = await db.collection('users').findOne({ id: userId });
  if (!u) return null;
  return db.collection('tecnicos').findOne({ email: norm(u.email) });
}

// ── Banco ─────────────────────────────────────────────────
async function seedDB() {
  const cfg = await db.collection('config').findOne({ _id: 'main' });
  if (!cfg) {
    await db.collection('config').insertOne({
      _id: 'main',
      bases:   { 'Base 1': 'BAS', 'Base 2': 'JBO', 'Base 3': 'CVN', 'Base 4': 'SMP' },
    });
  }

  // e-mails sempre minúsculos (comparação exata, sem regex)
  for (const col of ['users', 'tecnicos', 'registros']) {
    const docs = await db.collection(col).find({ email: { $type: 'string' } }).toArray();
    for (const d of docs) if (d.email !== norm(d.email)) await db.collection(col).updateOne({ _id: d._id }, { $set: { email: norm(d.email) } });
  }

  // Primeiro administrador: senha vem de ADMIN_PASSWORD ou é gerada e mostrada uma única vez no log.
  if (!await db.collection('users').findOne({ role: 'admin' })) {
    const email = norm(process.env.ADMIN_EMAIL || `admin@${DOMAIN}`);
    const senha = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await db.collection('users').insertOne({
      id: await nextId('users'), nome: 'Administrador', email,
      password: bcrypt.hashSync(senha, 10), role: 'admin', trocar_senha: true,
      created_at: new Date().toISOString(),
    });
    console.log(`\n✅ Administrador criado: ${email}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`   Senha provisória: ${senha}  (troque no primeiro acesso)\n`);
  }

  // Avisa se ainda existe a senha antiga que estava publicada no código
  const antigos = await db.collection('users').find({ role: 'admin' }).toArray();
  for (const u of antigos) {
    if (bcrypt.compareSync('Trivia@2025', u.password)) {
      await db.collection('users').updateOne({ id: u.id }, { $set: { trocar_senha: true } });
      console.warn(`⚠️  ${u.email} ainda usa a senha padrão antiga. Ela será obrigada a trocar no próximo login.`);
    }
  }
}

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db();
  console.log('✅ MongoDB conectado');
  await seedDB();
}

// ── Middleware ────────────────────────────────────────────
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Somente supervisores podem fazer isso.' });
  next();
}
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Erro no servidor. Tente de novo.' }); });

// Limite simples de tentativas de login (10 a cada 15 min por IP + e-mail)
const tentativas = new Map();
function limiteLogin(req, res, next) {
  const k = (req.ip || '') + '|' + norm(req.body?.email);
  const agora = Date.now();
  const t = (tentativas.get(k) || []).filter(x => agora - x < 15 * 60000);
  if (t.length >= 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });
  t.push(agora); tentativas.set(k, t);
  next();
}

// ── Autenticação ──────────────────────────────────────────
app.post('/api/auth/login', limiteLogin, wrap(async (req, res) => {
  const email = norm(req.body?.email), password = req.body?.password;
  if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });
  if (!domOk(email)) return res.status(403).json({ error: `Use seu e-mail @${DOMAIN}.` });
  const user = await userByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  tentativas.delete((req.ip || '') + '|' + email);
  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role }, SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role, trocar_senha: !!user.trocar_senha } });
}));

app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const u = await db.collection('users').findOne({ id: req.user.id });
  if (!u) return res.status(401).json({ error: 'Usuário não encontrado.' });
  const tec = await db.collection('tecnicos').findOne({ email: norm(u.email) });
  res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, trocar_senha: !!u.trocar_senha, tecnico: tec || null });
}));

app.put('/api/auth/senha', auth, wrap(async (req, res) => {
  const { atual, nova } = req.body || {};
  if (!nova || String(nova).length < 8) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  const u = await db.collection('users').findOne({ id: req.user.id });
  if (!u || !bcrypt.compareSync(String(atual || ''), u.password)) return res.status(400).json({ error: 'Senha atual incorreta.' });
  await db.collection('users').updateOne({ id: u.id }, { $set: { password: bcrypt.hashSync(String(nova), 10), trocar_senha: false } });
  res.json({ ok: true });
}));

// ── Configuração ──────────────────────────────────────────
app.get('/api/config', auth, wrap(async (req, res) => {
  const cfg = await db.collection('config').findOne({ _id: 'main' });
  res.json({ bases: cfg?.bases || {} });
}));

app.put('/api/config/bases', auth, adminOnly, wrap(async (req, res) => {
  const b = req.body?.bases;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'Dados inválidos.' });
  const bases = {};
  for (const k of ['Base 1', 'Base 2', 'Base 3', 'Base 4']) bases[k] = String(b[k] || '').trim().slice(0, 20) || k;
  await db.collection('config').updateOne({ _id: 'main' }, { $set: { bases } }, { upsert: true });
  res.json({ ok: true });
}));

// ── Solicitações de cadastro ──────────────────────────────
app.get('/api/registros', auth, adminOnly, wrap(async (req, res) => {
  const list = await db.collection('registros').find({}, { projection: { password: 0 } }).sort({ created_at: -1 }).toArray();
  res.json(list);
}));

app.post('/api/registros', limiteLogin, wrap(async (req, res) => {
  const { nome, password, base, escala, turno, admissao } = req.body || {};
  const email = norm(req.body?.email);
  if (!nome || !email || !password || !base || !escala || !turno || !isDate(admissao))
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  if (!domOk(email)) return res.status(403).json({ error: `Use seu e-mail @${DOMAIN}.` });
  if (String(password).length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (await userByEmail(email)) return res.status(400).json({ error: 'Este e-mail já tem acesso. Use "Entrar".' });
  if (await db.collection('registros').findOne({ email, status: 'pendente' }))
    return res.status(400).json({ error: 'Já existe uma solicitação aguardando aprovação para este e-mail.' });

  await db.collection('registros').insertOne({
    id: await nextId('registros'), nome: String(nome).trim().slice(0, 80), email,
    password: bcrypt.hashSync(String(password), 10),
    base, escala, turno, admissao,
    status: 'pendente', created_at: new Date().toISOString(),
  });
  res.status(201).json({ ok: true });
}));

app.post('/api/registros/:id/aprovar', auth, adminOnly, wrap(async (req, res) => {
  const id = +req.params.id;
  const reg = await db.collection('registros').findOne({ id });
  if (!reg) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  if (reg.status !== 'pendente') return res.status(400).json({ error: 'Esta solicitação já foi analisada.' });
  if (await userByEmail(reg.email)) return res.status(400).json({ error: 'Este e-mail já tem acesso.' });

  await db.collection('users').insertOne({
    id: await nextId('users'), nome: reg.nome, email: reg.email,
    password: reg.password, role: 'user', created_at: new Date().toISOString(),
  });
  // Se já existe técnico com esse e-mail, só vincula; senão cria
  if (!await db.collection('tecnicos').findOne({ email: reg.email })) {
    await db.collection('tecnicos').insertOne({
      id: await nextId('tecnicos'), nome: reg.nome, base: reg.base, escala: reg.escala, turno: reg.turno,
      admissao: reg.admissao, email: reg.email, created_at: new Date().toISOString(),
    });
  }
  await db.collection('registros').updateOne({ id }, { $set: { status: 'aprovado', aprovado_em: new Date().toISOString() } });
  res.json({ ok: true });
}));

app.post('/api/registros/:id/rejeitar', auth, adminOnly, wrap(async (req, res) => {
  const id = +req.params.id;
  const r = await db.collection('registros').updateOne({ id, status: 'pendente' }, { $set: { status: 'rejeitado', rejeitado_em: new Date().toISOString() } });
  if (!r.matchedCount) return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
  res.json({ ok: true });
}));

// ── Usuários (somente supervisor) ─────────────────────────
app.get('/api/users', auth, adminOnly, wrap(async (req, res) => {
  const users = await db.collection('users').find({}).sort({ nome: 1 }).toArray();
  res.json(users.map(u => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, created_at: u.created_at })));
}));

app.post('/api/users', auth, adminOnly, wrap(async (req, res) => {
  const { nome, password, role } = req.body || {};
  const email = norm(req.body?.email);
  if (!nome || !email || !password) return res.status(400).json({ error: 'Preencha nome, e-mail e senha.' });
  if (!domOk(email)) return res.status(400).json({ error: `Use um e-mail @${DOMAIN}.` });
  if (String(password).length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (await userByEmail(email)) return res.status(400).json({ error: 'Já existe um usuário com este e-mail.' });
  const obj = {
    id: await nextId('users'), nome: String(nome).trim(), email,
    password: bcrypt.hashSync(String(password), 10), role: role === 'admin' ? 'admin' : 'user',
    trocar_senha: true, created_at: new Date().toISOString(),
  };
  await db.collection('users').insertOne(obj);
  res.status(201).json({ id: obj.id, nome: obj.nome, email, role: obj.role });
}));

app.put('/api/users/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = +req.params.id;
  const u = await db.collection('users').findOne({ id });
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const { nome, password, role } = req.body || {};
  const email = req.body?.email ? norm(req.body.email) : u.email;
  if (!domOk(email)) return res.status(400).json({ error: `Use um e-mail @${DOMAIN}.` });
  if (email !== u.email && await userByEmail(email)) return res.status(400).json({ error: 'Já existe um usuário com este e-mail.' });
  if (id === req.user.id && role && role !== 'admin') return res.status(400).json({ error: 'Você não pode tirar o seu próprio acesso de supervisor.' });
  const set = { nome: nome ? String(nome).trim() : u.nome, email, role: role === 'admin' ? 'admin' : role === 'user' ? 'user' : u.role };
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
    set.password = bcrypt.hashSync(String(password), 10); set.trocar_senha = true;
  }
  await db.collection('users').updateOne({ id }, { $set: set });
  // mantém o vínculo com o técnico se o e-mail mudou
  if (email !== u.email) await db.collection('tecnicos').updateMany({ email: u.email }, { $set: { email } });
  res.json({ ok: true });
}));

app.delete('/api/users/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
  const r = await db.collection('users').deleteOne({ id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ ok: true });
}));

// ── Técnicos ──────────────────────────────────────────────
const TEC_CAMPOS = ['nome', 'base', 'escala', 'turno', 'admissao', 'email'];

app.get('/api/tecnicos', auth, adminOnly, wrap(async (req, res) => {
  const users = await db.collection('users').find({}).toArray();
  const porEmail = new Map(users.map(u => [norm(u.email), u]));
  const tecs = await db.collection('tecnicos').find({}).sort({ nome: 1 }).toArray();
  res.json(tecs.map(t => {
    const u = t.email ? porEmail.get(norm(t.email)) : null;
    return { ...t, user_vinculado: u ? { id: u.id, nome: u.nome } : null };
  }));
}));

app.get('/api/users-disponiveis', auth, adminOnly, wrap(async (req, res) => {
  const tecs = await db.collection('tecnicos').find({}).toArray();
  const usados = new Set(tecs.filter(t => t.email).map(t => norm(t.email)));
  const users = await db.collection('users').find({}).sort({ nome: 1 }).toArray();
  res.json(users.map(u => ({ id: u.id, nome: u.nome, email: u.email, jaVinculado: usados.has(norm(u.email)) })));
}));

function validaTecnico(b) {
  if (!b.nome || !b.base || !b.escala || !b.turno || !isDate(b.admissao)) return 'Preencha nome, base, escala, turno e admissão.';
  if (b.email && !domOk(b.email)) return `O e-mail precisa ser @${DOMAIN}.`;
  return null;
}

app.post('/api/tecnicos', auth, adminOnly, wrap(async (req, res) => {
  const b = pick(req.body || {}, TEC_CAMPOS);
  b.email = norm(b.email);
  const erro = validaTecnico(b); if (erro) return res.status(400).json({ error: erro });
  if (b.email && await db.collection('tecnicos').findOne({ email: b.email }))
    return res.status(400).json({ error: 'Já existe um técnico com este e-mail.' });
  const obj = { id: await nextId('tecnicos'), ...b, nome: String(b.nome).trim(), created_at: new Date().toISOString() };
  await db.collection('tecnicos').insertOne(obj);
  res.status(201).json(obj);
}));

app.put('/api/tecnicos/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = +req.params.id;
  const atual = await db.collection('tecnicos').findOne({ id });
  if (!atual) return res.status(404).json({ error: 'Técnico não encontrado.' });
  const b = { ...pick(atual, TEC_CAMPOS), ...pick(req.body || {}, TEC_CAMPOS) };
  b.email = norm(b.email);
  const erro = validaTecnico(b); if (erro) return res.status(400).json({ error: erro });
  if (b.email && await db.collection('tecnicos').findOne({ email: b.email, id: { $ne: id } }))
    return res.status(400).json({ error: 'Outro técnico já usa este e-mail.' });
  await db.collection('tecnicos').updateOne({ id }, { $set: b });
  res.json({ ok: true });
}));

app.delete('/api/tecnicos/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = +req.params.id;
  const r = await db.collection('tecnicos').deleteOne({ id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Técnico não encontrado.' });
  await db.collection('avaliacoes').deleteMany({ tecnico_id: id });
  res.json({ ok: true });
}));

// ── Avaliações ────────────────────────────────────────────
function enrichAv(a, tecs) {
  const t = tecs.find(x => x.id === a.tecnico_id);
  return { ...a, tecnico_nome: t?.nome || '?', tecnico_base: t?.base || '?' };
}

app.get('/api/avaliacoes', auth, wrap(async (req, res) => {
  const tecs = await db.collection('tecnicos').find({}).toArray();
  let list = await db.collection('avaliacoes').find({}).toArray();
  if (req.user.role !== 'admin') {
    const tec = await tecnicoDoUsuario(req.user.id);
    if (!tec) return res.json([]);
    const comFeedback = new Set(list.filter(a => a.tecnico_id === tec.id && a.tipo === 'supervisor' && a.feedback_texto).map(a => a.periodo));
    list = list.filter(a => a.tecnico_id === tec.id && (a.tipo === 'autoavaliacao' || a.liberado === true))
      .map(a => a.tipo === 'autoavaliacao' ? { ...a, bloqueada: comFeedback.has(a.periodo) } : a);
  }
  res.json(list.map(a => enrichAv(a, tecs)).sort((a, b) => (b.periodo || '').localeCompare(a.periodo || '')));
}));

app.post('/api/avaliacoes', auth, wrap(async (req, res) => {
  const b = req.body || {};
  if (!isPer(b.periodo)) return res.status(400).json({ error: 'Escolha o semestre.' });
  const notas = calcNotas(b.criterios);
  if (!notas) return res.status(400).json({ error: 'Responda todos os 10 critérios (1 a 5).' });

  let tecnico_id = +b.tecnico_id, tipo;
  if (req.user.role !== 'admin') {
    const tec = await tecnicoDoUsuario(req.user.id);
    if (!tec) return res.status(403).json({ error: 'Seu usuário ainda não está ligado a um técnico. Fale com o supervisor.' });
    tecnico_id = tec.id; tipo = 'autoavaliacao';
  } else {
    tipo = 'supervisor';
    if (!await db.collection('tecnicos').findOne({ id: tecnico_id })) return res.status(400).json({ error: 'Escolha o técnico.' });
  }
  if (await db.collection('avaliacoes').findOne({ tecnico_id, periodo: b.periodo, tipo }))
    return res.status(409).json({ error: tipo === 'autoavaliacao' ? 'Você já fez a autoavaliação deste semestre. Abra a existente para editar.' : 'Este técnico já tem avaliação do supervisor neste semestre. Abra a existente para editar.' });

  const obj = {
    id: await nextId('avaliacoes'), tecnico_id, periodo: b.periodo, ...notas, tipo,
    liberado: tipo === 'autoavaliacao', avaliador_id: req.user.id, created_at: new Date().toISOString(),
  };
  await db.collection('avaliacoes').insertOne(obj);
  res.status(201).json(obj);
}));

app.put('/api/avaliacoes/:id', auth, wrap(async (req, res) => {
  const id = +req.params.id;
  const av = await db.collection('avaliacoes').findOne({ id });
  if (!av) return res.status(404).json({ error: 'Avaliação não encontrada.' });
  if (req.user.role !== 'admin') {
    if (av.tipo !== 'autoavaliacao' || av.avaliador_id !== req.user.id) return res.status(403).json({ error: 'Você só pode editar a sua autoavaliação.' });
    const fb = await db.collection('avaliacoes').findOne({ tipo: 'supervisor', tecnico_id: av.tecnico_id, periodo: av.periodo, feedback_texto: { $exists: true, $ne: '' } });
    if (fb) return res.status(403).json({ error: 'O supervisor já deu o feedback deste semestre; a autoavaliação está fechada.' });
  }
  const notas = calcNotas(req.body?.criterios);
  if (!notas) return res.status(400).json({ error: 'Responda todos os 10 critérios (1 a 5).' });
  await db.collection('avaliacoes').updateOne({ id }, { $set: { ...notas, atualizado_em: new Date().toISOString() } });
  res.json({ ok: true });
}));

app.delete('/api/avaliacoes/:id', auth, adminOnly, wrap(async (req, res) => {
  const r = await db.collection('avaliacoes').deleteOne({ id: +req.params.id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Avaliação não encontrada.' });
  res.json({ ok: true });
}));

app.put('/api/avaliacoes/:id/liberar', auth, adminOnly, wrap(async (req, res) => {
  const r = await db.collection('avaliacoes').updateOne({ id: +req.params.id, tipo: 'supervisor' }, { $set: { liberado: true, liberado_em: new Date().toISOString() } });
  if (!r.matchedCount) return res.status(404).json({ error: 'Avaliação não encontrada.' });
  res.json({ ok: true });
}));

app.put('/api/avaliacoes/:id/feedback', auth, adminOnly, wrap(async (req, res) => {
  const id = +req.params.id;
  const av = await db.collection('avaliacoes').findOne({ id, tipo: 'supervisor' });
  if (!av) return res.status(404).json({ error: 'Avaliação do supervisor não encontrada.' });
  const { feedback_texto, feedback_data, liberar } = req.body || {};
  if (!String(feedback_texto || '').trim()) return res.status(400).json({ error: 'Escreva o feedback.' });
  const upd = {
    feedback_texto: String(feedback_texto).trim().slice(0, 5000),
    feedback_data: isDate(feedback_data) ? feedback_data : hojeBR(),
  };
  if (liberar) { upd.liberado = true; upd.liberado_em = new Date().toISOString(); }
  await db.collection('avaliacoes').updateOne({ id }, { $set: upd });
  res.json({ ok: true });
}));

// ── Painel do supervisor ──────────────────────────────────
app.get('/api/dashboard', auth, adminOnly, wrap(async (req, res) => {
  const tecs  = await db.collection('tecnicos').find({}).toArray();
  const avals = await db.collection('avaliacoes').find({ tipo: 'supervisor' }).toArray();
  const cfg   = await db.collection('config').findOne({ _id: 'main' });
  const pendentes = await db.collection('registros').countDocuments({ status: 'pendente' });
  const baseStats = Object.keys(cfg?.bases || {}).map(base => {
    const ids = new Set(tecs.filter(t => t.base === base).map(t => t.id));
    const avs = avals.filter(a => ids.has(a.tecnico_id));
    return { base, total: ids.size, media: avs.length ? Math.round(avs.reduce((s, a) => s + a.nota_final, 0) / avs.length * 100) / 100 : null };
  });
  res.json({ hoje: hojeBR(), totalTecnicos: tecs.length, pendentes, baseStats });
}));

// ── Painel do técnico ─────────────────────────────────────
app.get('/api/dashboard/me', auth, wrap(async (req, res) => {
  const tec = await tecnicoDoUsuario(req.user.id);
  if (!tec) return res.json({ tecnico: null, avaliacoes: [], ultimaSupervisor: null });
  const avAll = await db.collection('avaliacoes').find({ tecnico_id: tec.id }).toArray();
  const visiveis = avAll.filter(a => a.tipo === 'autoavaliacao' || a.liberado);
  const supLib = visiveis.filter(a => a.tipo === 'supervisor').sort((a, b) => b.periodo.localeCompare(a.periodo));
  res.json({ hoje: hojeBR(), tecnico: tec, avaliacoes: visiveis, ultimaSupervisor: supLib[0] || null });
}));

// ── SPA ───────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Não encontrado.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB().then(() => {
  app.listen(PORT, () => console.log(`\n🚀 http://localhost:${PORT}  ·  domínio @${DOMAIN}\n`));
}).catch(err => { console.error('Falha ao conectar ao MongoDB:', err); process.exit(1); });
