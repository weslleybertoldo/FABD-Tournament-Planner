import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const {
  scheduleStageOf, scheduleDaySlots, scheduleAthletes, schedulePossibleAthletes,
  scheduleBook, schedulePlaceDefined, schedulePlaceToDefine, scheduleRole,
} = loadModule('src/js/modules/schedule-slots.js');

const H = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hh = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

describe('scheduleDaySlots', () => {
  it('quadra recebe jogo novo a cada duracao do jogo, pulando a pausa', () => {
    const slots = scheduleDaySlots({ start: H('08:00'), end: H('12:00'), breakStart: H('10:00'), breakEnd: H('10:30'), dur: 30 });
    expect(slots.map(hh)).toEqual(['08:00', '08:30', '09:00', '09:30', '10:30', '11:00', '11:30']);
  });

  it('dia 8h-18h com pausa 12h-13h30 e jogo de 30 min: 17 horarios (antes 10)', () => {
    const slots = scheduleDaySlots({ start: H('08:00'), end: H('18:00'), breakStart: H('12:00'), breakEnd: H('13:30'), dur: 30 });
    expect(slots.length).toBe(17);
    expect(hh(slots[7])).toBe('11:30');
    expect(hh(slots[8])).toBe('13:30');
  });

  it('pausa invertida nao trava nem volta no tempo', () => {
    const slots = scheduleDaySlots({ start: H('08:00'), end: H('10:00'), breakStart: H('12:00'), breakEnd: H('11:00'), dur: 30 });
    expect(slots.map(hh)).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });
});

describe('scheduleAthletes', () => {
  it('separa dupla e tira vazio e BYE', () => {
    expect(scheduleAthletes('Ana / Bia', 'BYE', '', null, 'Caio')).toEqual(['Ana', 'Bia', 'Caio']);
  });
});

describe('scheduleStageOf', () => {
  it('grupo antes do mata-mata, rodadas em ordem', () => {
    expect(scheduleStageOf({ phase: 'group', round: 3 })).toBe(0);
    expect(scheduleStageOf({ phase: 'elimination', round: 2 })).toBe(2);
    expect(scheduleStageOf({})).toBe(1);
  });
});

describe('scheduleBook', () => {
  it('quadra cheia so no mesmo horario; o descanso nao segura a quadra', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 2 });
    b.add(H('08:00'), ['A']); b.add(H('08:00'), ['B']);
    expect(b.courtFree(H('08:00'))).toBe(false);
    expect(b.courtFree(H('08:30'))).toBe(true);
  });

  it('horario fora da grade (agenda antiga) ocupa a quadra pela sobreposicao', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 1 });
    b.add(H('08:50'), ['C']);
    expect(b.courtFree(H('08:30'))).toBe(false);
    expect(b.courtFree(H('09:00'))).toBe(false);
    expect(b.courtFree(H('09:30'))).toBe(true);
  });

  it('atleta precisa de jogo + descanso entre um inicio e outro, antes ou depois', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('09:00'), ['A']);
    expect(b.free(H('09:00'), ['A'])).toBe(false);
    expect(b.free(H('09:30'), ['A'])).toBe(false);
    expect(b.free(H('09:50'), ['A'])).toBe(true);
    expect(b.free(H('08:10'), ['A'])).toBe(true);
    expect(b.free(H('08:30'), ['A'])).toBe(false);
    expect(b.free(H('09:00'), ['Z'])).toBe(true);
  });

  it('afterLast olha o MAIOR horario certo do atleta, nao o ultimo registrado', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('10:00'), ['A']);
    b.add(H('08:00'), ['A']);
    expect(b.afterLast(H('10:30'), ['A'])).toBe(false);
    expect(b.afterLast(H('10:50'), ['A'])).toBe(true);
  });

  it('atleta so possivel segura o horario mas nao conta como ultimo jogo', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('15:00'), ['B'], { possivel: true, tag: 'SF|2' });
    expect(b.afterLast(H('09:00'), ['B'])).toBe(true);
    expect(b.free(H('09:00'), ['B'])).toBe(true);
    expect(b.free(H('15:30'), ['B'])).toBe(false);
  });
});

