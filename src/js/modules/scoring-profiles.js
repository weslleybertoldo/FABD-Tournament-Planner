// =====================================================================
// Game Profiles + Scoring Tables — helpers de configuracao de torneio.
// Profiles: tipo de chave (round-robin / grupos / eliminatoria) por
// numero de atletas. Scoring: tabela de pontuacao por posicao final.
// Leem/escrevem globals (gameProfiles, scoringTables); tocam DOM dos
// modais de configuracao; localStorage como fallback.
// Carregado ANTES de app.js — funcoes ficam disponiveis como globais.
// Issue #14 sub-tarefa 14.C — auditoria 2026-05-09.
// =====================================================================

// === GAME PROFILES + BTP HELPERS ===
async function loadGameProfiles(){
  try{
    const settings=await window.api.getSettings();
    if(settings?.gameProfiles?.length){gameProfiles=settings.gameProfiles;}
    else{
      // Fallback: tentar localStorage (migracao) com validacao de estrutura
      try{
        const raw=localStorage.getItem('fabd-game-profiles')||'[]';
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed)){
          // Validar estrutura de cada perfil
          gameProfiles=parsed.filter(p=>p&&typeof p==='object'&&typeof p.id==='string'&&typeof p.name==='string').slice(0,50);
        } else {gameProfiles=[];}
      }catch{gameProfiles=[];}
    }
  }catch{gameProfiles=[];}
  if(!gameProfiles.length){
    gameProfiles=[
      {id:'default-1',name:'Padrao FABD',mode:'custom',fixedType:'Eliminatoria',ranges:[{min:2,max:4,type:'Todos contra Todos'},{min:5,max:7,type:'Grupos + Eliminatoria'},{min:8,max:99,type:'Eliminatoria'}]},
      {id:'default-2',name:'Somente Mata-Mata',mode:'fixed',fixedType:'Eliminatoria',ranges:[]},
      {id:'default-3',name:'Somente Round Robin',mode:'fixed',fixedType:'Todos contra Todos',ranges:[]}
    ];
    saveGameProfiles();
  }
}
async function saveGameProfiles(){
  localStorage.setItem('fabd-game-profiles',JSON.stringify(gameProfiles));
  try{const s=await window.api.getSettings()||{};s.gameProfiles=gameProfiles;await window.api.saveSettings(s);}catch(e){console.warn('Erro ao sincronizar perfis:', e);}
}
function renderGameProfiles(){const c=document.getElementById('game-profiles-list');if(!gameProfiles.length){c.innerHTML='<p style="text-align:center;color:var(--fabd-gray-500)">Sem perfis</p>';return;}let h='<table><thead><tr><th>Nome</th><th>Modo</th><th>Detalhes</th><th>Acoes</th></tr></thead><tbody>';gameProfiles.forEach(p=>{h+=`<tr><td><strong>${esc(p.name)}</strong></td><td>${p.mode==='fixed'?'Fixo':'Personalizado'}</td><td style="font-size:12px">${p.mode==='fixed'?esc(p.fixedType):(p.ranges||[]).map(r=>`${r.min}-${r.max}: ${r.type}`).join(' | ')}</td><td><button class="btn btn-sm btn-secondary" data-action="editGameProfile" data-arg-1="${esc(p.id)}">Editar</button> <button class="btn btn-sm btn-danger" data-action="deleteGameProfile" data-arg-1="${esc(p.id)}">Excluir</button></td></tr>`;});c.innerHTML=h+'</tbody></table>';}
function addGameProfile(){document.getElementById('profile-editor-title').textContent='Novo Perfil';document.getElementById('gp-name').value='';document.getElementById('gp-mode').value='custom';onGameModeChange();setRanges([{min:2,max:4,type:'Todos contra Todos'},{min:5,max:7,type:'Grupos + Eliminatoria'},{min:8,max:99,type:'Eliminatoria'}]);document.getElementById('game-profile-editor').style.display='';}
function editGameProfile(id){const p=gameProfiles.find(x=>x.id===id);if(!p)return;document.getElementById('profile-editor-title').textContent='Editar';document.getElementById('gp-name').value=p.name;document.getElementById('gp-mode').value=p.mode;document.getElementById('gp-fixed-type').value=p.fixedType||'Eliminatoria';onGameModeChange();if(p.mode==='custom')setRanges(p.ranges||[]);document.getElementById('game-profile-editor').style.display='';editingProfileId=p.id;}
let editingProfileId=null;
function deleteGameProfile(id){if(!confirm('Excluir?'))return;gameProfiles=gameProfiles.filter(x=>x.id!==id);saveGameProfiles();renderGameProfiles();}
function cancelProfileEditor(){document.getElementById('game-profile-editor').style.display='none';editingProfileId=null;}
function onGameModeChange(){const m=document.getElementById('gp-mode').value;document.getElementById('gp-fixed-config').style.display=m==='fixed'?'':'none';document.getElementById('gp-custom-config').style.display=m==='custom'?'':'none';}
function setRanges(ranges){
  const c = document.getElementById('gp-ranges-container');
  let h = '';
  ranges.forEach((r, i) => {
    h += `<div class="form-row" style="margin-bottom:12px;align-items:stretch;background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:12px 14px;gap:12px">
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:12px;font-weight:600;color:#64748B">Se tiver de</span>
        <input type="number" class="form-control range-min" value="${r.min}" min="1" max="999" style="width:72px;text-align:center;font-weight:700">
        <span style="font-size:12px;font-weight:600;color:#64748B">a</span>
        <input type="number" class="form-control range-max" value="${r.max}" min="1" max="999" style="width:72px;text-align:center;font-weight:700">
        <span style="font-size:12px;font-weight:600;color:#64748B">atletas</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex:1">
        <span style="font-size:12px;font-weight:600;color:#64748B">&rarr;</span>
        <select class="form-control range-type" style="font-weight:600">
          <option value="Todos contra Todos"${r.type==='Todos contra Todos'?' selected':''}>Todos contra Todos</option>
          <option value="Grupos + Eliminatoria"${r.type==='Grupos + Eliminatoria'?' selected':''}>Grupos + Eliminatoria</option>
          <option value="Eliminatoria"${r.type==='Eliminatoria'?' selected':''}>Eliminatoria (mata-mata)</option>
        </select>
      </div>
      <div style="display:flex;align-items:center"><button class="btn btn-sm btn-danger" data-action="removeRange" data-arg-1="${i}" title="Remover faixa">&times;</button></div>
    </div>`;
  });
  c.innerHTML = h;
}
function addRange(){const r=collectRanges();const l=r.length?r[r.length-1].max+1:2;r.push({min:l,max:l+10,type:'Eliminatoria'});setRanges(r);}
function removeRange(i){const r=collectRanges();if(r.length<=1)return;r.splice(i,1);setRanges(r);}
function collectRanges(){
  // Perfis definem apenas faixa (min, max) e tipo de disputa.
  // numGroups e classificados/grupo saem do calculo BTP (calcIdealGroupCount)
  // e podem ser editados manualmente por chave no detalhe.
  const r = [];
  document.querySelectorAll('#gp-ranges-container .form-row').forEach(row => {
    r.push({
      min: parseInt(row.querySelector('.range-min').value) || 1,
      max: parseInt(row.querySelector('.range-max').value) || 99,
      type: row.querySelector('.range-type').value
    });
  });
  return r;
}
function saveGameProfile(){const name=gv('gp-name');if(!name){alert('Nome');return;}const mode=document.getElementById('gp-mode').value;const p={id:editingProfileId||Date.now().toString(),name,mode,fixedType:document.getElementById('gp-fixed-type').value,ranges:mode==='custom'?collectRanges():[]};if(editingProfileId){const i=gameProfiles.findIndex(x=>x.id===editingProfileId);if(i>=0)gameProfiles[i]=p;}else gameProfiles.push(p);saveGameProfiles();cancelProfileEditor();renderGameProfiles();showToast('Perfil salvo!');}
function getDrawTypeForCount(t,count){if(!t.gameProfileId)return null;const p=gameProfiles.find(x=>x.id===t.gameProfileId);if(!p)return null;if(p.mode==='fixed')return p.fixedType;for(const r of(p.ranges||[]))if(count>=r.min&&count<=r.max)return r.type;if(p.ranges?.length)return p.ranges[p.ranges.length-1].type;return null;}

