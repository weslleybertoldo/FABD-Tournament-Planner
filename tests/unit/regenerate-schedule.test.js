import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

function loadRegen(tournament, mocks = {}) {
  const toastCalls = [];
  const renderCalls = { matches: 0, draws: 0 };
  const saveCalls = [];
  const ctx = {
    tournament,
    showToast: (msg, kind) => { toastCalls.push({ msg, kind }); },
    confirm: mocks.confirm || (() => true),
    rebuildGroupsElimMatches: mocks.rebuildGroupsElimMatches || ((d, arr) => {}),
    ensureDayScheduleDraws: mocks.ensureDayScheduleDraws || (() => {}),
    timeToMin: (t) => { const [h, m] = (t || '08:00').split(':').map(Number); return h * 60 + m; },
    minToTime: (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
    prepareRankingsForSync: () => {},
    renderMatches: () => { renderCalls.matches++; },
    renderDraws: () => { renderCalls.draws++; },
    window: {
      api: {
        saveTournament: (t) => { saveCalls.push(t); return Promise.resolve(); },
        supabaseUpsertTournament: () => {},
      },
    },
  };
  const mod = loadModule('src/js/modules/regenerate-schedule.js', ctx);
  return { ...mod, toastCalls, renderCalls, saveCalls };
}

describe('regenerateDrawSchedule — early returns', () => {
  it('toast warning quando drawIdx < 0', async () => {
    const t = { draws: [{ name: 'X' }], matches: [] };
    const { regenerateDrawSchedule, toastCalls } = loadRegen(t);
    await regenerateDrawSchedule(-1, true);
    expect(toastCalls).toEqual([{ msg: 'Chave invalida', kind: 'warning' }]);
  });

  it('toast warning quando drawIdx >= draws.length', async () => {
    const t = { draws: [{ name: 'X' }], matches: [] };
    const { regenerateDrawSchedule, toastCalls } = loadRegen(t);
    await regenerateDrawSchedule(99, true);
    expect(toastCalls[0].msg).toBe('Chave invalida');
  });

  it('aborta quando user nega confirm', async () => {
    const t = { draws: [{ name: 'X', matches: [] }], matches: [] };
    const { regenerateDrawSchedule, saveCalls } = loadRegen(t, { confirm: () => false });
    await regenerateDrawSchedule(0, false);
    expect(saveCalls.length).toBe(0);
  });

  it('toast warning quando chave sem partidas', async () => {
    const t = { draws: [{ name: 'X', matches: [] }], matches: [] };
    const { regenerateDrawSchedule, toastCalls } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    expect(toastCalls[0].msg).toBe('Sem partidas nesta chave');
  });
});

describe('regenerateDrawSchedule — eliminatoria simples', () => {
  function mkElim() {
    return {
      id: 't1',
      courts: 2,
      matchDuration: 30,
      restMinBetweenGames: 20,
      startTime: '08:00',
      endTime: '12:00',
      breakStart: '11:00',
      breakEnd: '11:30',
      draws: [{
        id: 'd1', name: 'SM Sub11', type: 'Eliminatoria', event: 'SM',
        matches: [
          { round: 1, player1: 'A', player2: 'B' },
          { round: 1, player1: 'C', player2: 'D' },
        ],
      }],
      matches: [
        { drawName: 'OUTRA', player1: 'X', player2: 'Y', time: '08:00', status: 'Pendente' },
      ],
    };
  }

  it('preserva matches de outras chaves', async () => {
    const t = mkElim();
    const { regenerateDrawSchedule } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    const outra = t.matches.filter(m => m.drawName === 'OUTRA');
    expect(outra.length).toBe(1);
    expect(outra[0].time).toBe('08:00');
  });

  it('cria 2 novos matches pra chave regenerada (mesmo num jogos)', async () => {
    const t = mkElim();
    const { regenerateDrawSchedule } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    const novos = t.matches.filter(m => m.drawName === 'SM Sub11');
    expect(novos.length).toBe(2);
    expect(novos.map(m => m.player1).sort()).toEqual(['A', 'C']);
  });

  it('atribui horario aos novos matches', async () => {
    const t = mkElim();
    const { regenerateDrawSchedule } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    const novos = t.matches.filter(m => m.drawName === 'SM Sub11');
    expect(novos.every(m => !!m.time)).toBe(true);
  });

  it('renumera tournament.matches do 1 ao N', async () => {
    const t = mkElim();
    const { regenerateDrawSchedule } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    expect(t.matches.map(m => m.num)).toEqual([1, 2, 3]);
    expect(t.matches.map(m => m.id)).toEqual(['1', '2', '3']);
  });

  it('chama saveTournament + renderMatches + renderDraws', async () => {
    const t = mkElim();
    const { regenerateDrawSchedule, saveCalls, renderCalls } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    expect(saveCalls.length).toBe(1);
    expect(renderCalls.matches).toBe(1);
    expect(renderCalls.draws).toBe(1);
  });
});

describe('regenerateDrawSchedule — preserva finalizados', () => {
  it('match Finalizada mantem score+winner+horario', async () => {
    const t = {
      id: 't1', courts: 2, matchDuration: 30, restMinBetweenGames: 20,
      startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:30',
      draws: [{
        id: 'd1', name: 'SM Sub11', type: 'Eliminatoria', event: 'SM',
        matches: [
          { round: 1, player1: 'A', player2: 'B' },
          { round: 1, player1: 'C', player2: 'D' },
        ],
      }],
      matches: [
        { drawName: 'SM Sub11', drawMatchIdx: 0, player1: 'A', player2: 'B', time: '09:00', court: '1', status: 'Finalizada', score: '21-15', winner: 1 },
        { drawName: 'SM Sub11', drawMatchIdx: 1, player1: 'C', player2: 'D', time: '10:00', court: '2', status: 'Pendente' },
      ],
    };
    const { regenerateDrawSchedule } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    const finalizada = t.matches.find(m => m.player1 === 'A' && m.player2 === 'B');
    expect(finalizada.status).toBe('Finalizada');
    expect(finalizada.score).toBe('21-15');
    expect(finalizada.winner).toBe(1);
    expect(finalizada.time).toBe('09:00');
  });
});

describe('regenerateDrawSchedule — Grupos + Eliminatoria', () => {
  it('usa rebuildGroupsElimMatches em vez de iterar draw.matches', async () => {
    let rebuildCalled = 0;
    const t = {
      id: 't1', courts: 2, matchDuration: 30, restMinBetweenGames: 20,
      startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:30',
      draws: [{
        id: 'd1', name: 'SM Sub11', type: 'Grupos + Eliminatoria', event: 'SM',
        matches: [{ round: 1, player1: 'X', player2: 'Y' }],
        groupsData: { groups: [{ name: 'A', players: ['X', 'Y'], matches: [] }] },
      }],
      matches: [
        { drawName: 'SM Sub11', drawMatchIdx: 0, player1: 'X', player2: 'Y', round: 1, status: 'Pendente' },
      ],
    };
    const { regenerateDrawSchedule } = loadRegen(t, {
      rebuildGroupsElimMatches: (d, arr) => {
        rebuildCalled++;
        arr.push({ drawMatchIdx: 0, player1: 'X', player2: 'Y', round: 1, group: 'A', phase: 'group' });
      },
    });
    await regenerateDrawSchedule(0, true);
    expect(rebuildCalled).toBe(1);
    expect(t.matches.find(m => m.drawName === 'SM Sub11').group).toBe('A');
  });
});
