import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// Regras de encaixe (grade, descanso, atletas possiveis) vem do schedule-slots.js
const slotsMod = loadModule('src/js/modules/schedule-slots.js');
const SLOTS = Object.fromEntries(Object.entries(slotsMod).filter(([k, v]) => k.startsWith('schedule') && typeof v === 'function'));

function loadRegen(tournament, mocks = {}) {
  const toastCalls = [];
  const renderCalls = { matches: 0, draws: 0 };
  const saveCalls = [];
  const ctx = {
    ...SLOTS,
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

describe('regenerateDrawSchedule — eliminatoria provisoria por rodada', () => {
  it('quartas dividem o horario, semis depois e a final por ultimo (sem herdar horario antigo)', async () => {
    const t = {
      id: 't1', courts: 4, matchDuration: 30, restMinBetweenGames: 20,
      startTime: '08:00', endTime: '18:00', breakStart: '00:00', breakEnd: '00:00',
      draws: [{ id: 'd1', name: 'SM Principal', type: 'Grupos + Eliminatoria', event: 'SM', matches: [{ round: 1 }], groupsData: { groups: [{ matches: [{ player1: 'A', player2: 'B' }, { player1: 'C', player2: 'D' }] }] } }],
      matches: [
        { drawName: 'SM Principal', drawMatchIdx: 0, player1: 'A', player2: 'B', round: 1, phase: 'group', status: 'Finalizada', time: '08:00', score: '21-10', winner: 1 },
        { drawName: 'SM Principal', drawMatchIdx: 1, player1: 'C', player2: 'D', round: 1, phase: 'group', status: 'Pendente', time: '08:50' },
        // Final provisoria antiga num horario ANTES das quartas (o bug do 50 -> 51)
        { drawName: 'SM Principal', drawMatchIdx: 8, player1: '', player2: '', round: 3, phase: 'elimination', status: 'A definir', time: '09:40' },
      ],
    };
    const elim = [[2, 1, 'Quartas'], [3, 1, 'Quartas'], [4, 1, 'Quartas'], [5, 1, 'Quartas'], [6, 2, 'Semifinal'], [7, 2, 'Semifinal'], [8, 3, 'Final']];
    const { regenerateDrawSchedule } = loadRegen(t, {
      rebuildGroupsElimMatches: (d, arr) => {
        arr.push({ drawMatchIdx: 0, player1: 'A', player2: 'B', round: 1, group: 'A', phase: 'group' });
        arr.push({ drawMatchIdx: 1, player1: 'C', player2: 'D', round: 1, group: 'A', phase: 'group' });
        elim.forEach(([idx, round, roundName]) => arr.push({ drawMatchIdx: idx, player1: '', player2: '', round, roundName, phase: 'elimination' }));
      },
    });
    await regenerateDrawSchedule(0, true);
    const byIdx = idx => t.matches.find(m => m.drawMatchIdx === idx);
    // Quadra a cada 30 min; quem pode chegar (A-D) descansa 50 min inicio a inicio:
    // grupo C x D 08:50 -> quartas 10:00 (as 4 juntas) -> semis 11:00 -> final 12:00
    expect([2, 3, 4, 5].map(i => byIdx(i).time)).toEqual(['10:00', '10:00', '10:00', '10:00']);
    expect([6, 7].map(i => byIdx(i).time)).toEqual(['11:00', '11:00']);
    expect(byIdx(8).time).toBe('12:00');
    expect(t.matches.filter(m => m.phase === 'elimination').length).toBe(7);
  });
});

describe('fillMissingTimesByDay — torneio de 2 dias', () => {
  it('da horario so ao definido sem horario, no proprio dia, sem mexer nos outros', () => {
    const t = {
      courts: 2, matchDuration: 30, restMinBetweenGames: 20,
      startTime: '10:30', endTime: '18:00', breakStart: '00:00', breakEnd: '00:00',
      daySchedule: [
        { date: '2026-10-17', startTime: '10:30', endTime: '18:00', breakStart: '00:00', breakEnd: '00:00', draws: ['DX'] },
        { date: '2026-10-18', startTime: '08:00', endTime: '18:00', breakStart: '00:00', breakEnd: '00:00', draws: ['SM'] },
      ],
      matches: [
        { drawName: 'DX', player1: 'A', player2: 'B', status: 'Finalizada', time: '10:30' },
        { drawName: 'SM', player1: 'C', player2: 'D', status: 'Pendente', time: '08:00' },
        { drawName: 'SM', player1: 'E', player2: 'F', status: 'Pendente', time: '08:00' },
        { drawName: 'SM', player1: 'C', player2: 'E', status: 'Pendente', time: '' },
        { drawName: 'SM', player1: '', player2: '', status: 'A definir', isDefinida: false, time: '' },
      ],
    };
    const { fillMissingTimesByDay } = loadRegen(t);
    expect(fillMissingTimesByDay()).toBe(true);
    // Os horarios de amanha que ja existiam ficam (08:00 esta fora dos slots do torneio, que comeca 10:30).
    // C e E jogaram 08:00: descanso de 50 min inicio a inicio -> 09:00 na grade de 30 em 30
    expect(t.matches.map(m => m.time)).toEqual(['10:30', '08:00', '08:00', '09:00', '']);
  });

  it('nao faz nada quando todos os definidos ja tem horario', () => {
    const t = { matches: [{ drawName: 'X', player1: 'A', player2: 'B', status: 'Pendente', time: '09:00' }] };
    const { fillMissingTimesByDay } = loadRegen(t);
    expect(fillMissingTimesByDay()).toBe(false);
  });
});

describe('regenerateDrawSchedule — Todos contra Todos', () => {
  it('rodadas 2 e 3 ficam R2/R3 (nao Semifinal/Final)', async () => {
    const t = {
      id: 't1', courts: 4, matchDuration: 30, restMinBetweenGames: 20,
      startTime: '08:00', endTime: '18:00', breakStart: '00:00', breakEnd: '00:00',
      draws: [{
        id: 'd1', name: 'SF Principal', type: 'Todos contra Todos', event: 'SF',
        matches: [
          { round: 1, player1: 'A', player2: 'B' }, { round: 1, player1: 'C', player2: 'D' },
          { round: 2, player1: 'A', player2: 'C' }, { round: 2, player1: 'B', player2: 'D' },
          { round: 3, player1: 'A', player2: 'D' }, { round: 3, player1: 'B', player2: 'C' },
        ],
      }],
      matches: [],
    };
    const { regenerateDrawSchedule } = loadRegen(t);
    await regenerateDrawSchedule(0, true);
    const names = t.matches.filter(m => m.drawName === 'SF Principal').map(m => `${m.round}:${m.roundName}`).sort();
    expect(names).toEqual(['1:R1', '1:R1', '2:R2', '2:R2', '3:R3', '3:R3']);
  });
});
