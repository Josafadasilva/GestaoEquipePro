'use strict';
require('dotenv').config();

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const low      = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'trivia_secret';
const DOMAIN = process.env.ALLOWED_DOMAIN || 'trivia.com.br';

// ── Database ──────────────────────────────────────────────
const db = low(new FileSync(path.join(__dirname, 'gestao.json')));

db.defaults({
  users: [], tecnicos: [], ferias: [], avaliacoes: [],
  registros: [],
  config: {
    bases:   { 'Base 1': 'BAS', 'Base 2': 'JBO', 'Base 3': 'CVN', 'Base 4': 'SMP' },
    parBase: { 'Base 1': 'Base 2', 'Base 2': 'Base 1', 'Base 3': 'Base 4', 'Base 4': 'Base 3' }
  },
  _seq: { users: 1, tecnicos: 1, ferias: 1, avaliacoes: 1, registros: 1 }
}).write();

// Garante sub-chaves que possam ter ficado null em versões antigas
['users','tecnicos','ferias','avaliacoes','registros'].forEach(k => {
  if (!db.get(`_seq.${k}`).value()) db.set(`_seq.${k}`, 1).write();
});
if (!db.get('config.bases').value())   db.set('config.bases',   { 'Base 1':'Base 1','Base 2':'Base 2','Base 3':'Base 3','Base 4':'Base 4' }).write();
if (!db.get('config.parBase').value()) db.set('config.parBase', { 'Base 1':'Base 2','Base 2':'Base 1','Base 3':'Base 4','Base 4':'Base 3' }).write();

function nextId(col) {
  const seq = db.get(`_seq.${col}`).value();
  db.set(`_seq.${col}`, seq + 1).write();
  return seq;
}

// Seed admin
if (!db.get('users').find({ role: 'admin' }).value()) {
  db.get('users').push({
    id: nextId('users'), nome: 'Administrador',
    email: `admin@${DOMAIN}`, password: bcrypt.hashSync('Trivia@2025', 10),
    role: 'admin', created_at: new Date().toISOString(),
  }).write();
  console.log(`\n✅ Admin criado: admin@${DOMAIN} / Trivia@2025\n`);
}

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido ou expirado' }); }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito' });
  next();
}

// ── Auth ──────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });
  if (email.split('@')[1] !== DOMAIN) return res.status(403).json({ error: `Acesso permitido apenas para @${DOMAIN}` });
  const user = db.get('users').find({ email: email.toLowerCase() }).value();
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role }, SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const u = db.get('users').find({ id: req.user.id }).value();
  if (!u) return res.status(404).json({ error: 'Não encontrado' });
  // retorna também o técnico vinculado ao email
  const tec = db.get('tecnicos').find({ email: u.email }).value() ||
              db.get('tecnicos').find(t => t.email && t.email.toLowerCase() === u.email.toLowerCase()).value();
  res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, tecnico: tec || null });
});

// ── Config (nomes das bases) ──────────────────────────────
app.get('/api/config', auth, (req, res) => {
  res.json(db.get('config').value());
});

app.put('/api/config/bases', auth, adminOnly, (req, res) => {
  const { bases } = req.body;
  if (!bases || typeof bases !== 'object') return res.status(400).json({ error: 'Dados inválidos' });
  db.set('config.bases', bases).write();
  res.json({ ok: true });
});

// ── Registros (auto-cadastro) ─────────────────────────────
app.get('/api/registros', auth, adminOnly, (req, res) => {
  res.json(db.get('registros').orderBy('created_at', 'desc').value());
});

