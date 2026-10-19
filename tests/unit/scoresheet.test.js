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

describe('scoresheetSelect preenchida (jogos finalizados)', () => {
  const base = { filled: true, day: '', court: '', from: '', to: '', skipUnknown: true, skipPrinted: true };

  it('so os jogos finalizados (todas as situacoes), sem BYE; os 2 "pular" nao valem', () => {
    const ms = [jogo(1), jogo(2, { status: 'Finalizada', scoresheetPrintedAt: '2026-10-18T10:00:00Z' }), jogo(3, { status: 'Em Quadra' }),
      jogo(4, { status: 'WO' }), jogo(5, { status: 'SemJogo' }), jogo(6, { status: 'Desistencia' }), jogo(7, { status: 'Finalizada', player2: 'BYE' })];
    expect(nums(S.scoresheetSelect(ms, base, ctx))).toEqual([2, 4, 5, 6]);
  });

  it('filtra dia, quadra e horario igual a em branco', () => {
    const fin = { status: 'Finalizada' };
    const ms = [jogo(1, { ...fin, dia: 0, court: 'Quadra 1', time: '08:00' }), jogo(2, { ...fin, dia: 1, court: 'Quadra 1', time: '08:00' }),
      jogo(3, { ...fin, dia: 0, court: 'Quadra 2', time: '08:00' }), jogo(4, { ...fin, dia: 0, court: 'Quadra 1', time: '11:00' })];
    expect(nums(S.scoresheetSelect(ms, { ...base, day: 0, court: 'Quadra 1', to: '10:00' }, ctx))).toEqual([1]);
  });
});

describe('scoresheetGames', () => {
  it('placar game a game; W.O./vazio = nenhum game', () => {
    expect(S.scoresheetGames('21-18 / 17-21 / 21-16')).toEqual([[21, 18], [17, 21], [21, 16]]);
    expect(S.scoresheetGames('21-18/ 5-3')).toEqual([[21, 18], [5, 3]]);
    expect(S.scoresheetGames('W.O.')).toEqual([]);
    expect(S.scoresheetGames('')).toEqual([]);
  });
});

// celula da grade: [bloco, linha, coluna] -> valor (ou 'O<v>' se circulado)
const cel = (gr, b, r, c) => { const v = gr.blocks[b][r][c]; return v == null ? null : (v.fin ? 'O' + v.val : v.val); };
const linhaDe = (gr, b, r, n) => Array.from({ length: n }, (_, c) => cel(gr, b, r, c));

describe('scoresheetGrid (grade BWF a partir do ponto a ponto do arbitro)', () => {
  it('simples: 0 a 0 na 1a coluna, placar de quem ganhou na linha de quem saca o proximo, ultimo circulado, so o S', () => {
    const gr = S.scoresheetGrid({ srv: 0, rcv: 2, pts: [[1, 0], [2, 2], [2, 2], [1, 0]] }, false);
    expect(gr.sr).toEqual({ 0: 'S' });
    expect(linhaDe(gr, 0, 0, 6)).toEqual([0, 1, null, null, 2, null].map((v, i) => (i === 4 ? 'O2' : v)));
    expect(linhaDe(gr, 0, 2, 6)).toEqual([0, null, 1, 2, null, null]);
    expect(gr.score).toEqual([2, 2]);
    expect(gr.used).toBe(5);
  });

  it('dupla: usa as linhas GRAVADAS (sacador, recebedor e cada proximo sacador)', () => {
    const gr = S.scoresheetGrid({ srv: 2, rcv: 1, pts: [[2, 3], [1, 1], [1, 0], [2, 2]] }, true);
    expect(gr.sr).toEqual({ 2: 'S', 1: 'R' });
    expect(cel(gr, 0, 2, 0)).toBe(0);
    expect(cel(gr, 0, 1, 0)).toBe(0);
    expect(cel(gr, 0, 3, 1)).toBe(1);
    expect(cel(gr, 0, 1, 2)).toBe(1);
    expect(cel(gr, 0, 0, 3)).toBe(2);
    expect(cel(gr, 0, 2, 4)).toBe('O2');
  });

  it('game de 30-29 continua no 2o bloco (60 colunas)', () => {
    const pts = [];
    for (let k = 0; k < 29; k++) pts.push([1, 0], [2, 2]);
    pts.push([1, 0]);
    const gr = S.scoresheetGrid({ srv: 0, rcv: 2, pts }, false);
    expect(gr.score).toEqual([30, 29]);
    expect(gr.used).toBe(60);
    expect(cel(gr, 1, 0, 24)).toBe('O30');
    expect(cel(gr, 1, 2, 23)).toBe(29);
  });

  it('game interrompido (desistencia) nao circula o ultimo ponto', () => {
    const gr = S.scoresheetGrid({ srv: 0, rcv: 2, pts: [[1, 0], [1, 0]] }, false, true);
    expect(cel(gr, 0, 0, 2)).toBe(2);
  });

  it('linha fora do lado (dado torto) vai pro 1o nome do lado', () => {
    const gr = S.scoresheetGrid({ srv: 0, rcv: 2, pts: [[2, 0], [1, 3]] }, true);
    expect(cel(gr, 0, 2, 1)).toBe(1);
    expect(cel(gr, 0, 0, 2)).toBe('O1');
  });
});

