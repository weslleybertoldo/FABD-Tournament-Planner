// =====================================================================
// Umpires (Arbitros) — CRUD local de arbitros. Persiste em localStorage
// como source-of-truth + sync best-effort via window.api.saveSettings
// (background). Sem dependencia de globals do torneio (`tournament`/
// `players`); usa `showToast` e DOM dos modais de configuracao.
// Carregado ANTES de app.js — funcoes ficam disponiveis como globais.
// Issue #14 sub-tarefa 14.D — auditoria 2026-05-09.
// =====================================================================

// === UMPIRES ===
// v4.11+: gera id de arbitro (Electron tem crypto.randomUUID; fallback simples)
function _newUmpireId(){
  try{ return crypto.randomUUID(); }catch{ return 'u_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }
}
function loadUmpires(){
  try{
    const raw=localStorage.getItem('fabd-umpires')||'[]';
    let parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return[];
    // Migracao: arbitros antigos cadastrados sem id ganham um agora.
    // Antes loadUmpires filtrava todos sem id → lista voltava vazia mesmo com cadastros.
    let migrated=false;
    parsed=parsed
      .filter(u=>u&&typeof u==='object'&&typeof u.name==='string')
      .map(u=>{ if(typeof u.id!=='string'){u.id=_newUmpireId();migrated=true;} return u; })
      .slice(0,100);
    if(migrated){
      try{ localStorage.setItem('fabd-umpires',JSON.stringify(parsed)); }catch(e){ console.warn('[umpires] localStorage migration falhou (quota?):', e?.message || e); }
    }
    return parsed;
  }catch{return[];}
}

// Puxar arbitro por id (preferido) ou por nome (fallback pra match com Referee)
function getUmpireById(id){ return loadUmpires().find(u=>u.id===id) || null; }
function getUmpireByName(name){
  if(!name)return null;
  const n=name.toLowerCase().trim();
  return loadUmpires().find(u=>u.name.toLowerCase().trim()===n) || null;
}
function saveUmpires(l){
  localStorage.setItem('fabd-umpires',JSON.stringify(l));
  // Salvar no banco tambem para persistir
  window.api.getSettings().then(s=>{s=s||{};s.umpires=l;window.api.saveSettings(s);}).catch(e=>console.warn('[settings] saveUmpires DB persist falhou:', e?.message || e));
}
// scoringTables + SCORING_BUCKETS + DEFAULT_SCORING_TABLE + loadScoringTables
// + scoring helpers extraidos pra src/js/modules/scoring-profiles.js (issue #14.C).

function renderCategoriesInfo(){
  const container=document.getElementById('settings-categories-content');
  if(!container)return;
  const year=new Date().getFullYear();
  const modalities=[
    {code:'SM',name:'Simples Masculino',color:'#EFF6FF',border:'#BFDBFE',text:'#1E40AF'},
    {code:'SF',name:'Simples Feminino',color:'#FDF4FF',border:'#F5D0FE',text:'#86198F'},
    {code:'DM',name:'Duplas Masculinas',color:'#EFF6FF',border:'#BFDBFE',text:'#1E40AF'},
    {code:'DF',name:'Duplas Femininas',color:'#FDF4FF',border:'#F5D0FE',text:'#86198F'},
    {code:'DX',name:'Duplas Mistas',color:'#F0FDF4',border:'#BBF7D0',text:'#166534'}
  ];
  const categories=[
    {code:'Sub 11',desc:`ate ${year-10} (faz 10 anos)`},
    {code:'Sub 13',desc:`${year-12} a ${year-11} (faz 12 anos)`},
    {code:'Sub 15',desc:`${year-14} a ${year-13} (faz 14 anos)`},
    {code:'Sub 17',desc:`${year-16} a ${year-15} (faz 16 anos)`},
    {code:'Sub 19',desc:`${year-18} a ${year-17} (faz 18 anos)`},
    {code:'Sub 23',desc:`${year-22} a ${year-19} (faz 19-22 anos)`},
    {code:'Principal',desc:`${year-34} a ${year-24} (faz 24-34 anos)`},
    {code:'Senior',desc:`${year-44} a ${year-35} (35+ anos)`},
    {code:'Master I',desc:`${year-54} a ${year-45} (45+ anos)`},
    {code:'Master II',desc:`ate ${year-55} (55+ anos)`}
  ];
  const modCards=modalities.map(m=>`<div style="background:${m.color};padding:12px;border-radius:8px;border:1px solid ${m.border}"><div style="font-weight:600;color:${m.text};font-size:14px">${m.code} - ${m.name}</div></div>`).join('');
  const catTable=categories.map(c=>`<tr><td style="font-weight:600;padding:8px;border-bottom:1px solid #e5e7eb">${c.code}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#475569">${c.desc}</td></tr>`).join('');
  container.innerHTML=`
    <div class="card-header"><h3>Categorias Oficiais</h3></div>
    <p style="font-size:13px;color:var(--fabd-gray-600);margin-bottom:16px">
      Regras de idade para cada categoria. O sistema valida automaticamente na inscricao.
    </p>
    <div style="margin-bottom:20px">
      <h4 style="margin-bottom:12px;color:var(--fabd-gray-700)">Modalidades</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">${modCards}</div>
    </div>
    <div>
      <h4 style="margin-bottom:12px;color:var(--fabd-gray-700)">Faixas Etarias (ano de nascimento)</h4>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f8fafc"><th style="padding:10px;text-align:left;font-weight:600">Categoria</th><th style="padding:10px;text-align:left;font-weight:600">Faixa de nascimento</th></tr></thead>
        <tbody>${catTable}</tbody>
      </table>
    </div>
  `;
}
function renderUmpires(){
  const u=loadUmpires(),tb=document.getElementById('umpires-table-body');
  let h='';
  // Arbitros locais
  if(u.length){
    u.forEach((x,i)=>{h+=`<tr><td>${i+1}</td><td><strong>${esc(x.name)}</strong></td><td><span class="tag tag-blue">${esc(x.level)}</span></td><td><button class="btn btn-sm btn-danger" data-action="removeUmpire" data-arg-1="${i}">Remover</button></td></tr>`;});
  }
  tb.innerHTML=h||'<tr><td colspan="4" style="text-align:center;color:var(--fabd-gray-500);padding:24px">Nenhum arbitro local</td></tr>';
  // Carregar arbitros online do Supabase
  loadOnlineReferees();
}

async function loadOnlineReferees(){
  let container=document.getElementById('online-referees-container');
  if(!container){
    const parent=document.getElementById('umpires-table-body')?.closest('.card');
    if(!parent)return;
    const div=document.createElement('div');
    div.id='online-referees-container';
    div.style.cssText='margin-top:24px;padding-top:16px;border-top:1px solid var(--fabd-gray-200)';
    parent.appendChild(div);
    container=div;
  }
  try{
    const referees=await window.api.supabaseGetReferees();
    if(!referees?.length){container.innerHTML='<h4 style="color:var(--fabd-gray-600);margin-bottom:8px">Arbitros Online</h4><p style="color:var(--fabd-gray-500);font-size:13px">Nenhum arbitro conectado.</p>';return;}
    let h='<h4 style="color:var(--fabd-gray-600);margin-bottom:12px">Arbitros Online (via App)</h4>';
    h+='<table><thead><tr><th>Nome</th><th>Email</th><th>Status</th><th>Acoes</th></tr></thead><tbody>';
    referees.forEach(r=>{
      const stClass=r.status==='autorizado'?'tag-green':r.status==='bloqueado'?'tag-red':'tag-yellow';
      const stText=r.status==='autorizado'?'Autorizado':r.status==='bloqueado'?'Bloqueado':'Pendente';
      h+=`<tr>
        <td><strong>${esc(r.name)}</strong></td>
        <td style="font-size:12px;color:var(--fabd-gray-500)">${esc(r.email||'')}</td>
        <td><span class="tag ${stClass}">${stText}</span></td>
        <td>`;
      if(r.status!=='autorizado')h+=`<button class="btn btn-sm btn-success" data-action="authorizeReferee" data-arg-1="${esc(r.id)}" data-arg-2="autorizado">Liberar</button> `;
      if(r.status!=='bloqueado')h+=`<button class="btn btn-sm btn-danger" data-action="authorizeReferee" data-arg-1="${esc(r.id)}" data-arg-2="bloqueado">Bloquear</button>`;
      if(r.status==='autorizado')h+=`<button class="btn btn-sm btn-secondary" data-action="authorizeReferee" data-arg-1="${esc(r.id)}" data-arg-2="pendente" style="margin-left:4px">Revogar</button>`;
      h+=`</td></tr>`;
    });
    h+='</tbody></table>';
    container.innerHTML=h;
  }catch(e){container.innerHTML='<p style="color:var(--fabd-gray-500);font-size:12px">Erro ao carregar arbitros online</p>';}
}

async function authorizeReferee(id,status){
  try{
    await window.api.supabaseUpdateRefereeStatus(id,status);
    if(status==='autorizado'){
      const name=await window.api.supabaseGetRefereeName(id);
      if(name){
        const umps=loadUmpires();
        if(!umps.some(u=>u.name===name)){umps.push({name,level:'Online'});saveUmpires(umps);}
      }
    }
    showToast(status==='autorizado'?'Arbitro autorizado!':status==='bloqueado'?'Arbitro bloqueado':'Acesso revogado');
    renderUmpires();
  }catch(e){showToast('Erro: '+e.message,'error');}
}
function addUmpire(){const n=gv('umpire-name');if(!n){alert('Nome');return;}const l=document.getElementById('umpire-level').value;const u=loadUmpires();if(u.some(x=>x.name.toLowerCase()===n.toLowerCase())){alert('Ja existe');return;}u.push({id:_newUmpireId(),name:n,level:l});saveUmpires(u);document.getElementById('umpire-name').value='';renderUmpires();showToast('Arbitro adicionado!');}
function removeUmpire(i){if(!confirm('Remover?'))return;const u=loadUmpires();u.splice(i,1);saveUmpires(u);renderUmpires();showToast('Removido');}
