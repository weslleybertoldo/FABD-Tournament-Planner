import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { icon, hydrateIcons, ICONS } = loadModule('src/js/modules/icons.js');

// <i data-icon="..."> de mentira: só o que o hydrateIcons usa
const el = (name, extra = {}) => ({
  attrs: { 'data-icon': name, ...extra }, innerHTML: '', firstElementChild: null,
  getAttribute(k) { return this.attrs[k] ?? null; }
});
const raiz = itens => ({ querySelectorAll: sel => (sel === '[data-icon]' ? itens : []) });

describe('icon (ícones desenhados no app, sem CDN)', () => {
  it('devolve o <svg> com o desenho e a classe padrão', () => {
    const s = icon('trophy');
    expect(s.startsWith('<svg class="i" viewBox="0 0 24 24"')).toBe(true);
    expect(s).toContain(ICONS.trophy);
    expect(s).toContain('aria-hidden="true"');
  });
  it('classe própria', () => {
    expect(icon('users', 'i big')).toContain('class="i big"');
  });
  it('nome que não existe = vazio (nada quebra)', () => {
    expect(icon('nao-existe')).toBe('');
  });
  it('todos os ícones da casca existem (menu do topo, faixa e abas)', () => {
    ['layout-dashboard', 'trophy', 'users', 'chart-column', 'settings', 'lock-keyhole', 'clipboard-list', 'chave',
      'calendar-days', 'peteca', 'calendar', 'map-pin', 'funnel'].forEach(n => expect(ICONS[n], n).toBeTruthy());
  });
});

describe('hydrateIcons', () => {
  it('troca cada <i data-icon> pelo desenho e conta quantos', () => {
    const a = el('trophy'), b = el('users', { 'data-icon-class': 'i sm' });
    expect(hydrateIcons(raiz([a, b]))).toBe(2);
    expect(a.innerHTML).toBe(icon('trophy'));
    expect(b.innerHTML).toContain('class="i sm"');
  });
  it('não desenha de novo o que já tem <svg> e ignora nome desconhecido', () => {
    const pronto = el('trophy'); pronto.firstElementChild = { tagName: 'SVG' }; pronto.innerHTML = 'X';
    const errado = el('nao-existe');
    expect(hydrateIcons(raiz([pronto, errado]))).toBe(0);
    expect(pronto.innerHTML).toBe('X');
    expect(errado.innerHTML).toBe('');
  });
});
