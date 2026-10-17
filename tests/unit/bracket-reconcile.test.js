import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

function loadReconcile(tournament, mocks = {}) {
  // Mock todas deps globais que o modulo usa em runtime
  const ctx = {
    tournament,
    areGroupsFinished: mocks.areGroupsFinished || (() => false),
    findTournamentMatch: mocks.findTournamentMatch || ((draw, idx, dm) => null),
    updateEliminationMatchesInList: mocks.updateEliminationMatchesInList || (() => {}),
    assignAutoTimes: mocks.assignAutoTimes || (() => {}),
    fillMissingTimesByDay: mocks.fillMissingTimesByDay || (() => false),
    computeGroupStandings: mocks.computeGroupStandings || (() => []),
    usesBestThirds: mocks.usesBestThirds || (() => false),
    buildBestThirdsQuarterfinals: mocks.buildBestThirdsQuarterfinals || (() => []),
    window: { api: { saveTournament: mocks.saveTournament || (() => Promise.resolve()) } },
  };
  return loadModule('src/js/modules/bracket-reconcile.js', ctx);
}

describe('repropagateAllResults — early returns', () => {
  it('no-op se tournament sem draws', () => {
    const t = { draws: [], matches: [] };
    const { repropagateAllResults } = loadReconcile(t);
    expect(() => repropagateAllResults()).not.toThrow();
  });

  it('no-op se tournament sem matches', () => {
    const t = { draws: [{ name:'X', matches:[] }], matches: [] };
    const { repropagateAllResults } = loadReconcile(t);
    expect(() => repropagateAllResults()).not.toThrow();
  });
});

describe('repropagateAllResults — eliminatoria', () => {
  function mkElim() {
    return {
      id: 't1',
      draws: [{
        id:'d1', name:'SM Sub11', type:'Eliminatoria',
        matches: [
          { round:1, slotIdx:0, player1:'A', player2:'B', winner:1, advancer:'A', score1:'21 21', score2:'15 18' },
          { round:1, slotIdx:1, player1:'C', player2:'D', winner:2, advancer:'D', score1:'15 17', score2:'21 21' },
          { round:2, slotIdx:0, player1:'', player2:'', winner:undefined, advancer:'', score1:'', score2:'' }
        ]
      }],
      matches: [
        { id:'1', num:1, drawName:'SM Sub11', drawMatchIdx:0, round:1, player1:'A', player2:'B', winner:1, status:'Finalizada', score:'21-15 / 21-18' },
        { id:'2', num:2, drawName:'SM Sub11', drawMatchIdx:1, round:1, player1:'C', player2:'D', winner:2, status:'Finalizada', score:'15-21 / 17-21' },
        { id:'3', num:3, drawName:'SM Sub11', drawMatchIdx:2, round:2, player1:'', player2:'', status:'A definir' }
      ]
    };
  }

  it('propaga advancers da R1 pra R2 (draw)', () => {
    const t = mkElim();
    const { repropagateAllResults } = loadReconcile(t, {
      findTournamentMatch: (drawName, idx, dm) => t.matches.find(m => m.drawName === drawName && m.drawMatchIdx === idx)
    });
    repropagateAllResults();
    const r2 = t.draws[0].matches[2];
    expect(r2.player1).toBe('A');
    expect(r2.player2).toBe('D');
  });

  it('propaga advancers da R1 pra tournament.matches da R2', () => {
    const t = mkElim();
    const { repropagateAllResults } = loadReconcile(t, {
      findTournamentMatch: (drawName, idx, dm) => t.matches.find(m => m.drawName === drawName && m.drawMatchIdx === idx)
    });
    repropagateAllResults();
    const r2tm = t.matches[2];
    expect(r2tm.player1).toBe('A');
    expect(r2tm.player2).toBe('D');
    expect(r2tm.status).toBe('Pendente');
    expect(r2tm.isDefinida).toBe(true);
  });

  it('BYE em R1 auto-avança o jogador real', () => {
    const t = {
      id:'t1',
      draws: [{
        name:'SM', type:'Eliminatoria',
        matches: [
          { round:1, slotIdx:0, player1:'A', player2:'BYE', winner:undefined, advancer:'', score1:'', score2:'' },
          { round:2, slotIdx:0, player1:'', player2:'', winner:undefined, advancer:'' }
        ]
      }],
      matches: [{ drawName:'SM', drawMatchIdx:0, round:1, player1:'A', player2:'BYE' }]
    };
    const { repropagateAllResults } = loadReconcile(t, {
      findTournamentMatch: () => null
    });
    repropagateAllResults();
    const r1 = t.draws[0].matches[0];
    expect(r1.winner).toBe(1);
    expect(r1.advancer).toBe('A');
  });
});