// Calculo BTP/BWF ideal de numero de grupos por contagem de atletas.
// Alvo: grupos de 3-4 atletas.
// 1-5: 1 grupo (round-robin puro)
// 6-8: 2 | 9-12: 3 | 13-16: 4 | 17-24: 6 | 25+: 8
function calcIdealGroupCount(n) {
  if (n <= 5) return 1;
  if (n <= 8) return 2;
  if (n <= 12) return 3;
  if (n <= 16) return 4;
  if (n <= 24) return 6;
  return 8;
}

// === SCORING TABLES (Rankings de Pontuação) ===
let scoringTables=[];
const SCORING_BUCKETS=[
  {key:'p1',  label:'1º (Campeão)',         min:1,   max:1},
  {key:'p2',  label:'2º (Vice)',            min:2,   max:2},
  {key:'p3',  label:'3º/4º (Semifinal)',    min:3,   max:4},
  {key:'p5',  label:'5º-8º (Quartas)',      min:5,   max:8},
  {key:'p9',  label:'9º-16º (Oitavas)',     min:9,   max:16},
  {key:'p17', label:'17º-32º (R32)',        min:17,  max:32},
  {key:'p33', label:'33º-64º (R64)',        min:33,  max:64},
  {key:'p65', label:'65º-128º (R128)',      min:65,  max:128},
  {key:'p129',label:'129º-256º (R256)',     min:129, max:256}
];
const DEFAULT_SCORING_TABLE={
  id:'default-bwf', name:'Padrão BWF', isDefault:true,
  points:{p1:1000,p2:850,p3:700,p5:550,p9:400,p17:250,p33:100,p65:50,p129:25}
};

