import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { drawSituation, drawTypeLabel } = loadModule('src/js/modules/draws-ui.js');

const jogo = (extra = {}) => ({ player1: 'Ana', player2: 'Bia', ...extra });
const chave = (matches, extra = {}) => ({ name: 'SF Sub 13', type: 'Todos contra Todos', matches, ...extra });

describe('drawSituation (etiqueta da chave na lista das Chaves)', () => {
  it('sem sorteio: Pendente', () => {
    expect(drawSituation(chave([]), [])).toEqual({ kind: 'draft', label: 'Pendente' });
  });

  it('sorteada e sem resultado: Sorteada', () => {
    expect(drawSituation(chave([jogo(), jogo()]), [])).toEqual({ kind: 'sched', label: 'Sorteada' });
  });

  it('jogo da chave em quadra: Ao vivo', () => {
    const t = [{ drawName: 'SF Sub 13', status: 'Em Quadra' }];
    expect(drawSituation(chave([jogo(), jogo()]), t)).toEqual({ kind: 'live', label: 'Ao vivo' });
  });

  it('jogo de OUTRA chave em quadra não acende o Ao vivo', () => {
    const t = [{ drawName: 'SM Sub 13', status: 'Em Quadra' }];
    expect(drawSituation(chave([jogo(), jogo()]), t).kind).toBe('sched');
  });

  it('com resultado e nada em quadra: Em andamento', () => {
    expect(drawSituation(chave([jogo({ winner: 1 }), jogo()]), [])).toEqual({ kind: 'run', label: 'Em andamento' });
  });

  it('todos os jogos com vencedor: Finalizada (a mesma regra do filtro "Finalizadas")', () => {
    expect(drawSituation(chave([jogo({ winner: 1 }), jogo({ winner: 2 })]), [])).toEqual({ kind: 'done', label: 'Finalizada' });
  });

  it('BYE não conta pra finalizar', () => {
    const d = chave([jogo({ winner: 1 }), jogo({ player2: 'BYE' }), jogo({ isBye: true })]);
    expect(drawSituation(d, []).kind).toBe('done');
  });

  it('premiada ganha de tudo: Premiada', () => {
    const t = [{ drawName: 'SF Sub 13', status: 'Em Quadra' }];
    expect(drawSituation(chave([jogo()], { awarded: true }), t)).toEqual({ kind: 'awarded', label: 'Premiada' });
  });

  it('sem a lista de jogos do torneio, não quebra', () => {
    expect(drawSituation(chave([jogo()]), undefined).kind).toBe('sched');
  });
});

describe('drawTypeLabel (tipo da chave com acento)', () => {
  it('Eliminatória e Grupos + Eliminatória com acento; o resto como está', () => {
    expect(drawTypeLabel('Eliminatoria')).toBe('Eliminatória');
    expect(drawTypeLabel('Grupos + Eliminatoria')).toBe('Grupos + Eliminatória');
    expect(drawTypeLabel('Todos contra Todos')).toBe('Todos contra Todos');
    expect(drawTypeLabel('')).toBe('-');
  });
});
