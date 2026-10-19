import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// Situacao do jogo: W.O., desistencia (Ret.), desqualificacao (Dis.)
// e ambos ausentes (No Match), com as regras que o Weslley escolheu em 18/10/2026.
const R = loadModule('src/js/modules/match-result.js');
const G = loadModule('src/js/modules/bracket-roundrobin-groups.js');

describe('isMatchDone', () => {
  it('conta as 5 situacoes de jogo encerrado', () => {
    ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao', 'SemJogo'].forEach(status => {
      expect(R.isMatchDone({ status })).toBe(true);
    });
  });
  it('pendente, em quadra e a definir nao estao encerrados', () => {
    ['Pendente', 'Em Quadra', 'A definir', undefined].forEach(status => {
      expect(R.isMatchDone({ status })).toBe(false);
    });
  });
});

describe('resultText', () => {
  it('jogo normal mostra o placar', () => {
    expect(R.resultText({ status: 'Finalizada', score: '21-15 / 21-18' })).toBe('21-15 / 21-18');
  });
  it('W.O. sem placar, com atestado marcado', () => {
    expect(R.resultText({ status: 'WO', score: 'W.O.' })).toBe('W.O.');
    expect(R.resultText({ status: 'WO', score: 'W.O.', atestado: true })).toBe('W.O. (atestado)');
  });
  it('desistencia e desqualificacao guardam o placar parcial', () => {
    expect(R.resultText({ status: 'Desistencia', score: '21-15 / 5-2' })).toBe('21-15 / 5-2 Desist.');
    expect(R.resultText({ status: 'Desqualificacao', score: '3-1' })).toBe('3-1 Desq.');
    expect(R.resultText({ status: 'Desistencia', score: '' })).toBe('Desist.');
  });
  it('dados antigos (RET/DSQ no placar) viram so a marca', () => {
    expect(R.resultText({ status: 'Desistencia', score: 'RET' })).toBe('Desist.');
    expect(R.resultText({ status: 'Desqualificacao', score: 'DSQ' })).toBe('Desq.');
  });
  it('ambos ausentes', () => {
    expect(R.resultText({ status: 'SemJogo', score: '' })).toBe('Sem jogo');
  });
});

describe('parseFinalScore (o que o arbitro manda no live_scores.final_score)', () => {
  it('le cada situacao de volta', () => {
    expect(R.parseFinalScore('21-15 / 21-18')).toEqual({ status: 'Finalizada', score: '21-15 / 21-18', atestado: false });
    expect(R.parseFinalScore('W.O.')).toEqual({ status: 'WO', score: 'W.O.', atestado: false });
    expect(R.parseFinalScore('W.O. (atestado)')).toEqual({ status: 'WO', score: 'W.O.', atestado: true });
    expect(R.parseFinalScore('21-15 / 5-2 Desist.')).toEqual({ status: 'Desistencia', score: '21-15 / 5-2', atestado: false });
    expect(R.parseFinalScore('Desq.')).toEqual({ status: 'Desqualificacao', score: '', atestado: false });
    expect(R.parseFinalScore('Sem jogo')).toEqual({ status: 'SemJogo', score: '', atestado: false });
  });
  it('e o inverso do resultText', () => {
    const casos = [
      { status: 'Finalizada', score: '21-10 / 21-12' },
      { status: 'WO', score: 'W.O.', atestado: true },
      { status: 'Desistencia', score: '21-15 / 5-2' },
      { status: 'Desqualificacao', score: '' },
      { status: 'SemJogo', score: '' },
    ];
    casos.forEach(m => {
      const p = R.parseFinalScore(R.resultText(m));
      expect(p.status).toBe(m.status);
      expect(p.score).toBe(m.score);
      expect(p.atestado).toBe(!!m.atestado);
    });
  });
  it('final do arbitro: precisa de vencedor, menos o Sem jogo', () => {
    expect(R.isFinalScoreUpdate({ winner: 1, final_score: 'W.O.' })).toBe(true);
    expect(R.isFinalScoreUpdate({ winner: 0, final_score: 'Sem jogo' })).toBe(true);
    expect(R.isFinalScoreUpdate({ winner: 0, final_score: '21-15' })).toBe(false);
    expect(R.isFinalScoreUpdate({ winner: 2, final_score: '' })).toBe(false);
  });
});

