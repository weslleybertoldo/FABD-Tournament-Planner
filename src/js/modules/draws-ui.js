// =====================================================================
// Draws filters + list/detail UI — filtros do popup de chaves, render
// da lista e painel de detalhe. NAO INCLUI logica de geracao de
// bracket nem propagacao de resultados (regenerateDrawSchedule,
// repropagateAllResults, generateBracket etc continuam em app.js).
// Toca globals: drawFilters (let), tournament.draws, DOM da aba Chaves.
// Issue #14 sub-tarefa 14.F (escopo seguro) — auditoria 2026-05-09.
// =====================================================================

function sortDraws(draws) {
  return [...draws].sort((a,b)=>{
    const pa=a.name||'',pb=b.name||'';
    // Primeiro: TODOS os Simples antes de TODAS as Duplas
    const aS=isSimplesMod(pa),bS=isSimplesMod(pb);
    if(aS&&!bS)return-1;if(!aS&&bS)return 1;
    // Depois: ordenar por categoria
    const ca=getCatIdx(pa),cb=getCatIdx(pb);
    if(ca<cb)return-1;if(ca>cb)return 1;
    // Por fim: SM antes de SF (simples) ou DM/DF/DX (duplas)
    const ma=MOD_ORDER.findIndex(m=>pa.startsWith(m));
    const mb=MOD_ORDER.findIndex(m=>pb.startsWith(m));
    const ia=ma>=0?ma:999,ib=mb>=0?mb:999;
    if(ia<ib)return-1;if(ia>ib)return 1;
    return pa.localeCompare(pb);
  });
}

// === FILTROS DA ABA CHAVES ===
// drawFilters: cada grupo aceita Set de valores. Vazio = "todos" (não filtra). Não-vazio = só os marcados passam.
let drawFilters={sorteio:new Set(),premio:new Set(),final:new Set()};

function computeDrawState(d){
  const has=(d.matches?.length||0)>0;
  const realMatches=has?(d.matches||[]).filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE'):[];
  const allFinished=realMatches.length>0&&realMatches.every(m=>m.winner!==undefined&&m.winner!==null);
  return{sorteio:has?'sim':'sem',premio:d.awarded?'sim':'nao',final:allFinished?'sim':'nao'};
}

function applyDrawFilters(draws){
  const groups=['sorteio','premio','final'];
  const anyActive=groups.some(g=>drawFilters[g].size>0);
  if(!anyActive)return draws;
  return draws.filter(d=>{
    const st=computeDrawState(d);
    return groups.every(g=>drawFilters[g].size===0||drawFilters[g].has(st[g]));
  });
}

function _countActiveDrawFilters(){
  return drawFilters.sorteio.size+drawFilters.premio.size+drawFilters.final.size;
}

function _refreshDrawFilterBadge(){
  const btn=document.getElementById('draws-filter-btn');
  const badge=document.getElementById('draws-filter-badge');
  if(!btn||!badge)return;
  const n=_countActiveDrawFilters();
  if(n>0){btn.classList.add('has-active');badge.style.display='';badge.textContent=n;}
  else{btn.classList.remove('has-active');badge.style.display='none';}
}

function _refreshDrawFilterPopupUI(){
  document.querySelectorAll('.draws-filter-option').forEach(el=>{
    const g=el.dataset.group,v=el.dataset.value;
    el.classList.toggle('active',drawFilters[g]?.has(v));
  });
  _refreshDrawFilterBadge();
}

let _drawFilterRegisterTimeout=null;

function toggleDrawsFilterPopup(ev){
  if(ev)ev.stopPropagation();
  const popup=document.getElementById('draws-filter-popup');
  if(!popup)return;
  const open=popup.classList.toggle('open');
  if(open){
    _refreshDrawFilterPopupUI();
    // Defer 10ms pra nao pegar o proprio click que abriu. Guardar timeout id
    // pra cancelar se popup for fechado antes do callback rodar (race).
    _drawFilterRegisterTimeout=setTimeout(()=>{
      _drawFilterRegisterTimeout=null;
      // Re-checar antes de registrar (proteção contra fechamento no meio).
      if(popup.classList.contains('open')){
        document.addEventListener('click',_drawFilterOutsideClick);
      }
    },10);
  }else{
    closeDrawsFilterPopup();
  }
}