// Rota pública: qualquer um com email do domínio pode solicitar
app.post('/api/registros', (req, res) => {
  const { nome, email, password, base, escala, turno, admissao } = req.body;
  if (!nome || !email || !password || !base || !escala || !turno || !admissao)
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  if (email.split('@')[1] !== DOMAIN)
    return res.status(403).json({ error: `E-mail deve ser @${DOMAIN}` });
  if (db.get('users').find({ email: email.toLowerCase() }).value())
    return res.status(400).json({ error: 'E-mail já possui cadastro no sistema' });
  const pendente = db.get('registros').find({ email: email.toLowerCase(), status: 'pendente' }).value();
  if (pendente) return res.status(400).json({ error: 'Já existe uma solicitação pendente para este e-mail' });

  const admissaoDate = new Date(admissao);
  const fimAq = new Date(admissaoDate);
  fimAq.setFullYear(fimAq.getFullYear() + 1); fimAq.setDate(fimAq.getDate() - 1);

  const obj = {
    id: nextId('registros'), nome, email: email.toLowerCase(),
    password: bcrypt.hashSync(password, 10),
    base, escala, turno, admissao,
    inicio_aquisitivo: admissao,
    fim_aquisitivo: fimAq.toISOString().split('T')[0],
    status: 'pendente', created_at: new Date().toISOString(),
  };
  db.get('registros').push(obj).write();
  res.status(201).json({ ok: true, msg: 'Solicitação enviada! Aguarde aprovação do administrador.' });
});

app.post('/api/registros/:id/aprovar', auth, adminOnly, (req, res) => {
  const id = +req.params.id;
  const reg = db.get('registros').find({ id }).value();
  if (!reg) return res.status(404).json({ error: 'Solicitação não encontrada' });

  // Criar usuário
  db.get('users').push({
    id: nextId('users'), nome: reg.nome, email: reg.email,
    password: reg.password, role: 'user', created_at: new Date().toISOString(),
  }).write();

  // Criar técnico
  db.get('tecnicos').push({
    id: nextId('tecnicos'), nome: reg.nome, base: reg.base,
    escala: reg.escala, turno: reg.turno, admissao: reg.admissao,
    email: reg.email, inicio_aquisitivo: reg.inicio_aquisitivo,
    fim_aquisitivo: reg.fim_aquisitivo, created_at: new Date().toISOString(),
  }).write();

  db.get('registros').find({ id }).assign({ status: 'aprovado', aprovado_em: new Date().toISOString() }).write();
  res.json({ ok: true });
});

app.post('/api/registros/:id/rejeitar', auth, adminOnly, (req, res) => {
  const id = +req.params.id;
  if (!db.get('registros').find({ id }).value()) return res.status(404).json({ error: 'Não encontrado' });
  db.get('registros').find({ id }).assign({ status: 'rejeitado', rejeitado_em: new Date().toISOString() }).write();
  res.json({ ok: true });
});

app.delete('/api/registros/:id', auth, adminOnly, (req, res) => {
  db.get('registros').remove({ id: +req.params.id }).write();
  res.json({ ok: true });
});

// ── Users ─────────────────────────────────────────────────
app.get('/api/users', auth, adminOnly, (req, res) => {
  res.json(db.get('users').map(u => ({ id:u.id, nome:u.nome, email:u.email, role:u.role, created_at:u.created_at })).value());
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { nome, email, password, role } = req.body;
  if (!nome || !email || !password) return res.status(400).json({ error: 'Campos obrigatórios' });
  if (email.split('@')[1] !== DOMAIN) return res.status(400).json({ error: `E-mail deve ser @${DOMAIN}` });
  if (db.get('users').find({ email: email.toLowerCase() }).value()) return res.status(400).json({ error: 'E-mail já cadastrado' });
  const obj = { id: nextId('users'), nome, email: email.toLowerCase(), password: bcrypt.hashSync(password, 10), role: role||'user', created_at: new Date().toISOString() };
  db.get('users').push(obj).write();
  res.status(201).json({ id: obj.id, nome, email, role: obj.role });
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const id = +req.params.id;
  const u = db.get('users').find({ id }).value();
  if (!u) return res.status(404).json({ error: 'Não encontrado' });
  const { nome, email, password, role } = req.body;
  if (email && email.split('@')[1] !== DOMAIN) return res.status(400).json({ error: `E-mail deve ser @${DOMAIN}` });
  db.get('users').find({ id }).assign({ nome: nome||u.nome, email: email?email.toLowerCase():u.email, password: password?bcrypt.hashSync(password,10):u.password, role: role||u.role }).write();
  res.json({ ok: true });
});