describe('drawSidesFor (placar da chave por lado)', () => {
  it('jogo normal separa por lado', () => {
    expect(R.drawSidesFor({ status: 'Finalizada', score: '15-8 / 15-13', winner: 1 })).toEqual({ score1: '15 15', score2: '8 13' });
  });
  it('a marca fica do lado de quem perdeu (antes ia sempre no lado 1)', () => {
    expect(R.drawSidesFor({ status: 'WO', score: 'W.O.', winner: 1 })).toEqual({ score1: '', score2: 'W.O.' });
    expect(R.drawSidesFor({ status: 'WO', score: 'W.O.', winner: 2 })).toEqual({ score1: 'W.O.', score2: '' });
    expect(R.drawSidesFor({ status: 'Desistencia', score: '21-15 / 2-5', winner: 2 })).toEqual({ score1: '21 2 Desist.', score2: '15 5' });
    expect(R.drawSidesFor({ status: 'Desqualificacao', score: '', winner: 1 })).toEqual({ score1: '', score2: 'Desq.' });
  });
  it('ambos ausentes marca os dois lados', () => {
    expect(R.drawSidesFor({ status: 'SemJogo', score: '', winner: 0 })).toEqual({ score1: 'Sem jogo', score2: 'Sem jogo' });
  });
});

describe('drawMatchStatus e groupWithdrawnPlayers (BWF 16.2.5)', () => {
  it('le o status novo e o W.O. antigo (so no placar)', () => {
    expect(G.drawMatchStatus({ status: 'Desistencia', winner: 1 })).toBe('Desistencia');
    expect(G.drawMatchStatus({ score1: 'W.O.', score2: '', winner: 2 })).toBe('WO');
    expect(G.drawMatchStatus({ score1: '21 21', score2: '10 12', winner: 1 })).toBe('Finalizada');
    expect(G.drawMatchStatus({ score1: '', score2: '' })).toBe('');
  });
  it('quem deu W.O., desistiu ou foi desqualificado nao completa o grupo', () => {
    const out = G.groupWithdrawnPlayers([
      { player1: 'A', player2: 'B', winner: 1, status: 'WO' },
      { player1: 'C', player2: 'D', winner: 2, status: 'Desistencia' },
      { player1: 'E', player2: 'F', winner: 1, status: 'Finalizada' },
      { player1: 'G', player2: 'H', winner: 0, status: 'SemJogo' },
      { player1: 'I', player2: 'J', winner: 1, score1: '', score2: 'W.O.' },
    ]);
    expect([...out].sort()).toEqual(['B', 'C', 'G', 'H', 'J']);
  });
});

