'use strict';
/* Gestão de Equipe — Trivia · interface (sem frameworks) */

// ════════════ Estado e API ════════════
let TOKEN = lerLS('ge_token');
let ME    = JSON.parse(lerLS('ge_user') || 'null');
let BASES = { 'Base 1': 'BAS', 'Base 2': 'JBO', 'Base 3': 'CVN', 'Base 4': 'SMP' };
const ESCALAS = ['A', 'B', 'C', 'D', 'SD', 'SN'];
const TURNOS  = ['Diurno', 'Noturno'];
const DOMINIO = 'triviatrens.com.br';

function lerLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLS(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
const isAdmin = () => ME?.role === 'admin';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opts.headers.Authorization = `Bearer ${TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  let res;
  try { res = await fetch(path, opts); }
  catch { throw new Error('Sem conexão. Verifique a internet e tente de novo.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && TOKEN) { sair(data.error || 'Sua sessão expirou. Entre novamente.'); throw new Error('Sessão expirada'); }
  if (!res.ok) throw new Error(data.error || 'Algo deu errado. Tente de novo.');
  return data;
}

// ════════════ Utilidades ════════════
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function hoje() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
function fmt(iso) { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function iniciais(n) { return String(n || '?').split(' ').filter(Boolean).filter((w, i, a) => i === 0 || i === a.length - 1).map(w => w[0].toUpperCase()).join('').slice(0, 2); }
function primeiroNome(n) { return String(n || '').split(' ')[0]; }
function plural(n, s, p) { return `${n} ${n === 1 ? s : p}`; }
const baseNome = b => BASES[b] || b || '—';
const baseCls  = b => 'cb' + ((/(\d)/.exec(b || '') || [])[1] || '1');
const tagBase  = b => `<span class="tag-base ${baseCls(b)}">${esc(baseNome(b))}</span>`;

// semestres
function semestreDe(iso) { const [y, m] = iso.split('-'); return `${y}-S${+m <= 6 ? 1 : 2}`; }
function periodosAbertos() {
  const h = hoje(), y = +h.slice(0, 4), m = +h.slice(5, 7), r = [semestreDe(h)];
  if (m <= 3) r.push(`${y - 1}-S2`);
  if (m >= 7 && m <= 9) r.push(`${y}-S1`);
  return r;
}
function rotuloPer(p) { if (!p) return '—'; const [y, s] = p.split('-'); return `${s === 'S1' ? '1º' : '2º'} semestre de ${y}`; }
function rotuloPerCurto(p) { if (!p) return '—'; const [y, s] = p.split('-'); return `${s === 'S1' ? '1º' : '2º'} sem/${y}`; }

// ════════════ Avaliação: regras ════════════
const CRIT = [
  { g: 'tec',  f: 'conhecimentoTecnico',  n: 'Conhecimento técnico',  p: 20, d: 'Domínio das ferramentas, sistemas e procedimentos.' },
  { g: 'tec',  f: 'segurancaOperacional', n: 'Segurança operacional', p: 20, d: 'Cumpre as normas de segurança e usa os EPIs.' },
  { g: 'tec',  f: 'iniciativaAtuacao',    n: 'Iniciativa na atuação', p: 15, d: 'Toma decisões em situações críticas ou novas.' },
  { g: 'comp', f: 'disponibilidade',      n: 'Disponibilidade',       p: 15, d: 'Prontidão e flexibilidade para atender chamados.' },
  { g: 'comp', f: 'trabalhoEquipe',       n: 'Trabalho em equipe',    p: 12, d: 'Colabora e contribui para o bom clima.' },
  { g: 'comp', f: 'comunicacao',          n: 'Comunicação',           p: 10, d: 'Passa informações com clareza.' },
  { g: 'comp', f: 'proatividade',         n: 'Proatividade',          p: 8,  d: 'Antecipa problemas sem precisar de supervisão.' },
  { g: 'org',  f: 'focoResultados',       n: 'Foco nos resultados',   p: 0,  d: 'Cumpre metas com qualidade no serviço.' },
  { g: 'org',  f: 'posturaEtica',         n: 'Postura ética',         p: 0,  d: 'Conduta íntegra; representa bem a empresa.' },
  { g: 'org',  f: 'alinhamentoValores',   n: 'Alinhamento aos valores', p: 0, d: 'Pratica os valores da empresa no dia a dia.' },
];
const GRUPOS = { tec: ['Técnico-operacional', 'g-tec', 'Nota base'], comp: ['Comportamental', 'g-comp', 'Nota base'], org: ['Fator organizacional', 'g-org', 'Multiplica a nota (0,80× a 1,20×)'] };
const SIGNIF = ['', 'Muito abaixo do esperado', 'Abaixo do esperado', 'Atende ao esperado', 'Acima do esperado', 'Excepcional'];
const NOTA_MAX = 6;
function calcNotas(c) {
  if (CRIT.some(x => !(c[x.f] >= 1))) return null;
  const base = Math.round(CRIT.filter(x => x.p).reduce((s, x) => s + c[x.f] * x.p / 100, 0) * 100) / 100;
  const org = CRIT.filter(x => x.g === 'org').reduce((s, x) => s + c[x.f], 0) / 3;
  const mult = Math.round((0.80 + (org - 1) * 0.10) * 100) / 100;
  return { nota_base: base, multiplicador: mult, nota_final: Math.round(base * mult * 100) / 100 };
}
function conceito(n) {
  if (n >= 5.5) return 'Excelente';
  if (n >= 4.5) return 'Bom';
  if (n >= 3.0) return 'Regular';
  return 'Insuficiente';
}
const etConceito = n => n == null ? '' : `<span class="etiqueta c-${conceito(n)}">${conceito(n)}</span>`;
const nf = n => n == null ? '—' : Number(n).toFixed(2).replace('.', ',');
function regua(n) {
  const pos = n == null ? null : Math.min(100, Math.max(0, n / NOTA_MAX * 100));
  return `<div class="regua-wrap"><div class="regua">
      <i style="width:50%;background:#f6d2cf"></i><i style="width:25%;background:#f7e5b5"></i><i style="width:16.67%;background:#cfe0fb"></i><i style="width:8.33%;background:#c7ecd6"></i>
    </div>${pos == null ? '' : `<span class="regua-marca" style="left:${pos}%"></span>`}
    <div class="regua-rot"><span>0</span><span>3,0</span><span>4,5</span><span>5,5</span><span>6,0</span></div></div>`;
}

// ════════════ Ícones ════════════
const IC = {
  inicio:  '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  aval:    '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  equipe:  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/>',
  mais:    '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  conta:   '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  pedido:  '<path d="M9 4h6v3H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="m9 14 2 2 4-4"/>',
  usuarios:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="m17 4 2 2-2 2"/>',
  bases:   '<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  chave:   '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  sair:    '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
  busca:   '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  editar:  '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  lixo:    '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pdf:     '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  olho:    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  enviar:  '<path d="M4 12 20 4l-6 16-3-7z"/>',
  check:   '<path d="m5 12 5 5 9-10"/>',
  x:       '<path d="M6 6l12 12M18 6 6 18"/>',
  mais1:   '<path d="M12 5v14M5 12h14"/>',
  cal:     '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/>',
};
const ic = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

// ════════════ Ações por clique (sem onclick inline) ════════════
const ACOES = new Map(); let seq = 0;
function on(fn) { const k = 'a' + (++seq); ACOES.set(k, fn); return `data-a="${k}"`; }
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && ACOES.has(el.dataset.a)) { e.preventDefault(); ACOES.get(el.dataset.a)(el, e); }
});

// ════════════ Avisos, confirmação, menu de ações ════════════
function aviso(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`; el.textContent = msg;
  $('#avisos').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 5000 : 3000);
}
const erro = e => aviso(e.message || String(e), 'erro');

function confirmar(titulo, texto, { sim = 'Confirmar', perigo = false } = {}) {
  return new Promise(res => {
    const d = $('#dialogo');
    $('#dialogo-titulo').textContent = titulo; $('#dialogo-texto').textContent = texto || '';
    const bSim = $('#dialogo-sim'), bNao = $('#dialogo-nao');
    bSim.textContent = sim; bSim.className = `btn ${perigo ? 'btn-perigo' : 'btn-pri'}`;
    d.hidden = false; bNao.focus();
    const fim = v => { d.hidden = true; bSim.onclick = bNao.onclick = d.onclick = null; res(v); };
    bSim.onclick = () => fim(true); bNao.onclick = () => fim(false);
    d.onclick = e => { if (e.target === d) fim(false); };
  });
}

function menuAcoes(titulo, itens) {
  const f = $('#acoes');
  $('#acoes-lista').innerHTML = (titulo ? `<div class="a-tit">${esc(titulo)}</div>` : '') +
    itens.filter(Boolean).map(i => `<button type="button" role="menuitem" class="${i.perigo ? 'perigo' : ''}" ${on(() => { f.hidden = true; i.fn(); })}>${ic(i.ic || 'editar')}${esc(i.t)}</button>`).join('') +
    `<button type="button" ${on(() => { f.hidden = true; })}>${ic('x')}Fechar</button>`;
  f.hidden = false;
  f.onclick = e => { if (e.target === f) f.hidden = true; };
}

