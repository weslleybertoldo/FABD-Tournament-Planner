import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const fc = loadModule('src/js/modules/matches-forecast.js');
const {
  shellDateRange, shellTodayISO, shellDayInfo, shellStatus, shellCounts, shellProgress, shellInitials
} = loadModule('src/js/modules/shell.js', { forecastSummary: fc.forecastSummary, forecastAvgSec: fc.forecastAvgSec });

const at = s => new Date(s).getTime(); // hora local, igual ao app

const DIAS = [
  { date: '2026-10-17', startTime: '08:00', endTime: '18:00' },
  { date: '2026-10-18', startTime: '08:00', endTime: '18:00' }
];
const jogo = (num, extra = {}) => ({ id: String(num), num, drawName: 'SM Principal', round: 1, phase: 'group', player1: 'A' + num, player2: 'B' + num, status: 'Pendente', time: '09:00', ...extra });

describe('shellDateRange (datas da faixa do torneio)', () => {
  it('2 dias seguidos no mesmo mês: "17 e 18/10/2026"', () => {
    expect(shellDateRange('2026-10-17', '2026-10-18')).toBe('17 e 18/10/2026');
  });
  it('3 dias ou mais no mesmo mês: "17 a 19/10/2026"', () => {
    expect(shellDateRange('2026-10-17', '2026-10-19')).toBe('17 a 19/10/2026');
  });
  it('meses diferentes: "30/10 a 01/11/2026"', () => {
    expect(shellDateRange('2026-10-30', '2026-11-01')).toBe('30/10 a 01/11/2026');
  });
  it('anos diferentes: as 2 datas inteiras', () => {
    expect(shellDateRange('2026-12-31', '2027-01-01')).toBe('31/12/2026 a 01/01/2027');
  });
  it('1 dia (sem fim ou fim igual ao início)', () => {
    expect(shellDateRange('2026-08-16', '')).toBe('16/08/2026');
    expect(shellDateRange('2026-08-16', '2026-08-16')).toBe('16/08/2026');
  });
  it('sem data: vazio', () => {
    expect(shellDateRange('', '')).toBe('');
    expect(shellDateRange(undefined, undefined)).toBe('');
  });
});

describe('shellTodayISO / shellDayInfo (dia N de M)', () => {
  it('data local de hoje no formato da programação', () => {
    expect(shellTodayISO(at('2026-10-17T13:12:00'))).toBe('2026-10-17');
    expect(shellTodayISO(at('2026-10-18T00:05:00'))).toBe('2026-10-18');
  });
  it('pela programação por dia (daySchedule)', () => {
    const t = { startDate: '2026-10-17', endDate: '2026-10-18', daySchedule: DIAS };
    expect(shellDayInfo(t, at('2026-10-17T13:12:00'))).toEqual({ n: 1, of: 2, date: '2026-10-17', day: DIAS[0] });
    expect(shellDayInfo(t, at('2026-10-18T09:00:00'))).toEqual({ n: 2, of: 2, date: '2026-10-18', day: DIAS[1] });
  });
  it('fora dos dias da programação: null', () => {
    const t = { startDate: '2026-10-17', endDate: '2026-10-18', daySchedule: DIAS };
    expect(shellDayInfo(t, at('2026-10-19T09:00:00'))).toBeNull();
  });
  it('sem programação: conta pelos dias do torneio (início ao fim)', () => {
    const t = { startDate: '2026-10-17', endDate: '2026-10-19' };
    expect(shellDayInfo(t, at('2026-10-18T09:00:00'))).toEqual({ n: 2, of: 3, date: '2026-10-18', day: null });
  });
  it('torneio de 1 dia sem programação: sem "dia N de M"', () => {
    expect(shellDayInfo({ startDate: '2026-08-16', endDate: '2026-08-16' }, at('2026-08-16T09:00:00'))).toBeNull();
  });
});

