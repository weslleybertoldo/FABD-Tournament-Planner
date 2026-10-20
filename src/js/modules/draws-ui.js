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

// Etiqueta da chave na lista (layout novo, W20 parte 6). Mesmas regras do
// filtro (computeDrawState) + "Ao vivo" (jogo da chave em quadra) e "Em
// andamento" (já tem resultado), lidos dos jogos de sempre.
function drawSituation(d, matches){
  const st=computeDrawState(d);
  if(st.premio==='sim')return{kind:'awarded',label:'Premiada'};
  if(st.final==='sim')return{kind:'done',label:'Finalizada'};
  if((matches||[]).some(m=>m.drawName===d.name&&m.status==='Em Quadra'))return{kind:'live',label:'Ao vivo'};
  const real=(d.matches||[]).filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE');
  if(real.some(m=>m.winner!==undefined&&m.winner!==null))return{kind:'run',label:'Em andamento'};
  if(st.sorteio==='sim')return{kind:'sched',label:'Sorteada'};
  return{kind:'draft',label:'Pendente'};
}

function drawTypeLabel(t){
  return {'Eliminatoria':'Eliminatória','Grupos + Eliminatoria':'Grupos + Eliminatória'}[t]||t||'-';
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

  const sum=document.getElementById('draws-summary');
  if(sum){
    const sits=allDraws.map(d=>drawSituation(d,tournament.matches).kind);
    sum.textContent=allDraws.length?`${allDraws.length} chaves · ${sits.filter(k=>k!=='draft').length} sorteadas · ${sits.filter(k=>k==='done'||k==='awarded').length} finalizadas`:'';
  }

  if (!sorted.length) {
    const hasFilters=_countActiveDrawFilters()>0;
    const msg=q?'Nenhuma chave encontrada':hasFilters?'Nenhuma chave atende aos filtros':'Nenhuma chave criada';
    listEl.innerHTML = `<div class="dl-empty">${msg}</div>`;
    detailEl.innerHTML = q
      ? `<div class="empty-state">${icon('search','i es-ic')}<h3>Nenhuma chave encontrada</h3><p>Tente ajustar a busca para localizar uma chave.</p></div>`
      : hasFilters
        ? `<div class="empty-state">${icon('funnel','i es-ic')}<h3>Nenhuma chave atende aos filtros</h3><p>Altere ou remova os filtros para ver as chaves disponíveis.</p></div>`
        : `<div class="empty-state">${icon('chave','i es-ic')}<h3>Crie uma chave</h3></div>`;
    return;
  }

  let lh = '';
  sorted.forEach((d,i) => {
    const origIdx=allDraws.indexOf(d);
    const has = d.matches?.length > 0;
    const sit = drawSituation(d, tournament.matches);
    const isActive=(selectedDrawIdx<0&&i===0)?origIdx===allDraws.indexOf(sorted[0]):origIdx===selectedDrawIdx;
    lh += `<div class="draws-list-item${isActive?' active':''}" data-idx="${origIdx}" data-action="selectDraw" data-arg-1="${origIdx}">
      <div class="dl-top"><div class="draw-item-name">${esc(d.name)}</div><span class="pill is-${sit.kind}"><s></s>${sit.label}</span></div>
      <div class="draw-item-info">${esc(drawTypeLabel(d.type))} · ${d.players?.length||0} jogadores · ${has?(d.type==='Eliminatoria'?(d.players?.length||0)-1:((d.players?.length||0)*((d.players?.length||0)-1)/2)):0} jogos</div>
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

  const nJog = d.players?.length||0;
  let h = `<div class="dd-head"><div class="dd-tt"><h2>${esc(d.name)}</h2><p>${esc(evNames[d.event]||d.event)} · ${esc(drawTypeLabel(d.type))} · ${nJog} jogadores</p></div><div class="dd-actions">
    <button class="btn btn-sm btn-primary" data-action="generateSingleDraw" data-arg-1="${idx}">${icon('shuffle')}Sortear esta chave</button>
    ${has?`<button class="btn btn-sm btn-secondary" data-action="regenerateDrawSchedule" data-arg-1="${idx}">${icon('clock')}Regenerar agenda</button>`:''}
    ${has?`<button class="btn btn-sm btn-secondary${d.awarded?' is-ok':''}" data-action="toggleAwarded" data-arg-1="${idx}">${icon(d.awarded?'check':'award')}${d.awarded?'Premiado':'Premiar'}</button>`:''}
    <button class="btn btn-sm btn-secondary is-danger" data-action="deleteDraw" data-arg-1="${idx}">${icon('trash-2')}Excluir</button>
  </div></div>
  ${d.type==='Grupos + Eliminatoria'?`<div class="dd-cfg">
    <label title="${has?'Re-sorteie a chave para aplicar mudancas':'Quantidade de grupos'}"><span>Grupos</span>
      <input class="inp-mini" type="number" min="1" max="8" value="${d.numGroups||2}" ${has?'disabled':''} data-action="updateDrawNumGroups" data-event="change" data-arg-1="${idx}" data-arg-2="$value"></label>
    <label title="${has?'Re-sorteie a chave para aplicar mudancas':'Quantos se classificam por grupo para a eliminatoria'}"><span>Classificados por grupo</span>
      <input class="inp-mini" type="number" min="1" max="4" value="${d.groupQualifiers||2}" ${has?'disabled':''} data-action="updateDrawQualifiers" data-event="change" data-arg-1="${idx}" data-arg-2="$value"></label>
    ${has?'<em>re-sorteie para mudar</em>':''}
  </div>`:''}
  <div class="dd-body">`;
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
    h += `<div class="seed-box">
      <h3>Definir cabeças de chave</h3>
      <p>Selecione os jogadores cabeça de chave na ordem (1º, 2º, etc.). Eles serão posicionados estrategicamente na chave.</p>
      <div class="seed-cols">
        <div>
          <h4>Cabeças de chave</h4>
          <div id="seeds-container">`;
    for(let s=0;s<maxSeeds;s++){
      const current=seedList[s]||'';
      h+=`<div class="seed-row">
        <span class="seed-n">${s+1}.</span>
        <select class="sel-mini" data-action="updateSeed" data-event="change" data-arg-1="${idx}" data-arg-2="${s}" data-arg-3="$value">
          <option value="">- Selecionar -</option>`;
      (d.players||[]).forEach(p=>{
        const used=seedList.includes(p)&&seedList[s]!==p;
        h+=`<option value="${esc(p)}"${current===p?' selected':''}${used?' disabled':''}>${esc(p)}</option>`;
      });
      h+=`</select></div>`;
    }
    h+=`</div></div>
        <div>
          <h4>Jogadores (${(d.players||[]).length})</h4>
          <div class="seed-list">`;
    (d.players||[]).forEach(p=>{
      const seedNum=seedList.indexOf(p);
      h+=`<div${seedNum>=0?' class="is-seed"':''}>${seedNum>=0?`[${seedNum+1}] `:''}${esc(p)}</div>`;
    });
    h+=`</div></div></div>
      <div class="seed-go">
        <button class="btn btn-primary" data-action="generateSingleDraw" data-arg-1="${idx}">${icon('shuffle')}Sortear agora</button>
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
      h+=`<div class="rk"><div class="rk-title">${icon('trophy')}Ranking / Premiação</div>`;
      if(d.type==='Eliminatoria'||d.type==='Grupos + Eliminatoria'){
        ranking.forEach(r=>{
          const label=r.pos===1?'1º lugar · Ouro':r.pos===2?'2º lugar · Prata':'3º lugar · Bronze';
          h+=`<div class="rk-row is-p${Math.min(r.pos,3)}"><span class="rk-pos">${r.pos}º</span><div><small>${label}</small><b>${esc(r.name)}</b></div></div>`;
        });
      } else {
        h+='<div class="table-container"><table class="tbl-mini"><thead><tr><th class="c">Pos.</th><th>Jogador</th><th class="c">V</th><th class="c">D</th><th class="c">Pts+</th><th class="c">Pts-</th><th class="c">Saldo</th></tr></thead><tbody>';
        ranking.forEach((r,i)=>{
          h+=`<tr${r.pos<=3?` class="is-p${r.pos}"`:''}><td class="c pos">${i+1}º</td><td class="nm">${esc(r.name)}</td><td class="c">${r.wins}</td><td class="c">${r.losses}</td><td class="c">${r.ptsFor}</td><td class="c">${r.ptsAgainst}</td><td class="c diff${r.ptsDiff>0?' is-pos':r.ptsDiff<0?' is-neg':''}">${r.ptsDiff>0?'+':''}${r.ptsDiff}</td></tr>`;
        });
        h+='</tbody></table></div>';
      }
      h+='</div>';
    }
  }

  detailEl.innerHTML = h + '</div>';
}