// ════════════ Painel deslizante (formulários) ════════════
const Painel = {
  aoFechar: null, travado: false,
  abrir({ titulo, corpo, rodape = '', largo = false, travado = false, aoFechar = null }) {
    $('#painel-titulo').textContent = titulo;
    $('#painel-corpo').innerHTML = corpo;
    $('#painel-corpo').onclick = null;
    $('#painel-rodape').innerHTML = rodape;
    $('#painel').classList.toggle('largo', largo);
    $('.painel-fechar').hidden = travado;
    this.travado = travado; this.aoFechar = aoFechar;
    $('#painel-fundo').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#painel-corpo').scrollTop = 0;
  },
  fechar(forcar = false) {
    if (this.travado && !forcar) return;
    $('#painel-fundo').hidden = true;
    document.body.style.overflow = '';
    const f = this.aoFechar; this.aoFechar = null; f && f();
  },
  aberto() { return !$('#painel-fundo').hidden; },
};
$('#painel-fundo').addEventListener('click', e => { if (e.target.id === 'painel-fundo' || e.target.closest('[data-fechar]')) Painel.fechar(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#dialogo').hidden) return $('#dialogo-nao').click();
  if (!$('#acoes').hidden) return ($('#acoes').hidden = true);
  if (Painel.aberto()) Painel.fechar();
});

// chips de escolha única
function chipsEscolha(el, opcoes, valor, aoMudar) {
  el.innerHTML = opcoes.map(([v, t]) => `<button type="button" class="chip-op" data-v="${esc(v)}" aria-pressed="${v === valor}">${esc(t)}</button>`).join('');
  el.dataset.valor = valor || '';
  el.onclick = e => {
    const b = e.target.closest('.chip-op'); if (!b) return;
    $$('.chip-op', el).forEach(x => x.setAttribute('aria-pressed', x === b));
    el.dataset.valor = b.dataset.v;
    el.closest('.campo')?.classList.remove('erro');
    aoMudar && aoMudar(b.dataset.v);
  };
}
const optsBases = () => Object.keys(BASES).map(k => [k, BASES[k]]);

// ════════════ Login ════════════
function mostrarLogin(msg) {
  $('#tela-app').hidden = true; $('#tela-login').hidden = false;
  $('#card-login').hidden = false; $('#card-solicitar').hidden = true;
  $('#login-erro').textContent = msg || '';
  $('#login-senha').value = '';
}
$$('.ver-senha').forEach(b => b.onclick = () => {
  const i = document.getElementById(b.dataset.alvo); const vis = i.type === 'text';
  i.type = vis ? 'password' : 'text'; b.textContent = vis ? 'Mostrar' : 'Ocultar';
});
$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#login-email').value.trim(), senha = $('#login-senha').value, err = $('#login-erro');
  if (!email || !senha) { err.textContent = 'Informe e-mail e senha.'; return; }
  if (!email.includes('@')) { $('#login-email').value = email + '@' + DOMINIO; }
  const btn = $('#btn-entrar'); btn.disabled = true; btn.textContent = 'Entrando…'; err.textContent = '';
  try {
    const d = await api('POST', '/api/auth/login', { email: $('#login-email').value.trim(), password: senha });
    TOKEN = d.token; ME = d.user; gravarLS('ge_token', TOKEN); gravarLS('ge_user', JSON.stringify(ME));
    await iniciarApp();
  } catch (ex) { err.textContent = ex.message; }
  btn.disabled = false; btn.textContent = 'Entrar';
});
$('#link-solicitar').onclick = e => {
  e.preventDefault();
  $('#card-login').hidden = true; $('#card-solicitar').hidden = false;
  chipsEscolha($('#sol-base'), optsBases(), '');
  chipsEscolha($('#sol-escala'), ESCALAS.map(x => [x, x]), '');
  chipsEscolha($('#sol-turno'), TURNOS.map(x => [x, x]), '');
  $('#sol-nome').focus();
};
$('#voltar-login').onclick = () => mostrarLogin();
$('#form-solicitar').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#sol-erro'); err.className = 'msg-erro';
  const v = {
    nome: $('#sol-nome').value.trim(), email: $('#sol-email').value.trim().toLowerCase(),
    password: $('#sol-senha').value, base: $('#sol-base').dataset.valor, escala: $('#sol-escala').dataset.valor,
    turno: $('#sol-turno').dataset.valor, admissao: $('#sol-admissao').value,
  };
  const faltando = [];
  [['nome', '#sol-nome'], ['email', '#sol-email'], ['password', '#sol-senha'], ['base', '#sol-base'], ['escala', '#sol-escala'], ['turno', '#sol-turno'], ['admissao', '#sol-admissao']]
    .forEach(([k, s]) => { const c = $(s).closest('.campo'); c.classList.toggle('erro', !v[k]); if (!v[k]) faltando.push(c); });
  if (faltando.length) { err.textContent = 'Preencha os campos marcados em vermelho.'; faltando[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  if (!v.email.endsWith('@' + DOMINIO)) { err.textContent = `Use seu e-mail @${DOMINIO}.`; return; }
  if (v.password.length < 8) { err.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
  if (v.password !== $('#sol-senha2').value) { err.textContent = 'As duas senhas não são iguais.'; return; }
  const btn = $('#btn-solicitar'); btn.disabled = true; btn.textContent = 'Enviando…'; err.textContent = '';
  try {
    await api('POST', '/api/registros', v);
    $('#form-solicitar').reset();
    mostrarLogin();
    $('#login-email').value = v.email;
    const m = $('#login-erro'); m.textContent = '✓ Pedido enviado! Quando o supervisor aprovar, entre com este e-mail e senha.'; m.className = 'msg-erro msg-ok';
  } catch (ex) { err.textContent = ex.message; }
  btn.disabled = false; btn.textContent = 'Enviar pedido';
});

function sair(msg) {
  TOKEN = null; ME = null; gravarLS('ge_token', null); gravarLS('ge_user', null);
  Painel.fechar(true);
  location.hash = '';
  mostrarLogin(msg);
  $('#login-erro').className = 'msg-erro';
}

// ════════════ Navegação ════════════
const ROTAS_ADMIN = [
  { id: 'inicio', t: 'Início', ic: 'inicio' },
  { id: 'avaliacao', t: 'Avaliação', ic: 'aval' },
  { id: 'equipe', t: 'Equipe', ic: 'equipe' },
  { id: 'mais', t: 'Mais', ic: 'mais', soCelular: true },
  { sep: 'Administração' },
  { id: 'solicitacoes', t: 'Pedidos de cadastro', ic: 'pedido', soComputador: true },
  { id: 'usuarios', t: 'Usuários', ic: 'usuarios', soComputador: true },
  { id: 'bases', t: 'Nomes das bases', ic: 'bases', soComputador: true },
  { sep: '' },
  { id: 'conta', t: 'Minha conta', ic: 'conta', soComputador: true },
];
const ROTAS_TEC = [
  { id: 'inicio', t: 'Início', ic: 'inicio' },
  { id: 'avaliacao', t: 'Avaliação', ic: 'aval' },
  { id: 'conta', t: 'Conta', ic: 'conta' },
];
let ROTA = 'inicio';
let PENDENTES_CADASTRO = 0;

function montarMenus() {
  const rotas = isAdmin() ? ROTAS_ADMIN : ROTAS_TEC;
  const bol = id => (id === 'solicitacoes' || id === 'mais') && PENDENTES_CADASTRO ? `<span class="bolinha">${PENDENTES_CADASTRO}</span>` : '';
  $('#menu-inferior').innerHTML = rotas.filter(r => r.id && !r.soComputador)
    .map(r => `<button class="mi" type="button" data-ir="${r.id}" ${ROTA === r.id || (r.id === 'mais' && ['solicitacoes', 'usuarios', 'bases', 'conta'].includes(ROTA)) ? 'aria-current="page"' : ''}>${ic(r.ic)}<span>${r.t}</span>${bol(r.id)}</button>`).join('');
  $('#menu-lateral').innerHTML = rotas.filter(r => !r.soCelular)
    .map(r => r.sep !== undefined ? (r.sep ? `<div class="ml-sep"></div><div class="ml-tit">${r.sep}</div>` : '<div class="ml-sep"></div>')
      : `<button class="ml" type="button" data-ir="${r.id}" ${ROTA === r.id ? 'aria-current="page"' : ''}>${ic(r.ic)}<span>${r.t}</span>${bol(r.id)}</button>`).join('');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ir]'); if (!b) return;
  e.preventDefault(); ir(b.dataset.ir);
});
function ir(rota) {
  if (location.hash !== '#/' + rota) location.hash = '#/' + rota; else render();
}
window.addEventListener('hashchange', () => { if (TOKEN) render(); });

