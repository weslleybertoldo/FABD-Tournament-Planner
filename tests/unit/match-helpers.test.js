import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// match-helpers usa globals: getCatIdx, EVENT_ORDER_BTP, tournament
// Vou injetar mocks pra testes.
function loadMatchHelpers(extraCtx = {}) {
  const baseCtx = {
    // Mock minimos pras helpers que precisam de globals
    getCatIdx: (drawName) => {
      const cats = ['Sub 11','Sub 13','Sub 15','Sub 17','Sub 19','Sub 23','Principal','Senior','Master I','Master II'];
      for (let i = 0; i < cats.length; i++) if (drawName.includes(cats[i])) return i;
      return cats.length;
    },
    EVENT_ORDER_BTP: ['SM','SF','DM','DF','DX'],
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

describe('sortMatchesByBTPOrder', () => {
  it('ordena por round primeiro', () => {
    const { sortMatchesByBTPOrder } = loadMatchHelpers();
    const matches = [
      { round: 2, drawName: 'SM Principal', drawMatchIdx: 0 },
      { round: 1, drawName: 'SM Principal', drawMatchIdx: 0 }
    ];
    const sorted = sortMatchesByBTPOrder(matches);
    expect(sorted[0].round).toBe(1);
    expect(sorted[1].round).toBe(2);
  });

  it('ordena por categoria dentro do mesmo round (Sub 11 antes Master II)', () => {
    const { sortMatchesByBTPOrder } = loadMatchHelpers();
    const matches = [
      { round: 1, drawName: 'SM Master II', drawMatchIdx: 0 },
      { round: 1, drawName: 'SM Sub 11', drawMatchIdx: 0 }
    ];
    const sorted = sortMatchesByBTPOrder(matches);
    expect(sorted[0].drawName).toBe('SM Sub 11');
  });

  it('ordena por modalidade SM antes SF', () => {
    const { sortMatchesByBTPOrder } = loadMatchHelpers();
    const matches = [
      { round: 1, drawName: 'SF Sub 11', drawMatchIdx: 0 },
      { round: 1, drawName: 'SM Sub 11', drawMatchIdx: 0 }
    ];
    const sorted = sortMatchesByBTPOrder(matches);
    expect(sorted[0].drawName).toBe('SM Sub 11');
  });

  it('NAO muta array original', () => {
    const { sortMatchesByBTPOrder } = loadMatchHelpers();
    const orig = [{ round: 2, drawName: 'A' }, { round: 1, drawName: 'A' }];
    const copy = [...orig];
    sortMatchesByBTPOrder(orig);
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
