import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// Sumula em branco (igual ao BTP, Report > Scoresheets): A4 paisagem, 1 por
// folha, filtro de dia/quadra/horario, pula "A definir" e as ja impressas.
// Modelo validado pelo Weslley em 18/10/2026 ("1-1-2").
const S = loadModule('src/js/modules/scoresheet.js');

const DONE = ['Finalizada', 'WO', 'Desistencia', 'Desqualificacao', 'SemJogo'];
const ctx = {
  dayOf: m => (m.dia == null ? -1 : m.dia),
  isDone: m => DONE.includes(m.status),
  isToDefine: m => m.status === 'A definir' || m.isDefinida === false,
};
const jogo = (num, extra) => ({ num, drawName: 'SM Sub 13', roundName: 'Quartas', player1: `A${num}`, player2: `B${num}`, status: 'Pendente', time: '08:00', dia: 0, ...extra });
const nums = list => list.map(m => m.num);

describe('scoresheetSelect (quais jogos ganham sumula em branco)', () => {
  const base = { day: '', court: '', from: '', to: '', skipUnknown: true, skipPrinted: true };

  it('sem filtro: todos os jogos que ainda nao terminaram', () => {
    const ms = [jogo(1), jogo(2, { status: 'Finalizada' }), jogo(3, { status: 'Em Quadra' }), jogo(4, { status: 'WO' })];
    expect(nums(S.scoresheetSelect(ms, base, ctx))).toEqual([1, 3]);
  });

  it('pula jogo com atleta "A definir" (igual ao BTP: "Skip if not all players are known")', () => {
    const ms = [jogo(1), jogo(2, { status: 'A definir', player1: '', player2: '' }), jogo(3, { isDefinida: false }), jogo(4, { player2: '' })];
    expect(nums(S.scoresheetSelect(ms, base, ctx))).toEqual([1]);
    expect(nums(S.scoresheetSelect(ms, { ...base, skipUnknown: false }, ctx))).toEqual([1, 2, 3, 4]);
  });

  it('jogo com BYE nunca ganha sumula', () => {
    const ms = [jogo(1, { player2: 'BYE' }), jogo(2)];
    expect(nums(S.scoresheetSelect(ms, { ...base, skipUnknown: false }, ctx))).toEqual([2]);
  });

  it('pula as ja impressas (igual ao BTP: "Skip if already printed")', () => {
    const ms = [jogo(1, { scoresheetPrintedAt: '2026-10-18T10:00:00Z' }), jogo(2)];
    expect(nums(S.scoresheetSelect(ms, base, ctx))).toEqual([2]);
    expect(nums(S.scoresheetSelect(ms, { ...base, skipPrinted: false }, ctx))).toEqual([1, 2]);
  });

  it('filtra pelo dia do jogo', () => {
    const ms = [jogo(1, { dia: 0 }), jogo(2, { dia: 1 }), jogo(3, { dia: null })];
    expect(nums(S.scoresheetSelect(ms, { ...base, day: 1 }, ctx))).toEqual([2]);
    expect(nums(S.scoresheetSelect(ms, { ...base, day: '1' }, ctx))).toEqual([2]);
  });

  it('filtra pela quadra (so os jogos que ja tem quadra)', () => {
    const ms = [jogo(1, { court: 'Quadra 1' }), jogo(2, { court: 'Quadra 2' }), jogo(3)];
    expect(nums(S.scoresheetSelect(ms, { ...base, court: 'Quadra 2' }, ctx))).toEqual([2]);
  });

  it('filtra pelo horario (de/ate, com as pontas); sem horario sai do filtro', () => {
    const ms = [jogo(1, { time: '07:59' }), jogo(2, { time: '08:00' }), jogo(3, { time: '09:30' }), jogo(4, { time: '10:00' }), jogo(5, { time: '' })];
    expect(nums(S.scoresheetSelect(ms, { ...base, from: '08:00', to: '09:30' }, ctx))).toEqual([2, 3]);
    expect(nums(S.scoresheetSelect(ms, { ...base, from: '09:00' }, ctx))).toEqual([3, 4]);
    expect(nums(S.scoresheetSelect(ms, { ...base, to: '08:00' }, ctx))).toEqual([1, 2]);
  });

  it('ordem: dia, horario e numero do jogo (sem dia e sem horario no fim)', () => {
    const ms = [jogo(5, { dia: 1, time: '08:00' }), jogo(2, { dia: 0, time: '10:00' }), jogo(3, { dia: 0, time: '08:00' }),
      jogo(1, { dia: 0, time: '08:00' }), jogo(4, { dia: 0, time: '' }), jogo(6, { dia: null, time: '07:00' })];
    expect(nums(S.scoresheetSelect(ms, base, ctx))).toEqual([1, 3, 2, 4, 5, 6]);
  });
});

