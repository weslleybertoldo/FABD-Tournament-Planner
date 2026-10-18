import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { planLiveRecovery } = loadModule('src/js/modules/live-recovery.js');

const idOf = m => `T_${m.player1}_${m.player2}`;
const local = (p1, p2, extra = {}) => ({ player1: p1, player2: p2, status: 'Pendente', ...extra });

describe('planLiveRecovery — jogo que o arbitro esta marcando', () => {
  it('jogo pendente no local e em quadra com o arbitro volta pra quadra com quadra, arbitro e inicio', () => {
    const m = local('A', 'B');
    const plan = planLiveRecovery(
      [m],
      [{ id: 'T_A_B', status: 'Em Quadra', court: 'Quadra 3', umpire: '', created_at: '2026-10-18T11:51:33Z', updated_at: '2026-10-18T12:20:00Z' }],
      [{ match_id: 'T_A_B', score_p1: 11, score_p2: 5, winner: null, final_score: null, umpire_name: 'Victor Hugo' }],
      idOf
    );
    expect(plan.toCourt).toHaveLength(1);
    expect(plan.toCourt[0].match).toBe(m);
    expect(plan.toCourt[0]).toMatchObject({ court: 'Quadra 3', umpire: 'Victor Hugo', startedAt: '2026-10-18T11:51:33Z' });
    expect(plan.finals).toHaveLength(0);
  });

  it('sem arbitro no placar usa o arbitro do jogo; sem created_at usa o updated_at', () => {
    const plan = planLiveRecovery(
      [local('A', 'B')],
      [{ id: 'T_A_B', status: 'Em Quadra', court: 'Quadra 1', umpire: 'Pedro', updated_at: '2026-10-18T12:00:00Z' }],
      [],
      idOf
    );
    expect(plan.toCourt[0]).toMatchObject({ umpire: 'Pedro', startedAt: '2026-10-18T12:00:00Z' });
  });

  it('jogo ja em quadra no local fica como esta', () => {
    const plan = planLiveRecovery(
      [local('A', 'B', { status: 'Em Quadra', court: 'Quadra 2' })],
      [{ id: 'T_A_B', status: 'Em Quadra', court: 'Quadra 2' }],
      [], idOf
    );
    expect(plan.toCourt).toHaveLength(0);
  });

  it('quadra ocupada no local por outro jogo: o local manda', () => {
    const plan = planLiveRecovery(
      [local('C', 'D', { status: 'Em Quadra', court: 'Quadra 1' }), local('A', 'B')],
      [{ id: 'T_A_B', status: 'Em Quadra', court: 'Quadra 1' }],
      [], idOf
    );
    expect(plan.toCourt).toHaveLength(0);
  });

  it('dois jogos do arbitro na mesma quadra: so o primeiro volta', () => {
    const plan = planLiveRecovery(
      [local('A', 'B'), local('C', 'D')],
      [{ id: 'T_A_B', status: 'Em Quadra', court: 'Quadra 1' }, { id: 'T_C_D', status: 'Em Quadra', court: 'Quadra 1' }],
      [], idOf
    );
    expect(plan.toCourt.map(x => x.match.player1)).toEqual(['A']);
  });

  it('ignora linha do arbitro sem jogo local, jogo "A definir" e linha que nao esta em quadra', () => {
    const plan = planLiveRecovery(
      [local('A', 'B', { status: 'A definir' }), local('C', 'D')],
      [{ id: 'T_X_Y', status: 'Em Quadra', court: 'Quadra 1' }, { id: 'T_A_B', status: 'Em Quadra', court: 'Quadra 2' }, { id: 'T_C_D', status: 'Finalizada', court: 'Quadra 3' }],
      [], idOf
    );
    expect(plan.toCourt).toHaveLength(0);
    expect(plan.finals).toHaveLength(0);
  });
});

describe('planLiveRecovery — jogo que o arbitro finalizou com o app fechado', () => {
  const final = { match_id: 'T_A_B', winner: 1, final_score: '15-4 / 15-13', umpire_name: 'Larissa', updated_at: '2026-10-18T12:11:02Z' };

  it('entra com o resultado (pendente ou em quadra no local)', () => {
    for (const status of ['Pendente', 'Em Quadra']) {
      const plan = planLiveRecovery([local('A', 'B', { status })], [{ id: 'T_A_B', status: 'Finalizada' }], [final], idOf);
      expect(plan.finals).toEqual([final]);
      expect(plan.toCourt).toHaveLength(0);
    }
  });

  it('final no placar com o jogo ainda "Em Quadra" no live_matches: entra o resultado, nao volta pra quadra', () => {
    const plan = planLiveRecovery([local('A', 'B')], [{ id: 'T_A_B', status: 'Em Quadra', court: 'Quadra 2' }], [final], idOf);
    expect(plan.finals).toHaveLength(1);
    expect(plan.toCourt).toHaveLength(0);
  });

  it('local ja finalizado (ou WO) fica como esta', () => {
    for (const status of ['Finalizada', 'WO']) {
      const plan = planLiveRecovery([local('A', 'B', { status })], [{ id: 'T_A_B', status: 'Finalizada' }], [final], idOf);
      expect(plan.finals).toHaveLength(0);
    }
  });

  it('placar sem vencedor ou sem placar final nao e resultado', () => {
    const plan = planLiveRecovery([local('A', 'B')], [], [{ ...final, winner: null }, { ...final, match_id: 'T_A_B', final_score: '' }], idOf);
    expect(plan.finals).toHaveLength(0);
  });
});

describe('planLiveRecovery — sem nada com os arbitros', () => {
  it('listas vazias ou nulas nao mudam nada', () => {
    expect(planLiveRecovery([local('A', 'B')], [], [], idOf)).toEqual({ toCourt: [], finals: [] });
    expect(planLiveRecovery([local('A', 'B')], null, null, idOf)).toEqual({ toCourt: [], finals: [] });
  });
});