async function loadScoringTables(){
  try{
    const s=await window.api.getSettings();
    if(s?.scoringTables?.length)scoringTables=s.scoringTables;
  }catch{scoringTables=[];}
  // Garantir que o seed Padrão BWF sempre exista
  if(!scoringTables.find(t=>t.id==='default-bwf')){
    scoringTables.unshift(JSON.parse(JSON.stringify(DEFAULT_SCORING_TABLE)));
    await saveScoringTables();
  }
}

async function saveScoringTables(){
  try{
    const s=await window.api.getSettings()||{};
    s.scoringTables=scoringTables;
    await window.api.saveSettings(s);
  }catch(e){console.warn('Erro ao salvar rankings:',e);}
}

function pointsForPosition(pos,table){
  if(!table?.points||!pos||pos<1)return 0;
  const p=table.points;
  for(const b of SCORING_BUCKETS){
    if(pos>=b.min&&pos<=b.max)return +p[b.key]||0;
  }
  return +p.p129||0;
}

function getCurrentScoringTable(){
  const id=tournament?.scoringTableId;
  if(id){
    const t=scoringTables.find(x=>x.id===id);
    if(t)return t;
  }
  return scoringTables.find(t=>t.id==='default-bwf')||DEFAULT_SCORING_TABLE;
}