app.delete('/api/users/:id', auth, (req, res) => {
  if (+req.params.id === req.user.id) return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
  if (!db.get('users').find({ id: +req.params.id }).value()) return res.status(404).json({ error: 'Não encontrado' });
  db.get('users').remove({ id: +req.params.id }).write();
  res.json({ ok: true });
});

// ── Técnicos ──────────────────────────────────────────────
app.get('/api/tecnicos', auth, (req, res) => {
  const users = db.get('users').value();
  res.json(db.get('tecnicos').sortBy('nome').value().map(t => {
    const u = t.email
      ? users.find(u2 => u2.email.toLowerCase() === t.email.toLowerCase())
      : null;
    return { ...t, user_vinculado: u ? { id: u.id, nome: u.nome } : null };
  }));
});

// Lista usuários que ainda não têm técnico vinculado (para dropdown de vínculo)
app.get('/api/users-disponiveis', auth, adminOnly, (req, res) => {
  const tecs  = db.get('tecnicos').value();
  const users = db.get('users').value();
  // Pega e-mails já usados em técnicos
  const emailsUsados = new Set(tecs.filter(t => t.email).map(t => t.email.toLowerCase()));
  res.json(
    users
      .filter(u => u.role !== 'admin' || !emailsUsados.has(u.email.toLowerCase()))
      .map(u => ({ id: u.id, nome: u.nome, email: u.email, jaVinculado: emailsUsados.has(u.email.toLowerCase()) }))
  );
});

app.post('/api/tecnicos', auth, (req, res) => {
  const { nome, base, escala, turno, admissao, email, inicio_aquisitivo, fim_aquisitivo } = req.body;
  if (!nome||!base||!escala||!turno||!admissao) return res.status(400).json({ error: 'Campos obrigatórios' });
  const obj = { id: nextId('tecnicos'), nome, base, escala, turno, admissao, email:email||'', inicio_aquisitivo:inicio_aquisitivo||'', fim_aquisitivo:fim_aquisitivo||'', created_at: new Date().toISOString() };
  db.get('tecnicos').push(obj).write();
  res.status(201).json(obj);
});

app.put('/api/tecnicos/:id', auth, (req, res) => {
  const id = +req.params.id;
  if (!db.get('tecnicos').find({ id }).value()) return res.status(404).json({ error: 'Não encontrado' });
  db.get('tecnicos').find({ id }).assign(req.body).write();
  res.json({ ok: true });
});

app.delete('/api/tecnicos/:id', auth, (req, res) => {
  const id = +req.params.id;
  if (!db.get('tecnicos').find({ id }).value()) return res.status(404).json({ error: 'Não encontrado' });
  db.get('tecnicos').remove({ id }).write();
  db.get('ferias').remove({ tecnico_id: id }).write();
  db.get('avaliacoes').remove({ tecnico_id: id }).write();
  res.json({ ok: true });
});

// ── Férias ────────────────────────────────────────────────
function getTecnicoByUser(userId, tecs) {
  const u = db.get('users').find({ id: userId }).value();
  if (!u) return null;
  return tecs.find(t => t.email && t.email.toLowerCase() === u.email.toLowerCase()) || null;
}

app.get('/api/ferias', auth, (req, res) => {
  const tecs = db.get('tecnicos').value();
  let list   = db.get('ferias').value();

  if (req.user.role !== 'admin') {
    const tec = getTecnicoByUser(req.user.id, tecs);
    if (!tec) return res.json([]);
    list = list.filter(f => f.tecnico_id === tec.id);
  }

  res.json(list.map(f => {
    const t = tecs.find(x => x.id === f.tecnico_id);
    return { ...f, tecnico_nome: t?.nome||'?', tecnico_base: t?.base||'?', tecnico_escala: t?.escala||'' };
  }).sort((a,b) => (b.inicio_p1||'').localeCompare(a.inicio_p1||'')));
});