describe('scheduleBook — mesma fase da chave', () => {
  const q = { drawName: 'SM Principal', phase: 'elimination', round: 1, status: 'A definir', isDefinida: false };

  it('as quartas "A definir" (qualquer atleta dos grupos) ficam juntas no mesmo horario', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    const grupos = ['A', 'B', 'C', 'D'];
    const slots = ['10:00', '10:30'].map(H);
    const horarios = [1, 2, 3, 4].map(() => {
      const si = schedulePlaceToDefine(b, slots, grupos, H('09:00'), scheduleRole(q));
      b.add(slots[si], grupos, scheduleRole(q));
      return hh(slots[si]);
    });
    expect(horarios).toEqual(['10:00', '10:00', '10:00', '10:00']);
  });

  it('a semi (outra fase) espera o descanso de quem pode vir das quartas', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('10:00'), ['A', 'B'], scheduleRole(q));
    const semi = { ...q, round: 2 };
    const slots = ['10:30', '11:00'].map(H);
    expect(hh(slots[schedulePlaceToDefine(b, slots, ['A', 'B'], H('10:00'), scheduleRole(semi))])).toBe('11:00');
  });

  it('jogos de grupo definidos da mesma chave continuam se bloqueando', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    const g = { drawName: 'SM Principal', phase: 'group', round: 1, status: 'Pendente' };
    b.add(H('08:00'), ['A', 'B'], scheduleRole(g));
    expect(b.free(H('08:00'), ['A', 'C'], scheduleRole({ ...g, round: 2 }))).toBe(false);
  });
});

describe('schedulePlaceDefined', () => {
  const slots = ['08:00', '08:30', '09:00', '09:30', '10:00'].map(H);

  it('primeiro horario com quadra livre e atletas descansados depois do ultimo jogo', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 1 });
    b.add(H('08:00'), ['A', 'B']);
    expect(hh(slots[schedulePlaceDefined(b, slots, ['A', 'C'])])).toBe('09:00');
    expect(hh(slots[schedulePlaceDefined(b, slots, ['C', 'D'])])).toBe('08:30');
  });

  it('sem horario que sirva: -1 (nunca o mesmo atleta em 2 jogos ou sem descanso)', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('08:00'), ['A']);
    expect(schedulePlaceDefined(b, ['08:00', '08:30'].map(H), ['A', 'B'])).toBe(-1);
  });

  it('nao cabe depois do ultimo jogo: usa um buraco antes, com descanso', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('09:30'), ['A']);
    expect(hh(slots[schedulePlaceDefined(b, slots, ['A'])])).toBe('08:00');
  });

  it('respeita o horario segurado por jogo "A definir"', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('08:00'), ['Isabela'], { possivel: true, tag: 'SF Sub 15|5' });
    expect(hh(slots[schedulePlaceDefined(b, slots, ['Isabela', 'Joana'])])).toBe('09:00');
  });
});

describe('schedulePlaceToDefine', () => {
  const slots = ['08:00', '08:30', '09:00', '09:30', '10:00'].map(H);

  it('depois da fase anterior e com descanso pra quem vem dela', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('08:00'), ['A', 'B']); b.add(H('08:00'), ['C', 'D']);
    expect(hh(slots[schedulePlaceToDefine(b, slots, ['A', 'B', 'C', 'D'], H('08:00'))])).toBe('09:00');
  });

  it('desvia do horario em que um atleta possivel joga outra categoria', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('08:00'), ['A', 'B']);
    b.add(H('09:00'), ['B', 'X']); // B na outra categoria
    expect(hh(slots[schedulePlaceToDefine(b, slots, ['A', 'B'], H('08:00'))])).toBe('10:00');
  });

  it('espera a fase anterior ACABAR mesmo fora da grade (agenda antiga)', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    b.add(H('08:50'), []);
    expect(hh(slots[schedulePlaceToDefine(b, slots, [], H('08:50'))])).toBe('09:30');
  });

  it('sem horario depois da fase anterior: -1', () => {
    const b = scheduleBook({ dur: 30, rest: 20, courts: 4 });
    expect(schedulePlaceToDefine(b, slots, ['A'], H('10:00'))).toBe(-1);
  });
});

