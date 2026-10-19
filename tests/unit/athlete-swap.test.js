import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// Trocar atleta (o parceiro da dupla ou o atleta da linha da chave):
// quem sai, quem entra, bloqueios e a troca em todos os lugares do torneio.
const R = loadModule('src/js/modules/match-result.js');
const S = loadModule('src/js/modules/athlete-swap.js', { isMatchDone: R.isMatchDone });

const P = (id, firstName, lastName, gender, inscriptions = [], extra = {}) =>
  ({ id, firstName, lastName, gender, inscriptions, ...extra });
const I = (key, partner = '') => ({ key, mod: key.split(' ')[0], cat: key.split(' ').slice(1).join(' '), partner });

// Mesmo algoritmo do syncDrawsPlayers (app.js): a dupla sai na ordem do players[]
function labelsLikeTheApp(players, key) {
  const out = [];
  const seen = new Set();
  const dbl = ['DM', 'DF', 'DX'].includes(key.split(' ')[0]);
  players.forEach(p => (p.inscriptions || []).filter(i => i.key === key).forEach(i => {
    const name = `${p.firstName} ${p.lastName}`;
    if (!dbl) { out.push(name); return; }
    if (!i.partner) return;
    const pk = [p.id, i.partner].sort().join('-');
    if (seen.has(pk)) return;
    seen.add(pk);
    const q = players.find(x => x.id === i.partner);
    out.push(`${name} / ${q ? `${q.firstName} ${q.lastName}` : 'Sem dupla'}`);
  }));
  return out;
}

describe('swapEntryLabel', () => {
  const players = [P('a', 'Ana', 'Lima', 'F'), P('b', 'Bia', 'Reis', 'F'), P('c', 'Caio', 'Melo', 'M')];
  it('simples = o nome do atleta, sem trim (igual ao app)', () => {
    expect(S.swapEntryLabel(players, 'SM Principal', 'c', '')).toBe('Caio Melo');
    expect(S.swapEntryLabel([P('x', 'Rui', '', 'M')], 'SM Principal', 'x', '')).toBe('Rui ');
  });
  it('dupla = quem vem primeiro no players[] na frente', () => {
    expect(S.swapEntryLabel(players, 'DF Sub 15', 'b', 'a')).toBe('Ana Lima / Bia Reis');
    expect(S.swapEntryLabel(players, 'DF Sub 15', 'a', 'b')).toBe('Ana Lima / Bia Reis');
  });
  it('dupla sem parceiro nao tem linha; parceiro que sumiu vira "Sem dupla"', () => {
    expect(S.swapEntryLabel(players, 'DF Sub 15', 'a', '')).toBe('');
    expect(S.swapEntryLabel(players, 'DF Sub 15', 'a', 'zz')).toBe('Ana Lima / Sem dupla');
  });
});

describe('swapCandidates', () => {
  const players = [
    P('m1', 'Rui', 'Alves', 'M', [I('SM Principal'), I('DX Principal', 'f1')]),
    P('m2', 'Tiago', 'Costa', 'M'),
    P('m3', 'Breno', 'Dias', 'M', [I('SM Principal')]),
    P('f1', 'Ana', 'Lima', 'F', [I('DX Principal', 'm1'), I('DF Principal', 'f2')]),
    P('f2', 'Bia', 'Reis', 'F', [I('DF Principal', 'f1')]),
    P('f3', 'Clara', 'Souza', 'F'),
  ];
  const ids = list => list.map(c => c.id);
  it('simples masculina: so homens fora da chave, em ordem de nome', () => {
    expect(ids(S.swapCandidates(players, 'SM Principal', 'm1'))).toEqual(['m2']);
  });
  it('dupla feminina: so mulheres fora da chave (a parceira que fica nao entra)', () => {
    expect(ids(S.swapCandidates(players, 'DF Principal', 'f2'))).toEqual(['f3']);
  });
  it('mista: mesmo sexo de quem sai', () => {
    expect(ids(S.swapCandidates(players, 'DX Principal', 'm1'))).toEqual(['m3', 'm2']);
    expect(ids(S.swapCandidates(players, 'DX Principal', 'f1'))).toEqual(['f2', 'f3']);
  });
  it('so quem tem idade pra categoria (regra do app: Sub X abaixo de X; Principal todas)', () => {
    const list = [
      P('a', 'Ana', 'Lima', 'F', [I('SF Sub 13')], { dob: '2014-03-01' }),
      P('b', 'Bia', 'Reis', 'F', [], { dob: '2014-05-10' }),
      P('c', 'Clara', 'Souza', 'F', [], { dob: '2013-01-20' }),
      P('d', 'Duda', 'Rocha', 'F', [], {}),
      P('e', 'Eva', 'Prado', 'F', [], { dob: '1980-07-07' }),
    ];
    expect(ids(S.swapCandidates(list, 'SF Sub 13', 'a', 2026))).toEqual(['b', 'd']);
    expect(ids(S.swapCandidates(list.map(p => ({ ...p, inscriptions: p.id === 'a' ? [I('SF Principal')] : [] })), 'SF Principal', 'a', 2026))).toEqual(['b', 'c', 'd', 'e']);
    expect(S.swapAgeOk('1980-07-07', 'Master I', 2026)).toBe(true);
    expect(S.swapAgeOk('1990-07-07', 'Master I', 2026)).toBe(false);
  });
  it('traz nome, clube e categoria pra mostrar na lista', () => {
    const list = S.swapCandidates([P('a', 'Ana', 'Lima', 'F', [I('SF Principal')]), P('b', 'Bia', 'Reis', 'F', [], { club: 'ABC', category: 'Sub 15' })], 'SF Principal', 'a');
    expect(list).toEqual([{ id: 'b', name: 'Bia Reis', club: 'ABC', category: 'Sub 15' }]);
  });
});

