import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const SLOTS = loadModule('src/js/modules/schedule-slots.js');
const { scheduleValidationSettings, scheduleValidationGroups, scheduleValidate } =
  loadModule('src/js/modules/schedule-validation.js', SLOTS);

const H = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Dia 08:00-20:00, pausa 12:00-13:00, jogo de 30 min, descanso 20, 2 quadras
const grade = { start: H('08:00'), end: H('20:00'), breakStart: H('12:00'), breakEnd: H('13:00'), dur: 30, rest: 20, courts: 2 };
const dias = [{ date: '2026-11-07', draws: ['SM A', 'DM A', 'SM B'] }, { date: '2026-11-08', draws: ['SM C'] }];
let seq = 0;
const jogo = (num, time, p1, p2, extra = {}) => ({
  id: 'j' + (++seq), num, time, drawName: 'SM A', event: 'SM', roundName: 'R1', round: 1, status: 'Pendente',
  player1: p1, player2: p2, ...extra,
});
const validar = (matches, settings = {}, extra = {}) => scheduleValidate(matches, {
  days: dias, roundDays: {}, gridOf: () => grade, drawOf: () => null,
  settings: scheduleValidationSettings(settings, 20), ...extra,
});
const grupo = (res, g) => res.rows.filter(r => r.grupo === g);

describe('scheduleValidationSettings — padrões', () => {
  it('tudo ligado; descanso = o do torneio; 19:00/10:00; máximos 2/1/1', () => {
    const s = scheduleValidationSettings(undefined, 25);
    expect(s).toMatchObject({
      semHorario: true, conflito: true, descanso: true, descansoMin: 25, quadras: true, ordem: true, horarioDoDia: true,
      tardeCedo: true, tardeDepois: '19:00', cedoAntes: '10:00', simplesDepoisDuplas: true,
      maxDia: true, maxDiaN: 2, maxSimplesDia: true, maxSimplesDiaN: 1, maxChaveDia: true, maxChaveDiaN: 1,
    });
  });

  it('guarda o que foi desligado e cai no padrão com número ou hora inválidos', () => {
    const s = scheduleValidationSettings({ maxDia: false, maxDiaN: 'x', descansoMin: 0, tardeDepois: '7h', cedoAntes: '09:30' }, 20);
    expect(s.maxDia).toBe(false);
    expect(s.maxDiaN).toBe(2);
    expect(s.descansoMin).toBe(0);
    expect(s.tardeDepois).toBe('19:00');
    expect(s.cedoAntes).toBe('09:30');
  });

  it('grupos na ordem da lista: regras da agenda (com ⚠) e depois as outras', () => {
    const g = scheduleValidationGroups();
    expect(g.map(x => x.id)).toEqual(['semHorario', 'conflito', 'descanso', 'quadras', 'ordem', 'horarioDoDia',
      'tardeCedo', 'simplesDepoisDuplas', 'maxDia', 'maxSimplesDia', 'maxChaveDia']);
    expect(g.filter(x => x.regra).map(x => x.id)).toEqual(['semHorario', 'conflito', 'descanso', 'quadras', 'ordem', 'horarioDoDia']);
  });
});

