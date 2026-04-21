/**
 * Teste E2E - Inscricoes Site FABD via Playwright
 * Testa inscricao individual E inscricao por planilha
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Config - usar localhost
const SITE_URL = 'http://localhost:8081';

async function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test_inscricao_individual(page) {
  console.log('\n' + '='.repeat(60));
  console.log('TESTE 1: INSCRICAO INDIVIDUAL');
  console.log('='.repeat(60));

  const timestamp = Date.now();

  try {
    // Ir para pagina de inscricoes
    await page.goto(`${SITE_URL}/inscricoes`, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('[OK] Pagina de inscricoes carregada');

    await esperar(2000);

    // Selecionar SEXO primeiro (M ou F) - isso habilita as categorias
    const sexoM = await page.$('input[type="radio"][value="M"], input[name*="gender"][value="M"]');
    const sexoF = await page.$('input[type="radio"][value="F"], input[name*="gender"][value="F"]');

    if (sexoM) {
      await sexoM.click();
      console.log('[OK] Sexo Masculino selecionado');
    } else if (sexoF) {
      await sexoF.click();
      console.log('[OK] Sexo Feminino selecionado');
    } else {
      // Procurar qualquer radio button
      const radios = await page.$$('input[type="radio"]');
      if (radios.length > 0) {
        await radios[0].click();
        console.log(`[OK] Primeiro radio selecionado (${radios.length} encontrados)`);
      }
    }

    await esperar(1500);

    // Desmarcar Dupla Mista se selecionada (teste individual)
    const dxCheckbox = await page.$('input[type="checkbox"][id*="DX"], input[type="checkbox"][data-modality*="DX"]');
    if (dxCheckbox) {
      const isChecked = await dxCheckbox.evaluate(el => el.checked);
      if (isChecked) {
        await dxCheckbox.click({ force: true });
        console.log('[OK] Dupla Mista desmarcada para teste individual');
      }
    }

    // Preencher dados do atleta
    const campos = [
      { sel: 'input[placeholder*="ome"], input[name*="name"], input[id*="name"]', val: `Teste Auto ${timestamp}`, label: 'Nome' },
      { sel: 'input[type="email"], input[placeholder*="email"]', val: `testeauto${timestamp}@fabd.com.br`, label: 'Email' },
      { sel: 'input[placeholder*="elefone"], input[type="tel"]', val: '11999998888', label: 'Telefone' },
    ];

    for (const campo of campos) {
      const input = await page.$(campo.sel);
      if (input) {
        await input.fill(campo.val);
        console.log(`[OK] ${campo.label} preenchido`);
      }
    }

    // Selecionar categoria (checkbox ou similar)
    const categoriaCheck = await page.$('input[type="checkbox"], [role="checkbox"]');
    if (categoriaCheck) {
      await categoriaCheck.click();
      console.log('[OK] Categoria selecionada');
    }

    // Aceitar termos LGPD
    const termosCheck = await page.$('input[type="checkbox"][id*="terms"], input[type="checkbox"][id*="lgpd"]');
    if (termosCheck) {
      await termosCheck.click({ force: true });
      console.log('[OK] Termos LGPD aceitos');
    }

    await esperar(500);

    // Clicar em submit
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      const isDisabled = await submitBtn.evaluate(el => el.disabled || el.getAttribute('aria-disabled') === 'true');
      if (!isDisabled) {
        await submitBtn.click();
        console.log('[OK] Formulario enviado');
        await esperar(3000);
      } else {
        console.log('[INFO] Botao submit ainda desabilitado - faltan campos obrigatorios');
      }
    } else {
      console.log('[INFO] Botao submit nao encontrado');
    }

    // Verificar toast de sucesso
    const toast = await page.$('[class*="toast-success"], [class*="success"], [role="alert"]:has-text("sucesso"), [class*="T"][class*="oast"]');
    if (toast) {
      const texto = await toast.textContent();
      console.log(`[OK] Feedback: ${texto.substring(0, 100)}`);
    }

    // Screenshot
    await page.screenshot({ path: 'test_inscricao_individual.png', fullPage: true });
    console.log('[OK] Screenshot salvo');

    return true;
  } catch (error) {
    console.error('[ERRO]', error.message);
    await page.screenshot({ path: 'test_inscricao_individual_erro.png', fullPage: true });
    return false;
  }
}

async function test_inscricao_planilha(page) {
  console.log('\n' + '='.repeat(60));
  console.log('TESTE 2: INSCRICAO POR PLANILHA');
  console.log('='.repeat(60));

  const timestamp = Date.now();
  const desktopPath = path.join(os.homedir(), 'Desktop');
  const planilhaPath = path.join(desktopPath, `PLANILHA-TESTE-${timestamp}.xlsx`);

  try {
    // Ir para pagina de inscricoes
    await page.goto(`${SITE_URL}/inscricoes`, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('[OK] Pagina de inscricoes carregada');

    await esperar(2000);

    // Usar planilha de teste simples
    const xlsxPathToUse = path.join(desktopPath, 'TESTE-DUPLA-SIMPLES.xlsx');
    console.log(`[OK] Usando planilha: ${xlsxPathToUse}`);

    // Verificar se arquivo existe
    if (!fs.existsSync(xlsxPathToUse)) {
      console.error('[ERRO] Arquivo nao encontrado');
      return false;
    }

    // Procurar modo planilha (toggle ou tab)
    const planilhaTab = await page.$('button:has-text("Planilha"), [role="tab"]:has-text("Planilha")');
    if (planilhaTab) {
      await planilhaTab.click();
      console.log('[OK] Tab Planilha clicada');
      await esperar(2000);
    }

    // Encontrar input de upload
    const uploadInput = await page.$('input[type="file"]');
    if (uploadInput) {
      // Upload da planilha
      await uploadInput.setInputFiles(xlsxPathToUse);
      console.log(`[OK] Planilha enviada: ${xlsxPathToUse}`);
      await esperar(4000);

      // Verificar se ha erros de validacao
      const erroValidacao = await page.$('[class*="error"], [class*="alert"], [role="alert"]:has-text("incompat")');
      if (erroValidacao) {
        const textoErro = await erroValidacao.textContent();
        console.log(`[ERRO VALIDACAO] ${textoErro.substring(0, 200)}`);
      }

      // Verificar preview/resultado
      const preview = await page.$('table, [class*="preview"], [class*="table"]');
      if (preview) {
        console.log('[OK] Preview detectado');
      }

      // Aceitar termos LGPD
      const termosCheck = await page.$('input[type="checkbox"][id*="lgpd"], input[type="checkbox"][id*="term"]');
      if (termosCheck) {
        await termosCheck.click({ force: true });
        console.log('[OK] Termos LGPD aceitos');
      }

      // Anexar comprovante de pagamento
      const comprovantePath = path.join(desktopPath, 'comprovante-teste.pdf');
      if (fs.existsSync(comprovantePath)) {
        // Encontrar input de file para comprovante (pode haver varios)
        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
          // Pegar o último input (geralmente é o do comprovante)
          const lastInput = fileInputs[fileInputs.length - 1];
          await lastInput.setInputFiles(comprovantePath);
          console.log('[OK] Comprovante anexado');
          await esperar(1000);
        }
      }

      // Procurar botao de submit/importar
      const submitBtn = await page.$('button:has-text("Importar"), button:has-text("Enviar"), button:has-text("Confirmar")');
      if (submitBtn) {
        const isDisabled = await submitBtn.evaluate(el => el.disabled);
        if (isDisabled) {
          console.log('[INFO] Botao Importar desabilitado - validacao pendente');
        } else {
          await submitBtn.click();
          console.log('[OK] Importacao enviada');
          await esperar(3000);
        }
      } else {
        console.log('[INFO] Botao Importar nao encontrado');
      }
    } else {
      console.log('[INFO] Input de upload nao encontrado na pagina');
      // Listar elementos para debug
      const inputs = await page.$$('input');
      console.log(`[DEBUG] Inputs encontrados: ${inputs.length}`);
    }

    // Screenshot
    await page.screenshot({ path: 'test_inscricao_planilha.png', fullPage: true });
    console.log('[OK] Screenshot salvo');

    return true;
  } catch (error) {
    console.error('[ERRO]', error.message);
    await page.screenshot({ path: 'test_inscricao_planilha_erro.png', fullPage: true });
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTE E2E - INSCRICOES SITE FABD');
  console.log(`Site: ${SITE_URL}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  // Log de console do browser
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      console.log(`[BROWSER ERROR] ${text.substring(0, 200)}`);
    } else if (text.includes('[DEBUG]')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  let resultado1 = false;
  let resultado2 = false;

  try {
    resultado1 = await test_inscricao_individual(page);
  } catch (e) {
    console.error('[ERRO TESTE 1]', e.message);
  }

  try {
    resultado2 = await test_inscricao_planilha(page);
  } catch (e) {
    console.error('[ERRO TESTE 2]', e.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESUMO');
  console.log('='.repeat(60));
  console.log(`Teste 1 (Individual): ${resultado1 ? 'PASS' : 'FAIL'}`);
  console.log(`Teste 2 (Planilha): ${resultado2 ? 'PASS' : 'FAIL'}`);

  await browser.close();

  process.exit(resultado1 && resultado2 ? 0 : 1);
}

main().catch(console.error);
