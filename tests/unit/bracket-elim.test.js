import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';
import fixtures from './fixtures/elimination-bracket-golden.json' assert { type: 'json' };

function loadBracket(extraCtx = {}) {
  // Math nativo (spread perde non-enumerable methods); stub so random.
  const mathStub = Object.create(Math);
  mathStub.random = () => 0.5;
  const ctx = {
    _getPlayerClub: () => '',
    Math: mathStub,
    ...extraCtx
  };
  return loadModule('src/js/modules/bracket-elim.js', ctx);
}

describe('generateEliminationBracket — invariantes', () => {
  it('retorna [] se total players < 2', () => {
    const { generateEliminationBracket } = loadBracket();
    expect(generateEliminationBracket([], [])).toEqual([]);
    expect(generateEliminationBracket(['A'], [])).toEqual([]);
  });

  it('n=2: 1 match, sem byes, sem rodadas adicionais', () => {
    const { generateEliminationBracket } = loadBracket();
    const out = generateEliminationBracket(['A', 'B'], []);
    expect(out).toHaveLength(1);
    expect(out[0].round).toBe(1);
    expect(out[0].isBye).toBe(false);
  });

  it('n=4 sem seeds: 3 matches (2 R1 + 1 R2/final)', () => {
    const { generateEliminationBracket } = loadBracket();
    const out = generateEliminationBracket(['A','B','C','D'], []);
    expect(out).toHaveLength(3);
    expect(out.filter(m => m.round === 1)).toHaveLength(2);
    expect(out.filter(m => m.round === 2)).toHaveLength(1);
  });

  it('n=3 com 2 seeds: 1 bye em R1 (bracketSize=4), 1 jogador real avanca', () => {
    const { generateEliminationBracket } = loadBracket();
    const out = generateEliminationBracket(['A'], ['S1','S2']);
    const r1 = out.filter(m => m.round === 1);
    expect(r1).toHaveLength(2);
    const byeCount = r1.filter(m => m.isBye).length;
    expect(byeCount).toBe(1);
  });

  it('n=8 sem seeds: 7 matches total (3 rounds)', () => {
    const { generateEliminationBracket } = loadBracket();
    const out = generateEliminationBracket(['A','B','C','D','E','F','G','H'], []);
    expect(out).toHaveLength(7); // 4 + 2 + 1
    expect(Math.max(...out.map(m => m.round))).toBe(3);
  });

  it('total matches = bracketSize - 1 (eliminatoria pura)', () => {
    const { generateEliminationBracket } = loadBracket();
    for (const [n, players, seeds] of [
      [4, ['A','B','C','D'], []],
      [8, ['A','B','C','D','E','F','G','H'], []],
      [16, 'ABCDEFGHIJKLMNOP'.split(''), []],
    ]) {
      const out = generateEliminationBracket(players, seeds);
      const bracketSize = n;
      expect(out, `n=${n}`).toHaveLength(bracketSize - 1);
    }
  });

  it('cada match R1 tem player1 e player2 definidos (BYE inclusive)', () => {
    const { generateEliminationBracket } = loadBracket();
    const out = generateEliminationBracket(['A','B','C','D'], []);
    const r1 = out.filter(m => m.round === 1);
    for (const m of r1) {
      expect(m.player1).toBeDefined();
      expect(m.player2).toBeDefined();
    }
  });

  it('match com BYE tem winner setado (avanca quem nao eh BYE)', () => {
    const { generateEliminationBracket } = loadBracket();
    // n=3 com 1 player + 2 seeds → bracket 4 com 1 bye
    const out = generateEliminationBracket(['A'], ['S1','S2']);
    const byes = out.filter(m => m.round === 1 && m.isBye);
    for (const m of byes) {
      expect(m.winner).toBeDefined();
      if (m.player1 === 'BYE') expect(m.winner).toBe(2);
      else if (m.player2 === 'BYE') expect(m.winner).toBe(1);
    }
  });
});

describe('generateEliminationBracket — golden master (fixtures capturadas em v4.74)', () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    if (fixture.error) continue;
    it(`${name}: estrutura output bate (length, rounds, bye count)`, () => {
      const { generateEliminationBracket } = loadBracket();
      const out = generateEliminationBracket(fixture.players.slice(), fixture.seeds.slice());
      // Compare invariantes estruturais (Math.random pode diferir entre runs)
      expect(out).toHaveLength(fixture.output.length);
      const fixtureRounds = new Set(fixture.output.map(m => m.round));
      const outRounds = new Set(out.map(m => m.round));
      expect([...outRounds].sort()).toEqual([...fixtureRounds].sort());
      // Byes count idêntica
      expect(out.filter(m => m.isBye).length).toBe(fixture.output.filter(m => m.isBye).length);
    });
  }
});
