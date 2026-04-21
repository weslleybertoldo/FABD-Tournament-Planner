/**
 * Teste de validacao: XLSX vs Site vs Planner
 * Comparar contagem de inscricoes entre 3 fontes
 */

const XLSX = require('xlsx');

// Helpers (copiados do app.js)
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

function normalizeGender(g) {
  if (!g) return '';
  const v = String(g).toUpperCase().trim();
  if (['M', 'MASCULINO', 'MASC', 'MALE', 'H', 'HOMEM'].includes(v)) return 'M';
  if (['F', 'FEMININO', 'FEM', 'FEMALE', 'MULHER'].includes(v)) return 'F';
  return '';
}

function calculateCategory(dob) {
  if (!dob) return 'Principal';
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 15) return 'Sub 15';
  if (age < 17) return 'Sub 17';
  if (age < 19) return 'Sub 19';
  if (age < 23) return 'Sub 23';
  if (age >= 40) return 'Veterano';
  return 'Principal';
}

// Ler XLSX
const xlsxPath = 'C:/Users/Usuário/Downloads/inscricoes_1__Etapa_do_Campeonato_Alagoano_de_Badminton (6).xlsx';
const workbook = XLSX.readFile(xlsxPath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log('=== XLSX ANALISADO ===');
console.log(`Total linhas: ${rawData.length}`);

// Normalizar headers (alguns tem \n)
const normalizeHeader = (h) => String(h || '').replace(/\n/g, ' ').trim();
const headers = Object.keys(rawData[0] || {}).map(normalizeHeader);

// Mapear colunas
const colMap = {
  nome: headers.indexOf('Nome Completo'),
  sexo: headers.indexOf('Sexo (M ou F)'),
  dob: headers.indexOf('Data de Nascimento'),
  clube: headers.indexOf('Clube'),
  categoria: headers.indexOf('Categoria'),
  telefone: headers.indexOf('Telefone'),
  simples: headers.indexOf('Simples (marque X)'),
  dupla: headers.indexOf('Dupla (marque X)'),
  parceiroDupla: headers.indexOf('Parceiro(a) Dupla'),
  parceiroDuplaDOB: headers.indexOf('Nasc. Dupla'),
  parceiroDuplaClube: headers.indexOf('Clube Dupla'),
  mista: headers.indexOf('Mista (marque X)'),
  parceiroMista: headers.indexOf('Parceiro(a) Mista'),
  parceiroMistaDOB: headers.indexOf('Nasc. Mista'),
  parceiroMistaClube: headers.indexOf('Clube Mista'),
};

console.log('\nMapeamento de colunas:', colMap);

// Parse com a mesma logica do Planner
const atletaMap = {};

const ensureAtleta = (nomeOriginal, gender, dob, club, phone, email) => {
  if (!nomeOriginal) return null;
  const nomeNorm = normalizeName(nomeOriginal);
  if (!nomeNorm) return null;
  const key = nomeNorm + '|' + (dob || '');
  if (!atletaMap[key]) {
    const parts = nomeOriginal.trim().split(/\s+/);
    atletaMap[key] = {
      nome: nomeOriginal,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      gender: gender || '',
      dob: dob || '',
      club: club || '',
      phone: phone || '',
      email: email || '',
      inscricoes: new Set(),
      duplas: {},
    };
  }
  const a = atletaMap[key];
  if (!a.gender && gender) a.gender = gender;
  if (!a.club && club) a.club = club;
  if (!a.phone && phone) a.phone = phone;
  if (!a.email && email) a.email = email;
  return a;
};

// Converter rows do XLSX para formato interno
const xlsxRows = rawData.map(row => {
  const r = {};
  Object.keys(colMap).forEach(k => {
    const idx = colMap[k];
    if (idx >= 0 && idx < headers.length) {
      r[k] = row[Object.keys(row)[idx]] || '';
    } else {
      r[k] = '';
    }
  });
  return r;
});

rawData.forEach((row, rowIdx) => {
  const vals = Object.values(row);
  const nomeOriginal = vals[colMap.nome] || '';
  if (!nomeOriginal) return;

  const gender = normalizeGender(vals[colMap.sexo] || '');
  const dob = normalizeDate(vals[colMap.dob] || '');
  const cat = vals[colMap.categoria] || calculateCategory(dob) || 'Principal';

  const atleta = ensureAtleta(nomeOriginal, gender, dob, vals[colMap.clube] || '', vals[colMap.telefone] || '', '');

  // Simples
  if (vals[colMap.simples] === 'X') {
    const mod = gender === 'M' ? 'SM' : 'SF';
    atleta.inscricoes.add(mod + ' ' + cat);
  }

  // Dupla
  if (vals[colMap.dupla] === 'X' && vals[colMap.parceiroDupla]) {
    const mod = gender === 'M' ? 'DM' : 'DF';
    const key = mod + ' ' + cat;
    atleta.inscricoes.add(key);
    const pName = vals[colMap.parceiroDupla] || '';
    const pDob = normalizeDate(vals[colMap.parceiroDuplaDOB] || '');
    const pClub = vals[colMap.parceiroDuplaClube] || '';
    atleta.duplas[key] = { name: pName, dob: pDob, club: pClub };

    if (pName) {
      const partner = ensureAtleta(pName, gender, pDob, pClub, '', '');
      if (partner) {
        partner.inscricoes.add(key);
        if (!partner.duplas[key]) partner.duplas[key] = { name: nomeOriginal, dob: dob, club: atleta.club };
      }
    }
  }

  // Mista
  if (vals[colMap.mista] === 'X' && vals[colMap.parceiroMista]) {
    const key = 'DX ' + cat;
    atleta.inscricoes.add(key);
    const pName = vals[colMap.parceiroMista] || '';
    const pDob = normalizeDate(vals[colMap.parceiroMistaDOB] || '');
    const pClub = vals[colMap.parceiroMistaClube] || '';
    atleta.duplas[key] = { name: pName, dob: pDob, club: pClub };

    if (pName) {
      const partnerGender = gender === 'M' ? 'F' : gender === 'F' ? 'M' : '';
      const partner = ensureAtleta(pName, partnerGender, pDob, pClub, '', '');
      if (partner) {
        partner.inscricoes.add(key);
        if (!partner.duplas[key]) partner.duplas[key] = { name: nomeOriginal, dob: dob, club: atleta.club };
      }
    }
  }
});

console.log('\n=== RESULTADO DO PARSING ===');
console.log(`Atletas unicos (atletaMap): ${Object.keys(atletaMap).length}`);

const importedRows = Object.values(atletaMap).map(a => ({
  firstName: a.firstName,
  lastName: a.lastName,
  gender: a.gender,
  dob: a.dob,
  club: a.club,
  inscricoesRaw: [...a.inscricoes].join('|'),
  inscricoesSet: a.inscricoes
}));

// Contar inscricoes
const totalInscs = importedRows.reduce((s, r) => s + r.inscricoesSet.size, 0);

console.log(`Atletas no importedRows: ${importedRows.length}`);
console.log(`Total inscricoes: ${totalInscs}`);

// Listar atletas com suas inscricoes
console.log('\n=== LISTA DE ATLETAS ===');
importedRows.forEach((r, i) => {
  const inscList = [...r.inscricoesSet].join(', ') || '-';
  console.log(`${i+1}. ${r.firstName} ${r.lastName} (${r.gender}, ${r.dob}) - ${r.club} - [${inscList}]`);
});

// Comparacao com site
console.log('\n=== COMPARACAO ===');
console.log(`XLSX linhas: ${rawData.length}`);
console.log(`Planner atletas unicos: ${importedRows.length}`);
console.log(`Planner total inscricoes: ${totalInscs}`);
console.log(`Site total inscricoes: 26 (esperado)`);

// Simular CORREÇÃO: não adicionar inscricao no parceiro automatico
console.log('\n=== TESTE DA CORRECAO ===');

// Versao atual (com bug)
const totalComBug = importedRows.reduce((s, r) => s + r.inscricoesSet.size, 0);

// Versao corrigida: contar apenas inscricoes onde o atleta TEM linha propria na planilha
// Parceiros automaticos (criados por outra linha) não deveriam contar inscricao separada

const linhasOriginais = new Set(rawData.map((row, i) => {
  const vals = Object.values(row);
  return normalizeName(vals[colMap.nome] || '') + '|' + normalizeDate(vals[colMap.dob] || '');
}));

let totalCorrigido = 0;
importedRows.forEach((r, i) => {
  const key = normalizeName(r.firstName + ' ' + r.lastName) + '|' + r.dob;
  const temLinhaPropria = linhasOriginais.has(key);

  if (temLinhaPropria) {
    totalCorrigido += r.inscricoesSet.size;
  } else {
    // Parceiro automatico: não conta inscricao separada
    console.log(`  [PARCEIRO AUTO] ${r.firstName} ${r.lastName} - nao conta`);
  }
});

console.log(`\nCom bug: ${totalComBug} inscricoes`);
console.log(`Corrigido: ${totalCorrigido} inscricoes`);
console.log(`Site: 26 inscricoes`);

if (totalCorrigido === 26) {
  console.log('\n✅ CORRECAO VALIDADA! Contagem agora bate com o site.');
} else {
  console.log(`\n⚠️ Ainda nao fecha: diferença de ${totalCorrigido - 26}`);
}

// Metodo correto: contar inscricoes por linha do XLSX
console.log('\n=== CONTAGEM POR LINHA DO XLSX ===');
let totalCorretoXLSX = 0;
rawData.forEach((row, i) => {
  const vals = Object.values(row);
  const nome = vals[colMap.nome] || '';
  let count = 0;
  if (vals[colMap.simples] === 'X') { count++; console.log(`Linha ${i+1}: ${nome} - SIMPLES`); }
  if (vals[colMap.dupla] === 'X') { count++; console.log(`Linha ${i+1}: ${nome} - DUPLA com ${vals[colMap.parceiroDupla]}`); }
  if (vals[colMap.mista] === 'X') { count++; console.log(`Linha ${i+1}: ${nome} - MISTA com ${vals[colMap.parceiroMista]}`); }
  totalCorretoXLSX += count;
});

console.log(`\nTotal por linha do XLSX: ${totalCorretoXLSX}`);
console.log(`Site mostra: 26`);

// Analise: linhas duplicadas no XLSX
console.log('\n=== LINHAS DUPLICADAS NO XLSX ===');
const linhasPorNome = {};
rawData.forEach((row, i) => {
  const vals = Object.values(row);
  const nome = vals[colMap.nome] || '';
  if (!linhasPorNome[nome]) linhasPorNome[nome] = [];
  linhasPorNome[nome].push(i + 1);
});
Object.entries(linhasPorNome).forEach(([nome, linhas]) => {
  if (linhas.length > 1) {
    console.log(`${nome} aparece ${linhas.length} vezes: linhas ${linhas.join(', ')}`);
  }
});