// Torneio pequeno: SM Principal (eliminatoria) e DF Sub 15 (grupos + eliminatoria)
function torneio() {
  const players = [
    P('m1', 'Rui', 'Alves', 'M', [I('SM Principal')]),
    P('m2', 'Tiago', 'Costa', 'M', [I('SM Principal')]),
    P('m3', 'Breno', 'Dias', 'M', [I('SM Principal')]),
    P('m4', 'Davi', 'Nunes', 'M'),
    P('f1', 'Ana', 'Lima', 'F', [I('DF Sub 15', 'f2'), I('SF Sub 15')]),
    P('f2', 'Bia', 'Reis', 'F', [I('DF Sub 15', 'f1')]),
    P('f3', 'Clara', 'Souza', 'F', [I('DF Sub 15', 'f4')]),
    P('f4', 'Duda', 'Rocha', 'F', [I('DF Sub 15', 'f3')]),
    P('f0', 'Alice', 'Brito', 'F'),
    P('f5', 'Eva', 'Prado', 'F'),
  ];
  const AB = 'Ana Lima / Bia Reis', CD = 'Clara Souza / Duda Rocha';
  const tournament = {
    players,
    entries: [
      { playerId: 'm1', key: 'SM Principal', status: 'confirmado' },
      { playerId: 'm2', key: 'SM Principal', status: 'confirmado' },
      { playerId: 'm3', key: 'SM Principal', status: 'confirmado' },
      { playerId: 'f1', key: 'DF Sub 15', status: 'presente' },
      { playerId: 'f2', key: 'DF Sub 15', status: 'presente' },
      { playerId: 'f3', key: 'DF Sub 15', status: 'confirmado' },
      { playerId: 'f4', key: 'DF Sub 15', status: 'confirmado' },
      { playerId: 'f1', key: 'SF Sub 15', status: 'confirmado' },
    ],
    draws: [
      {
        name: 'SM Principal', type: 'Eliminatoria',
        players: ['Rui Alves', 'Tiago Costa', 'Breno Dias'], seeds_list: ['Rui Alves'],
        matches: [
          { round: 1, slotIdx: 0, player1: 'Rui Alves', player2: 'BYE', winner: 1, isBye: true, advancer: 'Rui Alves' },
          { round: 1, slotIdx: 1, player1: 'Tiago Costa', player2: 'Breno Dias', winner: undefined, isBye: false, advancer: '' },
          { round: 2, slotIdx: 0, player1: 'Rui Alves', player2: '', winner: undefined, advancer: '' },
        ],
      },
      {
        name: 'DF Sub 15', type: 'Grupos + Eliminatoria',
        players: [AB, CD],
        matches: [{ round: 1, player1: AB, player2: CD, phase: 'group', winner: 1 }],
        groupsData: {
          groups: [{ name: 'Grupo A', players: [AB, CD], matches: [{ round: 1, player1: AB, player2: CD, p1idx: 0, p2idx: 1, winner: 1 }] }],
          eliminationMatches: [{ round: 1, player1: AB, player2: '', advancer: '' }],
          eliminationGenerated: true,
        },
      },
      { name: 'SF Sub 15', type: 'Eliminatoria', players: ['Ana Lima', 'Eva Prado'], matches: [{ round: 1, player1: 'Ana Lima', player2: 'Eva Prado' }] },
    ],
    matches: [
      { num: 1, drawName: 'SM Principal', player1: 'Tiago Costa', player2: 'Breno Dias', player1Display: 'Tiago Costa', player2Display: 'Breno Dias', status: 'Pendente', time: '09:00', scoresheetPrintedAt: 'x' },
      { num: 2, drawName: 'SM Principal', player1: 'Rui Alves', player2: '', player1Display: 'Rui Alves', player2Display: 'Venc. jogo 1', status: 'A definir', time: '10:00' },
      { num: 3, drawName: 'DF Sub 15', player1: AB, player2: CD, player1Display: AB, player2Display: CD, status: 'Finalizada', winner: 1, time: '09:00', scoresheetPrintedAt: 'y' },
      { num: 4, drawName: 'SF Sub 15', player1: 'Ana Lima', player2: 'Eva Prado', player1Display: 'Ana Lima', player2Display: 'Eva Prado', status: 'Pendente', time: '11:00' },
      { num: 5, drawName: 'SM Principal', player1: 'Breno Dias', player2: 'Davi Nunes', status: 'WO', porDesq: true, porDesqDe: `DF Sub 15|${AB}|${CD}` },
    ],
  };
  return { tournament, players, AB, CD };
}

