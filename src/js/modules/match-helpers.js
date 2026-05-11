// =====================================================================
// Match Helpers — helpers de manipulacao de matches (extraidas de app.js).
// _stableMatchId(tournamentId, m): id deterministico de tournamentId + drawName
//   sanitizado + player1/2 sanitizados (NAO inclui match num — mantido
//   estavel mesmo com renumeracao).
// sortMatchesByBTPOrder(matches): ordena pelo padrao BTP (round → categoria →
//   modalidade → drawMatchIdx). Depende de globals `getCatIdx` e
//   `EVENT_ORDER_BTP` definidos em app.js.
// distributeMatches(matches): agrupa matches por categoria para distribuicao
//   entre quadras minimizando descanso.
// findTournamentMatch(drawName, drawMatchIdx, dm): lookup em
//   `tournament.matches` (global) por drawName + drawMatchIdx.
// Acoplamento explicito a globals: tournament, getCatIdx, EVENT_ORDER_BTP.
// Issue #14 sub-tarefa 14.I — auditoria 2026-05-09.
// =====================================================================

function _stableMatchId(tournamentId, m) {
  const draw = (m.drawName || '').replace(/[^a-zA-Z0-9]/g, '');
  const p1 = (m.player1 || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  const p2 = (m.player2 || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  return `${tournamentId}_${draw}_${p1}_${p2}`;
}

function sortMatchesByBTPOrder(matches) {
  return [...matches].sort((a, b) => {
    // 1. Round (R1 antes de R2)
    const ra = a.round || 1, rb = b.round || 1;
    if (ra !== rb) return ra - rb;
    // 2. Categoria (Sub 11 → Master II)
    const cIdxA = getCatIdx(a.drawName || '');
    const cIdxB = getCatIdx(b.drawName || '');
    if (cIdxA !== cIdxB) return cIdxA - cIdxB;
    // 3. Modalidade/sexo (M → F → X, simples antes duplas)
    const eA = a.event || (a.drawName || '').split(' ')[0] || '';
    const eB = b.event || (b.drawName || '').split(' ')[0] || '';
    const eIdxA = EVENT_ORDER_BTP.indexOf(eA);
    const eIdxB = EVENT_ORDER_BTP.indexOf(eB);
    const ea = eIdxA >= 0 ? eIdxA : 99;
    const eb = eIdxB >= 0 ? eIdxB : 99;
    if (ea !== eb) return ea - eb;
    // 4. Tiebreak: drawMatchIdx (estabilidade)
    return (a.drawMatchIdx || 0) - (b.drawMatchIdx || 0);
  });
}

function distributeMatches(matches) {
  if (matches.length <= 1) return matches;

  // Agrupar por categoria (drawName) para distribuir justamente dentro de cada categoria
  const byCategory = {};
  matches.forEach(m => {
    if (!byCategory[m.drawName]) byCategory[m.drawName] = [];
    byCategory[m.drawName].push(m);
  });

  // Dentro de cada categoria, ordenar por rodada
  Object.values(byCategory).forEach(arr => arr.sort((a, b) => a.round - b.round));

  // Distribuir intercalando categorias para variar quadras
  // E garantir que jogadores da mesma categoria tenham gaps iguais
  const result = [];
  const lastPlayed = {}; // jogador -> posicao do ultimo jogo
  const queues = Object.values(byCategory).map(arr => [...arr]);

  while (queues.some(q => q.length > 0)) {
    let bestMatch = null;
    let bestQueueIdx = -1;
    let bestScore = -Infinity;

    for (let qi = 0; qi < queues.length; qi++) {
      if (!queues[qi].length) continue;

      // Pegar o proximo jogo da categoria (respeitar rodada)
      const m = queues[qi][0];
      const pos = result.length;

      // Calcular gap minimo dos jogadores (quanto descansaram)
      const gap1 = lastPlayed[m.player1] != null ? pos - lastPlayed[m.player1] : 999;
      const gap2 = lastPlayed[m.player2] != null ? pos - lastPlayed[m.player2] : 999;
      const minGap = Math.min(gap1, gap2);

      // Prioridade: maior descanso + rodada menor + variar categorias
      const catLastPos = queues[qi]._lastPos || -999;
      const catGap = pos - catLastPos;
      const score = minGap * 100 + catGap * 10 - m.round;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
        bestQueueIdx = qi;
      }
    }

    if (!bestMatch) break;

    queues[bestQueueIdx].shift();
    queues[bestQueueIdx]._lastPos = result.length;
    lastPlayed[bestMatch.player1] = result.length;
    lastPlayed[bestMatch.player2] = result.length;
    result.push(bestMatch);
  }

  return result;
}

function findTournamentMatch(drawName,drawMatchIdx,dm){
  const ms=tournament.matches.filter(x=>x.drawName===drawName);
  // 1) Por drawMatchIdx (link direto)
  let tm=ms.find(x=>x.drawMatchIdx===drawMatchIdx);
  if(tm)return tm;
  // 2) Por round+players exatos
  tm=ms.find(x=>x.round===dm.round&&x.player1===dm.player1&&x.player2===dm.player2);
  if(tm)return tm;
  // 3) Por round + player1 match
  if(dm.player1)tm=ms.find(x=>x.round===dm.round&&x.player1===dm.player1);
  if(tm)return tm;
  // 4) Por round + player2 match
  if(dm.player2)tm=ms.find(x=>x.round===dm.round&&x.player2===dm.player2);
  if(tm)return tm;
  // 5) Por round + A definir (primeiro disponivel)
  tm=ms.find(x=>x.round===dm.round&&x.status==='A definir');
  if(tm)return tm;
  // 6) Por round + qualquer status sem player completo
  tm=ms.find(x=>x.round===dm.round&&(!x.player1||!x.player2));
  return tm||null;
}

