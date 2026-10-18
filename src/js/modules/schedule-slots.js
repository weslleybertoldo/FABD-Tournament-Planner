// =====================================================================
// Schedule Slots — grade de horarios do dia e regras pra encaixar jogos.
// Regras (Weslley, 18/10/2026 — iguais as do BTP no torneio grande):
// - a quadra recebe jogo novo a cada `dur` min: o descanso NAO segura a
//   quadra (antes o horario andava jogo + descanso e a quadra ficava parada);
// - o atleta descansa `rest` min entre o fim de um jogo e o inicio do outro;
// - atleta nunca em 2 jogos ao mesmo tempo nem sem descanso: sem horario que
//   sirva, o jogo fica SEM horario (quem chama avisa);
// - jogo "A definir" segura o horario de todos os atletas que podem chegar
//   nele (o ja classificado + os que vem dos jogos que alimentam a vaga).
// PURO: nao le `tournament` nem DOM — recebe tudo por parametro.
// Usado por app.js (assignAutoTimes, rebuildMatchList, regenerateSchedule) e
// regenerate-schedule.js (fillMissingTimesByDay, regenerateDrawSchedule).
// Cobertura: tests/unit/schedule-slots.test.js
// =====================================================================

// Ordem das fases dentro de uma chave: grupos (0) e depois as rodadas da
// eliminatoria (1, 2, 3...).
function scheduleStageOf(m) {
  return m.phase === 'group' ? 0 : (m.round || 1);
}

// Inicio (min) de cada horario do dia: um a cada `dur`, pulando a pausa.
// cfg: { start, end, breakStart, breakEnd, dur } em minutos.
function scheduleDaySlots(cfg) {
  const dur = Math.max(1, cfg.dur || 30);
  const hasBreak = cfg.breakEnd > cfg.breakStart;
  const slots = [];
  let cur = cfg.start;
  while (cur + dur <= cfg.end) {
    if (hasBreak && cur < cfg.breakEnd && cur + dur > cfg.breakStart) { cur = cfg.breakEnd; continue; }
    slots.push(cur);
    cur += dur;
  }
  return slots;
}

// Atletas de um ou mais nomes: dupla "Ana / Bia" vira ["Ana", "Bia"];
// vazio e BYE ficam fora.
function scheduleAthletes(...names) {
  return names
    .flatMap(n => String(n || '').split('/'))
    .map(s => s.trim())
    .filter(s => s && s !== 'BYE');
}

function scheduleIsToDefine(m) {
  return m.status === 'A definir' || m.isDefinida === false;
}

// Atletas que podem jogar `m` (jogo da lista): os ja definidos + os que podem
// chegar pela chave `d`. Eliminatoria: os vencedores possiveis dos 2 jogos da
// rodada anterior que alimentam cada vaga vazia. Grupos + Eliminatoria: a vaga
// vazia da 1a rodada do mata-mata vem dos grupos (qualquer atleta dos grupos
// da chave — a conta fica do lado seguro).
function schedulePossibleAthletes(m, d) {
  const known = scheduleAthletes(m.player1, m.player2);
  if (!d || m.drawMatchIdx == null || m.phase === 'group') return known;

  let nodes = null, idx = m.drawMatchIdx, fromGroups = [];
  if (d.type === 'Grupos + Eliminatoria' && d.groupsData) {
    let groupMatches = 0;
    (d.groupsData.groups || []).forEach(g => (g.matches || []).forEach(x => {
      fromGroups.push(...scheduleAthletes(x.player1, x.player2));
      if (x.player1 && x.player2 && x.player1 !== 'BYE' && x.player2 !== 'BYE') groupMatches++;
    }));
    nodes = d.groupsData.eliminationMatches || [];
    idx = m.drawMatchIdx - groupMatches;
    // Mata-mata ainda sem chave (so os provisorios da lista): vem dos grupos
    if (!nodes[idx]) return [...new Set([...known, ...fromGroups])];
  } else if (d.type === 'Eliminatoria') {
    nodes = d.matches || [];
  } else {
    return known;
  }
  if (!nodes[idx]) return known;

  const byRound = {};
  nodes.forEach((n, i) => { (byRound[n.round] = byRound[n.round] || []).push(i); });
  const winnersOf = (i, depth) => {
    const n = nodes[i];
    if (!n || depth > 12) return [];
    if (n.winner === 1 || n.winner === 2) return scheduleAthletes(n['player' + n.winner]);
    if (typeof n.winner === 'string' && n.winner) return scheduleAthletes(n.winner);
    if (n.advancer) return scheduleAthletes(n.advancer);
    if (n.winner === 0) return []; // BYE x BYE: ninguem passa
    return slotAthletes(i, depth);
  };
  const slotAthletes = (i, depth) => {
    const n = nodes[i];
    const pos = (byRound[n.round] || []).indexOf(i);
    const prev = byRound[n.round - 1] || [];
    const out = [];
    [1, 2].forEach(s => {
      const name = n['player' + s];
      if (name && name !== 'BYE') { out.push(...scheduleAthletes(name)); return; }
      if (n.round <= 1 || !prev.length) { out.push(...fromGroups); return; }
      const f = prev[pos * 2 + (s - 1)];
      if (f != null) out.push(...winnersOf(f, depth + 1));
    });
    return out;
  };
  return [...new Set([...known, ...slotAthletes(idx, 0)])];
}

