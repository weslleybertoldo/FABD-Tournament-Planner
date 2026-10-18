// =====================================================================
// Live History — ao abrir o torneio, devolve ao site Ao Vivo os jogos
// finalizados que sumiram de live_matches/live_scores. A lista "Partidas
// Finalizadas" do site sai so dessas duas tabelas (nao do torneio), e o app
// ate a v4.106 apagava as duas ao fechar — inclusive ao fechar pra atualizar
// (18/10/2026, II Festival). Pedido do Weslley: "sempre que eu abrir o
// arquivo do torneio o historico de jogos voltar junto no site do publico".
// So entra jogo que passou pela quadra (startedAt), como no finalizeMatch do
// main.js, e so o que falta no site: o que o arbitro mandou fica como esta.
// PURO: nao le DOM nem `tournament` — recebe tudo por parametro.
//
// Cobertura: tests/unit/live-history.test.js
// =====================================================================

const LIVE_HISTORY_DONE = ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao'];

// Linha de live_scores no mesmo formato do arbitro/finalizeMatch.
// "21-15 / 15-21 / 21-18" -> sets_p1 [21,15,21], sets_p2 [15,21,18].
// Placar especial (W.O., DSQ) vai sem sets, como o finalizeMatch manda.
function liveHistoryScore(m) {
  const sets = String(m.score || '').split('/')
    .map(s => s.trim().match(/^(\d+)\s*-\s*(\d+)$/))
    .filter(Boolean)
    .map(([, a, b]) => [parseInt(a, 10), parseInt(b, 10)]);
  const last = sets[sets.length - 1] || [0, 0];
  return {
    current_set: sets.length || 1,
    score_p1: last[0],
    score_p2: last[1],
    sets_p1: sets.map(s => s[0]),
    sets_p2: sets.map(s => s[1]),
    sets_won_p1: sets.filter(([a, b]) => a > b).length,
    sets_won_p2: sets.filter(([a, b]) => b > a).length,
    winner: m.winner,
    final_score: m.score || '',
    umpire_name: m.umpire || ''
  };
}

// matches: tournament.matches · liveMatches: linhas de live_matches do torneio
// idOf(m): id estavel do jogo local (mesma regra do stableMatchId do main.js).
// Retorna [{ match, score }] dos finalizados que nao estao em live_matches.
function planLiveHistory(matches, liveMatches, idOf) {
  const onSite = new Set((liveMatches || []).map(lm => lm.id));
  return (matches || [])
    .filter(m => LIVE_HISTORY_DONE.includes(m.status) && m.startedAt && m.winner && !onSite.has(idOf(m)))
    .map(m => ({ match: m, score: liveHistoryScore(m) }));
}
