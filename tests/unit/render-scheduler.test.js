import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

// Ambiente de mentira: 1 campo de texto (o que o usuário digita), frames do rAF na mão e o blur.
function ambiente() {
  const frames = [];
  const campo = {
    tagName: 'INPUT', type: 'text', readOnly: false, disabled: false, ouvintes: {},
    addEventListener(ev, fn) { this.ouvintes[ev] = fn; },
    removeEventListener(ev) { delete this.ouvintes[ev]; }
  };
  const document = { activeElement: null };
  const window = { __fabdStats: { rendersDeferred: 0, rendersFlushed: 0 } };
  const m = loadModule('src/js/modules/render-scheduler.js', {
    document, window, requestAnimationFrame: fn => { frames.push(fn); return frames.length; }
  });
  return {
    m, window,
    digitando() { document.activeElement = campo; },
    frame() { frames.splice(0).forEach(f => f()); },
    blur() { document.activeElement = null; if (campo.ouvintes.blur) campo.ouvintes.blur(); }
  };
}

describe('scheduleRender (desenho das telas sem atrapalhar quem digita)', () => {
  it('sem campo em foco: junta os pedidos do mesmo frame e desenha 1 vez', () => {
    const a = ambiente(); let n = 0;
    a.m.scheduleRender('chaves', () => n++);
    a.m.scheduleRender('chaves', () => n++);
    expect(n).toBe(0);
    a.frame();
    expect(n).toBe(1);
  });

  it('com campo em foco: o desenho comum espera o campo perder o foco', () => {
    const a = ambiente(); let n = 0;
    a.digitando();
    a.m.scheduleRender('partidas', () => n++);
    a.frame();
    expect(n).toBe(0);
    a.blur(); a.frame();
    expect(n).toBe(1);
  });

  it('busca das Chaves: o filtro desenha enquanto digita (deferWhenTyping: false)', () => {
    const a = ambiente(); let n = 0;
    a.digitando();
    a.m.scheduleRender('draws', () => n++, { deferWhenTyping: false });
    a.frame();
    expect(n).toBe(1);
  });

  it('com campo em foco: o filtro desenha agora e o desenho comum continua esperando o blur', () => {
    const a = ambiente(); const feitos = [];
    a.digitando();
    a.m.scheduleRender('partidas', () => feitos.push('partidas'));
    a.m.scheduleRender('draws', () => feitos.push('draws'), { deferWhenTyping: false });
    a.frame();
    expect(feitos).toEqual(['draws']);
    a.blur(); a.frame();
    expect(feitos).toEqual(['draws', 'partidas']);
  });

  it('mesmo nome: um pedido que não espera ganha do que espera', () => {
    const a = ambiente(); let n = 0;
    a.digitando();
    a.m.scheduleRender('draws', () => n++, { deferWhenTyping: false });
    a.m.scheduleRender('draws', () => n++);
    a.frame();
    expect(n).toBe(1);
  });
});
