/**
 * Avaliação de Desempenho — Sinalização (Trivia)
 * Google Apps Script + planilha do Google como banco de dados.
 *
 * Implantação: Implantar → Nova implantação → App da Web
 *   Executar como: Eu (a conta dona do projeto)
 *   Quem pode acessar: Qualquer pessoa em triviatrens.com.br
 * Assim cada técnico entra com a própria conta Google da Trivia e o app sabe quem ele é.
 */

const DOMINIO = 'triviatrens.com.br';
const NOME_PLANILHA = 'Avaliação de Desempenho - Sinalização (dados)';
const TZ = 'America/Sao_Paulo';

const ABAS = {
  Tecnicos:   ['id', 'nome', 'email', 'base', 'escala', 'turno', 'admissao', 'criado_em'],
  Avaliacoes: ['id', 'tecnico_id', 'periodo', 'tipo', 'criterios', 'nota_base', 'multiplicador', 'nota_final',
               'liberado', 'liberado_em', 'feedback_texto', 'feedback_data', 'avaliador', 'criado_em', 'atualizado_em'],
  Config:     ['chave', 'valor'],
};

// Pesos dos 7 critérios da nota base; os 3 institucionais formam o fator de 0,80× a 1,20×
const PESOS = { conhecimentoTecnico: .20, segurancaOperacional: .20, iniciativaAtuacao: .15, disponibilidade: .15, trabalhoEquipe: .12, comunicacao: .10, proatividade: .08 };
const ORG = ['focoResultados', 'posturaEtica', 'alinhamentoValores'];