// Papel do jogo na agenda: `possivel` = "A definir" (os atletas so PODEM
// chegar nele) e `tag` = chave + fase. Jogos da MESMA fase de uma chave nunca
// dividem atleta (cada atleta esta numa vaga so): se um dos dois e "A definir",
// um nao bloqueia o outro — senao as 4 quartas, cada uma com "qualquer atleta
// dos grupos", nunca ficariam no mesmo horario.
function scheduleRole(m) {
  return { possivel: scheduleIsToDefine(m), tag: `${m.drawName || ''}|${scheduleStageOf(m)}` };
}

// Agenda de um dia em construcao: quadras ocupadas e horarios de cada atleta.
// cfg: { dur, rest, courts }. Horarios em minutos. A quadra conta jogo que
// se sobrepoe (vale pra horario fora da grade, de agenda antiga). Atleta
// `possivel` segura o horario, mas nao conta como o ultimo jogo que ele fez.
function scheduleBook(cfg) {
  const dur = Math.max(1, cfg.dur || 30);
  const gap = dur + Math.max(0, cfg.rest || 0); // inicio a inicio do mesmo atleta
  const starts = [];
  const byAthlete = new Map(); // atleta -> [{ t, possivel, tag }]
  const sameRound = (x, role) => !!(role && role.tag && x.tag === role.tag && (x.possivel || role.possivel));
  return {
    dur,
    courtFree(t) {
      return starts.filter(s => Math.abs(s - t) < dur).length < (cfg.courts || 1);
    },
    // Nenhum jogo do atleta (certo ou possivel) a menos de jogo + descanso
    free(t, athletes, role) {
      return athletes.every(a => (byAthlete.get(a) || []).every(x => sameRound(x, role) || Math.abs(x.t - t) >= gap));
    },
    // Depois do ultimo jogo certo do atleta + descanso: mantem a ordem das rodadas
    afterLast(t, athletes) {
      return athletes.every(a => {
        const certos = (byAthlete.get(a) || []).filter(x => !x.possivel).map(x => x.t);
        return !certos.length || t >= Math.max(...certos) + gap;
      });
    },
    add(t, athletes, role) {
      starts.push(t);
      athletes.forEach(a => {
        if (!byAthlete.has(a)) byAthlete.set(a, []);
        byAthlete.get(a).push({ t, possivel: !!(role && role.possivel), tag: role && role.tag });
      });
    },
  };
}

// Horario pra jogo definido: o 1o com quadra livre e atletas descansados
// depois do ultimo jogo deles; senao, o 1o buraco em que os atletas estao
// livres (com descanso) em qualquer ponto do dia. -1 = nenhum serve.
function schedulePlaceDefined(book, slots, athletes, role) {
  let si = slots.findIndex(t => book.courtFree(t) && book.free(t, athletes, role) && book.afterLast(t, athletes));
  if (si < 0) si = slots.findIndex(t => book.courtFree(t) && book.free(t, athletes, role));
  return si;
}

// Horario pra jogo "A definir": depois que a fase anterior da chave ACABA
// (lastStart = inicio do ultimo jogo dela), com quadra livre e longe (jogo +
// descanso) de todos os atletas que podem chegar nele. -1 = nenhum serve.
function schedulePlaceToDefine(book, slots, athletes, lastStart, role) {
  return slots.findIndex(t => t >= lastStart + book.dur && book.courtFree(t) && book.free(t, athletes, role));
}

// Fim do aviso do Regenerar: quantos jogos ficaram sem horario ('' = nenhum)
function scheduleMissingWarning(matches) {
  const n = matches.filter(m => !m.time).length;
  return n ? ` ⚠ ${n} jogo(s) ficaram SEM horario: falta quadra ou descanso no dia (veja em Partidas).` : '';
}
