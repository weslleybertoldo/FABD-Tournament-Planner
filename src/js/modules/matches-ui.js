// =====================================================================
// Matches UI — render da aba "Partidas", tabs (Todas/Finalizadas/
// Arbitros), filtros, paineis auxiliares (stats arbitros, quadras).
// LEITURA-ONLY: nao muta tournament.matches nem draws.
// NAO INCLUI mutadores (handleRealtimeScoreUpdate, assignCourt,
// updateMatchField, showScoreModal, autoDetectWinner, propagateResult,
// reverseResult etc).
// Issue #14 sub-tarefa 14.G (escopo seguro) — auditoria 2026-05-09.
// =====================================================================

function renderMatches() {
  if(!tournament){document.getElementById('matches-no-tournament').style.display='block';document.getElementById('matches-content').style.display='none';return;}
  document.getElementById('matches-no-tournament').style.display='none';document.getElementById('matches-content').style.display='block';
  repropagateAllResults();
  renderCourtsPanel();
  // Populate day filter
  const dayFilter=document.getElementById('match-day-filter');
  if(dayFilter){
    const prevVal=dayFilter.value;
    dayFilter.innerHTML='<option value="">Todos os dias</option>';
    if(tournament.daySchedule?.length){
      tournament.daySchedule.forEach((day,idx)=>{
        const d=new Date(day.date+'T00:00:00');
        const label=`Dia ${idx+1} - ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
        dayFilter.innerHTML+=`<option value="${esc(day.date)}">${esc(label)}</option>`;
      });
    }
    dayFilter.value=prevVal||'';
  }
  const tb=document.getElementById('matches-table-body'),countEl=document.getElementById('matches-count');
  const matches=tournament.matches||[];
  const doneMatches=matches.filter(m=>m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao');
  const pendingMatches=matches.filter(m=>m.status!=='Finalizada'&&m.status!=='WO'&&m.status!=='Desistencia'&&m.status!=='Desqualificacao');
  if(countEl){
    let info=`${doneMatches.length}/${matches.length} finalizadas`;
    // Tempo medio de jogo
    const withDuration=doneMatches.filter(m=>m.startedAt&&m.finishedAt);
    if(withDuration.length){
      const totalSec=withDuration.reduce((s,m)=>s+Math.floor((new Date(m.finishedAt)-new Date(m.startedAt))/1000),0);
      const avgSec=Math.floor(totalSec/withDuration.length);
      const avgMin=Math.floor(avgSec/60),avgS=avgSec%60;
      info+=` | Tempo medio: ${avgMin}min${avgS?` ${String(avgS).padStart(2,'0')}s`:''}`;
      // Previsao de finalizacao
      const remaining=pendingMatches.filter(m=>m.status!=='A definir').length;
      const courts=tournament.courts||4;
      const slotsNeeded=Math.ceil(remaining/courts);
      const totalRemainingSec=slotsNeeded*avgSec;
      const now=new Date();
      const endEstimate=new Date(now.getTime()+totalRemainingSec*1000);
      const endH=String(endEstimate.getHours()).padStart(2,'0'),endM=String(endEstimate.getMinutes()).padStart(2,'0');
      const remMin=Math.floor(totalRemainingSec/60);
      info+=` | Restante: ~${remMin}min | Previsao: ${endH}:${endM}`;
    }
    countEl.textContent=info;
  }
  if(!pendingMatches.length){tb.innerHTML=`<tr><td colspan="11" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Todas as partidas foram finalizadas.</td></tr>`;return;}
  if(!matches.length){tb.innerHTML=`<tr><td colspan="11" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas.</td></tr>`;return;}

  // Coletar TODOS os nomes individuais dos atletas em quadra (separar duplas por "/")
  const inCourt=new Set();
  matches.forEach(m=>{
    if(m.status==='Em Quadra'){
      if(m.player1)(m.player1).split('/').forEach(n=>inCourt.add(n.trim()));
      if(m.player2)(m.player2).split('/').forEach(n=>inCourt.add(n.trim()));
    }
  });
  // Coletar nomes dos atletas ausentes
  const absentPlayers=new Set();
  (tournament.entries||[]).forEach(e=>{
    if(e.status==='ausente')absentPlayers.add(e.playerName);
  });

  // Coletar atletas em descanso pos-jogo (apenas Finalizada — WO/DSQ/RET nao contam)
  // Se atleta tem mais de um jogo finalizado recente, vale o mais recente (reinicia a contagem)
  const restingUntil=new Map();
  const _restMs=(tournament.restMinBetweenGames||0)*60000;
  const _nowMs=Date.now();
  if(_restMs>0){
    matches.forEach(m=>{
      if(m.status!=='Finalizada')return;
      if(!m.finishedAt)return;
      const endsAt=new Date(m.finishedAt).getTime()+_restMs;
      if(!(endsAt>_nowMs))return;
      const addName=(full)=>{
        if(!full)return;
        full.split('/').forEach(n=>{
          const t=n.trim();if(!t)return;
          const prev=restingUntil.get(t)||0;
          if(endsAt>prev)restingUntil.set(t,endsAt);
        });
      };
      addName(m.player1);addName(m.player2);
    });
  }
  // Ticker singleton: atualiza textos do cronometro a cada 1s SEM re-renderizar.
  // Quando algum chega a zero, agenda render via scheduleRender (respeita coalesce/defer-when-typing).
  if(!window.__fabdRestTicker){
    window.__fabdRestTicker=setInterval(()=>{
      try{
        const tbody=document.getElementById('matches-table-body');
        if(!tbody)return;
        const nodes=tbody.querySelectorAll('[data-resting-until]');
        if(!nodes.length)return;
        const now=Date.now();let needsRerender=false;
        nodes.forEach(n=>{
          const ends=parseInt(n.getAttribute('data-resting-until'),10)||0;
          const remaining=ends-now;
          if(remaining<=0){needsRerender=true;return;}
          const txt=n.querySelector('.fabd-rest-text');
          if(txt){
            const total=Math.ceil(remaining/1000);
            const mm=Math.floor(total/60),ss=total%60;
            txt.textContent=mm>0?`${mm}m ${String(ss).padStart(2,'0')}s`:`${ss}s`;
          }
        });
        if(needsRerender&&typeof scheduleRender==='function'&&typeof renderMatches==='function'){
          scheduleRender('matches',renderMatches);
        }
      }catch(e){console.warn('[restTicker]',e);}
    },1000);
  }

  // Pre-calcular filtro de dia para evitar flash ao renderizar
  const _dayVal=document.getElementById('match-day-filter')?.value||'';
  let _dayDraws=null;
  if(_dayVal&&tournament?.daySchedule){
    const _day=tournament.daySchedule.find(d=>d.date===_dayVal);
    if(_day)_dayDraws=new Set(_day.draws||[]);
  }

  const _nc = tournament.courts || 4;
  const _cn = tournament.courtNames || [];
  let _lastMatchTime = '';
  let _matchesAtTime = 0;
  let _lastMatchDraw = '';

  let h='';
  pendingMatches.forEach(m=>{
    const i=matches.indexOf(m);

    // Detectar mudanca de horario e mostrar quadras livres do horario anterior
    if (m.time && m.time !== _lastMatchTime) {
      if (_lastMatchTime && _matchesAtTime < _nc) {
        const _livres = _nc - _matchesAtTime;
        for (let _q = 0; _q < _livres; _q++) {
          const _courtName = _cn[_matchesAtTime + _q] || `Quadra ${_matchesAtTime + _q + 1}`;
          h += `<tr class="court-free-row" data-time="${esc(_lastMatchTime)}" data-draw="${esc(_lastMatchDraw)}" style="background:#F8FAFC"><td></td><td style="font-size:11px;color:#94A3B8">${esc(_lastMatchTime)}</td><td colspan="10" style="font-size:11px;color:#94A3B8;font-style:italic">${esc(_courtName)} - livre</td></tr>`;
        }
      }
      _lastMatchTime = m.time;
      _matchesAtTime = 0;
    }
    _matchesAtTime++;
    _lastMatchDraw = m.drawName || '';

    const stMap={'Finalizada':'tag-green','WO':'tag-red','Desqualificacao':'tag-red','Desistencia':'tag-yellow','Em Quadra':'tag-blue','A definir':'tag-gray','Pendente':'tag-gray'};
    const st=stMap[m.status]||'tag-gray';
    const isDef=m.status==='A definir';
    const isEQ=m.status==='Em Quadra';
    let rs=isDef?'opacity:0.6;font-style:italic':isEQ?'background:#FFF3E0':'';
    // Verificar se algum nome individual do jogador/dupla esta em quadra
    const checkInCourt=(name)=>{
      if(!name)return false;
      return name.split('/').some(n=>inCourt.has(n.trim()));
    };
    const p1=esc(m.player1Display||m.player1||'A definir'),p2=esc(m.player2Display||m.player2||'A definir');
    const alertIcon='<span title="Atleta em quadra" style="color:#F59E0B;font-weight:700;cursor:help;margin-left:4px">&#9888;</span>';
    const absentIcon='<span title="Ausente" style="color:#DC2626;font-weight:700;cursor:help;margin-left:4px">&#10071;</span>';
    const restBadge=(endsAt)=>{
      const remaining=endsAt-Date.now();
      const total=Math.max(0,Math.ceil(remaining/1000));
      const mm=Math.floor(total/60),ss=total%60;
      const txt=mm>0?`${mm}m ${String(ss).padStart(2,'0')}s`:`${ss}s`;
      return `<span class="fabd-rest-timer" data-resting-until="${endsAt}" title="Em descanso" style="color:#2563EB;font-weight:700;cursor:help;margin-left:4px;white-space:nowrap">&#9201; <span class="fabd-rest-text">${txt}</span></span>`;
    };
    const highlightPlayer=(nameStr,rawName)=>{
      if(!rawName)return`<span>${nameStr}</span>`;
      const parts=rawName.split('/');
      if(parts.length<=1){
        const trimmed=rawName.trim();
        if(!isEQ&&inCourt.has(trimmed))return`<span style="background:#FEF3C7;padding:2px 6px;border-radius:4px">${nameStr}${alertIcon}</span>`;
        if(absentPlayers.has(trimmed))return`<span style="background:#FEE2E2;padding:2px 6px;border-radius:4px">${nameStr}${absentIcon}</span>`;
        if(!isEQ&&restingUntil.has(trimmed))return`<span style="background:#DBEAFE;padding:2px 6px;border-radius:4px">${nameStr}${restBadge(restingUntil.get(trimmed))}</span>`;
        return`<span>${nameStr}</span>`;
      }
      // esc() escapa '/' como &#x2F; — split no display ESCAPADO nao funciona.
      // Splita o display cru e escapa cada parte individualmente.
      const rawDisplaySide=(m.player1===rawName)?(m.player1Display||m.player1||''):(m.player2Display||m.player2||'');
      const escapedParts=String(rawDisplaySide).split('/').map(s=>esc(s.trim()));
      const highlighted=parts.map((p,idx)=>{
        const trimmed=p.trim();
        const display=(escapedParts[idx]||esc(trimmed)).trim();
        if(!isEQ&&inCourt.has(trimmed))return`<span style="background:#FEF3C7;padding:2px 6px;border-radius:4px">${display}${alertIcon}</span>`;
        if(absentPlayers.has(trimmed))return`<span style="background:#FEE2E2;padding:2px 6px;border-radius:4px">${display}${absentIcon}</span>`;
        if(!isEQ&&restingUntil.has(trimmed))return`<span style="background:#DBEAFE;padding:2px 6px;border-radius:4px">${display}${restBadge(restingUntil.get(trimmed))}</span>`;
        return display;
      });
      return highlighted.join(' / ');
    };
    const w1=n=>highlightPlayer(n,m.player1);
    const w2=n=>highlightPlayer(n,m.player2);

    let pHtml;
    if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
      const sets=m.score.split('/').map(s=>s.trim());let s1=[],s2=[];
      sets.forEach(s=>{const p=s.split('-');if(p.length===2){s1.push(p[0].trim());s2.push(p[1].trim());}});
      pHtml=`<td><strong style="${m.winner===1?'color:#10B981':''}">${w1(p1)}</strong></td><td style="text-align:center;font-weight:700;font-size:13px;white-space:nowrap"><span style="color:${m.winner===1?'#10B981':'var(--fabd-gray-700)'}">${s1.join(' ')}</span><span style="color:var(--fabd-gray-400);margin:0 4px">x</span><span style="color:${m.winner===2?'#10B981':'var(--fabd-gray-700)'}">${s2.join(' ')}</span></td><td><strong style="${m.winner===2?'color:#10B981':''}">${w2(p2)}</strong></td>`;
    } else if(m.score==='W.O.'||m.score==='DSQ'||m.score==='RET'){
      pHtml=`<td><strong>${w1(p1)}</strong></td><td style="text-align:center;font-weight:700;color:var(--fabd-red)">${esc(m.score)}</td><td><strong>${w2(p2)}</strong></td>`;
    } else {
      pHtml=`<td><strong>${w1(p1)}</strong></td><td style="text-align:center;color:var(--fabd-gray-400)">x</td><td><strong>${w2(p2)}</strong></td>`;
    }

    const isFinished=m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao';
    const resetBtn=isFinished?`<button class="btn btn-sm" style="background:#FEE2E2;color:#DC2626;border:1px solid #FECACA;margin-left:4px;padding:2px 6px;font-size:11px" data-action="resetMatch" data-arg-1="${i}" title="Desfazer resultado">&#8635;</button>`:'';
    const matchDay=getMatchDay(m);
    const dayLabel=matchDay?((d)=>{const o=new Date(d+'T00:00:00');return`${String(o.getDate()).padStart(2,'0')}/${String(o.getMonth()+1).padStart(2,'0')}`;})(matchDay.date):'-';
    const _hideRow=_dayDraws&&!_dayDraws.has(m.drawName||'')?'display:none;':'';
    h+=`<tr data-status="${m.status}" data-draw="${esc(m.drawName||'')}" style="${_hideRow}${rs}"><td style="font-size:12px">${dayLabel}</td><td>${esc(m.time)||'-'}</td><td style="font-size:12px">${esc(m.drawName)}</td><td>${esc(m.roundName||'R'+m.round)}</td><td>${m.num}</td>${pHtml}<td>${isDef?'-':`<select class="form-control" style="width:100px;padding:2px 4px;font-size:11px" data-action="assignCourt" data-event="change" data-arg-1="${i}" data-arg-2="$value"><option value="">-</option>${getCourtOptions(m.court)}</select>`}</td><td>${isDef?'-':`<select class="form-control" style="width:120px;padding:2px 4px;font-size:11px" data-action="updateMatchField" data-event="change" data-arg-1="${i}" data-arg-2="umpire" data-arg-3="$value"><option value="">-</option>${getUmpireOptions(m.umpire)}</select>`}</td><td><span class="tag ${st}">${esc(m.status)}</span></td><td>${isDef?'':`<button class="btn btn-sm btn-primary" data-action="showScoreModal" data-arg-1="${i}">Placar</button>${resetBtn}`}</td></tr>`;
  });
  // Quadras livres do ultimo horario
  if (_lastMatchTime && _matchesAtTime < _nc) {
    const _livres = _nc - _matchesAtTime;
    for (let _q = 0; _q < _livres; _q++) {
      const _courtName = _cn[_matchesAtTime + _q] || `Quadra ${_matchesAtTime + _q + 1}`;
      h += `<tr class="court-free-row" data-time="${esc(_lastMatchTime)}" data-draw="${esc(_lastMatchDraw)}" style="background:#F8FAFC"><td></td><td style="font-size:11px;color:#94A3B8">${esc(_lastMatchTime)}</td><td colspan="10" style="font-size:11px;color:#94A3B8;font-style:italic">${esc(_courtName)} - livre</td></tr>`;
    }
  }
  tb.innerHTML=h;
  // Reaplicar filtros apos re-renderizar
  setTimeout(()=>filterMatches(),0);
}

