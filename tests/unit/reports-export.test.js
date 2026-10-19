import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// reports.js define computeFullClassification/_reassignFederados/_sortDrawsByCatThenMod
// internamente; injeta so os globals externos que o buildRankingExportRows usa.
const scoringTable = { name: 'Padrão BWF', points: { p1: 1000, p2: 850, p3: 700, p5: 550, p9: 400, p17: 250, p33: 100, p65: 50, p129: 25 } };
function mockPointsForPosition(pos, table) {
  const p = table.points;
  if (pos === 1) return p.p1;
  if (pos === 2) return p.p2;
  if (pos <= 4) return p.p3;
  if (pos <= 8) return p.p5;
  if (pos <= 16) return p.p9;
  return 0;
}

const players = [
  { firstName: 'Ana', lastName: 'Alves', club: 'CLUBEA' },
  { firstName: 'Bia', lastName: 'Braga', club: 'CLUBEB' },
  { firstName: 'Caio', lastName: 'Costa', club: 'CLUBEA' },
  { firstName: 'Davi', lastName: 'Dias', club: 'CLUBEA' },
  { firstName: 'Edu', lastName: 'Elias', club: 'CLUBEA' },
  { firstName: 'Fabi', lastName: 'Faria', club: 'CLUBEB' },
];

const tournament = {
  name: 'Torneio Teste',
  startDate: '2026-08-15', endDate: '2026-08-16',
  location: 'Ginasio', city: 'Pilar',
  clubStatuses: { CLUBEA: 'adimplente', CLUBEB: 'inadimplente' },
  draws: [
    // Duplas primeiro de proposito — o builder deve reordenar Simples antes
    {
      name: 'DM Principal', event: 'DM', type: 'Eliminatoria',
      players: ['Caio Costa / Davi Dias', 'Edu Elias / Fabi Faria'],
      matches: [{ round: 1, player1: 'Caio Costa / Davi Dias', player2: 'Edu Elias / Fabi Faria', winner: 2 }],
    },
    {
      name: 'SM Sub 13', event: 'SM', type: 'Todos contra Todos',
      players: ['Ana Alves', 'Bia Braga'],
      matches: [{ player1: 'Ana Alves', player2: 'Bia Braga', winner: 1, score1: '21 21', score2: '10 12' }],
    },
  ],
};

function loadReports() {
  return loadModule('src/js/modules/reports.js', {
    tournament, players,
    getCurrentScoringTable: () => scoringTable,
    pointsForPosition: mockPointsForPosition,
    _normalizeClubKey: (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' '),
    _isInvalidClubName: (s) => !s,
    esc: (s) => String(s ?? ''),
    fmtDate: (s) => String(s ?? ''),
    showToast: () => {},
    window: { api: {} },
  });
}

describe('buildRankingExportRows', () => {
  it('header no contrato fabd-ranking-v1', () => {
    const { buildRankingExportRows } = loadReports();
    const rows = buildRankingExportRows(false);
    expect(rows[0]).toEqual(['Chave', 'TipoChave', 'Categoria', 'Modalidade', 'Pos', 'Atleta', 'Clube', 'V', 'D', 'Pontos', 'Obs']);
  });

  it('classificacao geral: todas as entradas, simples antes de duplas, pontos e categoria certos', () => {
    const { buildRankingExportRows } = loadReports();
    const rows = buildRankingExportRows(false);
    expect(rows.length).toBe(5); // header + 2 (RR) + 2 (elim)
    const [, r1, r2, r3, r4] = rows;
    // SM Sub 13 (simples) vem antes de DM Principal
    expect(r1.slice(0, 7)).toEqual(['SM Sub 13', 'Todos contra Todos', 'Sub 13', 'SM', 1, 'Ana Alves', 'CLUBEA']);
    expect(r1[7]).toBe(1); // V
    expect(r1[8]).toBe(0); // D
    expect(r1[9]).toBe(1000);
    expect(r2[4]).toBe(2);
    expect(r2[5]).toBe('Bia Braga');
    expect(r2[9]).toBe(850);
    // Eliminatoria: campeao E/F, vice C/D; V/D vazios
    expect(r3.slice(3, 7)).toEqual(['DM', 1, 'Edu Elias / Fabi Faria', 'CLUBEA / CLUBEB']);
    expect(r3[7]).toBe('');
    expect(r3[10]).toBe('Campeao');
    expect(r4[4]).toBe(2);
    expect(r4[5]).toBe('Caio Costa / Davi Dias');
    expect(r4[6]).toBe('CLUBEA');
    expect(r4[9]).toBe(850);
  });

  it('ranking federados: filtra nao-adimplentes e reposiciona com Obs', () => {
    const { buildRankingExportRows } = loadReports();
    const rows = buildRankingExportRows(true);
    expect(rows.length).toBe(3); // header + Ana + Caio/Davi
    const [, r1, r2] = rows;
    expect(r1[5]).toBe('Ana Alves');
    expect(r1[4]).toBe(1);
    expect(r1[9]).toBe(1000);
    // Dupla com parceiro CLUBEB (Fabi) sai; Caio/Davi (ambos CLUBEA) sobe de 2o pra 1o
    expect(r2[5]).toBe('Caio Costa / Davi Dias');
    expect(r2[4]).toBe(1);
    expect(r2[9]).toBe(1000);
    expect(r2[10]).toBe('Era 2o na chave');
  });
});

