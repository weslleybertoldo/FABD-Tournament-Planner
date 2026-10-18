import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { planLiveHistory, liveHistoryScore } = loadModule('src/js/modules/live-history.js');

const idOf = m => `T_${m.player1}_${m.player2}`;
const done = (p1, p2, extra = {}) => ({
  player1: p1, player2: p2, status: 'Finalizada', winner: 1,
  score: '21-15 / 15-21 / 21-18', court: 'Quadra 1', umpire: 'Victor Hugo',
  startedAt: '2026-10-18T12:00:00Z', finishedAt: '2026-10-18T12:25:00Z', ...extra
});

describe('planLiveHistory — jogos finalizados que sumiram do site', () => {
  it('jogo finalizado que nao esta em live_matches volta pro site com o placar', () => {
    const m = done('A', 'B');
    const plan = planLiveHistory([m], [], idOf);
    expect(plan).toHaveLength(1);
    expect(plan[0].match).toBe(m);
    expect(plan[0].score).toMatchObject({ winner: 1, final_score: '21-15 / 15-21 / 21-18', sets_p1: [21, 15, 21], sets_p2: [15, 21, 18] });
  });

  it('jogo que ja esta no site fica como esta (o que o arbitro mandou manda)', () => {
    const plan = planLiveHistory([done('A', 'B')], [{ id: 'T_A_B', status: 'Finalizada' }], idOf);
    expect(plan).toHaveLength(0);
  });

  it('jogo em quadra no site tambem nao e tocado (a recuperacao cuida dele)', () => {
    const plan = planLiveHistory([done('A', 'B')], [{ id: 'T_A_B', status: 'Em Quadra' }], idOf);
    expect(plan).toHaveLength(0);
  });

  it('so entra jogo que passou pela quadra, como no finalizeMatch (W.O. sem quadra fica fora)', () => {
    const wo = done('C', 'D', { status: 'WO', score: 'W.O.', startedAt: undefined });
    const plan = planLiveHistory([wo], [], idOf);
    expect(plan).toHaveLength(0);
  });

  it('W.O., desistencia e desqualificacao que passaram pela quadra entram', () => {
    const plan = planLiveHistory([
      done('A', 'B', { status: 'WO', score: 'W.O.' }),
      done('C', 'D', { status: 'Desistencia', score: '21-10 / 3-1' }),
      done('E', 'F', { status: 'Desqualificacao', score: 'DSQ' })
    ], [], idOf);
    expect(plan.map(p => p.match.player1)).toEqual(['A', 'C', 'E']);
  });

  it('jogo pendente, em quadra ou sem vencedor nao entra', () => {
    const plan = planLiveHistory([
      done('A', 'B', { status: 'Pendente' }),
      done('C', 'D', { status: 'Em Quadra' }),
      done('E', 'F', { winner: undefined })
    ], [], idOf);
    expect(plan).toHaveLength(0);
  });

  it('sem jogos ou sem estado do site nao quebra', () => {
    expect(planLiveHistory(undefined, undefined, idOf)).toEqual([]);
    expect(planLiveHistory([done('A', 'B')], undefined, idOf)).toHaveLength(1);
  });
});

describe('liveHistoryScore — linha de live_scores no formato do arbitro', () => {
  it('placar game a game vira sets, games ganhos e o ultimo game', () => {
    expect(liveHistoryScore(done('A', 'B'))).toEqual({
      current_set: 3, score_p1: 21, score_p2: 18,
      sets_p1: [21, 15, 21], sets_p2: [15, 21, 18],
      sets_won_p1: 2, sets_won_p2: 1,
      winner: 1, final_score: '21-15 / 15-21 / 21-18', umpire_name: 'Victor Hugo'
    });
  });

  it('aceita espacos soltos no placar ("21 - 15/15-21")', () => {
    const s = liveHistoryScore(done('A', 'B', { score: '21 - 15/15-21', winner: 2 }));
    expect(s).toMatchObject({ sets_p1: [21, 15], sets_p2: [15, 21], sets_won_p1: 1, sets_won_p2: 1, current_set: 2 });
  });

  it('placar especial (W.O., DSQ) vai sem sets, como o finalizeMatch manda', () => {
    expect(liveHistoryScore(done('A', 'B', { status: 'WO', score: 'W.O.', winner: 2, umpire: '' }))).toEqual({
      current_set: 1, score_p1: 0, score_p2: 0, sets_p1: [], sets_p2: [],
      sets_won_p1: 0, sets_won_p2: 0, winner: 2, final_score: 'W.O.', umpire_name: ''
    });
  });
});