describe('scheduleValidate — regras da agenda', () => {
  it('agenda sem problema: lista vazia', () => {
    const res = validar([jogo(1, '08:00', 'Ana', 'Bia'), jogo(2, '08:00', 'Caio', 'Duda')], { maxChaveDia: false });
    expect(res.rows).toEqual([]);
    expect(res.byMatch.size).toBe(0);
  });

  it('sem horário: pendente e "A definir" entram; em quadra e finalizado não', () => {
    const a = jogo(1, '', 'Ana', 'Bia');
    const b = jogo(2, '', '', '', { status: 'A definir', isDefinida: false, player1Display: 'Venc. jogo 1' });
    const c = jogo(3, '', 'Caio', 'Duda', { status: 'Em Quadra' });
    const d = jogo(4, '', 'Eva', 'Fabi', { status: 'Finalizada' });
    const res = validar([a, b, c, d]);
    expect(grupo(res, 'semHorario').map(r => [r.num, r.nome, r.texto])).toEqual([
      [1, 'Ana x Bia', 'Sem horário.'],
      [2, 'Venc. jogo 1 x A definir', 'Sem horário.'],
    ]);
    expect(res.byMatch.get(a)).toEqual(['Sem horário.']);
    expect(grupo(validar([a], { semHorario: false }), 'semHorario')).toEqual([]);
  });

  it('atleta em 2 jogos ao mesmo tempo: 1 linha (no jogo de nº maior) e ⚠ nos 2, cada um citando o outro', () => {
    const a = jogo(1, '09:00', 'Ana', 'Bia');
    const b = jogo(2, '09:00', 'Ana / Caio', 'Duda / Eva', { drawName: 'DM A', event: 'DM' });
    const res = validar([b, a]);
    expect(grupo(res, 'conflito').map(r => [r.num, r.nome, r.texto])).toEqual([
      [2, 'Ana', 'Atleta em 2 jogos ao mesmo tempo (jogo #1 às 09:00, SM A): Ana.'],
    ]);
    expect(res.byMatch.get(b)).toEqual(['Atleta em 2 jogos ao mesmo tempo (jogo #1 às 09:00, SM A): Ana.']);
    expect(res.byMatch.get(a)).toEqual(['Atleta em 2 jogos ao mesmo tempo (jogo #2 às 09:00, DM A): Ana.']);
  });

  it('descanso: usa o mínimo da janela (padrão = o do torneio) e pode ser desligado', () => {
    const a = jogo(1, '09:00', 'Ana', 'Bia');
    const b = jogo(2, '09:50', 'Ana', 'Caio', { drawName: 'SM B' });
    expect(grupo(validar([a, b]), 'descanso')).toEqual([]); // 20 min de descanso = ok
    const res = validar([a, b], { descansoMin: 40 });
    expect(grupo(res, 'descanso').map(r => [r.num, r.texto])).toEqual([
      [2, 'Descanso de 20 min, o mínimo é 40 (jogo #1 às 09:00, SM A): Ana.'],
    ]);
    expect(res.byMatch.get(a)).toEqual(['Descanso de 20 min, o mínimo é 40 (jogo #2 às 09:50, SM B): Ana.']);
    expect(grupo(validar([a, b], { descansoMin: 40, descanso: false }), 'descanso')).toEqual([]);
  });

  it('"A definir": quem pode chegar nos 2 jogos ao mesmo tempo = conflito; só sem descanso = descanso', () => {
    const elim = { name: 'SM A', type: 'Eliminatoria', matches: [
      { round: 1, player1: 'Ana', player2: 'Bia' }, { round: 1, player1: 'Caio', player2: 'Duda' }, { round: 2, player1: '', player2: '' },
    ] };
    const drawOf = x => (x.drawName === 'SM A' ? elim : null);
    const semi = jogo(3, '11:00', '', '', { status: 'A definir', isDefinida: false, round: 2, drawMatchIdx: 2 });
    const mesmaHora = jogo(9, '11:00', 'Ana', 'Eva', { drawName: 'SM B' });
    const semDescanso = jogo(9, '11:40', 'Ana', 'Eva', { drawName: 'SM B' });
    const st = { maxDia: false, maxSimplesDia: false, maxChaveDia: false };
    const r1 = validar([semi, mesmaHora], st, { drawOf });
    expect(grupo(r1, 'conflito').map(r => r.texto)).toEqual(['Atleta que pode chegar nos 2 jogos, sem descanso (jogo #3 às 11:00, SM A): Ana.']);
    expect(grupo(r1, 'descanso')).toEqual([]);
    const r2 = validar([semi, semDescanso], st, { drawOf });
    expect(grupo(r2, 'conflito')).toEqual([]);
    expect(grupo(r2, 'descanso').map(r => r.texto)).toEqual(['Atleta que pode chegar nos 2 jogos, sem descanso (jogo #3 às 11:00, SM A): Ana.']);
  });

  it('quadras cheias: só o jogo que passa do número de quadras', () => {
    const js = [jogo(1, '10:00', 'Ana', 'Bia'), jogo(2, '10:00', 'Caio', 'Duda'), jogo(3, '10:00', 'Eva', 'Fabi')];
    const res = validar(js, { maxChaveDia: false });
    expect(grupo(res, 'quadras').map(r => [r.num, r.nome, r.texto])).toEqual([[3, 'Eva x Fabi', 'As 2 quadras já têm jogo nesse horário.']]);
    expect(res.byMatch.has(js[0])).toBe(false);
  });

  it('ordem das fases: a semi antes de acabar as quartas (1 linha)', () => {
    const d = { name: 'SM A', type: 'Eliminatoria', matches: [] };
    const q = jogo(1, '09:00', 'Ana', 'Bia', { round: 1, roundName: 'Quartas' });
    const s = jogo(2, '09:00', 'Caio', 'Duda', { round: 2, roundName: 'Semifinal' });
    const res = validar([q, s], { maxChaveDia: false }, { drawOf: () => d });
    expect(grupo(res, 'ordem').map(r => [r.num, r.texto])).toEqual([
      [2, 'Começa antes de acabar a fase anterior da chave (último jogo às 09:00).'],
    ]);
  });

  it('fora do horário do dia e na pausa', () => {
    const res = validar([jogo(1, '07:30', 'Ana', 'Bia'), jogo(2, '12:15', 'Caio', 'Duda', { drawName: 'SM B' })]);
    expect(grupo(res, 'horarioDoDia').map(r => [r.num, r.texto])).toEqual([
      [1, 'Fora do horário do dia (08:00 às 20:00).'],
      [2, 'Cai na pausa (12:00 às 13:00).'],
    ]);
  });

  it('jogos de dias diferentes não se comparam; jogo finalizado não conta', () => {
    const a = jogo(1, '09:00', 'Ana', 'Bia');
    const b = jogo(2, '09:00', 'Ana', 'Caio', { drawName: 'SM C' }); // SM C é do dia 2
    expect(grupo(validar([a, b]), 'conflito')).toEqual([]);
    const c = jogo(3, '09:00', 'Ana', 'Duda', { drawName: 'SM B', status: 'Finalizada' });
    expect(grupo(validar([a, c]), 'conflito')).toEqual([]);
  });

  it('cada linha leva o dia do jogo (índice em days)', () => {
    const res = validar([jogo(1, '', 'Ana', 'Bia', { drawName: 'SM C' })]);
    expect(res.rows[0].day).toBe(1);
  });
});

