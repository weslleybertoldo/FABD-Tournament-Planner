// =====================================================================
// Melhores 3os — Grupos + Eliminatoria com 3 grupos e 2 classificados por
// grupo. Os 6 classificados nao fecham chave: puxa os 2 melhores 3os e
// fecha 8 nas quartas (regra combinada em 17/10/2026; a regra oficial da
// BWF, com bye pro 1o do A e pro 1o do B, fica pra depois).
//
// Quartas (ordem = slotIdx da R1; a R2 recebe Q1×Q2 e Q3×Q4):
//   Q1: 1o A × 2o melhor 3o
//   Q2: 2o B × 2o C
//   Q3: 1o C × 2o A
//   Q4: 1o B × melhor 3o
// 1o e 2o do mesmo grupo so se cruzam na final. Se um 3o cair contra o 1o
// do proprio grupo, os dois 3os trocam de lugar.
// Melhor 3o: vitorias -> saldo de pontos -> pontos feitos (a ordem da
// tabela do grupo, sem confronto direto: eles nao jogaram entre si).
//
// usesBestThirds(groups, qualifiers): true quando a regra vale (3 grupos,
//   2 classificados e pelo menos 2 grupos com 3o colocado).
// rankGroupThirds(groups): 3os de cada grupo, do melhor pro pior.
// buildBestThirdsQuarterfinals(groups): os 4 jogos {player1, player2}.
// bestThirdsQuarterfinalLabels(groupLabels): rotulos das quartas pra
//   previa e pros jogos provisorios da agenda.
//
// Deps globais: computeGroupStandings (bracket-roundrobin-groups.js)
// Cobertura: tests/unit/bracket-best-thirds.test.js
// =====================================================================

function usesBestThirds(groups, qualifiers) {
  if (!Array.isArray(groups) || groups.length !== 3 || qualifiers !== 2) return false;
  return groups.filter(g => (g.players || []).length >= 3).length >= 2;
}

function rankGroupThirds(groups) {
  const thirds = [];
  (groups || []).forEach((g, groupIdx) => {
    const s = computeGroupStandings(g.players || [], g.matches || [])[2];
    // quem nao completou o grupo (W.O., desistencia...) nao disputa a vaga
    if (s && !s.withdrawn) thirds.push({ name: s.name, groupIdx, wins: s.wins, ptsDiff: s.ptsDiff, ptsFor: s.ptsFor });
  });
  // sort estavel: empate total fica na ordem dos grupos (A, B, C)
  return thirds.sort((a, b) => (b.wins - a.wins) || (b.ptsDiff - a.ptsDiff) || (b.ptsFor - a.ptsFor));
}

function buildBestThirdsQuarterfinals(groups) {
  // vaga de quem nao completou o grupo vira BYE: o adversario passa direto
  const top = groups.map(g => computeGroupStandings(g.players || [], g.matches || []).slice(0, 2).map(s => s.withdrawn ? 'BYE' : s.name));
  const [A, B, C] = top;
  const [best, second] = rankGroupThirds(groups);
  // O pior dos 2 pega o 1o do A (grupo do cabeca 1) e o melhor pega o 1o do B
  let vsA = second, vsB = best;
  if ((vsA && vsA.groupIdx === 0) || (vsB && vsB.groupIdx === 1)) [vsA, vsB] = [vsB, vsA];
  return [
    { player1: A[0] || '', player2: vsA ? vsA.name : 'BYE' },
    { player1: B[1] || '', player2: C[1] || '' },
    { player1: C[0] || '', player2: A[1] || '' },
    { player1: B[0] || '', player2: vsB ? vsB.name : 'BYE' }
  ];
}

function bestThirdsQuarterfinalLabels(groupLabels) {
  const [a, b, c] = groupLabels;
  return [
    [`1o do ${a}`, '2o melhor 3o colocado'],
    [`2o do ${b}`, `2o do ${c}`],
    [`1o do ${c}`, `2o do ${a}`],
    [`1o do ${b}`, 'Melhor 3o colocado']
  ];
}
