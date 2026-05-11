'use strict';
require('dotenv').config();

const express      = require('express');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const path         = require('path');
const { MongoClient } = require('mongodb');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'trivia_secret';
const DOMAIN = process.env.ALLOWED_DOMAIN || 'trivia.com.br';

// ── Database ──────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gestaoequipe';
let db;

async function nextId(col) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: col },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

async function seedDB() {
  // Config padrão
  const cfg = await db.collection('config').findOne({ _id: 'main' });
  if (!cfg) {
    await db.collection('config').insertOne({
      _id: 'main',
      bases:   { 'Base 1': 'BAS', 'Base 2': 'JBO', 'Base 3': 'CVN', 'Base 4': 'SMP' },
      parBase: { 'Base 1': 'Base 2', 'Base 2': 'Base 1', 'Base 3': 'Base 4', 'Base 4': 'Base 3' },
    });
  } else {
    if (!cfg.bases)   await db.collection('config').updateOne({ _id: 'main' }, { $set: { bases:   { 'Base 1': 'Base 1', 'Base 2': 'Base 2', 'Base 3': 'Base 3', 'Base 4': 'Base 4' } } });
    if (!cfg.parBase) await db.collection('config').updateOne({ _id: 'main' }, { $set: { parBase: { 'Base 1': 'Base 2', 'Base 2': 'Base 1', 'Base 3': 'Base 4', 'Base 4': 'Base 3' } } });
  }

  // Inicializa counters se necessário
  for (const col of ['users', 'tecnicos', 'ferias', 'avaliacoes', 'registros']) {
    const existing = await db.collection('counters').findOne({ _id: col });
    if (!existing) {
      await db.collection('counters').insertOne({ _id: col, seq: 0 });
    }
  }

  // Admin padrão
  const admin = await db.collection('users').findOne({ role: 'admin' });
  if (!admin) {
    const id = await nextId('users');
    await db.collection('users').insertOne({
      id, nome: 'Administrador',
      email: `admin@${DOMAIN}`,
      password: bcrypt.hashSync('Trivia@2025', 10),
      role: 'admin',
      created_at: new Date().toISOString(),
    });
    console.log(`\n✅ Admin criado: admin@${DOMAIN} / Trivia@2025\n`);
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
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });
    if (email.split('@')[1] !== DOMAIN) return res.status(403).json({ error: `Acesso permitido apenas para @${DOMAIN}` });
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role }, SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const u = await db.collection('users').findOne({ id: req.user.id });
    if (!u) return res.status(404).json({ error: 'Não encontrado' });
    const tec = await db.collection('tecnicos').findOne({
      email: { $regex: new RegExp(`^${u.email}$`, 'i') }
    });
    res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, tecnico: tec || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Config (nomes das bases) ──────────────────────────────
