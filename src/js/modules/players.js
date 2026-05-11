// =====================================================================
// Players — CRUD da aba "Jogadores". Renderiza lista, modal de novo
// jogador, edicao, inscricoes (categorias), exclusao. Toca o global
// `players` e `tournament.players`; usa `showToast`/`openModal`/`esc`
// que continuam em app.js.
// NAO inclui sync* (entries/draws) — esses tocam estado complexo do
// torneio e ficam em 14.F/G.
// Issue #14 sub-tarefa 14.E — auditoria 2026-05-09.
// =====================================================================

function renderPlayers() {
  const tb = document.getElementById('players-table-body');
  const em = document.getElementById('players-empty');
  if (!tournament) { tb.innerHTML=''; em.style.display='block'; em.querySelector('h3').textContent='Nenhum torneio ativo'; return; }
  if (!players.length) { tb.innerHTML=''; em.style.display='block'; return; }
  em.style.display = 'none';
  let h = '';
  players.forEach(p => {
    const autoCat = calculateCategory(p.dob);
    const inscriptions = (p.inscriptions||[]).length;
    const hasConflict = checkCategoryConflict(p.dob, p.inscriptions);
    const aloneKeys = checkAloneInCategory(p.inscriptions);
    const hasAlone = aloneKeys.length > 0;
    const duplaSemParceiroKeys = checkDuplaSemParceiro(p.inscriptions);
    const hasDuplaSemParceiro = duplaSemParceiroKeys.length > 0;
    const nameStyle = hasConflict ? 'color:#DC2626' : (hasAlone || hasDuplaSemParceiro) ? 'color:#D97706' : '';
    const conflictIcon = hasConflict ? '<span title="Atleta inscrito em categoria incompativel com a idade" style="color:#DC2626;cursor:help;margin-left:4px">&#9888;</span>' : '';
    const aloneIcon = hasAlone ? '<span title="Sozinho em: '+aloneKeys.join(', ')+' (precisa de mais inscritos)" style="color:#D97706;cursor:help;margin-left:4px">&#9888;</span>' : '';
    const duplaIcon = hasDuplaSemParceiro ? '<span title="Dupla sem parceiro: '+duplaSemParceiroKeys.join(', ')+'" style="color:#D97706;cursor:help;margin-left:4px">&#9888;</span>' : '';
    const subLine = [];
    if(hasAlone) subLine.push('Sozinho: '+aloneKeys.map(k=>'<strong>'+esc(k)+'</strong>').join(', '));
    if(hasDuplaSemParceiro) subLine.push('Sem dupla: '+duplaSemParceiroKeys.map(k=>'<strong>'+esc(k)+'</strong>').join(', '));
    h += `<tr>
      <td><strong style="${nameStyle}">${esc(p.firstName)} ${esc(p.lastName)}${conflictIcon}${aloneIcon}${duplaIcon}</strong>${subLine.length?'<div style="font-size:10px;color:#D97706;margin-top:2px">'+subLine.join(' | ')+'</div>':''}</td>
      <td>${p.gender==='M'?'Masc':p.gender==='F'?'Fem':'-'}</td>
      <td>${fmtDate(p.dob)}</td>
      <td><span class="tag tag-blue">${esc(autoCat)}</span></td>
      <td>${esc(p.club)||'-'}</td>
      <td>${esc(p.state)||'-'}</td>
      <td>${inscriptions > 0 ? `<span class="tag tag-green">${inscriptions} cat.</span>` : '<span class="tag tag-gray">0</span>'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" data-action="editPlayer" data-arg-1="${esc(p.id)}">Editar</button>
        <button class="btn btn-sm btn-danger" data-action="deletePlayer" data-arg-1="${esc(p.id)}">Excluir</button>
      </td></tr>`;
  });
  tb.innerHTML = h;
}

