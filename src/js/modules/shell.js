// =====================================================================
// Shell — casca do app: menu do topo, faixa do torneio ativo e as abas
// Inscritos / Chaves / Agenda / Partidas (layout novo, W20).
// Só apresentação: os números saem dos mesmos dados das telas (torneio,
// jogadores, jogos) e o progresso do dia é a mesma conta do painel das
// Partidas (matches-forecast.js). A navegação continua no navigateTo.
// Funções shell* (sem DOM) cobertas em tests/unit/shell.test.js.
// =====================================================================

const SHELL_DONE_STATUS = ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao', 'SemJogo'];

function _shPad(n) { return String(n).padStart(2, '0'); }

function _shEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "17 e 18/10/2026" · "17 a 19/10/2026" · "30/10 a 01/11/2026" · "16/08/2026"
function shellDateRange(start, end) {
  if (!start) return '';
  const [y1, m1, d1] = String(start).split('-');
  if (!end || end === start) return `${d1}/${m1}/${y1}`;
  const [y2, m2, d2] = String(end).split('-');
  if (y1 !== y2) return `${d1}/${m1}/${y1} a ${d2}/${m2}/${y2}`;
  if (m1 !== m2) return `${d1}/${m1} a ${d2}/${m2}/${y2}`;
  const dias = Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000);
  return `${d1} ${dias === 1 ? 'e' : 'a'} ${d2}/${m2}/${y2}`;
}

