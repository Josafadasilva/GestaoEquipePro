'use strict';

// ── Auth ──────────────────────────────────────────────────
let TOKEN = localStorage.getItem('ge_token');
let ME    = JSON.parse(localStorage.getItem('ge_user') || 'null');

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { doLogout(); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
  return data;
}

async function doLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const err = document.getElementById('login-error');
  btn.disabled = true; btn.textContent = 'Entrando...'; err.textContent = '';
  try {
    const data = await api('POST', '/api/auth/login', {
      email:    document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });
    TOKEN = data.token; ME = data.user;
    localStorage.setItem('ge_token', TOKEN);
    localStorage.setItem('ge_user', JSON.stringify(ME));
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

function doLogout() {
  localStorage.removeItem('ge_token'); localStorage.removeItem('ge_user');
  TOKEN = null; ME = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display   = 'none';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  showLogin();
}

async function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display   = 'flex';
  document.getElementById('topbar-user').textContent    = ME?.nome || '';
  document.getElementById('welcome-nome').textContent   = `Bem-vindo, ${ME?.nome?.toUpperCase() || ''}`;

  // Garante que itens admin ficam ocultos por padrão (importante após troca de sessão)
  document.querySelectorAll('.nav-admin').forEach(el => el.style.display = 'none');

  if (ME?.role === 'admin') {
    document.querySelectorAll('.nav-admin').forEach(el => el.style.display = 'flex');
    document.getElementById('welcome-nome').innerHTML += ' <span style="font-size:12px;color:var(--orange)">[Supervisor]</span>';
    App.registros.loadBadge();
    // Admin vê o campo status nas férias
    const sr = document.getElementById('fer-status-row');
    if (sr) sr.style.display = '';
  } else {
    // Técnico não vê o campo status (sempre pendente)
    const sr = document.getElementById('fer-status-row');
    if (sr) sr.style.display = 'none';
  }
  await App.config.load();
  navigate('dashboard');
}

// ── Login / Solicitar toggle ──────────────────────────────
function showSolicitar() {
  document.getElementById('painel-login').style.display     = 'none';
  document.getElementById('painel-solicitar').style.display = 'block';
}
function showLogin() {
  document.getElementById('painel-solicitar').style.display = 'none';
  document.getElementById('painel-login').style.display     = 'flex';
}

async function doSolicitarCadastro(e) {
  e.preventDefault();
  const btn    = document.getElementById('btn-solicitar');
  const err    = document.getElementById('sol-error');
  const senha  = document.getElementById('sol-senha').value;
  const senha2 = document.getElementById('sol-senha2').value;
  err.style.color = '#f87171';
  if (senha !== senha2)  { err.textContent = 'As senhas não conferem.'; return; }
  if (senha.length < 6)  { err.textContent = 'Senha deve ter ao menos 6 caracteres.'; return; }
  btn.disabled = true; btn.textContent = 'Enviando...'; err.textContent = '';
  try {
    await api('POST', '/api/registros', {
      nome:     document.getElementById('sol-nome').value,
      email:    document.getElementById('sol-email').value,
      password: senha,
      base:     document.getElementById('sol-base').value,
      escala:   document.getElementById('sol-escala').value,
      turno:    document.getElementById('sol-turno').value,
      admissao: document.getElementById('sol-admissao').value,
    });
    err.style.color = '#4ade80';
    err.textContent = '✓ Solicitação enviada! Aguarde aprovação de um supervisor.';
    setTimeout(showLogin, 2800);
  } catch(ex) {
    err.style.color = '#f87171';
    err.textContent = ex.message;
    btn.disabled = false; btn.textContent = 'Enviar Solicitação';
  }
}

// ── Navigation ────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById(`page-${page}`);
  const ni = document.querySelector(`[data-page="${page}"]`);
  if (pg) pg.classList.add('active');
  if (ni) ni.classList.add('active');
  const renders = {
    dashboard: () => App.dashboard.load(),
    cadastro:  () => App.cadastro.render(),
    ferias:    () => App.ferias.render(),
    avaliacao: () => App.avaliacao.render(),
    usuarios:  () => App.usuarios.render(),
    registros: () => App.registros.render(),
    config:    () => App.config.openPage(),
  };
  if (renders[page]) renders[page]();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }

// ── Toast ─────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Helpers ───────────────────────────────────────────────
function fmt(d) { if (!d) return '—'; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; }
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(s,n){ const d=new Date(s); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; }
function diffDias(a,b){ if(!a||!b) return 0; return Math.max(0,Math.round((new Date(b)-new Date(a))/86400000)+1); }

function conceito(n) {
  if (n >= 5.5) return { t: 'Excelente',    c: 'conc-Excelente' };
  if (n >= 4.5) return { t: 'Bom',          c: 'conc-Bom' };
  if (n >= 3.0) return { t: 'Regular',      c: 'conc-Regular' };
  return              { t: 'Insuficiente', c: 'conc-Insuficiente' };
}

const PESOS       = { conhecimentoTecnico:.20, segurancaOperacional:.20, iniciativaAtuacao:.15, disponibilidade:.15, trabalhoEquipe:.12, comunicacao:.10, proatividade:.08 };
const BASE_FIELDS = Object.keys(PESOS);
const ORG_FIELDS  = ['focoResultados','posturaEtica','alinhamentoValores'];
const ALL_FIELDS  = [...BASE_FIELDS, ...ORG_FIELDS];
const CRIT_LABELS = {
  conhecimentoTecnico:  'Conhecimento Técnico',
  segurancaOperacional: 'Segurança Operacional',
  iniciativaAtuacao:    'Iniciativa em Atuação',
  disponibilidade:      'Disponibilidade',
  trabalhoEquipe:       'Trabalho em Equipe',
  comunicacao:          'Comunicação',
  proatividade:         'Proatividade',
  focoResultados:       'Foco nos Resultados',
  posturaEtica:         'Postura Ética',
  alinhamentoValores:   'Alinhamento de Valores',
};

function calcNotaBase(c){ return BASE_FIELDS.reduce((s,f)=>s+(c[f]||0)*PESOS[f],0); }
function calcMult(c){ const avg=ORG_FIELDS.reduce((s,f)=>s+(c[f]||0),0)/3; return Math.round((0.80+(avg-1)*0.10)*100)/100; }

// ── Stars ─────────────────────────────────────────────────
function buildStars(el) {
  el.innerHTML = ''; el.dataset.v = '0';
  for (let i=1;i<=5;i++) {
    const s = document.createElement('span');
    s.className='star'; s.textContent='★'; s.dataset.n=i;
    s.onclick     = () => setStars(el, i);
    s.onmouseover = () => paintStars(el, i);
    s.onmouseout  = () => paintStars(el, +el.dataset.v);
    el.appendChild(s);
  }
}
function setStars(el,v){ el.dataset.v=v; paintStars(el,v); if(!el.dataset.f?.startsWith('fb_')) App.avaliacao.preview(); }
function paintStars(el,v){ el.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('on',i<v)); }
function starVal(f){ const el=document.querySelector(`.stars[data-f="${f}"]`); return el?+el.dataset.v:0; }
function setStarVal(f,v){ const el=document.querySelector(`.stars[data-f="${f}"]`); if(el) setStars(el,v); }
function initStars(){ document.querySelectorAll('.stars').forEach(buildStars); }

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); }));

// ── Calc helpers ──────────────────────────────────────────
function calcAquis() {
  const adm = document.getElementById('tec-admissao').value; if (!adm) return;
  const fim = new Date(adm); fim.setFullYear(fim.getFullYear()+1); fim.setDate(fim.getDate()-1);
  document.getElementById('tec-ini-aq').value = adm;
  document.getElementById('tec-fim-aq').value = fim.toISOString().split('T')[0];
}

// ── Lógica de Períodos de Férias ──────────────────────────
function atualizarSecaoFerias() {
  const ini1  = document.getElementById('fer-ini1').value;
  const fim1  = document.getElementById('fer-fim1').value;
  const ini2  = document.getElementById('fer-ini2')?.value || '';
  const fim2  = document.getElementById('fer-fim2')?.value || '';
  const abono = document.getElementById('fer-abono')?.checked || false;

  const infP1  = document.getElementById('fer-info-p1');
  const secAb  = document.getElementById('sec-abono');
  const secP2  = document.getElementById('sec-p2');
  const infTot = document.getElementById('fer-info-total');

  // Sem datas P1 → limpa tudo
  if (!ini1 || !fim1) {
    if (infP1)  infP1.style.display  = 'none';
    if (secAb)  secAb.style.display  = 'none';
    if (secP2)  secP2.style.display  = 'none';
    if (infTot) infTot.style.display = 'none';
    return;
  }

  const dias1 = diffDias(ini1, fim1);
  if (dias1 <= 0) return;

  // Mostra contador P1
  if (infP1) {
    infP1.style.display = '';
    document.getElementById('fer-dias-p1-val').textContent = dias1;
    const hint = document.getElementById('fer-dias-p1-hint');
    if (dias1 === 20)      hint.textContent = '→ Pode solicitar Abono Pecuniário (10 dias em $)';
    else if (dias1 < 20)   hint.textContent = `→ Restam ${30 - dias1} dias disponíveis`;
    else if (dias1 === 30) hint.textContent = '✓ Período completo (30 dias)';
    else                   hint.textContent = '';
  }

  // Regra P1 = exatamente 20 dias → opção de abono, sem P2
  if (dias1 === 20) {
    if (secAb) secAb.style.display = '';
    if (secP2) {
      secP2.style.display = 'none';
      // Limpa P2
      const i2 = document.getElementById('fer-ini2'); if (i2) i2.value = '';
      const f2 = document.getElementById('fer-fim2'); if (f2) f2.value = '';
    }
  }
  // Regra P1 < 20 dias → mostra P2, sem abono
  else if (dias1 < 20) {
    if (secAb) { secAb.style.display = 'none'; const cb=document.getElementById('fer-abono'); if(cb) cb.checked=false; }
    if (secP2) secP2.style.display = '';
  }
  // P1 ≥ 21 dias (mas não 20 exato, nem 30) → nem abono nem P2
  else {
    if (secAb) { secAb.style.display = 'none'; const cb=document.getElementById('fer-abono'); if(cb) cb.checked=false; }
    if (secP2) { secP2.style.display = 'none'; const i2=document.getElementById('fer-ini2');if(i2)i2.value=''; const f2=document.getElementById('fer-fim2');if(f2)f2.value=''; }
  }

  // Total
  const dias2 = (ini2 && fim2) ? diffDias(ini2, fim2) : 0;
  const abonoD = (abono && dias1 === 20) ? 10 : 0;
  const total  = dias1 + dias2 + abonoD;

  if (infTot) {
    infTot.style.display = '';
    document.getElementById('fer-dias-total').textContent = total;
    const hint = document.getElementById('fer-total-hint');
    if (abonoD > 0) hint.innerHTML = `<span style="color:var(--green)">(${dias1} férias + ${abonoD} abono = 30 dias contabilizados)</span>`;
    else if (total > 30) hint.innerHTML = `<span class="fer-aviso">⚠ Excede 30 dias de direito</span>`;
    else if (total === 30) hint.innerHTML = `<span style="color:var(--green)">✓ Período completo</span>`;
    else hint.textContent = `(direito: 30 dias)`;
  }
}