let _filterMatchesTimer = null;
function filterMatches() {
  if (_filterMatchesTimer) clearTimeout(_filterMatchesTimer);
  _filterMatchesTimer = setTimeout(() => {
    const q=(document.getElementById('search-matches')?.value||'').toLowerCase();
    const st=document.getElementById('match-status-filter')?.value||'';
    const dayVal=document.getElementById('match-day-filter')?.value||'';
    // Build set of draw names for selected day
    let dayDraws=null;
    if(dayVal&&tournament?.daySchedule){
      const day=tournament.daySchedule.find(d=>d.date===dayVal);
      if(day)dayDraws=new Set(day.draws||[]);
    }
    // Primeiro: filtrar jogos normais
    const visibleTimes = new Set();
    document.querySelectorAll('#matches-table-body tr:not(.court-free-row)').forEach(r=>{
      const matchQ=r.textContent.toLowerCase().includes(q);
      const matchSt=!st||(r.dataset.status||'')===st;
      const matchDay=!dayDraws||(dayDraws.has(r.dataset.draw||''));
      const visible = matchQ&&matchSt&&matchDay;
      r.style.display=visible?'':'none';
      // Rastrear horarios visiveis para mostrar/esconder quadras livres
      if (visible) {
        const timeTd = r.querySelectorAll('td')[1];
        if (timeTd) visibleTimes.add(timeTd.textContent.trim());
      }
    });
    // Segundo: mostrar/esconder quadras livres baseado no filtro de dia
    document.querySelectorAll('#matches-table-body tr.court-free-row').forEach(r=>{
      const matchDay = !dayDraws || (dayDraws.has(r.dataset.draw||''));
      r.style.display = matchDay ? '' : 'none';
    });
  }, 150);
}