const PAGINAS = {};
async function render() {
  const rotas = (isAdmin() ? ROTAS_ADMIN : ROTAS_TEC).map(r => r.id).filter(Boolean);
  let r = (location.hash.replace('#/', '').split('?')[0]) || 'inicio';
  if (!rotas.includes(r)) r = 'inicio';
  ROTA = r; ACOES.clear(); seq = 0;
  if (Painel.aberto() && !Painel.travado) Painel.fechar(true);
  $('#acoes').hidden = true;
  montarMenus();
  const c = $('#conteudo');
  c.innerHTML = '<div class="carregando">Carregando…</div>';
  window.scrollTo(0, 0);
  try { await PAGINAS[r](c); }
  catch (ex) { if (ex.message !== 'Sessão expirada') c.innerHTML = `<div class="vazio"><b>Não foi possível carregar</b>${esc(ex.message)}<br><br><button class="btn btn-sec" ${on(render)}>Tentar de novo</button></div>`; }
}

async function iniciarApp() {
  $('#tela-login').hidden = true; $('#tela-app').hidden = false;
  try {
    const me = await api('GET', '/api/auth/me');
    ME = { ...ME, ...me }; gravarLS('ge_user', JSON.stringify({ id: ME.id, nome: ME.nome, email: ME.email, role: ME.role }));
    const cfg = await api('GET', '/api/config');
    if (cfg.bases && Object.keys(cfg.bases).length) BASES = { ...BASES, ...cfg.bases };
  } catch (ex) { if (ex.message === 'Sessão expirada') return; }
  $('#topo-nome').textContent = primeiroNome(ME.nome);
  $('#topo-avatar').textContent = iniciais(ME.nome);
  if (isAdmin()) atualizarPendentes();
  render();
  if (ME.trocar_senha) formSenha(true);
}
async function atualizarPendentes() {
  try { const r = await api('GET', '/api/registros'); PENDENTES_CADASTRO = r.filter(x => x.status === 'pendente').length; montarMenus(); } catch {}
}
$('#btn-usuario').onclick = () => menuAcoes(ME?.nome, [
  { t: 'Trocar senha', ic: 'chave', fn: () => formSenha() },
  { t: 'Sair', ic: 'sair', perigo: true, fn: () => sair() },
]);

// ════════════ Página: Início ════════════
PAGINAS.inicio = async c => isAdmin() ? inicioAdmin(c) : inicioTecnico(c);

function saudacao() { const h = +new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
function dataExtenso() { return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date()); }

async function inicioAdmin(c) {
  const [d, avs, tecs] = await Promise.all([api('GET', '/api/dashboard'), api('GET', '/api/avaliacoes'), api('GET', '/api/tecnicos')]);
  PENDENTES_CADASTRO = d.pendentes; montarMenus();
  const per = periodosAbertos()[0];
  const ciclo = cicloAvaliacao(tecs, avs, per);
  const semAval = ciclo.filter(x => x.status === 'avaliar').length;
  const semFb = ciclo.filter(x => x.status === 'feedback' || x.status === 'liberar').length;
  const semAcesso = tecs.filter(t => !t.user_vinculado).length;
  const tarefas = [
    d.pendentes && { n: d.pendentes, tom: 'tom-red', t: plural(d.pendentes, 'pedido de cadastro', 'pedidos de cadastro'), s: 'Aprove para o técnico poder entrar', ir: 'solicitacoes' },
    semAval && { n: semAval, tom: 'tom-azul', t: plural(semAval, 'técnico para avaliar', 'técnicos para avaliar'), s: rotuloPer(per), ir: 'avaliacao', f: 'avaliar' },
    semFb && { n: semFb, tom: 'tom-org', t: plural(semFb, 'feedback pendente', 'feedbacks pendentes'), s: 'Avaliados, mas o técnico ainda não recebeu o retorno', ir: 'avaliacao', f: 'feedback' },
    semAcesso && { n: semAcesso, tom: 'tom-azul', t: plural(semAcesso, 'técnico sem acesso ao app', 'técnicos sem acesso ao app'), s: 'Sem acesso, não conseguem fazer a autoavaliação', ir: 'equipe', eq: 'semacesso' },
  ].filter(Boolean);

  const conc = ciclo.filter(x => x.status === 'concluido').length, auto = ciclo.filter(x => x.auto).length;
  const pct = ciclo.length ? Math.round(conc / ciclo.length * 100) : 0;
  c.innerHTML = `
    <div class="boas"><small>${esc(dataExtenso())}</small><h1>${saudacao()}, ${esc(primeiroNome(ME.nome))}</h1><p>Supervisor · ${esc(Object.values(BASES).join(' · '))}</p></div>

    <div class="secao"><h2>Precisa da sua atenção</h2></div>
    ${tarefas.length ? `<div class="tarefas">${tarefas.map(t => `
      <button class="tarefa ${t.tom}" type="button" ${on(() => { if (t.f) AV.filtro = t.f; if (t.eq) EQ.filtro = t.eq; ir(t.ir); })}><span class="t-num num">${t.n}</span>
        <span class="t-txt"><b>${esc(t.t)}</b><span>${esc(t.s)}</span></span><span class="t-seta">›</span></button>`).join('')}</div>`
      : `<div class="tudo-ok">${ic('check')} Tudo em dia. Nenhuma pendência agora.</div>`}

    <div class="secao"><h2>Avaliação · ${rotuloPer(per)}</h2><a href="#/avaliacao">Abrir</a></div>
    <div class="progresso"><b>${conc} de ${ciclo.length} concluídos</b><div class="barra"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>
    <div class="kpis">
      <div class="kpi"><span>Técnicos</span><b class="num">${tecs.length}</b></div>
      <div class="kpi"><span>Autoavaliações</span><b class="num">${auto}</b><small>de ${ciclo.length}</small></div>
      <div class="kpi"><span>Avaliados por você</span><b class="num">${ciclo.length - semAval}</b><small>de ${ciclo.length}</small></div>
    </div>

    <div class="secao"><h2>Por base</h2></div>
    <div class="bases">${Object.keys(BASES).map(b => {
      const cb = ciclo.filter(x => x.t.base === b), feitos = cb.filter(x => x.sup).length;
      const st = d.baseStats.find(x => x.base === b);
      return `<div class="base-c ${baseCls(b)}">
        <header><b>${esc(baseNome(b))}</b><span>${feitos} de ${cb.length} avaliados</span></header>
        <div class="barra"><i style="width:${cb.length ? Math.round(feitos / cb.length * 100) : 0}%"></i></div>
        <p>${plural(cb.length, 'técnico', 'técnicos')}${st?.media != null ? ` · média geral ${nf(st.media)} ${etConceito(st.media)}` : ''}</p>
      </div>`;
    }).join('')}</div>`;
}

async function inicioTecnico(c) {
  const [d, avs] = await Promise.all([api('GET', '/api/dashboard/me'), api('GET', '/api/avaliacoes')]);
  const t = d.tecnico;
  if (!t) {
    c.innerHTML = `<div class="boas"><small>${esc(dataExtenso())}</small><h1>${saudacao()}, ${esc(primeiroNome(ME.nome))}</h1></div>
      <div class="secao"></div>
      <div class="alerta amb">${ic('conta')}<div><b>Seu acesso ainda não está ligado ao seu cadastro de técnico.</b><br>Peça ao supervisor para colocar o e-mail <b>${esc(ME.email)}</b> no seu cadastro. Depois disso você verá suas avaliações aqui.</div></div>`;
    return;
  }
  const per = periodosAbertos()[0];
  const auto = avs.find(a => a.tipo === 'autoavaliacao' && a.periodo === per);
  const sup = d.ultimaSupervisor;

  let passo;
  if (!auto) passo = { ic: 'aval', t: 'Faça sua autoavaliação', s: `${rotuloPer(per)} · leva uns 3 minutos`, b: 'Começar', fn: () => formAvaliacao({ periodo: per }) };
  else if (sup && !lido(sup)) passo = { ic: 'aval', t: 'Seu feedback chegou', s: `Avaliação do supervisor · ${rotuloPer(sup.periodo)}`, b: 'Ver', fn: () => { marcarLido(sup); ir('avaliacao'); } };

  c.innerHTML = `
    <div class="boas"><small>${esc(dataExtenso())}</small><h1>${saudacao()}, ${esc(primeiroNome(ME.nome))}</h1><p>${esc(baseNome(t.base))} · Escala ${esc(t.escala)} · ${esc(t.turno)}</p></div>
    ${passo ? `<div class="secao"><h2>Seu próximo passo</h2></div>
      <div class="proximo"><span class="ico">${ic(passo.ic)}</span><div class="txt"><b>${esc(passo.t)}</b><span>${esc(passo.s)}</span></div><button class="btn btn-pri" ${on(passo.fn)}>${esc(passo.b)}</button></div>`
      : `<div class="secao"></div><div class="tudo-ok">${ic('check')} Tudo em dia por aqui.</div>`}

    <div class="secao"><h2>Resumo</h2></div>
    <div class="info-grade">
      <div class="kpi"><span>Autoavaliação</span><b style="font-size:17px">${auto ? 'Feita' : 'Pendente'}</b><small>${rotuloPerCurto(per)}</small></div>
      <div class="kpi"><span>Última nota</span><b style="font-size:17px">${sup ? nf(sup.nota_final) : '—'}</b><small>${sup ? conceito(sup.nota_final) : 'Ainda sem avaliação liberada'}</small></div>
    </div>`;
}
function lido(av) { return lerLS('ge_lido_' + av.id) === '1'; }
function marcarLido(av) { gravarLS('ge_lido_' + av.id, '1'); }

