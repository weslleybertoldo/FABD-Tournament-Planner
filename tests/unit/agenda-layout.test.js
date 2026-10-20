import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { agendaDayLabel, agendaGridRows } = loadModule('src/js/modules/schedule.js', {
  timeToMin: t => { const [h, m] = (t || '08:00').split(':').map(Number); return h * 60 + m; }
});

describe('agendaDayLabel (botão e faixa do dia na Agenda)', () => {
  it('sábado 17/10/2026: "Sáb 17/10" e "Sábado, 17/10/2026"', () => {
    expect(agendaDayLabel('2026-10-17')).toEqual({ curto: 'Sáb 17/10', longo: 'Sábado, 17/10/2026' });
  });
  it('domingo e segunda', () => {
    expect(agendaDayLabel('2026-10-18').curto).toBe('Dom 18/10');
    expect(agendaDayLabel('2026-10-19').longo).toBe('Segunda, 19/10/2026');
  });
  it('sem data: traço', () => {
    expect(agendaDayLabel('')).toEqual({ curto: '-', longo: '-' });
  });
});

describe('agendaGridRows (grade horário × quadra do dia)', () => {
  const j = (num, time, extra = {}) => ({ num, time, status: 'Pendente', ...extra });

  it('jogo com quadra vai na coluna dela; sem quadra ocupa a 1ª coluna livre', () => {
    const linhas = agendaGridRows([j(1, '08:00', { court: 'Quadra 3' }), j(2, '08:00'), j(3, '08:00')], 4, []);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].time).toBe('08:00');
    expect(linhas[0].cells.map(m => m && m.num)).toEqual([2, 3, 1, null]);
  });

  it('horários em ordem; o nome da quadra pode vir do courtNames', () => {
    const linhas = agendaGridRows([j(5, '09:00'), j(4, '08:00', { court: 'Central' })], 2, ['Quadra 1', 'Central']);
    expect(linhas.map(l => l.time)).toEqual(['08:00', '09:00']);
    expect(linhas[0].cells.map(m => m && m.num)).toEqual([null, 4]);
  });

  it('mais jogos que quadras no mesmo horário: abre outra linha do mesmo horário (nenhum some)', () => {
    const linhas = agendaGridRows([j(1, '08:00'), j(2, '08:00'), j(3, '08:00')], 2, []);
    expect(linhas.map(l => l.time)).toEqual(['08:00', '08:00']);
    expect(linhas.flatMap(l => l.cells).filter(Boolean).map(m => m.num).sort()).toEqual([1, 2, 3]);
  });

  it('duas quadras iguais no mesmo horário: o 2º vai pra coluna livre', () => {
    const linhas = agendaGridRows([j(1, '08:00', { court: 'Quadra 1' }), j(2, '08:00', { court: 'Quadra 1' })], 3, []);
    expect(linhas[0].cells.map(m => m && m.num)).toEqual([1, 2, null]);
  });

  it('jogo sem horário não entra na grade', () => {
    expect(agendaGridRows([j(1, ''), j(2, '08:00')], 2, []).flatMap(l => l.cells).filter(Boolean).map(m => m.num)).toEqual([2]);
  });
});