describe('scoresheetSheet (a folha)', () => {
  const t = { name: 'Torneio <Teste>', dateText: '18/10/2026', location: 'Ginásio - Maceió' };
  const clubOf = n => ({ 'Ana Souza': 'Clube Pajuçara', 'Bia Lima': 'Arapiraca BC', 'Caio': 'Clube Pajuçara', 'Davi': 'Ponta Verde' }[n] || '');

  it('simples: cabeçalho do jogo preenchido e a grade em branco', () => {
    const m = { num: 23, drawName: 'SF Sub 15', roundName: 'Quartas', player1: 'Ana Souza', player2: 'Bia Lima', time: '10:40', court: 'Quadra 2', umpire: '' };
    const h = S.scoresheetSheet(m, t, { day: '18/10/2026', clubOf });
    expect(h).toContain('SÚMULA DE JOGO');
    expect(h).toContain('>23<');
    expect(h).toContain('SF Sub 15');
    expect(h).toContain('Simples Feminino');
    expect(h).toContain('Quartas');
    expect(h).toContain('10:40');
    expect(h).toContain('Quadra 2');
    expect(h).toContain('Ana Souza');
    expect(h).toContain('Clube Pajuçara');
    expect(h).toContain('Arapiraca BC');
    expect(h).toContain('Torneio &lt;Teste&gt;');
    expect(h).not.toContain('<Teste>');
    expect(h).toContain('Atleta 1');
    expect((h.match(/<table class="blk">/g) || []).length).toBe(6); // 3 games x 2 blocos
    expect(h).toContain('W.O.');
    expect(h).toContain('Assinatura do árbitro');
  });

  it('dupla: os 2 nomes de cada lado e "Dupla 1/2"', () => {
    const m = { num: 7, drawName: 'DX Principal', roundName: 'Final', player1: 'Ana Souza / Caio', player2: 'Bia Lima / Davi', time: '', court: '', umpire: 'Carlos' };
    const h = S.scoresheetSheet(m, t, { day: '', clubOf });
    expect(h).toContain('Duplas Mistas');
    expect(h).toContain('Dupla 1');
    expect(h).toContain('Caio');
    expect(h).toContain('Davi');
    expect(h).toContain('Ponta Verde');
    expect(h).toContain('Carlos');
  });

  it('jogo sem atleta definido sai com o rotulo da chave (ex.: Venc. jogo 12)', () => {
    const m = { num: 30, drawName: 'SM Sub 13', roundName: 'Semifinal', player1: '', player2: '', player1Display: 'Venc. jogo 12', player2Display: 'A definir', time: '15:00' };
    const h = S.scoresheetSheet(m, t, { day: '19/10/2026', clubOf });
    expect(h).toContain('Venc. jogo 12');
    expect(h).toContain('A definir');
  });
});

describe('scoresheetDocument', () => {
  it('A4 paisagem, 1 folha por pagina, com botao de imprimir', () => {
    const doc = S.scoresheetDocument(['<section class="sheet">1</section>', '<section class="sheet">2</section>'], 'Sumulas');
    expect(doc).toContain('size:A4 landscape');
    expect(doc).toContain('break-after:page');
    expect(doc).toContain('data-action="print"');
    expect((doc.match(/class="sheet"/g) || []).length).toBe(2);
  });
});