function _drawFilterOutsideClick(ev){
  const popup=document.getElementById('draws-filter-popup');
  if(!popup)return;
  // So fecha se o clique foi FORA do popup. Permite cliques internos
  // (data-action="toggleDrawFilter" em filhos) sem fechar e sem precisar
  // bloquear propagation (que quebraria o delegate global).
  if(popup.contains(ev?.target))return;
  closeDrawsFilterPopup();
}

function closeDrawsFilterPopup(){
  const popup=document.getElementById('draws-filter-popup');
  if(popup)popup.classList.remove('open');
  if(_drawFilterRegisterTimeout!==null){
    clearTimeout(_drawFilterRegisterTimeout);
    _drawFilterRegisterTimeout=null;
  }
  document.removeEventListener('click',_drawFilterOutsideClick);
}

function toggleDrawFilter(el){
  const g=el.dataset.group,v=el.dataset.value;
  if(!drawFilters[g])return;
  if(drawFilters[g].has(v))drawFilters[g].delete(v);
  else drawFilters[g].add(v);
  _refreshDrawFilterPopupUI();
  filterDraws();
}

function clearDrawFilters(){
  drawFilters={sorteio:new Set(),premio:new Set(),final:new Set()};
  _refreshDrawFilterPopupUI();
  filterDraws();
}

function renderDraws() {
  if (!tournament) return;
  const listEl = document.getElementById('draws-list');
  const detailEl = document.getElementById('draws-detail');
  const allDraws = tournament.draws||[];
  const noT = document.getElementById('draws-no-tournament');
  const ct = document.getElementById('draws-content');
  if (!tournament) { noT.style.display='block'; ct.style.display='none'; return; }
  noT.style.display='none'; ct.style.display='block';
  _refreshDrawFilterBadge();

  const q=(document.getElementById('search-draws')?.value||'').toLowerCase();
  const filteredByText=allDraws.filter(d=>!q||d.name?.toLowerCase().includes(q));
  const draws=applyDrawFilters(filteredByText);
  const sorted=sortDraws(draws);

  if (!sorted.length) {
    const hasFilters=_countActiveDrawFilters()>0;
    const msg=q?'Nenhuma chave encontrada':hasFilters?'Nenhuma chave atende aos filtros':'Nenhuma chave criada';
    listEl.innerHTML = `<div style="padding:16px;text-align:center;color:var(--fabd-gray-500);font-size:13px">${msg}</div>`;
    detailEl.innerHTML = q
      ? '<div class="empty-state"><div class="icon">&#128269;</div><h3>Nenhuma chave encontrada</h3><p>Tente ajustar a busca para localizar uma chave.</p></div>'
      : hasFilters
        ? '<div class="empty-state"><div class="icon">&#128295;</div><h3>Nenhuma chave atende aos filtros</h3><p>Altere ou remova os filtros para ver as chaves disponíveis.</p></div>'
        : '<div class="empty-state"><div class="icon">&#127960;</div><h3>Crie uma chave</h3></div>';
    return;
  }

  let lh = '';
  sorted.forEach((d,i) => {
    const origIdx=allDraws.indexOf(d);
    const has = d.matches?.length > 0;
    const realMatches=has?(d.matches||[]).filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE'):[];
    const allFinished=realMatches.length>0&&realMatches.every(m=>m.winner!==undefined&&m.winner!==null);
    const st = d.awarded ? '<span class="tag" style="background:#D1FAE5;color:#065F46;border:1px solid #10B981">&#127942; Premiado</span>' : allFinished ? '<span class="tag" style="background:#DBEAFE;color:#1E3A8A;border:1px solid #2563EB">JOGOS FINALIZADOS</span>' : has ? '<span class="tag tag-green">Sorteado</span>' : '<span class="tag tag-yellow">Pendente</span>';
    const isActive=(selectedDrawIdx<0&&i===0)?origIdx===allDraws.indexOf(sorted[0]):origIdx===selectedDrawIdx;
    lh += `<div class="draws-list-item${isActive?' active':''}" data-idx="${origIdx}" data-action="selectDraw" data-arg-1="${origIdx}">
      <div class="draw-item-name">${esc(d.name)}</div>
      <div class="draw-item-info">${esc(d.type)} - ${d.players?.length||0} jogadores - ${has?(d.type==='Eliminatoria'?(d.players?.length||0)-1:((d.players?.length||0)*((d.players?.length||0)-1)/2)):0} jogos ${st}</div>
    </div>`;
  });
  listEl.innerHTML = lh;
  const safeIdx=selectedDrawIdx>=0&&selectedDrawIdx<allDraws.length?selectedDrawIdx:(sorted.length>0?allDraws.indexOf(sorted[0]):0);
  if(safeIdx>=0)selectDraw(safeIdx);
}