describe('scoresheetSheet preenchida', () => {
  const t = { name: 'Torneio', dateText: '18/10/2026', location: '' };
  const clubOf = () => '';
  const iso = (h, mi) => new Date(2026, 9, 18, h, mi).toISOString();
  const rali = (a, b, ultimo) => { // a pontos do lado 1 e b do lado 2; o ultimo rali e de quem ganhou
    const pts = [];
    for (let k = 0; k < (ultimo === 1 ? a - 1 : a); k++) pts.push([1, 0]);
    for (let k = 0; k < (ultimo === 2 ? b - 1 : b); k++) pts.push([2, 2]);
    pts.push([ultimo, ultimo === 1 ? 0 : 2]);
    return { srv: 0, rcv: 2, pts };
  };
  const fin = extra => ({ num: 9, drawName: 'SM Principal', roundName: 'Final', player1: 'Ana', player2: 'Bia', time: '15:00', court: 'Quadra 1',
    umpire: 'Carlos', status: 'Finalizada', winner: 1, score: '21-18 / 17-21 / 21-16', startedAt: iso(15, 42), finishedAt: iso(16, 31), ...extra });
  const info = { day: '18/10/2026', clubOf, filled: true, points: 21, maxPoints: 30 };

  it('com o ponto a ponto: grade marcada, vencedor, placar, inicio/fim/duracao e arbitro', () => {
    const h = S.scoresheetSheet(fin({ rallies: [rali(21, 18, 1), rali(17, 21, 2), rali(21, 16, 1)] }), t, info);
    expect(h).toContain('is-filled');
    expect(h).toContain('preenchida com o resultado do app');
    expect(h).toContain('<em>VENCEDOR</em>');
    expect(h).not.toContain('class="vbox"');
    expect(h).toContain('games <b>2 × 1</b>');
    expect(h).toContain('21-18 / 17-21 / 21-16');
    expect(h).toContain('15:42');
    expect(h).toContain('16:31');
    expect(h).toContain('49 min');
    expect((h.match(/class="pc"/g) || []).length).toBe(3); // ultimo ponto de cada game
    expect(h).not.toContain('ponto a ponto não registrado');
    expect(h).toContain('Assinatura do árbitro · <b>Carlos</b>');
  });

  it('sem o ponto a ponto (lancado no Planner): placar do game circulado + aviso', () => {
    const h = S.scoresheetSheet(fin({ score: '21-18 / 21-15' }), t, info);
    expect((h.match(/class="circ/g) || []).length).toBe(4);
    expect(h).toContain('1º game: 21 × 18');
    expect(h).toContain('ponto a ponto não registrado');
    expect(h).toContain('3º game não disputado');
    expect(h).toContain('games <b>2 × 0</b>');
  });

  it('ponto a ponto que nao bate com o placar (resultado corrigido depois) nao entra', () => {
    const h = S.scoresheetSheet(fin({ score: '21-19 / 21-15', rallies: [rali(21, 18, 1), rali(21, 15, 1)] }), t, info);
    expect(h).toContain('1º game: 21 × 19');
    expect((h.match(/class="pc"/g) || []).length).toBe(1); // so o 2o game bate
  });

  it('W.O.: jogo nao disputado, W.O. marcado e quem venceu', () => {
    const h = S.scoresheetSheet(fin({ status: 'WO', score: 'W.O.', winner: 2, atestado: true, startedAt: undefined }), t, info);
    expect(h).toContain('Jogo não disputado');
    expect(h).toContain('W.O. (atestado)');
    expect(h).toContain('class="chk on"');
    expect(h).toContain('vence <b>Atleta 2</b>');
    expect(h).toMatch(/side side2 win[\s\S]*<em>VENCEDOR<\/em>/);
  });

  it('sem jogo (os dois ausentes): ninguem vence', () => {
    const h = S.scoresheetSheet(fin({ status: 'SemJogo', score: '', winner: 0 }), t, info);
    expect(h).toContain('<b>Sem jogo</b>');
    expect(h).not.toContain('<em>VENCEDOR</em>');
  });

  it('desistencia no meio do game: parcial, Ret na coluna seguinte e o game interrompido sem circulo', () => {
    const cut = { srv: 0, rcv: 2, pts: [[1, 0], [1, 0], [2, 2]] };
    const h = S.scoresheetSheet(fin({ status: 'Desistencia', score: '21-18 / 2-1', rallies: [rali(21, 18, 1), cut] }), t, info);
    expect(h).toContain('<b>Desistência</b> de Atleta 2');
    expect(h).toContain('parcial 21-18 / 2-1');
    expect(h).toContain('>Ret<');
    expect((h.match(/class="pc"/g) || []).length).toBe(1);
  });

  it('em branco continua igual (sem resultado, caixa VENCEDOR pro arbitro)', () => {
    const h = S.scoresheetSheet(fin({ rallies: [rali(21, 18, 1)] }), t, { day: '18/10/2026', clubOf });
    expect(h).not.toContain('is-filled');
    expect(h).toContain('class="vbox"');
    expect(h).not.toContain('class="pc"');
    expect(h).not.toContain('15:42');
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
