import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { mtLiveScore, mtScoreParts, mtStatusLabel, mtStatusClass, mtStatusCounts, mtNames, mtDur, mtAvg } = loadModule('src/js/modules/matches-ui.js', {
  resultStatusLabel: s => ({ Finalizada: 'Finalizada', WO: 'W.O.', Desistencia: 'Desistência', Desqualificacao: 'Desqualificação', SemJogo: 'Sem jogo' })[s] || s || ''
});

describe('mtLiveScore (placar ao vivo do árbitro nas Partidas)', () => {
  it('"13 - 10 (Set 2)" com o 1º game: placar de agora, games anteriores e o nº do game', () => {
    expect(mtLiveScore({ liveScore: '13 - 10 (Set 2)', liveSets: ['15-10'] }))
      .toEqual({ cur: '13–10', p1: '13', p2: '10', games: ['15–10'], gameNo: 2 });
  });
  it('3º game com 2 games anteriores', () => {
    const r = mtLiveScore({ liveScore: '6 - 4 (Set 3)', liveSets: ['13-15', '15-12'] });
    expect(r.games).toEqual(['13–15', '15–12']);
    expect(r.gameNo).toBe(3);
  });
  it('sem "(Set N)": o game vem da quantidade de games anteriores', () => {
    expect(mtLiveScore({ liveScore: '3 - 1', liveSets: ['21-18'] }).gameNo).toBe(2);
  });
  it('sem placar ao vivo: null', () => {
    expect(mtLiveScore({ liveScore: '' })).toBeNull();
    expect(mtLiveScore({})).toBeNull();
    expect(mtLiveScore(null)).toBeNull();
  });
});

describe('mtScoreParts (placar de games no estilo novo)', () => {
  it('"21-15 / 18-21 / 21-19": 2 × 1 e cada game', () => {
    expect(mtScoreParts('21-15 / 18-21 / 21-19')).toEqual({ sets: '2 × 1', games: ['21–15', '18–21', '21–19'] });
  });
  it('2 games pro lado 2', () => {
    expect(mtScoreParts('9-15 / 10-15').sets).toBe('0 × 2');
  });
  it('fora do formato (W.O., texto) ou vazio: null (fica o texto de sempre)', () => {
    expect(mtScoreParts('W.O.')).toBeNull();
    expect(mtScoreParts('21-15 / RET')).toBeNull();
    expect(mtScoreParts('')).toBeNull();
    expect(mtScoreParts(undefined)).toBeNull();
  });
});

describe('mtStatusLabel e mtStatusClass (etiqueta da situação)', () => {
  it('"Em Quadra" vira "Em quadra"; os outros, o texto de sempre', () => {
    expect(mtStatusLabel('Em Quadra')).toBe('Em quadra');
    expect(mtStatusLabel('Pendente')).toBe('Pendente');
    expect(mtStatusLabel('WO')).toBe('W.O.');
  });
  it('cor por situação', () => {
    expect(mtStatusClass('Pendente')).toBe('is-pend');
    expect(mtStatusClass('Em Quadra')).toBe('is-live');
    expect(mtStatusClass('A definir')).toBe('is-tbd');
    expect(mtStatusClass('Finalizada')).toBe('is-done');
    expect(mtStatusClass('WO')).toBe('is-red');
    expect(mtStatusClass('Desistencia')).toBe('is-warn');
    expect(mtStatusClass('qualquer')).toBe('is-gray');
  });
});

describe('mtStatusCounts (contagem dos botões da situação)', () => {
  const rows = [
    { status: 'Pendente', day: '2026-10-17' }, { status: 'Pendente', day: '2026-10-18' },
    { status: 'Em Quadra', day: '2026-10-17' }, { status: 'A definir', day: '2026-10-18' }, { status: 'A definir', day: '' }
  ];
  it('todos os dias: cada situação e o total em Todas', () => {
    expect(mtStatusCounts(rows, '')).toEqual({ '': 5, Pendente: 2, 'Em Quadra': 1, Finalizada: 0, 'A definir': 2 });
  });
  it('um dia: só as linhas dele', () => {
    expect(mtStatusCounts(rows, '2026-10-18')).toEqual({ '': 2, Pendente: 1, 'Em Quadra': 0, Finalizada: 0, 'A definir': 1 });
  });
  it('lista vazia: tudo zero', () => {
    expect(mtStatusCounts([], '')).toEqual({ '': 0, Pendente: 0, 'Em Quadra': 0, Finalizada: 0, 'A definir': 0 });
  });
});

describe('mtNames, mtDur e mtAvg', () => {
  it('dupla vira 2 nomes; simples, 1', () => {
    expect(mtNames('José Santos / Ronald Araujo')).toEqual(['José Santos', 'Ronald Araujo']);
    expect(mtNames('Kelvin Santos')).toEqual(['Kelvin Santos']);
    expect(mtNames('')).toEqual([]);
  });
  it('restante: "~1h46" e "45 min"', () => {
    expect(mtDur(106)).toBe('1h46');
    expect(mtDur(60)).toBe('1h00');
    expect(mtDur(45)).toBe('45 min');
  });
  it('tempo médio: "26 min" e "26 min 05 s"', () => {
    expect(mtAvg(1560)).toBe('26 min');
    expect(mtAvg(1565)).toBe('26 min 05 s');
  });
});