// ════════════ Página: Avaliação ════════════
const AV = { periodo: null, filtro: 'todos', base: '', busca: '' };

function cicloAvaliacao(tecs, avs, per) {
  return tecs.map(t => {
    const auto = avs.find(a => a.tecnico_id === t.id && a.periodo === per && a.tipo === 'autoavaliacao');
    const sup  = avs.find(a => a.tecnico_id === t.id && a.periodo === per && a.tipo === 'supervisor');
    const status = !sup ? 'avaliar' : !sup.feedback_texto ? 'feedback' : !sup.liberado ? 'liberar' : 'concluido';
    return { t, auto, sup, status };
  });
}

PAGINAS.avaliacao = async c => isAdmin() ? avaliacaoAdmin(c) : avaliacaoTecnico(c);

async function avaliacaoAdmin(c) {
  const [avs, tecs] = await Promise.all([api('GET', '/api/avaliacoes'), api('GET', '/api/tecnicos')]);
  const pers = [...new Set([...periodosAbertos(), ...avs.map(a => a.periodo)])].sort().reverse();
  if (!AV.periodo || !pers.includes(AV.periodo)) AV.periodo = pers[0];
  const abertos = periodosAbertos();

  const desenhar = () => {
    const ciclo = cicloAvaliacao(tecs, avs, AV.periodo);
    const conta = { todos: ciclo.length, avaliar: 0, feedback: 0, concluido: 0, semauto: 0 };
    ciclo.forEach(x => { if (x.status === 'avaliar') conta.avaliar++; else if (x.status === 'concluido') conta.concluido++; else conta.feedback++; if (!x.auto) conta.semauto++; });
    let lista = ciclo;
    if (AV.base) lista = lista.filter(x => x.t.base === AV.base);
    if (AV.busca) { const q = AV.busca.toLowerCase(); lista = lista.filter(x => x.t.nome.toLowerCase().includes(q)); }
    if (AV.filtro === 'avaliar') lista = lista.filter(x => x.status === 'avaliar');
    if (AV.filtro === 'feedback') lista = lista.filter(x => x.status === 'feedback' || x.status === 'liberar');
    if (AV.filtro === 'concluido') lista = lista.filter(x => x.status === 'concluido');
    if (AV.filtro === 'semauto') lista = lista.filter(x => !x.auto);
    const ordem = { avaliar: 0, feedback: 1, liberar: 2, concluido: 3 };
    lista.sort((a, b) => ordem[a.status] - ordem[b.status] || a.t.nome.localeCompare(b.t.nome));
    const pct = conta.todos ? Math.round(conta.concluido / conta.todos * 100) : 0;
    const editavel = abertos.includes(AV.periodo);

    c.innerHTML = `
      <div class="pag-topo"><div><h1>Avaliação de desempenho</h1><p>Avalie, dê o feedback e libere para o técnico ver.</p></div></div>
      <div class="barra-ferramentas">
        <select id="av-per" aria-label="Semestre" style="max-width:260px">${pers.map(p => `<option value="${p}" ${p === AV.periodo ? 'selected' : ''}>${rotuloPer(p)}${abertos.includes(p) ? '' : ' (encerrado)'}</option>`).join('')}</select>
        <label class="busca">${ic('busca')}<input id="av-busca" type="search" placeholder="Buscar técnico" value="${esc(AV.busca)}" aria-label="Buscar técnico"></label>
      </div>
      <div class="progresso"><b>${conta.concluido} de ${conta.todos} concluídos</b><div class="barra"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>
      <div class="filtros" role="group" aria-label="Situação">
        ${[['todos', 'Todos'], ['avaliar', 'Para avaliar'], ['feedback', 'Feedback pendente'], ['concluido', 'Concluídos'], ['semauto', 'Sem autoavaliação']]
          .map(([k, t]) => `<button class="filtro" type="button" aria-pressed="${AV.filtro === k}" ${on(() => { AV.filtro = k; desenhar(); })}>${t}<span class="n">${conta[k]}</span></button>`).join('')}
      </div>
      <div class="filtros" role="group" aria-label="Base">
        <button class="filtro" type="button" aria-pressed="${!AV.base}" ${on(() => { AV.base = ''; desenhar(); })}>Todas as bases</button>
        ${Object.keys(BASES).map(b => `<button class="filtro" type="button" aria-pressed="${AV.base === b}" ${on(() => { AV.base = b; desenhar(); })}>${esc(baseNome(b))}</button>`).join('')}
      </div>
      ${!editavel ? `<div class="alerta azul">${ic('cal')}<div>Este semestre está encerrado: dá para consultar, dar feedback e gerar PDF, mas não criar novas avaliações.</div></div>` : ''}
      <div class="lista duas">${lista.length ? lista.map(x => cartaoCiclo(x, editavel, avs)).join('') : `<div class="vazio"><b>Ninguém aqui</b>Nenhum técnico neste filtro.</div>`}</div>`;

    $('#av-per').onchange = e => { AV.periodo = e.target.value; desenhar(); };
    const busca = $('#av-busca');
    busca.oninput = () => { AV.busca = busca.value; const pos = busca.selectionStart; desenhar(); const b2 = $('#av-busca'); b2.focus(); b2.setSelectionRange(pos, pos); };
  };

  function cartaoCiclo({ t, auto, sup, status }, editavel) {
    const passos = [
      ['Autoavaliação', !!auto], ['Sua avaliação', !!sup], ['Feedback', !!sup?.feedback_texto], ['Liberado', !!sup?.liberado],
    ];
    const atual = passos.findIndex((p, i) => i > 0 && !p[1]);
    const prim = {
      avaliar: editavel ? { t: 'Avaliar', fn: () => formAvaliacao({ tecnicoId: t.id, periodo: AV.periodo, auto, aoSalvar: render }) } : null,
      feedback: { t: 'Dar feedback', fn: () => formFeedback(sup, auto, render) },
      liberar: { t: 'Liberar para o técnico', fn: () => liberar(sup) },
      concluido: { t: 'PDF', ic: 'pdf', sec: true, fn: () => gerarPDF(avs, t, AV.periodo) },
    }[status];
    const menu = () => menuAcoes(t.nome, [
      sup && { t: 'Ver / editar minha avaliação', ic: 'editar', fn: () => formAvaliacao({ av: sup, auto, aoSalvar: render }) },
      auto && { t: 'Ver autoavaliação do técnico', ic: 'olho', fn: () => formAvaliacao({ av: auto, leitura: true }) },
      sup && { t: sup.feedback_texto ? 'Editar feedback' : 'Dar feedback', ic: 'enviar', fn: () => formFeedback(sup, auto, render) },
      sup && !sup.liberado && { t: 'Liberar sem feedback', ic: 'check', fn: () => liberar(sup) },
      (sup || auto) && { t: 'Gerar PDF', ic: 'pdf', fn: () => gerarPDF(avs, t, AV.periodo) },
      sup && { t: 'Excluir minha avaliação', ic: 'lixo', perigo: true, fn: () => excluirAv(sup, 'a sua avaliação') },
      auto && { t: 'Excluir autoavaliação', ic: 'lixo', perigo: true, fn: () => excluirAv(auto, 'a autoavaliação do técnico') },
    ]);
    const temMenu = sup || auto;
    return `<article class="item ${baseCls(t.base)}">
      <div class="item-topo"><span class="avatar">${esc(iniciais(t.nome))}</span>
        <div class="item-tit"><b>${esc(t.nome)}</b><div class="sub">${tagBase(t.base)}<span>Escala ${esc(t.escala)}</span></div></div>
        ${temMenu ? `<button class="btn-icone" type="button" aria-label="Mais ações" ${on(menu)}>⋯</button>` : ''}</div>
      <div class="etapas">${passos.map((p, i) => `<div class="etapa ${p[1] ? 'feita' : i === atual ? 'atual' : ''}"><i>${p[1] ? '✓' : i + 1}</i>${p[0]}</div>`).join('')}</div>
      ${(auto || sup) ? `<div class="notas-linha">${auto ? `<span>Auto: <b class="num">${nf(auto.nota_final)}</b></span>` : ''}${sup ? `<span>Supervisor: <b class="num">${nf(sup.nota_final)}</b> ${etConceito(sup.nota_final)}</span>` : ''}</div>` : ''}
      ${prim ? `<div class="item-acoes"><button class="btn ${prim.sec ? 'btn-sec' : 'btn-pri'}" type="button" ${on(prim.fn)}>${prim.ic ? ic(prim.ic) : ''}${prim.t}</button></div>` : ''}
    </article>`;
  }
  desenhar();
}

async function liberar(sup) {
  const ok = await confirmar('Liberar avaliação?', `${sup.tecnico_nome} vai poder ver a nota${sup.feedback_texto ? ' e o feedback' : ''} no app.`, { sim: 'Liberar' });
  if (!ok) return;
  try { await api('PUT', `/api/avaliacoes/${sup.id}/liberar`); aviso('Liberada para o técnico.', 'ok'); render(); } catch (e) { erro(e); }
}
async function excluirAv(av, nome) {
  const ok = await confirmar('Excluir avaliação?', `Vai apagar ${nome} de ${av.tecnico_nome} (${rotuloPer(av.periodo)}). Não dá para desfazer.`, { sim: 'Excluir', perigo: true });
  if (!ok) return;
  try { await api('DELETE', `/api/avaliacoes/${av.id}`); aviso('Avaliação excluída.'); render(); } catch (e) { erro(e); }
}

