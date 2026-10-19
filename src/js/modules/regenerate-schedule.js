// =====================================================================
// Regenerate Draw Schedule — regenera APENAS a agenda de UMA chave,
// preservando jogos das outras categorias + jogos finalizados/em quadra
// desta chave. Encaixa novos jogos em slots livres do dia da chave.
//
// regenerateDrawSchedule(drawIdx, skipConfirm): async. Mutador pesado.
// fillMissingTimesByDay(): da horario so aos definidos sem horario, por dia.
//
// Deps globais:
// - tournament (mutavel)
// - showToast, confirm (UI)
// - rebuildGroupsElimMatches (app.js)
// - ensureDayScheduleDraws (schedule.js)
// - timeToMin, minToTime (app.js)
// - scheduleStageOf, scheduleDaySlots, scheduleBook, scheduleAthletes, scheduleRole,
//   schedulePossibleAthletes, scheduleIsToDefine, schedulePlaceDefined,
//   schedulePlaceToDefine, scheduleMissingWarning (schedule-slots.js)
// - prepareRankingsForSync, renderMatches, renderDraws (app.js)
// - window.api.saveTournament, window.api.supabaseUpsertTournament (IPC)
//
// Issue #14 sub-tarefa 14.N — auditoria 2026-05-09.
// Cobertura: tests/unit/regenerate-schedule.test.js
// =====================================================================

