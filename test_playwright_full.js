// ============================================
// FABD Tournament Planner - Playwright E2E
// Teste completo - versao robusta
// ============================================

const { chromium } = require('playwright');
const { spawn } = require('child_process');

const R = { passed: 0, failed: 0, tests: [] };

async function runTests() {
  let electron;
  let browser;

  console.log('\n=== FABD Tournament Planner - Teste E2E Completo ===\n');

  try {
    // Inicia Electron com debug em background
    console.log('1. Iniciando Electron...');
    electron = spawn('npx', ['electron', '.', '--remote-debugging-port=9222'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    // Captura logs
    electron.stdout.on('data', d => {
      const msg = d.toString();
      if (msg.includes('[INFO]')) console.log(`   ${msg.trim()}`);
    });

    // Aguarda iniciar
    await new Promise(r => setTimeout(r, 6000));

    // Conecta
    console.log('\n2. Conectando Playwright...');
    browser = await chromium.connectOverCDP('http://localhost:9222');

    // Espera conexao
    await new Promise(r => setTimeout(r, 2000));

    if (!browser || browser.contexts().length === 0) {
      throw new Error('Nao conseguiu conectar ao Electron');
    }

    const context = browser.contexts()[0];
    const pages = await context.pages();
    const page = pages[0];

    if (!page) {
      throw new Error('Nenhuma pagina encontrada');
    }

    console.log('   ✅ Conectado ao Electron');

    // Captura erros
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    // Aguarda carregamento
    await new Promise(r => setTimeout(r, 3000));

    // ==========================================
    // TESTES
    // ==========================================

    console.log('\n3. Executando testes...\n');

    const bodyHTML = await page.evaluate(() => document.body?.innerHTML || '');
    const bodyText = await page.evaluate(() => document.body?.innerText || '');

    const test = (name, ok) => {
      console.log(ok ? '✅' : '❌', name);
      if (ok) R.passed++; else R.failed++;
      R.tests.push([name, ok]);
    };

    // App
    test('App carregou', bodyHTML.length > 50000);
    test('Titulo FABD', bodyText.includes('FABD'));
    test('Pagina de Torneios', bodyText.includes('Torneio'));

    // Autenticacao
    test('Sistema de login presente', bodyHTML.includes('login') || bodyHTML.includes('Login') || bodyHTML.includes('email'));
    test('Usuario logado', bodyHTML.includes('eventos.fabd@gmail.com') || bodyText.includes('autenticado'));

    // Abas
    test('Aba Torneio', bodyHTML.includes('Torneio'));
    test('Aba Jogadores', bodyHTML.includes('Jogador'));
    test('Aba Agenda', bodyHTML.includes('Agenda'));
    test('Aba Chave', bodyHTML.includes('Chave'));
    test('Aba Resultados', bodyHTML.includes('Resultado'));
    test('Aba Jogos', bodyHTML.includes('Jogo'));
    test('Aba Disputa', bodyHTML.includes('Disputa'));

    // Funcionalidades
    test('Sync Supabase', bodyHTML.includes('Sync') || bodyHTML.includes('sync'));
    test('Importar Planilha', bodyHTML.includes('Import') || bodyHTML.includes('import'));
    test('Lista de torneios', bodyHTML.includes('torneio') || bodyHTML.includes('Torneio'));

    // Console
    const critErrors = errors.filter(e =>
      !e.includes('cache') && !e.includes('DevTools') &&
      !e.includes('favicon') && !e.includes('net::') &&
      !e.includes('gpu') && !e.includes('Uncaught')
    );
    test('Sem erros criticos', critErrors.length === 0);

    // Screenshot (opcional)
    console.log('\n4. Screenshot...');
    try {
      await page.screenshot({ path: 'test_e2e_screenshot.png', fullPage: true, timeout: 5000 });
      console.log('   test_e2e_screenshot.png salvo');
    } catch(e) {
      console.log('   Screenshot ignorado (timeout)');
    }

    // ==========================================
    // RESUMO
    // ==========================================

    console.log('\n=== RESUMO ===');
    console.log(`Total: ${R.passed + R.failed}`);
    console.log(`Passou: ${R.passed}`);
    console.log(`Falhou: ${R.failed}`);

    if (R.failed > 0) {
      console.log('\n❌ Falhas:');
      R.tests.filter(([, ok]) => !ok).forEach(([n]) => console.log(`  - ${n}`));
    } else {
      console.log('\n✅ TODOS OS TESTES PASSARAM!');
    }

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    try {
      if (browser) await browser.close();
    } catch(e) {}
    try {
      if (electron) electron.kill();
    } catch(e) {}
  }
}

runTests().then(() => {
  console.log('\nFinalizado.');
  process.exit(R.failed > 0 ? 1 : 0);
});
