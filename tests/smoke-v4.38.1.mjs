import { _electron as electron } from 'playwright';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');

const consoleErrors = [];
const pageErrors = [];

const app = await electron.launch({
  args: [root],
  cwd: root,
  timeout: 30000,
});

const win = await app.firstWindow();
win.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
win.on('pageerror', (err) => pageErrors.push(String(err)));

await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(1500);

const results = {};

// 1. Versão APP_VERSION
results.appVersion = await win.evaluate(() => (typeof APP_VERSION !== 'undefined' ? APP_VERSION : null));

// 2. Versão visível no footer
results.footerText = await win.evaluate(() => {
  const el = document.querySelector('#app-version-footer, [id*="version"]');
  return el ? el.textContent.trim() : null;
});

// 3. Texto novo de Rankings (#3)
//    Abrir Configurações → Ranking
results.rankingTabFound = await win.evaluate(() => {
  const btn = [...document.querySelectorAll('button, a, [onclick]')].find(
    (e) => /ranking/i.test(e.textContent) && /settings|config/i.test(e.outerHTML)
  );
  if (btn) { btn.click(); return true; }
  return false;
});
await win.waitForTimeout(400);
results.rankingNewText = await win.evaluate(() => {
  const c = document.getElementById('settings-rankings-content') || document.body;
  return c.innerHTML.includes('Classificação Geral') && c.innerHTML.includes('Ranking Federados');
});
results.rankingOldTextGone = await win.evaluate(() => {
  const c = document.getElementById('settings-rankings-content') || document.body;
  return !c.innerHTML.includes('Use no relatório "Ranking Geral"');
});

// 4. Empty state da aba Chaves (#1) — simular busca que não acha
results.drawsEmptyStateBusca = await win.evaluate(async () => {
  const tab = [...document.querySelectorAll('[onclick], button, a')].find((e) =>
    /(^|\W)chaves(\W|$)/i.test(e.textContent.trim())
  );
  if (tab) tab.click();
  await new Promise((r) => setTimeout(r, 300));
  const search = document.getElementById('search-draws');
  if (!search) return { ok: false, reason: 'search-draws not found' };
  search.value = '____xyz_nao_existe____';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const detail = document.getElementById('draws-detail');
  return {
    ok: true,
    text: detail ? detail.textContent.trim().slice(0, 200) : null,
    html: detail ? detail.innerHTML.slice(0, 300) : null,
  };
});

// 5. Verifica que existe o handler novo data-club-key (estático no código)
//    Como provavelmente não há torneio aberto, só confirmamos que a função renderTcClubes
//    contém o novo padrão (introspecção via toString).
results.renderTcClubesUsesDataAttr = await win.evaluate(() => {
  if (typeof renderTcClubes !== 'function') return null;
  const src = renderTcClubes.toString();
  return {
    hasDataClubKey: src.includes('data-club-key'),
    hasOldOnclick: src.includes("setClubStatus('"),
    hasAddEventListener: src.includes('addEventListener'),
  };
});

console.log(JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));

await app.close();
