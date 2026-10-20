import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { ovMoney, ovMonthAbbr, ovLiveScore, ovCourts, ovNextMatches, ovFinance, ovDayTag } = loadModule('src/js/modules/overview-ui.js');

const jogo = (num, extra = {}) => ({ id: String(num), num, drawName: 'SM Principal', roundName: 'R1', player1: 'A' + num, player2: 'B' + num, status: 'Pendente', time: '09:00', ...extra });

describe('ovMoney (valor em reais, jeito brasileiro)', () => {
  it('milhar com ponto e centavos com vírgula', () => {
    expect(ovMoney(3720)).toBe('R$ 3.720,00');
    expect(ovMoney(1234567.5)).toBe('R$ 1.234.567,50');
    expect(ovMoney(30)).toBe('R$ 30,00');
  });
  it('zero e valor inválido = R$ 0,00', () => {
    expect(ovMoney(0)).toBe('R$ 0,00');
    expect(ovMoney(undefined)).toBe('R$ 0,00');
  });
});

describe('ovMonthAbbr (mês na caixinha da data)', () => {
  it('mês abreviado em maiúsculas', () => {
    expect(ovMonthAbbr('2026-10-17')).toBe('OUT');
    expect(ovMonthAbbr('2026-01-03')).toBe('JAN');
    expect(ovMonthAbbr('2026-12-31')).toBe('DEZ');
  });
  it('sem data = vazio', () => expect(ovMonthAbbr('')).toBe(''));
});

describe('ovLiveScore (placar na quadra, igual ao painel das Partidas)', () => {
  it('placar ao vivo do árbitro: "15 - 12 (Set 2)" vira 15–12', () => {
    expect(ovLiveScore({ liveScore: '15 - 12 (Set 2)' })).toBe('15–12');
  });
  it('sem placar ao vivo: o placar do jogo (ou vazio)', () => {
    expect(ovLiveScore({ score: '21-15 / 10-8' })).toBe('21-15 / 10-8');
    expect(ovLiveScore({})).toBe('');
  });
});

describe('ovCourts (agora nas quadras)', () => {
  const ms = [
    jogo(1, { status: 'Em Quadra', court: 'Quadra 2', liveScore: '4 - 3 (Set 1)' }),
    jogo(2, { status: 'Em Quadra', court: 'Central' }),
    jogo(3, { status: 'Pendente', court: 'Quadra 1' }),
    jogo(4, { status: 'Finalizada', court: 'Quadra 3' })
  ];
  it('1 jogo por quadra ocupada, na ordem das quadras, com o nome configurado', () => {
    const r = ovCourts(ms, 3, ['Central']);
    expect(r.busy.map(c => [c.court, c.m.num, c.score])).toEqual([['Central', 2, ''], ['Quadra 2', 1, '4–3']]);
    expect(r.free).toBe(1);
  });
  it('sem jogo em quadra: nenhuma ocupada, todas livres', () => {
    expect(ovCourts([jogo(1)], 4, [])).toEqual({ busy: [], free: 4 });
  });
});

describe('ovNextMatches (próximos jogos: pendentes com horário, na ordem do dia e da hora)', () => {
  const dayOf = m => m.day;
  const ms = [
    jogo(1, { day: '2026-10-17', time: '13:50' }),
    jogo(2, { day: '2026-10-17', time: '13:00', status: 'Em Quadra' }),
    jogo(3, { day: '2026-10-17', time: '13:50', num: 3 }),
    jogo(4, { day: '2026-10-17', time: '14:20' }),
    jogo(5, { day: '2026-10-18', time: '08:00' }),
    jogo(6, { day: '2026-10-17', time: '10:00', status: 'Finalizada' }),
    jogo(7, { day: '2026-10-17', time: '15:00', status: 'A definir' }),
    jogo(8, { day: '2026-10-17', time: '15:10', player1: 'A definir' }),
    jogo(9, { day: '2026-10-17', time: '' }),
    jogo(10, { day: '2026-10-16', time: '18:00' })
  ];
  it('pula em quadra, finalizado, a definir e sem horário; ordem dia → hora → número; de hoje em diante', () => {
    expect(ovNextMatches(ms, dayOf, '2026-10-17', 4).map(m => m.num)).toEqual([1, 3, 4, 5]);
  });
  it('fora dos dias (nenhum de hoje em diante): os primeiros pendentes do torneio', () => {
    expect(ovNextMatches(ms, dayOf, '2026-10-30', 2).map(m => m.num)).toEqual([10, 1]);
  });
  it('sem jogos: lista vazia', () => expect(ovNextMatches([], dayOf, '2026-10-17', 4)).toEqual([]));
});

describe('ovFinance (inscrições arrecadadas: a mesma conta de antes)', () => {
  it('categorias pagas × valor do atleta (ou o do torneio); pendente não entra', () => {
    const players = [
      { inscriptions: [{}, {}], valorCategoria: 40 },
      { inscriptions: [{}], pagamentoStatus: 'pago' },
      { inscriptions: [{}, {}, {}], pagamentoStatus: 'pendente' }
    ];
    expect(ovFinance(players, 30)).toEqual({ total: 110, paid: 3 });
  });
  it('sem atletas: zero', () => expect(ovFinance([], 30)).toEqual({ total: 0, paid: 0 }));
});

describe('ovDayTag (dia nos próximos jogos que não são de hoje)', () => {
  const dias = [{ date: '2026-10-17' }, { date: '2026-10-18' }];
  it('hoje = sem etiqueta; outro dia da programação = "Dia N"', () => {
    expect(ovDayTag('2026-10-17', '2026-10-17', dias)).toBe('');
    expect(ovDayTag('2026-10-18', '2026-10-17', dias)).toBe('Dia 2');
  });
  it('fora da programação = a data; sem data = vazio', () => {
    expect(ovDayTag('2026-10-25', '2026-10-17', dias)).toBe('25/10');
    expect(ovDayTag('', '2026-10-17', dias)).toBe('');
  });
});