app.post('/api/ferias', auth, (req, res) => {
  const { tecnico_id, inicio_p1, fim_p1, inicio_p2, fim_p2, status, abono_pecuniario } = req.body;
  if (!tecnico_id||!inicio_p1||!fim_p1) return res.status(400).json({ error: 'Campos obrigatórios' });

  if (req.user.role !== 'admin') {
    const tec = getTecnicoByUser(req.user.id, db.get('tecnicos').value());
    if (!tec || tec.id !== +tecnico_id)
      return res.status(403).json({ error: 'Você só pode registrar suas próprias férias.' });
  }

  const obj = {
    id: nextId('ferias'), tecnico_id: +tecnico_id,
    inicio_p1, fim_p1,
    inicio_p2: inicio_p2||null, fim_p2: fim_p2||null,
    abono_pecuniario: !!abono_pecuniario,
    status: req.user.role === 'admin' ? (status||'pendente') : 'pendente',
    created_at: new Date().toISOString(),
  };
  db.get('ferias').push(obj).write();
  res.status(201).json(obj);
});

app.put('/api/ferias/:id', auth, (req, res) => {
  const id  = +req.params.id;
  const fer = db.get('ferias').find({ id }).value();
  if (!fer) return res.status(404).json({ error: 'Não encontrado' });

  if (req.user.role !== 'admin') {
    const tec = getTecnicoByUser(req.user.id, db.get('tecnicos').value());
    if (!tec || fer.tecnico_id !== tec.id)
      return res.status(403).json({ error: 'Acesso restrito' });
  }

  const { tecnico_id, inicio_p1, fim_p1, inicio_p2, fim_p2, status, abono_pecuniario } = req.body;
  db.get('ferias').find({ id }).assign({
    tecnico_id: +tecnico_id, inicio_p1, fim_p1,
    inicio_p2: inicio_p2||null, fim_p2: fim_p2||null,
    abono_pecuniario: !!abono_pecuniario,
    status: req.user.role === 'admin' ? status : fer.status,
  }).write();
  res.json({ ok: true });
});

app.delete('/api/ferias/:id', auth, (req, res) => {
  const fer = db.get('ferias').find({ id: +req.params.id }).value();
  if (!fer) return res.status(404).json({ error: 'Não encontrado' });
  if (req.user.role !== 'admin') {
    const tec = getTecnicoByUser(req.user.id, db.get('tecnicos').value());
    if (!tec || fer.tecnico_id !== tec.id)
      return res.status(403).json({ error: 'Acesso restrito' });
  }
  db.get('ferias').remove({ id: +req.params.id }).write();
  res.json({ ok: true });
});

// ── Avaliações ────────────────────────────────────────────
function enrichAv(a, tecs) {
  const t = tecs.find(x => x.id === a.tecnico_id);
  return { ...a, tecnico_nome: t?.nome||'?', tecnico_base: t?.base||'?' };
}

app.get('/api/avaliacoes', auth, (req, res) => {
  const tecs = db.get('tecnicos').value();
  let list   = db.get('avaliacoes').value();

  if (req.user.role !== 'admin') {
    // técnico vê apenas autoavaliações próprias + avaliações supervisor já liberadas
    const u   = db.get('users').find({ id: req.user.id }).value();
    const tec = tecs.find(t => t.email && t.email.toLowerCase() === u?.email?.toLowerCase());
    if (!tec) return res.json([]);
    list = list.filter(a =>
      a.tecnico_id === tec.id &&
      (a.tipo === 'autoavaliacao' || a.liberado === true)
    );
  }

  res.json(list.map(a => enrichAv(a, tecs)).sort((a,b) => (b.periodo||'').localeCompare(a.periodo||'')));
});