describe('computeGroupStandings sem os resultados de quem nao completou', () => {
  const players = ['A', 'B', 'C'];
  it('apaga os jogos de quem deu W.O. e o poe por ultimo, sem classificar', () => {
    const matches = [
      { player1: 'A', player2: 'B', winner: 1, score1: '21 21', score2: '5 5', status: 'Finalizada' },
      { player1: 'B', player2: 'C', winner: 1, score1: '21 21', score2: '19 19', status: 'Finalizada' },
      { player1: 'A', player2: 'C', winner: 1, score1: '', score2: 'W.O.', status: 'WO' },
    ];
    const s = G.computeGroupStandings(players, matches);
    expect(s.map(x => x.name)).toEqual(['A', 'B', 'C']);
    expect(s[2].withdrawn).toBe(true);
    // B x C nao conta mais: B so tem a derrota pro A
    expect(s[1].wins).toBe(0);
    expect(s[1].losses).toBe(1);
    expect(s[0].wins).toBe(1);
    expect(s[0].withdrawn).toBeFalsy();
    expect(s[1].withdrawn).toBeFalsy();
  });
  it('sem ninguem desistindo, igual a antes', () => {
    const matches = [
      { player1: 'A', player2: 'B', winner: 1, score1: '21 21', score2: '5 5' },
      { player1: 'B', player2: 'C', winner: 1, score1: '21 21', score2: '19 19' },
      { player1: 'A', player2: 'C', winner: 1, score1: '21 21', score2: '1 1' },
    ];
    expect(G.computeGroupStandings(players, matches).map(x => x.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('pontos do ranking (regras 1 e 2: W.O. sem justificativa = 0)', () => {
  it('quem deu W.O. sem atestado perde os pontos da rodada', () => {
    expect(R.lostByUnjustifiedWO({ status: 'WO', winner: 1, player1: 'A', player2: 'B' }, 'B')).toBe(true);
    expect(R.lostByUnjustifiedWO({ status: 'WO', winner: 1, player1: 'A', player2: 'B' }, 'A')).toBe(false);
  });
  it('W.O. com atestado ou por desqualificacao pontua a rodada', () => {
    expect(R.lostByUnjustifiedWO({ status: 'WO', winner: 1, player1: 'A', player2: 'B', atestado: true }, 'B')).toBe(false);
    expect(R.lostByUnjustifiedWO({ status: 'WO', winner: 1, player1: 'A', player2: 'B', porDesq: true }, 'B')).toBe(false);
  });
  it('desistencia e desqualificacao pontuam a rodada; ambos ausentes zera os dois', () => {
    expect(R.lostByUnjustifiedWO({ status: 'Desistencia', winner: 1, player1: 'A', player2: 'B' }, 'B')).toBe(false);
    expect(R.lostByUnjustifiedWO({ status: 'SemJogo', winner: 0, player1: 'A', player2: 'B' }, 'A')).toBe(true);
    expect(R.lostByUnjustifiedWO({ status: 'SemJogo', winner: 0, player1: 'A', player2: 'B' }, 'B')).toBe(true);
  });
  it('W.O. antigo (so no placar da chave) tambem zera', () => {
    expect(R.lostByUnjustifiedWO({ score1: 'W.O.', score2: '', winner: 2, player1: 'A', player2: 'B' }, 'A')).toBe(true);
  });
});

describe('validatePartialSets (desistencia/desqualificacao no meio do game)', () => {
  it('aceita o ultimo game incompleto', () => {
    expect(R.validatePartialSets([[21, 15], [5, 2]], 21, 30).valid).toBe(true);
    expect(R.validatePartialSets([], 21, 30).valid).toBe(true);
  });
  it('games antes do ultimo tem que estar fechados', () => {
    expect(R.validatePartialSets([[5, 2], [21, 15]], 21, 30).valid).toBe(false);
  });
  it('ponto acima do teto nao vale', () => {
    expect(R.validatePartialSets([[31, 2]], 21, 30).valid).toBe(false);
    expect(R.validatePartialSets([[-1, 2]], 21, 30).valid).toBe(false);
  });
});

// Placar automatico (Weslley, 18/10/2026): digitou os pontos de quem perdeu o
// game, o app completa os de quem ganhou pela regra do torneio — inclusive na
// prorrogacao (25 → 27), ate o maximo (29 → 30).
describe('winnerPointsFor (placar automatico)', () => {
  it('ate 19 pontos de quem perdeu, quem ganhou fez 21', () => {
    expect(R.winnerPointsFor(0, 21, 30)).toBe(21);
    expect(R.winnerPointsFor(15, 21, 30)).toBe(21);
    expect(R.winnerPointsFor(19, 21, 30)).toBe(21);
  });
  it('na prorrogacao, 2 a mais que quem perdeu', () => {
    expect(R.winnerPointsFor(20, 21, 30)).toBe(22);
    expect(R.winnerPointsFor(21, 21, 30)).toBe(23);
    expect(R.winnerPointsFor(25, 21, 30)).toBe(27);
    expect(R.winnerPointsFor(28, 21, 30)).toBe(30);
  });
  it('no 29 a 29, quem fizer o 30 ganha', () => {
    expect(R.winnerPointsFor(29, 21, 30)).toBe(30);
  });
  it('30 ou mais nao e de quem perdeu: nao completa', () => {
    expect(R.winnerPointsFor(30, 21, 30)).toBe(null);
    expect(R.winnerPointsFor(31, 21, 30)).toBe(null);
  });
  it('campo vazio, negativo ou com letra: nao completa', () => {
    expect(R.winnerPointsFor('', 21, 30)).toBe(null);
    expect(R.winnerPointsFor(null, 21, 30)).toBe(null);
    expect(R.winnerPointsFor(undefined, 21, 30)).toBe(null);
    expect(R.winnerPointsFor(-1, 21, 30)).toBe(null);
    expect(R.winnerPointsFor('1.5', 21, 30)).toBe(null);
    expect(R.winnerPointsFor('abc', 21, 30)).toBe(null);
  });
  it('aceita o valor do campo como texto', () => {
    expect(R.winnerPointsFor('15', 21, 30)).toBe(21);
    expect(R.winnerPointsFor(' 25 ', 21, 30)).toBe(27);
  });
  it('segue a regra do torneio (game de 15 ate 21, de 11 ate 15)', () => {
    expect(R.winnerPointsFor(10, 15, 21)).toBe(15);
    expect(R.winnerPointsFor(14, 15, 21)).toBe(16);
    expect(R.winnerPointsFor(20, 15, 21)).toBe(21);
    expect(R.winnerPointsFor(9, 11, 15)).toBe(11);
    expect(R.winnerPointsFor(14, 11, 15)).toBe(15);
  });
  it('o placar completado passa na validacao do game fechado', () => {
    for (let lo = 0; lo < 30; lo++) {
      const hi = R.winnerPointsFor(lo, 21, 30);
      const closed = (hi >= 21 && hi - lo >= 2) || hi === 30;
      expect(closed).toBe(true);
    }
  });
});
