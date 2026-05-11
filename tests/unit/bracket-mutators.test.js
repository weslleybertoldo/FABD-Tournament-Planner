import { describe, it, expect, beforeEach } from 'vitest';
import { loadModule } from './_loader.js';

// Helper: cria contexto com tournament mock + carrega mutadores
function loadMutators(tournament) {
  const ctx = { tournament };
  return loadModule('src/js/modules/bracket-mutators.js', ctx);
}

// Builder: torneio com 1 draw Eliminatoria de 4 players
function mkElimTournament() {
  return {
    id: 't1',
    draws: [{
      id: 'd1',
      name: 'SM Sub11',
      type: 'Eliminatoria',
      matches: [
        // R1 - semis
        { round:1, slotIdx:0, player1:'A', player2:'B', score1:'', score2:'', winner:undefined, isBye:false, advancer:'' },
        { round:1, slotIdx:1, player1:'C', player2:'D', score1:'', score2:'', winner:undefined, isBye:false, advancer:'' },
        // R2 - final (sem players ainda)
        { round:2, slotIdx:0, player1:'', player2:'', score1:'', score2:'', winner:undefined, isBye:false, advancer:'' },
      ]
    }],
    matches: []
  };
}

describe('propagateResultToDraws — eliminatoria', () => {
  it('aplica winner + advancer + score em match de R1', () => {
    const t = mkElimTournament();
    const { propagateResultToDraws } = loadMutators(t);
    propagateResultToDraws({ drawName:'SM Sub11', round:1, drawMatchIdx:0, player1:'A', player2:'B', winner:1, score:'21-15 / 21-18' });
    const dm = t.draws[0].matches[0];
    expect(dm.winner).toBe(1);
    expect(dm.advancer).toBe('A');
    expect(dm.score1).toBe('21 21');
    expect(dm.score2).toBe('15 18');
  });

  it('W.O. NAO faz split de sets', () => {
    const t = mkElimTournament();
    const { propagateResultToDraws } = loadMutators(t);
    propagateResultToDraws({ drawName:'SM Sub11', round:1, drawMatchIdx:0, player1:'A', player2:'B', winner:1, score:'W.O.' });
    expect(t.draws[0].matches[0].score1).toBe('W.O.');
    expect(t.draws[0].matches[0].score2).toBe('');
  });

  it('NAO faz nada se drawName invalido', () => {
    const t = mkElimTournament();
    const { propagateResultToDraws } = loadMutators(t);
    const snap = JSON.stringify(t);
    propagateResultToDraws({ drawName:'INEXISTENTE', round:1, player1:'A', player2:'B', winner:1, score:'21-0' });
    expect(JSON.stringify(t)).toBe(snap);
  });

  it('NAO faz nada se matchData.drawName ausente', () => {
    const t = mkElimTournament();
    const { propagateResultToDraws } = loadMutators(t);
    const snap = JSON.stringify(t);
    propagateResultToDraws({ winner:1, player1:'A' });
    expect(JSON.stringify(t)).toBe(snap);
  });

  it('lookup por drawMatchIdx tem prioridade', () => {
    const t = mkElimTournament();
    const { propagateResultToDraws } = loadMutators(t);
    propagateResultToDraws({ drawName:'SM Sub11', drawMatchIdx:1, round:1, player1:'C', player2:'D', winner:2, score:'18-21 / 20-22' });
    expect(t.draws[0].matches[1].winner).toBe(2);
    expect(t.draws[0].matches[1].advancer).toBe('D');
  });
});

describe('propagateResultToDraws — Grupos + Eliminatoria', () => {
  function mkGroupsTournament() {
    return {
      id: 't1',
      draws: [{
        id: 'd1', name: 'SM Sub11', type: 'Grupos + Eliminatoria',
        groupsData: {
          groups: [{
            name: 'Grupo A',
            matches: [{ player1:'A', player2:'B', winner:undefined, score1:'', score2:'' }]
          }],
          eliminationMatches: [{ player1:'A', player2:'C', winner:undefined, advancer:'' }]
        },
        matches: [
          { round:1, slotIdx:0, player1:'A', player2:'B', group:'A', phase:'group', score1:'', score2:'', winner:undefined, advancer:'' }
        ]
      }],
      matches: []
    };
  }

  it('phase=group atualiza groupsData.groups[].matches', () => {
    const t = mkGroupsTournament();
    const { propagateResultToDraws } = loadMutators(t);
    propagateResultToDraws({ drawName:'SM Sub11', round:1, drawMatchIdx:0, player1:'A', player2:'B', winner:1, score:'21-19 / 19-21 / 21-15', phase:'group', group:'A' });
    const gm = t.draws[0].groupsData.groups[0].matches[0];
    expect(gm.winner).toBe(1);
    expect(gm.score1).toBe('21 19 21');
  });

  it('phase=elimination atualiza groupsData.eliminationMatches', () => {
    const t = mkGroupsTournament();
    // Adicionar match de elim no d.matches
    t.draws[0].matches.push({ round:2, slotIdx:0, player1:'A', player2:'C', phase:'elimination', score1:'', score2:'', winner:undefined, advancer:'' });
    const { propagateResultToDraws } = loadMutators(t);
    propagateResultToDraws({ drawName:'SM Sub11', round:2, drawMatchIdx:1, player1:'A', player2:'C', winner:1, score:'21-10 / 21-12', phase:'elimination' });
    const em = t.draws[0].groupsData.eliminationMatches[0];
    expect(em.winner).toBe(1);
    expect(em.advancer).toBe('A');
  });
});

describe('reverseResultInDraws', () => {
  it('NAO faz nada se draw nao existe', () => {
    const t = mkElimTournament();
    const { reverseResultInDraws } = loadMutators(t);
    const snap = JSON.stringify(t);
    reverseResultInDraws({ drawName:'INEXISTENTE', round:1, player1:'A', player2:'B' });
    expect(JSON.stringify(t)).toBe(snap);
  });

  it('NAO faz nada se matchData.drawName vazio', () => {
    const t = mkElimTournament();
    const { reverseResultInDraws } = loadMutators(t);
    const snap = JSON.stringify(t);
    reverseResultInDraws({ round:1, player1:'A' });
    expect(JSON.stringify(t)).toBe(snap);
  });
});

describe('updateEliminationMatchesInList', () => {
  it('NAO faz nada se tournament sem draws', () => {
    const t = { draws: [], matches: [] };
    const { updateEliminationMatchesInList } = loadMutators(t);
    expect(() => updateEliminationMatchesInList()).not.toThrow();
    expect(t.matches).toEqual([]);
  });

  it('NAO faz nada em draws sem groupsData', () => {
    const t = { draws: [{ name:'SM Sub11', type:'Eliminatoria', matches:[] }], matches:[] };
    const { updateEliminationMatchesInList } = loadMutators(t);
    updateEliminationMatchesInList();
    expect(t.matches).toEqual([]);
  });
});
