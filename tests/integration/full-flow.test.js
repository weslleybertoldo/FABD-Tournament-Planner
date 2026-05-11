// Integracao: simula fluxo end-to-end de torneio carregando TODOS os modulos
// no mesmo contexto VM (igual index.html concatena scripts). Sem DOM/Electron.
//
// Cobre:
// 1. Geracao de bracket eliminatorio
// 2. Lancamento de resultado R1
// 3. Repropagacao (advancers R1 -> R2)
// 4. Geracao de fase de grupos + RR matches
// 5. Calculo standings
// 6. Propagacao grupos -> eliminatoria
// 7. Regenerate draw schedule (preserva outras chaves)
//
// Validar regressoes pos-modularizacao 14.A->14.N.

import { describe, it, expect, beforeEach } from 'vitest';
import { loadModulesShared } from './_loader-multi.js';

function buildCtx(tournament) {
  // Stubs de UI/IPC que app.js fornece em runtime
  const renders = { matches: 0, draws: 0 };
  const saves = [];
  return {
    tournament,
    showToast: () => {},
    confirm: () => true,
    // Stubs de helpers que ficam em app.js
    rebuildGroupsElimMatches: (d, arr) => {},
    ensureDayScheduleDraws: () => {},
    timeToMin: (t) => { const [h, m] = (t || '08:00').split(':').map(Number); return h * 60 + m; },
    minToTime: (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
    prepareRankingsForSync: () => {},
    renderMatches: () => { renders.matches++; },
    renderDraws: () => { renders.draws++; },
    assignAutoTimes: () => {},
    findTournamentMatch: (drawName, idx) => tournament.matches.find(m => m.drawName === drawName && m.drawMatchIdx === idx) || null,
    window: {
      api: {
        saveTournament: (t) => { saves.push(JSON.parse(JSON.stringify(t))); return Promise.resolve(); },
        supabaseUpsertTournament: () => {},
      },
    },
    _renders: renders,
    _saves: saves,
  };
}

const MODULES = [
  'src/js/modules/bracket-elim.js',
  'src/js/modules/bracket-roundrobin-groups.js',
  'src/js/modules/bracket-mutators.js',
  'src/js/modules/bracket-reconcile.js',
  'src/js/modules/regenerate-schedule.js',
];

describe('Integration — fluxo torneio eliminatoria', () => {
  it('gera bracket de 8 atletas com 4 seeds', () => {
    const t = {
      players: [
        { firstName: 'P1', lastName: '', club: 'A' },
        { firstName: 'P2', lastName: '', club: 'B' },
        { firstName: 'P3', lastName: '', club: 'C' },
        { firstName: 'P4', lastName: '', club: 'D' },
        { firstName: 'P5', lastName: '', club: 'E' },
        { firstName: 'P6', lastName: '', club: 'F' },
        { firstName: 'P7', lastName: '', club: 'G' },
        { firstName: 'P8', lastName: '', club: 'H' },
      ],
      draws: [],
      matches: [],
    };
    const ctx = loadModulesShared(MODULES, buildCtx(t));
    const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const seeds = ['P1', 'P2', 'P3', 'P4'];
    const matches = ctx.generateEliminationBracket(players, seeds);
    expect(matches.length).toBeGreaterThanOrEqual(7); // 4 QF + 2 SF + 1 F = 7
    // Seed 1 vs ultimo seeded ou non-seed
    expect(matches.some(m => m.player1 === 'P1' || m.player2 === 'P1')).toBe(true);
  });
});

describe('Integration — propagacao de resultado R1 -> R2', () => {
  it('repropagateAllResults preenche R2 com winners da R1', () => {
    const t = {
      players: [],
      draws: [{
        id: 'd1', name: 'SM Sub11', type: 'Eliminatoria',
        matches: [
          { round: 1, slotIdx: 0, player1: 'A', player2: 'B', winner: 1, advancer: 'A' },
          { round: 1, slotIdx: 1, player1: 'C', player2: 'D', winner: 2, advancer: 'D' },
          { round: 2, slotIdx: 0, player1: '', player2: '' },
        ],
      }],
      matches: [
        { id: '1', num: 1, drawName: 'SM Sub11', drawMatchIdx: 0, round: 1, player1: 'A', player2: 'B', winner: 1, status: 'Finalizada' },
        { id: '2', num: 2, drawName: 'SM Sub11', drawMatchIdx: 1, round: 1, player1: 'C', player2: 'D', winner: 2, status: 'Finalizada' },
        { id: '3', num: 3, drawName: 'SM Sub11', drawMatchIdx: 2, round: 2, player1: '', player2: '', status: 'A definir' },
      ],
    };
    const ctx = loadModulesShared(MODULES, buildCtx(t));
    ctx.repropagateAllResults();
    const r2 = t.draws[0].matches[2];
    expect(r2.player1).toBe('A');
    expect(r2.player2).toBe('D');
  });
});

describe('Integration — fase de grupos + standings', () => {
  it('gera grupos com 8 atletas em 2 grupos + RR matches', () => {
    const t = { players: [], draws: [], matches: [] };
    const ctx = loadModulesShared(MODULES, buildCtx(t));
    const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const seeds = ['P1', 'P2'];
    const { groups } = ctx.generateGroupsPhase(players, 2, seeds);
    expect(groups.length).toBe(2);
    expect(groups[0].players.length).toBe(4);
    expect(groups[1].players.length).toBe(4);
    // Cada grupo de 4: 6 jogos RR (4*3/2)
    expect(groups[0].matches.length).toBe(6);
  });

  it('computeGroupStandings classifica por wins -> ptsDiff -> ptsFor', () => {
    const ctx = loadModulesShared(MODULES, buildCtx({ players: [], draws: [], matches: [] }));
    const players = ['A', 'B', 'C'];
    const matches = [
      { player1: 'A', player2: 'B', winner: 1, score1: '21 21', score2: '15 15' },
      { player1: 'A', player2: 'C', winner: 1, score1: '21 21', score2: '10 10' },
      { player1: 'B', player2: 'C', winner: 1, score1: '21 21', score2: '15 15' },
    ];
    const standings = ctx.computeGroupStandings(players, matches);
    expect(standings[0].name).toBe('A'); // 2W
    expect(standings[1].name).toBe('B'); // 1W
    expect(standings[2].name).toBe('C'); // 0W
  });
});

describe('Integration — regenerate preserva outras chaves', () => {
  it('regenerateDrawSchedule muda so a chave alvo', async () => {
    const t = {
      players: [],
      courts: 2, matchDuration: 30, restMinBetweenGames: 20,
      startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:30',
      draws: [
        { id: 'd1', name: 'SM Sub11', type: 'Eliminatoria', event: 'SM',
          matches: [{ round: 1, player1: 'A', player2: 'B' }, { round: 1, player1: 'C', player2: 'D' }] },
        { id: 'd2', name: 'SF Sub11', type: 'Eliminatoria', event: 'SF',
          matches: [{ round: 1, player1: 'X', player2: 'Y' }] },
      ],
      matches: [
        { drawName: 'SM Sub11', drawMatchIdx: 0, player1: 'A', player2: 'B', time: '08:00', status: 'Pendente' },
        { drawName: 'SM Sub11', drawMatchIdx: 1, player1: 'C', player2: 'D', time: '08:50', status: 'Pendente' },
        { drawName: 'SF Sub11', drawMatchIdx: 0, player1: 'X', player2: 'Y', time: '09:00', status: 'Pendente' },
      ],
    };
    const ctx = loadModulesShared(MODULES, buildCtx(t));
    await ctx.regenerateDrawSchedule(0, true);
    const sf = t.matches.find(m => m.drawName === 'SF Sub11');
    expect(sf).toBeTruthy();
    expect(sf.time).toBe('09:00');
    expect(sf.player1).toBe('X');
  });
});

describe('Integration — propagateGroupsToElimination', () => {
  it('apos grupos completos, cria matches elim com 1os e 2os', () => {
    const t = {
      players: [],
      draws: [{
        id: 'd1', name: 'SM', type: 'Grupos + Eliminatoria',
        groupQualifiers: 2,
        groupsData: {
          eliminationGenerated: false,
          groups: [
            { name: 'Grupo A', players: ['A1', 'A2', 'A3'], matches: [
              { player1: 'A1', player2: 'A2', winner: 1, score1: '21 21', score2: '15 15' },
              { player1: 'A1', player2: 'A3', winner: 1, score1: '21 21', score2: '15 15' },
              { player1: 'A2', player2: 'A3', winner: 1, score1: '21 21', score2: '15 15' },
            ] },
            { name: 'Grupo B', players: ['B1', 'B2', 'B3'], matches: [
              { player1: 'B1', player2: 'B2', winner: 1, score1: '21 21', score2: '15 15' },
              { player1: 'B1', player2: 'B3', winner: 1, score1: '21 21', score2: '15 15' },
              { player1: 'B2', player2: 'B3', winner: 1, score1: '21 21', score2: '15 15' },
            ] },
          ],
        },
        matches: [],
      }],
      matches: [],
    };
    const ctx = loadModulesShared(MODULES, buildCtx(t));
    const draw = t.draws[0];
    const ok = ctx.propagateGroupsToElimination(draw);
    expect(ok).toBe(true);
    expect(draw.groupsData.eliminationGenerated).toBe(true);
    // Deve ter pelo menos 1 match elim
    expect(draw.groupsData.eliminationMatches.length).toBeGreaterThan(0);
  });
});