// ════════════ Página ════════════
function doGet(e) {
  // As páginas são montadas "cruas" (getRawContent): o HtmlService altera scripts grandes
  // quando processa o arquivo, e isso quebra a interface.
  const raw = n => HtmlService.createTemplateFromFile(n).getRawContent();
  const embed = e && e.parameter && (e.parameter.embed === '1' || e.parameter.p === 'portal');
  const html = raw('Index')
    .replace('/*__CSS__*/', () => raw('Styles'))
    .replace('/*__JS__*/', () => raw('App'))
    .replace('__EMBED__', embed ? 'embed' : '');
  return HtmlService.createHtmlOutput(html)
    .setTitle('Avaliação de Desempenho — Trivia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ════════════ Planilha ════════════
function planilha_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PLANILHA_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (err) {} }
  const ss = SpreadsheetApp.create(NOME_PLANILHA);
  props.setProperty('PLANILHA_ID', ss.getId());
  Object.keys(ABAS).forEach((nome, i) => {
    const sh = i === 0 ? ss.getSheets()[0].setName(nome) : ss.insertSheet(nome);
    sh.getRange(1, 1, 1, ABAS[nome].length).setValues([ABAS[nome]]).setFontWeight('bold').setBackground('#13205a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), ABAS[nome].length).setNumberFormat('@'); // texto puro: datas não viram outra coisa
  });
  const cfg = ss.getSheetByName('Config');
  cfg.getRange(2, 1, 2, 2).setValues([
    ['bases', JSON.stringify({ 'Base 1': 'BAS', 'Base 2': 'JBO', 'Base 3': 'CVN', 'Base 4': 'SMP' })],
    ['supervisores', Session.getEffectiveUser().getEmail().toLowerCase()],
  ]);
  return ss;
}

/** Rode uma vez pelo editor para criar a planilha e autorizar o app. Mostra o link no registro. */
function configurar() {
  const ss = planilha_();
  Logger.log('Planilha: ' + ss.getUrl());
  return ss.getUrl();
}

function ler_(aba) {
  const sh = planilha_().getSheetByName(aba);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const cab = ABAS[aba];
  return sh.getRange(2, 1, n - 1, cab.length).getValues()
    .map((l, i) => { const o = { _linha: i + 2 }; cab.forEach((c, j) => o[c] = l[j] === '' ? '' : String(l[j])); return o; })
    .filter(o => o[cab[0]] !== '');
}
function inserir_(aba, obj) {
  const sh = planilha_().getSheetByName(aba);
  const cab = ABAS[aba];
  const lin = sh.getLastRow() + 1;
  sh.getRange(lin, 1, 1, cab.length).setNumberFormat('@').setValues([cab.map(c => valorCelula_(obj[c]))]);
}
function atualizar_(aba, linha, obj) {
  const sh = planilha_().getSheetByName(aba);
  const cab = ABAS[aba];
  sh.getRange(linha, 1, 1, cab.length).setNumberFormat('@').setValues([cab.map(c => valorCelula_(obj[c]))]);
}
function excluirLinha_(aba, linha) { planilha_().getSheetByName(aba).deleteRow(linha); }
function valorCelula_(v) { return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
function proximoId_(lista) { return lista.reduce((m, o) => Math.max(m, +o.id || 0), 0) + 1; }

function config_() {
  const cfg = {};
  ler_('Config').forEach(r => cfg[r.chave] = r.valor);
  let bases; try { bases = JSON.parse(cfg.bases); } catch (err) { bases = { 'Base 1': 'BAS', 'Base 2': 'JBO', 'Base 3': 'CVN', 'Base 4': 'SMP' }; }
  const sup = String(cfg.supervisores || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return { bases, supervisores: sup };
}
function gravarConfig_(chave, valor) {
  const linha = ler_('Config').find(r => r.chave === chave);
  if (linha) atualizar_('Config', linha._linha, { chave, valor }); else inserir_('Config', { chave, valor });
}

// ════════════ Quem está usando ════════════
function usuario_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error(`Não foi possível identificar sua conta. Entre com seu e-mail @${DOMINIO} no Google e abra o app de novo.`);
  const cfg = config_();
  const dono = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const admin = email === dono || cfg.supervisores.indexOf(email) >= 0;
  const tecnico = ler_('Tecnicos').find(t => t.email.toLowerCase() === email) || null;
  return { email, admin, tecnico, cfg };
}
function exigirAdmin_(u) { if (!u.admin) throw new Error('Somente supervisores podem fazer isso.'); }
function hoje_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function agora_() { return new Date().toISOString(); }

function calcNotas_(criterios) {
  const c = {};
  const todos = Object.keys(PESOS).concat(ORG);
  for (let i = 0; i < todos.length; i++) {
    const v = Math.round(Number(criterios && criterios[todos[i]]));
    if (!(v >= 1 && v <= 5)) return null;
    c[todos[i]] = v;
  }
  const nota_base = Math.round(Object.keys(PESOS).reduce((s, f) => s + c[f] * PESOS[f], 0) * 100) / 100;
  const media = ORG.reduce((s, f) => s + c[f], 0) / ORG.length;
  const multiplicador = Math.round((0.80 + (media - 1) * 0.10) * 100) / 100;
  const nota_final = Math.round(nota_base * multiplicador * 100) / 100;
  return { criterios: c, nota_base, multiplicador, nota_final };
}
function avaliacaoPublica_(a, tecs) {
  const t = tecs.find(x => x.id === a.tecnico_id) || {};
  let crit = {}; try { crit = JSON.parse(a.criterios); } catch (err) {}
  return {
    id: +a.id, tecnico_id: +a.tecnico_id, periodo: a.periodo, tipo: a.tipo, criterios: crit,
    nota_base: +a.nota_base, multiplicador: +a.multiplicador, nota_final: +a.nota_final,
    liberado: a.liberado === 'true', liberado_em: a.liberado_em, feedback_texto: a.feedback_texto,
    feedback_data: a.feedback_data, criado_em: a.criado_em,
    tecnico_nome: t.nome || '?', tecnico_base: t.base || '?', tecnico_escala: t.escala || '',
  };
}
function tecnicoPublico_(t) { return { id: +t.id, nome: t.nome, email: t.email, base: t.base, escala: t.escala, turno: t.turno, admissao: t.admissao }; }

// ════════════ Ponto único de entrada (google.script.run.api) ════════════
function api(acao, dados) {
  dados = dados || {};
  const u = usuario_();
  const escrita = ['tecnicoSalvar', 'tecnicoExcluir', 'avaliacaoCriar', 'avaliacaoEditar', 'avaliacaoExcluir', 'avaliacaoLiberar', 'avaliacaoFeedback', 'basesSalvar', 'supervisoresSalvar'];
  if (escrita.indexOf(acao) < 0) return ACOES_[acao] ? ACOES_[acao](u, dados) : erro_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return ACOES_[acao](u, dados); } finally { lock.releaseLock(); }
}
function erro_() { throw new Error('Ação desconhecida.'); }

const ACOES_ = {
  me(u) {
    return {
      email: u.email, nome: u.tecnico ? u.tecnico.nome : u.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      role: u.admin ? 'admin' : 'user', tecnico: u.tecnico ? tecnicoPublico_(u.tecnico) : null,
      bases: u.cfg.bases, hoje: hoje_(),
    };
  },

  // ── Supervisor ──
  painel(u) {
    exigirAdmin_(u);
    const tecs = ler_('Tecnicos');
    const sup = ler_('Avaliacoes').filter(a => a.tipo === 'supervisor');
    const baseStats = Object.keys(u.cfg.bases).map(base => {
      const ids = tecs.filter(t => t.base === base).map(t => t.id);
      const avs = sup.filter(a => ids.indexOf(a.tecnico_id) >= 0);
      return { base, total: ids.length, media: avs.length ? Math.round(avs.reduce((s, a) => s + (+a.nota_final), 0) / avs.length * 100) / 100 : null };
    });
    return { hoje: hoje_(), totalTecnicos: tecs.length, baseStats };
  },
  tecnicos(u) { exigirAdmin_(u); return ler_('Tecnicos').map(tecnicoPublico_).sort((a, b) => a.nome.localeCompare(b.nome)); },
  tecnicoSalvar(u, d) {
    exigirAdmin_(u);
    const nome = String(d.nome || '').trim(), email = String(d.email || '').trim().toLowerCase();
    if (!nome || !d.base || !d.escala || !d.turno) throw new Error('Preencha nome, base, escala e turno.');
    if (email && email.split('@')[1] !== DOMINIO) throw new Error(`O e-mail precisa ser @${DOMINIO}.`);
    const tecs = ler_('Tecnicos');
    if (email && tecs.some(t => t.email.toLowerCase() === email && +t.id !== +d.id)) throw new Error('Outro técnico já usa este e-mail.');
    const obj = { nome, email, base: d.base, escala: d.escala, turno: d.turno, admissao: d.admissao || '' };
    if (d.id) {
      const t = tecs.find(x => +x.id === +d.id);
      if (!t) throw new Error('Técnico não encontrado.');
      atualizar_('Tecnicos', t._linha, Object.assign({}, t, obj));
    } else {
      inserir_('Tecnicos', Object.assign({ id: proximoId_(tecs), criado_em: agora_() }, obj));
    }
    return { ok: true };
  },
  tecnicoExcluir(u, d) {
    exigirAdmin_(u);
    const t = ler_('Tecnicos').find(x => +x.id === +d.id);
    if (!t) throw new Error('Técnico não encontrado.');
    ler_('Avaliacoes').filter(a => +a.tecnico_id === +d.id).sort((a, b) => b._linha - a._linha).forEach(a => excluirLinha_('Avaliacoes', a._linha));
    excluirLinha_('Tecnicos', t._linha);
    return { ok: true };
  },
  basesSalvar(u, d) {
    exigirAdmin_(u);
    const bases = {};
    ['Base 1', 'Base 2', 'Base 3', 'Base 4'].forEach(k => bases[k] = String((d.bases || {})[k] || '').trim().slice(0, 20) || k);
    gravarConfig_('bases', JSON.stringify(bases));
    return { ok: true };
  },
  supervisores(u) {
    exigirAdmin_(u);
    return { lista: u.cfg.supervisores, dono: String(Session.getEffectiveUser().getEmail()).toLowerCase() };
  },
  supervisoresSalvar(u, d) {
    exigirAdmin_(u);
    const lista = (d.lista || []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
    lista.forEach(e => { if (e.split('@')[1] !== DOMINIO) throw new Error(`${e} não é @${DOMINIO}.`); });
    if (lista.indexOf(u.email) < 0 && u.email !== String(Session.getEffectiveUser().getEmail()).toLowerCase())
      throw new Error('Você não pode tirar o seu próprio acesso de supervisor.');
    gravarConfig_('supervisores', lista.join(', '));
    return { ok: true };
  },

  // ── Avaliações ──
  avaliacoes(u) {
    const tecs = ler_('Tecnicos');
    let lista = ler_('Avaliacoes');
    if (u.admin) return lista.map(a => avaliacaoPublica_(a, tecs));
    if (!u.tecnico) return [];
    const meu = u.tecnico.id;
    const comFeedback = lista.filter(a => a.tecnico_id === meu && a.tipo === 'supervisor' && a.feedback_texto).map(a => a.periodo);
    return lista.filter(a => a.tecnico_id === meu && (a.tipo === 'autoavaliacao' || a.liberado === 'true'))
      .map(a => { const p = avaliacaoPublica_(a, tecs); if (p.tipo === 'autoavaliacao') p.bloqueada = comFeedback.indexOf(a.periodo) >= 0; return p; });
  },
  meuPainel(u) {
    if (!u.tecnico) return { tecnico: null, ultimaSupervisor: null };
    const tecs = ler_('Tecnicos');
    const sup = ler_('Avaliacoes').filter(a => a.tecnico_id === u.tecnico.id && a.tipo === 'supervisor' && a.liberado === 'true')
      .sort((a, b) => b.periodo.localeCompare(a.periodo));
    return { tecnico: tecnicoPublico_(u.tecnico), ultimaSupervisor: sup[0] ? avaliacaoPublica_(sup[0], tecs) : null };
  },
  avaliacaoCriar(u, d) {
    if (!/^\d{4}-S[12]$/.test(String(d.periodo))) throw new Error('Escolha o semestre.');
    const n = calcNotas_(d.criterios);
    if (!n) throw new Error('Responda todos os 10 critérios (1 a 5).');
    let tecnico_id, tipo;
    if (u.admin && d.tecnico_id) {
      tipo = 'supervisor'; tecnico_id = String(+d.tecnico_id);
      if (!ler_('Tecnicos').some(t => t.id === tecnico_id)) throw new Error('Técnico não encontrado.');
    } else {
      if (!u.tecnico) throw new Error('Seu e-mail ainda não está no cadastro da equipe. Fale com o supervisor.');
      tipo = 'autoavaliacao'; tecnico_id = u.tecnico.id;
    }
    const lista = ler_('Avaliacoes');
    if (lista.some(a => a.tecnico_id === tecnico_id && a.periodo === d.periodo && a.tipo === tipo))
      throw new Error(tipo === 'autoavaliacao' ? 'Você já fez a autoavaliação deste semestre. Abra a existente para editar.' : 'Este técnico já tem sua avaliação neste semestre. Abra a existente para editar.');
    inserir_('Avaliacoes', {
      id: proximoId_(lista), tecnico_id, periodo: d.periodo, tipo, criterios: n.criterios,
      nota_base: n.nota_base, multiplicador: n.multiplicador, nota_final: n.nota_final,
      liberado: tipo === 'autoavaliacao' ? 'true' : 'false', avaliador: u.email, criado_em: agora_(),
    });
    return { ok: true };
  },
  avaliacaoEditar(u, d) {
    const lista = ler_('Avaliacoes');
    const a = lista.find(x => +x.id === +d.id);
    if (!a) throw new Error('Avaliação não encontrada.');
    if (!u.admin) {
      if (a.tipo !== 'autoavaliacao' || !u.tecnico || a.tecnico_id !== u.tecnico.id) throw new Error('Você só pode editar a sua autoavaliação.');
      if (lista.some(x => x.tipo === 'supervisor' && x.tecnico_id === a.tecnico_id && x.periodo === a.periodo && x.feedback_texto))
        throw new Error('O supervisor já deu o feedback deste semestre; a autoavaliação está fechada.');
    }
    const n = calcNotas_(d.criterios);
    if (!n) throw new Error('Responda todos os 10 critérios (1 a 5).');
    atualizar_('Avaliacoes', a._linha, Object.assign({}, a, { criterios: n.criterios, nota_base: n.nota_base, multiplicador: n.multiplicador, nota_final: n.nota_final, atualizado_em: agora_() }));
    return { ok: true };
  },
  avaliacaoExcluir(u, d) {
    exigirAdmin_(u);
    const a = ler_('Avaliacoes').find(x => +x.id === +d.id);
    if (!a) throw new Error('Avaliação não encontrada.');
    excluirLinha_('Avaliacoes', a._linha);
    return { ok: true };
  },
  avaliacaoLiberar(u, d) {
    exigirAdmin_(u);
    const a = ler_('Avaliacoes').find(x => +x.id === +d.id && x.tipo === 'supervisor');
    if (!a) throw new Error('Avaliação não encontrada.');
    atualizar_('Avaliacoes', a._linha, Object.assign({}, a, { liberado: 'true', liberado_em: agora_() }));
    return { ok: true };
  },
  avaliacaoFeedback(u, d) {
    exigirAdmin_(u);
    const a = ler_('Avaliacoes').find(x => +x.id === +d.id && x.tipo === 'supervisor');
    if (!a) throw new Error('Avaliação não encontrada.');
    const texto = String(d.feedback_texto || '').trim();
    if (!texto) throw new Error('Escreva o feedback.');
    const novo = Object.assign({}, a, {
      feedback_texto: texto.slice(0, 5000),
      feedback_data: /^\d{4}-\d{2}-\d{2}$/.test(String(d.feedback_data)) ? d.feedback_data : hoje_(),
    });
    if (d.liberar) { novo.liberado = 'true'; novo.liberado_em = agora_(); }
    atualizar_('Avaliacoes', a._linha, novo);
    return { ok: true };
  },
};
