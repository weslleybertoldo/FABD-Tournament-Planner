// =====================================================================
// Matches Forecast — numeros do painel de progresso da aba "Partidas":
// finalizadas, tempo medio em quadra, restante e previsao de termino,
// sempre POR DIA (o filtro de dia do topo da pagina).
// PURO: nao le DOM nem `tournament` — recebe tudo por parametro.
//
// Previsao = simula os jogos que faltam nas quadras do dia:
// - cada jogo dura o tempo medio em quadra (finalizados com inicio e fim);
// - 1 jogo por quadra; jogo em quadra termina em inicio + media;
// - atleta descansa restMin entre um jogo e outro;
// - jogo 'A definir' so comeca depois que a fase anterior da mesma chave
//   acabar (+ descanso): semis depois das quartas, final por ultimo.
// Dia futuro comeca a simular no horario de inicio dele.
//
// Cobertura: tests/unit/matches-forecast.test.js
// =====================================================================

const FORECAST_DONE_STATUS = ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao'];

function forecastIsDone(m) {
  return FORECAST_DONE_STATUS.includes(m.status);
}

// Tempo medio em quadra (s) dos finalizados com inicio e fim; null sem dados
function forecastAvgSec(matches) {
  const secs = matches
    .filter(m => forecastIsDone(m) && m.startedAt && m.finishedAt)
    .map(m => Math.floor((new Date(m.finishedAt) - new Date(m.startedAt)) / 1000))
    .filter(s => s > 0);
  if (!secs.length) return null;
  return { sec: Math.floor(secs.reduce((a, b) => a + b, 0) / secs.length), count: secs.length };
}

function forecastPlayers(m) {
  return [m.player1, m.player2]
    .flatMap(n => String(n || '').split('/'))
    .map(s => s.trim())
    .filter(Boolean);
}

// Fase dentro da chave: grupos (0) e depois as rodadas da eliminatoria
function forecastStage(m) {
  return m.phase === 'group' ? 0 : (m.round || 1);
}

function forecastTimeKey(m) {
  if (!m.time) return 9999;
  const [h, mm] = String(m.time).split(':').map(Number);
  return h * 60 + (mm || 0);
}

// Fim previsto (ms) do ultimo jogo que falta no dia; null se nao falta nada.
// opts: { nowMs, dayStartMs, courts, avgMs, restMs }
function forecastDayEndMs(dayMatches, opts) {
  const t0 = Math.max(opts.nowMs, opts.dayStartMs || 0);
  const courts = Math.max(1, opts.courts || 1);
  const endOf = new Map();
  const playerFree = new Map();
  const rest = (m, end) => forecastPlayers(m).forEach(p => {
    playerFree.set(p, Math.max(playerFree.get(p) || 0, end + opts.restMs));
  });
  const courtFree = [];
  let lastEnd = null;

  dayMatches.forEach(m => {
    if (forecastIsDone(m)) {
      const end = m.finishedAt ? new Date(m.finishedAt).getTime() : 0;
      endOf.set(m, end);
      if (end) rest(m, end);
    } else if (m.status === 'Em Quadra') {
      const start = m.startedAt ? new Date(m.startedAt).getTime() : t0;
      const end = Math.max(start + opts.avgMs, t0);
      endOf.set(m, end);
      rest(m, end);
      courtFree.push(end);
      lastEnd = Math.max(lastEnd || 0, end);
    }
  });
  while (courtFree.length < courts) courtFree.push(t0);

  const queue = dayMatches
    .filter(m => !endOf.has(m))
    .sort((a, b) => (forecastTimeKey(a) - forecastTimeKey(b)) || ((a.num || 0) - (b.num || 0)));

  while (queue.length) {
    const courtAt = Math.min(...courtFree);
    let pick = -1, pickStart = Infinity;
    queue.forEach((m, i) => {
      let ready = Math.max(t0, courtAt);
      if (m.status === 'A definir') {
        const prev = dayMatches.filter(x => x !== m && x.drawName === m.drawName && forecastStage(x) < forecastStage(m));
        if (prev.some(x => !endOf.has(x))) return; // fase anterior ainda nao simulada
        prev.forEach(x => { if (endOf.get(x)) ready = Math.max(ready, endOf.get(x) + opts.restMs); });
      }
      forecastPlayers(m).forEach(p => { ready = Math.max(ready, playerFree.get(p) || 0); });
      if (ready < pickStart) { pick = i; pickStart = ready; }
    });
    if (pick < 0) break;
    const m = queue.splice(pick, 1)[0];
    const end = pickStart + opts.avgMs;
    courtFree[courtFree.indexOf(courtAt)] = end;
    endOf.set(m, end);
    rest(m, end);
    lastEnd = Math.max(lastEnd || 0, end);
  }
  return lastEnd;
}

// Resumo de um conjunto de jogos (um dia) pro painel.
// opts: { nowMs, dayStartMs, courts, restMin, defaultMin, fallbackAvg }
// fallbackAvg = media do torneio, usada quando o dia ainda nao tem jogo medido.
function forecastSummary(dayMatches, opts) {
  const total = dayMatches.length;
  const done = dayMatches.filter(forecastIsDone).length;
  const inCourt = dayMatches.filter(m => m.status === 'Em Quadra').length;
  const toDefine = dayMatches.filter(m => m.status === 'A definir').length;
  const dayAvg = forecastAvgSec(dayMatches);
  const avg = dayAvg ? { ...dayAvg, source: 'dia' }
    : opts.fallbackAvg ? { ...opts.fallbackAvg, source: 'torneio' }
    : { sec: (opts.defaultMin || 30) * 60, count: 0, source: 'configurado' };
  const startMs = Math.max(opts.nowMs, opts.dayStartMs || 0);
  const endMs = total > done
    ? forecastDayEndMs(dayMatches, { nowMs: opts.nowMs, dayStartMs: opts.dayStartMs, courts: opts.courts, avgMs: avg.sec * 1000, restMs: (opts.restMin || 0) * 60000 })
    : null;
  const finishedTimes = dayMatches.filter(m => forecastIsDone(m) && m.finishedAt).map(m => new Date(m.finishedAt).getTime());
  return {
    total, done, inCourt, toDefine,
    pending: total - done - inCourt - toDefine,
    remaining: total - done,
    avg,
    startMs,
    endMs,
    remainingMin: endMs ? Math.max(0, Math.round((endMs - startMs) / 60000)) : 0,
    lastFinishedMs: finishedTimes.length ? Math.max(...finishedTimes) : null
  };
}
