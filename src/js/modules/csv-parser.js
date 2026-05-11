// =====================================================================
// CSV Parser — funcoes puras para parsing e normalizacao de dados de
// importacao de atletas. Sem dependencia de globals (tournament, etc),
// sem manipulacao de DOM. Carregado ANTES de app.js no index.html.
// Funcoes ficam disponiveis no escopo global (compatibilidade com
// chamadas pre-modularizacao em app.js).
// Issue #14 sub-tarefa 14.A — auditoria 2026-05-09.
// =====================================================================

// calculateCategory(dob) -> categoria por idade (regra "ate X anos este ano").
function calculateCategory(dob) {
  if (!dob) return 'Principal';
  // Aceitar formatos DD/MM/YYYY e YYYY-MM-DD
  let birthYear;
  const brMatch = dob.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) { birthYear = parseInt(brMatch[3]); }
  else {
    const isoMatch = dob.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) { birthYear = parseInt(isoMatch[1]); }
    else { return 'Principal'; }
  }
  const age = new Date().getFullYear() - birthYear;

  // Regra: "ate X anos ESTE ANO" = ano_atual - ano_nascimento
  if (age <= 10) return 'Sub 11';
  if (age <= 12) return 'Sub 13';
  if (age <= 14) return 'Sub 15';
  if (age <= 16) return 'Sub 17';
  if (age <= 18) return 'Sub 19';
  if (age <= 22) return 'Sub 23';
  if (age >= 55) return 'Master II';
  if (age >= 45) return 'Master I';
  if (age >= 35) return 'Senior';
  return 'Principal';
}

// parseCSVLine(line, sep) -> array de campos. Lida com aspas duplas escapadas ("").
function parseCSVLine(line,sep){const r=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===sep&&!q){r.push(c.trim());c='';}else c+=ch;}r.push(c.trim());return r;}

// mapColumns(headers) -> map { firstName: idx, lastName: idx, ... } com fallback posicional.
function mapColumns(h){const m={firstName:-1,lastName:-1,gender:-1,dob:-1,club:-1,state:-1,ranking:-1,phone:-1,email:-1,inscricoes:-1,duplaDM:-1,duplaDF:-1,duplaDX:-1};const a={firstName:['nome','firstname','first name'],lastName:['sobrenome','lastname','last name'],gender:['genero','gender','sexo'],dob:['data nascimento','datanascimento','dob','date of birth','data nasc','dt nascimento'],club:['clube','club'],state:['estado','state','uf'],ranking:['ranking','classificacao','rank'],phone:['telefone','phone','tel','celular','mobile'],email:['email','e-mail','mail'],inscricoes:['inscricoes','inscricao','categories','categorias'],duplaDM:['dupla_dm','dupladm','parceiro_dm'],duplaDF:['dupla_df','dupladf','parceira_df'],duplaDX:['dupla_dx','duladx','parceiro_dx','parceira_dx']};h.forEach((x,i)=>{if(x==null)return;const l=String(x).toLowerCase().replace(/[^a-z0-9_ ]/g,'').trim();Object.keys(a).forEach(k=>{if(a[k].some(al=>l===al||l.includes(al))&&m[k]===-1)m[k]=i;});});if(m.firstName===-1)m.firstName=0;if(m.lastName===-1)m.lastName=1;if(m.gender===-1)m.gender=2;if(m.dob===-1)m.dob=3;if(m.club===-1)m.club=4;if(m.state===-1)m.state=5;if(m.ranking===-1)m.ranking=6;if(m.phone===-1)m.phone=7;if(m.email===-1)m.email=8;if(m.inscricoes===-1)m.inscricoes=9;if(m.duplaDM===-1)m.duplaDM=10;if(m.duplaDF===-1)m.duplaDF=11;if(m.duplaDX===-1)m.duplaDX=12;return m;}

// getCol(cols, idx) -> string limpa (sem aspas circundantes) ou '' se idx invalido.
function getCol(c,i){return i>=0&&i<c.length&&c[i]!=null?String(c[i]).replace(/^["']|["']$/g,'').trim():'';}

// normalizeName(s) -> lower-case sem diacriticos, trimmed. Usado em comparacoes.
function normalizeName(s){return(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}

// cleanAthleteName(n) -> Title Case com tratamento de conectores (da, de, do).
// "RONALD LUIS ROGERIO DA SILVA" -> "Luis Rogerio da Silva"
// "1234 - PEDRO SANTOS" -> "Pedro Santos"
// "JOAO SILVA-" -> "João Silva"
function cleanAthleteName(n){
  if(!n)return'';
  let s=String(n).trim();
  s=s.replace(/^[d]+[s]*[-–—s]+/,'');
  const parts=s.split(/[s]+/).filter(p=>p);
  if(parts.length===0)return'';
  const connectors=['da','de','do','das','dos','e','di','du','von','van'];
  return parts.map(p=>{
    const clean=p.replace(/[-–—]+$/,'');
    const low=clean.toLowerCase();
    if(connectors.includes(low))return low;
    // Se palavra é MAIÚSCULA (ou mix case), converter para Title Case
    if((clean===clean.toUpperCase()||/^[A-Z][a-z]+$/.test(clean)) && clean.length>1){
      return clean.charAt(0).toUpperCase()+low.slice(1);
    }
    return clean;
  }).join(' ');
}

// normalizeGender(g) -> 'M' | 'F' | '' (invalido/vazio).
// C6: antes retornava valor nao-reconhecido como-estava, quebrando modalidade DM/DF/DX.
function normalizeGender(g){
  if(!g)return'';
  const v=String(g).toUpperCase().trim();
  if(['M','MASCULINO','MASC','MALE','H','HOMEM'].includes(v))return'M';
  if(['F','FEMININO','FEM','FEMALE','MULHER'].includes(v))return'F';
  return ''; // invalido -> vazio (validacao posterior marca linha invalida)
}

// normalizeDate(d) -> 'YYYY-MM-DD' ou '' se invalido.
// Aceita: Date object, serial Excel (numero/string numerica), DD/MM/YYYY,
// DD-MM-YYYY, DD.MM.YYYY, ISO YYYY-MM-DD.
// R5+R6: retorna '' para invalido (nao mais o valor original).
function normalizeDate(d){
  if(d==null||d==='')return'';
  // Date object
  if(d instanceof Date){
    if(isNaN(d.getTime()))return'';
    const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
    return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  // Serial Excel (numero) — dias desde 1899-12-30 (epoch Excel).
  // Faixa razoavel: 1 (1900-01-01) a 73000 (~2099).
  if(typeof d==='number'&&d>0&&d<100000){
    const dt=new Date(Date.UTC(1899,11,30)+d*86400000);
    if(!isNaN(dt.getTime())){
      const y=dt.getUTCFullYear(),m=dt.getUTCMonth()+1,day=dt.getUTCDate();
      return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
    return'';
  }
  const s=String(d).trim();
  if(!s)return'';
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  let m=s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // ISO YYYY-MM-DD (com ou sem tempo)
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // String puramente numerica (serial Excel que veio como string)
  if(/^\d+(\.\d+)?$/.test(s))return normalizeDate(parseFloat(s));
  return ''; // nao reconhecido
}
