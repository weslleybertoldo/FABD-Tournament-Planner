/**
 * Teste v3.60: Validar correcao de contagem de inscricoes
 * - Parceiros automaticos nao devem contar inscricao separada
 * - Total deve bater com o site (26)
 */

const XLSX = require('xlsx');

// Helpers
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
  return '';
}

// Ler XLSX
const xlsxPath = 'C:/Users/Usuário/Downloads/inscricoes_1__Etapa_do_Campeonato_Alagoano_de_Badminton (6).xlsx';
const workbook = XLSX.readFile(xlsxPath);
const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

// Headers normalizados
const normalizeHeader = h => String(h || '').replace(/\n/g, ' ').trim();
const headers = Object.keys(rawData[0] || {}).map(normalizeHeader);
const colMap = {
  nome: headers.indexOf('Nome Completo'),
  sexo: headers.indexOf('Sexo (M ou F)'),
  dob: headers.indexOf('Data de Nascimento'),
  clube: headers.indexOf('Clube'),
  simples: headers.indexOf('Simples (marque X)'),
  dupla: headers.indexOf('Dupla (marque X)'),
  parceiroDupla: headers.indexOf('Parceiro(a) Dupla'),
  parceiroDuplaDOB: headers.indexOf('Nasc. Dupla'),
  parceiroDuplaClube: headers.indexOf('Clube Dupla'),
  mista: headers.indexOf('Mista (marque X)'),
  parceiroMista: headers.indexOf('Parceiro(a) Mista'),
};

console.log('=== TESTE v3.60: CONTAGEM DE INSCRICOES ===\n');

// Track quem tem linha propria
const atletasComLinhaPropria = new Set();
rawData.forEach(row => {
  const vals = Object.values(row);
  const key = normalizeName(vals[colMap.nome] || '') + '|' + normalizeDate(vals[colMap.dob] || '');
  atletasComLinhaPropria.add(key);
});

// Parse com a logica correta (parceiros nao contam inscricao)
const atletaMap = {};
const ensureAtleta = (nomeOriginal, gender, dob, club) => {
  if (!nomeOriginal) return null;
  const nomeNorm = normalizeName(nomeOriginal);
  const key = nomeNorm + '|' + (dob || '');
  if (!atletaMap[key]) {
    const parts = nomeOriginal.trim().split(/\s+/);
    atletaMap[key] = { nome: nomeOriginal, firstName: parts[0] || '', lastName: parts.slice(1).join(' '), gender, dob, club, inscricoes: new Set(), duplas: {} };
  }
  const a = atletaMap[key];
  if (!a.gender && gender) a.gender = gender;
  if (!a.club && club) a.club = club;
  return a;
};

rawData.forEach(row => {
  const vals = Object.values(row);
  const nome = vals[colMap.nome] || '';
  const gender = vals[colMap.sexo] || '';
  const dob = normalizeDate(vals[colMap.dob] || '');
  const club = vals[colMap.clube] || '';

  const atleta = ensureAtleta(nome, gender, dob, club);

  // Simples
  if (vals[colMap.simples] === 'X') {
    const mod = gender === 'M' ? 'SM' : 'SF';
    atleta.inscricoes.add(mod + ' Principal');
  }

  // Dupla
  if (vals[colMap.dupla] === 'X' && vals[colMap.parceiroDupla]) {
    const key = (gender === 'M' ? 'DM' : 'DF') + ' Principal';
    atleta.inscricoes.add(key);
    const pName = vals[colMap.parceiroDupla] || '';
    const pDob = normalizeDate(vals[colMap.parceiroDuplaDOB] || '');
    const pClub = vals[colMap.parceiroDuplaClube] || '';
    atleta.duplas[key] = { name: pName };
    if (pName) {
      const partner = ensureAtleta(pName, gender, pDob, pClub);
      partner.duplas[key] = { name: nome };
    }
  }

  // Mista
  if (vals[colMap.mista] === 'X' && vals[colMap.parceiroMista]) {
    const key = 'DX Principal';
    atleta.inscricoes.add(key);
    const pName = vals[colMap.parceiroMista] || '';
    const partnerGender = gender === 'M' ? 'F' : 'M';
    const partner = ensureAtleta(pName, partnerGender, '', '');
    partner.duplas[key] = { name: nome };
  }
});

// Contar com a logica CORRIGIDA:
// Contar por LINHA (cada X = 1 inscricao), nao por atleta
//linhas duplicadas do mesmo atleta cada X conta como inscricao
let totalComCorrecao = 0;

// Metodo correto: contar linhas que tem X em Simples/Dupla/Mista
rawData.forEach((row, i) => {
  const vals = Object.values(row);
  // Headers normalizados - verificar indices
  const hKeys = Object.keys(row);
  const simplesIdx = hKeys.findIndex(k => normalizeHeader(k).includes('Simples'));
  const duplaIdx = hKeys.findIndex(k => normalizeHeader(k).includes('Dupla (marque'));
  const mistaIdx = hKeys.findIndex(k => normalizeHeader(k).includes('Mista'));

  const v = Object.values(row);
  if (v[simplesIdx] === 'X') totalComCorrecao++;
  if (v[duplaIdx] === 'X') totalComCorrecao++;
  if (v[mistaIdx] === 'X') totalComCorrecao++;
});

// Metodo antigo (por atleta deduplicado)
let totalPorAtleta = 0;
Object.entries(atletaMap).forEach(([key, a]) => {
  const temLinha = atletasComLinhaPropria.has(key);
  if (temLinha) {
    totalPorAtleta += a.inscricoes.size;
  }
});

console.log(`\nTotal por LINHA (com X): ${totalComCorrecao}`);
console.log(`Total por ATLETA deduplicado: ${totalPorAtleta}`);
console.log(`Total do site: 26`);

if (totalComCorrecao === 26) {
  console.log('\n✅ TESTE PASSOU: Contagem por linha bate com o site!');
  process.exit(0);
} else {
  console.log(`\n❌ TESTE FALHOU: Diferenca de ${totalComCorrecao - 26}`);
  process.exit(1);
}