async function avaliacaoTecnico(c) {
  const [me, avs] = await Promise.all([api('GET', '/api/auth/me'), api('GET', '/api/avaliacoes')]);
  if (!me.tecnico) { c.innerHTML = `<div class="pag-topo"><h1>Avaliação</h1></div><div class="alerta amb">${ic('conta')}<div>Seu acesso ainda não está ligado ao seu cadastro de técnico. Fale com o supervisor.</div></div>`; return; }
  const abertos = periodosAbertos();
  const per = abertos[0];
  const auto = avs.find(a => a.tipo === 'autoavaliacao' && a.periodo === per);
  const sup  = avs.find(a => a.tipo === 'supervisor' && a.periodo === per);
  const passos = [['Sua autoavaliação', !!auto], ['Avaliação do supervisor', !!sup], ['Feedback liberado', !!sup]];
  const atual = passos.findIndex(p => !p[1]);
  const outros = [...new Set(avs.map(a => a.periodo))].filter(p => p !== per).sort().reverse();
  if (sup) marcarLido(sup);

  const blocoResultado = s => `
    <div class="comparativo" style="margin-top:12px">
      <div><span>Sua autoavaliação</span><b class="num">${nf(avs.find(a => a.tipo === 'autoavaliacao' && a.periodo === s.periodo)?.nota_final)}</b></div>
      <div><span>Supervisor</span><b class="num">${nf(s.nota_final)}</b>${etConceito(s.nota_final)}</div>
    </div>
    <div style="margin-top:12px">${regua(s.nota_final)}</div>
    ${s.feedback_texto ? `<div class="secao" style="margin-top:14px"><h2>Feedback do supervisor</h2><small class="num" style="color:var(--muted)">${fmt(s.feedback_data)}</small></div><div class="texto-feedback">${esc(s.feedback_texto)}</div>` : ''}
    <div class="item-acoes"><button class="btn btn-sec" ${on(() => formAvaliacao({ av: s, leitura: true }))}>${ic('olho')}Ver notas por critério</button>
      <button class="btn btn-sec" ${on(() => gerarPDF(avs, me.tecnico, s.periodo))}>${ic('pdf')}PDF</button></div>`;

  c.innerHTML = `
    <div class="pag-topo"><div><h1>Avaliação</h1><p>${rotuloPer(per)}</p></div></div>
    <section class="cartao">
      <div class="etapas">${passos.map((p, i) => `<div class="etapa ${p[1] ? 'feita' : i === atual ? 'atual' : ''}"><i>${p[1] ? '✓' : i + 1}</i>${p[0]}</div>`).join('')}</div>
      ${!auto ? `<p style="margin:14px 0 0">Responda os 10 critérios pensando no semestre. Seja sincero: o supervisor também avalia e vocês comparam no feedback.</p>
          <div class="item-acoes"><button class="btn btn-pri btn-lg" ${on(() => formAvaliacao({ periodo: per, aoSalvar: render }))}>Fazer minha autoavaliação</button></div>`
        : sup ? blocoResultado(sup)
        : `<p style="margin:14px 0 0">Autoavaliação enviada (nota <b class="num">${nf(auto.nota_final)}</b>). Agora é com o supervisor; o resultado aparece aqui quando ele liberar.</p>
           <div class="item-acoes">${auto.bloqueada ? '' : `<button class="btn btn-sec" ${on(() => formAvaliacao({ av: auto, aoSalvar: render }))}>${ic('editar')}Revisar minha autoavaliação</button>`}</div>`}
    </section>
    ${outros.length ? `<div class="secao"><h2>Semestres anteriores</h2></div><div class="lista">${outros.map(p => {
      const s = avs.find(a => a.tipo === 'supervisor' && a.periodo === p), a = avs.find(x => x.tipo === 'autoavaliacao' && x.periodo === p);
      return `<article class="item"><div class="item-topo"><div class="item-tit"><b>${rotuloPer(p)}</b><div class="sub">${a ? `Auto ${nf(a.nota_final)}` : 'Sem autoavaliação'} · ${s ? `Supervisor ${nf(s.nota_final)} ${etConceito(s.nota_final)}` : 'Avaliação não liberada'}</div></div></div>
        ${s ? `<div class="item-acoes"><button class="btn btn-sec btn-sm" ${on(() => Painel.abrir({ titulo: rotuloPer(p), corpo: `<section class="cartao">${blocoResultado(s)}</section>` }))}>Ver resultado</button></div>` : ''}</article>`;
    }).join('')}</div>` : ''}`;
}

