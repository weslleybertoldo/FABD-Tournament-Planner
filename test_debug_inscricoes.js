/**
 * Debug: verificar por que a contagem esta em 24 em vez de 26
 */

const XLSX = require('xlsx');

function normalizeName(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function normalizeDate(d) {
  if (d == null || d === '') return '';
  if (typeof d === 'number' && d > 0 && d < 100000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + d * 86400000);
    if (!isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, day = dt.getUTCDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const s = String(d).trim();
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const d2 = parseInt(m[1]), mes = parseInt(m[2]), a = parseInt(m[3]);
    const ano = a < 100 ? (a > 50 ? 1900 + a : 2000 + a) : a;
    if (d2 <= 31 && mes <= 12) return `${ano}-${String(mes).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
  }
  return '';
}

const xlsxPath = 'C:/Users/Usuário/Downloads/inscricoes_1__Etapa_do_Campeonato_Alagoano_de_Badminton (6).xlsx';
const workbook = XLSX.readFile(xlsxPath);
const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

const normalizeHeader = h => String(h || '').replace(/\n/g, ' ').trim();
const headers = Object.keys(rawData[0] || {}).map(normalizeHeader);
const colMap = {
  nome: headers.indexOf('Nome Completo'),
  sexo: headers.indexOf('Sexo (M ou F)'),
  dob: headers.indexOf('Data de Nascimento'),
};

console.log('=== DEBUG: VERIFICAR DOBs E LINHAS PROPRIAS ===\n');

const atletasComLinhaPropria = new Set();
const debugLines = [];

rawData.forEach((row, i) => {
  const vals = Object.values(row);
  const nomeRaw = vals[colMap.nome] || '';
  const dobRaw = vals[colMap.dob] || '';
  const dobNorm = normalizeDate(dobRaw);
  const nomeNorm = normalizeName(nomeRaw);
  const key = nomeNorm + '|' + dobNorm;

  debugLines.push({
    linha: i + 1,
    nomeRaw,
    dobRaw,
    dobNorm,
    key,
    jaExists: atletasComLinhaPropria.has(key)
  });

  if (nomeNorm && dobNorm) {
    atletasComLinhaPropria.add(key);
  }
});

// Mostrar todas as linhas
console.log('Linhas do XLSX:');
debugLines.forEach(l => {
  console.log(`  ${l.linha}. "${l.nomeRaw}" | "${l.dobRaw}" -> "${l.dobNorm}" | key: "${l.key}"`);
});

console.log(`\nTotal atletasComLinhaPropria: ${atletasComLinhaPropria.size}`);
console.log('\nKeys unicas:');
[...atletasComLinhaPropria].sort().forEach(k => console.log(`  "${k}"`));

// Contar por modalidade (o que deve dar 26)
console.log('\n=== CONTAGEM ESPERADA (por linha) ===');
let countSimples = 0, countDupla = 0, countMista = 0;
const cols = { simples: 6, dupla: 7, mista: 11, parceiroMista: 12 };
rawData.forEach((row, i) => {
  const vals = Object.values(row);
  if (vals[6] === 'X') countSimples++;
  if (vals[7] === 'X') countDupla++;
  if (vals[11] === 'X') countMista++;
});
console.log(`Simples: ${countSimples}`);
console.log(`Dupla: ${countDupla}`);
console.log(`Mista: ${countMista}`);
console.log(`Total: ${countSimples + countDupla + countMista}`);

// Verificar: linhas com Simples mas com mesmo nome+DOB (vinicius tem 3 linhas)
console.log('\n=== ATLETAS COM MULTIPLAS LINHAS ===');
const linhasPorNome = {};
debugLines.forEach(l => {
  if (!linhasPorNome[l.key]) linhasPorName[l.key] = [];
  linhasPorNome[l.key].push(l.linha);
});
// Correcao typo
delete linhasPorNome['linhasPorNome'];
const linhasPorNomeFixed = {};
debugLines.forEach(l => {
  if (!linhasPorNomeFixed[l.key]) linhasPorNomeFixed[l.key] = [];
  linhasPorNomeFixed[l.key].push(l.linha);
});

Object.entries(linhasPorNomeFixed).forEach(([key, linhas]) => {
  if (linhas.length > 1) {
    console.log(`"${key}" -> linhas ${linhas.join(', ')}`);
  }
});