// Da horario so a jogo DEFINIDO que esta sem, no slot do proprio dia, sem
// mexer em nenhum horario que ja existe: ocupacao das quadras e descanso
// contam os jogos do mesmo dia que ja tem horario. Usada depois de propagar
// resultados (repropagateAllResults). Antes era o assignAutoTimes com TODOS
// os jogos e os slots do torneio: num torneio de 2 dias ele apagava ou
// trocava os horarios do outro dia (17/10/2026, II Festival, ao fechar o
// grupo do DX). Retorna true se deu horario a algum jogo.
function fillMissingTimesByDay() {
  const all = tournament?.matches || [];
  const missing = all.filter(m => !m.time && m.isDefinida !== false && m.status !== 'A definir');
  if (!missing.length) return false;
  ensureDayScheduleDraws();
  const days = tournament.daySchedule?.length ? tournament.daySchedule : [null];
  const dur = tournament.matchDuration || 30, rest = tournament.restMinBetweenGames || 20;
  const drawOf = m => (tournament.draws || []).find(d => d.name === m.drawName);
  const athletesOf = m => scheduleIsToDefine(m) ? schedulePossibleAthletes(m, drawOf(m)) : scheduleAthletes(m.player1, m.player2);
  let changed = false;
  const dayCtx = tournament.roundDays;
  days.forEach((day, di) => {
    const inDay = m => !day || scheduleDayOf(m, days, dayCtx) === di; // dia do JOGO (fases por dia)
    const slots = scheduleDaySlots({
      start: timeToMin(day?.startTime || tournament.startTime || '08:00'),
      end: timeToMin(day?.endTime || tournament.endTime || '18:00'),
      breakStart: timeToMin(day?.breakStart || tournament.breakStart || '12:00'),
      breakEnd: timeToMin(day?.breakEnd || tournament.breakEnd || '13:30'),
      dur,
    });
    const book = scheduleBook({ dur, rest, courts: tournament.courts || 4 });
    all.filter(m => m.time && inDay(m)).forEach(m => book.add(timeToMin(m.time), athletesOf(m), scheduleRole(m)));
    missing.filter(inDay).forEach(m => {
      const ps = athletesOf(m);
      const si = schedulePlaceDefined(book, slots, ps, scheduleRole(m));
      if (si < 0) return; // sem horario que respeite quadra e descanso: fica sem
      m.time = minToTime(slots[si]);
      book.add(slots[si], ps, scheduleRole(m));
      changed = true;
    });
  });
  return changed;
}

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
    if (!rn && d.type === 'Todos contra Todos') {
      // Todos contra todos nao tem semifinal/final (mesmo nome da geracao da chave)
      rn = `R${s.round}`;
    } else if (!rn) {
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
    // Reutilizar horario do slot antigo se existia (mesmo numero de jogos = mesmo horario).
    // Provisorio da eliminatoria nao herda: e reencaixado por rodada mais abaixo
    else if (existing && existing.time && match.status !== 'A definir') {
      match.time = existing.time;
      match.court = existing.court || '';
      match.umpire = existing.umpire || '';
    }

    newDrawMatches.push(match);
  });

  // 5. Encaixar os jogos desta chave no dia dela (schedule-slots.js: a quadra
  // recebe jogo a cada duracao do jogo, o descanso e so do atleta e atleta
  // nunca fica em 2 jogos — sem horario que sirva, o jogo fica sem)
  const _dur = tournament.matchDuration || 30;

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
  const _slots = scheduleDaySlots({ start: _start, end: _end, breakStart: _bS, breakEnd: _bE, dur: _dur });
  const _book = scheduleBook({ dur: _dur, rest: tournament.restMinBetweenGames || 20, courts: tournament.courts || 4 });
  const _drawOf = m => (tournament.draws || []).find(x => x.name === m.drawName);
  const _athletes = m => scheduleIsToDefine(m) ? schedulePossibleAthletes(m, _drawOf(m)) : scheduleAthletes(m.player1, m.player2);
  const _fitsDay = t => t >= _start && t + _dur <= _end && !(_bE > _bS && t < _bE && t + _dur > _bS);

  // Outras categorias DO MESMO DIA seguram os horarios delas (nao mexemos)
  const _sameDayDraws = _dayConfig ? new Set(_dayConfig.draws || []) : null;
  otherMatches.forEach(m => {
    if (!m.time) return;
    if (_sameDayDraws && !_sameDayDraws.has(m.drawName)) return;
    _book.add(timeToMin(m.time), _athletes(m), scheduleRole(m));
  });

  // Desta chave: finalizados/em quadra seguram o horario; o horario
  // reaproveitado so fica se a quadra e os atletas (do novo sorteio) estao livres
  newDrawMatches.forEach(m => {
    if (m.time && preservedStatuses.includes(m.status)) _book.add(timeToMin(m.time), _athletes(m), scheduleRole(m));
  });
  newDrawMatches.forEach(m => {
    if (!m.time || preservedStatuses.includes(m.status)) return;
    const t = timeToMin(m.time), ps = _athletes(m);
    if (_fitsDay(t) && _book.courtFree(t) && _book.free(t, ps, scheduleRole(m))) { _book.add(t, ps, scheduleRole(m)); return; }
    m.time = '';
  });

  // Definidos sem horario: quadra livre e atletas descansados
  newDrawMatches.forEach(m => {
    if (m.time || !m.isDefinida || m.status === 'A definir') return;
    const ps = _athletes(m);
    const si = schedulePlaceDefined(_book, _slots, ps, scheduleRole(m));
    if (si < 0) return;
    m.time = minToTime(_slots[si]);
    _book.add(_slots[si], ps, scheduleRole(m));
  });

  // "A definir" depois da fase anterior da mesma chave (a mesma rodada divide o
  // horario e a final fica por ultimo), longe dos atletas que podem chegar nele
  [...newDrawMatches].sort((a, b) => scheduleStageOf(a) - scheduleStageOf(b)).forEach(m => {
    if (m.time || m.status !== 'A definir') return;
    const before = newDrawMatches.filter(x => x.time && scheduleStageOf(x) < scheduleStageOf(m)).map(x => timeToMin(x.time));
    if (!before.length) return;
    const ps = _athletes(m);
    const si = schedulePlaceToDefine(_book, _slots, ps, Math.max(...before), scheduleRole(m));
    if (si < 0) return;
    m.time = minToTime(_slots[si]);
    _book.add(_slots[si], ps, scheduleRole(m));
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
    const aviso = scheduleMissingWarning(newDrawMatches);
    showToast(`Chave "${drawName}" regenerada: ${total} jogo(s). Outras categorias inalteradas.${aviso}`, aviso ? 'warning' : 'info');
  }
}
