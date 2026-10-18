import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { forecastAvgSec, forecastDayEndMs, forecastSummary } = loadModule('src/js/modules/matches-forecast.js');

const T = hhmm => new Date(`2026-10-17T${hhmm}:00-03:00`).getTime();
const iso = hhmm => new Date(T(hhmm)).toISOString();
const MIN = 60000;

describe('forecastAvgSec', () => {
  it('media em quadra so dos finalizados com inicio e fim', () => {
    const ms = [
      { status: 'Finalizada', startedAt: iso('10:00'), finishedAt: iso('10:20') },
      { status: 'Finalizada', startedAt: iso('10:00'), finishedAt: iso('10:30') },
      { status: 'Finalizada', finishedAt: iso('10:30') }, // sem inicio: fora
      { status: 'Em Quadra', startedAt: iso('10:40') },
    ];
    expect(forecastAvgSec(ms)).toEqual({ sec: 25 * 60, count: 2 });
  });

  it('null sem jogo medido', () => {
    expect(forecastAvgSec([{ status: 'Pendente' }])).toBeNull();
  });

  it('todo jogo medido entra na media, inclusive o curto', () => {
    const at = (hhmm, s) => new Date(T(hhmm) + s * 1000).toISOString();
    const ms = [
      { status: 'Finalizada', startedAt: iso('09:10'), finishedAt: at('09:10', 60) },
      { status: 'Finalizada', startedAt: iso('09:14'), finishedAt: iso('09:43') },
    ];
    expect(forecastAvgSec(ms)).toEqual({ sec: 15 * 60, count: 2 });
  });
});

describe('forecastDayEndMs', () => {
  const opts = { nowMs: T('14:00'), courts: 2, avgMs: 20 * MIN, restMs: 10 * MIN };

  it('jogos livres dividem as quadras', () => {
    const ms = [
      { status: 'Pendente', player1: 'A', player2: 'B' },
      { status: 'Pendente', player1: 'C', player2: 'D' },
      { status: 'Pendente', player1: 'E', player2: 'F' },
    ];
    // 2 jogos 14:00-14:20, o 3o 14:20-14:40
    expect(forecastDayEndMs(ms, opts)).toBe(T('14:40'));
  });

  it('atleta descansa entre jogos (inclusive quem esta em quadra)', () => {
    const ms = [
      { status: 'Em Quadra', startedAt: iso('13:50'), player1: 'A / X', player2: 'B / Y' },
      { status: 'Pendente', player1: 'A / Z', player2: 'C / W' },
    ];
    // em quadra termina 14:10; A descansa ate 14:20; jogo 14:20-14:40
    expect(forecastDayEndMs(ms, opts)).toBe(T('14:40'));
  });

  it('A definir espera a fase anterior da chave + descanso (final por ultimo)', () => {
    const ms = [
      { drawName: 'DM', phase: 'group', round: 3, status: 'Pendente', player1: 'A', player2: 'B' },
      { drawName: 'DM', phase: 'elimination', round: 1, status: 'A definir', player1: '', player2: '' },
      { drawName: 'DM', phase: 'elimination', round: 1, status: 'A definir', player1: '', player2: '' },
      { drawName: 'DM', phase: 'elimination', round: 2, status: 'A definir', player1: '', player2: '' },
    ];
    // grupo 14:00-14:20 · semis 14:30-14:50 · final 15:00-15:20
    expect(forecastDayEndMs(ms, opts)).toBe(T('15:20'));
  });

  it('dia futuro comeca no horario de inicio dele', () => {
    const ms = [{ status: 'Pendente', player1: 'A', player2: 'B' }];
    const amanha8h = new Date('2026-10-18T08:00:00-03:00').getTime();
    expect(forecastDayEndMs(ms, { ...opts, dayStartMs: amanha8h })).toBe(amanha8h + 20 * MIN);
  });
});

describe('forecastSummary', () => {
  it('conta o dia e usa a media do torneio, nao a do dia', () => {
    const ms = [
      { status: 'Finalizada', startedAt: iso('13:00'), finishedAt: iso('13:05'), player1: 'A', player2: 'B' },
      { status: 'Em Quadra', startedAt: iso('13:55'), player1: 'C', player2: 'D' },
      { status: 'Pendente', player1: 'E', player2: 'F' },
      { drawName: 'X', phase: 'elimination', round: 1, status: 'A definir' },
    ];
    // o dia tem 1 jogo de 5 min; a media do torneio (21 min, 25 jogos) manda
    const s = forecastSummary(ms, { nowMs: T('14:00'), courts: 4, restMin: 0, defaultMin: 30, tournamentAvg: { sec: 21 * 60, count: 25 } });
    expect([s.total, s.done, s.inCourt, s.pending, s.toDefine, s.remaining]).toEqual([4, 1, 1, 1, 1, 3]);
    expect(s.avg).toEqual({ sec: 21 * 60, count: 25, source: 'torneio' });
    expect(s.endMs).toBe(T('14:21'));
    expect(s.remainingMin).toBe(21);
  });

  it('torneio sem jogo medido usa a duracao configurada', () => {
    const s = forecastSummary([{ status: 'Pendente', player1: 'A', player2: 'B' }], { nowMs: T('14:00'), courts: 4, restMin: 0, defaultMin: 30, tournamentAvg: null });
    expect(s.avg).toEqual({ sec: 30 * 60, count: 0, source: 'configurado' });
    expect(s.remainingMin).toBe(30);
  });

  it('dia encerrado: sem previsao e com o horario do ultimo jogo', () => {
    const s = forecastSummary([{ status: 'Finalizada', startedAt: iso('13:00'), finishedAt: iso('13:20') }], { nowMs: T('14:00'), courts: 4, restMin: 0, defaultMin: 30 });
    expect(s.endMs).toBeNull();
    expect(s.lastFinishedMs).toBe(T('13:20'));
  });
});
