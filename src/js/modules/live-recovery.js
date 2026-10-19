// =====================================================================
// Live Recovery — ao abrir o torneio, traz de volta o que esta com os
// arbitros (live_matches/live_scores) e o Planner nao sabe:
// - jogo que o arbitro esta marcando volta pra quadra (quadra, arbitro e
//   inicio de quando foi pra quadra);
// - jogo que o arbitro finalizou com o app fechado entra com o resultado.
// Fechar o app nao encerra o evento — so o botao "Fechar Torneio". Antes, ao
// abrir sem jogo em quadra no local, o Planner APAGAVA live_matches/live_scores
// (18/10/2026, II Festival: fechar sem querer com 4 jogos em quadra tirou os
// jogos do Planner; os arbitros so nao perderam porque a internet caiu).
// PURO: nao le DOM nem `tournament` — recebe tudo por parametro.
//
// Cobertura: tests/unit/live-recovery.test.js
// =====================================================================

const LIVE_RECOVERY_DONE = ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao', 'SemJogo'];

// matches: tournament.matches · liveMatches: linhas de live_matches do torneio
// liveScores: linhas de live_scores · idOf(m): id estavel do jogo local
// (mesma regra do stableMatchId do main.js).
// Retorna { toCourt: [{ match, court, umpire, startedAt }], finals: [linha de live_scores] }
function planLiveRecovery(matches, liveMatches, liveScores, idOf) {
  const byId = new Map((matches || []).map(m => [idOf(m), m]));
  const finals = [];
  const finalIds = new Set();
  (liveScores || []).forEach(s => {
    const m = byId.get(s.match_id);
    if (!m || LIVE_RECOVERY_DONE.includes(m.status)) return;
    // final = vencedor + final_score; o "Sem jogo" (ambos ausentes) vem sem vencedor
    if (!s.final_score || (!s.winner && !/^sem jogo$/i.test(String(s.final_score).trim()))) return;
    finals.push(s);
    finalIds.add(s.match_id);
  });

  const scoreOf = new Map((liveScores || []).map(s => [s.match_id, s]));
  const busy = new Set((matches || []).filter(m => m.status === 'Em Quadra' && m.court).map(m => m.court));
  const toCourt = [];
  (liveMatches || []).forEach(lm => {
    if (lm.status !== 'Em Quadra' || finalIds.has(lm.id)) return;
    const m = byId.get(lm.id);
    if (!m || m.status !== 'Pendente') return;
    // Quadra ja ocupada no local por outro jogo: o local manda
    if (lm.court && busy.has(lm.court)) return;
    if (lm.court) busy.add(lm.court);
    toCourt.push({
      match: m,
      court: lm.court || '',
      umpire: scoreOf.get(lm.id)?.umpire_name || lm.umpire || '',
      startedAt: lm.created_at || lm.updated_at || null
    });
  });
  return { toCourt, finals };
}
