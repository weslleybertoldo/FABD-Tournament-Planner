// =====================================================================
// Regenerate Draw Schedule — regenera APENAS a agenda de UMA chave,
// preservando jogos das outras categorias + jogos finalizados/em quadra
// desta chave. Encaixa novos jogos em slots livres do dia da chave.
//
// regenerateDrawSchedule(drawIdx, skipConfirm): async. Mutador pesado.
//
// Deps globais:
// - tournament (mutavel)
// - showToast, confirm (UI)
// - rebuildGroupsElimMatches (app.js)
// - ensureDayScheduleDraws (schedule.js)
// - timeToMin, minToTime (app.js)
// - prepareRankingsForSync, renderMatches, renderDraws (app.js)
// - window.api.saveTournament, window.api.supabaseUpsertTournament (IPC)
//
// Issue #14 sub-tarefa 14.N — auditoria 2026-05-09.
// Cobertura: tests/unit/regenerate-schedule.test.js
// =====================================================================

async function regenerateDrawSchedule(drawIdx, skipConfirm) {
  const draws = tournament.draws || [];
  if (drawIdx < 0 || drawIdx >= draws.length) { showToast('Chave invalida', 'warning'); return; }
  const d = draws[drawIdx];
  const drawName = d.name;

  if (!skipConfirm && !confirm(`Regenerar agenda apenas da chave "${drawName}"?\n\nJogos de outras categorias NAO serao alterados.\nJogos finalizados e em quadra desta chave serao preservados.`)) return;

  // 1. Separar matches desta chave vs outras
  const drawMatches = (tournament.matches || []).filter(m => m.drawName === drawName);
  const otherMatches = (tournament.matches || []).filter(m => m.drawName !== drawName);

  if (!drawMatches.length && !d.matches?.length) { showToast('Sem partidas nesta chave', 'warning'); return; }

  // 2. Sincronizar matches desta chave com o draw (pegar novos jogos apos re-sorteio)
  const shouldExist = [];
  if (d.type === 'Grupos + Eliminatoria' && d.groupsData) {
    const tempArr = [];
    rebuildGroupsElimMatches(d, tempArr);
    tempArr.forEach(m => shouldExist.push({ drawName: d.name, drawId: d.id, drawMatchIdx: m.drawMatchIdx, player1: m.player1, player2: m.player2, player1Display: m.player1Display, player2Display: m.player2Display, round: m.round, roundName: m.roundName, event: d.event, group: m.group, phase: m.phase }));
  } else {
    let mNum = 1; const mNums = new Map();
    (d.matches || []).forEach((m, i) => { if ((m.player1 && m.player2 && m.player2 !== 'BYE' && m.player1 !== 'BYE') || m.round > 1) { mNums.set(i, mNum); mNum++; } });
    const matchesByRound = {};
    (d.matches || []).forEach((m, i) => { if (!matchesByRound[m.round]) matchesByRound[m.round] = []; matchesByRound[m.round].push({ match: m, idx: i }); });
    let futIdx = 0;
    (d.matches || []).forEach((m, i) => {
      if (m.player2 === 'BYE' || m.player1 === 'BYE') return;
      if (m.round === 1 && ((m.player1 && !m.player2) || (!m.player1 && m.player2))) return;
      const p1 = m.player1 || '', p2 = m.player2 || '';
      // R1 vazio = chave nao sorteada (ignorar). R>1 vazio = placeholder de bracket — gera "Venc. jogo X"
      if (m.round === 1 && !p1 && !p2) return;
      let d1 = p1, d2 = p2;
      if ((!p1 || !p2) && m.round > 1) {
        const prevAll = matchesByRound[m.round - 1] || [];
        const f1 = prevAll[futIdx * 2], f2 = prevAll[futIdx * 2 + 1];
        if (!p1 && f1) { const fn = mNums.get(f1.idx); d1 = fn ? `Venc. jogo ${fn}` : 'A definir'; }
        if (!p2 && f2) { const fn = mNums.get(f2.idx); d2 = fn ? `Venc. jogo ${fn}` : 'A definir'; }
        futIdx++;
      }
      shouldExist.push({ drawName: d.name, drawId: d.id, drawMatchIdx: i, player1: p1, player2: p2, player1Display: d1, player2Display: d2, round: m.round, event: d.event });
    });
  }

  // 3. Mapear slots existentes desta chave (preservar horarios de jogos que continuam)
  // Indexa por drawMatchIdx (preferido) E por par player1+player2 (fallback —
  // garante que mesma dupla mantém o mesmo horario mesmo se o re-sorteio mudou
  // a posicao na bracket). Reforco v3.88.
  const existingSlots = new Map();
  const existingByPlayers = new Map();
  function _pairKey(p1, p2) { if (!p1 || !p2) return null; return [p1, p2].sort().join('||'); }
  drawMatches.forEach(m => {
    const data = { time: m.time, court: m.court, umpire: m.umpire, status: m.status, score: m.score, winner: m.winner, startedAt: m.startedAt, finishedAt: m.finishedAt };
    if (m.drawMatchIdx != null) existingSlots.set(m.drawMatchIdx, data);
    const pk = _pairKey(m.player1, m.player2);
    if (pk) existingByPlayers.set(pk, data);
  });

  // 4. Construir novos matches desta chave, reutilizando slots quando possivel
  const newDrawMatches = [];
  const preservedStatuses = ['Finalizada', 'WO', 'Em Quadra', 'Desistencia', 'Desqualificacao'];

  shouldExist.forEach(s => {
    // Prefere drawMatchIdx; fallback pelo par de jogadores (mesma dupla = mesmo horario)
    let existing = existingSlots.get(s.drawMatchIdx);
    if (!existing) {
      const pk = _pairKey(s.player1, s.player2);
      if (pk) existing = existingByPlayers.get(pk);
    }
    const def = !!(s.player1 && s.player2);
    let rn = s.roundName || '';
    if (!rn) {
      const totalR = Math.max(...(d.matches || []).map(x => x.round) || [1]);
      rn = s.round === totalR ? 'Final' : s.round === totalR - 1 ? 'Semifinal' : `R${s.round}`;
    }

    const match = {
      drawId: s.drawId, drawName: s.drawName, drawMatchIdx: s.drawMatchIdx, event: s.event,
      round: s.round, roundName: rn,
      player1: s.player1, player2: s.player2,
      player1Display: s.player1Display || s.player1 || 'A definir',
      player2Display: s.player2Display || s.player2 || 'A definir',
      isDefinida: def, score: '', court: '', time: '', umpire: '',
      status: def ? 'Pendente' : 'A definir', phase: s.phase || '', group: s.group || ''
    };

    // Preservar dados de jogos finalizados/em quadra
    if (existing && preservedStatuses.includes(existing.status)) {
      match.time = existing.time;
      match.court = existing.court;
      match.umpire = existing.umpire;
      match.status = existing.status;
      match.score = existing.score;
      match.winner = existing.winner;
      match.startedAt = existing.startedAt;
      match.finishedAt = existing.finishedAt;
    }
    // Reutilizar horario do slot antigo se existia (mesmo numero de jogos = mesmo horario)
    else if (existing && existing.time) {
      match.time = existing.time;
      match.court = existing.court || '';
      match.umpire = existing.umpire || '';
    }

    newDrawMatches.push(match);
  });

  // 5. Encontrar slots vazios e encaixar novos jogos (respeitando daySchedule)
  const _dur = tournament.matchDuration || 30, _rest = tournament.restMinBetweenGames || 20;
  const _slotDur = _dur + _rest, _courts = tournament.courts || 4;

  // Determinar qual dia esta chave pertence
  ensureDayScheduleDraws();
  let _dayConfig = null;
  if (tournament.daySchedule?.length) {
    _dayConfig = tournament.daySchedule.find(day => (day.draws || []).includes(drawName));
  }
  const _start = timeToMin(_dayConfig?.startTime || tournament.startTime || '08:00');
  const _end = timeToMin(_dayConfig?.endTime || tournament.endTime || '18:00');
  const _bS = timeToMin(_dayConfig?.breakStart || tournament.breakStart || '12:00');
  const _bE = timeToMin(_dayConfig?.breakEnd || tournament.breakEnd || '13:30');

  // Gerar slots de horario do DIA desta chave
  const _slots = [];
  let _cur = _start;
  while (_cur + _dur <= _end) {
    if (_cur >= _bS && _cur < _bE) { _cur = _bE; continue; }
    if (_cur + _dur > _bS && _cur < _bS) { _cur = _bE; continue; }
    _slots.push(_cur);
    _cur += _slotDur;
  }

  // Filtrar otherMatches: contar apenas os do MESMO DIA (para ocupacao correta dos slots)
  let _sameDayDraws = null;
  if (_dayConfig) {
    _sameDayDraws = new Set(_dayConfig.draws || []);
  }

  const _slotCount = new Array(_slots.length).fill(0);
  const _playerLastSlot = {};
  function _getP(name) { if (!name) return []; return name.includes('/') ? name.split('/').map(n => n.trim()).filter(Boolean) : [name.trim()]; }
  function _regP(name, si) { _getP(name).forEach(p => { _playerLastSlot[p] = si; }); }
  function _pOk(name, si) { return _getP(name).every(p => { const last = _playerLastSlot[p]; return last == null || si > last; }); }

  // Registrar matches de outras categorias DO MESMO DIA (slots ocupados que NAO mexemos)
  otherMatches.forEach(m => {
    if (!m.time) return;
    // Filtrar: so contar matches do mesmo dia
    if (_sameDayDraws && !_sameDayDraws.has(m.drawName)) return;
    const si = _slots.indexOf(timeToMin(m.time));
    if (si >= 0) { _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si); }
  });

  // Registrar matches DESTA chave que ja tem horario (preservados: finalizados, em quadra)
  newDrawMatches.forEach(m => {
    if (!m.time) return;
    const si = _slots.indexOf(timeToMin(m.time));
    if (si >= 0) { _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si); }
  });

  // Encaixar jogos sem horario nos slots vazios (respeitando conflito de atleta)
  newDrawMatches.forEach(m => {
    if (m.time || !m.isDefinida || m.status === 'A definir') return;
    for (let si = 0; si < _slots.length; si++) {
      if (_slotCount[si] >= _courts) continue;
      if (_pOk(m.player1, si) && _pOk(m.player2, si)) {
        m.time = minToTime(_slots[si]);
        _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si);
        return;
      }
    }
    // Fallback: qualquer slot com vaga
    for (let si = 0; si < _slots.length; si++) {
      if (_slotCount[si] < _courts) {
        m.time = minToTime(_slots[si]);
        _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si);
        return;
      }
    }
  });

  // Encaixar jogos "A definir" apos ultimo jogo definido da mesma chave (respeitando quadras)
  newDrawMatches.forEach(m => {
    if (m.time || m.status !== 'A definir') return;
    const sameDrawTimes = newDrawMatches.filter(x => x.drawName === m.drawName && x.time).map(x => timeToMin(x.time));
    if (!sameDrawTimes.length) return;
    const lastMin = Math.max(...sameDrawTimes);
    for (let si = 0; si < _slots.length; si++) {
      if (_slots[si] <= lastMin) continue;
      if (_slotCount[si] < _courts) {
        m.time = minToTime(_slots[si]);
        _slotCount[si]++;
        break;
      }
    }
  });

  // 6. Remontar tournament.matches: outras + novas desta chave, ordenados por dia e horario
  const allMatches = [...otherMatches, ...newDrawMatches];

  // Ordenar por dia (daySchedule) e depois por horario
  ensureDayScheduleDraws();
  const _dayDrawSets = (tournament.daySchedule || []).map(day => new Set(day.draws || []));
  allMatches.sort((a, b) => {
    // Primeiro: ordenar por dia
    let dayA = _dayDrawSets.length, dayB = _dayDrawSets.length;
    _dayDrawSets.forEach((s, i) => { if (s.has(a.drawName)) dayA = i; if (s.has(b.drawName)) dayB = i; });
    if (dayA !== dayB) return dayA - dayB;
    // Depois: ordenar por horario
    const ta = a.time ? timeToMin(a.time) : 9999;
    const tb = b.time ? timeToMin(b.time) : 9999;
    if (ta !== tb) return ta - tb;
    return (a.num || 0) - (b.num || 0);
  });

  tournament.matches = allMatches;

  // 7. Renumerar
  tournament.matches.forEach((m, i) => { m.id = (i + 1).toString(); m.num = i + 1; });

  // 9. Salvar e sincronizar
  await window.api.saveTournament(tournament);
  prepareRankingsForSync(); window.api.supabaseUpsertTournament(tournament.id, tournament.name, tournament);
  renderMatches();
  renderDraws();

  if (!skipConfirm) {
    const total = newDrawMatches.length;
    showToast(`Chave "${drawName}" regenerada: ${total} jogo(s). Outras categorias inalteradas.`, 'info');
  }
}
