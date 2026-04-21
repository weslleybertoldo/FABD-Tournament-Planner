/**
 * Validar: xlsxRows tem propriedades simples/dupla/mista?
 */

const XLSX = require('xlsx');

const xlsxPath = 'C:/Users/Usuário/Downloads/inscricoes_1__Etapa_do_Campeonato_Alagoano_de_Badminton (6).xlsx';
const workbook = XLSX.readFile(xlsxPath);
const sheetName = workbook.SheetNames[0];

// Simular o que o app.js faz para ler o XLSX
// O app usa window.api.xlsxImport() que chama main.js
// Vou simular o parse do xlsx aqui

const normalizeHeader = h => String(h || '').replace(/\n/g, ' ').trim();
const headers = Object.keys(workbook.Sheets[sheetName]).slice(1).map(r => normalizeHeader(r));

// Encontrar colunas
const colMap = {};
headers.forEach((h, i) => {
  const l = h.toLowerCase();
  if (l.includes('simples')) colMap.simples = i;
  if (l.includes('dupla') && !l.includes('parceiro')) colMap.dupla = i;
  if (l.includes('mista')) colMap.mista = i;
  if (l.includes('nome')) colMap.nome = i;
  if (l.includes('sexo')) colMap.sexo = i;
  if (l.includes('data') && l.includes('nasc')) colMap.dob = i;
  if (l.includes('clube') && !l.includes('dupla')) colMap.clube = i;
});

console.log('=== COL MAP ===');
console.log(colMap);

console.log('\n=== HEADERS ===');
headers.forEach((h, i) => console.log(`${i}: ${h}`));

// Ler dados (sheet_to_json)
const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

console.log('\n=== PRIMEIRA LINHA (todas as props) ===');
console.log(Object.keys(rawData[0]));

// Verificar se props existem
const primeira = rawData[0];
console.log('\n=== PROPRIEDADES ===');
Object.keys(primeira).forEach(k => {
  console.log(`"${k}": "${primeira[k]}"`);
});

// Tentar ler como o app.js faz
console.log('\n=== TENTAR ACESSAR COMO O APP FAZ ===');
console.log('r.simples:', rawData[0].simples);
console.log('r.dupla:', rawData[0].dupla);
console.log('r.mista:', rawData[0].mista);

// Verificar headers normalizados
const hKeys = Object.keys(rawData[0]);
hKeys.forEach(k => {
  if (k.toLowerCase().includes('simples')) console.log('SIMPLES found as:', k);
  if (k.toLowerCase().includes('dupla') && !k.toLowerCase().includes('parceiro')) console.log('DUPLA found as:', k);
  if (k.toLowerCase().includes('mista')) console.log('MISTA found as:', k);
});

// Contar com as props
let count = 0;
rawData.forEach(r => {
  const vals = Object.values(r);
  // Procurar os indices das colunas com X
  const simplesIdx = Object.keys(r).findIndex(k => normalizeHeader(k).includes('Simples'));
  const duplaIdx = Object.keys(r).findIndex(k => normalizeHeader(k).includes('Dupla (marque'));
  const mistaIdx = Object.keys(r).findIndex(k => normalizeHeader(k).includes('Mista'));

  const v = Object.values(r);
  if (v[simplesIdx] === 'X') count++;
  if (v[duplaIdx] === 'X') count++;
  if (v[mistaIdx] === 'X') count++;
});

console.log(`\n=== CONTAGEM ===`);
console.log(`Total com X: ${count}`);
console.log(`Esperado: 26`);