function renderScoringTables(){
  const c=document.getElementById('settings-rankings-content');
  if(!c)return;
  if(!scoringTables.length){
    c.innerHTML='<p style="color:var(--fabd-gray-500);padding:24px;text-align:center">Carregando...</p>';
    return;
  }
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <p style="font-size:13px;color:var(--fabd-gray-600);margin:0">Defina tabelas de pontuação por colocação. Use nos relatórios "Classificação Geral" e "Ranking Federados" do torneio.</p>
    <button class="btn btn-primary btn-sm" data-action="addScoringTable">+ Novo Ranking</button>
  </div>`;
  h+='<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden"><thead><tr style="background:#f8fafc"><th style="padding:10px;text-align:left">Nome</th>';
  SCORING_BUCKETS.forEach(b=>{h+=`<th style="padding:10px;text-align:center;font-size:11px">${esc(b.label.split(' ')[0])}</th>`;});
  h+='<th style="padding:10px;text-align:center;width:140px">Ações</th></tr></thead><tbody>';
  scoringTables.forEach(t=>{
    h+=`<tr style="border-top:1px solid #e5e7eb"><td style="padding:10px"><strong>${esc(t.name)}</strong>${t.isDefault?' <span class="tag tag-blue" style="font-size:10px">Padrão</span>':''}</td>`;
    SCORING_BUCKETS.forEach(b=>{h+=`<td style="padding:10px;text-align:center;font-size:13px">${(+t.points[b.key]||0).toLocaleString('pt-BR')}</td>`;});
    h+='<td style="padding:10px;text-align:center">';
    h+=`<button class="btn btn-sm btn-secondary" data-action="editScoringTable" data-arg-1="${esc(t.id)}">Editar</button>`;
    if(!t.isDefault)h+=` <button class="btn btn-sm btn-danger" data-action="deleteScoringTable" data-arg-1="${esc(t.id)}">Excluir</button>`;
    h+='</td></tr>';
  });
  h+='</tbody></table>';
  c.innerHTML=h;
}

function addScoringTable(){
  document.getElementById('st-modal-title').textContent='Novo Ranking';
  document.getElementById('st-id').value='';
  document.getElementById('st-name').value='';
  SCORING_BUCKETS.forEach(b=>{const i=document.getElementById('st-'+b.key);if(i)i.value=DEFAULT_SCORING_TABLE.points[b.key];});
  document.getElementById('st-name').disabled=false;
  openModal('modal-scoring-table');
}

function editScoringTable(id){
  const t=scoringTables.find(x=>x.id===id);if(!t)return;
  document.getElementById('st-modal-title').textContent=t.isDefault?'Editar Ranking (Padrão)':'Editar Ranking';
  document.getElementById('st-id').value=t.id;
  document.getElementById('st-name').value=t.name;
  document.getElementById('st-name').disabled=!!t.isDefault;
  SCORING_BUCKETS.forEach(b=>{const i=document.getElementById('st-'+b.key);if(i)i.value=+t.points[b.key]||0;});
  openModal('modal-scoring-table');
}

async function saveScoringTableForm(){
  const id=document.getElementById('st-id').value;
  const name=(document.getElementById('st-name').value||'').trim();
  if(!name){alert('Informe o nome do ranking');return;}
  const points={};
  SCORING_BUCKETS.forEach(b=>{points[b.key]=parseInt(document.getElementById('st-'+b.key).value)||0;});
  if(id){
    const t=scoringTables.find(x=>x.id===id);
    if(t){if(!t.isDefault)t.name=name;t.points=points;}
  }else{
    scoringTables.push({id:'st-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name,points,isDefault:false});
  }
  await saveScoringTables();
  closeModal('modal-scoring-table');
  renderScoringTables();
  showToast('Ranking salvo!');
}

async function deleteScoringTable(id){
  const t=scoringTables.find(x=>x.id===id);
  if(!t||t.isDefault)return;
  if(!confirm(`Excluir ranking "${t.name}"?`))return;
  scoringTables=scoringTables.filter(x=>x.id!==id);
  await saveScoringTables();
  renderScoringTables();
  showToast('Ranking removido');
}