describe('shellStatus (etiqueta da faixa: mesma situação do torneio de hoje)', () => {
  const base = { startDate: '2026-10-17', endDate: '2026-10-18', daySchedule: DIAS, matches: [jogo(1)] };
  it('sem data = Rascunho', () => {
    expect(shellStatus({ matches: [] }, at('2026-10-17T10:00:00'))).toEqual({ kind: 'draft', text: 'RASCUNHO' });
  });
  it('antes do início = Agendado', () => {
    expect(shellStatus(base, at('2026-10-16T10:00:00'))).toEqual({ kind: 'sched', text: 'AGENDADO' });
  });
  it('no período = Em andamento · dia N de M', () => {
    expect(shellStatus(base, at('2026-10-17T10:00:00'))).toEqual({ kind: 'run', text: 'EM ANDAMENTO · DIA 1 DE 2' });
  });
  it('depois do fim = Finalizado', () => {
    expect(shellStatus(base, at('2026-10-19T10:00:00'))).toEqual({ kind: 'done', text: 'FINALIZADO' });
  });
  it('jogo em quadra = Ao vivo · dia N de M', () => {
    const t = { ...base, matches: [jogo(1, { status: 'Em Quadra' }), jogo(2)] };
    expect(shellStatus(t, at('2026-10-18T10:00:00'))).toEqual({ kind: 'live', text: 'AO VIVO · DIA 2 DE 2' });
  });
  it('jogo em quadra fora dos dias = só Ao vivo', () => {
    const t = { ...base, matches: [jogo(1, { status: 'Em Quadra' })] };
    expect(shellStatus(t, at('2026-10-25T10:00:00'))).toEqual({ kind: 'live', text: 'AO VIVO' });
  });
});

describe('shellCounts (números da faixa e das abas)', () => {
  it('atletas do torneio, chaves, jogos e atletas inscritos (sem repetir quem joga 2 categorias)', () => {
    const t = {
      draws: [{}, {}, {}],
      matches: [jogo(1), jogo(2)],
      entries: [{ playerId: 'p1', key: 'SM' }, { playerId: 'p1', key: 'DM' }, { playerId: 'p2', key: 'DM' }]
    };
    expect(shellCounts(t, [{}, {}, {}, {}])).toEqual({ athletes: 4, draws: 3, matches: 2, entries: 2 });
  });
  it('sem torneio: tudo zero', () => {
    expect(shellCounts(null, [])).toEqual({ athletes: 0, draws: 0, matches: 0, entries: 0 });
  });
});

describe('shellProgress (jogos de hoje na faixa: mesma conta do painel das Partidas)', () => {
  const dayOf = m => m.day;
  const t = {
    startDate: '2026-10-17', endDate: '2026-10-18', daySchedule: DIAS, courts: 2, matchDuration: 30, restMinBetweenGames: 0,
    matches: [
      jogo(1, { day: '2026-10-17', status: 'Finalizada', startedAt: '2026-10-17T08:00:00', finishedAt: '2026-10-17T08:30:00' }),
      jogo(2, { day: '2026-10-17', status: 'Finalizada', startedAt: '2026-10-17T08:00:00', finishedAt: '2026-10-17T08:30:00' }),
      jogo(3, { day: '2026-10-17', status: 'Pendente', time: '09:00' }),
      jogo(4, { day: '2026-10-17', status: 'Pendente', time: '09:00' }),
      jogo(5, { day: '2026-10-18', status: 'Pendente', time: '08:00' })
    ]
  };
  it('dia do torneio: só os jogos de hoje + previsão de término (2 quadras, 30 min)', () => {
    const p = shellProgress(t, at('2026-10-17T09:00:00'), dayOf);
    expect(p.label).toBe('Jogos de hoje');
    expect([p.done, p.total, p.pct]).toEqual([2, 4, 50]);
    expect(new Date(p.endMs).getHours() * 60 + new Date(p.endMs).getMinutes()).toBe(9 * 60 + 30);
  });
  it('dia sem nada faltando: sem término', () => {
    const t2 = { ...t, matches: t.matches.slice(0, 2) };
    const p = shellProgress(t2, at('2026-10-17T12:00:00'), dayOf);
    expect([p.done, p.total, p.endMs]).toEqual([2, 2, null]);
  });
  it('fora dos dias: o torneio inteiro, sem término', () => {
    const p = shellProgress(t, at('2026-10-20T09:00:00'), dayOf);
    expect(p.label).toBe('Jogos do torneio');
    expect([p.done, p.total, p.pct, p.endMs]).toEqual([2, 5, 40, null]);
  });
  it('sem jogos: null (a faixa não mostra o progresso)', () => {
    expect(shellProgress({ ...t, matches: [] }, at('2026-10-17T09:00:00'), dayOf)).toBeNull();
    expect(shellProgress(null, at('2026-10-17T09:00:00'), dayOf)).toBeNull();
  });
});

describe('shellInitials (avatar do organizador no topo)', () => {
  it('1ª letra do 1º e do último nome', () => {
    expect(shellInitials('Weslley Bertoldo')).toBe('WB');
    expect(shellInitials('Ana Luiza Lima Amaral Torres')).toBe('AT');
  });
  it('1 nome = 1 letra; vazio = ?', () => {
    expect(shellInitials('Organizador')).toBe('O');
    expect(shellInitials('')).toBe('?');
  });
});