describe('propagateGroupsToElimination', () => {
  it('retorna false se grupos NAO finalizados', () => {
    const d = { groupsData: { groups:[], eliminationGenerated:false } };
    const { propagateGroupsToElimination } = loadReconcile({ matches:[] }, {
      areGroupsFinished: () => false
    });
    expect(propagateGroupsToElimination(d)).toBe(false);
  });

  it('retorna false se eliminationGenerated ja true', () => {
    const d = { groupsData: { groups:[], eliminationGenerated:true } };
    const { propagateGroupsToElimination } = loadReconcile({ matches:[] }, {
      areGroupsFinished: () => true
    });
    expect(propagateGroupsToElimination(d)).toBe(false);
  });

  it('marca eliminationGenerated=true apos sucesso', () => {
    const d = {
      groupQualifiers: 2,
      groupsData: {
        groups: [
          { name:'Grupo A', players:['A1','A2'], matches:[] },
          { name:'Grupo B', players:['B1','B2'], matches:[] }
        ],
        eliminationGenerated: false,
        eliminationMatches: []
      },
      matches: []
    };
    const { propagateGroupsToElimination } = loadReconcile({ matches:[] }, {
      areGroupsFinished: () => true,
      computeGroupStandings: (players, matches) => players.map(p => ({ name: p }))
    });
    const ok = propagateGroupsToElimination(d);
    expect(ok).toBe(true);
    expect(d.groupsData.eliminationGenerated).toBe(true);
    expect(d.groupsData.eliminationMatches.length).toBeGreaterThan(0);
  });
});

describe('buildGroupsElimPreview — previa em formato de chave', () => {
  function loadPreview(mocks = {}) {
    return loadModule('src/js/modules/bracket-reconcile.js', {
      tournament: null,
      usesBestThirds: mocks.usesBestThirds || (() => false),
      bestThirdsQuarterfinalLabels: mocks.bestThirdsQuarterfinalLabels || (() => []),
    });
  }

  it('2 grupos x 2: A1 x B2 e B1 x A2 + final vazia (igual a chave real)', () => {
    const { buildGroupsElimPreview } = loadPreview();
    const groups = [{ name: 'Grupo A', players: ['a1', 'a2', 'a3'] }, { name: 'Grupo B', players: ['b1', 'b2', 'b3'] }];
    const m = buildGroupsElimPreview(groups, 2);
    expect(m.map(x => [x.round, x.player1, x.player2])).toEqual([
      [1, '1o do Grupo A', '2o do Grupo B'],
      [1, '1o do Grupo B', '2o do Grupo A'],
      [2, '', ''],
    ]);
    expect(m.every(x => x.isPreview)).toBe(true);
  });

  it('3 grupos x 2 (melhores 3os): quartas com os rotulos, semis e final vazias', () => {
    const labels = [['1o do Grupo A', '2o melhor 3o colocado'], ['2o do Grupo B', '2o do Grupo C'], ['1o do Grupo C', '2o do Grupo A'], ['1o do Grupo B', 'Melhor 3o colocado']];
    const { buildGroupsElimPreview } = loadPreview({ usesBestThirds: () => true, bestThirdsQuarterfinalLabels: () => labels });
    const groups = ['A', 'B', 'C'].map(g => ({ name: `Grupo ${g}`, players: ['x', 'y', 'z', 'w'] }));
    const m = buildGroupsElimPreview(groups, 2);
    expect(m.filter(x => x.round === 1).map(x => [x.player1, x.player2])).toEqual(labels);
    expect(m.filter(x => x.round === 2).length).toBe(2);
    expect(m.filter(x => x.round === 3).length).toBe(1);
  });
});