app.post('/api/avaliacoes', auth, (req, res) => {
  let { tecnico_id, periodo, criterios, nota_base, multiplicador, nota_final, tipo } = req.body;
  if (!tecnico_id||!periodo||!criterios) return res.status(400).json({ error: 'Campos obrigatórios' });

  if (req.user.role !== 'admin') {
    // técnico só pode se autoavaliar
    const u   = db.get('users').find({ id: req.user.id }).value();
    const tec = db.get('tecnicos').find(t => t.email && t.email.toLowerCase() === u?.email?.toLowerCase()).value();
    if (!tec || tec.id !== +tecnico_id)
      return res.status(403).json({ error: 'Você só pode realizar sua própria autoavaliação.' });
    tipo = 'autoavaliacao';
  } else {
    tipo = tipo || 'supervisor';
  }

  const obj = {
    id: nextId('avaliacoes'), tecnico_id: +tecnico_id, periodo, criterios,
    nota_base, multiplicador, nota_final,
    tipo,
    liberado:    tipo === 'autoavaliacao', // autoavaliação é sempre visível ao técnico
    avaliador_id: req.user.id,
    created_at:   new Date().toISOString(),
  };
  db.get('avaliacoes').push(obj).write();
  res.status(201).json(obj);
});

app.put('/api/avaliacoes/:id', auth, (req, res) => {
  const id = +req.params.id;
  const av = db.get('avaliacoes').find({ id }).value();
  if (!av) return res.status(404).json({ error: 'Não encontrado' });

  if (req.user.role !== 'admin') {
    // Técnico só pode editar a própria autoavaliação
    if (av.tipo !== 'autoavaliacao' || av.avaliador_id !== req.user.id)
      return res.status(403).json({ error: 'Acesso restrito' });
    // Bloqueado após feedback do supervisor
    const supFeedback = db.get('avaliacoes').find(x =>
      x.tipo === 'supervisor' && x.tecnico_id === av.tecnico_id &&
      x.periodo === av.periodo && x.feedback_texto
    ).value();
    if (supFeedback)
      return res.status(403).json({ error: 'Autoavaliação bloqueada: o supervisor já registrou o feedback para este período.' });
  }

  db.get('avaliacoes').find({ id }).assign(req.body).write();
  res.json({ ok: true });
});

app.delete('/api/avaliacoes/:id', auth, (req, res) => {
  const av = db.get('avaliacoes').find({ id: +req.params.id }).value();
  if (!av) return res.status(404).json({ error: 'Não encontrado' });
  if (req.user.role !== 'admin' && av.avaliador_id !== req.user.id)
    return res.status(403).json({ error: 'Acesso restrito' });
  db.get('avaliacoes').remove({ id: +req.params.id }).write();
  res.json({ ok: true });
});

// Liberar avaliação do supervisor para o técnico visualizar
app.put('/api/avaliacoes/:id/liberar', auth, adminOnly, (req, res) => {
  const id = +req.params.id;
  if (!db.get('avaliacoes').find({ id }).value()) return res.status(404).json({ error: 'Não encontrado' });
  db.get('avaliacoes').find({ id }).assign({ liberado: true, liberado_em: new Date().toISOString() }).write();
  res.json({ ok: true });
});

// Salvar feedback do supervisor (+ opção de liberar junto)
app.put('/api/avaliacoes/:id/feedback', auth, adminOnly, (req, res) => {
  const id = +req.params.id;
  if (!db.get('avaliacoes').find({ id }).value()) return res.status(404).json({ error: 'Não encontrado' });
  const { feedback_texto, feedback_nota, feedback_data, liberar } = req.body;
  const upd = {
    feedback_texto: feedback_texto || '',
    feedback_nota:  feedback_nota  || null,
    feedback_data:  feedback_data  || new Date().toISOString().split('T')[0],
  };
  if (liberar) { upd.liberado = true; upd.liberado_em = new Date().toISOString(); }
  db.get('avaliacoes').find({ id }).assign(upd).write();
  res.json({ ok: true, av: db.get('avaliacoes').find({ id }).value() });
});