function shellTodayISO(nowMs) {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${_shPad(d.getMonth() + 1)}-${_shPad(d.getDate())}`;
}

// Dia de hoje dentro do torneio: pela programação por dia; sem ela, pelos dias
// do início ao fim. Fora dos dias (ou torneio de 1 dia sem programação) = null.
function shellDayInfo(t, nowMs) {
  if (!t) return null;
  const hoje = shellTodayISO(nowMs);
  const days = t.daySchedule || [];
  if (days.length) {
    const i = days.findIndex(d => d.date === hoje);
    return i < 0 ? null : { n: i + 1, of: days.length, date: hoje, day: days[i] };
  }
  if (!t.startDate || !t.endDate || t.endDate <= t.startDate) return null;
  if (hoje < t.startDate || hoje > t.endDate) return null;
  const dia = iso => new Date(`${iso}T12:00:00`).getTime();
  const n = Math.round((dia(hoje) - dia(t.startDate)) / 86400000) + 1;
  const of = Math.round((dia(t.endDate) - dia(t.startDate)) / 86400000) + 1;
  return { n, of, date: hoje, day: null };
}

// Etiqueta da faixa = a mesma situação do statusTag (Rascunho / Agendado /
// Em andamento / Finalizado) + "Ao vivo" quando tem jogo em quadra.
function shellStatus(t, nowMs) {
  const info = shellDayInfo(t, nowMs);
  const dia = info ? ` · DIA ${info.n} DE ${info.of}` : '';
  if ((t?.matches || []).some(m => m.status === 'Em Quadra')) return { kind: 'live', text: 'AO VIVO' + dia };
  if (!t?.startDate) return { kind: 'draft', text: 'RASCUNHO' };
  const s = new Date(t.startDate + 'T00:00:00').getTime();
  const e = new Date((t.endDate || t.startDate) + 'T23:59:59').getTime();
  if (nowMs < s) return { kind: 'sched', text: 'AGENDADO' };
  if (nowMs <= e) return { kind: 'run', text: 'EM ANDAMENTO' + dia };
  return { kind: 'done', text: 'FINALIZADO' };
}

// Atletas do torneio, chaves, jogos e atletas inscritos (quem joga 2 categorias conta 1 vez)
function shellCounts(t, players) {
  if (!t) return { athletes: 0, draws: 0, matches: 0, entries: 0 };
  return {
    athletes: (players || []).length,
    draws: (t.draws || []).length,
    matches: (t.matches || []).length,
    entries: new Set((t.entries || []).map(e => e.playerId)).size
  };
}

// Jogos de hoje (dia do torneio) com a previsão de término do painel das
// Partidas; fora dos dias, o torneio inteiro sem previsão. Sem jogos = null.
// dayOf(m) = data do jogo (getMatchDay(m)?.date no app).
function shellProgress(t, nowMs, dayOf) {
  const matches = t?.matches || [];
  if (!matches.length) return null;
  const info = shellDayInfo(t, nowMs);
  if (!info) {
    const done = matches.filter(m => SHELL_DONE_STATUS.includes(m.status)).length;
    return { label: 'Jogos do torneio', done, total: matches.length, pct: Math.round(done / matches.length * 100), endMs: null };
  }
  const list = matches.filter(m => dayOf(m) === info.date);
  if (!list.length) return null;
  const startTime = info.day?.startTime || t.startTime || '08:00';
  const s = forecastSummary(list, {
    nowMs,
    dayStartMs: new Date(`${info.date}T${startTime}:00`).getTime(),
    courts: t.courts || 4,
    restMin: t.restMinBetweenGames || 0,
    defaultMin: t.matchDuration || 30,
    tournamentAvg: forecastAvgSec(matches)
  });
  return { label: 'Jogos de hoje', done: s.done, total: s.total, pct: s.total ? Math.round(s.done / s.total * 100) : 0, endMs: s.endMs };
}

function shellInitials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

// ---------- DOM ----------

function _shCurrent() {
  return {
    t: typeof tournament !== 'undefined' ? tournament : null,
    pl: typeof players !== 'undefined' ? players : []
  };
}

function _shDayOf(m) {
  try { return typeof getMatchDay === 'function' ? (getMatchDay(m)?.date || '') : ''; } catch (_e) { return ''; }
}

function _shSetCount(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n ? String(n) : '';
  el.hidden = !n;
}

function renderShell() {
  if (typeof document === 'undefined') return;
  const band = document.getElementById('shell-band');
  if (!band) return;
  const { t, pl } = _shCurrent();
  const nowMs = Date.now();
  const c = shellCounts(t, pl);
  band.classList.toggle('is-empty', !t);

  const title = document.getElementById('band-title');
  if (title) title.textContent = t ? (t.name || 'Torneio sem nome') : 'Nenhum torneio ativo';

  const meta = document.getElementById('band-meta');
  if (meta) {
    if (!t) {
      meta.innerHTML = '<span>Crie um torneio ou abra um backup na aba Torneios.</span>';
    } else {
      const parts = [];
      const datas = shellDateRange(t.startDate, t.endDate);
      if (datas) parts.push(`<span>${icon('calendar')}${_shEsc(datas)}</span>`);
      const local = [t.location, t.city].filter(Boolean).join(' · ');
      if (local) parts.push(`<span>${icon('map-pin')}${_shEsc(local)}</span>`);
      parts.push(`<span>${icon('users')}${c.athletes} atleta${c.athletes === 1 ? '' : 's'} · ${c.draws} chave${c.draws === 1 ? '' : 's'}</span>`);
      meta.innerHTML = parts.join('');
    }
  }

  const tag = document.getElementById('band-tag');
  if (tag) {
    if (!t) { tag.hidden = true; } else {
      const st = shellStatus(t, nowMs);
      tag.hidden = false;
      tag.className = 'band-tag is-' + st.kind;
      const txt = document.getElementById('band-tag-text');
      if (txt) txt.textContent = st.text;
    }
  }

  const prog = document.getElementById('band-progress');
  if (prog) {
    const p = t ? shellProgress(t, nowMs, _shDayOf) : null;
    prog.hidden = !p;
    if (p) {
      document.getElementById('band-progress-label').textContent = p.label;
      document.getElementById('band-progress-count').textContent = `${p.done} de ${p.total}`;
      const end = document.getElementById('band-progress-end');
      if (p.endMs) { const d = new Date(p.endMs); end.textContent = `· término ~${_shPad(d.getHours())}:${_shPad(d.getMinutes())}`; } else { end.textContent = ''; }
      document.getElementById('band-progress-bar').style.width = p.pct + '%';
    }
  }

  _shSetCount('tab-count-roster', c.entries);
  _shSetCount('tab-count-draws', c.draws);
  _shSetCount('tab-count-matches', c.matches);
}

// A faixa acompanha os dados sem depender de cada tela: confere a cada 2 s se
// algo que ela mostra mudou (e o término a cada minuto) e redesenha.
let _shellSig = '';
function _shellSignature() {
  const { t, pl } = _shCurrent();
  if (!t) return 'none|' + (pl || []).length;
  const ms = t.matches || [];
  let done = 0, live = 0;
  ms.forEach(m => { if (SHELL_DONE_STATUS.includes(m.status)) done++; else if (m.status === 'Em Quadra') live++; });
  return [t.name, t.startDate, t.endDate, t.location, t.city, (pl || []).length, (t.entries || []).length, (t.draws || []).length,
    ms.length, done, live, (t.daySchedule || []).length, Math.floor(Date.now() / 60000)].join('|');
}
function shellTick() {
  try {
    const sig = _shellSignature();
    if (sig !== _shellSig) { _shellSig = sig; renderShell(); }
  } catch (e) { console.warn('[shellTick]', e); }
}
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__fabdShellTicker) {
  window.__fabdShellTicker = setInterval(shellTick, 2000);
}
