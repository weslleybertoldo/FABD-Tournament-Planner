/**
 * Teste BWF + Protecao Clube
 * Executar: node test_bracket_bwf.js
 */

const fs = require('fs');
const appJs = fs.readFileSync('./src/js/app.js', 'utf8');

// Extrair todo o bloco de constantes e funcoes
const lines = appJs.split('\n');
const fnStart = lines.findIndex(l => l.includes('// Gerar chave eliminatoria'));
const fnEnd = lines.findIndex((l, i) => i > fnStart && l.match(/^function \w/) && i > fnStart + 5);

const fnBlock = lines.slice(fnStart, fnEnd).join('\n');
eval(fnBlock);

// Copiar BWF_TABLES para global se necessario
if (typeof BWF_TABLES === 'undefined' && typeof bwfTables !== 'undefined') {
  global.BWF_TABLES = bwfTables;
}

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch(e) {
    console.log(`  [FAIL] ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

console.log('\n========================================');
console.log('TESTE: BWF + Protecao Clube');
console.log('========================================\n');

// Teste 1: 11 jogadores, 5 seeds
console.log('--- TESTE 1: 11 jogadores, 5 seeds (cenario original) ---');
const seeds1 = ['1. Gidivan', '2. Joao Gabriel', '3. Leonardo', '4. Nycolas', '5. Jonas'];
const nonSeeds1 = ['6. Luan Davi', '7. Kleber', '8. Milton', '9. Emanuel', '10. Victor', '11. Jose'];
const matches1 = generateEliminationBracket(nonSeeds1, seeds1);

test('Bracket: 15 jogos', () => {
  assert(matches1.length === 15, `Expected 15, got ${matches1.length}`);
});

test('5 byes (seeds 1-5)', () => {
  const r1 = matches1.filter(m => m.round === 1);
  const byes = r1.filter(m => m.isBye && !(m.player1 === 'BYE' && m.player2 === 'BYE'));
  assert(byes.length === 5, `Expected 5 byes, got ${byes.length}`);
});

test('3 jogos efetivos', () => {
  const r1 = matches1.filter(m => m.round === 1);
  const efetivos = r1.filter(m => !m.isBye);
  assert(efetivos.length === 3, `Expected 3, got ${efetivos.length}`);
});

// Teste 2: BWF Tables existem
console.log('\n--- TESTE 2: Tabelas BWF oficiais ---');
test('BWF_TABLES existe', () => {
  assert(typeof BWF_TABLES !== 'undefined', 'BWF_TABLES not defined');
});

test('Tabelas para 3-64 atletas', () => {
  assert(BWF_TABLES[3], 'Missing table for 3');
  assert(BWF_TABLES[16], 'Missing table for 16');
  assert(BWF_TABLES[32], 'Missing table for 32');
  assert(BWF_TABLES[64], 'Missing table for 64');
});

test('Bye slots para 11 atletas', () => {
  const t = BWF_TABLES[11];
  assert(t.bracketSize === 16, 'Expected bracket 16');
  assert(t.byes.includes(2), 'Seed 1 bye');
  assert(t.byes.includes(4), 'Seed 2 bye');
  assert(t.byes.includes(6), 'Seed 3 bye');
  assert(t.byes.includes(11), 'Seed 4 bye');
  assert(t.byes.includes(15), 'Seed 5 bye');
});

// Teste 3: 8 jogadores, 4 seeds
console.log('\n--- TESTE 3: 8 jogadores, 4 seeds ---');
const seeds4 = ['1. Ana', '2. Bia', '3. Clara', '4. Diana'];
const nonSeeds4 = ['5. Eva', '6. Fernanda', '7. Gabi', '8. Helena'];
const matches4 = generateEliminationBracket(nonSeeds4, seeds4);

test('Chave cheia: 7 jogos', () => {
  assert(matches4.length === 7, `Expected 7, got ${matches4.length}`);
});

test('Sem byes', () => {
  const r1 = matches4.filter(m => m.round === 1);
  const byes = r1.filter(m => m.isBye);
  assert(byes.length === 0, `Expected 0 byes, got ${byes.length}`);
});

// Teste 4: Edge case - 64 atletas
console.log('\n--- TESTE 4: 64 atletas (tabela oficial) ---');
const seeds64 = Array.from({length: 32}, (_, i) => `S${i+1}`);
const nonSeeds64 = Array.from({length: 32}, (_, i) => `P${i+1}`);
const matches64 = generateEliminationBracket(nonSeeds64, seeds64);

test('Chave 64: 63 jogos', () => {
  assert(matches64.length === 63, `Expected 63, got ${matches64.length}`);
});

test('Sem byes (chave cheia)', () => {
  const r1 = matches64.filter(m => m.round === 1);
  const byes = r1.filter(m => m.isBye);
  assert(byes.length === 0, `Expected 0 byes, got ${byes.length}`);
});

// Mostrar distribuicao
console.log('\n--- DISTRIBUICAO: 11 jogadores, 5 seeds ---');
const r1 = matches1.filter(m => m.round === 1);
r1.forEach((m, i) => {
  const byeFlag = m.isBye ? (m.player1 === 'BYE' && m.player2 === 'BYE' ? ' (DOUBLE BYE)' : ' (BYE)') : '';
  console.log(`  J${i+1}: ${m.player1} vs ${m.player2}${byeFlag}`);
});

console.log('\n========================================');
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