// Mantido para compatibilidade (chamado pelo calcAquis)
function calcFerDias() { atualizarSecaoFerias(); }

// ── ISO Week & Schedule ───────────────────────────────────
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function isDayWork(escala, date) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  const odd  = isoWeek(date) % 2 === 1;
  const isWQ = dow === 3 || dow === 4;
  const isMTF = dow === 1 || dow === 2 || dow === 5;
  switch (escala) {
    case 'A': case 'C': return odd ? isWQ   : isMTF;
    case 'B': case 'D': return odd ? isMTF  : isWQ;
    case 'SD': case 'SN': return true;
    default: return false;
  }
}

// ── Calendar State ────────────────────────────────────────
let calState = {
  tecnicoId: null, data: null,
  p1Start: null, p1End: null, p2Start: null, p2End: null,
  selecting: 'p1', hoverDate: null,
};

async function abrirCalendario(tecnicoId) {
  calState = { tecnicoId: null, data: null, p1Start: null, p1End: null, p2Start: null, p2End: null, selecting: 'p1', hoverDate: null };
  updateSelDisplay();

  // Descobre técnico vinculado ao usuário logado
  let meuTecnico = null;
  if (!tecnicoId) {
    try {
      const me = await api('GET', '/api/auth/me');
      meuTecnico = me.tecnico || null;
      tecnicoId  = meuTecnico?.id || null;
    } catch(e) {}
  }

  // Técnico não-admin sem vínculo → abre formulário direto (sem calendário)
  if (!tecnicoId && ME?.role !== 'admin') {
    await App.ferias.openModal(null, meuTecnico);
    return;
  }

  calState.tecnicoId = tecnicoId;
  document.getElementById('overlay-cal').style.display = 'flex';
  document.getElementById('cal-grid').innerHTML = '<div class="empty" style="padding:40px">Carregando calendário…</div>';

  if (ME?.role === 'admin') {
    try {
      const tecs = await api('GET', '/api/tecnicos');
      const sel  = document.getElementById('cal-tec-sel');
      sel.innerHTML = '<option value="">— Selecione um técnico —</option>' +
        tecs.map(t => `<option value="${t.id}" ${t.id===tecnicoId?'selected':''}>${t.nome} — ${BASE_NAMES[t.base]||t.base}</option>`).join('');
      document.getElementById('cal-tec-select-row').style.display = 'flex';
    } catch(e) {}
  } else {
    document.getElementById('cal-tec-select-row').style.display = 'none';
  }

  if (tecnicoId) {
    await carregarCalendario(tecnicoId);
  } else {
    document.getElementById('cal-subtitle').textContent = 'Selecione um técnico acima';
    document.getElementById('cal-grid').innerHTML = '<div class="empty" style="padding:40px">Selecione um técnico para visualizar o calendário</div>';
  }
}

async function carregarCalendario(tecnicoId) {
  document.getElementById('cal-grid').innerHTML = '<div class="empty" style="padding:40px">Carregando…</div>';
  try {
    const data = await api('GET', `/api/calendario?tecnico_id=${tecnicoId}`);
    calState.data = data;
    document.getElementById('cal-subtitle').textContent =
      `${data.tecnico.nome} · ${BASE_NAMES[data.tecnico.base] || data.tecnico.base} · Escala ${data.tecnico.escala}`;
    renderCalendar(data);
  } catch(e) {
    document.getElementById('cal-grid').innerHTML = `<div class="empty" style="padding:40px">${e.message}</div>`;
  }
}

function fecharCalendario() { document.getElementById('overlay-cal').style.display = 'none'; }

async function calMudarTecnico() {
  const id = +document.getElementById('cal-tec-sel').value;
  if (!id) return;
  calState.tecnicoId = id; calState.p1Start = calState.p1End = calState.p2Start = calState.p2End = null;
  updateSelDisplay();
  await carregarCalendario(id);
}

function buildFeriaMap(feriasList) {
  const map = {};
  const markRange = (start, end, tipo, nome) => {
    if (!start || !end) return;
    let cur = new Date(start + 'T12:00:00');
    const endD = new Date(end + 'T12:00:00');
    while (cur <= endD) {
      const k = cur.toISOString().split('T')[0];
      if (!map[k]) map[k] = [];
      map[k].push({ tipo, nome });
      cur.setDate(cur.getDate() + 1);
    }
  };
  (feriasList || []).forEach(f => {
    markRange(f.inicio_p1, f.fim_p1, f.tipo, f.nome);
    markRange(f.inicio_p2, f.fim_p2, f.tipo, f.nome);
  });
  return map;
}

function renderCalendar(data) {
  const { tecnico, feriasList } = data;
  const feriaMap = buildFeriaMap(feriasList);
  const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const now      = new Date();
  let html = '';
  for (let m = 0; m < 24; m++) {
    const year  = now.getFullYear() + Math.floor((now.getMonth() + m) / 12);
    const month = (now.getMonth() + m) % 12;
    html += buildMonth(year, month, MONTHS[month], tecnico, feriaMap);
  }
  document.getElementById('cal-grid').innerHTML = html;
  document.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click',      () => calClickDay(el.dataset.date));
    el.addEventListener('mouseenter', () => { calState.hoverDate = el.dataset.date; refreshHighlights(); });
  });
}

function buildMonth(year, month, monthName, tecnico, feriaMap) {
  const todayStr  = today();
  const firstDow  = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();
  const DOW_HDR   = ['D','S','T','Q','Q','S','S'];

  let cells = DOW_HDR.map(d => `<div class="cal-wh">${d}</div>`).join('');
  let days  = '';
  for (let i = 0; i < firstDow; i++) days += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMon; d++) {
    const date    = new Date(year, month, d);
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isWork  = isDayWork(tecnico.escala, date);
    const isToday = dateStr === todayStr;
    const finfo   = feriaMap[dateStr] || [];

    let cls = isWork ? 'work' : 'off';
    let markers = '';

    if (finfo.length) {
      const tipos = finfo.map(f => f.tipo);
      if (tipos.includes('proprio'))    cls += ' ferias-proprio';
      else if (tipos.includes('par'))   cls += ' ferias-par';
      else if (tipos.includes('mesma')) cls += ' ferias-mesma';
      const names = [...new Set(finfo.map(f => f.nome))].join(', ');
      markers = `<div class="cal-day-markers">${finfo.map(f=>`<span class="cdm cdm-${f.tipo}" title="${f.nome}"></span>`).join('')}</div>`;
      days += `<div class="cal-day ${cls}${isToday?' today':''}" data-date="${dateStr}" title="${names}">
        <span class="cal-day-num">${d}</span>${markers}
      </div>`;
    } else {
      days += `<div class="cal-day ${cls}${isToday?' today':''}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
      </div>`;
    }
  }
  return `<div class="cal-month">
    <div class="cal-month-title">${monthName} ${year}</div>
    <div class="cal-week-header">${cells}</div>
    <div class="cal-days-grid">${days}</div>
  </div>`;
}

function calClickDay(dateStr) {
  const s = calState;
  if (s.selecting === 'p1') {
    if (!s.p1Start) { s.p1Start = dateStr; }
    else if (!s.p1End) {
      if (dateStr < s.p1Start) { s.p1End = s.p1Start; s.p1Start = dateStr; }
      else                      { s.p1End = dateStr; }
      s.selecting = 'p2';
    } else { s.p1Start = dateStr; s.p1End = null; }
  } else {
    if (!s.p2Start) { s.p2Start = dateStr; }
    else if (!s.p2End) {
      if (dateStr < s.p2Start) { s.p2End = s.p2Start; s.p2Start = dateStr; }
      else                      { s.p2End = dateStr; }
    } else { s.p2Start = dateStr; s.p2End = null; }
  }
  updateSelDisplay(); refreshHighlights();
}

function inRange(d, a, b) {
  if (!a || !b) return false;
  const lo = a < b ? a : b, hi = a < b ? b : a;
  return d >= lo && d <= hi;
}

function refreshHighlights() {
  const s = calState;
  const hovP1 = s.selecting==='p1' && s.p1Start && !s.p1End ? s.hoverDate : null;
  const hovP2 = s.selecting==='p2' && s.p2Start && !s.p2End ? s.hoverDate : null;
  document.querySelectorAll('.cal-day[data-date]').forEach(el => {
    const d = el.dataset.date;
    el.classList.remove('sel','sel-range');
    const isEnd = d===s.p1Start||d===s.p1End||d===s.p2Start||d===s.p2End;
    const isRng = inRange(d,s.p1Start,s.p1End)||inRange(d,s.p2Start,s.p2End)
                ||inRange(d,s.p1Start,hovP1)||inRange(d,s.p2Start,hovP2);
    if (isEnd) el.classList.add('sel');
    else if (isRng) el.classList.add('sel-range');
  });
}

function updateSelDisplay() {
  const s   = calState;
  const p1d = document.getElementById('cal-p1-display');
  const p2d = document.getElementById('cal-p2-display');
  const p1c = document.getElementById('cal-p1-clear');
  const p2c = document.getElementById('cal-p2-clear');
  const btn = document.getElementById('btn-cal-confirmar');

  if (s.p1Start && s.p1End) {
    p1d.textContent = `${fmt(s.p1Start)} → ${fmt(s.p1End)}  (${diffDias(s.p1Start,s.p1End)} dias)`;
    p1c.style.display = 'inline';
  } else if (s.p1Start) {
    p1d.textContent = `${fmt(s.p1Start)} → clique no dia final`;
    p1c.style.display = 'inline';
  } else {
    p1d.textContent = 'Clique em um dia para iniciar'; p1c.style.display = 'none';
  }
  if (s.p2Start && s.p2End) {
    p2d.textContent = `${fmt(s.p2Start)} → ${fmt(s.p2End)}  (${diffDias(s.p2Start,s.p2End)} dias)`;
    p2c.style.display = 'inline';
  } else if (s.p2Start) {
    p2d.textContent = `${fmt(s.p2Start)} → clique no dia final`; p2c.style.display = 'inline';
  } else {
    p2d.textContent = '—'; p2c.style.display = 'none';
  }
  btn.style.display = (s.p1Start && s.p1End) ? 'inline-block' : 'none';
}

function calLimparP1() { calState.p1Start=calState.p1End=null; calState.selecting='p1'; updateSelDisplay(); refreshHighlights(); }
function calLimparP2() { calState.p2Start=calState.p2End=null; calState.selecting=calState.p1End?'p2':'p1'; updateSelDisplay(); refreshHighlights(); }

async function calConfirmar() {
  const s = calState;
  if (!s.p1Start || !s.p1End) return;
  fecharCalendario();
  await App.ferias.openModal(null, null, {
    ini1: s.p1Start, fim1: s.p1End,
    ini2: s.p2Start, fim2: s.p2End,
    tecnicoId: s.tecnicoId,
  });
}