describe('schedulePossibleAthletes', () => {
  const elim = {
    type: 'Eliminatoria',
    matches: [
      { round: 1, player1: 'A', player2: 'B' },
      { round: 1, player1: 'C', player2: 'D' },
      { round: 1, player1: 'E', player2: 'BYE', winner: 1, isBye: true, advancer: 'E' },
      { round: 1, player1: 'F', player2: 'G' },
      { round: 2, player1: '', player2: '' },
      { round: 2, player1: 'E', player2: '' },
      { round: 3, player1: '', player2: '' },
    ],
  };
  const sorted = list => [...list].sort();

  it('vaga vazia: os 2 jogos que alimentam; atleta que passou direto conta', () => {
    expect(sorted(schedulePossibleAthletes({ drawMatchIdx: 4, round: 2, player1: '', player2: '' }, elim))).toEqual(['A', 'B', 'C', 'D']);
    expect(sorted(schedulePossibleAthletes({ drawMatchIdx: 5, round: 2, player1: 'E', player2: '' }, elim))).toEqual(['E', 'F', 'G']);
  });

  it('final: todos que podem chegar; jogo decidido so manda o vencedor', () => {
    expect(schedulePossibleAthletes({ drawMatchIdx: 6, round: 3 }, elim).length).toBe(7);
    const decided = { ...elim, matches: elim.matches.map((m, i) => (i === 0 ? { ...m, winner: 2 } : m)) };
    expect(sorted(schedulePossibleAthletes({ drawMatchIdx: 4, round: 2 }, decided))).toEqual(['B', 'C', 'D']);
  });

  it('Grupos + Eliminatoria: mata-mata vem dos atletas dos grupos', () => {
    const d = {
      type: 'Grupos + Eliminatoria',
      groupsData: {
        groups: [
          { matches: [{ player1: 'P1', player2: 'P2' }, { player1: 'P1', player2: 'P3' }, { player1: 'P2', player2: 'P3' }] },
          { matches: [{ player1: 'Q1 / Q2', player2: 'Q3 / Q4' }] },
        ],
        eliminationMatches: [
          { round: 1, slotIdx: 0, player1: '', player2: '' },
          { round: 1, slotIdx: 1, player1: 'P1', player2: '' },
          { round: 2, player1: '', player2: '' },
        ],
      },
    };
    const all = ['P1', 'P2', 'P3', 'Q1', 'Q2', 'Q3', 'Q4'];
    expect(sorted(schedulePossibleAthletes({ drawMatchIdx: 4, phase: 'elimination', round: 1 }, d))).toEqual(all);
    expect(sorted(schedulePossibleAthletes({ drawMatchIdx: 6, phase: 'elimination', round: 2 }, d))).toEqual(all);
    expect(schedulePossibleAthletes({ drawMatchIdx: 0, phase: 'group', player1: 'P1', player2: 'P2' }, d)).toEqual(['P1', 'P2']);
    const semChave = { ...d, groupsData: { ...d.groupsData, eliminationMatches: [] } };
    expect(sorted(schedulePossibleAthletes({ drawMatchIdx: 4, phase: 'elimination', round: 1 }, semChave))).toEqual(all);
  });

  it('Todos contra Todos e jogo sem chave: so os definidos', () => {
    expect(schedulePossibleAthletes({ drawMatchIdx: 0, player1: 'A', player2: 'B' }, { type: 'Todos contra Todos' })).toEqual(['A', 'B']);
    expect(schedulePossibleAthletes({ player1: 'A', player2: '' }, null)).toEqual(['A']);
  });
});
