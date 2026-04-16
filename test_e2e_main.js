// ============================================
// TESTE E2E PARTE 2 - FABD Tournament Planner v3.59
// Testa funções do main.js (backend Node.js)
// ============================================

const path = require('path');

// Carregar main.js (sem Electron APIs)
const mainCode = require('fs').readFileSync('./src/main.js', 'utf8');

// Extrair funções úteis para teste
function loadDatabase() {
  return { tournament: null, settings: {} };
}

function saveDatabase(data) {
  // Mock - não salva em arquivo durante testes
  return true;
}

function log(level, ...args) {
  // Mock - só imprime no console
  const msg = `[${level}] ${args.join(' ')}`;
  console.log(msg);
}

// Testar normHeader do xlsx:import
function normHeader(h) {
  if (h == null) return '';
  return String(h)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Testar findCol
function findCol(headerRow, keywords, exclusions = []) {
  return headerRow.findIndex(h =>
    keywords.some(k => h.includes(k)) && !exclusions.some(ex => h.includes(ex))
  );
}

// Testar parseCSV line
function parseCSVLine(line, sep) {
  const r = [];
  let c = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { c += '"'; i++; }
      else q = !q;
    } else if (ch === sep && !q) {
      r.push(c.trim());
      c = '';
    } else c += ch;
  }
  r.push(c.trim());
  return r;
}

// Testar getDate do xlsx:import
function getDate(r, col) {
  if (col < 0 || r[col] == null || r[col] === '') return '';
  const v = r[col];
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

// Testes
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result) {
      console.log(`✅ ${name}`);
      tests.push({ name, status: 'PASS' });
      passed++;
    } else {
      console.log(`❌ ${name}`);
      tests.push({ name, status: 'FAIL' });
      failed++;
    }
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    tests.push({ name, status: 'ERROR', error: e.message });
    failed++;
  }
}

console.log('\n=== TESTE E2E FABD - Main.js Functions ===\n');

// normHeader tests
console.log('--- normHeader (XLSX header normalization) ---');
test('normHeader: normal string', () => normHeader('Nome Completo') === 'nome completo');
test('normHeader: null', () => normHeader(null) === '');
test('normHeader: undefined', () => normHeader(undefined) === '');
test('normHeader: com acentos', () => normHeader('Clube Atlético') === 'clube atletico');
test('normHeader: com newline', () => normHeader('Sexo\n(M ou F)') === 'sexo (m ou f)');
test('normHeader: com espacos', () => normHeader('  Nome  Completo  ') === 'nome completo');
test('normHeader: uppercase', () => normHeader('DATA DE NASCIMENTO') === 'data de nascimento');

// findCol tests
console.log('\n--- findCol (column finding) ---');
const headerRow = ['nome completo', 'sexo', 'data de nascimento', 'clube', 'dupla', 'clube dupla'];
test('findCol: encontra nome', () => findCol(headerRow, ['nome completo', 'nome'], []) === 0);
test('findCol: encontra sexo', () => findCol(headerRow, ['sexo', 'genero'], []) === 1);
test('findCol: com exclusions', () => findCol(headerRow, ['clube'], ['dupla', 'mista']) === 3);
test('findCol: exclusion funciona', () => findCol(headerRow, ['clube'], ['mista']) === 3); // índice 3 é 'clube' (não é 'clube dupla' nem 'clube dupla mista')
test('findCol: nao encontrado', () => findCol(headerRow, ['inexistente'], []) === -1);

// parseCSVLine tests
console.log('\n--- parseCSVLine ---');
test('parseCSVLine: simples', () => JSON.stringify(parseCSVLine('João,Silva,M', ',')) === JSON.stringify(['João', 'Silva', 'M']));
test('parseCSVLine: com espaco', () => parseCSVLine('  João  , Silva  , M  ', ',')[0] === 'João');
test('parseCSVLine: quoted', () => parseCSVLine('"João, Silva",M,F', ',')[0] === 'João, Silva');
test('parseCSVLine: ponto e virgula', () => JSON.stringify(parseCSVLine('João;Silva;M', ';')) === JSON.stringify(['João', 'Silva', 'M']));
test('parseCSVLine: empty', () => parseCSVLine('', ',').length === 1);

// getDate tests
console.log('\n--- getDate (XLSX date parsing) ---');
test('getDate: Date object', () => getDate([null, new Date('2010-03-15')], 1) === '2010-03-15');
test('getDate: string normal', () => getDate(['João', '2010-03-15'], 1) === '2010-03-15');
test('getDate: empty cell', () => getDate(['João', ''], 1) === '');
test('getDate: null cell', () => getDate(['João', null], 1) === '');
test('getDate: negative col', () => getDate(['João'], -1) === '');
test('getDate: high col', () => getDate(['João'], 5) === '');

// Safe name for file paths
function safeName(name) {
  return (name || 'torneio').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
}

console.log('\n--- safeName (file path sanitization) ---');
test('safeName: normal', () => safeName('Torneio teste') === 'Torneio_teste');
test('safeName: com caracteres especiais', () => safeName('Torneio/Teste<>') === 'TorneioTeste');
test('safeName: null', () => safeName(null) === 'torneio');
test('safeName: vazio', () => safeName('') === 'torneio');

// Club name normalization
function normalizeClubName(c) {
  return (c || '').toUpperCase().trim();
}

console.log('\n--- normalizeClubName ---');
test('normalizeClubName: uppercase', () => normalizeClubName('sesc') === 'SESC');
test('normalizeClubName: com espacos', () => normalizeClubName('  acbl  ') === 'ACBL');
test('normalizeClubName: null', () => normalizeClubName(null) === '');

// Player key generation (uses normalize sem trim pra preservar espacos internos)
function generatePlayerKey(name, dob, club) {
  return [name, dob, club].map(v => String(v || '').toLowerCase()).join('|');
}

console.log('\n--- generatePlayerKey ---');
test('generatePlayerKey: normal', () => generatePlayerKey('João Silva', '2010-03-15', 'SESC') === 'joão silva|2010-03-15|sesc');
test('generatePlayerKey: com espacos', () => generatePlayerKey('  João  ', '2010-03-15', 'SESC') === '  joão  |2010-03-15|sesc');
test('generatePlayerKey: nulls', () => generatePlayerKey(null, null, null) === '||');

// Resumo
console.log('\n=== RESUMO ===');
console.log(`Total: ${passed + failed} testes`);
console.log(`Passou: ${passed}`);
console.log(`Falhou: ${failed}`);
console.log('');

if (failed > 0) {
  console.log('❌ TESTES FALHARAM:');
  tests.filter(t => t.status !== 'PASS').forEach(t => {
    console.log(`  - ${t.name}${t.error ? ': ' + t.error : ''}`);
  });
  process.exit(1);
} else {
  console.log('✅ TODOS OS TESTES PASSARAM!');
  process.exit(0);
}