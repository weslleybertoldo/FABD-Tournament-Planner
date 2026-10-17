import { describe, it, expect } from 'vitest';
import { loadModulesShared } from '../integration/_loader-multi.js';

// Mesmo contexto do index.html: standings reais + regra dos 3os + gerador da chave
function loadAll() {
  return loadModulesShared([
    'src/js/modules/bracket-roundrobin-groups.js',
    'src/js/modules/bracket-best-thirds.js',
    'src/js/modules/bracket-reconcile.js',
  ], {
    tournament: { players: [], draws: [], matches: [] },
    findTournamentMatch: () => null,
    updateEliminationMatchesInList: () => {},
    assignAutoTimes: () => {},
    fillMissingTimesByDay: () => false,
    window: { api: { saveTournament: () => Promise.resolve() } },
  });
}

// Grupo com ordem final = ordem do array (cada um vence todos abaixo dele).
// loserPts[nome] = pontos por set do atleta quando ele perde (mexe no saldo).
function mkGroup(name, players, loserPts = {}) {
  const matches = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const lp = loserPts[players[j]] ?? 10;
      matches.push({ player1: players[i], player2: players[j], winner: 1, score1: '21 21', score2: `${lp} ${lp}` });
    }
  }
  return { name, players: [...players], matches };
}

function mkDraw(groups, qualifiers = 2) {
  return {
    groupQualifiers: qualifiers,
    groupsData: { groups, eliminationGenerated: false, eliminationMatches: [] },
    matches: [],
  };
}

const pairs = ms => ms.map(m => [m.player1, m.player2]);

describe('usesBestThirds', () => {
  const g = n => ({ players: Array.from({ length: n }, (_, i) => `P${i}`) });

  it('vale pra 3 grupos com 2 classificados', () => {
    const { usesBestThirds } = loadAll();
    expect(usesBestThirds([g(4), g(4), g(4)], 2)).toBe(true);
    expect(usesBestThirds([g(3), g(3), g(3)], 2)).toBe(true);
    expect(usesBestThirds([g(2), g(3), g(3)], 2)).toBe(true);
  });

  it('nao vale fora desse caso', () => {
    const { usesBestThirds } = loadAll();
    expect(usesBestThirds([g(4), g(4)], 2)).toBe(false);
    expect(usesBestThirds([g(4), g(4), g(4), g(4)], 2)).toBe(false);
    expect(usesBestThirds([g(4), g(4), g(4)], 1)).toBe(false);
    expect(usesBestThirds([g(4), g(4), g(4)], 3)).toBe(false);
    // so 1 grupo tem 3o colocado: nao da pra puxar 2
    expect(usesBestThirds([g(2), g(2), g(3)], 2)).toBe(false);
    expect(usesBestThirds(undefined, 2)).toBe(false);
  });
});

describe('rankGroupThirds', () => {
  it('ordena por vitorias, depois saldo de pontos', () => {
    const { rankGroupThirds } = loadAll();
    const groups = [
      mkGroup('Grupo A', ['A1', 'A2', 'A3', 'A4'], { A3: 5 }),   // 1 vitoria, saldo baixo
      mkGroup('Grupo B', ['B1', 'B2', 'B3', 'B4'], { B3: 19 }),  // 1 vitoria, saldo alto
      mkGroup('Grupo C', ['C1', 'C2', 'C3'], { C3: 20 }),        // 0 vitoria
    ];
    expect(rankGroupThirds(groups).map(t => t.name)).toEqual(['B3', 'A3', 'C3']);
  });

  it('empate total fica na ordem dos grupos', () => {
    const { rankGroupThirds } = loadAll();
    const groups = ['A', 'B', 'C'].map(x => mkGroup(`Grupo ${x}`, [`${x}1`, `${x}2`, `${x}3`, `${x}4`]));
    expect(rankGroupThirds(groups).map(t => t.name)).toEqual(['A3', 'B3', 'C3']);
  });
});

