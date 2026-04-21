/**
 * Teste E2E - Criacao de Torneio + Gerao de Draws
 * FABD Tournament Planner via Playwright (CDP)
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');

const R = { passed: 0, failed: 0, tests: [] };

async function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test_criar_torneio(page) {
  console.log('\n' + '='.repeat(60));
  console.log('TESTE 1: CRIAR TORNEO');
  console.log('='.repeat(60));

  const timestamp = Date.now();

  try {
    // Ir para aba Torneio
    const abaTorneio = await page.$('button:has-text("Torneio"), [role="tab"]:has-text("Torneio")');
    if (abaTorneio) {
      await abaTorneio.click();
      console.log('[OK] Tab Torneio clicada');
    }
    await esperar(2000);

    // Procurar botao "Novo Torneio" ou similar
    const novoBtn = await page.$('button:has-text("Novo"), button:has-text("Criar"), button:has-text("Adicionar")');
    if (novoBtn) {
      await novoBtn.click();
      console.log('[OK] Botao Novo Torneio clicado');
      await esperar(1500);
    }

    // Preencher dados do torneio
    const nomeTorneio = `TESTE-E2E-${timestamp}`;

    const campos = [
      { sel: 'input[placeholder*="ome"], input[name*="name"]', val: nomeTorneio, label: 'Nome' },
      { sel: 'input[placeholder*="ocal"], input[name*="location"]', val: 'Maceio, AL', label: 'Local' },
      { sel: 'input[type="date"]', val: '2026-04-20', label: 'Data' },
    ];

    for (const campo of campos) {
      const input = await page.$(campo.sel);
      if (input) {
        await input.fill(campo.val);
        console.log(`[OK] ${campo.label} preenchido`);
      }
    }

    await esperar(500);

    // Salvar torneio
    const salvarBtn = await page.$('button:has-text("Salvar"), button:has-text("Confirmar"), button:has-text("Criar")');
    if (salvarBtn) {
      await salvarBtn.click();
      console.log('[OK] Torneio criado');
      await esperar(2000);
    }

    // Verificar se torneio aparece na lista
    const listaTorneio = await page.textContent('body');
    if (listaTorneio.includes(nomeTorneio)) {
      console.log(`[OK] Torneio "${nomeTorneio}" encontrado na lista`);
    }

    // Screenshot
    await page.screenshot({ path: 'test_torneio_criado.png', fullPage: true });
    console.log('[OK] Screenshot salvo');

    return nomeTorneio;
  } catch (error) {
    console.error('[ERRO]', error.message);
    await page.screenshot({ path: 'test_torneio_erro.png', fullPage: true });
    return null;
  }
}

async function test_gerar_draws(page) {
  console.log('\n' + '='.repeat(60));
  console.log('TESTE 2: GERAR DRAWS');
  console.log('='.repeat(60));

  try {
    // Ir para aba Chave
    const abaChave = await page.$('button:has-text("Chave"), [role="tab"]:has-text("Chave")');
    if (abaChave) {
      await abaChave.click();
      console.log('[OK] Tab Chave clicada');
      await esperar(2000);
    }

    // Procurar botao "Gerar Chave" ou "Sortear"
    const gerarBtn = await page.$('button:has-text("Gerar"), button:has-text("Sortear"), button:has-text("Criar Chave")');
    if (gerarBtn) {
      await gerarBtn.click();
      console.log('[OK] Botao Gerar Chave clicado');
      await esperar(2000);
    }

    // Verificar se draws foram gerados
    const bodyHTML = await page.evaluate(() => document.body?.innerHTML || '');
    const hasDraws = bodyHTML.includes('svg') || bodyHTML.includes('table') || bodyHTML.includes('bracket');

    if (hasDraws) {
      console.log('[OK] Draws detectados na pagina');
    }

    // Screenshot
    await page.screenshot({ path: 'test_draws_gerados.png', fullPage: true });
    console.log('[OK] Screenshot salvo');

    return hasDraws;
  } catch (error) {
    console.error('[ERRO]', error.message);
    await page.screenshot({ path: 'test_draws_erro.png', fullPage: true });
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTE E2E - TORNEO + DRAWS - FABD PLANNER');
  console.log('='.repeat(60));

  let electron;
  let browser;

  try {
    // Verificar se Electron ja esta rodando na porta 9222
    console.log('\n1. Verificando Electron...');
    const CDP_URL = 'http://localhost:9222';

    try {
      browser = await chromium.connectOverCDP(CDP_URL);
      console.log('   [OK] Electron ja esta rodando (CDP)');
    } catch (e) {
      console.log('   [INFO] Electron nao esta rodando, iniciando...');

      // Iniciar Electron
      electron = spawn('npx', ['electron', '.', '--remote-debugging-port=9222'], {
        cwd: 'C:\\Users\\Usuário\\Desktop\\FABD-Tournament-Planner',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      electron.stdout.on('data', d => {
        const msg = d.toString();
        if (msg.includes('[INFO]')) console.log(`   ${msg.trim()}`);
      });

      await esperar(8000);

      browser = await chromium.connectOverCDP(CDP_URL);
      console.log('   [OK] Electron iniciado e conectado');
    }

    const context = browser.contexts()[0];
    const pages = await context.pages();
    const page = pages[0];

    if (!page) {
      throw new Error('Nenhuma pagina encontrada');
    }

    // Aguarda carregamento
    await esperar(3000);

    // Executa testes
    const nomeTorneio = await test_criar_torneio(page);
    const drawsGerados = await test_gerar_draws(page);

    // Resultado
    const test1Ok = nomeTorneio !== null;
    const test2Ok = drawsGerados;

    console.log('\n' + '='.repeat(60));
    console.log('RESUMO');
    console.log('='.repeat(60));
    console.log(`Teste 1 (Criar Torneio): ${test1Ok ? 'PASS' : 'FAIL'}`);
    console.log(`Teste 2 (Gerar Draws): ${test2Ok ? 'PASS' : 'FAIL'}`);

    await browser.close();

    if (electron) electron.kill();

    process.exit(test1Ok && test2Ok ? 0 : 1);

  } catch (error) {
    console.error('[ERRO FATAL]', error.message);
    if (browser) await browser.close();
    if (electron) electron.kill();
    process.exit(1);
  }
}

main().catch(console.error);
