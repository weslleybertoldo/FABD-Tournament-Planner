import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// match-helpers usa globals: getCatIdx, EVENT_ORDER, tournament
// Vou injetar mocks pra testes.
function loadMatchHelpers(extraCtx = {}) {
  const baseCtx = {
    // Mock minimos pras helpers que precisam de globals
    getCatIdx: (drawName) => {
      const cats = ['Sub 11','Sub 13','Sub 15','Sub 17','Sub 19','Sub 23','Principal','Senior','Master I','Master II'];
      for (let i = 0; i < cats.length; i++) if (drawName.includes(cats[i])) return i;
      return cats.length;
    },
    EVENT_ORDER: ['SM','SF','DM','DF','DX'],
    tournament: null,
    ...extraCtx
  };
  return loadModule('src/js/modules/match-helpers.js', baseCtx);
}

describe('_stableMatchId', () => {
  it('eh deterministico (mesma entrada -> mesmo id)', () => {
    const { _stableMatchId } = loadMatchHelpers();
    const m = { drawName: 'SM Principal', player1: 'Joao Silva', player2: 'Pedro Santos' };
    expect(_stableMatchId('t1', m)).toBe(_stableMatchId('t1', m));
  });

  it('inclui tournamentId no id', () => {
    const { _stableMatchId } = loadMatchHelpers();
    const m = { drawName: 'A', player1: 'X', player2: 'Y' };
    expect(_stableMatchId('t1', m)).not.toBe(_stableMatchId('t2', m));
  });

  it('inclui drawName sanitizado', () => {
    const { _stableMatchId } = loadMatchHelpers();
    const m1 = { drawName: 'SM Sub 11', player1: 'X', player2: 'Y' };
    const m2 = { drawName: 'SF Sub 11', player1: 'X', player2: 'Y' };
    expect(_stableMatchId('t1', m1)).not.toBe(_stableMatchId('t1', m2));
  });

  it('inclui players sanitizados (max 20 chars)', () => {
    const { _stableMatchId } = loadMatchHelpers();
    const m1 = { drawName: 'A', player1: 'Joao', player2: 'Pedro' };
    const m2 = { drawName: 'A', player1: 'Maria', player2: 'Pedro' };
    expect(_stableMatchId('t1', m1)).not.toBe(_stableMatchId('t1', m2));
  });

  it('NAO inclui match num (renumeracao preserva id)', () => {
    const { _stableMatchId } = loadMatchHelpers();
    const m1 = { drawName: 'A', player1: 'X', player2: 'Y', num: 5 };
    const m2 = { drawName: 'A', player1: 'X', player2: 'Y', num: 99 };
    expect(_stableMatchId('t1', m1)).toBe(_stableMatchId('t1', m2));
  });

  it('lida com nomes especiais (regex sanitiza)', () => {
    const { _stableMatchId } = loadMatchHelpers();
    const m = { drawName: "D'Almeida & Co.", player1: 'João-Pé!', player2: 'M@ria #1' };
    const id = _stableMatchId('t1', m);
    expect(id).toMatch(/^t1_/);
    expect(id).not.toContain("'");
    expect(id).not.toContain('@');
  });
});

describe('sortMatchesByRoundOrder', () => {
  it('ordena por round primeiro', () => {
    const { sortMatchesByRoundOrder } = loadMatchHelpers();
    const matches = [
      { round: 2, drawName: 'SM Principal', drawMatchIdx: 0 },
      { round: 1, drawName: 'SM Principal', drawMatchIdx: 0 }
    ];
    const sorted = sortMatchesByRoundOrder(matches);
    expect(sorted[0].round).toBe(1);
    expect(sorted[1].round).toBe(2);
  });

  it('ordena por categoria dentro do mesmo round (Sub 11 antes Master II)', () => {
    const { sortMatchesByRoundOrder } = loadMatchHelpers();
    const matches = [
      { round: 1, drawName: 'SM Master II', drawMatchIdx: 0 },
      { round: 1, drawName: 'SM Sub 11', drawMatchIdx: 0 }
    ];
    const sorted = sortMatchesByRoundOrder(matches);
    expect(sorted[0].drawName).toBe('SM Sub 11');
  });

  it('ordena por modalidade SM antes SF', () => {
    const { sortMatchesByRoundOrder } = loadMatchHelpers();
    const matches = [
      { round: 1, drawName: 'SF Sub 11', drawMatchIdx: 0 },
      { round: 1, drawName: 'SM Sub 11', drawMatchIdx: 0 }
    ];
    const sorted = sortMatchesByRoundOrder(matches);
    expect(sorted[0].drawName).toBe('SM Sub 11');
  });

  it('NAO muta array original', () => {
    const { sortMatchesByRoundOrder } = loadMatchHelpers();
    const orig = [{ round: 2, drawName: 'A' }, { round: 1, drawName: 'A' }];
    const copy = [...orig];
    sortMatchesByRoundOrder(orig);
    expect(orig).toEqual(copy);
  });
});