describe('swapApply — simples', () => {
  it('troca Tiago por Davi na chave, nas cabecas e na lista de Partidas', () => {
    const { tournament, players } = torneio();
    const r = S.swapApply(tournament, players, { key: 'SM Principal', outId: 'm2', inId: 'm4' });
    expect(r).toMatchObject({ oldLabel: 'Tiago Costa', newLabel: 'Davi Nunes', matches: 1 });
    const d = tournament.draws[0];
    expect(d.players).toEqual(['Rui Alves', 'Davi Nunes', 'Breno Dias']);
    expect(d.matches[1].player1).toBe('Davi Nunes');
    const m = tournament.matches[0];
    expect([m.player1, m.player1Display]).toEqual(['Davi Nunes', 'Davi Nunes']);
    expect(m.scoresheetPrintedAt).toBeUndefined();
  });
  it('a inscricao passa pra quem entra, com "substituiu"', () => {
    const { tournament, players } = torneio();
    S.swapApply(tournament, players, { key: 'SM Principal', outId: 'm2', inId: 'm4' });
    expect(players[1].inscriptions).toEqual([]);
    expect(players[3].inscriptions).toEqual([{ key: 'SM Principal', mod: 'SM', cat: 'Principal', partner: '', substituiu: 'Tiago Costa' }]);
  });
  it('cabeca de chave e quem avancou pelo bye tambem trocam', () => {
    const { tournament, players } = torneio();
    S.swapApply(tournament, players, { key: 'SM Principal', outId: 'm1', inId: 'm4' });
    const d = tournament.draws[0];
    expect(d.seeds_list).toEqual(['Davi Nunes']);
    expect([d.matches[0].player1, d.matches[0].advancer, d.matches[2].player1]).toEqual(['Davi Nunes', 'Davi Nunes', 'Davi Nunes']);
    expect(tournament.matches[1].player1Display).toBe('Davi Nunes');
    expect(tournament.matches[1].player2Display).toBe('Venc. jogo 1');
  });
  it('nao mexe nas outras categorias do atleta', () => {
    const { tournament, players } = torneio();
    players[4].inscriptions.push(I('SM Principal'));
    S.swapApply(tournament, players, { key: 'SF Sub 15', outId: 'f1', inId: 'f5' });
    expect(tournament.draws[1].players[0]).toBe('Ana Lima / Bia Reis');
    expect(tournament.matches[2].player1).toBe('Ana Lima / Bia Reis');
  });
  it('a lista nova e igual a que o app monta sozinho (nao reseta a chave)', () => {
    const { tournament, players } = torneio();
    S.swapApply(tournament, players, { key: 'SM Principal', outId: 'm2', inId: 'm4' });
    expect([...tournament.draws[0].players].sort()).toEqual(labelsLikeTheApp(players, 'SM Principal').sort());
  });
});

