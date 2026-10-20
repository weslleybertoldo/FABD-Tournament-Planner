// =====================================================================
// Render coalescing (saiu do app.js em 20/10/2026 pra ter teste: tests/unit/render-scheduler.test.js)
// =====================================================================

// ═══════════════════════════════════════════════════════════════════════════
// RENDER COALESCING (v3.95 — fix "aba pisca" e "input trava ao digitar")
// ═══════════════════════════════════════════════════════════════════════════
//
// Problema: cada update do Realtime / polling disparava renderMatches +
// renderCourtsPanel imediatamente. tb.innerHTML = h descarta o input que o
// usuario esta digitando, perde foco, "aba pisca". Em jogo ativo, arbitro
// marca 1 ponto = 1 evento Realtime = 1 re-render = 1 piscada.
//
// Solucao: cada render passa por scheduleRender(name, fn) que:
//   1. Coalesce — se varios scheduleRender chegam no mesmo frame, executa 1
//   2. Defer-when-typing — se ha input/textarea/select em foco, ADIA o render
//      ate o blur (instala listener once). Render nao destroi o input ativo.
// ═══════════════════════════════════════════════════════════════════════════

const _pendingRenders = new Map(); // name -> { fn, defer } (defer = espera o campo em foco perder o foco)
let _renderRafId = null;
let _renderBlurListener = null;

function _isUserTyping() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
  if (a.type === 'checkbox' || a.type === 'radio' || a.type === 'button' || a.type === 'submit') return false;
  if (a.readOnly || a.disabled) return false;
  return true;
}

function _flushPendingRenders() {
  _renderRafId = null;
  // Com input em foco, roda agora so quem pediu deferWhenTyping:false (o filtro que
  // o proprio input alimenta, ex. search-draws); o resto continua esperando o blur.
  const typing = _isUserTyping();
  const due = [..._pendingRenders].filter(([, r]) => !typing || !r.defer);
  due.forEach(([name]) => _pendingRenders.delete(name));
  if (_pendingRenders.size) _attachBlurFlush();
  for (const [, r] of due) { try { r.fn(); window.__fabdStats.rendersFlushed++; } catch (e) { console.warn('render error:', e); } }
}

function _attachBlurFlush() {
  if (_renderBlurListener) return; // ja instalado
  const active = document.activeElement;
  if (!active) { _renderRafId = requestAnimationFrame(_flushPendingRenders); return; }
  _renderBlurListener = () => {
    active.removeEventListener('blur', _renderBlurListener);
    _renderBlurListener = null;
    if (_renderRafId == null) _renderRafId = requestAnimationFrame(_flushPendingRenders);
  };
  active.addEventListener('blur', _renderBlurListener, { once: true });
}

// opts.deferWhenTyping (default true): se há input em foco, espera o blur.
// Para filtros onde o próprio input em foco é a FONTE do render (ex: search-draws),
// passar { deferWhenTyping: false } — coalesce via rAF mas roda imediatamente.
function scheduleRender(name, fn, opts) {
  const prev = _pendingRenders.get(name);
  const defer = (!opts || opts.deferWhenTyping !== false) && (!prev || prev.defer);
  _pendingRenders.set(name, { fn, defer });
  if (defer && _isUserTyping()) { window.__fabdStats.rendersDeferred++; _attachBlurFlush(); return; }
  if (_renderRafId == null) _renderRafId = requestAnimationFrame(_flushPendingRenders);
}