// ── Período de avaliação disponível ──────────────────────
function getAvailablePeriodos() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const result = new Set();
  if (month >= 1 && month <= 6) {
    result.add(`${year}-S1`);            // semestre vigente
    if (month <= 3) result.add(`${year-1}-S2`); // grace 3 meses pós-S2
  } else {
    result.add(`${year}-S2`);            // semestre vigente
    if (month <= 9) result.add(`${year}-S1`);   // grace 3 meses pós-S1
  }
  return [...result].sort().reverse();   // mais recente primeiro
}

// ── Team Calendar Builder ─────────────────────────────────
function buildTeamMonth(year, month, monthName, vmap, todayStr) {
  const BASE_PAIR = { 'Base 1':'Base 2','Base 2':'Base 1','Base 3':'Base 4','Base 4':'Base 3' };
  const CELL_CLS  = { 'Base 1':'tcv-b1','Base 2':'tcv-b2','Base 3':'tcv-b3','Base 4':'tcv-b4' };
  const DOT_CLS   = { 'Base 1':'td-b1', 'Base 2':'td-b2', 'Base 3':'td-b3', 'Base 4':'td-b4'  };
  const DOW_HDR   = ['D','S','T','Q','Q','S','S'];

  const firstDow  = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();

  const headers = DOW_HDR.map(d => `<div class="cal-wh">${d}</div>`).join('');
  let days = '';
  for (let i = 0; i < firstDow; i++) days += '<div class="tcal-day empty"></div>';

  for (let d = 1; d <= daysInMon; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const vacs    = vmap[dateStr] || [];

    // Conflict: técnicos from paired bases both on vacation
    const bases = [...new Set(vacs.map(v => v.base))];
    const hasConflict = bases.length > 1 && bases.some(b => bases.includes(BASE_PAIR[b]));

    // Determine cell background class
    let cellCls = '';
    if (hasConflict) {
      cellCls = 'tcv-conflict';
    } else if (bases.length > 1) {
      cellCls = 'tcv-multi';               // multiple bases, no conflict
    } else if (bases.length === 1) {
      cellCls = CELL_CLS[bases[0]] || '';  // single base color
    }

    // Marker dots (one per vacation entry, max shown)
    const dots = vacs.slice(0, 6).map(v => {
      const dc = hasConflict ? 'td-conflict' : (DOT_CLS[v.base] || '');
      return `<span class="tcal-dot ${dc}" title="${v.nome}"></span>`;
    }).join('');
    const markers = vacs.length ? `<div class="tcal-markers">${dots}</div>` : '';

    // Tooltip
    const tip = vacs.map(v => `${v.nome} (${BASE_NAMES[v.base]||v.base})`).join(' | ').replace(/"/g,'&quot;');

    days += `<div class="tcal-day ${cellCls}${isToday?' today':''}"${tip?` title="${tip}`+'"':''}>
      <span class="tcal-day-num">${d}</span>${markers}
    </div>`;
  }

  return `<div class="cal-month">
    <div class="cal-month-title">${monthName} ${year}</div>
    <div class="cal-week-header">${headers}</div>
    <div class="tcal-days-grid">${days}</div>
  </div>`;
}

// ── Base Names ────────────────────────────────────────────
let BASE_NAMES = { 'Base 1':'BAS','Base 2':'JBO','Base 3':'CVN','Base 4':'SMP' };

function applyBaseNames() {
  const pairs = [
    ['sol-b1-opt','Base 1'],['sol-b2-opt','Base 2'],['sol-b3-opt','Base 3'],['sol-b4-opt','Base 4'],
    ['f-b1-opt','Base 1'],  ['f-b2-opt','Base 2'],  ['f-b3-opt','Base 3'],  ['f-b4-opt','Base 4'],
    ['av-b1-opt','Base 1'], ['av-b2-opt','Base 2'], ['av-b3-opt','Base 3'], ['av-b4-opt','Base 4'],
    ['m-b1','Base 1'],      ['m-b2','Base 2'],      ['m-b3','Base 3'],      ['m-b4','Base 4'],
  ];
  pairs.forEach(([id, key]) => {
    const el = document.getElementById(id); if (el) el.textContent = BASE_NAMES[key] || key;
  });
}

// ── App Modules ───────────────────────────────────────────
const App = {

  // ── Config ────────────────────────────────────────────────
  config: {
    async load() {
      try {
        const cfg = await api('GET', '/api/config');
        if (cfg?.bases) { Object.assign(BASE_NAMES, cfg.bases); applyBaseNames(); }
      } catch(e) {}
    },
    openPage() {
      document.getElementById('cfg-b1').value = BASE_NAMES['Base 1'] || 'BAS';
      document.getElementById('cfg-b2').value = BASE_NAMES['Base 2'] || 'JBO';
      document.getElementById('cfg-b3').value = BASE_NAMES['Base 3'] || 'CVN';
      document.getElementById('cfg-b4').value = BASE_NAMES['Base 4'] || 'SMP';
    },
    async salvar(e) {
      e.preventDefault();
      const bases = {
        'Base 1': document.getElementById('cfg-b1').value.trim() || 'BAS',
        'Base 2': document.getElementById('cfg-b2').value.trim() || 'JBO',
        'Base 3': document.getElementById('cfg-b3').value.trim() || 'CVN',
        'Base 4': document.getElementById('cfg-b4').value.trim() || 'SMP',
      };
      try {
        await api('PUT', '/api/config/bases', { bases });
        Object.assign(BASE_NAMES, bases); applyBaseNames();
        toast('Nomes das bases atualizados!');
      } catch(ex) { alert(ex.message); }
    }
  },

  // ── Registros (admin) ─────────────────────────────────────
  registros: {
    data: [],
    async loadBadge() {
      try {
        const data = await api('GET', '/api/registros');
        const n = (data||[]).filter(r=>r.status==='pendente').length;
        const b = document.getElementById('badge-reg');
        if (b) { b.textContent=n; b.style.display=n?'inline-block':'none'; }
      } catch(e) {}
    },
    async render() {
      try {
        this.data = await api('GET', '/api/registros');
        const pend = this.data.filter(r=>r.status==='pendente').length;
        const b = document.getElementById('badge-reg');
        if (b) { b.textContent=pend; b.style.display=pend?'inline-block':'none'; }
        document.getElementById('tbody-reg').innerHTML = this.data.length
          ? this.data.map(r=>`<tr>
              <td><strong>${r.nome}</strong></td><td>${r.email}</td>
              <td>${BASE_NAMES[r.base]||r.base}</td>
              <td><span class="badge b-blue">${r.escala}</span></td>
              <td>${r.turno}</td><td>${fmt(r.admissao)}</td>
              <td><span class="badge ${r.status==='pendente'?'b-orange':r.status==='aprovado'?'b-green':'b-red'}">${r.status}</span></td>
              <td>${r.status==='pendente'
                ?`<button class="btn-tbl-ok" onclick="App.registros.aprovar(${r.id})">Aprovar</button>
                  <button class="btn-tbl-del" onclick="App.registros.rejeitar(${r.id})" style="margin-left:4px">Rejeitar</button>`
                :'—'}</td>
            </tr>`).join('')
          : '<tr><td colspan="8" class="empty">Nenhuma solicitação</td></tr>';
      } catch(e) { toast('Erro ao carregar solicitações'); }
    },
    async aprovar(id) {
      try { await api('POST',`/api/registros/${id}/aprovar`); this.render(); toast('Cadastro aprovado!'); }
      catch(ex) { alert(ex.message); }
    },
    async rejeitar(id) {
      if (!confirm('Rejeitar esta solicitação?')) return;
      try { await api('POST',`/api/registros/${id}/rejeitar`); this.render(); toast('Solicitação rejeitada.'); }
      catch(ex) { alert(ex.message); }
    }
  },

  // ── Dashboard ──────────────────────────────────────────
  dashboard: {
    async load() {
      try {
        if (ME?.role !== 'admin') { await this.loadPessoal(); return; }
        const d = await api('GET', '/api/dashboard');
        const hoje = today();

        // Títulos admin
        document.getElementById('dash-bases-title').textContent      = 'Disponibilidade por Base';
        document.getElementById('dash-alertas-title').textContent    = 'Alertas';
        document.getElementById('dash-avaliacoes-title').textContent = 'Desempenho por Base';

        // ── KPI Cards ──
        const totalDisp = d.baseStats.reduce((s,b)=>s+b.disponiveis,0);
        const dispPct   = d.totalTecnicos ? Math.round(totalDisp/d.totalTecnicos*100) : 0;
        document.getElementById('stats-grid').className = 'kpi-grid';
        document.getElementById('stats-grid').innerHTML = `
          <div class="kpi-card kpi-blue">
            <div class="kpi-top"><span class="kpi-label">Total de Técnicos</span><span class="kpi-icon">◈</span></div>
            <div class="kpi-val">${d.totalTecnicos}</div>
            <div class="kpi-sub">${d.baseStats.map(b=>`${BASE_NAMES[b.base]||b.base}: ${b.total}`).join(' · ')}</div>
          </div>
          <div class="kpi-card kpi-green">
            <div class="kpi-top"><span class="kpi-label">Disponíveis Hoje</span><span class="kpi-icon">✓</span></div>
            <div class="kpi-val">${totalDisp}</div>
            <div class="kpi-sub"><span class="kpi-accent">${dispPct}%</span> da equipe presente</div>
          </div>
          <div class="kpi-card kpi-orange">
            <div class="kpi-top"><span class="kpi-label">Em Férias Hoje</span><span class="kpi-icon">◷</span></div>
            <div class="kpi-val">${d.emFeriasHoje}</div>
            <div class="kpi-sub">técnico(s) ausente(s)</div>
          </div>
          <div class="kpi-card kpi-red">
            <div class="kpi-top"><span class="kpi-label">Per. Aquisitivo Vencendo</span><span class="kpi-icon">⚠</span></div>
            <div class="kpi-val">${d.vencendo}</div>
            <div class="kpi-sub">nos próximos 30 dias</div>
          </div>`;

        // ── Base cards (2×2 grid com avatares) ──
        const BASE_CLS = { 'Base 1':'bsc-b1','Base 2':'bsc-b2','Base 3':'bsc-b3','Base 4':'bsc-b4' };
        const AV_CLS   = { 'Base 1':'av-b1', 'Base 2':'av-b2', 'Base 3':'av-b3', 'Base 4':'av-b4'  };
        const initials = nome => nome.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
        document.getElementById('dash-bases').innerHTML = `<div class="base-cards-grid">` +
          d.baseStats.map(b => {
            const cls  = BASE_CLS[b.base] || '';
            const avcls= AV_CLS[b.base] || '';
            const pct  = b.pct;
            const pctColor = pct>=75?'':pct>=50?'':'' ;
            const avatars = (b.tecnicos||[]).length
              ? (b.tecnicos).map(t =>
                  `<span class="bsc-avatar ${avcls}${t.emFerias?' em-ferias':''}" title="${t.nome}${t.emFerias?' (em férias)':''}">${initials(t.nome)}</span>`
                ).join('')
              : `<span class="bsc-empty">Sem técnicos</span>`;
            return `<div class="base-stat-card ${cls}">
              <div class="bsc-header">
                <span class="bsc-name">${BASE_NAMES[b.base]||b.base}</span>
                <span class="bsc-pct">${b.total ? pct+'%' : '—'}</span>
              </div>
              <div class="bsc-count">${b.disponiveis} de ${b.total} disponíveis hoje</div>
              <div class="bsc-bar"><div class="bsc-fill" style="width:${pct}%"></div></div>
              <div class="bsc-team">${avatars}</div>
            </div>`;
          }).join('') + `</div>`;

        // ── Alertas ──
        let alertHtml = '';
        if (d.pendentes > 0) {
          alertHtml += `<div class="alert-card ac-orange">
            <span class="alert-card-icon">📋</span>
            <div class="alert-card-body">
              <div class="alert-card-title">${d.pendentes} solicitação(ões) de cadastro pendente(s)</div>
              <div class="alert-card-sub"><a href="#" onclick="navigate('registros')" style="color:var(--orange)">Ver solicitações →</a></div>
            </div></div>`;
        }
        d.alertas.forEach(a => {
          const dias = Math.max(0, Math.round((new Date(a.fim_aquisitivo)-new Date(hoje))/86400000));
          alertHtml += `<div class="alert-card ${dias<=7?'ac-red':'ac-orange'}">
            <span class="alert-card-icon">${dias<=7?'🔴':'🟠'}</span>
            <div class="alert-card-body">
              <div class="alert-card-title">${a.nome}</div>
              <div class="alert-card-sub">Per. aquisitivo vence em <strong>${dias} dia(s)</strong> — ${fmt(a.fim_aquisitivo)}</div>
            </div></div>`;
        });
        d.feriasBreve.forEach(f => {
          alertHtml += `<div class="alert-card ac-blue">
            <span class="alert-card-icon">✈️</span>
            <div class="alert-card-body">
              <div class="alert-card-title">${f.nome} <span style="font-size:11px;color:var(--text-dim)">(${BASE_NAMES[f.base]||f.base})</span></div>
              <div class="alert-card-sub">Férias iniciam em ${fmt(f.inicio_p1)}</div>
            </div></div>`;
        });
        document.getElementById('dash-alertas').innerHTML = alertHtml || '<div class="empty">Sem alertas no momento</div>';

        // ── 14-day strip ──
        const stripWrap = document.getElementById('dash-strip-wrap');
        const stripEl   = document.getElementById('dash-strip');
        if (stripWrap) stripWrap.style.display = '';
        if (stripEl && d.strip14) {
          const BASE_SC = { 'Base 1':'sv-b1','Base 2':'sv-b2','Base 3':'sv-b3','Base 4':'sv-b4' };
          stripEl.innerHTML = `<div class="strip-days">` + d.strip14.map(day => {
            const isToday = day.date === hoje;
            const pills = day.vacations.length
              ? day.vacations.map(v => {
                  const nm = v.nome.split(' ')[0];
                  return `<span class="strip-vac-pill ${BASE_SC[v.base]||''}" title="${v.nome}">${nm}</span>`;
                }).join('')
              : `<span class="strip-day-free">livre</span>`;
            return `<div class="strip-day${isToday?' today':''}">
              <div class="strip-day-dow">${day.dow}</div>
              <div class="strip-day-num">${+day.date.split('-')[2]}</div>
              <div class="strip-day-vacs">${pills}</div>
            </div>`;
          }).join('') + `</div>`;
        }

        // ── Avaliações por base ──
        document.getElementById('dash-avaliacoes').innerHTML = `<div class="eval-sum-grid">` +
          d.baseStats.map(b => {
            const nome = BASE_NAMES[b.base]||b.base;
            const cls  = BASE_CLS[b.base]||'';
            const c    = b.media ? conceito(b.media) : null;
            return `<div class="eval-sum-card">
              <div class="esc-base ${cls.replace('bsc-','esc-')}">${nome}</div>
              <div class="esc-count">${b.total} técnico(s)</div>
              ${b.media
                ? `<div class="esc-nota">${b.media.toFixed(2)}</div><span class="badge ${c.c}">${c.t}</span>`
                : `<div style="color:var(--text-dim);font-size:12px;padding:8px 0">Sem avaliações</div>`}
            </div>`;
          }).join('') + `</div>`;
      } catch(e) { console.error(e); }
    },

    // ── Dashboard pessoal para técnico ────────────────────
    async loadPessoal() {
      const d = await api('GET', '/api/dashboard/me');
      const { tecnico: tec, ferias, avaliacoes, media } = d;

      // Títulos adaptados
      document.getElementById('dash-bases-title').textContent      = 'Minhas Férias Agendadas';
      document.getElementById('dash-alertas-title').textContent    = 'Meus Alertas';
      document.getElementById('dash-avaliacoes-title').textContent = 'Minhas Avaliações';

      document.getElementById('stats-grid').className = 'kpi-grid';

      if (!tec) {
        document.getElementById('stats-grid').innerHTML = `
          <div class="kpi-card kpi-orange" style="grid-column:1/-1">
            <div class="kpi-top"><span class="kpi-label">Vínculo Pendente</span><span class="kpi-icon">⚠</span></div>
            <div class="kpi-val" style="font-size:18px;font-weight:400">Seu usuário ainda não está vinculado a um técnico.</div>
            <div class="kpi-sub">Contate o supervisor para vincular seu e-mail ao cadastro de técnico.</div>
          </div>`;
        ['dash-bases','dash-alertas','dash-avaliacoes'].forEach(id =>
          document.getElementById(id).innerHTML = '<div class="empty">—</div>');
        return;
      }

      const hoje      = today();
      const diasFimAq = tec.fim_aquisitivo ? Math.max(0, Math.round((new Date(tec.fim_aquisitivo)-new Date(hoje))/86400000)) : null;
      const c         = media ? conceito(media) : null;
      const initials  = nome => nome.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
      const BASE_CLS  = { 'Base 1':'bsc-b1','Base 2':'bsc-b2','Base 3':'bsc-b3','Base 4':'bsc-b4' };
      const AV_CLS    = { 'Base 1':'av-b1', 'Base 2':'av-b2', 'Base 3':'av-b3', 'Base 4':'av-b4'  };
      const avatarCls = AV_CLS[tec.base] || '';

      // Profile card (injected before stats-grid via welcome-card area)
      // We reuse the stats-grid for KPIs
      document.getElementById('stats-grid').innerHTML = `
        <div class="kpi-card kpi-blue">
          <div class="kpi-top"><span class="kpi-label">Minha Base</span><span class="kpi-icon">◈</span></div>
          <div class="kpi-val" style="font-size:28px">${BASE_NAMES[tec.base]||tec.base}</div>
          <div class="kpi-sub">Escala <strong>${tec.escala}</strong> · ${tec.turno}</div>
        </div>
        <div class="kpi-card ${diasFimAq!==null&&diasFimAq<=30?'kpi-red':diasFimAq!==null&&diasFimAq<=60?'kpi-orange':'kpi-blue'}">
          <div class="kpi-top"><span class="kpi-label">Período Aquisitivo</span><span class="kpi-icon">◷</span></div>
          <div class="kpi-val" style="font-size:22px">${diasFimAq !== null ? diasFimAq+'d' : '—'}</div>
          <div class="kpi-sub">Vence em ${fmt(tec.fim_aquisitivo)}</div>
        </div>
        <div class="kpi-card ${ferias.length?'kpi-green':'kpi-orange'}">
          <div class="kpi-top"><span class="kpi-label">Férias Agendadas</span><span class="kpi-icon">✈</span></div>
          <div class="kpi-val">${ferias.length}</div>
          <div class="kpi-sub">${ferias.length?'período(s) programado(s)':'Nenhuma férias agendada'}</div>
        </div>
        <div class="kpi-card ${c?'kpi-green':'kpi-blue'}">
          <div class="kpi-top"><span class="kpi-label">Média Avaliações</span><span class="kpi-icon">★</span></div>
          <div class="kpi-val">${media?media.toFixed(2):'—'}</div>
          <div class="kpi-sub">${c?`<span class="badge ${c.c}">${c.t}</span>`:'Sem avaliações liberadas'}</div>
        </div>`;

      // Férias
      const sc = {aprovado:'b-green',pendente:'b-orange',rejeitado:'b-red'};
      if (ferias.length) {
        document.getElementById('dash-bases').innerHTML = ferias.map(f => {
          const d1 = diffDias(f.inicio_p1,f.fim_p1), d2 = f.inicio_p2?diffDias(f.inicio_p2,f.fim_p2):0;
          const tot = d1+d2+(f.abono_pecuniario?10:0);
          const emCurso = hoje>=f.inicio_p1 && hoje<=(f.fim_p2||f.fim_p1);
          return `<div class="alert-card ${emCurso?'ac-blue':'ac-orange'}">
            <span class="alert-card-icon">${emCurso?'✈️':'📅'}</span>
            <div class="alert-card-body">
              <div class="alert-card-title">P1: ${fmt(f.inicio_p1)} → ${fmt(f.fim_p1)} ${f.inicio_p2?`&nbsp;|&nbsp; P2: ${fmt(f.inicio_p2)} → ${fmt(f.fim_p2)}`:''}</div>
              <div class="alert-card-sub">${tot} dias${f.abono_pecuniario?' + abono pecuniário':''} &nbsp;
                <span class="badge ${sc[f.status]}" style="font-size:10px">${f.status}</span>
                ${emCurso?'<span class="badge b-green" style="font-size:10px;margin-left:4px">Em curso</span>':''}
              </div>
            </div></div>`;
        }).join('');
      } else {
        document.getElementById('dash-bases').innerHTML = `<div class="empty">Nenhuma férias agendada.
          <a href="#" onclick="abrirCalendario()" style="color:var(--orange);margin-left:8px;font-size:12px">Solicitar agora →</a></div>`;
      }

      // Alertas pessoais
      let alertHtml = '';
      if (diasFimAq !== null && diasFimAq <= 60) {
        alertHtml += `<div class="alert-card ${diasFimAq<=7?'ac-red':'ac-orange'}">
          <span class="alert-card-icon">${diasFimAq<=7?'🔴':'🟠'}</span>
          <div class="alert-card-body">
            <div class="alert-card-title">Período aquisitivo vence em ${diasFimAq} dia(s)</div>
            <div class="alert-card-sub">${fmt(tec.inicio_aquisitivo)} → ${fmt(tec.fim_aquisitivo)}
              &nbsp; <a href="#" onclick="abrirCalendario()" style="color:var(--orange);font-size:11px">Solicitar férias →</a>
            </div>
          </div></div>`;
      }
      if (!ferias.length) {
        alertHtml += `<div class="alert-card ac-blue">
          <span class="alert-card-icon">ℹ️</span>
          <div class="alert-card-body">
            <div class="alert-card-title">Nenhuma férias agendada</div>
            <div class="alert-card-sub"><a href="#" onclick="abrirCalendario()" style="color:var(--orange)">Agendar férias →</a></div>
          </div></div>`;
      }
      document.getElementById('dash-alertas').innerHTML = alertHtml || '<div class="empty">Sem alertas</div>';

      // Avaliações
      if (avaliacoes.length) {
        const mediaHtml = media ? `
          <div class="alert-card ac-blue" style="margin-top:10px">
            <span class="alert-card-icon">📊</span>
            <div class="alert-card-body">
              <div class="alert-card-title">Média (últimas ${avaliacoes.length} avaliações): <strong>${media.toFixed(2)}</strong></div>
              <div class="alert-card-sub"><span class="badge ${conceito(media).c}">${conceito(media).t}</span></div>
            </div></div>` : '';
        document.getElementById('dash-avaliacoes').innerHTML =
          avaliacoes.map(a => {
            const c2 = conceito(a.nota_final);
            return `<div class="alert-card">
              <span class="alert-card-icon">${a.tipo==='autoavaliacao'?'📝':'👤'}</span>
              <div class="alert-card-body">
                <div class="alert-card-title">${a.periodo} — ${a.tipo==='autoavaliacao'?'Autoavaliação':'Avaliação Supervisor'}</div>
                <div class="alert-card-sub">Nota: <strong>${a.nota_final.toFixed(2)}</strong> &nbsp; <span class="badge ${c2.c}">${c2.t}</span></div>
              </div></div>`;
          }).join('') + mediaHtml;
      } else {
        document.getElementById('dash-avaliacoes').innerHTML = `<div class="empty">Nenhuma avaliação disponível.
          <a href="#" onclick="navigate('avaliacao')" style="color:var(--orange);margin-left:8px;font-size:12px">Realizar autoavaliação →</a></div>`;
      }
    }
  },

  // ── Técnicos ────────────────────────────────────────────
  cadastro: {
    data: [],
    async render(q='') {
      try {
        this.data = await api('GET', '/api/tecnicos');
        const hoje=today(), em30=addDays(hoje,30);
        const lista = q ? this.data.filter(t=>t.nome.toLowerCase().includes(q.toLowerCase())||t.base.toLowerCase().includes(q.toLowerCase())) : this.data;
        document.getElementById('tbody-tec').innerHTML = lista.length ? lista.map((t,i)=>{
          const nome = BASE_NAMES[t.base]||t.base;
          const venc = t.fim_aquisitivo && t.fim_aquisitivo < hoje;
          const vndo = t.fim_aquisitivo && t.fim_aquisitivo >= hoje && t.fim_aquisitivo <= em30;
          const badge= venc?'<span class="badge b-red" style="margin-left:6px">Vencido</span>':vndo?'<span class="badge b-orange" style="margin-left:6px">Vencendo</span>':'';
          // Vínculo badge
          let vincBadge;
          if (t.user_vinculado) {
            vincBadge = `<span class="badge-vinculo bv-ok" title="Conta: ${t.user_vinculado.nome}">✓ ${t.user_vinculado.nome}</span>`;
          } else if (t.email) {
            vincBadge = `<span class="badge-vinculo bv-warn" title="E-mail ${t.email} não possui conta">⚠ Sem conta</span>`;
          } else {
            vincBadge = `<span class="badge-vinculo bv-none">— Sem e-mail</span>`;
          }
          return `<tr>
            <td>${i+1}</td><td><strong>${t.nome}</strong></td><td>${nome}</td>
            <td><span class="badge b-blue">${t.escala}</span></td><td>${t.turno}</td>
            <td>${fmt(t.admissao)}</td><td>${fmt(t.fim_aquisitivo)}${badge}</td>
            <td>${vincBadge}</td>
            <td><button class="btn-tbl-edit" onclick="App.cadastro.openModal(${t.id})">Editar</button>
                <button class="btn-tbl-del"  onclick="App.cadastro.remove(${t.id})">Excluir</button></td>
          </tr>`;
        }).join('') : '<tr><td colspan="9" class="empty">Nenhum técnico cadastrado</td></tr>';
      } catch(e) { toast('Erro ao carregar técnicos'); }
    },
    async openModal(id=null) {
      document.getElementById('m-tec').querySelectorAll('input,select').forEach(el=>{if(el.type!=='hidden')el.value='';});
      document.getElementById('tec-id').value='';
      document.getElementById('m-tec-title').textContent = id ? 'Editar Técnico' : 'Novo Técnico';

      // Carrega usuários disponíveis para o picker de vínculo
      const statusDiv  = document.getElementById('tec-vinculo-status');
      const pickerPanel= document.getElementById('tec-usr-picker');
      const usrSel     = document.getElementById('tec-usr-sel');
      if (pickerPanel) pickerPanel.style.display = 'none';
      if (statusDiv)   statusDiv.innerHTML = '<span class="vs-none">Nenhum vínculo</span>';

      try {
        const disponiveis = await api('GET', '/api/users-disponiveis');
        if (usrSel) {
          usrSel.innerHTML = '<option value="">— Selecione um usuário —</option>' +
            disponiveis.map(u =>
              `<option value="${u.email}" ${u.jaVinculado?'disabled style="color:#888"':''}>${u.nome} &lt;${u.email}&gt;${u.jaVinculado?' (já vinculado)':''}</option>`
            ).join('');
        }
      } catch(e) { if (usrSel) usrSel.innerHTML = '<option value="">Erro ao carregar usuários</option>'; }

      if (id) {
        const t=this.data.find(x=>x.id===id); if(!t) return;
        document.getElementById('tec-id').value=t.id; document.getElementById('tec-nome').value=t.nome;
        document.getElementById('tec-base').value=t.base; document.getElementById('tec-escala').value=t.escala;
        document.getElementById('tec-turno').value=t.turno; document.getElementById('tec-admissao').value=t.admissao;
        document.getElementById('tec-email').value=t.email||''; document.getElementById('tec-ini-aq').value=t.inicio_aquisitivo||'';
        document.getElementById('tec-fim-aq').value=t.fim_aquisitivo||'';

        // Mostra status do vínculo atual
        if (statusDiv) {
          if (t.user_vinculado) {
            statusDiv.innerHTML = `<span class="vs-ok">✓ Vinculado a <strong>${t.user_vinculado.nome}</strong> (${t.email})</span>`;
          } else if (t.email) {
            statusDiv.innerHTML = `<span class="vs-warn">⚠ E-mail <strong>${t.email}</strong> não possui conta de acesso</span>`;
          } else {
            statusDiv.innerHTML = `<span class="vs-none">Nenhum vínculo — informe um e-mail ou busque um usuário</span>`;
          }
        }
        // Pré-seleciona no picker o e-mail atual (se existir)
        if (usrSel && t.email) {
          const opt = usrSel.querySelector(`option[value="${t.email}"]`);
          if (opt) usrSel.value = t.email;
        }
      }
      document.getElementById('m-tec').classList.add('open');
    },

    // Toggle do painel de busca de usuário
    selecionarUsuario() {
      const panel = document.getElementById('tec-usr-picker');
      if (!panel) return;
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    },

    // Confirma o usuário selecionado no picker
    confirmarUsuario() {
      const usrSel = document.getElementById('tec-usr-sel');
      if (!usrSel || !usrSel.value) { alert('Selecione um usuário.'); return; }
      const email    = usrSel.value;
      const nomeSel  = usrSel.options[usrSel.selectedIndex]?.text?.split(' <')[0] || '';
      // Copia e-mail para o campo de e-mail do técnico
      const emailFld = document.getElementById('tec-email');
      if (emailFld) emailFld.value = email;
      // Atualiza status
      const statusDiv = document.getElementById('tec-vinculo-status');
      if (statusDiv) statusDiv.innerHTML = `<span class="vs-ok">✓ Será vinculado a <strong>${nomeSel}</strong> (${email})</span>`;
      // Fecha o picker
      const panel = document.getElementById('tec-usr-picker');
      if (panel) panel.style.display = 'none';
    },

    async save(e) {
      e.preventDefault();
      const id=document.getElementById('tec-id').value;
      const body={nome:document.getElementById('tec-nome').value,base:document.getElementById('tec-base').value,escala:document.getElementById('tec-escala').value,turno:document.getElementById('tec-turno').value,admissao:document.getElementById('tec-admissao').value,email:document.getElementById('tec-email').value,inicio_aquisitivo:document.getElementById('tec-ini-aq').value,fim_aquisitivo:document.getElementById('tec-fim-aq').value};
      try {
        if(id) await api('PUT',`/api/tecnicos/${id}`,body); else await api('POST','/api/tecnicos',body);
        closeModal('m-tec'); this.render(); toast(id?'Técnico atualizado!':'Técnico cadastrado!');
      } catch(ex) { alert(ex.message); }
    },
    async remove(id) {
      if(!confirm('Excluir este técnico?')) return;
      try { await api('DELETE',`/api/tecnicos/${id}`); this.render(); toast('Técnico removido.'); }
      catch(ex) { alert(ex.message); }
    }
  },

  // ── Férias ──────────────────────────────────────────────
  ferias: {
    data: [], tecs: [], viewMode: 'table',

    setView(mode) {
      this.viewMode = mode;
      // Update toggle button states
      document.getElementById('btn-view-table')?.classList.toggle('active', mode === 'table');
      document.getElementById('btn-view-cal')?.classList.toggle('active',   mode === 'calendar');
      // Show/hide containers
      const tw = document.getElementById('ferias-table-wrap');
      const cv = document.getElementById('ferias-cal-view');
      const fr = document.getElementById('ferias-filter-row');
      if (mode === 'calendar') {
        if (tw) tw.style.display = 'none';
        if (fr) fr.style.display = 'none';
        if (cv) { cv.style.display = ''; this.renderCalView(); }
      } else {
        if (tw) tw.style.display = '';
        if (fr) fr.style.display = '';
        if (cv) cv.style.display = 'none';
      }
    },

    async render() {
      try {
        [this.data,this.tecs]=await Promise.all([api('GET','/api/ferias'),api('GET','/api/tecnicos')]);

        // Sync toggle buttons
        document.getElementById('btn-view-table')?.classList.toggle('active', this.viewMode === 'table');
        document.getElementById('btn-view-cal')?.classList.toggle('active',   this.viewMode === 'calendar');

        if (this.viewMode === 'calendar' && ME?.role === 'admin') {
          document.getElementById('ferias-table-wrap').style.display = 'none';
          document.getElementById('ferias-filter-row').style.display = 'none';
          document.getElementById('ferias-cal-view').style.display = '';
          this.renderCalView();
          return;
        }
        // Table view
        document.getElementById('ferias-table-wrap').style.display = '';
        document.getElementById('ferias-filter-row').style.display = '';
        document.getElementById('ferias-cal-view').style.display   = 'none';

        const filtB=document.getElementById('f-base').value;
        const filtS=document.getElementById('f-status').value;
        let lista=this.data;
        if(filtB) lista=lista.filter(f=>f.tecnico_base===filtB);
        if(filtS) lista=lista.filter(f=>f.status===filtS);
        const sc={aprovado:'b-green',pendente:'b-orange',rejeitado:'b-red'};
        document.getElementById('tbody-fer').innerHTML=lista.length?lista.map(f=>{
          const nome=BASE_NAMES[f.tecnico_base]||f.tecnico_base;
          const dias1=diffDias(f.inicio_p1,f.fim_p1);
          const dias2=diffDias(f.inicio_p2,f.fim_p2);
          const total=dias1+dias2+(f.abono_pecuniario?10:0);
          const abonoTag=f.abono_pecuniario?'<span class="badge b-orange" style="margin-left:4px;font-size:10px">Abono</span>':'';
          const aprBtn=f.status==='pendente'&&ME?.role==='admin'?`<button class="btn-tbl-ok" onclick="App.ferias.aprovar(${f.id})">Aprovar</button> `:'';
          const editBtn=ME?.role==='admin'?`<button class="btn-tbl-edit" onclick="App.ferias.openModal(${f.id})">Editar</button> `:'';
          const delBtn=ME?.role==='admin'?`<button class="btn-tbl-del" onclick="App.ferias.remove(${f.id})">Excluir</button>`:'';
          return `<tr>
            <td><strong>${f.tecnico_nome}</strong></td><td>${nome}</td>
            <td>${fmt(f.inicio_p1)}</td><td>${fmt(f.fim_p1)}</td>
            <td>${f.inicio_p2?fmt(f.inicio_p2):'—'}</td><td>${f.fim_p2?fmt(f.fim_p2):'—'}</td>
            <td><strong>${total}</strong>${abonoTag}</td>
            <td><span class="badge ${sc[f.status]}">${f.status}</span></td>
            <td>${aprBtn}${editBtn}${delBtn}</td>
          </tr>`;
        }).join(''):'<tr><td colspan="9" class="empty">Nenhum registro</td></tr>';
      } catch(e) { toast('Erro ao carregar férias'); }
    },

    renderCalView() {
      const container = document.getElementById('ferias-cal-view');
      if (!container) return;

      // Build vacation map (approved + pending, not rejected)
      const active = this.data.filter(f => f.status !== 'rejeitado');
      const vmap = {};
      const mark = (start, end, base, nome, status) => {
        if (!start || !end) return;
        let cur = new Date(start + 'T12:00:00');
        const endD = new Date(end + 'T12:00:00');
        while (cur <= endD) {
          const k = cur.toISOString().split('T')[0];
          if (!vmap[k]) vmap[k] = [];
          vmap[k].push({ base, nome, status });
          cur.setDate(cur.getDate() + 1);
        }
      };
      active.forEach(f => {
        mark(f.inicio_p1, f.fim_p1, f.tecnico_base, f.tecnico_nome, f.status);
        if (f.inicio_p2) mark(f.inicio_p2, f.fim_p2, f.tecnico_base, f.tecnico_nome, f.status);
      });

      const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      const now      = new Date();
      const todayStr = today();

      // Legend
      const legend = `<div class="tcal-legend">
        <span class="tcal-leg-item"><span class="tcal-leg-swatch" style="background:#14532d60"></span>${BASE_NAMES['Base 1']||'BAS'} (Base 1)</span>
        <span class="tcal-leg-item"><span class="tcal-leg-swatch" style="background:#1e3a8a60"></span>${BASE_NAMES['Base 2']||'JBO'} (Base 2)</span>
        <span class="tcal-leg-item"><span class="tcal-leg-swatch" style="background:#581c8760"></span>${BASE_NAMES['Base 3']||'CVN'} (Base 3)</span>
        <span class="tcal-leg-item"><span class="tcal-leg-swatch" style="background:#7c2d1260"></span>${BASE_NAMES['Base 4']||'SMP'} (Base 4)</span>
        <span class="tcal-leg-item"><span class="tcal-leg-swatch" style="background:#1e3a5f60"></span>Múltiplas bases</span>
        <span class="tcal-leg-item"><span class="tcal-leg-swatch" style="background:#7f1d1d70;outline:1px solid #ef444455"></span>⚠ Conflito de par</span>
        <span class="tcal-leg-item" style="font-size:11px;color:var(--text-dim)">• Pares: ${BASE_NAMES['Base 1']||'BAS'}↔${BASE_NAMES['Base 2']||'JBO'} &nbsp; ${BASE_NAMES['Base 3']||'CVN'}↔${BASE_NAMES['Base 4']||'SMP'}</span>
      </div>`;

      let monthsHtml = '';
      for (let m = 0; m < 12; m++) {
        const yr  = now.getFullYear() + Math.floor((now.getMonth() + m) / 12);
        const mo  = (now.getMonth() + m) % 12;
        monthsHtml += buildTeamMonth(yr, mo, MONTHS[mo], vmap, todayStr);
      }

      container.innerHTML = legend + `<div class="tcal-grid">${monthsHtml}</div>`;
    },

    async aprovar(id) {
      const f=this.data.find(x=>x.id===id); if(!f) return;
      try { await api('PUT',`/api/ferias/${id}`,{...f,status:'aprovado'}); this.render(); toast('Férias aprovadas!'); }
      catch(ex) { alert(ex.message); }
    },

    // id     = id da férias para editar (null = nova)
    // tec    = objeto técnico pré-vinculado (para não-admin sem técnico cadastrado)
    // datas  = { ini1, fim1, ini2, fim2, tecnicoId } vindas do calendário
    async openModal(id=null, tec=null, datas=null) {
      // Carrega técnicos se necessário
      if (!this.tecs.length) this.tecs = await api('GET','/api/tecnicos').catch(()=>[]);
      const tecs = this.tecs;
      const isAdmin = ME?.role === 'admin';

      // Monta dropdown de técnicos
      const sel = document.getElementById('fer-tec');
      if (isAdmin) {
        sel.innerHTML='<option value="">Selecione...</option>'+
          tecs.map(t=>`<option value="${t.id}">${t.nome} — ${BASE_NAMES[t.base]||t.base}</option>`).join('');
        sel.disabled = false;
      } else {
        // Técnico: descobre o próprio registro
        let myTec = tec;
        if (!myTec) {
          try { const me=await api('GET','/api/auth/me'); myTec=me.tecnico; } catch(e){}
        }
        if (myTec) {
          sel.innerHTML=`<option value="${myTec.id}" selected>${myTec.nome} — ${BASE_NAMES[myTec.base]||myTec.base}</option>`;
          sel.disabled = true;
        } else {
          sel.innerHTML='<option value="">Nenhum técnico vinculado ao seu usuário</option>';
          sel.disabled = true;
        }
      }

      // Limpa campos
      document.getElementById('m-fer').querySelectorAll('input[type=date],input[type=number]').forEach(el=>el.value='');
      document.getElementById('fer-id').value='';
      const abonoCb = document.getElementById('fer-abono'); if(abonoCb) abonoCb.checked=false;
      const statusEl = document.getElementById('fer-status'); if(statusEl) statusEl.value='pendente';

      document.getElementById('m-fer-title').textContent = id ? 'Editar Férias' : 'Solicitar Férias';

      if (id) {
        // Edição de férias existente
        const f=this.data.find(x=>x.id===id); if(!f) return;
        document.getElementById('fer-id').value=f.id;
        if(isAdmin && !sel.disabled) sel.value=f.tecnico_id;
        document.getElementById('fer-ini1').value=f.inicio_p1||'';
        document.getElementById('fer-fim1').value=f.fim_p1||'';
        document.getElementById('fer-ini2').value=f.inicio_p2||'';
        document.getElementById('fer-fim2').value=f.fim_p2||'';
        if(abonoCb) abonoCb.checked=!!f.abono_pecuniario;
        if(statusEl) statusEl.value=f.status;
      } else if (datas) {
        // Pré-preenche datas vindas do calendário
        document.getElementById('fer-ini1').value=datas.ini1||'';
        document.getElementById('fer-fim1').value=datas.fim1||'';
        if(datas.ini2) document.getElementById('fer-ini2').value=datas.ini2;
        if(datas.fim2) document.getElementById('fer-fim2').value=datas.fim2;
        if(datas.tecnicoId && isAdmin) sel.value=datas.tecnicoId;
      }

      atualizarSecaoFerias();
      document.getElementById('m-fer').classList.add('open');
    },

    async save(e) {
      e.preventDefault();
      const id      = document.getElementById('fer-id').value;
      const ini1    = document.getElementById('fer-ini1').value;
      const fim1    = document.getElementById('fer-fim1').value;
      const ini2    = document.getElementById('fer-ini2')?.value||null;
      const fim2    = document.getElementById('fer-fim2')?.value||null;
      const abono   = document.getElementById('fer-abono')?.checked||false;
      const dias1   = diffDias(ini1, fim1);
      const total   = dias1 + (ini2&&fim2?diffDias(ini2,fim2):0) + (abono?10:0);

      if (total > 30) { alert(`Total de ${total} dias excede o limite de 30 dias de férias.`); return; }

      const body = {
        tecnico_id:       +document.getElementById('fer-tec').value,
        inicio_p1:        ini1, fim_p1: fim1,
        inicio_p2:        ini2, fim_p2: fim2,
        abono_pecuniario: abono,
        status:           document.getElementById('fer-status')?.value||'pendente',
      };
      if (!body.tecnico_id) { alert('Selecione o técnico.'); return; }
      try {
        if(id) await api('PUT',`/api/ferias/${id}`,body);
        else   await api('POST','/api/ferias',body);
        closeModal('m-fer'); this.render();
        toast(id?'Férias atualizadas!':'Solicitação de férias enviada!');
      } catch(ex) { alert(ex.message); }
    },

    async remove(id) {
      if(!confirm('Excluir registro?')) return;
      try { await api('DELETE',`/api/ferias/${id}`); this.render(); toast('Removido.'); }
      catch(ex) { alert(ex.message); }
    }
  },

  // ── Avaliação ────────────────────────────────────────────
  avaliacao: {
    data: [], tecs: [],

    async render() {
      try {
        [this.data, this.tecs] = await Promise.all([api('GET','/api/avaliacoes'), api('GET','/api/tecnicos')]);
        const isAdmin  = ME?.role === 'admin';
        const filtB    = document.getElementById('av-base').value;
        const filtP    = document.getElementById('av-periodo').value;
        const periodos = [...new Set(this.data.map(a=>a.periodo))].sort().reverse();
        const selP     = document.getElementById('av-periodo');
        const cur      = selP.value;
        selP.innerHTML = '<option value="">Todos os períodos</option>' + periodos.map(p=>`<option value="${p}" ${p===cur?'selected':''}>${p}</option>`).join('');
        let lista = this.data;
        if (filtB) lista = lista.filter(a=>a.tecnico_base===filtB);
        if (filtP) lista = lista.filter(a=>a.periodo===filtP);

        // Períodos com feedback (bloqueiam autoavaliação)
        const lockedKey = (a) => `${a.tecnico_id}_${a.periodo}`;
        const feedbackKeys = new Set(
          this.data.filter(a => a.tipo==='supervisor' && a.feedback_texto).map(lockedKey)
        );

        document.getElementById('tbody-av').innerHTML = lista.length ? lista.map(a => {
          const nome     = BASE_NAMES[a.tecnico_base]||a.tecnico_base;
          const c        = conceito(a.nota_final);
          const isLocked = a.tipo==='autoavaliacao' && feedbackKeys.has(lockedKey(a));

          // Tipo badge
          const tipo = a.tipo==='autoavaliacao'
            ? `<span class="badge-tipo bt-auto">Auto</span>${isLocked ? ' <span class="badge-tipo bt-lock" title="Bloqueada após feedback">🔒</span>' : ''}`
            : '<span class="badge-tipo bt-sup">Sup.</span>';

          // Status de liberação (supervisor eval)
          const lib = a.tipo==='supervisor'
            ? (a.liberado ? '<span class="badge-tipo bt-ok">✓ Liberado</span>' : '<span class="badge-tipo bt-lock">🔒 Não lib.</span>')
            : '';

          // Avaliação completa (auto + sup + feedback + liberado)
          const autoAv   = this.data.find(x => x.tipo==='autoavaliacao' && x.tecnico_id===a.tecnico_id && x.periodo===a.periodo);
          const supAv    = this.data.find(x => x.tipo==='supervisor'    && x.tecnico_id===a.tecnico_id && x.periodo===a.periodo);
          const completo = autoAv && supAv && supAv.feedback_texto && supAv.liberado;

          // Botões
          const fbBtn  = isAdmin && a.tipo==='supervisor'
            ? `<button class="btn-tbl-edit" onclick="App.avaliacao.openFeedback(${a.id})">Feedback</button> ` : '';
          const libBtn = isAdmin && a.tipo==='supervisor' && !a.liberado
            ? `<button class="btn-tbl-ok" onclick="App.avaliacao.liberar(${a.id})" style="margin-right:4px">Liberar</button>` : '';

          // PDF: "Completo" quando há auto+sup+feedback+liberado, senão PDF simples
          let pdfBtn = '';
          if (completo) {
            pdfBtn = `<button class="btn-ghost-sm" onclick="App.avaliacao.gerarPDF(${a.id})" style="padding:3px 8px;font-size:11px;background:#14532d40;border-color:#16a34a60;color:#4ade80" title="PDF com Auto + Supervisor + Feedback">📄 PDF Completo</button> `;
          } else if (isAdmin || a.liberado) {
            pdfBtn = `<button class="btn-ghost-sm" onclick="App.avaliacao.gerarPDF(${a.id})" style="padding:3px 10px;font-size:11px">PDF</button> `;
          }

          // Editar: técnico não edita se bloqueado
          const canEdit = isAdmin || (!isLocked && a.tipo==='autoavaliacao' && a.avaliador_id===ME?.id);
          const editBtn = canEdit
            ? `<button class="btn-tbl-edit" onclick="App.avaliacao.openModal(${a.id})">Editar</button> ` : '';
          const delBtn  = isAdmin
            ? `<button class="btn-tbl-del" onclick="App.avaliacao.remove(${a.id})">Excluir</button>` : '';

          return `<tr>
            <td><strong>${a.tecnico_nome}</strong></td><td>${nome}</td><td>${a.periodo}</td>
            <td>${a.nota_base.toFixed(2)}</td><td>${a.multiplicador.toFixed(2)}×</td>
            <td><strong style="font-size:15px">${a.nota_final.toFixed(2)}</strong></td>
            <td><span class="badge ${c.c}">${c.t}</span></td>
            <td>${tipo}${lib}</td>
            <td>${libBtn}${fbBtn}${pdfBtn}${editBtn}${delBtn}</td>
          </tr>`;
        }).join('') : '<tr><td colspan="9" class="empty">Nenhuma avaliação</td></tr>';
      } catch(e) { toast('Erro ao carregar avaliações'); }
    },

    preview() {
      const vals={}; ALL_FIELDS.forEach(f=>vals[f]=starVal(f));
      const baseOk=BASE_FIELDS.every(f=>vals[f]>0), orgOk=ORG_FIELDS.every(f=>vals[f]>0);
      if(!baseOk||!orgOk){['p-base','p-mult','p-final','p-conc'].forEach(id=>document.getElementById(id).textContent='—');document.getElementById('p-conc').className='';return;}
      const nb=calcNotaBase(vals),ml=calcMult(vals),nf=Math.round(nb*ml*100)/100,c=conceito(nf);
      document.getElementById('p-base').textContent=nb.toFixed(2);
      document.getElementById('p-mult').textContent=ml.toFixed(2)+'×';
      document.getElementById('p-final').textContent=nf.toFixed(2);
      const el=document.getElementById('p-conc'); el.textContent=c.t; el.className=`badge ${c.c}`;
    },

    async openModal(id=null) {
      const isAdmin = ME?.role === 'admin';
      const tecs    = this.tecs.length ? this.tecs : await api('GET','/api/tecnicos');
      // Apenas o(s) semestre(s) vigente(s) + até 3 meses de grace
      const PERIODOS = getAvailablePeriodos();

      // Técnico: verifica bloqueios antes de abrir
      if (!isAdmin && id) {
        const a = this.data.find(x => x.id === id);
        if (!a) return;
        if (a.tipo !== 'autoavaliacao' || a.avaliador_id !== ME.id) {
          alert('Você não pode editar esta avaliação.'); return;
        }
        // Bloqueado se supervisor já deu feedback neste período
        const supFeedback = this.data.find(x =>
          x.tipo === 'supervisor' && x.tecnico_id === a.tecnico_id &&
          x.periodo === a.periodo && x.feedback_texto
        );
        if (supFeedback) {
          alert('🔒 Autoavaliação bloqueada: o supervisor já registrou o feedback para este período.\nVocê pode visualizar o PDF completo após a liberação.');
          return;
        }
      }

      // Dropdown de técnicos
      const sel = document.getElementById('av-tec');
      if (isAdmin) {
        sel.innerHTML = '<option value="">Selecione...</option>'+tecs.map(t=>`<option value="${t.id}">${t.nome} — ${BASE_NAMES[t.base]||t.base}</option>`).join('');
        sel.disabled = false;
      } else {
        const me = await api('GET', '/api/auth/me');
        if (!me?.tecnico) { alert('Seu usuário não está vinculado a nenhum técnico. Contate o supervisor.'); return; }
        sel.innerHTML = `<option value="${me.tecnico.id}" selected>${me.tecnico.nome} — ${BASE_NAMES[me.tecnico.base]||me.tecnico.base}</option>`;
        sel.disabled = true;
      }

      const semestreLabel = (p) => {
        const [yr, s] = p.split('-');
        return s === 'S1' ? `${yr} — 1º Semestre (Jan–Jun)` : `${yr} — 2º Semestre (Jul–Dez)`;
      };
      document.getElementById('av-per').innerHTML = '<option value="">Selecione o semestre...</option>'+PERIODOS.map(p=>`<option value="${p}">${semestreLabel(p)}</option>`).join('');
      document.getElementById('av-id').value = '';
      document.getElementById('m-av-title').textContent = id ? 'Editar Avaliação' : (isAdmin ? 'Nova Avaliação (Supervisor)' : 'Minha Autoavaliação');
      initStars(); this.preview();

      if (id) {
        const a = this.data.find(x => x.id === id); if (!a) return;
        document.getElementById('av-id').value = a.id;
        if (isAdmin) sel.disabled = false;
        document.getElementById('av-tec').value = a.tecnico_id;
        document.getElementById('av-per').value  = a.periodo;
        ALL_FIELDS.forEach(f => setStarVal(f, a.criterios[f]||0));
        this.preview();
      }
      document.getElementById('m-av').classList.add('open');
    },

    async save(e) {
      e.preventDefault();
      const isAdmin = ME?.role === 'admin';
      const id      = document.getElementById('av-id').value;
      const criterios={}; ALL_FIELDS.forEach(f=>criterios[f]=starVal(f));
      if(ALL_FIELDS.some(f=>criterios[f]===0)){alert('Preencha todos os critérios.');return;}
      const nota_base    = Math.round(calcNotaBase(criterios)*100)/100;
      const multiplicador = calcMult(criterios);
      const nota_final   = Math.round(nota_base*multiplicador*100)/100;
      const body={tecnico_id:+document.getElementById('av-tec').value,periodo:document.getElementById('av-per').value,criterios,nota_base,multiplicador,nota_final,tipo:isAdmin?'supervisor':'autoavaliacao'};
      try {
        if(id) await api('PUT',`/api/avaliacoes/${id}`,body); else await api('POST','/api/avaliacoes',body);
        closeModal('m-av'); this.render(); toast(id?'Avaliação atualizada!':'Avaliação salva!');
      } catch(ex) { alert(ex.message); }
    },

    async remove(id) {
      if(!confirm('Excluir avaliação?')) return;
      try { await api('DELETE',`/api/avaliacoes/${id}`); this.render(); toast('Removida.'); }
      catch(ex) { alert(ex.message); }
    },

    // ── Liberar sem feedback ──────────────────────────────
    async liberar(id) {
      if (!confirm('Liberar esta avaliação para o técnico visualizar?')) return;
      try {
        await api('PUT', `/api/avaliacoes/${id}/liberar`);
        this.render(); toast('Avaliação liberada para o técnico!');
      } catch(ex) { alert(ex.message); }
    },

    // ── Feedback modal ────────────────────────────────────
    openFeedback(id) {
      const a = this.data.find(x => x.id === id); if (!a) return;
      const c = conceito(a.nota_final);
      document.getElementById('fb-av-id').value = id;
      document.getElementById('m-fb-title').textContent = `Feedback — ${a.tecnico_nome} · ${a.periodo}`;

      document.getElementById('fb-resumo').innerHTML = `
        <div><span style="font-size:11px;color:var(--text-dim)">Técnico</span><strong>${a.tecnico_nome}</strong></div>
        <div><span style="font-size:11px;color:var(--text-dim)">Base</span><strong>${BASE_NAMES[a.tecnico_base]||a.tecnico_base}</strong></div>
        <div><span style="font-size:11px;color:var(--text-dim)">Período</span><strong>${a.periodo}</strong></div>
        <div><span style="font-size:11px;color:var(--text-dim)">Nota Final</span><strong style="color:var(--orange)">${a.nota_final.toFixed(2)}</strong></div>
        <div><span style="font-size:11px;color:var(--text-dim)">Conceito</span><span class="badge ${c.c}">${c.t}</span></div>
        ${a.liberado?'<div><span class="badge b-green">✓ Já liberada</span></div>':''}`;

      document.getElementById('fb-texto').value  = a.feedback_texto || '';
      document.getElementById('fb-data').value   = a.feedback_data  || today();
      document.getElementById('fb-liberar').checked = !a.liberado;

      // Init star para nota do feedback
      const starsEl = document.querySelector('.stars[data-f="fb_nota"]');
      if (starsEl) { buildStars(starsEl); setStars(starsEl, a.feedback_nota || 0); }

      document.getElementById('m-feedback').classList.add('open');
    },

    async saveFeedback(e) {
      e.preventDefault();
      const id     = +document.getElementById('fb-av-id').value;
      const texto  = document.getElementById('fb-texto').value.trim();
      const nota   = starVal('fb_nota');
      const data   = document.getElementById('fb-data').value;
      const liberar= document.getElementById('fb-liberar').checked;
      if (!texto) { alert('Informe o texto do feedback.'); return; }
      try {
        await api('PUT', `/api/avaliacoes/${id}/feedback`, { feedback_texto:texto, feedback_nota:nota, feedback_data:data, liberar });
        closeModal('m-feedback');
        this.render();
        toast(liberar ? 'Feedback salvo e avaliação liberada para o técnico!' : 'Feedback salvo. Avaliação ainda não liberada.');
      } catch(ex) { alert(ex.message); }
    },

    // ── Gerar PDF ─────────────────────────────────────────
    gerarPDF(id) {
      const clicked = this.data.find(x => x.id === id);
      if (!clicked) { alert('Avaliação não encontrada.'); return; }

      // Busca o conjunto completo: autoavaliação + avaliação supervisor para o mesmo técnico/período
      const autoAv = this.data.find(x => x.tipo==='autoavaliacao' && x.tecnico_id===clicked.tecnico_id && x.periodo===clicked.periodo);
      const supAv  = this.data.find(x => x.tipo==='supervisor'    && x.tecnico_id===clicked.tecnico_id && x.periodo===clicked.periodo);

      const baseName = BASE_NAMES[clicked.tecnico_base] || clicked.tecnico_base;
      const stars    = n => '★'.repeat(Math.max(0,n)) + '☆'.repeat(Math.max(0,5-n));
      const pctStr   = f => PESOS[f] ? ` <span style="color:#999;font-size:9px">(${(PESOS[f]*100).toFixed(0)}%)</span>` : '';

      // Helper: bloco de critérios para uma avaliação
      const buildCrit = (av, bgTint) => ALL_FIELDS.map(f => {
        const v = av?.criterios?.[f] || 0;
        const isOrg = ORG_FIELDS.includes(f);
        return `<div class="pdf-crit" style="${isOrg?'background:#fffbeb':''}${bgTint&&!isOrg?';border-left:3px solid '+bgTint:''}">
          <div class="pdf-crit-name">${CRIT_LABELS[f]}${pctStr(f)}</div>
          <div class="pdf-crit-stars">${stars(v)}</div>
        </div>`;
      }).join('');

      // Helper: bloco de notas resumido
      const buildNotas = (av, label, color) => {
        const c2 = conceito(av.nota_final);
        return `<div class="pdf-notas" style="margin-bottom:12px">
          <div class="pdf-nota-item" style="flex:2;background:${color}15;border-radius:4px;padding:6px 10px">
            <span class="pdf-nota-label" style="font-size:10px">${label}</span>
          </div>
          <div class="pdf-nota-item"><span class="pdf-nota-label">Nota Base</span><span class="pdf-nota-val">${av.nota_base.toFixed(2)}</span></div>
          <div class="pdf-nota-item"><span class="pdf-nota-label">Fator Org.</span><span class="pdf-nota-val">${av.multiplicador.toFixed(2)}×</span></div>
          <div class="pdf-nota-item final"><span class="pdf-nota-label">Nota Final</span><span class="pdf-nota-val">${av.nota_final.toFixed(2)}</span></div>
          <div class="pdf-nota-item"><span class="pdf-nota-label">Conceito</span><span class="pdf-nota-val"><span class="pdf-conceito ${c2.t}">${c2.t}</span></span></div>
        </div>`;
      };

      const completo = autoAv && supAv && supAv.feedback_texto;

      // ── Seção autoavaliação ──
      const autoHtml = autoAv ? `
        <div class="pdf-section">
          <div class="pdf-section-title" style="color:#16a34a">Autoavaliação do Técnico
            <span style="float:right;font-size:10px;color:#888">${fmt(autoAv.created_at?.split('T')[0])}</span>
          </div>
          <div class="pdf-crit-grid">${buildCrit(autoAv,'#16a34a')}</div>
          ${buildNotas(autoAv,'AUTOAVALIAÇÃO','#16a34a')}
        </div>` : '';

      // ── Seção avaliação supervisor ──
      const supHtml = supAv ? `
        <div class="pdf-section">
          <div class="pdf-section-title" style="color:#f97316">Avaliação do Supervisor
            <span style="float:right;font-size:10px;color:#888">${fmt(supAv.created_at?.split('T')[0])}</span>
          </div>
          <div class="pdf-crit-grid">${buildCrit(supAv,'#f97316')}</div>
          ${buildNotas(supAv,'AVALIAÇÃO DO SUPERVISOR','#f97316')}
        </div>` : '';

      // ── Comparativo (só quando as duas existem) ──
      const compHtml = (autoAv && supAv) ? (() => {
        const diff = (supAv.nota_final - autoAv.nota_final);
        const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2);
        const diffColor = diff >= 0 ? '#16a34a' : '#dc2626';
        const cA = conceito(autoAv.nota_final), cS = conceito(supAv.nota_final);
        return `<div class="pdf-section" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:12px">
          <div class="pdf-section-title" style="margin-bottom:10px">Comparativo</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
            <div><div style="font-size:10px;color:#64748b;margin-bottom:4px">Autoavaliação</div>
              <div style="font-size:20px;font-weight:700;color:#16a34a">${autoAv.nota_final.toFixed(2)}</div>
              <div style="font-size:10px;color:#16a34a">${cA.t}</div></div>
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div style="font-size:10px;color:#64748b;margin-bottom:4px">Diferença</div>
              <div style="font-size:20px;font-weight:700;color:${diffColor}">${diffStr}</div>
              <div style="font-size:10px;color:${diffColor}">${diff >= 0 ? 'Supervisor avaliou melhor' : 'Autoavaliação maior'}</div>
            </div>
            <div><div style="font-size:10px;color:#64748b;margin-bottom:4px">Supervisor</div>
              <div style="font-size:20px;font-weight:700;color:#f97316">${supAv.nota_final.toFixed(2)}</div>
              <div style="font-size:10px;color:#f97316">${cS.t}</div></div>
          </div>
        </div>`;
      })() : '';

      // ── Feedback do supervisor ──
      const fbHtml = supAv?.feedback_texto ? `
        <div class="pdf-section">
          <div class="pdf-section-title">Feedback do Supervisor</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
            <div class="pdf-row"><div class="pdf-label">Data</div><div class="pdf-val">${fmt(supAv.feedback_data)}</div></div>
            ${supAv.feedback_nota?`<div class="pdf-row"><div class="pdf-label">Nota do Feedback</div><div class="pdf-val">${stars(supAv.feedback_nota)} (${supAv.feedback_nota}/5)</div></div>`:''}
            <div class="pdf-row"><div class="pdf-label">Liberado em</div><div class="pdf-val">${supAv.liberado_em?fmt(supAv.liberado_em.split('T')[0]):'—'}</div></div>
          </div>
          <div class="pdf-feedback">${(supAv.feedback_texto||'').replace(/\n/g,'<br>')}</div>
        </div>` : '';

      // ── Data do relatório ──
      const dataRelatorio = supAv?.feedback_data || supAv?.created_at?.split('T')[0] || today();

      document.getElementById('pdf-content').innerHTML = `
        <div class="pdf-section">
          <div class="pdf-section-title">Dados do Técnico</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
            <div class="pdf-row"><div class="pdf-label">Nome</div><div class="pdf-val">${clicked.tecnico_nome}</div></div>
            <div class="pdf-row"><div class="pdf-label">Base</div><div class="pdf-val">${baseName}</div></div>
            <div class="pdf-row"><div class="pdf-label">Período</div><div class="pdf-val">${clicked.periodo}</div></div>
          </div>
          <div style="margin-top:8px;padding:6px 10px;background:#f1f5f9;border-radius:4px;font-size:11px;color:#475569">
            ${completo
              ? '✅ <strong>Avaliação completa</strong> — Autoavaliação + Avaliação do Supervisor + Feedback'
              : (autoAv && supAv ? '⏳ Aguardando feedback do supervisor' : '⚠ Avaliação parcial')}
          </div>
        </div>

        ${autoHtml}
        ${supHtml}
        ${compHtml}
        ${fbHtml}

        <div class="pdf-sign">
          <div class="pdf-sign-box">Técnico: ${clicked.tecnico_nome}<br><br>_______________________<br><small>${fmt(dataRelatorio)}</small></div>
          <div class="pdf-sign-box">Supervisor / Gestor<br><br>_______________________<br><small>${fmt(dataRelatorio)}</small></div>
        </div>`;

      window.print();
    }
  },

  // ── Usuários (admin) ─────────────────────────────────────
  usuarios: {
    data: [],
    async render() {
      try {
        this.data = await api('GET','/api/users');
        document.getElementById('tbody-usr').innerHTML = this.data.map(u=>`<tr>
          <td><strong>${u.nome}</strong></td><td>${u.email}</td>
          <td><span class="badge ${u.role==='admin'?'b-orange':'b-blue'}">${u.role}</span></td>
          <td>${fmt(u.created_at?.split('T')[0])}</td>
          <td><button class="btn-tbl-edit" onclick="App.usuarios.openModal(${u.id})">Editar</button>
              <button class="btn-tbl-del"  onclick="App.usuarios.remove(${u.id})">Excluir</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum usuário</td></tr>';
      } catch(e) { toast('Acesso restrito'); }
    },
    openModal(id=null) {
      document.getElementById('m-usr').querySelectorAll('input').forEach(el=>el.value='');
      document.getElementById('usr-id').value=''; document.getElementById('usr-role').value='user';
      document.getElementById('m-usr-title').textContent=id?'Editar Usuário':'Novo Usuário';
      if(id){const u=this.data.find(x=>x.id===id);if(!u)return;document.getElementById('usr-id').value=u.id;document.getElementById('usr-nome').value=u.nome;document.getElementById('usr-email').value=u.email;document.getElementById('usr-role').value=u.role;}
      document.getElementById('m-usr').classList.add('open');
    },
    async save(e) {
      e.preventDefault();
      const id=document.getElementById('usr-id').value,senha=document.getElementById('usr-senha').value;
      const body={nome:document.getElementById('usr-nome').value,email:document.getElementById('usr-email').value,role:document.getElementById('usr-role').value};
      if(senha) body.password=senha;
      if(!id&&!senha){alert('Informe uma senha para o novo usuário.');return;}
      try {
        if(id) await api('PUT',`/api/users/${id}`,body); else await api('POST','/api/users',body);
        closeModal('m-usr'); this.render(); toast(id?'Usuário atualizado!':'Usuário criado!');
      } catch(ex) { alert(ex.message); }
    },
    async remove(id) {
      if(!confirm('Excluir usuário?')) return;
      try { await api('DELETE',`/api/users/${id}`); this.render(); toast('Removido.'); }
      catch(ex) { alert(ex.message); }
    }
  }
};

// ── Boot ──────────────────────────────────────────────────
if (TOKEN && ME) { showApp(); }
else { document.getElementById('login-screen').style.display = 'flex'; }