describe('swapApply — dupla', () => {
  it('troca a parceira: inscricoes dos 2 lados e "substituiu"', () => {
    const { tournament, players } = torneio();
    S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'f2', inId: 'f5' });
    expect(players[4].inscriptions.find(i => i.key === 'DF Sub 15').partner).toBe('f5');
    expect(players[5].inscriptions.some(i => i.key === 'DF Sub 15')).toBe(false);
    expect(players[9].inscriptions).toEqual([{ key: 'DF Sub 15', mod: 'DF', cat: 'Sub 15', partner: 'f1', substituiu: 'Bia Reis' }]);
  });
  it('troca a linha nos grupos, no mata-mata, nas Partidas e no W.O. por desqualificacao', () => {
    const { tournament, players, CD } = torneio();
    const r = S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'f2', inId: 'f5' });
    const AE = 'Ana Lima / Eva Prado';
    expect(r).toMatchObject({ oldLabel: 'Ana Lima / Bia Reis', newLabel: AE, matches: 1 });
    const d = tournament.draws[1];
    expect(d.players).toEqual([AE, CD]);
    expect(d.matches[0].player1).toBe(AE);
    expect(d.groupsData.groups[0].players).toEqual([AE, CD]);
    expect(d.groupsData.groups[0].matches[0].player1).toBe(AE);
    expect(d.groupsData.eliminationMatches[0].player1).toBe(AE);
    expect(tournament.matches[2].player1Display).toBe(AE);
    expect(tournament.matches[4].porDesqDe).toBe(`DF Sub 15|${AE}|${CD}`);
  });
  it('jogo finalizado troca o nome mas fica marcado como sumula impressa', () => {
    const { tournament, players } = torneio();
    S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'f2', inId: 'f5' });
    expect(tournament.matches[2].scoresheetPrintedAt).toBe('y');
  });
  it('quem entra antes da parceira no players[] vai pra frente do nome', () => {
    const { tournament, players, CD } = torneio();
    const r = S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'f2', inId: 'f0' });
    expect(r.newLabel).toBe('Ana Lima / Alice Brito');
    const r2 = S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'f1', inId: 'f5' });
    expect(r2.newLabel).toBe('Alice Brito / Eva Prado');
    expect([...tournament.draws[1].players].sort()).toEqual(labelsLikeTheApp(players, 'DF Sub 15').sort());
    expect(tournament.draws[1].players).toEqual(['Alice Brito / Eva Prado', CD]);
  });
  it('erros: atleta que nao existe, fora da chave ou que ja esta nela', () => {
    const { tournament, players } = torneio();
    expect(S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'zz', inId: 'f5' }).error).toBeTruthy();
    expect(S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'f5', inId: 'f0' }).error).toBeTruthy();
    expect(S.swapApply(tournament, players, { key: 'DF Sub 15', outId: 'f2', inId: 'f3' }).error).toBeTruthy();
  });
});

describe('swapProblems', () => {
  const dayOf = m => (m.dia ?? 0);
  it('sem problema = lista vazia', () => {
    const { tournament, players } = torneio();
    expect(S.swapProblems(tournament, players, { key: 'SM Principal', outId: 'm2', inId: 'm4' }, dayOf)).toEqual([]);
  });
  it('jogo da linha em quadra bloqueia', () => {
    const { tournament, players } = torneio();
    tournament.matches[0].status = 'Em Quadra';
    const p = S.swapProblems(tournament, players, { key: 'SM Principal', outId: 'm2', inId: 'm4' }, dayOf);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/em quadra/i);
    expect(p[0]).toMatch(/#1/);
  });
  it('atleta da linha ausente bloqueia (o W.O. automatico tem que ser desfeito antes)', () => {
    const { tournament, players } = torneio();
    tournament.entries[1].status = 'ausente';
    const p = S.swapProblems(tournament, players, { key: 'SM Principal', outId: 'm2', inId: 'm4' }, dayOf);
    expect(p[0]).toMatch(/Tiago Costa/);
    expect(p[0]).toMatch(/Ausente/);
  });
  it('quem entra com jogo pendente no mesmo dia e horario bloqueia', () => {
    const { tournament, players } = torneio();
    tournament.matches.push({ num: 9, drawName: 'SF Sub 15', player1: 'Eva Prado', player2: 'Ana Lima', status: 'Pendente', time: '09:00' });
    tournament.matches[2].status = 'Pendente';
    const p = S.swapProblems(tournament, players, { key: 'DF Sub 15', outId: 'f2', inId: 'f5' }, dayOf);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/já joga um jogo às 09:00/);
    expect(p[0]).toMatch(/Escolha outro atleta ou mude o horário/);
  });
  it('mesmo horario em outro dia, jogo encerrado ou sem horario nao bloqueiam', () => {
    const { tournament, players } = torneio();
    tournament.matches[2].status = 'Pendente';
    tournament.matches.push({ num: 9, drawName: 'SF Sub 15', player1: 'Eva Prado', player2: 'X', status: 'Pendente', time: '09:00', dia: 1 });
    tournament.matches.push({ num: 10, drawName: 'SF Sub 15', player1: 'Eva Prado', player2: 'Y', status: 'Finalizada', time: '09:00' });
    tournament.matches.push({ num: 11, drawName: 'SF Sub 15', player1: 'Eva Prado', player2: 'Z', status: 'Pendente', time: '' });
    expect(S.swapProblems(tournament, players, { key: 'DF Sub 15', outId: 'f2', inId: 'f5' }, dayOf)).toEqual([]);
  });
});

describe('swapLineMatches e swapAthleteMatches', () => {
  it('jogos da linha (lado igual) e do atleta (qualquer chave, inclusive em dupla)', () => {
    const { tournament } = torneio();
    expect(S.swapLineMatches(tournament.matches, 'DF Sub 15', 'Ana Lima / Bia Reis').map(m => m.num)).toEqual([3]);
    expect(S.swapAthleteMatches(tournament.matches, 'Ana Lima').map(m => m.num)).toEqual([3, 4]);
  });
});