// ── Dashboard ─────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const em30 = new Date(Date.now()+30*24*3600*1000).toISOString().split('T')[0];
  const em7  = new Date(Date.now()+7*24*3600*1000).toISOString().split('T')[0];
  const tecs   = db.get('tecnicos').value();
  const ferias = db.get('ferias').value();
  const avals  = db.get('avaliacoes').value();
  const bases  = db.get('config.bases').value();
  const pendentes = db.get('registros').filter({ status: 'pendente' }).value().length;

  function emFer(tecId, data) {
    return ferias.some(f => {
      if (f.tecnico_id !== tecId || f.status !== 'aprovado') return false;
      if (f.inicio_p1 && f.fim_p1 && data >= f.inicio_p1 && data <= f.fim_p1) return true;
      if (f.inicio_p2 && f.fim_p2 && data >= f.inicio_p2 && data <= f.fim_p2) return true;
      return false;
    });
  }

  const emFeriasHoje = tecs.filter(t => emFer(t.id, hoje)).length;
  const vencendo = tecs.filter(t => t.fim_aquisitivo && t.fim_aquisitivo >= hoje && t.fim_aquisitivo <= em30).length;

  const baseStats = Object.keys(bases).map(base => {
    const bt  = tecs.filter(t => t.base === base);
    const emF = bt.filter(t => emFer(t.id, hoje)).length;
    const avs = avals.filter(a => bt.map(t=>t.id).includes(a.tecnico_id));
    const media = avs.length ? Math.round(avs.reduce((s,a)=>s+a.nota_final,0)/avs.length*100)/100 : null;
    return {
      base, nome: bases[base], total: bt.length, emFerias: emF,
      disponiveis: bt.length-emF, pct: bt.length?Math.round((bt.length-emF)/bt.length*100):0, media,
      tecnicos: bt.map(t => ({ id: t.id, nome: t.nome, emFerias: emFer(t.id, hoje) }))
    };
  });

  const alertas = tecs.filter(t => t.fim_aquisitivo && t.fim_aquisitivo >= hoje && t.fim_aquisitivo <= em30).map(t => ({ nome:t.nome, base:t.base, baseNome: bases[t.base]||t.base, fim_aquisitivo:t.fim_aquisitivo }));
  const feriasBreve = ferias.filter(f => f.status==='aprovado' && f.inicio_p1 >= hoje && f.inicio_p1 <= em7).map(f => {
    const t = tecs.find(x=>x.id===f.tecnico_id);
    return { inicio_p1:f.inicio_p1, nome:t?.nome||'?', base:t?.base||'?', baseNome: bases[t?.base]||t?.base||'?' };
  });

  // 14-day strip preview
  const strip14 = [];
  for (let i = 0; i < 14; i++) {
    const d  = new Date(Date.now() + i * 24 * 3600000);
    const ds = d.toISOString().split('T')[0];
    const dow = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
    const vacsDia = ferias.filter(f => {
      if (f.status !== 'aprovado') return false;
      if (f.inicio_p1 <= ds && ds <= f.fim_p1) return true;
      if (f.inicio_p2 && f.inicio_p2 <= ds && ds <= f.fim_p2) return true;
      return false;
    }).map(f => { const t = tecs.find(x=>x.id===f.tecnico_id); return { nome: t?.nome||'?', base: t?.base||'?' }; });
    strip14.push({ date: ds, dow, vacations: vacsDia });
  }

  res.json({ totalTecnicos:tecs.length, totalFerias:ferias.length, totalAvaliacoes:avals.length, emFeriasHoje, vencendo, baseStats, alertas, feriasBreve, pendentes, strip14 });
});