function filterDraws(){
  // Coalesce via rAF (sem defer-when-typing — o input search-draws É a fonte do filtro)
  scheduleRender('draws', renderDraws, { deferWhenTyping: false });
}

function selectDraw(idx) {
  selectedDrawIdx = idx;
  document.querySelectorAll('.draws-list-item').forEach(el=>el.classList.toggle('active',parseInt(el.dataset.idx)===idx));
  renderDrawDetail(idx);
}

function renderDrawDetail(idx) {
  const draws = tournament.draws||[];
  const detailEl = document.getElementById('draws-detail');
  if (idx<0||idx>=draws.length) { detailEl.innerHTML='<div class="empty-state"><h3>Selecione uma chave</h3></div>'; return; }
  const d = draws[idx];
  const has = d.matches?.length > 0;
  const evNames = {SM:'Simples Masculino',SF:'Simples Feminino',DM:'Duplas Masculinas',DF:'Duplas Femininas',DX:'Duplas Mistas'};

  let h = `<div class="card-header"><h3>${esc(d.name)}</h3><div>
    <button class="btn btn-sm btn-success" data-action="generateSingleDraw" data-arg-1="${idx}">&#127922; Sortear esta chave</button>
    ${has?`<button class="btn btn-sm" style="background:#EFF6FF;color:#1E40AF;border:1px solid #3B82F6" data-action="regenerateDrawSchedule" data-arg-1="${idx}">&#128260; Regenerar agenda</button>`:''}
    ${has?`<button class="btn btn-sm" style="background:${d.awarded?'#D1FAE5;color:#065F46;border:1px solid #10B981':'#FEF3C7;color:#92400E;border:1px solid #F59E0B'}" data-action="toggleAwarded" data-arg-1="${idx}">${d.awarded?'&#10003; Premiado':'&#127942; Premiar'}</button>`:''}
    <button class="btn btn-sm btn-danger" data-action="deleteDraw" data-arg-1="${idx}">Excluir</button>
  </div></div>
  <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <div><span style="font-size:12px;color:var(--fabd-gray-500)">Evento:</span> <span class="tag tag-blue">${esc(evNames[d.event]||d.event)}</span></div>
    <div><span style="font-size:12px;color:var(--fabd-gray-500)">Tipo:</span> <span class="tag tag-gray">${esc(d.type)}</span></div>
    <div><span style="font-size:12px;color:var(--fabd-gray-500)">Jogadores:</span> <strong>${d.players?.length||0}</strong></div>
    ${d.type==='Grupos + Eliminatoria'?`
      <div style="display:flex;gap:12px;align-items:center;padding:6px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--fabd-gray-600)" title="${has?'Re-sorteie a chave para aplicar mudancas':'Quantidade de grupos'}">
          <span>Grupos:</span>
          <input type="number" min="1" max="8" value="${d.numGroups||2}" ${has?'disabled':''} data-action="updateDrawNumGroups" data-event="change" data-arg-1="${idx}" data-arg-2="$value" style="width:54px;padding:4px 6px;border:1px solid #CBD5E1;border-radius:6px;text-align:center;font-weight:700;${has?'background:#F1F5F9;cursor:not-allowed':''}">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--fabd-gray-600)" title="${has?'Re-sorteie a chave para aplicar mudancas':'Quantos se classificam por grupo para a eliminatoria'}">
          <span>Classificados/grupo:</span>
          <input type="number" min="1" max="4" value="${d.groupQualifiers||2}" ${has?'disabled':''} data-action="updateDrawQualifiers" data-event="change" data-arg-1="${idx}" data-arg-2="$value" style="width:54px;padding:4px 6px;border:1px solid #CBD5E1;border-radius:6px;text-align:center;font-weight:700;${has?'background:#F1F5F9;cursor:not-allowed':''}">
        </label>
        ${has?'<span style="font-size:11px;color:#D97706">(re-sorteie para mudar)</span>':''}
      </div>
    `:''}
  </div>`;

  if (has && d.type==='Eliminatoria') h += renderBracket(d);
  else if (has && d.type==='Grupos + Eliminatoria') {
    // Try to propagate groups to elimination if ready
    if (d.groupsData && areGroupsFinished(d) && !d.groupsData.eliminationGenerated) {
      propagateGroupsToElimination(d);
      // Adicionar matches de eliminatoria diretamente na lista (sync, sem esperar async)
      const elimM = d.groupsData.eliminationMatches || [];
      let groupMatchCount = 0;
      (d.groupsData.groups||[]).forEach(g=>{g.matches.forEach(m=>{if(m.player1&&m.player2&&m.player1!=='BYE'&&m.player2!=='BYE')groupMatchCount++;});});
      const lastNum = Math.max(0,...(tournament.matches||[]).map(m=>m.num||0));
      const totalR = elimM.length ? Math.max(...elimM.map(x=>x.round)) : 1;
      elimM.forEach((em, emIdx) => {
        if (em.player2 === 'BYE' || em.player1 === 'BYE') return;
        const def = !!(em.player1 && em.player2);
        const rn = em.round === totalR ? 'Final' : em.round === totalR - 1 ? 'Semifinal' : 'Quartas';
        // Verificar se ja existe
        const exists = tournament.matches.find(m => m.drawName === d.name && m.phase === 'elimination' && m.drawMatchIdx === groupMatchCount + emIdx);
        if (exists) {
          // Atualizar jogadores se necessario
          if (em.player1 && !exists.player1) { exists.player1 = em.player1; exists.player1Display = em.player1; }
          if (em.player2 && !exists.player2) { exists.player2 = em.player2; exists.player2Display = em.player2; }
          if (exists.player1 && exists.player2 && exists.status === 'A definir') { exists.isDefinida = true; exists.status = 'Pendente'; }
          return;
        }
        tournament.matches.push({
          drawId: d.id, drawName: d.name, event: d.event, round: em.round, roundName: rn,
          drawMatchIdx: groupMatchCount + emIdx, player1: em.player1||'', player2: em.player2||'',
          player1Display: em.player1||'A definir', player2Display: em.player2||'A definir',
          isDefinida: def, score: '', court: '', time: '', umpire: '',
          status: def ? 'Pendente' : 'A definir', phase: 'elimination',
          id: String(lastNum+1+emIdx), num: lastNum+1+emIdx
        });
      });
      window.api.saveTournament(tournament);
      prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    }
    h += renderGroupsElimination(d);
  }
  else if (has) h += renderRoundRobin(d);
  else {
    // Lista de jogadores com opcao de definir cabecas de chave
    const seedList=d.seeds_list||[];
    const maxSeeds=Math.min(Math.floor((d.players||[]).length/2),8);
    h += `<div style="background:var(--fabd-gray-100);border-radius:8px;padding:24px">
      <h3 style="color:var(--fabd-gray-600);margin-bottom:16px">Definir Cabecas de Chave</h3>
      <p style="color:var(--fabd-gray-500);font-size:13px;margin-bottom:12px">Selecione os jogadores cabeca de chave na ordem (1o seed, 2o seed, etc). Eles serao posicionados estrategicamente no bracket.</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <h4 style="margin-bottom:8px;font-size:13px;color:var(--fabd-gray-600)">Cabecas de Chave</h4>
          <div id="seeds-container" style="margin-bottom:12px">`;
    for(let s=0;s<maxSeeds;s++){
      const current=seedList[s]||'';
      h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-weight:700;color:var(--fabd-blue);min-width:24px">${s+1}.</span>
        <select class="form-control" style="flex:1;padding:4px 8px;font-size:12px" data-action="updateSeed" data-event="change" data-arg-1="${idx}" data-arg-2="${s}" data-arg-3="$value">
          <option value="">- Selecionar -</option>`;
      (d.players||[]).forEach(p=>{
        const used=seedList.includes(p)&&seedList[s]!==p;
        h+=`<option value="${esc(p)}"${current===p?' selected':''}${used?' disabled':''}>${esc(p)}</option>`;
      });
      h+=`</select></div>`;
    }
    h+=`</div></div>
        <div style="flex:1;min-width:200px">
          <h4 style="margin-bottom:8px;font-size:13px;color:var(--fabd-gray-600)">Jogadores (${(d.players||[]).length})</h4>
          <div style="font-size:13px;color:var(--fabd-gray-700)">`;
    (d.players||[]).forEach(p=>{
      const seedNum=seedList.indexOf(p);
      h+=`<div style="padding:4px 0;${seedNum>=0?'font-weight:700;color:var(--fabd-blue)':''}">${seedNum>=0?`[${seedNum+1}] `:''}${esc(p)}</div>`;
    });
    h+=`</div></div></div>
      <div style="margin-top:16px;text-align:center">
        <button class="btn btn-success" data-action="generateSingleDraw" data-arg-1="${idx}">&#127922; Sortear Agora</button>
      </div>
    </div>`;
  }

  // Ranking section (shown only when ALL matches of this draw are finished)
  let allDrawMatchesFinished;
  if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
    // For groups+elim, all finished = elimination phase exists and is complete
    const elimM=d.groupsData.eliminationMatches||[];
    const realElim=elimM.filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE');
    allDrawMatchesFinished=has&&elimM.length>0&&realElim.every(m=>m.winner!==undefined&&m.winner!==null);
  } else {
    allDrawMatchesFinished=has&&d.matches.filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE').every(m=>m.winner!==undefined&&m.winner!==null);
  }
  if(has&&allDrawMatchesFinished){
    const ranking=computeDrawRanking(d);
    if(ranking&&ranking.length){
      h+=`<div style="margin-top:24px;background:linear-gradient(135deg,#FEF3C7 0%,#FFFBEB 100%);border-radius:12px;padding:20px;border:2px solid #F59E0B">
        <h3 style="color:#92400E;margin-bottom:16px;display:flex;align-items:center;gap:8px"><span style="font-size:20px">&#127942;</span> Ranking / Premiacao</h3>`;
      if(d.type==='Eliminatoria'||d.type==='Grupos + Eliminatoria'){
        ranking.forEach(r=>{
          const medal=r.pos===1?'\uD83E\uDD47':r.pos===2?'\uD83E\uDD48':'\uD83E\uDD49';
          const label=r.pos===1?'1o Lugar - Ouro':r.pos===2?'2o Lugar - Prata':'3o Lugar - Bronze';
          const bg=r.pos===1?'#FEF3C7':r.pos===2?'#F3F4F6':'#FED7AA';
          const color=r.pos===1?'#D97706':r.pos===2?'#6B7280':'#92400E';
          h+=`<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:${bg};border-radius:8px;margin-bottom:8px;border-left:4px solid ${color}">
            <span style="font-size:28px">${medal}</span>
            <div><div style="font-size:11px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
            <div style="font-size:16px;font-weight:700;color:#1a1a1a">${esc(r.name)}</div></div></div>`;
        });
      } else {
        h+='<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#1E3A8A"><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Pos.</th><th style="color:white;padding:6px 10px;text-align:left;font-size:11px">Jogador</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">V</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">D</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Pts+</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Pts-</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Diff</th></tr></thead><tbody>';
        ranking.forEach((r,i)=>{
          const medal=r.pos===1?'\uD83E\uDD47':r.pos===2?'\uD83E\uDD48':r.pos===3?'\uD83E\uDD49':'';
          const bg=i%2===0?'#fff':'#f8f9fa';
          const fw=r.pos<=3?'700':'400';
          const color=r.pos===1?'#D97706':r.pos===2?'#6B7280':r.pos===3?'#92400E':'#1a1a1a';
          h+=`<tr style="background:${bg}"><td style="text-align:center;padding:6px 10px;font-weight:${fw};color:${color}">${medal} ${i+1}o</td><td style="padding:6px 10px;font-weight:${fw}">${esc(r.name)}</td><td style="text-align:center;padding:6px 10px">${r.wins}</td><td style="text-align:center;padding:6px 10px">${r.losses}</td><td style="text-align:center;padding:6px 10px">${r.ptsFor}</td><td style="text-align:center;padding:6px 10px">${r.ptsAgainst}</td><td style="text-align:center;padding:6px 10px;font-weight:700;color:${r.ptsDiff>0?'#059669':r.ptsDiff<0?'#DC2626':'#666'}">${r.ptsDiff>0?'+':''}${r.ptsDiff}</td></tr>`;
        });
        h+='</tbody></table>';
      }
      h+='</div>';
    }
  }

  detailEl.innerHTML = h;
}

