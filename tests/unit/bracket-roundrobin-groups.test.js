import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';
import fixtures from './fixtures/round-robin-groups-golden.json' assert { type: 'json' };

function loadBracketRR(extraCtx = {}) {
  const mathStub = Object.create(Math);
  mathStub.random = () => 0.5;
  const ctx = {
    tournament: { players: [] }, // sem players cadastrados → _getPlayerClub retorna ''
    Math: mathStub,
    ...extraCtx
  };
  return loadModule('src/js/modules/bracket-roundrobin-groups.js', ctx);
}

describe('generateRoundRobinSchedule — invariantes', () => {
  it('vazio retorna []', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    expect(generateRoundRobinSchedule([])).toEqual([]);
  });

  it('1 player retorna [] (sem oponente real)', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    expect(generateRoundRobinSchedule(['A'])).toEqual([]);
  });

  it('2 players: 1 match', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    const out = generateRoundRobinSchedule(['A','B']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ player1:'A', player2:'B', round:1 });
  });

  it('3 players: 3 matches (cada player joga 2 vezes)', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    const out = generateRoundRobinSchedule(['A','B','C']);
    expect(out).toHaveLength(3);
    // cada player aparece em 2 matches
    for (const p of ['A','B','C']) {
      const count = out.filter(m => m.player1===p || m.player2===p).length;
      expect(count, `player ${p}`).toBe(2);
    }
  });

  it('4 players: 6 matches (n*(n-1)/2)', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    expect(generateRoundRobinSchedule(['A','B','C','D'])).toHaveLength(6);
  });

  it('5 players: 10 matches', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    expect(generateRoundRobinSchedule(['A','B','C','D','E'])).toHaveLength(10);
  });

  it('p1idx/p2idx referenciam posicao no array original', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    const pls = ['Joao','Pedro','Maria'];
    const out = generateRoundRobinSchedule(pls);
    for (const m of out) {
      expect(pls[m.p1idx]).toBe(m.player1);
      expect(pls[m.p2idx]).toBe(m.player2);
    }
  });

  it('NAO inclui matches com BYE', () => {
    const { generateRoundRobinSchedule } = loadBracketRR();
    const out = generateRoundRobinSchedule(['A','B','C']);
    for (const m of out) {
      expect(m.player1).not.toBe('BYE');
      expect(m.player2).not.toBe('BYE');
    }
  });
});

describe('generateRoundRobinSchedule — golden master', () => {
  for (const key of ['rr0','rr1','rr2','rr3','rr4','rr5']) {
    const fixture = fixtures[key];
    it(`${key} matches count bate com fixture`, () => {
      const { generateRoundRobinSchedule } = loadBracketRR();
      const n = parseInt(key.slice(2));
      const pls = 'ABCDEFGH'.slice(0,n).split('');
      const out = generateRoundRobinSchedule(pls);
      expect(out).toHaveLength(fixture.length);
    });
  }
});

describe('generateGroupsPhase — invariantes', () => {
  it('retorna { groups, eliminationMatches } com numGroups grupos', () => {
    const { generateGroupsPhase } = loadBracketRR();
    const out = generateGroupsPhase(['A','B','C','D'], 2, []);
    expect(out).toHaveProperty('groups');
    expect(out).toHaveProperty('eliminationMatches');
    expect(out.groups).toHaveLength(2);
    expect(out.eliminationMatches).toEqual([]);
  });

  it('todos players sao distribuidos (seeds + non-seeds = total)', () => {
    const { generateGroupsPhase } = loadBracketRR();
    const out = generateGroupsPhase(['A','B','C','D'], 2, ['S1','S2']);
    const total = out.groups.reduce((sum, g) => sum + g.players.length, 0);
    expect(total).toBe(6); // 4 + 2 seeds
  });

  it('snake draft: seeds 1,2 vao pra grupos diferentes', () => {
    const { generateGroupsPhase } = loadBracketRR();
    const out = generateGroupsPhase([], 2, ['S1','S2']);
    const g0has1 = out.groups[0].players.includes('S1');
    const g1has2 = out.groups[1].players.includes('S2');
    expect(g0has1 && g1has2).toBe(true);
  });

  it('grupos tem labels A, B, C...', () => {
    const { generateGroupsPhase } = loadBracketRR();
    const out = generateGroupsPhase(['A','B'], 3, []);
    expect(out.groups[0].name).toBe('Grupo A');
    expect(out.groups[1].name).toBe('Grupo B');
    expect(out.groups[2].name).toBe('Grupo C');
  });

  it('matches dentro de cada grupo tem phase=group', () => {
    const { generateGroupsPhase } = loadBracketRR();
    const out = generateGroupsPhase(['A','B','C','D'], 2, ['S1','S2']);
    for (const g of out.groups) {
      for (const m of g.matches) {
        expect(m.phase).toBe('group');
      }
    }
  });
});

describe('computeGroupStandings', () => {
  it('inicia com 0 wins/losses', () => {
    const { computeGroupStandings } = loadBracketRR();
    const standings = computeGroupStandings(['A','B'], []);
    expect(standings).toHaveLength(2);
    expect(standings.every(s => s.wins === 0 && s.losses === 0)).toBe(true);
  });

  it('ordena por wins desc', () => {
    const { computeGroupStandings } = loadBracketRR();
    const matches = [
      { player1:'A', player2:'B', winner:1, score1:'21 21', score2:'15 17' },
      { player1:'A', player2:'C', winner:1, score1:'21 21', score2:'10 12' },
      { player1:'B', player2:'C', winner:2, score1:'15 12', score2:'21 21' }
    ];
    const standings = computeGroupStandings(['A','B','C'], matches);
    expect(standings[0].name).toBe('A'); // 2 wins
  });
});

describe('areGroupsFinished', () => {
  it('false sem groupsData', () => {
    const { areGroupsFinished } = loadBracketRR();
    expect(areGroupsFinished({})).toBe(false);
  });

  it('false se algum match sem winner', () => {
    const { areGroupsFinished } = loadBracketRR();
    const d = { groupsData: { groups: [
      { matches: [{ player1:'A', player2:'B', winner: undefined }] }
    ]}};
    expect(areGroupsFinished(d)).toBe(false);
  });

  it('true se todos matches reais tem winner', () => {
    const { areGroupsFinished } = loadBracketRR();
    const d = { groupsData: { groups: [
      { matches: [{ player1:'A', player2:'B', winner: 1 }] }
    ]}};
    expect(areGroupsFinished(d)).toBe(true);
  });

  it('ignora matches com BYE', () => {
    const { areGroupsFinished } = loadBracketRR();
    const d = { groupsData: { groups: [
      { matches: [{ player1:'A', player2:'B', winner: 1 }, { player1:'BYE', player2:'C' }] }
    ]}};
    expect(areGroupsFinished(d)).toBe(true);
  });
});