describe('buildBestThirdsQuarterfinals', () => {
  const groupsWithThirds = pts => ['A', 'B', 'C'].map(x =>
    mkGroup(`Grupo ${x}`, [`${x}1`, `${x}2`, `${x}3`, `${x}4`], { [`${x}3`]: pts[x] }));

  it('Q1 1oA x 2o melhor 3o, Q2 2oB x 2oC, Q3 1oC x 2oA, Q4 1oB x melhor 3o', () => {
    const { buildBestThirdsQuarterfinals } = loadAll();
    // 3os: A3 > B3 > C3
    const qf = buildBestThirdsQuarterfinals(groupsWithThirds({ A: 19, B: 15, C: 10 }));
    expect(pairs(qf)).toEqual([['A1', 'B3'], ['B2', 'C2'], ['C1', 'A2'], ['B1', 'A3']]);
  });

  it('melhor 3o do grupo B: troca pra nao pegar o 1o do B', () => {
    const { buildBestThirdsQuarterfinals } = loadAll();
    // 3os: B3 > C3 > A3
    const qf = buildBestThirdsQuarterfinals(groupsWithThirds({ A: 5, B: 19, C: 15 }));
    expect(qf[0]).toMatchObject({ player1: 'A1', player2: 'B3' });
    expect(qf[3]).toMatchObject({ player1: 'B1', player2: 'C3' });
  });

  it('2o melhor 3o do grupo A: troca pra nao pegar o 1o do A', () => {
    const { buildBestThirdsQuarterfinals } = loadAll();
    // 3os: C3 > A3 > B3
    const qf = buildBestThirdsQuarterfinals(groupsWithThirds({ A: 15, B: 5, C: 19 }));
    expect(qf[0]).toMatchObject({ player1: 'A1', player2: 'C3' });
    expect(qf[3]).toMatchObject({ player1: 'B1', player2: 'A3' });
  });

  it('nunca repete atleta e nunca cruza 1o com 2o/3o do mesmo grupo nas quartas', () => {
    const { buildBestThirdsQuarterfinals } = loadAll();
    const orders = [{ A: 19, B: 15, C: 10 }, { A: 10, B: 19, C: 15 }, { A: 15, B: 10, C: 19 },
      { A: 19, B: 10, C: 15 }, { A: 10, B: 15, C: 19 }, { A: 15, B: 19, C: 10 }];
    orders.forEach(pts => {
      const qf = buildBestThirdsQuarterfinals(groupsWithThirds(pts));
      const all = qf.flatMap(m => [m.player1, m.player2]);
      expect(new Set(all).size).toBe(8);
      qf.forEach(m => expect(m.player1[0]).not.toBe(m.player2[0]));
      // 1o e 2o do mesmo grupo em metades opostas (so se cruzam na final)
      const top = new Set([qf[0], qf[1]].flatMap(m => [m.player1, m.player2]));
      ['A', 'B', 'C'].forEach(x => expect(top.has(`${x}1`)).not.toBe(top.has(`${x}2`)));
    });
  });
});

describe('bestThirdsQuarterfinalLabels', () => {
  it('rotulos na ordem das quartas', () => {
    const { bestThirdsQuarterfinalLabels } = loadAll();
    expect(bestThirdsQuarterfinalLabels(['Grupo A', 'Grupo B', 'Grupo C'])).toEqual([
      ['1o do Grupo A', '2o melhor 3o colocado'],
      ['2o do Grupo B', '2o do Grupo C'],
      ['1o do Grupo C', '2o do Grupo A'],
      ['1o do Grupo B', 'Melhor 3o colocado'],
    ]);
  });
});

describe('propagateGroupsToElimination com os melhores 3os', () => {
  it('3 grupos x 2: fecha 8 nas quartas, depois semis e final', () => {
    const { propagateGroupsToElimination } = loadAll();
    const d = mkDraw(['A', 'B', 'C'].map((x, i) =>
      mkGroup(`Grupo ${x}`, [`${x}1`, `${x}2`, `${x}3`, `${x}4`], { [`${x}3`]: [19, 15, 10][i] })));
    expect(propagateGroupsToElimination(d)).toBe(true);
    const em = d.groupsData.eliminationMatches;
    expect(em.map(m => m.round)).toEqual([1, 1, 1, 1, 2, 2, 3]);
    expect(pairs(em.filter(m => m.round === 1))).toEqual([['A1', 'B3'], ['B2', 'C2'], ['C1', 'A2'], ['B1', 'A3']]);
    expect(em.filter(m => m.round === 1).map(m => m.slotIdx)).toEqual([0, 1, 2, 3]);
    expect(d.matches.length).toBe(7);
  });

  it('2 grupos continuam com 1oA x 2oB e 1oB x 2oA', () => {
    const { propagateGroupsToElimination } = loadAll();
    const d = mkDraw(['A', 'B'].map(x => mkGroup(`Grupo ${x}`, [`${x}1`, `${x}2`, `${x}3`, `${x}4`])));
    expect(propagateGroupsToElimination(d)).toBe(true);
    const em = d.groupsData.eliminationMatches;
    expect(pairs(em.filter(m => m.round === 1))).toEqual([['A1', 'B2'], ['B1', 'A2']]);
    expect(em.length).toBe(3);
  });

  it('4 grupos continuam sem 3os', () => {
    const { propagateGroupsToElimination } = loadAll();
    const d = mkDraw(['A', 'B', 'C', 'D'].map(x => mkGroup(`Grupo ${x}`, [`${x}1`, `${x}2`, `${x}3`])));
    expect(propagateGroupsToElimination(d)).toBe(true);
    const r1 = pairs(d.groupsData.eliminationMatches.filter(m => m.round === 1));
    expect(r1).toEqual([['A1', 'B2'], ['B1', 'A2'], ['C1', 'D2'], ['D1', 'C2']]);
  });
});
