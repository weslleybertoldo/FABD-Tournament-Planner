// ============================================
// TESTE E2E - FABD Tournament Planner v3.59
// Testa funções principais do app.js
// ============================================

// Extrair funções do código real
function normalizeName(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizeGender(g) {
  if (!g) return '';
  const v = String(g).toUpperCase().trim();
  if (['M', 'MASCULINO', 'MASC', 'MALE', 'H', 'HOMEM'].includes(v)) return 'M';
  if (['F', 'FEMININO', 'FEM', 'FEMALE', 'MULHER'].includes(v)) return 'F';
  return '';
}

function normalizeDate(d) {
  if (d == null || d === '') return '';
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (typeof d === 'number' && d > 0 && d < 100000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + d * 86400000);
    if (!isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, day = dt.getUTCDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  }
  const s = String(d).trim();
  if (!s) return '';
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // String puramente numerica - tentar parse
  if (/^\d+(\.\d+)?$/.test(s)) {
    const parsed = parseFloat(s);
    if (parsed > 0 && parsed < 100000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + parsed * 86400000);
      if (!isNaN(dt.getTime())) {
        const y = dt.getUTCFullYear(), m2 = dt.getUTCMonth() + 1, day = dt.getUTCDate();
        return `${y}-${String(m2).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return '';
  }
  return '';
}

function esc(s) {
  return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
}

function getCol(c, i) {
  return i >= 0 && i < c.length && c[i] != null ? String(c[i]).replace(/^["']|["']$/g, '').trim() : '';
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

console.log('\n=== TESTE E2E FABD Tournament Planner v3.59 ===\n');

// normalizeName
console.log('--- normalizeName ---');
test('normalizeName: string normal', () => normalizeName('João Silva') === 'joao silva');
test('normalizeName: com espaços (internos preservados)', () => normalizeName('  José   Antonio  ') === 'jose   antonio');
test('normalizeName: null', () => normalizeName(null) === '');
test('normalizeName: empty', () => normalizeName('') === '');
test('normalizeName: uppercase', () => normalizeName('TESTE') === 'teste');

// normalizeGender
console.log('\n--- normalizeGender ---');
test('normalizeGender: M', () => normalizeGender('M') === 'M');
test('normalizeGender: Masculino', () => normalizeGender('Masculino') === 'M');
test('normalizeGender: F', () => normalizeGender('F') === 'F');
test('normalizeGender: Feminino', () => normalizeGender('Feminino') === 'F');
test('normalizeGender: invalido X', () => normalizeGender('X') === '');
test('normalizeGender: invalido numero', () => normalizeGender(1) === '');
test('normalizeGender: null', () => normalizeGender(null) === '');
test('normalizeGender: empty', () => normalizeGender('') === '');

// normalizeDate
console.log('\n--- normalizeDate ---');
test('normalizeDate: ISO YYYY-MM-DD', () => normalizeDate('2010-03-15') === '2010-03-15');
test('normalizeDate: DD/MM/YYYY', () => normalizeDate('15/08/2009') === '2009-08-15');
test('normalizeDate: DD-MM-YYYY', () => normalizeDate('01-01-2010') === '2010-01-01');
test('normalizeDate: DD.MM.YYYY', () => normalizeDate('31.12.2013') === '2013-12-31');
test('normalizeDate: Serial Excel 45985 (2025-11-24)', () => normalizeDate(45985) === '2025-11-24');
test('normalizeDate: Serial Excel 45985 string (2025-11-24)', () => normalizeDate('45985') === '2025-11-24');
test('normalizeDate: Date object', () => normalizeDate(new Date('2010-05-05')) === '2010-05-05');
test('normalizeDate: invalido', () => normalizeDate('nao-eh-data') === '');
test('normalizeDate: null', () => normalizeDate(null) === '');
test('normalizeDate: empty', () => normalizeDate('') === '');
test('normalizeDate: serial fora de faixa', () => normalizeDate(100000) === '');
test('normalizeDate: serial negativo', () => normalizeDate(-1) === '');
test('normalizeDate: futuro distante 80000 (2119-01-11)', () => normalizeDate(80000) === '2119-01-11'); // 2199

// esc (XSS sanitization)
console.log('\n--- esc (XSS) ---');
test('esc: string normal', () => esc('João Silva') === 'João Silva');
test('esc: script tag', () => esc('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
test('esc: img onerror', () => esc('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;');
test('esc: ampersand', () => esc('Test & Test') === 'Test &amp; Test');
test('esc: quotes', () => esc('"test"') === '&quot;test&quot;');
test('esc: null', () => esc(null) === '');
test('esc: undefined', () => esc(undefined) === '');

// getCol
console.log('\n--- getCol ---');
test('getCol: índice válido', () => getCol(['João', 'Silva'], 0) === 'João');
test('getCol: índice alto', () => getCol(['João', 'Silva'], 5) === '');
test('getCol: índice negativo', () => getCol(['João'], -1) === '');
test('getCol: elemento null', () => getCol([null, 'Silva'], 0) === '');
test('getCol: com quotes', () => getCol(['"João"'], 0) === 'João');
test('getCol: array vazio', () => getCol([], 0) === '');
test('getCol: string com aspas', () => getCol(["'test'"], 0) === 'test');

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