// ── Dashboard pessoal (técnico) ───────────────────────────
app.get('/api/dashboard/me', auth, (req, res) => {
  const tecs = db.get('tecnicos').value();
  const tec  = getTecnicoByUser(req.user.id, tecs);
  if (!tec) return res.json({ tecnico: null, ferias: [], avaliacoes: [], media: null });

  const hoje     = new Date().toISOString().split('T')[0];
  const ferias   = db.get('ferias').filter({ tecnico_id: tec.id }).sortBy('inicio_p1').value();

  // Só retorna avaliações visíveis ao técnico
  const avAll    = db.get('avaliacoes').filter({ tecnico_id: tec.id }).value();
  const avVisvs  = avAll.filter(a => a.tipo === 'autoavaliacao' || a.liberado);
  const avRecentes = avVisvs.slice().sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, 2);
  const media    = avRecentes.length
    ? Math.round(avRecentes.reduce((s,a) => s + a.nota_final, 0) / avRecentes.length * 100) / 100
    : null;

  // Próximas férias (futuras ou em curso com status aprovado/pendente)
  const ferFuturas = ferias.filter(f => (f.fim_p1 >= hoje || (f.fim_p2 && f.fim_p2 >= hoje)));

  res.json({ tecnico: tec, ferias: ferFuturas, feriasTodas: ferias, avaliacoes: avRecentes, media });
});

// ── Calendário de férias ──────────────────────────────────
app.get('/api/calendario', auth, (req, res) => {
  const tecId   = req.query.tecnico_id ? +req.query.tecnico_id : null;
  const tecs    = db.get('tecnicos').value();
  const parBase = db.get('config.parBase').value();

  let tecnico = tecId ? tecs.find(t => t.id === tecId) : null;

  // Se não passou tecnico, tenta pelo email do user logado
  if (!tecnico) {
    const u = db.get('users').find({ id: req.user.id }).value();
    if (u) tecnico = tecs.find(t => t.email && t.email.toLowerCase() === u.email.toLowerCase());
  }

  if (!tecnico) return res.status(404).json({ error: 'Técnico não encontrado para este usuário. Vincule um e-mail ao técnico correspondente.' });

  const basePar    = parBase[tecnico.base];
  const pares      = basePar ? tecs.filter(t => t.base === basePar) : [];
  const mesmaBase  = tecs.filter(t => t.base === tecnico.base && t.id !== tecnico.id);

  const em24m = new Date(); em24m.setMonth(em24m.getMonth() + 24);
  const fim24m = em24m.toISOString().split('T')[0];

  const parIds     = new Set(pares.map(t => t.id));
  const mesmaIds   = new Set(mesmaBase.map(t => t.id));

  const feriasList = db.get('ferias').value()
    .filter(f => {
      if (f.status !== 'aprovado') return false;
      if (!f.inicio_p1 || f.inicio_p1 > fim24m) return false;
      return f.tecnico_id === tecnico.id || parIds.has(f.tecnico_id) || mesmaIds.has(f.tecnico_id);
    })
    .map(f => {
      const t    = tecs.find(x => x.id === f.tecnico_id);
      let   tipo = 'mesma';
      if (f.tecnico_id === tecnico.id) tipo = 'proprio';
      else if (parIds.has(f.tecnico_id)) tipo = 'par';
      return {
        ...f,
        tipo,
        nome:            t?.nome    || '?',
        tecnico_nome:    t?.nome    || '?',
        tecnico_base:    t?.base    || '?',
        tecnico_escala:  t?.escala  || '',
      };
    });

  res.json({
    tecnico,
    pares,
    mesmaBase,
    feriasList,
    bases: db.get('config.bases').value(),
  });
});

// ── SPA Fallback ──────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Não encontrado' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 http://localhost:${PORT}`);
  console.log(`🔒 Domínio: @${DOMAIN}\n`);
});
