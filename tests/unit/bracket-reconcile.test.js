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
    prepareRankingsForSync: mocks.prepareRankingsForSync || (() => {}),
    window: { api: {
      saveTournament: mocks.saveTournament || (() => Promise.resolve()),
      supabaseUpsertTournament: mocks.supabaseUpsertTournament || (() => Promise.resolve()),
    } },
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

// II Festival (18/10/2026), SM Principal: 3 grupos + quartas. A 3a e a 4a quartas
// acabaram antes das outras e os vencedores (Luiz e Kelvin) apareceram na 1a semi
// da lista de partidas; a chave estava certa. Mesma estrutura, menor: 1 grupo com
// 2 jogos (idx 0-1), quartas (idx 2-5), semis (idx 6-7) e final (idx 8).
describe('repropagateAllResults — Grupos + Eliminatoria: vencedor na semi certa', () => {
  const Q = [['V', 'M'], ['K', 'J'], ['L', 'H'], ['E', 'P']];
  function mkGE({ quartasFeitas = [2, 3] } = {}) {
    const grupo = [
      { round: 1, player1: 'V', player2: 'K', winner: 1, score1: '15 15', score2: '3 4', phase: 'group', group: 'A' },
      { round: 1, player1: 'L', player2: 'E', winner: 1, score1: '15 15', score2: '5 6', phase: 'group', group: 'A' },
    ];
    const elim = [
      ...Q.map(([a, b], i) => {
        const feita = quartasFeitas.includes(i);
        return { round: 1, slotIdx: i, player1: a, player2: b, winner: feita ? 1 : undefined, advancer: feita ? a : '', score1: feita ? '15 15' : '', score2: feita ? '9 9' : '', isBye: false, phase: 'elimination' };
      }),
      { round: 2, slotIdx: 0, player1: '', player2: '', advancer: '', isBye: false, phase: 'elimination' },
      { round: 2, slotIdx: 1, player1: '', player2: '', advancer: '', isBye: false, phase: 'elimination' },
      { round: 3, slotIdx: 0, player1: '', player2: '', advancer: '', isBye: false, phase: 'elimination' },
    ];
    const lista = [
      ...grupo.map((g, i) => ({ num: i + 1, drawName: 'SM', drawMatchIdx: i, phase: 'group', group: 'A', round: 1, player1: g.player1, player2: g.player2, winner: 1, score: '15-3 / 15-4', status: 'Finalizada' })),
      ...Q.map(([a, b], i) => {
        const feita = quartasFeitas.includes(i);
        return { num: 3 + i, drawName: 'SM', drawMatchIdx: 2 + i, phase: 'elimination', round: 1, player1: a, player2: b, player1Display: a, player2Display: b, winner: feita ? 1 : undefined, score: feita ? '15-9 / 15-9' : '', status: feita ? 'Finalizada' : 'Em Quadra', isDefinida: true };
      }),
      { num: 7, drawName: 'SM', drawMatchIdx: 6, phase: 'elimination', round: 2, player1: '', player2: '', player1Display: 'Venc. jogo 3', player2Display: 'Venc. jogo 4', status: 'A definir', isDefinida: false },
      { num: 8, drawName: 'SM', drawMatchIdx: 7, phase: 'elimination', round: 2, player1: '', player2: '', player1Display: 'Venc. jogo 5', player2Display: 'Venc. jogo 6', status: 'A definir', isDefinida: false },
      { num: 9, drawName: 'SM', drawMatchIdx: 8, phase: 'elimination', round: 3, player1: '', player2: '', player1Display: 'Venc. jogo 7', player2Display: 'Venc. jogo 8', status: 'A definir', isDefinida: false },
    ];
    // Depois de salvar/abrir o JSON a chave (groupsData) e d.matches sao copias separadas
    const copia = o => JSON.parse(JSON.stringify(o));
    return {
      id: 't1', name: 'Festival',
      draws: [{
        name: 'SM', type: 'Grupos + Eliminatoria', groupQualifiers: 2,
        matches: copia([...grupo, ...elim]),
        groupsData: { groups: [{ name: 'Grupo A', players: ['V', 'K', 'L', 'E'], matches: copia(grupo) }], eliminationMatches: copia(elim), eliminationGenerated: true },
      }],
      matches: lista,
    };
  }

  function carregar(t, mocks = {}) {
    // updateEliminationMatchesInList de verdade (e ela que a lista usa pra seguir a chave)
    const { updateEliminationMatchesInList } = loadModule('src/js/modules/bracket-mutators.js', { tournament: t });
    return loadReconcile(t, { areGroupsFinished: () => true, updateEliminationMatchesInList, ...mocks });
  }
  const jogo = (t, num) => t.matches.find(m => m.num === num);

  it('3a e 4a quartas acabam primeiro: vencedores vao pra 2a semi (jogo 8), a 1a semi (jogo 7) fica a definir', () => {
    const t = mkGE({ quartasFeitas: [2, 3] });
    carregar(t).repropagateAllResults();
    expect([jogo(t, 8).player1, jogo(t, 8).player2, jogo(t, 8).status]).toEqual(['L', 'E', 'Pendente']);
    expect([jogo(t, 7).player1, jogo(t, 7).player2, jogo(t, 7).status]).toEqual(['', '', 'A definir']);
  });

  it('so a 4a quarta acabou: o vencedor vai pra vaga 2 da 2a semi, nao pra 1a semi', () => {
    const t = mkGE({ quartasFeitas: [3] });
    carregar(t).repropagateAllResults();
    expect([jogo(t, 8).player1, jogo(t, 8).player2]).toEqual(['', 'E']);
    expect([jogo(t, 7).player1, jogo(t, 7).player2]).toEqual(['', '']);
  });

  it('nome que ficou na semi errada sai da lista (vaga da chave vazia e jogo nao comecou)', () => {
    const t = mkGE({ quartasFeitas: [0, 2, 3] });
    const { repropagateAllResults } = carregar(t);
    repropagateAllResults();
    // estado que ele viu as 14:00: a 1a semi com o vencedor da 4a quarta
    Object.assign(jogo(t, 7), { player2: 'E', player2Display: 'E', status: 'Pendente', isDefinida: true });
    repropagateAllResults();
    expect([jogo(t, 7).player1, jogo(t, 7).player2, jogo(t, 7).player2Display]).toEqual(['V', '', 'Venc. jogo 4']);
    expect([jogo(t, 7).status, jogo(t, 7).isDefinida]).toEqual(['A definir', false]);
    expect([jogo(t, 8).player1, jogo(t, 8).player2]).toEqual(['L', 'E']);
  });

  it('manda a chave pro site quando o vencedor avanca, e nao manda de novo sem mudanca', () => {
    const t = mkGE({ quartasFeitas: [2, 3] });
    const envios = [];
    const { repropagateAllResults } = carregar(t, {
      supabaseUpsertTournament: (id, nome, dados) => { envios.push(JSON.parse(JSON.stringify(dados))); return Promise.resolve(); },
    });
    repropagateAllResults();
    expect(envios.length).toBe(1);
    const semi2 = envios[0].draws[0].groupsData.eliminationMatches.find(e => e.round === 2 && e.slotIdx === 1);
    expect([semi2.player1, semi2.player2]).toEqual(['L', 'E']);
    expect(envios[0].matches.find(m => m.num === 8).player2).toBe('E');
    repropagateAllResults();
    expect(envios.length).toBe(1);
  });
});