describe('distributeMatches', () => {
  it('retorna array com mesmo tamanho', () => {
    const { distributeMatches } = loadMatchHelpers();
    const matches = [
      { drawName: 'SM', round: 1, num: 1, player1: 'A', player2: 'B' },
      { drawName: 'SM', round: 1, num: 2, player1: 'C', player2: 'D' },
      { drawName: 'SF', round: 1, num: 3, player1: 'E', player2: 'F' }
    ];
    expect(distributeMatches(matches).length).toBe(matches.length);
  });

  it('intercala categorias diferentes pra dar descanso aos jogadores', () => {
    const { distributeMatches } = loadMatchHelpers();
    const matches = [
      { drawName: 'SM', round: 1, num: 1, player1: 'A', player2: 'B' },
      { drawName: 'SM', round: 1, num: 2, player1: 'A', player2: 'C' },
      { drawName: 'SF', round: 1, num: 3, player1: 'X', player2: 'Y' }
    ];
    const result = distributeMatches(matches);
    const aMatches = result.map((m,i) => ({m,i})).filter(x => x.m.player1==='A');
    if (aMatches.length === 2) {
      expect(aMatches[1].i - aMatches[0].i).toBeGreaterThan(1);
    }
  });

  it('retorna identico se 0 ou 1 elemento (early return)', () => {
    const { distributeMatches } = loadMatchHelpers();
    const m1 = [{ drawName: 'X' }];
    expect(distributeMatches(m1)).toBe(m1);
    expect(distributeMatches([])).toEqual([]);
  });
});

describe('formatScoreByGames', () => {
  it('mostra game a game, pontos do jogador 1 primeiro (padrao BWF)', () => {
    const { formatScoreByGames } = loadMatchHelpers();
    expect(formatScoreByGames('13-15 / 15-8 / 15-11')).toBe('13-15 / 15-8 / 15-11');
    expect(formatScoreByGames('15-13/7-15/ 9 - 15')).toBe('15-13 / 7-15 / 9-15');
    expect(formatScoreByGames('15-10')).toBe('15-10');
  });

  it('sem placar devolve vazio', () => {
    const { formatScoreByGames } = loadMatchHelpers();
    expect(formatScoreByGames('')).toBe('');
    expect(formatScoreByGames(null)).toBe('');
  });
});

// Numero do jogo fixo (19/10/2026): depois de dado, o numero nao muda; jogo
// novo ganha o proximo livre. So o Regenerar Horarios renumera.
describe('matchNextNumber', () => {
  it('lista vazia -> 1', () => {
    const { matchNextNumber } = loadMatchHelpers();
    expect(matchNextNumber([])).toBe(1);
    expect(matchNextNumber(undefined)).toBe(1);
  });

  it('maior numero + 1, mesmo com a lista fora de ordem e com buracos', () => {
    const { matchNextNumber } = loadMatchHelpers();
    expect(matchNextNumber([{ num: 3 }, { num: 7 }, { num: 5 }])).toBe(8);
  });

  it('ignora jogo sem numero, zero ou invalido', () => {
    const { matchNextNumber } = loadMatchHelpers();
    expect(matchNextNumber([{ num: 2 }, {}, { num: 0 }, { num: 'x' }, null])).toBe(3);
  });
});

describe('matchNumberNew', () => {
  it('da numero so a quem nao tem, a partir do maior + 1, na ordem da lista', () => {
    const { matchNumberNew } = loadMatchHelpers();
    const lista = [{ num: 5, id: '5' }, {}, { num: 2, id: '2' }, { num: 0 }];
    matchNumberNew(lista);
    expect(lista.map(m => m.num)).toEqual([5, 6, 2, 7]);
    expect(lista.map(m => m.id)).toEqual(['5', '6', '2', '7']);
  });

  it('nao mexe em quem ja tem numero (nem no id)', () => {
    const { matchNumberNew } = loadMatchHelpers();
    const lista = [{ num: 9, id: '9' }, { num: 4, id: '4' }];
    matchNumberNew(lista);
    expect(lista).toEqual([{ num: 9, id: '9' }, { num: 4, id: '4' }]);
  });

  it('lista vazia ou sem lista nao quebra', () => {
    const { matchNumberNew } = loadMatchHelpers();
    expect(matchNumberNew([])).toEqual([]);
    expect(() => matchNumberNew(undefined)).not.toThrow();
  });
});