// Regras do W.O. escolhidas pelo Weslley em 18/10/2026 (CBBd 9.6.1.4)
describe('pontos com W.O. (classificacao e ranking exportado)', () => {
  const R = loadModule('src/js/modules/match-result.js');
  const G = loadModule('src/js/modules/bracket-roundrobin-groups.js');
  function loadWith(draws) {
    return loadModule('src/js/modules/reports.js', {
      tournament: { ...tournament, draws }, players,
      getCurrentScoringTable: () => scoringTable,
      pointsForPosition: mockPointsForPosition,
      lostByUnjustifiedWO: R.lostByUnjustifiedWO,
      groupWithdrawnPlayers: G.groupWithdrawnPlayers,
      _normalizeClubKey: (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' '),
      _isInvalidClubName: (s) => !s,
      esc: (s) => String(s ?? ''), fmtDate: (s) => String(s ?? ''),
      showToast: () => {}, window: { api: {} },
    });
  }
  const elim = (woExtra = {}) => ({
    name: 'SM Sub 15', event: 'SM', type: 'Eliminatoria',
    players: ['Ana Alves', 'Bia Braga', 'Caio Costa', 'Davi Dias'],
    matches: [
      { round: 1, player1: 'Ana Alves', player2: 'Bia Braga', winner: 1, score1: '', score2: 'W.O.', status: 'WO', ...woExtra },
      { round: 1, player1: 'Caio Costa', player2: 'Davi Dias', winner: 1, score1: '21 21', score2: '3 4', status: 'Finalizada' },
      { round: 2, player1: 'Ana Alves', player2: 'Caio Costa', winner: 1, score1: '21 21', score2: '19 19', status: 'Finalizada' },
    ],
  });
  const ptsOf = (rows, name) => rows.find(r => r[5] === name)[9];

  it('quem deu W.O. sem atestado fica com 0; quem perdeu jogando pontua a rodada', () => {
    const rows = loadWith([elim()]).buildRankingExportRows(false);
    expect(ptsOf(rows, 'Bia Braga')).toBe(0);
    expect(rows.find(r => r[5] === 'Bia Braga')[10]).toBe('W.O.');
    expect(ptsOf(rows, 'Davi Dias')).toBe(700);
    expect(ptsOf(rows, 'Ana Alves')).toBe(1000);
  });

  it('W.O. com atestado pontua a rodada, como derrota', () => {
    const rows = loadWith([elim({ atestado: true })]).buildRankingExportRows(false);
    expect(ptsOf(rows, 'Bia Braga')).toBe(700);
  });

  it('ranking federados: o 0 do W.O. continua 0 depois de reordenar', () => {
    const rows = loadWith([elim()]).buildRankingExportRows(true);
    const bia = rows.find(r => r[5] === 'Bia Braga');
    if (bia) expect(bia[9]).toBe(0);
  });

  it('todos contra todos: quem deu W.O. vai por ultimo e os jogos dele nao contam', () => {
    const rr = {
      name: 'SF Sub 11', event: 'SF', type: 'Todos contra Todos',
      players: ['Ana Alves', 'Bia Braga', 'Caio Costa'],
      matches: [
        { player1: 'Ana Alves', player2: 'Bia Braga', winner: 2, score1: '10 10', score2: '21 21', status: 'Finalizada' },
        { player1: 'Bia Braga', player2: 'Caio Costa', winner: 1, score1: '', score2: 'W.O.', status: 'WO' },
        { player1: 'Ana Alves', player2: 'Caio Costa', winner: 1, score1: '21 21', score2: '5 5', status: 'Finalizada' },
      ],
    };
    const rows = loadWith([rr]).buildRankingExportRows(false);
    const names = rows.slice(1).map(r => r[5]);
    expect(names).toEqual(['Bia Braga', 'Ana Alves', 'Caio Costa']);
    expect(ptsOf(rows, 'Caio Costa')).toBe(0);
  });
});