// ── Formulário de avaliação ──
async function formAvaliacao({ av = null, tecnicoId = null, periodo = null, auto = null, leitura = false, aoSalvar = null }) {
  const admin = isAdmin();
  const tipo = av ? av.tipo : (admin ? 'supervisor' : 'autoavaliacao');
  const valores = { ...(av?.criterios || {}) };
  const tecId = av?.tecnico_id || tecnicoId;
  const per = av?.periodo || periodo || periodosAbertos()[0];
  let nomeTec = av?.tecnico_nome;
  if (!nomeTec && admin && tecId) { try { nomeTec = (await api('GET', '/api/tecnicos')).find(t => t.id === tecId)?.nome; } catch {} }
  if (!admin) nomeTec = nomeTec || ME.nome;
  const ref = tipo === 'supervisor' ? (auto?.criterios || null) : null;

  const titulo = leitura ? (tipo === 'autoavaliacao' ? 'Autoavaliação' : 'Avaliação do supervisor')
    : tipo === 'autoavaliacao' ? 'Minha autoavaliação' : (av ? 'Editar avaliação' : 'Avaliar técnico');

  const critHtml = x => `
    <div class="crit" id="crit-${x.f}">
      <div class="crit-tit"><b>${x.n}</b>${x.p ? `<span class="peso">peso ${x.p}%</span>` : ''}</div>
      <p>${x.d}</p>
      <div class="escala" role="radiogroup" aria-label="${x.n}">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" data-f="${x.f}" data-n="${n}" aria-pressed="${valores[x.f] === n}" aria-checked="${valores[x.f] === n}" ${leitura ? 'disabled' : ''}>${n}</button>`).join('')}</div>
      <div class="crit-rodape"><span class="sig" id="sig-${x.f}">${valores[x.f] ? SIGNIF[valores[x.f]] : ''}</span>${ref?.[x.f] ? `<span class="ref">Técnico se deu ${ref[x.f]}</span>` : ''}</div>
    </div>`;

  const corpo = `
    <div class="fixo-topo">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div><b>${esc(nomeTec || '')}</b><div style="font-size:13px;color:var(--muted)">${rotuloPer(per)}</div></div>
        ${leitura ? '' : `<span class="etiqueta et-azul" id="av-cont">0 de 10 respondidos</span>`}
      </div>
    </div>
    ${leitura ? '' : `<details class="explica"><summary>O que significa cada nota e como é calculado</summary>
      <ul>${[1, 2, 3, 4, 5].map(n => `<li><b>${n}</b> — ${SIGNIF[n]}</li>`).join('')}</ul>
      <p>A <b>nota base</b> é a média ponderada dos 7 primeiros critérios (pesos ao lado de cada um). Os 3 critérios do <b>fator organizacional</b> viram um multiplicador de 0,80× a 1,20×. Nota final = base × fator, de 0 a 6.</p>
      ${regua(null)}<p style="font-size:13px">Insuficiente abaixo de 3,0 · Regular até 4,49 · Bom até 5,49 · Excelente a partir de 5,5</p></details>`}
    ${['tec', 'comp', 'org'].map(g => `<div class="grupo-crit ${GRUPOS[g][1]}"><span>${GRUPOS[g][0]}</span><span style="font-weight:600;letter-spacing:0;text-transform:none;color:var(--muted)">${GRUPOS[g][2]}</span></div>${CRIT.filter(x => x.g === g).map(critHtml).join('')}`).join('')}
    <section class="bloco" style="margin-top:14px"><div class="bloco-tit" style="color:var(--navy)">Resultado</div>
      <div class="notas-linha" style="margin:0 0 6px"><span>Nota base <b class="num" id="r-base">—</b></span><span>× Fator <b class="num" id="r-mult">—</b></span></div>
      <div id="r-regua">${regua(null)}</div></section>`;

  const rodape = leitura ? `<button class="btn btn-sec" data-fechar>Fechar</button>` : `
    <div class="resultado"><div><small>Nota final</small><span class="nf num" id="r-final">—</span></div><span id="r-conc"></span></div>
    <button class="btn btn-pri" id="av-salvar" type="button">${av ? 'Salvar' : 'Enviar'}</button>`;

  Painel.abrir({ titulo, corpo, rodape, largo: true });

  const atualizar = () => {
    const n = CRIT.filter(x => valores[x.f]).length;
    const cont = $('#av-cont'); if (cont) { cont.textContent = `${n} de 10 respondidos`; cont.className = `etiqueta ${n === 10 ? 'et-ok' : 'et-azul'}`; }
    const r = calcNotas(valores);
    if ($('#r-final')) $('#r-final').textContent = r ? nf(r.nota_final) : '—';
    if ($('#r-conc')) $('#r-conc').innerHTML = r ? etConceito(r.nota_final) : '';
    $('#r-base').textContent = r ? nf(r.nota_base) : '—';
    $('#r-mult').textContent = r ? nf(r.multiplicador) + '×' : '—';
    $('#r-regua').innerHTML = regua(r ? r.nota_final : null);
  };
  atualizar();
  if (leitura) return;

  $('#painel-corpo').onclick = e => {
    const b = e.target.closest('.escala button'); if (!b) return;
    const f = b.dataset.f, n = +b.dataset.n;
    valores[f] = n;
    $$(`.escala button[data-f="${f}"]`).forEach(x => { x.setAttribute('aria-pressed', x === b); x.setAttribute('aria-checked', x === b); });
    $('#sig-' + f).textContent = SIGNIF[n];
    $('#crit-' + f).classList.remove('erro');
    atualizar();
  };
  $('#av-salvar').onclick = async () => {
    const falta = CRIT.filter(x => !valores[x.f]);
    if (falta.length) {
      falta.forEach(x => $('#crit-' + x.f).classList.add('erro'));
      $('#crit-' + falta[0].f).scrollIntoView({ block: 'center', behavior: 'smooth' });
      aviso(falta.length === 1 ? `Falta responder: ${falta[0].n}` : `Faltam ${falta.length} critérios (marcados em vermelho).`, 'erro');
      return;
    }
    const btn = $('#av-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      if (av) await api('PUT', `/api/avaliacoes/${av.id}`, { criterios: valores });
      else await api('POST', '/api/avaliacoes', { tecnico_id: tecId, periodo: per, criterios: valores });
      Painel.fechar(true);
      aviso(tipo === 'autoavaliacao' ? 'Autoavaliação enviada!' : 'Avaliação salva. Próximo passo: o feedback.', 'ok');
      (aoSalvar || render)();
    } catch (e) { erro(e); btn.disabled = false; btn.textContent = av ? 'Salvar' : 'Enviar'; }
  };
}

// ── Feedback ──
function formFeedback(sup, auto, aoSalvar) {
  const corpo = `
    <div class="comparativo">
      <div><span>Autoavaliação</span><b class="num">${auto ? nf(auto.nota_final) : '—'}</b>${auto ? etConceito(auto.nota_final) : '<small style="color:var(--muted)">não fez</small>'}</div>
      <div><span>Sua avaliação</span><b class="num">${nf(sup.nota_final)}</b>${etConceito(sup.nota_final)}</div>
    </div>
    ${auto ? `<details class="explica" style="margin-top:12px"><summary>Comparar critério a critério</summary>
      <table class="tabela" style="margin-top:8px"><thead><tr><th>Critério</th><th>Técnico</th><th>Você</th></tr></thead><tbody>
      ${CRIT.map(x => { const a = auto.criterios[x.f], s = sup.criterios[x.f]; return `<tr><td>${x.n}</td><td class="num">${a}</td><td class="num" style="${a !== s ? 'font-weight:800;color:' + (s > a ? 'var(--ok-dk)' : 'var(--red)') : ''}">${s}</td></tr>`; }).join('')}
      </tbody></table></details>` : ''}
    <label class="campo" style="margin-top:14px"><span>Feedback para o técnico</span>
      <textarea id="fb-texto" placeholder="Pontos fortes, o que melhorar e combinados para o próximo semestre…">${esc(sup.feedback_texto || '')}</textarea>
      <small>O técnico vê este texto no app quando a avaliação for liberada.</small></label>
    <label class="campo"><span>Data da conversa de feedback</span><input type="date" id="fb-data" value="${esc(sup.feedback_data || hoje())}"></label>
    ${sup.liberado ? `<div class="alerta ok">${ic('check')}<div>Esta avaliação já está liberada. O técnico verá as alterações na hora.</div></div>` : ''}`;
  const rodape = sup.liberado
    ? `<span class="esp"></span><button class="btn btn-pri" id="fb-lib" type="button">Salvar feedback</button>`
    : `<button class="btn btn-sec" id="fb-salvar" type="button">Salvar sem liberar</button><button class="btn btn-pri" id="fb-lib" type="button">Salvar e liberar</button>`;
  Painel.abrir({ titulo: `Feedback · ${sup.tecnico_nome}`, corpo, rodape });
  const enviar = async liberarAgora => {
    const texto = $('#fb-texto').value.trim();
    if (!texto) { $('#fb-texto').closest('.campo').classList.add('erro'); $('#fb-texto').focus(); aviso('Escreva o feedback antes de salvar.', 'erro'); return; }
    try {
      await api('PUT', `/api/avaliacoes/${sup.id}/feedback`, { feedback_texto: texto, feedback_data: $('#fb-data').value, liberar: liberarAgora });
      Painel.fechar(true);
      aviso(liberarAgora && !sup.liberado ? 'Feedback salvo e liberado para o técnico.' : 'Feedback salvo.', 'ok');
      aoSalvar && aoSalvar();
    } catch (e) { erro(e); }
  };
  $('#fb-lib').onclick = () => enviar(true);
  if ($('#fb-salvar')) $('#fb-salvar').onclick = () => enviar(false);
  $('#fb-texto').oninput = () => $('#fb-texto').closest('.campo').classList.remove('erro');
}

// ── PDF ──
function gerarPDF(avs, tec, per) {
  const auto = avs.find(a => a.tecnico_id === tec.id && a.periodo === per && a.tipo === 'autoavaliacao');
  const sup  = avs.find(a => a.tecnico_id === tec.id && a.periodo === per && a.tipo === 'supervisor');
  const linhas = CRIT.map(x => `<tr class="${x.g === 'org' ? 'org' : ''}"><td>${x.n}${x.p ? ` <span style="color:#888">(${x.p}%)</span>` : ''}</td><td class="c">${auto?.criterios?.[x.f] ?? '—'}</td><td class="c">${sup?.criterios?.[x.f] ?? '—'}</td></tr>`).join('');
  const tot = (r, k) => `<tr class="tot"><td>${r}</td><td class="c">${auto ? (k === 'multiplicador' ? nf(auto[k]) + '×' : nf(auto[k])) : '—'}</td><td class="c">${sup ? (k === 'multiplicador' ? nf(sup[k]) + '×' : nf(sup[k])) : '—'}</td></tr>`;
  const status = sup?.feedback_texto && sup?.liberado ? 'Avaliação completa: autoavaliação, avaliação do supervisor e feedback.'
    : sup ? 'Feedback pendente.' : 'Avaliação parcial (somente autoavaliação).';
  $('#impressao').innerHTML = `
    <div class="pr-cab"><img src="/logo.png" alt="Trivia"><h1>Avaliação de Desempenho</h1></div>
    <div class="pr-faixas"><i></i><i></i><i></i></div>
    <div class="pr-sec"><h2>Técnico</h2><div class="pr-dados">
      <div><span>Nome</span><b>${esc(tec.nome || tec.tecnico_nome)}</b></div><div><span>Base</span><b>${esc(baseNome(tec.base || tec.tecnico_base))}</b></div>
      <div><span>Escala</span><b>${esc(tec.escala || '—')}</b></div><div><span>Período</span><b>${rotuloPer(per)}</b></div></div>
      <div class="pr-status">${status}</div></div>
    <div class="pr-sec"><h2>Notas por critério (1 a 5)</h2>
      <table class="pr-t"><thead><tr><th>Critério</th><th>Autoavaliação</th><th>Supervisor</th></tr></thead>
      <tbody>${linhas}${tot('Nota base', 'nota_base')}${tot('Fator organizacional', 'multiplicador')}${tot('Nota final', 'nota_final')}
      <tr class="tot"><td>Conceito</td><td class="c">${auto ? conceito(auto.nota_final) : '—'}</td><td class="c">${sup ? conceito(sup.nota_final) : '—'}</td></tr></tbody></table>
      <p style="font-size:9px;color:#666;margin-top:4px">Escala da nota final: 0 a 6. Insuficiente &lt; 3,0 · Regular 3,0–4,49 · Bom 4,5–5,49 · Excelente ≥ 5,5.</p></div>
    ${sup?.feedback_texto ? `<div class="pr-sec"><h2>Feedback do supervisor · ${fmt(sup.feedback_data)}</h2><div class="pr-fb">${esc(sup.feedback_texto)}</div></div>` : ''}
    <div class="pr-ass"><div>${esc(tec.nome || tec.tecnico_nome)}<br><small>Técnico</small></div><div>Supervisor<br><small>${fmt(sup?.feedback_data || hoje())}</small></div></div>`;
  const img = $('#impressao img');
  const imprimir = () => setTimeout(() => window.print(), 50);
  img.complete ? imprimir() : (img.onload = img.onerror = imprimir);
}

// ════════════ Página: Equipe (técnicos) ════════════
const EQ = { base: '', busca: '', filtro: '' };
PAGINAS.equipe = async c => {
  const tecs = await api('GET', '/api/tecnicos');
  const desenhar = () => {
    let l = tecs;
    if (EQ.base) l = l.filter(t => t.base === EQ.base);
    if (EQ.busca) { const q = EQ.busca.toLowerCase(); l = l.filter(t => t.nome.toLowerCase().includes(q) || (t.email || '').includes(q)); }
    if (EQ.filtro === 'semacesso') l = l.filter(t => !t.user_vinculado);
    const semAc = tecs.filter(t => !t.user_vinculado).length;
    c.innerHTML = `
      <div class="pag-topo"><div><h1>Equipe</h1><p>${plural(tecs.length, 'técnico', 'técnicos')} cadastrados</p></div>
        <button class="btn btn-pri" ${on(() => formTecnico(null))}>${ic('mais1')}Técnico</button></div>
      <label class="busca">${ic('busca')}<input id="eq-busca" type="search" placeholder="Buscar por nome ou e-mail" value="${esc(EQ.busca)}" aria-label="Buscar"></label>
      <div class="filtros">
        <button class="filtro" type="button" aria-pressed="${!EQ.base && !EQ.filtro}" ${on(() => { EQ.base = ''; EQ.filtro = ''; desenhar(); })}>Todos</button>
        ${Object.keys(BASES).map(b => `<button class="filtro" type="button" aria-pressed="${EQ.base === b}" ${on(() => { EQ.base = EQ.base === b ? '' : b; desenhar(); })}>${esc(baseNome(b))}</button>`).join('')}
        ${semAc ? `<button class="filtro" type="button" aria-pressed="${EQ.filtro === 'semacesso'}" ${on(() => { EQ.filtro = EQ.filtro === 'semacesso' ? '' : 'semacesso'; desenhar(); })}>Sem acesso ao app<span class="n">${semAc}</span></button>` : ''}
      </div>
      ${l.length ? `<div class="lista">${l.map(t => {
        return `<article class="item ${baseCls(t.base)}" style="cursor:pointer" ${on(() => formTecnico(t))}>
          <div class="item-topo"><span class="avatar">${esc(iniciais(t.nome))}</span>
            <div class="item-tit"><b>${esc(t.nome)}</b><div class="sub">${tagBase(t.base)}<span>Escala ${esc(t.escala)} · ${esc(t.turno)}</span>
              ${!t.user_vinculado ? '<span class="etiqueta et-cinza">Sem acesso ao app</span>' : ''}</div></div>
            <span class="t-seta" style="color:var(--muted);font-size:22px">›</span></div></article>`;
      }).join('')}</div>` : `<div class="vazio"><b>Nenhum técnico encontrado</b></div>`}`;
    const b = $('#eq-busca'); b.oninput = () => { EQ.busca = b.value; const p = b.selectionStart; desenhar(); const b2 = $('#eq-busca'); b2.focus(); b2.setSelectionRange(p, p); };
  };
  desenhar();
};

async function formTecnico(t) {
  const users = await api('GET', '/api/users-disponiveis').catch(() => []);
  const v = t ? { ...t } : { nome: '', base: '', escala: '', turno: '', admissao: '', email: '', inicio_aquisitivo: '', fim_aquisitivo: '' };
  const corpo = `
    <label class="campo"><span>Nome completo</span><input id="ft-nome" value="${esc(v.nome)}" autocomplete="off"></label>
    <div class="campo"><span>Base</span><div class="chips-escolha" id="ft-base"></div></div>
    <div class="campo"><span>Escala</span><div class="chips-escolha" id="ft-escala"></div></div>
    <div class="campo"><span>Turno</span><div class="chips-escolha" id="ft-turno"></div></div>
    <label class="campo"><span>Data de admissão</span><input type="date" id="ft-adm" value="${esc(v.admissao)}"></label>
    <div class="bloco"><div class="bloco-tit" style="color:var(--navy)">Acesso ao app</div>
      <label class="campo" style="margin:0"><span>E-mail que o técnico usa para entrar</span>
        <input type="email" id="ft-email" list="ft-users" value="${esc(v.email)}" placeholder="nome@${DOMINIO}" inputmode="email" autocomplete="off">
        <datalist id="ft-users">${users.filter(u => !u.jaVinculado || u.email === v.email).map(u => `<option value="${esc(u.email)}">${esc(u.nome)}</option>`).join('')}</datalist></label>
      <div id="ft-acesso" style="margin-top:8px;font-size:13.5px"></div></div>`;
  const rodape = `${t ? `<button class="btn btn-sec" id="ft-excluir" type="button" style="color:var(--red)">${ic('lixo')}Excluir</button>` : ''}<span class="esp"></span><button class="btn btn-pri" id="ft-salvar" type="button">Salvar</button>`;
  Painel.abrir({ titulo: t ? 'Editar técnico' : 'Novo técnico', corpo, rodape });
  chipsEscolha($('#ft-base'), optsBases(), v.base);
  chipsEscolha($('#ft-escala'), ESCALAS.map(x => [x, x]), v.escala);
  chipsEscolha($('#ft-turno'), TURNOS.map(x => [x, x]), v.turno);
  const acesso = () => {
    const e = $('#ft-email').value.trim().toLowerCase(), u = users.find(x => x.email === e);
    $('#ft-acesso').innerHTML = !e ? '<span style="color:var(--muted)">Sem e-mail: o técnico não consegue fazer a autoavaliação nem ver o resultado.</span>'
      : u ? `<span class="etiqueta et-ok">✓ Conta encontrada: ${esc(u.nome)}</span>`
      : `<span class="etiqueta et-amb">Ainda sem conta</span> <span style="color:var(--muted)">Peça para o técnico tocar em “Pedir cadastro” com este e-mail, ou crie em Usuários.</span>`;
  };
  acesso(); $('#ft-email').oninput = acesso;
  $('#ft-salvar').onclick = async () => {
    const body = {
      nome: $('#ft-nome').value.trim(), base: $('#ft-base').dataset.valor, escala: $('#ft-escala').dataset.valor, turno: $('#ft-turno').dataset.valor,
      admissao: $('#ft-adm').value, email: $('#ft-email').value.trim().toLowerCase(),
    };
    const req = [['nome', '#ft-nome'], ['base', '#ft-base'], ['escala', '#ft-escala'], ['turno', '#ft-turno'], ['admissao', '#ft-adm']];
    const falta = req.filter(([k]) => !body[k]);
    req.forEach(([k, s]) => $(s).closest('.campo').classList.toggle('erro', !body[k]));
    if (falta.length) { $(falta[0][1]).closest('.campo').scrollIntoView({ block: 'center', behavior: 'smooth' }); aviso('Preencha os campos marcados.', 'erro'); return; }
    try {
      if (t) await api('PUT', `/api/tecnicos/${t.id}`, body); else await api('POST', '/api/tecnicos', body);
      Painel.fechar(true); aviso(t ? 'Técnico atualizado.' : 'Técnico cadastrado.', 'ok'); render();
    } catch (e) { erro(e); }
  };
  if (t) $('#ft-excluir').onclick = async () => {
    if (!await confirmar(`Excluir ${t.nome}?`, 'Também apaga todas as avaliações dele. Não dá para desfazer.\n(O acesso ao app continua em Usuários.)', { sim: 'Excluir tudo', perigo: true })) return;
    try { await api('DELETE', `/api/tecnicos/${t.id}`); Painel.fechar(true); aviso('Técnico excluído.'); render(); } catch (e) { erro(e); }
  };
}

// ════════════ Mais / Administração ════════════
PAGINAS.mais = async c => {
  c.innerHTML = `<div class="pag-topo"><h1>Mais</h1></div>
    <div class="tarefas">
      <button class="tarefa tom-red" data-ir="solicitacoes"><span class="t-num">${ic('pedido')}</span><span class="t-txt"><b>Pedidos de cadastro</b><span>${PENDENTES_CADASTRO ? plural(PENDENTES_CADASTRO, 'aguardando', 'aguardando') : 'Nenhum aguardando'}</span></span><span class="t-seta">›</span></button>
      <button class="tarefa tom-azul" data-ir="usuarios"><span class="t-num">${ic('usuarios')}</span><span class="t-txt"><b>Usuários</b><span>Quem pode entrar no app</span></span><span class="t-seta">›</span></button>
      <button class="tarefa tom-ok" data-ir="bases"><span class="t-num">${ic('bases')}</span><span class="t-txt"><b>Nomes das bases</b><span>${esc(Object.values(BASES).join(' · '))}</span></span><span class="t-seta">›</span></button>
      <button class="tarefa tom-azul" data-ir="conta"><span class="t-num">${ic('conta')}</span><span class="t-txt"><b>Minha conta</b><span>Trocar senha, sair</span></span><span class="t-seta">›</span></button>
    </div>`;
};

PAGINAS.solicitacoes = async c => {
  const regs = await api('GET', '/api/registros');
  PENDENTES_CADASTRO = regs.filter(r => r.status === 'pendente').length; montarMenus();
  const pend = regs.filter(r => r.status === 'pendente'), outras = regs.filter(r => r.status !== 'pendente');
  const card = r => `<article class="item ${baseCls(r.base)}"><div class="item-topo"><span class="avatar">${esc(iniciais(r.nome))}</span>
      <div class="item-tit"><b>${esc(r.nome)}</b><div class="sub"><span>${esc(r.email)}</span></div></div>
      ${r.status !== 'pendente' ? `<span class="etiqueta ${r.status === 'aprovado' ? 'et-ok' : 'et-red'}">${r.status === 'aprovado' ? 'Aprovado' : 'Recusado'}</span>` : ''}</div>
    <div class="dados"><div><span>Base</span><b>${esc(baseNome(r.base))}</b></div><div><span>Escala · turno</span><b>${esc(r.escala)} · ${esc(r.turno)}</b></div><div><span>Admissão</span><b>${fmt(r.admissao)}</b></div><div><span>Pedido em</span><b>${fmt(r.created_at)}</b></div></div>
    ${r.status === 'pendente' ? `<div class="item-acoes"><button class="btn btn-pri" ${on(() => decidirCadastro(r, true))}>${ic('check')}Aprovar</button><button class="btn btn-sec" ${on(() => decidirCadastro(r, false))}>${ic('x')}Recusar</button></div>` : ''}</article>`;
  c.innerHTML = `<div class="pag-topo"><div><h1>Pedidos de cadastro</h1><p>Ao aprovar, o técnico ganha acesso e entra na Equipe.</p></div></div>
    ${pend.length ? `<div class="lista">${pend.map(card).join('')}</div>` : `<div class="vazio"><b>Nenhum pedido aguardando</b>Técnicos novos pedem acesso pela tela de entrada, em “Pedir cadastro”.</div>`}
    ${outras.length ? `<details class="explica" style="margin-top:18px"><summary>Já analisados (${outras.length})</summary><div class="lista" style="margin-top:10px">${outras.map(card).join('')}</div></details>` : ''}`;
};
async function decidirCadastro(r, aprovar) {
  if (!aprovar && !await confirmar('Recusar pedido?', `${r.nome} não terá acesso ao app.`, { sim: 'Recusar', perigo: true })) return;
  try { await api('POST', `/api/registros/${r.id}/${aprovar ? 'aprovar' : 'rejeitar'}`); aviso(aprovar ? `${primeiroNome(r.nome)} já pode entrar no app.` : 'Pedido recusado.', 'ok'); render(); } catch (e) { erro(e); }
}

PAGINAS.usuarios = async c => {
  const us = await api('GET', '/api/users');
  c.innerHTML = `<div class="pag-topo"><div><h1>Usuários</h1><p>Quem pode entrar no app.</p></div><button class="btn btn-pri" ${on(() => formUsuario(null))}>${ic('mais1')}Usuário</button></div>
    <div class="lista">${us.map(u => `<article class="item" style="cursor:pointer" ${on(() => formUsuario(u))}><div class="item-topo"><span class="avatar">${esc(iniciais(u.nome))}</span>
      <div class="item-tit"><b>${esc(u.nome)}${u.id === ME.id ? ' <span style="font-weight:500;color:var(--muted)">(você)</span>' : ''}</b><div class="sub"><span>${esc(u.email)}</span></div></div>
      <span class="etiqueta ${u.role === 'admin' ? 'et-azul' : 'et-cinza'}">${u.role === 'admin' ? 'Supervisor' : 'Técnico'}</span></div></article>`).join('')}</div>`;
};
function formUsuario(u) {
  let papel = u?.role || 'user';
  const corpo = `
    <label class="campo"><span>Nome</span><input id="fu-nome" value="${esc(u?.nome || '')}"></label>
    <label class="campo"><span>E-mail</span><input type="email" id="fu-email" value="${esc(u?.email || '')}" placeholder="nome@${DOMINIO}" inputmode="email"></label>
    <div class="campo"><span>Perfil</span><div class="chips-escolha" id="fu-papel"></div><small>Supervisor vê toda a equipe, avalia e dá feedback.</small></div>
    <label class="campo"><span>${u ? 'Nova senha (deixe vazio para manter)' : 'Senha provisória'}</span><input type="text" id="fu-senha" autocomplete="off" placeholder="Mín. 8 caracteres"><small>A pessoa vai precisar trocar no primeiro acesso.</small></label>`;
  const rodape = `${u && u.id !== ME.id ? `<button class="btn btn-sec" id="fu-excluir" style="color:var(--red)" type="button">${ic('lixo')}Excluir</button>` : ''}<span class="esp"></span><button class="btn btn-pri" id="fu-salvar" type="button">Salvar</button>`;
  Painel.abrir({ titulo: u ? 'Editar usuário' : 'Novo usuário', corpo, rodape });
  chipsEscolha($('#fu-papel'), [['user', 'Técnico'], ['admin', 'Supervisor']], papel, v => papel = v);
  $('#fu-salvar').onclick = async () => {
    const body = { nome: $('#fu-nome').value.trim(), email: $('#fu-email').value.trim().toLowerCase(), role: papel };
    const s = $('#fu-senha').value; if (s) body.password = s;
    if (!body.nome || !body.email) { aviso('Preencha nome e e-mail.', 'erro'); return; }
    if (!u && !s) { aviso('Defina uma senha provisória.', 'erro'); return; }
    try { if (u) await api('PUT', `/api/users/${u.id}`, body); else await api('POST', '/api/users', body); Painel.fechar(true); aviso('Usuário salvo.', 'ok'); render(); } catch (e) { erro(e); }
  };
  if ($('#fu-excluir')) $('#fu-excluir').onclick = async () => {
    if (!await confirmar(`Excluir ${u.nome}?`, 'A pessoa perde o acesso ao app. O cadastro de técnico e as avaliações continuam.', { sim: 'Excluir', perigo: true })) return;
    try { await api('DELETE', `/api/users/${u.id}`); Painel.fechar(true); aviso('Usuário excluído.'); render(); } catch (e) { erro(e); }
  };
}

PAGINAS.bases = async c => {
  c.innerHTML = `<div class="pag-topo"><div><h1>Nomes das bases</h1><p>Aparecem em todo o app.</p></div></div>
    <section class="cartao" style="max-width:520px">
      ${Object.keys(BASES).map((k, i) => `<label class="campo"><span><span class="tag-base ${baseCls(k)}">${k}</span></span><input id="cfg-${i}" value="${esc(BASES[k])}" maxlength="20"></label>`).join('')}
      <button class="btn btn-pri" ${on(async () => {
        const bases = {}; Object.keys(BASES).forEach((k, i) => bases[k] = $('#cfg-' + i).value.trim() || k);
        try { await api('PUT', '/api/config/bases', { bases }); BASES = bases; aviso('Nomes salvos.', 'ok'); render(); } catch (e) { erro(e); }
      })}>Salvar</button></section>`;
};

PAGINAS.conta = async c => {
  c.innerHTML = `<div class="pag-topo"><h1>Minha conta</h1></div>
    <section class="cartao"><div class="item-topo"><span class="avatar" style="width:48px;height:48px;background:var(--navy);color:#fff">${esc(iniciais(ME.nome))}</span>
      <div class="item-tit"><b>${esc(ME.nome)}</b><div class="sub">${esc(ME.email)} · ${isAdmin() ? 'Supervisor' : 'Técnico'}</div></div></div></section>
    <div class="tarefas" style="margin-top:14px">
      <button class="tarefa tom-azul" ${on(() => formSenha())}><span class="t-num">${ic('chave')}</span><span class="t-txt"><b>Trocar senha</b></span><span class="t-seta">›</span></button>
      <button class="tarefa tom-red" ${on(() => sair())}><span class="t-num">${ic('sair')}</span><span class="t-txt"><b>Sair</b></span><span class="t-seta">›</span></button>
    </div>`;
};

function formSenha(obrigatorio = false) {
  const corpo = `${obrigatorio ? `<div class="alerta amb">${ic('chave')}<div>Por segurança, crie uma senha nova antes de continuar.</div></div>` : ''}
    <label class="campo"><span>Senha atual</span><input type="password" id="fs-atual" autocomplete="current-password"></label>
    <label class="campo"><span>Nova senha</span><input type="password" id="fs-nova" autocomplete="new-password" placeholder="Mín. 8 caracteres"></label>
    <label class="campo"><span>Repita a nova senha</span><input type="password" id="fs-nova2" autocomplete="new-password"></label>`;
  const rodape = `${obrigatorio ? `<button class="btn btn-sec" type="button" id="fs-sair">Sair</button>` : ''}<span class="esp"></span><button class="btn btn-pri" id="fs-salvar" type="button">Salvar senha</button>`;
  Painel.abrir({ titulo: 'Trocar senha', corpo, rodape, travado: obrigatorio });
  if (obrigatorio) $('#fs-sair').onclick = () => sair();
  $('#fs-salvar').onclick = async () => {
    const atual = $('#fs-atual').value, nova = $('#fs-nova').value;
    if (nova.length < 8) { aviso('A nova senha precisa ter pelo menos 8 caracteres.', 'erro'); return; }
    if (nova !== $('#fs-nova2').value) { aviso('As duas senhas novas não são iguais.', 'erro'); return; }
    try { await api('PUT', '/api/auth/senha', { atual, nova }); ME.trocar_senha = false; Painel.fechar(true); aviso('Senha alterada.', 'ok'); } catch (e) { erro(e); }
  };
}

// ════════════ Início ════════════
if (TOKEN && ME) iniciarApp(); else mostrarLogin();