function showNewPlayerModal() {
  if (!tournament) { showToast('Crie um torneio primeiro', 'warning'); return; }
  editingPlayerId = null;
  ['p-firstname','p-lastname','p-dob','p-club','p-phone','p-email','p-ranking'].forEach(id=>{ const e=document.getElementById(id); if(e){e.value='';e.classList.remove('error','valid');} });
  document.getElementById('p-gender').value = '';
  document.getElementById('p-state').value = 'AL';
  document.getElementById('p-autocat').textContent = '-';
  document.getElementById('modal-player-title').textContent = 'Novo Jogador';
  // Sempre abrir na aba Dados (categorias renderizadas sob demanda ao clicar na aba)
  document.querySelectorAll('#player-tabs .tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('p-tab-dados').style.display='';
  document.getElementById('p-tab-categorias').style.display='none';
  document.getElementById('p-tab-inscricao').style.display='none';
  document.getElementById('p-categories-list').innerHTML='';
  document.getElementById('p-valor-categoria').value=30;
  document.getElementById('p-pagamento-status').value='pago';
  openModal('modal-player');
  requestAnimationFrame(()=>document.getElementById('p-firstname')?.focus());
}

function editPlayer(id) {
  const p = players.find(x=>x.id===id);
  if (!p) return;
  editingPlayerId = p.id;
  document.getElementById('p-firstname').value = p.firstName||'';
  document.getElementById('p-lastname').value = p.lastName||'';
  document.getElementById('p-gender').value = p.gender||'';
  document.getElementById('p-dob').value = p.dob||'';
  document.getElementById('p-club').value = p.club||'';
  document.getElementById('p-state').value = p.state||'';
  document.getElementById('p-ranking').value = p.ranking||'';
  document.getElementById('p-phone').value = p.phone||'';
  document.getElementById('p-email').value = p.email||'';
  document.getElementById('p-autocat').textContent = calculateCategory(p.dob);
  document.getElementById('modal-player-title').textContent = 'Editar Jogador';
  // Sempre abrir na aba Dados e limpar categorias antigas
  document.querySelectorAll('#player-tabs .tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('p-tab-dados').style.display='';
  document.getElementById('p-tab-categorias').style.display='none';
  document.getElementById('p-tab-inscricao').style.display='none';
  document.getElementById('p-categories-list').innerHTML='';
  document.getElementById('p-valor-categoria').value=p.valorCategoria||30;
  document.getElementById('p-pagamento-status').value=p.pagamentoStatus||'pago';
  openModal('modal-player');
}

// Renderiza aba de categorias no modal do jogador
function renderPlayerCategories(player) {
  const container = document.getElementById('p-categories-list');
  if (!container) return;
  const inscriptions = player?.inscriptions || [];
  const gender = document.getElementById('p-gender')?.value || player?.gender || '';

  const buildPartnerOpts=(playerId,g,modCode,catKey,selected)=>{
    let opts='';
    players.forEach(p=>{
      if(p.id===playerId)return;
      if(modCode==='DM'&&p.gender!=='M')return;
      if(modCode==='DF'&&p.gender!=='F')return;
      const jaTemDupla=(p.inscriptions||[]).some(i=>i.key===catKey&&i.partner&&i.partner!==playerId);
      if(jaTemDupla)return;
      const name=`${p.firstName} ${p.lastName}`;
      const isSel=String(selected)===String(p.id);
      opts+=`<option value="${p.id}"${isSel?' selected':''}>${esc(name)}</option>`;
    });
    return opts;
  };

  const items=[];
  CATEGORIES.forEach(cat=>{
    MODALITIES.forEach(mod=>{
      if((mod.code==='SM'||mod.code==='DM')&&gender==='F')return;
      if((mod.code==='SF'||mod.code==='DF')&&gender==='M')return;
      items.push({mod,cat,key:`${mod.code} ${cat}`});
    });
  });

  let h='';
  items.forEach(({mod,cat,key})=>{
    const insc=inscriptions.find(i=>i.key===key);
    const checked=!!insc;
    h+=`<div class="cat-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--fabd-gray-200)">
      <input type="checkbox" class="p-cat-check" data-key="${esc(key)}" data-mod="${mod.code}" data-cat="${esc(cat)}" ${checked?'checked':''} data-action="onCatCheckChange" data-event="change" data-arg-1="$el">
      <span style="flex:1;font-size:13px"><strong>${mod.code}</strong> ${esc(cat)}</span>
      <span class="tag tag-gray" style="font-size:10px">Inscrito</span>`;
    if(mod.isDupla&&checked){
      h+=`<select class="form-control p-partner-select" data-key="${esc(key)}" style="width:160px;padding:2px 4px;font-size:11px">
        <option value="">Selecionar dupla...</option>
        ${buildPartnerOpts(player?.id,gender,mod.code,key,insc?.partner||'')}
      </select>`;
      if(!insc?.partner){
        h+=`<span style="color:#D97706;font-size:10px;font-weight:500;white-space:nowrap">Atleta sem ${mod.code} marcada</span>`;
      }
    }
    h+='</div>';
  });
  container.innerHTML=h;
}

function onCatCheckChange(checkbox) {
  // Re-renderizar para mostrar/esconder campo de dupla
  // Coletar estado atual antes
  const currentInscriptions = collectInscriptions();
  const player = editingPlayerId ? players.find(p=>p.id===editingPlayerId) : null;
  const tempPlayer = player ? {...player, inscriptions: currentInscriptions} : {inscriptions: currentInscriptions, gender: document.getElementById('p-gender').value};
  renderPlayerCategories(tempPlayer);
}

function collectInscriptions() {
  const inscriptions = [];
  document.querySelectorAll('.p-cat-check:checked').forEach(cb => {
    const key = cb.dataset.key;
    const mod = cb.dataset.mod;
    const cat = cb.dataset.cat;
    let partner = '';
    const partnerSelect = document.querySelector(`.p-partner-select[data-key="${key}"]`);
    if (partnerSelect) partner = partnerSelect.value;
    inscriptions.push({ key, mod, cat, partner });
  });
  return inscriptions;
}

function setPlayerTab(el, panelId) {
  document.querySelectorAll('#player-tabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('p-tab-dados').style.display = panelId==='p-tab-dados' ? '' : 'none';
  document.getElementById('p-tab-categorias').style.display = panelId==='p-tab-categorias' ? '' : 'none';
  document.getElementById('p-tab-inscricao').style.display = panelId==='p-tab-inscricao' ? '' : 'none';
  if (panelId === 'p-tab-categorias') {
    const p = editingPlayerId ? players.find(x=>x.id===editingPlayerId) : null;
    const hasCheckboxes = document.querySelectorAll('.p-cat-check').length > 0;
    const currentInscs = hasCheckboxes ? collectInscriptions() : (p?.inscriptions || []);
    renderPlayerCategories(p ? {...p, inscriptions: currentInscs} : {inscriptions: currentInscs, gender: document.getElementById('p-gender').value, dob: document.getElementById('p-dob').value});
  }
  if (panelId === 'p-tab-inscricao') renderInscricaoTab();
}

function renderInscricaoTab(){
  const p=editingPlayerId?players.find(x=>x.id===editingPlayerId):null;
  const inscs=p?.inscriptions||[];
  const valorCat=p?.valorCategoria||30;
  const pagStatus=p?.pagamentoStatus||'pago';
  document.getElementById('p-valor-categoria').value=valorCat;
  document.getElementById('p-pagamento-status').value=pagStatus;
  const container=document.getElementById('p-inscricao-resumo');
  const catCount=inscs.length;
  const total=catCount*valorCat;
  let h=`<h4 style="margin-bottom:12px;color:var(--fabd-blue)">Resumo de Inscricao</h4>`;
  if(catCount){
    h+=`<table style="width:100%;border-collapse:collapse;font-size:13px">`;
    h+=`<thead><tr style="background:var(--fabd-gray-200)"><th style="padding:6px 10px;text-align:left">Categoria</th><th style="padding:6px 10px;text-align:right">Valor</th></tr></thead><tbody>`;
    inscs.forEach(i=>{h+=`<tr><td style="padding:6px 10px">${esc(i.key)}</td><td style="padding:6px 10px;text-align:right">R$ ${valorCat.toFixed(2)}</td></tr>`;});
    h+=`<tr style="background:var(--fabd-gray-200);font-weight:700"><td style="padding:8px 10px">Total (${catCount} categoria${catCount>1?'s':''})</td><td style="padding:8px 10px;text-align:right;color:var(--fabd-blue);font-size:16px">R$ ${total.toFixed(2)}</td></tr>`;
    h+=`</tbody></table>`;
  } else {
    h+=`<p style="color:var(--fabd-gray-500)">Nenhuma categoria inscrita.</p>`;
  }
  const stColors={pendente:'#F59E0B',pago:'#10B981',isento:'#6B7280'};
  const stLabels={pendente:'Pendente',pago:'Pago',isento:'Isento'};
  h+=`<div style="margin-top:12px;padding:10px;background:${stColors[pagStatus]}22;border-radius:8px;border-left:4px solid ${stColors[pagStatus]}"><span style="font-weight:700;color:${stColors[pagStatus]}">${stLabels[pagStatus]}</span></div>`;
  container.innerHTML=h;
}

function onGenderChange() {
  // Re-renderizar categorias quando muda genero
  const p = editingPlayerId ? players.find(x=>x.id===editingPlayerId) : null;
  renderPlayerCategories(p || {gender: document.getElementById('p-gender').value, inscriptions: []});
}

function onDobChange() {
  const dob = document.getElementById('p-dob').value;
  document.getElementById('p-autocat').textContent = calculateCategory(dob);
}

async function savePlayer() {
  try {
    if (!validateForm(['p-firstname','p-lastname','p-gender'])) return;
    // Se aba Categorias nunca foi aberta, preservar inscricoes originais
    const hasCheckboxes = document.querySelectorAll('.p-cat-check').length > 0;
    const inscriptions = hasCheckboxes ? collectInscriptions() : (editingPlayerId ? (players.find(x=>x.id===editingPlayerId)?.inscriptions || []) : []);

    const trimmedFirst = gv('p-firstname').trim();
    const trimmedLast = gv('p-lastname').trim();
    if (!trimmedFirst && !trimmedLast) { showToast('Nome e sobrenome nao podem estar ambos vazios', 'warning'); return; }

    const p = {
      firstName: trimmedFirst, lastName: trimmedLast, gender: gv('p-gender'),
      dob: gv('p-dob'), club: gv('p-club'), state: gv('p-state'),
      category: calculateCategory(gv('p-dob')),
      ranking: gv('p-ranking'), phone: gv('p-phone'), email: gv('p-email'),
      valorCategoria: parseInt(document.getElementById('p-valor-categoria')?.value)||30,
      pagamentoStatus: document.getElementById('p-pagamento-status')?.value||'pago',
      inscriptions
    };
    if (editingPlayerId) p.id = editingPlayerId;

    // Se editando, verificar se o nome mudou e propagar
    if (editingPlayerId) {
      const oldPlayer = players.find(x=>x.id===editingPlayerId);
      if (oldPlayer) {
        const oldName = `${oldPlayer.firstName} ${oldPlayer.lastName}`.trim();
        const newName = `${p.firstName} ${p.lastName}`.trim();
        if (oldName !== newName && oldName) {
          // Bloquear rename se jogador tem jogo Em Quadra
          const inCourt = (tournament.matches||[]).some(m =>
            m.status === 'Em Quadra' && (
              (m.player1 && m.player1.includes(oldName)) ||
              (m.player2 && m.player2.includes(oldName))
            )
          );
          if (inCourt) {
            showToast('Nao pode renomear jogador com jogo em quadra. Tire o jogo da quadra primeiro.');
            return;
          }
          // Atualizar em entries
          (tournament.entries||[]).forEach(e=>{
            if(e.playerName===oldName)e.playerName=newName;
          });
          // Atualizar em matches (player1, player2, player1Display, player2Display)
          (tournament.matches||[]).forEach(m=>{
            if(m.player1===oldName){m.player1=newName;m.player1Display=newName;}
            if(m.player2===oldName){m.player2=newName;m.player2Display=newName;}
            // Duplas: nome pode estar dentro de "Jogador A / Jogador B"
            if(m.player1&&m.player1.includes('/')&&m.player1.includes(oldName)){
              m.player1=m.player1.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              m.player1Display=m.player1;
            }
            if(m.player2&&m.player2.includes('/')&&m.player2.includes(oldName)){
              m.player2=m.player2.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              m.player2Display=m.player2;
            }
          });
          // Atualizar em draws (players array e matches)
          (tournament.draws||[]).forEach(d=>{
            if(d.players){d.players=d.players.map(n=>n===oldName?newName:n.includes('/')&&n.includes(oldName)?n.split('/').map(x=>x.trim()===oldName?newName:x.trim()).join(' / '):n);}
            (d.matches||[]).forEach(m=>{
              if(m.player1===oldName)m.player1=newName;
              if(m.player2===oldName)m.player2=newName;
              if(m.advancer===oldName)m.advancer=newName;
              if(m.player1&&m.player1.includes('/')&&m.player1.includes(oldName))m.player1=m.player1.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              if(m.player2&&m.player2.includes('/')&&m.player2.includes(oldName))m.player2=m.player2.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              if(m.advancer&&m.advancer.includes('/')&&m.advancer.includes(oldName))m.advancer=m.advancer.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
            });
          });
          await window.api.saveTournament(tournament);
        }
      }
    }

    const savedPlayer = await window.api.savePlayer(p);
    if (savedPlayer?.id) p.id = savedPlayer.id;

    // Sincronizar duplas bidirecional
    const myId = p.id || editingPlayerId;
    const duplaKeys = new Set(inscriptions.filter(i=>['DM','DF','DX'].includes(i.mod)).map(i=>i.key));

    for (const insc of inscriptions) {
      if (!['DM','DF','DX'].includes(insc.mod)) continue;
      if (insc.partner) {
        // A tem dupla B: marcar em B tambem
        const partner = players.find(x => x.id === insc.partner);
        if (partner) {
          if (!partner.inscriptions) partner.inscriptions = [];
          const existing = partner.inscriptions.find(i => i.key === insc.key);
          if (!existing) {
            partner.inscriptions.push({ key: insc.key, mod: insc.mod, cat: insc.cat, partner: myId });
          } else {
            existing.partner = myId;
          }
          await window.api.savePlayer(partner);
        }
      } else {
        // A nao tem dupla nesta categoria: limpar quem tinha A como partner
        for (const other of players) {
          if (other.id === myId) continue;
          const otherInsc = (other.inscriptions||[]).find(i => i.key === insc.key && i.partner === myId);
          if (otherInsc) {
            otherInsc.partner = '';
            await window.api.savePlayer(other);
          }
        }
      }
    }

    // Limpar parceiros de categorias de dupla que este jogador nao tem mais
    for (const other of players) {
      if (other.id === myId) continue;
      let changed = false;
      (other.inscriptions||[]).forEach(i => {
        if (i.partner === myId && !duplaKeys.has(i.key)) {
          i.partner = '';
          changed = true;
        }
      });
      if (changed) await window.api.savePlayer(other);
    }

    // Recarregar
    tournament = await window.api.getTournament();
    players = tournament?.players || [];
    editingPlayerId = null;
    closeModal('modal-player');
    renderPlayers();
    syncEntriesFromPlayers();
    prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    showToast('Jogador salvo!');
  } catch(e) { console.error(e); showToast('Erro: '+e.message, 'error'); }
}

async function deletePlayer(id) {
  if (!confirm('Excluir este jogador?')) return;
  await window.api.deletePlayer(id);
  tournament = await window.api.getTournament();
  players = tournament?.players || [];
  renderPlayers();
  syncEntriesFromPlayers();
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderDraws();
  setTimeout(()=>document.getElementById('search-players')?.focus(),50);
}

async function deleteAllPlayers() {
  if (!tournament) { showToast('Nenhum torneio ativo', 'warning'); return; }
  if (!players.length) { showToast('Nenhum jogador para excluir', 'warning'); return; }
  if (!confirm(`Excluir TODOS os ${players.length} jogadores?\n\nIsso tambem ira excluir inscritos, chaves e partidas.`)) return;
  if (!confirm('TEM CERTEZA? Esta acao nao pode ser desfeita.')) return;

  tournament.players = [];
  tournament.entries = [];
  tournament.draws = [];
  tournament.matches = [];
  players = [];
  selectedDrawIdx = -1;

  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderPlayers();
  showToast('Todos os jogadores excluidos');
  setTimeout(()=>document.getElementById('search-players')?.focus(),50);
}

// Sincronizar inscritos automaticamente a partir das categorias dos jogadores
