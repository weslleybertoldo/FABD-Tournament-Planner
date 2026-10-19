// =====================================================================
// Situacao do jogo (igual ao BTP) — funcoes puras, sem globals.
//
// status do jogo encerrado:
//   'Finalizada'      jogo normal                       winner 1|2
//   'WO'              um lado nao veio (w.o.)           winner = quem veio
//   'Desistencia'     um lado desistiu no meio (Ret.)   winner = quem ficou, placar parcial
//   'Desqualificacao' um lado foi desqualificado (Dis.) winner = o outro, placar parcial
//   'SemJogo'         os dois nao vieram (No Match)     winner 0, ninguem avanca
// m.atestado: W.O. com atestado medico (pontua como derrota da rodada).
// m.porDesq: W.O. lancado porque o atleta foi desqualificado em outra
//   categoria (BWF 31.5: sai de todas e mantem os pontos ja ganhos).
//
// O texto de resultText vai igual pro Planner, pro site e pro
// live_scores.final_score — e por ele que o arbitro manda a situacao
// (parseFinalScore e o inverso). Regras escolhidas pelo Weslley em
// 18/10/2026 (CBBd primeiro, BWF onde a CBBd nao fala).
// Cobertura: tests/unit/match-result.test.js
// =====================================================================

const MATCH_DONE_STATUSES = ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao', 'SemJogo'];

function isMatchDone(m) {
  return !!m && MATCH_DONE_STATUSES.includes(m.status);
}

// Placar de sets sem as marcas antigas ('W.O.', 'DSQ', 'RET' = sem placar)
function matchSetsText(m) {
  const s = String((m && m.score) || '').trim();
  return (s === 'W.O.' || s === 'DSQ' || s === 'RET' || s === '-') ? '' : s;
}

function resultText(m) {
  if (!m) return '';
  const sets = matchSetsText(m);
  switch (m.status) {
    case 'WO': return m.atestado ? 'W.O. (atestado)' : 'W.O.';
    case 'Desistencia': return sets ? sets + ' Desist.' : 'Desist.';
    case 'Desqualificacao': return sets ? sets + ' Desq.' : 'Desq.';
    case 'SemJogo': return 'Sem jogo';
    default: return m.score || '';
  }
}

const RESULT_SPECIAL = ['WO', 'Desistencia', 'Desqualificacao', 'SemJogo'];
function isSpecialResult(m) {
  return !!m && RESULT_SPECIAL.includes(m.status);
}
function resultColor(status) {
  return ({ Desistencia: '#D97706', SemJogo: 'var(--fabd-gray-500)' })[status] || 'var(--fabd-red)';
}

// Rotulo longo (selo de status)
function resultStatusLabel(status) {
  return ({ Finalizada: 'Finalizada', WO: 'W.O.', Desistencia: 'Desistência', Desqualificacao: 'Desqualificação', SemJogo: 'Sem jogo' })[status] || status || '';
}

function parseFinalScore(text) {
  const t = String(text || '').trim();
  if (/^W\.O\./i.test(t)) return { status: 'WO', score: 'W.O.', atestado: /atestado/i.test(t) };
  if (/^sem jogo$/i.test(t)) return { status: 'SemJogo', score: '', atestado: false };
  let mm = /^(.*?)\s*Desist\.$/i.exec(t);
  if (mm) return { status: 'Desistencia', score: mm[1].trim(), atestado: false };
  mm = /^(.*?)\s*Desq\.$/i.exec(t);
  if (mm) return { status: 'Desqualificacao', score: mm[1].trim(), atestado: false };
  if (t === 'DSQ') return { status: 'Desqualificacao', score: '', atestado: false };
  if (t === 'RET') return { status: 'Desistencia', score: '', atestado: false };
  return { status: 'Finalizada', score: t, atestado: false };
}

// Resultado final vindo do arbitro (live_scores): precisa de vencedor,
// menos o Sem jogo (ninguem vence)
function isFinalScoreUpdate(data) {
  if (!data || !data.final_score) return false;
  if (data.winner) return true;
  return parseFinalScore(data.final_score).status === 'SemJogo';
}

// Placar da chave por lado: "15-8 / 15-13" -> {score1:'15 15', score2:'8 13'}.
// A marca da situacao vai do lado de quem perdeu (deu W.O., desistiu, foi
// desqualificado); no Sem jogo, dos dois lados.
function drawSidesFor(m) {
  const s1 = [], s2 = [];
  matchSetsText(m).split('/').map(s => s.trim()).filter(Boolean).forEach(s => {
    const p = s.split('-');
    if (p.length === 2) { s1.push(p[0].trim()); s2.push(p[1].trim()); }
  });
  let score1 = s1.join(' '), score2 = s2.join(' ');
  const mark = ({ WO: 'W.O.', Desistencia: 'Desist.', Desqualificacao: 'Desq.', SemJogo: 'Sem jogo' })[m && m.status];
  if (mark === 'Sem jogo') return { score1: mark, score2: mark };
  if (mark) {
    if (m.winner === 2) score1 = score1 ? score1 + ' ' + mark : mark;
    else score2 = score2 ? score2 + ' ' + mark : mark;
  }
  return { score1, score2 };
}

// Perdeu por W.O. sem justificativa (CBBd 9.6.1.4: 0 ponto). Vale pro jogo
// da lista e pro da chave (dados antigos: so 'W.O.' no placar da chave).
function lostByUnjustifiedWO(m, player) {
  if (!m || !player) return false;
  let status = m.status;
  if (!status && (m.score1 === 'W.O.' || m.score2 === 'W.O.')) status = 'WO';
  if (status === 'SemJogo') return m.player1 === player || m.player2 === player;
  if (status !== 'WO' || m.atestado || m.porDesq) return false;
  const loser = m.winner === 1 ? m.player2 : m.winner === 2 ? m.player1 : null;
  return loser === player;
}

// Desistencia/desqualificacao no meio do game: os games antes do ultimo tem
// que estar fechados; o ultimo pode estar pela metade. sets = [[p1,p2], ...]
function validatePartialSets(sets, points, maxPoints) {
  for (let i = 0; i < sets.length; i++) {
    const [a, b] = sets[i];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > maxPoints || b > maxPoints) {
      return { valid: false, error: `Game ${i + 1}: placar invalido` };
    }
    if (i < sets.length - 1) {
      const hi = Math.max(a, b), lo = Math.min(a, b);
      const closed = (hi >= points && hi - lo >= 2) || hi === maxPoints;
      if (!closed) return { valid: false, error: `Game ${i + 1}: so o ultimo game pode ficar pela metade` };
    }
  }
  return { valid: true };
}
