// =====================================================================
// Overview UI — tela Visão geral do layout novo (W20, parte 2): números,
// ações rápidas, torneio ativo, "Agora nas quadras" e "Próximos jogos".
// Só apresentação: os dados são os de sempre (torneio, jogadores e jogos;
// placar ao vivo = o mesmo do painel das quadras das Partidas).
// Funções ov* (sem DOM) cobertas em tests/unit/overview-ui.test.js.
// =====================================================================

const OV_MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const OV_DONE_STATUS = ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao', 'SemJogo'];

function _ovEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// R$ 3.720,00
function ovMoney(v) {
  const [int, dec] = (Number(v) || 0).toFixed(2).split('.');
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

function ovMonthAbbr(iso) {
  const m = Number(String(iso || '').split('-')[1]);
  return m >= 1 && m <= 12 ? OV_MESES[m - 1] : '';
}

// Placar da quadra: o ao vivo do árbitro ("15 - 12 (Set 2)" → 15–12); sem ele, o do jogo
function ovLiveScore(m) {
  const live = typeof m?.liveScore === 'string' ? m.liveScore.match(/(\d+)\s*-\s*(\d+)/) : null;
  if (live) return `${live[1]}–${live[2]}`;
  return m?.score || '';
}

// Quadras ocupadas (1 jogo "Em Quadra" por quadra, na ordem das quadras) e quantas livres
function ovCourts(matches, nCourts, courtNames) {
  const busy = [];
  const n = nCourts || 4;
  for (let c = 0; c < n; c++) {
    const court = (courtNames || [])[c] || `Quadra ${c + 1}`;
    const m = (matches || []).find(x => x.court === court && x.status === 'Em Quadra');
    if (m) busy.push({ court, m, score: ovLiveScore(m) });
  }
  return { busy, free: n - busy.length };
}

function _ovPending(m) {
  if (!m || !m.time) return false;
  if (OV_DONE_STATUS.includes(m.status) || m.status === 'Em Quadra' || m.status === 'A definir') return false;
  return !/A definir/i.test(`${m.player1 || ''} ${m.player2 || ''}`);
}

// Próximos jogos: pendentes com horário e atletas definidos, de hoje em diante
// (sem nenhum, os primeiros pendentes do torneio), na ordem dia → hora → número
function ovNextMatches(matches, dayOf, todayISO, limit) {
  const key = m => [dayOf(m) || '9999-99-99', m.time, String(m.num || 0).padStart(5, '0')].join('|');
  const all = (matches || []).filter(_ovPending).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const fromToday = all.filter(m => (dayOf(m) || '9999-99-99') >= todayISO);
  return (fromToday.length ? fromToday : all).slice(0, limit || 4);
}

// Etiqueta do dia nos próximos jogos que não são de hoje: "Dia N" (ou a data)
function ovDayTag(date, todayISO, days) {
  if (!date || date === todayISO) return '';
  const i = (days || []).findIndex(d => d.date === date);
  if (i >= 0) return `Dia ${i + 1}`;
  const [, mm, dd] = String(date).split('-');
  return dd && mm ? `${dd}/${mm}` : '';
}

// Inscrições arrecadadas — a mesma conta da Visão geral de antes
function ovFinance(players, valorPadrao) {
  let total = 0, paid = 0;
  (players || []).forEach(p => {
    const n = (p.inscriptions || []).length;
    const valor = p.valorCategoria || valorPadrao;
    if ((p.pagamentoStatus || 'pago') === 'pago') { total += n * valor; paid += n; }
  });
  return { total, paid };
}

// ---------- DOM ----------

function _ovNames(txt) {
  return String(txt || '').split('/').map(s => s.trim()).filter(Boolean);
}

function renderOverviewRecent(t, pl) {
  const c = document.getElementById('recent-tournaments');
  if (!c) return;
  if (!t) {
    c.innerHTML = `<div class="ov-empty">${icon('trophy', 'i ov-empty-ic')}<b>Nenhum torneio ativo</b><span>Crie um novo torneio ou abra um backup</span></div>`;
    return;
  }
  const st = shellStatus(t, Date.now());
  const rot = { live: 'Ao vivo', run: 'Em andamento', sched: 'Agendado', done: 'Finalizado', draft: 'Rascunho' }[st.kind];
  const local = [t.location, t.city].filter(Boolean).join(' · ');
  const datas = shellDateRange(t.startDate, t.endDate);
  const dia = t.startDate ? String(t.startDate).split('-')[2] : '–';
  c.innerHTML = `<div class="ov-tr">
      <div class="ov-dt"><b>${_ovEsc(dia)}</b><small>${_ovEsc(ovMonthAbbr(t.startDate))}</small></div>
      <div class="ov-nm"><b>${_ovEsc(t.name)}</b><small>${_ovEsc([datas, local].filter(Boolean).join(' · ') || 'Sem data e local')}</small></div>
      <div class="ov-ss"><span class="pill is-${st.kind}"><s></s>${rot}</span><div>${(pl || []).length} atletas · ${(t.matches || []).length} jogos</div></div>
      <button type="button" class="btn-soft" data-action="navigateTo" data-arg-1="players">Gerenciar</button>
    </div>`;
}

function renderOverviewCourts(t) {
  const el = document.getElementById('ov-courts');
  if (!el) return;
  if (!t) { el.innerHTML = '<div class="ov-empty-sm">Sem torneio ativo.</div>'; return; }
  const { busy, free } = ovCourts(t.matches, t.courts || 4, t.courtNames);
  if (!busy.length) {
    el.innerHTML = `<div class="ov-empty-sm">${icon('radio', 'i')}Nenhum jogo em quadra agora · ${free} quadra${free === 1 ? '' : 's'} livre${free === 1 ? '' : 's'}</div>`;
    return;
  }
  el.innerHTML = '<div class="ov-qd">' + busy.map(({ court, m, score }) => `<div class="ov-qbx">
      <div class="t"><b>${_ovEsc(court)}</b><span class="ev">${_ovEsc(m.drawName || '')}</span><span class="s">${_ovEsc(score)}</span></div>
      <div class="p"><span class="nm">${_ovEsc(_ovNames(m.player1).join(' / '))}</span><span class="nm"><span class="mut">×</span> ${_ovEsc(_ovNames(m.player2).join(' / '))}</span></div>
    </div>`).join('') + '</div>' + (free ? `<div class="ov-free">${free} quadra${free === 1 ? '' : 's'} livre${free === 1 ? '' : 's'}</div>` : '');
}

function renderOverviewNext(t) {
  const el = document.getElementById('ov-next');
  const sub = document.getElementById('ov-next-sub');
  if (!el) return;
  const dayOf = m => { try { return typeof getMatchDay === 'function' ? (getMatchDay(m)?.date || '') : ''; } catch (_e) { return ''; } };
  const hoje = shellTodayISO(Date.now());
  const list = t ? ovNextMatches(t.matches, dayOf, hoje, 4) : [];
  if (!list.length) {
    if (sub) sub.textContent = '';
    el.innerHTML = `<div class="ov-empty-sm">${icon('calendar-days', 'i')}${t ? 'Nenhum jogo pendente com horário.' : 'Sem torneio ativo.'}</div>`;
    return;
  }
  if (sub) {
    const semQuadra = list.every(m => !m.court) && list.every(m => !m.umpire);
    sub.textContent = list[0].time + (semQuadra ? ' · quadra e árbitro a definir' : '');
  }
  el.innerHTML = '<div class="ov-px">' + list.map(m => `<div class="ov-pxc">
      <div class="t"><b>${_ovEsc(m.time)}</b><span>Jogo ${_ovEsc(m.num)}</span>${ovDayTag(dayOf(m), hoje, t.daySchedule) ? `<span class="dia">${_ovEsc(ovDayTag(dayOf(m), hoje, t.daySchedule))}</span>` : ''}${m.court ? `<span class="ct">${_ovEsc(m.court)}</span>` : ''}</div>
      <div class="p"><span class="nm">${_ovEsc(_ovNames(m.player1).join(' / '))}</span><span class="mut">×</span><span class="nm">${_ovEsc(_ovNames(m.player2).join(' / '))}</span></div>
      <small>${_ovEsc([m.drawName, m.roundName].filter(Boolean).join(' · '))}</small>
    </div>`).join('') + '</div>';
}

// Quadras e próximos jogos acompanham o placar e as mudanças sem trocar de tela
let _ovSig = '';
function _ovSignature() {
  const t = typeof tournament !== 'undefined' ? tournament : null;
  if (!t) return 'none';
  return (t.matches || []).map(m => `${m.id}:${m.status}:${m.time}:${m.court || ''}:${m.liveScore || ''}:${m.score || ''}`).join(',');
}
function overviewTick() {
  try {
    if (typeof currentPage === 'undefined' || currentPage !== 'overview') return;
    const sig = _ovSignature();
    if (sig !== _ovSig) {
      _ovSig = sig;
      const t = typeof tournament !== 'undefined' ? tournament : null;
      renderOverviewCourts(t);
      renderOverviewNext(t);
    }
  } catch (e) { console.warn('[overviewTick]', e); }
}
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__fabdOverviewTicker) {
  window.__fabdOverviewTicker = setInterval(overviewTick, 2000);
}