describe('scheduleValidate — outras checagens', () => {
  it('máximo de partidas por dia: conta cada atleta da dupla; linha sem jogo', () => {
    const js = [
      jogo(1, '08:00', 'Ana', 'Bia'),
      jogo(2, '09:00', 'Ana / Caio', 'Duda / Eva', { drawName: 'DM A', event: 'DM' }),
      jogo(3, '10:00', 'Ana', 'Fabi', { drawName: 'SM B' }),
    ];
    const res = validar(js, { maxChaveDia: false, simplesDepoisDuplas: false });
    expect(grupo(res, 'maxDia').map(r => [r.nome, r.m, r.day, r.texto])).toEqual([['Ana', null, 0, '3 partidas']]);
    expect(grupo(validar(js, { maxDiaN: 3 }), 'maxDia')).toEqual([]);
    expect(res.byMatch.size).toBe(0); // essas checagens não marcam ⚠ no jogo
  });

  it('máximo de simples por dia e de partidas por chave por dia', () => {
    const js = [jogo(1, '08:00', 'Ana', 'Bia'), jogo(2, '09:00', 'Ana', 'Caio'), jogo(3, '10:00', 'Ana', 'Duda', { drawName: 'SM B' })];
    const res = validar(js, { maxDia: false });
    expect(grupo(res, 'maxSimplesDia').map(r => [r.nome, r.texto])).toEqual([['Ana', '3 partidas de simples']]);
    expect(grupo(res, 'maxChaveDia').map(r => [r.nome, r.drawName, r.texto])).toEqual([['Ana', 'SM A', '2 partidas em SM A']]); // "Ver chave" abre a chave
  });

  it('simples depois de duplas: 2 linhas (a dupla e a simples); simples antes da dupla não', () => {
    const d = jogo(1, '09:00', 'Ana / Bia', 'Caio / Duda', { drawName: 'DM A', event: 'DM' });
    const s = jogo(2, '11:00', 'Ana', 'Eva', { drawName: 'SM B' });
    const res = validar([d, s], { maxDia: false, maxSimplesDia: false, maxChaveDia: false });
    expect(grupo(res, 'simplesDepoisDuplas').map(r => [r.nome, r.num, r.texto])).toEqual([
      ['Ana', 1, 'Dupla às 09:00 e simples às 11:00.'],
      ['Ana', 2, 'Dupla às 09:00 e simples às 11:00.'],
    ]);
    const antes = { ...s, time: '08:00' };
    expect(grupo(validar([d, antes], { maxDia: false }), 'simplesDepoisDuplas')).toEqual([]);
  });

  it('termina tarde e começa cedo: dias seguidos, início >= 19:00 e <= 10:00 (uma linha em cada dia)', () => {
    const tarde = jogo(1, '19:00', 'Ana', 'Bia');
    const cedo = jogo(2, '10:00', 'Ana', 'Caio', { drawName: 'SM C' });
    const res = validar([tarde, cedo], { maxChaveDia: false });
    expect(grupo(res, 'tardeCedo').map(r => [r.nome, r.num, r.day, r.texto])).toEqual([
      ['Ana', 1, 0, 'Joga às 19:00 (07/11) e às 10:00 do dia seguinte.'],
      ['Ana', 2, 1, 'Joga às 19:00 (07/11) e às 10:00 do dia seguinte.'],
    ]);
    expect(grupo(validar([{ ...tarde, time: '18:30' }, cedo]), 'tardeCedo')).toEqual([]);
    expect(grupo(validar([tarde, { ...cedo, time: '10:30' }]), 'tardeCedo')).toEqual([]);
    const longe = [{ date: '2026-11-07', draws: ['SM A'] }, { date: '2026-11-09', draws: ['SM C'] }];
    expect(grupo(validar([tarde, cedo], {}, { days: longe }), 'tardeCedo')).toEqual([]);
  });

  it('"A definir" de Eliminatória conta o caminho do atleta; Grupos + Eliminatória só os conhecidos', () => {
    const elim = { name: 'SM A', type: 'Eliminatoria', matches: [
      { round: 1, player1: 'Ana', player2: 'Bia' }, { round: 1, player1: 'Caio', player2: 'Duda' }, { round: 2, player1: '', player2: '' },
    ] };
    const r1 = jogo(1, '08:00', 'Ana', 'Bia', { drawMatchIdx: 0 });
    const r1b = jogo(2, '08:00', 'Caio', 'Duda', { drawMatchIdx: 1 });
    const fin = jogo(3, '10:00', '', '', { status: 'A definir', isDefinida: false, round: 2, roundName: 'Final', drawMatchIdx: 2 });
    const outra = jogo(4, '15:00', 'Ana', 'Eva', { drawName: 'SM B' });
    const res = validar([r1, r1b, fin, outra], { maxSimplesDia: false, maxChaveDia: false }, { drawOf: x => (x.drawName === 'SM A' ? elim : null) });
    expect(grupo(res, 'maxDia').map(r => [r.nome, r.texto])).toEqual([['Ana', '3 partidas']]);
    const gElim = { name: 'SM A', type: 'Grupos + Eliminatoria', groupsData: { groups: [{ matches: [{ player1: 'Ana', player2: 'Bia' }] }], eliminationMatches: [] } };
    const res2 = validar([r1, fin, outra], { maxSimplesDia: false, maxChaveDia: false }, { drawOf: x => (x.drawName === 'SM A' ? gElim : null) });
    expect(grupo(res2, 'maxDia')).toEqual([]);
  });
});