app.get('/api/config', auth, async (req, res) => {
  try {
    const cfg = await db.collection('config').findOne({ _id: 'main' });
    res.json(cfg || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/config/bases', auth, adminOnly, async (req, res) => {
  try {
    const { bases } = req.body;
    if (!bases || typeof bases !== 'object') return res.status(400).json({ error: 'Dados inválidos' });
    await db.collection('config').updateOne({ _id: 'main' }, { $set: { bases } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Registros (auto-cadastro) ─────────────────────────────
app.get('/api/registros', auth, adminOnly, async (req, res) => {
  try {
    const list = await db.collection('registros').find({}).sort({ created_at: -1 }).toArray();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rota pública: qualquer um com email do domínio pode solicitar
app.post('/api/registros', async (req, res) => {
  try {
    const { nome, email, password, base, escala, turno, admissao } = req.body;
    if (!nome || !email || !password || !base || !escala || !turno || !admissao)
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    if (email.split('@')[1] !== DOMAIN)
      return res.status(403).json({ error: `E-mail deve ser @${DOMAIN}` });
    if (await db.collection('users').findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: 'E-mail já possui cadastro no sistema' });
    const pendente = await db.collection('registros').findOne({ email: email.toLowerCase(), status: 'pendente' });
    if (pendente) return res.status(400).json({ error: 'Já existe uma solicitação pendente para este e-mail' });

    const admissaoDate = new Date(admissao);
    const fimAq = new Date(admissaoDate);
    fimAq.setFullYear(fimAq.getFullYear() + 1); fimAq.setDate(fimAq.getDate() - 1);

    const id = await nextId('registros');
    const obj = {
      id, nome, email: email.toLowerCase(),
      password: bcrypt.hashSync(password, 10),
      base, escala, turno, admissao,
      inicio_aquisitivo: admissao,
      fim_aquisitivo: fimAq.toISOString().split('T')[0],
      status: 'pendente', created_at: new Date().toISOString(),
    };
    await db.collection('registros').insertOne(obj);
    res.status(201).json({ ok: true, msg: 'Solicitação enviada! Aguarde aprovação do administrador.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/registros/:id/aprovar', auth, adminOnly, async (req, res) => {
  try {
    const id = +req.params.id;
    const reg = await db.collection('registros').findOne({ id });
    if (!reg) return res.status(404).json({ error: 'Solicitação não encontrada' });

    // Criar usuário
    const userId = await nextId('users');
    await db.collection('users').insertOne({
      id: userId, nome: reg.nome, email: reg.email,
      password: reg.password, role: 'user', created_at: new Date().toISOString(),
    });

    // Criar técnico
    const tecId = await nextId('tecnicos');
    await db.collection('tecnicos').insertOne({
      id: tecId, nome: reg.nome, base: reg.base,
      escala: reg.escala, turno: reg.turno, admissao: reg.admissao,
      email: reg.email, inicio_aquisitivo: reg.inicio_aquisitivo,
      fim_aquisitivo: reg.fim_aquisitivo, created_at: new Date().toISOString(),
    });

    await db.collection('registros').updateOne({ id }, { $set: { status: 'aprovado', aprovado_em: new Date().toISOString() } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/registros/:id/rejeitar', auth, adminOnly, async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.collection('registros').findOne({ id })) return res.status(404).json({ error: 'Não encontrado' });
    await db.collection('registros').updateOne({ id }, { $set: { status: 'rejeitado', rejeitado_em: new Date().toISOString() } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/registros/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.collection('registros').deleteOne({ id: +req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Users ─────────────────────────────────────────────────
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await db.collection('users').find({}).toArray();
    res.json(users.map(u => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, created_at: u.created_at })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { nome, email, password, role } = req.body;
    if (!nome || !email || !password) return res.status(400).json({ error: 'Campos obrigatórios' });
    if (email.split('@')[1] !== DOMAIN) return res.status(400).json({ error: `E-mail deve ser @${DOMAIN}` });
    if (await db.collection('users').findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'E-mail já cadastrado' });
    const id = await nextId('users');
    const obj = { id, nome, email: email.toLowerCase(), password: bcrypt.hashSync(password, 10), role: role || 'user', created_at: new Date().toISOString() };
    await db.collection('users').insertOne(obj);
    res.status(201).json({ id: obj.id, nome, email, role: obj.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const id = +req.params.id;
    const u = await db.collection('users').findOne({ id });
    if (!u) return res.status(404).json({ error: 'Não encontrado' });
    const { nome, email, password, role } = req.body;
    if (email && email.split('@')[1] !== DOMAIN) return res.status(400).json({ error: `E-mail deve ser @${DOMAIN}` });
    await db.collection('users').updateOne({ id }, { $set: {
      nome: nome || u.nome,
      email: email ? email.toLowerCase() : u.email,
      password: password ? bcrypt.hashSync(password, 10) : u.password,
      role: role || u.role,
    }});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, async (req, res) => {
  try {
    if (+req.params.id === req.user.id) return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
    if (!await db.collection('users').findOne({ id: +req.params.id })) return res.status(404).json({ error: 'Não encontrado' });
    await db.collection('users').deleteOne({ id: +req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Técnicos ──────────────────────────────────────────────
app.get('/api/tecnicos', auth, async (req, res) => {
  try {
    const users = await db.collection('users').find({}).toArray();
    const tecs  = await db.collection('tecnicos').find({}).sort({ nome: 1 }).toArray();
    res.json(tecs.map(t => {
      const u = t.email
        ? users.find(u2 => u2.email.toLowerCase() === t.email.toLowerCase())
        : null;
      return { ...t, user_vinculado: u ? { id: u.id, nome: u.nome } : null };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lista usuários que ainda não têm técnico vinculado (para dropdown de vínculo)
app.get('/api/users-disponiveis', auth, adminOnly, async (req, res) => {
  try {
    const tecs  = await db.collection('tecnicos').find({}).toArray();
    const users = await db.collection('users').find({}).toArray();
    const emailsUsados = new Set(tecs.filter(t => t.email).map(t => t.email.toLowerCase()));
    res.json(
      users
        .filter(u => u.role !== 'admin' || !emailsUsados.has(u.email.toLowerCase()))
        .map(u => ({ id: u.id, nome: u.nome, email: u.email, jaVinculado: emailsUsados.has(u.email.toLowerCase()) }))
    );
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tecnicos', auth, async (req, res) => {
  try {
    const { nome, base, escala, turno, admissao, email, inicio_aquisitivo, fim_aquisitivo } = req.body;
    if (!nome || !base || !escala || !turno || !admissao) return res.status(400).json({ error: 'Campos obrigatórios' });
    const id = await nextId('tecnicos');
    const obj = { id, nome, base, escala, turno, admissao, email: email || '', inicio_aquisitivo: inicio_aquisitivo || '', fim_aquisitivo: fim_aquisitivo || '', created_at: new Date().toISOString() };
    await db.collection('tecnicos').insertOne(obj);
    res.status(201).json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tecnicos/:id', auth, async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.collection('tecnicos').findOne({ id })) return res.status(404).json({ error: 'Não encontrado' });
    await db.collection('tecnicos').updateOne({ id }, { $set: req.body });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tecnicos/:id', auth, async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.collection('tecnicos').findOne({ id })) return res.status(404).json({ error: 'Não encontrado' });
    await db.collection('tecnicos').deleteOne({ id });
    await db.collection('ferias').deleteMany({ tecnico_id: id });
    await db.collection('avaliacoes').deleteMany({ tecnico_id: id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Férias ────────────────────────────────────────────────
async function getTecnicoByUser(userId) {
  const u = await db.collection('users').findOne({ id: userId });
  if (!u) return null;
  return await db.collection('tecnicos').findOne({
    email: { $regex: new RegExp(`^${u.email}$`, 'i') }
  });
}

app.get('/api/ferias', auth, async (req, res) => {
  try {
    const tecs = await db.collection('tecnicos').find({}).toArray();
    let list   = await db.collection('ferias').find({}).toArray();

    if (req.user.role !== 'admin') {
      const tec = await getTecnicoByUser(req.user.id);
      if (!tec) return res.json([]);
      list = list.filter(f => f.tecnico_id === tec.id);
    }

    res.json(list.map(f => {
      const t = tecs.find(x => x.id === f.tecnico_id);
      return { ...f, tecnico_nome: t?.nome || '?', tecnico_base: t?.base || '?', tecnico_escala: t?.escala || '' };
    }).sort((a, b) => (b.inicio_p1 || '').localeCompare(a.inicio_p1 || '')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ferias', auth, async (req, res) => {
  try {
    const { tecnico_id, inicio_p1, fim_p1, inicio_p2, fim_p2, status, abono_pecuniario } = req.body;
    if (!tecnico_id || !inicio_p1 || !fim_p1) return res.status(400).json({ error: 'Campos obrigatórios' });

    if (req.user.role !== 'admin') {
      const tec = await getTecnicoByUser(req.user.id);
      if (!tec || tec.id !== +tecnico_id)
        return res.status(403).json({ error: 'Você só pode registrar suas próprias férias.' });
    }

    const id = await nextId('ferias');
    const obj = {
      id, tecnico_id: +tecnico_id,
      inicio_p1, fim_p1,
      inicio_p2: inicio_p2 || null, fim_p2: fim_p2 || null,
      abono_pecuniario: !!abono_pecuniario,
      status: req.user.role === 'admin' ? (status || 'pendente') : 'pendente',
      created_at: new Date().toISOString(),
    };
    await db.collection('ferias').insertOne(obj);
    res.status(201).json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ferias/:id', auth, async (req, res) => {
  try {
    const id  = +req.params.id;
    const fer = await db.collection('ferias').findOne({ id });
    if (!fer) return res.status(404).json({ error: 'Não encontrado' });

    if (req.user.role !== 'admin') {
      const tec = await getTecnicoByUser(req.user.id);
      if (!tec || fer.tecnico_id !== tec.id)
        return res.status(403).json({ error: 'Acesso restrito' });
    }

    const { tecnico_id, inicio_p1, fim_p1, inicio_p2, fim_p2, status, abono_pecuniario } = req.body;
    await db.collection('ferias').updateOne({ id }, { $set: {
      tecnico_id: +tecnico_id, inicio_p1, fim_p1,
      inicio_p2: inicio_p2 || null, fim_p2: fim_p2 || null,
      abono_pecuniario: !!abono_pecuniario,
      status: req.user.role === 'admin' ? status : fer.status,
    }});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ferias/:id', auth, async (req, res) => {
  try {
    const fer = await db.collection('ferias').findOne({ id: +req.params.id });
    if (!fer) return res.status(404).json({ error: 'Não encontrado' });
    if (req.user.role !== 'admin') {
      const tec = await getTecnicoByUser(req.user.id);
      if (!tec || fer.tecnico_id !== tec.id)
        return res.status(403).json({ error: 'Acesso restrito' });
    }
    await db.collection('ferias').deleteOne({ id: +req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Avaliações ────────────────────────────────────────────
function enrichAv(a, tecs) {
  const t = tecs.find(x => x.id === a.tecnico_id);
  return { ...a, tecnico_nome: t?.nome || '?', tecnico_base: t?.base || '?' };
}

app.get('/api/avaliacoes', auth, async (req, res) => {
  try {
    const tecs = await db.collection('tecnicos').find({}).toArray();
    let list   = await db.collection('avaliacoes').find({}).toArray();

    if (req.user.role !== 'admin') {
      const u   = await db.collection('users').findOne({ id: req.user.id });
      const tec = tecs.find(t => t.email && t.email.toLowerCase() === u?.email?.toLowerCase());
      if (!tec) return res.json([]);
      list = list.filter(a =>
        a.tecnico_id === tec.id &&
        (a.tipo === 'autoavaliacao' || a.liberado === true)
      );
    }

    res.json(list.map(a => enrichAv(a, tecs)).sort((a, b) => (b.periodo || '').localeCompare(a.periodo || '')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/avaliacoes', auth, async (req, res) => {
  try {
    let { tecnico_id, periodo, criterios, nota_base, multiplicador, nota_final, tipo } = req.body;
    if (!tecnico_id || !periodo || !criterios) return res.status(400).json({ error: 'Campos obrigatórios' });

    if (req.user.role !== 'admin') {
      const u   = await db.collection('users').findOne({ id: req.user.id });
      const tec = await db.collection('tecnicos').findOne({
        email: { $regex: new RegExp(`^${u?.email}$`, 'i') }
      });
      if (!tec || tec.id !== +tecnico_id)
        return res.status(403).json({ error: 'Você só pode realizar sua própria autoavaliação.' });
      tipo = 'autoavaliacao';
    } else {
      tipo = tipo || 'supervisor';
    }

    const id = await nextId('avaliacoes');
    const obj = {
      id, tecnico_id: +tecnico_id, periodo, criterios,
      nota_base, multiplicador, nota_final,
      tipo,
      liberado:     tipo === 'autoavaliacao',
      avaliador_id: req.user.id,
      created_at:   new Date().toISOString(),
    };
    await db.collection('avaliacoes').insertOne(obj);
    res.status(201).json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/avaliacoes/:id', auth, async (req, res) => {
  try {
    const id = +req.params.id;
    const av = await db.collection('avaliacoes').findOne({ id });
    if (!av) return res.status(404).json({ error: 'Não encontrado' });

    if (req.user.role !== 'admin') {
      if (av.tipo !== 'autoavaliacao' || av.avaliador_id !== req.user.id)
        return res.status(403).json({ error: 'Acesso restrito' });
      // Bloqueado após feedback do supervisor
      const supFeedback = await db.collection('avaliacoes').findOne({
        tipo: 'supervisor',
        tecnico_id: av.tecnico_id,
        periodo: av.periodo,
        feedback_texto: { $exists: true, $ne: '' },
      });
      if (supFeedback)
        return res.status(403).json({ error: 'Autoavaliação bloqueada: o supervisor já registrou o feedback para este período.' });
    }

    await db.collection('avaliacoes').updateOne({ id }, { $set: req.body });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/avaliacoes/:id', auth, async (req, res) => {
  try {
    const av = await db.collection('avaliacoes').findOne({ id: +req.params.id });
    if (!av) return res.status(404).json({ error: 'Não encontrado' });
    if (req.user.role !== 'admin' && av.avaliador_id !== req.user.id)
      return res.status(403).json({ error: 'Acesso restrito' });
    await db.collection('avaliacoes').deleteOne({ id: +req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Liberar avaliação do supervisor para o técnico visualizar
app.put('/api/avaliacoes/:id/liberar', auth, adminOnly, async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.collection('avaliacoes').findOne({ id })) return res.status(404).json({ error: 'Não encontrado' });
    await db.collection('avaliacoes').updateOne({ id }, { $set: { liberado: true, liberado_em: new Date().toISOString() } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Salvar feedback do supervisor (+ opção de liberar junto)
app.put('/api/avaliacoes/:id/feedback', auth, adminOnly, async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.collection('avaliacoes').findOne({ id })) return res.status(404).json({ error: 'Não encontrado' });
    const { feedback_texto, feedback_nota, feedback_data, liberar } = req.body;
    const upd = {
      feedback_texto: feedback_texto || '',
      feedback_nota:  feedback_nota  || null,
      feedback_data:  feedback_data  || new Date().toISOString().split('T')[0],
    };
    if (liberar) { upd.liberado = true; upd.liberado_em = new Date().toISOString(); }
    await db.collection('avaliacoes').updateOne({ id }, { $set: upd });
    const av = await db.collection('avaliacoes').findOne({ id });
    res.json({ ok: true, av });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard ─────────────────────────────────────────────
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const em30 = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const em7  = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const tecs    = await db.collection('tecnicos').find({}).toArray();
    const ferias  = await db.collection('ferias').find({}).toArray();
    const avals   = await db.collection('avaliacoes').find({}).toArray();
    const cfg     = await db.collection('config').findOne({ _id: 'main' });
    const bases   = cfg?.bases || {};
    const pendentes = await db.collection('registros').countDocuments({ status: 'pendente' });

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
      const avs = avals.filter(a => bt.map(t => t.id).includes(a.tecnico_id));
      const media = avs.length ? Math.round(avs.reduce((s, a) => s + a.nota_final, 0) / avs.length * 100) / 100 : null;
      return {
        base, nome: bases[base], total: bt.length, emFerias: emF,
        disponiveis: bt.length - emF, pct: bt.length ? Math.round((bt.length - emF) / bt.length * 100) : 0, media,
        tecnicos: bt.map(t => ({ id: t.id, nome: t.nome, emFerias: emFer(t.id, hoje) }))
      };
    });

    const alertas = tecs.filter(t => t.fim_aquisitivo && t.fim_aquisitivo >= hoje && t.fim_aquisitivo <= em30).map(t => ({ nome: t.nome, base: t.base, baseNome: bases[t.base] || t.base, fim_aquisitivo: t.fim_aquisitivo }));
    const feriasBreve = ferias.filter(f => f.status === 'aprovado' && f.inicio_p1 >= hoje && f.inicio_p1 <= em7).map(f => {
      const t = tecs.find(x => x.id === f.tecnico_id);
      return { inicio_p1: f.inicio_p1, nome: t?.nome || '?', base: t?.base || '?', baseNome: bases[t?.base] || t?.base || '?' };
    });

    // 14-day strip preview
    const strip14 = [];
    for (let i = 0; i < 14; i++) {
      const d  = new Date(Date.now() + i * 24 * 3600000);
      const ds = d.toISOString().split('T')[0];
      const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()];
      const vacsDia = ferias.filter(f => {
        if (f.status !== 'aprovado') return false;
        if (f.inicio_p1 <= ds && ds <= f.fim_p1) return true;
        if (f.inicio_p2 && f.inicio_p2 <= ds && ds <= f.fim_p2) return true;
        return false;
      }).map(f => { const t = tecs.find(x => x.id === f.tecnico_id); return { nome: t?.nome || '?', base: t?.base || '?' }; });
      strip14.push({ date: ds, dow, vacations: vacsDia });
    }

    res.json({ totalTecnicos: tecs.length, totalFerias: ferias.length, totalAvaliacoes: avals.length, emFeriasHoje, vencendo, baseStats, alertas, feriasBreve, pendentes, strip14 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard pessoal (técnico) ───────────────────────────
app.get('/api/dashboard/me', auth, async (req, res) => {
  try {
    const tec = await getTecnicoByUser(req.user.id);
    if (!tec) return res.json({ tecnico: null, ferias: [], avaliacoes: [], media: null });

    const hoje   = new Date().toISOString().split('T')[0];
    const ferias = await db.collection('ferias').find({ tecnico_id: tec.id }).sort({ inicio_p1: 1 }).toArray();

    const avAll    = await db.collection('avaliacoes').find({ tecnico_id: tec.id }).toArray();
    const avVisvs  = avAll.filter(a => a.tipo === 'autoavaliacao' || a.liberado);
    const avRecentes = avVisvs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 2);
    const media    = avRecentes.length
      ? Math.round(avRecentes.reduce((s, a) => s + a.nota_final, 0) / avRecentes.length * 100) / 100
      : null;

    const ferFuturas = ferias.filter(f => (f.fim_p1 >= hoje || (f.fim_p2 && f.fim_p2 >= hoje)));

    res.json({ tecnico: tec, ferias: ferFuturas, feriasTodas: ferias, avaliacoes: avRecentes, media });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Calendário de férias ──────────────────────────────────
app.get('/api/calendario', auth, async (req, res) => {
  try {
    const tecId   = req.query.tecnico_id ? +req.query.tecnico_id : null;
    const tecs    = await db.collection('tecnicos').find({}).toArray();
    const cfg     = await db.collection('config').findOne({ _id: 'main' });
    const parBase = cfg?.parBase || {};

    let tecnico = tecId ? tecs.find(t => t.id === tecId) : null;

    if (!tecnico) {
      const u = await db.collection('users').findOne({ id: req.user.id });
      if (u) tecnico = tecs.find(t => t.email && t.email.toLowerCase() === u.email.toLowerCase());
    }

    if (!tecnico) return res.status(404).json({ error: 'Técnico não encontrado para este usuário. Vincule um e-mail ao técnico correspondente.' });

    const basePar   = parBase[tecnico.base];
    const pares     = basePar ? tecs.filter(t => t.base === basePar) : [];
    const mesmaBase = tecs.filter(t => t.base === tecnico.base && t.id !== tecnico.id);

    const em24m = new Date(); em24m.setMonth(em24m.getMonth() + 24);
    const fim24m = em24m.toISOString().split('T')[0];

    const parIds   = new Set(pares.map(t => t.id));
    const mesmaIds = new Set(mesmaBase.map(t => t.id));

    const allFerias = await db.collection('ferias').find({}).toArray();
    const feriasList = allFerias
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
          nome:           t?.nome   || '?',
          tecnico_nome:   t?.nome   || '?',
          tecnico_base:   t?.base   || '?',
          tecnico_escala: t?.escala || '',
        };
      });

    res.json({
      tecnico,
      pares,
      mesmaBase,
      feriasList,
      bases: cfg?.bases || {},
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPA Fallback ──────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Não encontrado' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 http://localhost:${PORT}`);
    console.log(`🔒 Domínio: @${DOMAIN}\n`);
  });
}).catch(err => {
  console.error('Falha ao conectar ao MongoDB:', err);
  process.exit(1);
});