let _filterFinishedTimer=null;
function filterFinished(){
  if(_filterFinishedTimer)clearTimeout(_filterFinishedTimer);
  _filterFinishedTimer=setTimeout(()=>{
    const q=(document.getElementById('search-finished')?.value||'').toLowerCase();
    document.querySelectorAll('#finished-table-body tr').forEach(r=>{
      r.style.display=r.textContent.toLowerCase().includes(q)?'':'none';
    });
  },150);
}

function setMatchesTab(tab){
  document.querySelectorAll('#matches-tabs .tab').forEach((t,i)=>{
    t.classList.toggle('active',(tab==='all'&&i===0)||(tab==='finished'&&i===1)||(tab==='umpires'&&i===2));
  });
  document.getElementById('matches-tab-all').style.display=tab==='all'?'':'none';
  document.getElementById('matches-tab-finished').style.display=tab==='finished'?'':'none';
  document.getElementById('matches-tab-umpires').style.display=tab==='umpires'?'':'none';
  if(tab==='finished')renderFinishedMatches();
  if(tab==='umpires')renderUmpireStats();
}

function renderFinishedMatches(){
  const tb=document.getElementById('finished-table-body');
  if(!tournament?.matches?.length){tb.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas finalizadas.</td></tr>';return;}
  const finished=tournament.matches.filter(m=>m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao')
    .slice().sort((a,b)=>(new Date(b.finishedAt||0).getTime())-(new Date(a.finishedAt||0).getTime()));
  if(!finished.length){tb.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas finalizadas.</td></tr>';return;}
  let h='';
  finished.forEach(m=>{
    const i=tournament.matches.indexOf(m);
    const stMap={'Finalizada':'tag-green','WO':'tag-red','Desqualificacao':'tag-red','Desistencia':'tag-yellow'};
    const st=stMap[m.status]||'tag-gray';
    const p1Style=m.winner===1?'color:#10B981;font-weight:700':'';
    const p2Style=m.winner===2?'color:#10B981;font-weight:700':'';
    // Formatar horarios
    const fmtTime=(iso)=>{if(!iso)return'-';const d=new Date(iso);return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
    const startTime=fmtTime(m.startedAt);
    const endTime=fmtTime(m.finishedAt);
    // Calcular duracao
    let duration='-';
    if(m.startedAt&&m.finishedAt){
      const diff=Math.floor((new Date(m.finishedAt)-new Date(m.startedAt))/1000);
      const mins=Math.floor(diff/60),secs=diff%60;
      duration=`${mins}min ${String(secs).padStart(2,'0')}s`;
    }
    // Placar formatado
    let scoreHtml;
    if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
      const sets=m.score.split('/').map(s=>s.trim());let s1=[],s2=[];
      sets.forEach(s=>{const p=s.split('-');if(p.length===2){s1.push(p[0].trim());s2.push(p[1].trim());}});
      scoreHtml=`<span style="color:${m.winner===1?'#10B981':'var(--fabd-gray-700)'}">${s1.join(' ')}</span><span style="color:var(--fabd-gray-400);margin:0 4px">x</span><span style="color:${m.winner===2?'#10B981':'var(--fabd-gray-700)'}">${s2.join(' ')}</span>`;
    } else {
      scoreHtml=`<span style="color:var(--fabd-red);font-weight:700">${esc(m.score||'-')}</span>`;
    }
    const resetBtn=`<button class="btn btn-sm" style="background:#FEE2E2;color:#DC2626;border:1px solid #FECACA;padding:2px 6px;font-size:11px" data-action="resetMatch" data-arg-1="${i}" title="Desfazer resultado">&#8635;</button>`;
    h+=`<tr><td>${m.num}</td><td style="font-size:12px">${esc(m.drawName)}</td><td>${esc(m.roundName||'R'+m.round)}</td><td style="${p1Style}">${esc(m.player1||'')}</td><td style="text-align:center;font-weight:700;font-size:13px;white-space:nowrap">${scoreHtml}</td><td style="${p2Style}">${esc(m.player2||'')}</td><td>${esc(m.court||'-')}</td><td>${esc(m.umpire||'-')}</td><td>${startTime}</td><td>${endTime}</td><td>${duration}</td><td><span class="tag ${st}">${esc(m.status)}</span></td><td>${resetBtn}</td></tr>`;
  });
  tb.innerHTML=h;
}

function renderUmpireStats(){
  const tb=document.getElementById('umpires-stats-body');
  if(!tournament?.matches?.length){tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas.</td></tr>';return;}
  // Contar jogos por arbitro
  const stats={};
  tournament.matches.forEach(m=>{
    if(!m.umpire)return;
    if(!stats[m.umpire])stats[m.umpire]={total:0,matches:[]};
    stats[m.umpire].total++;
    stats[m.umpire].matches.push(`#${m.num} ${m.player1||'?'} vs ${m.player2||'?'}`);
  });
  const entries=Object.entries(stats).sort((a,b)=>b[1].total-a[1].total);
  if(!entries.length){tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Nenhum arbitro atribuido.</td></tr>';return;}
  let h='';
  entries.forEach(([name,data])=>{
    h+=`<tr><td style="font-weight:700">${esc(name)}</td><td style="text-align:center"><span class="tag tag-blue">${data.total}</span></td><td style="font-size:11px;color:var(--fabd-gray-600)">${data.matches.map(x=>esc(x)).join(', ')}</td></tr>`;
  });
  tb.innerHTML=h;
}

function renderCourtsPanel() {
  const panel=document.getElementById('courts-panel');
  if(!panel||!tournament)return;
  const nc=tournament.courts||4,cn=tournament.courtNames||[],matches=tournament.matches||[];
  panel.style.gridTemplateColumns=`repeat(${Math.min(nc,5)},1fr)`;
  let h='';
  for(let c=0;c<nc;c++){
    const name=cn[c]||`Quadra ${c+1}`;
    // Mostrar SOMENTE o jogo que esta "Em Quadra" nesta quadra (1 por quadra)
    const emQuadra=matches.find(m=>m.court===name&&m.status==='Em Quadra');
    const headerClass=emQuadra?'active':'';

    h+=`<div class="court-card"><div class="court-card-header ${headerClass}"><span>${esc(name)}${emQuadra?' <span style="font-weight:400;font-size:11px;opacity:0.8">'+esc(emQuadra.drawName)+' - '+esc(emQuadra.roundName||'')+'</span>':''}</span><span class="court-status">${emQuadra?'Em jogo':'Livre'}</span></div><div class="court-card-body${emQuadra?'':' empty'}">`;
    if(!emQuadra){
      h+='Quadra livre';
    } else {
      const live=emQuadra.liveScore||'';
      // Parsear live score: "15 - 12 (Set 2)"
      let liveP1='0',liveP2='0',liveSet='1';
      if(live&&typeof live==='string'){
        const m=live.match(/(\d+)\s*-\s*(\d+)\s*\(Set\s*(\d+)\)/);
        if(m){liveP1=m[1];liveP2=m[2];liveSet=m[3];}
      }
      // Sets anteriores
      let setsHtml='';
      if(emQuadra.liveSets){
        emQuadra.liveSets.forEach((s,i)=>{setsHtml+=`<span style="font-size:11px;color:var(--fabd-gray-500);margin:0 2px">${s}</span>`;});
      }
      h+=`<div style="padding:8px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="flex:1;text-align:left;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(emQuadra.player1)}</div>
          <div style="min-width:60px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:${live?'#F59E0B':'var(--fabd-gray-700)'}">${live?liveP1+' - '+liveP2:(emQuadra.score||'x')}</div>
            ${live?`<div style="font-size:10px;color:var(--fabd-gray-500)">Set ${liveSet}</div>`:''}
            ${setsHtml?`<div style="margin-top:2px">${setsHtml}</div>`:''}
          </div>
          <div style="flex:1;text-align:right;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(emQuadra.player2)}</div>
        </div>
        ${emQuadra.umpire?`<div style="text-align:center;font-size:11px;color:var(--fabd-gray-500);margin-top:4px">Árbitro - ${esc(emQuadra.umpire)}</div>`:''}
      </div>`;
    }
    h+='</div></div>';
  }
  panel.innerHTML=h;
}

// Receber atualizacao de placar em tempo real do Supabase
