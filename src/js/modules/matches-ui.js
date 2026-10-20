// =====================================================================
// Matches UI — render da aba "Partidas", tabs (Todas/Finalizadas/
// Arbitros), filtros, paineis auxiliares (stats arbitros, quadras).
// LEITURA-ONLY: nao muta tournament.matches nem draws.
// NAO INCLUI mutadores (handleRealtimeScoreUpdate, assignCourt,
// updateMatchField, showScoreModal, autoDetectWinner, propagateResult,
// reverseResult etc).
// Issue #14 sub-tarefa 14.G (escopo seguro) — auditoria 2026-05-09.
// Layout novo (W20, parte 8): só a apresentação mudou — os mesmos jogos,
// filtros, colunas e ações de antes. Funções mt* (sem DOM) cobertas em
// tests/unit/matches-layout.test.js.
// =====================================================================

// Botões da situação: os mesmos valores da lista de antes ('' = Todas)
const MT_STATUS_CHIPS = [['', 'Todas'], ['Pendente', 'Pendentes'], ['Em Quadra', 'Em quadra'], ['Finalizada', 'Finalizadas'], ['A definir', 'A definir']];

// Placar ao vivo do árbitro: "13 - 10 (Set 2)" + games anteriores ["15-10"]
// → { cur: '13–10', p1: '13', p2: '10', games: ['15–10'], gameNo: 2 }; sem placar → null
function mtLiveScore(m) {
  const r = typeof m?.liveScore === 'string' ? m.liveScore.match(/(\d+)\s*-\s*(\d+)(?:\s*\(Set\s*(\d+)\))?/) : null;
  if (!r) return null;
  const games = (Array.isArray(m.liveSets) ? m.liveSets : []).map(s => String(s).replace(/\s*-\s*/, '–'));
  return { cur: `${r[1]}–${r[2]}`, p1: r[1], p2: r[2], games, gameNo: Number(r[3]) || games.length + 1 };
}

// Placar de games "21-15 / 18-21 / 21-19" → { sets: '2 × 1', games: ['21–15', '18–21', '21–19'] };
// algum game fora desse formato (ou sem placar) → null: fica o texto de sempre
function mtScoreParts(score) {
  const games = String(score || '').split('/').map(s => s.trim()).filter(Boolean);
  if (!games.length || !games.every(g => /^\d+\s*-\s*\d+$/.test(g))) return null;
  let a = 0, b = 0;
  games.forEach(g => { const [x, y] = g.split('-').map(Number); if (x > y) a++; else if (y > x) b++; });
  return { sets: `${a} × ${b}`, games: games.map(g => g.replace(/\s*-\s*/, '–')) };
}

// Texto da etiqueta da situação ("Em Quadra" → "Em quadra"; W.O., Desistência... os de sempre)
function mtStatusLabel(status) {
  return status === 'Em Quadra' ? 'Em quadra' : resultStatusLabel(status);
}

// Cor da etiqueta da situação
function mtStatusClass(status) {
  return ({ Finalizada: 'is-done', WO: 'is-red', Desqualificacao: 'is-red', Desistencia: 'is-warn', SemJogo: 'is-gray',
    'Em Quadra': 'is-live', 'A definir': 'is-tbd', Pendente: 'is-pend' })[status] || 'is-gray';
}

// Contagem dos botões da situação: as linhas da lista ({ status, day }) do dia escolhido
function mtStatusCounts(rows, dayVal) {
  const c = {};
  MT_STATUS_CHIPS.forEach(([v]) => { c[v] = 0; });
  (rows || []).forEach(r => {
    if (dayVal && (r.day || '') !== dayVal) return;
    c['']++;
    if (r.status && Object.prototype.hasOwnProperty.call(c, r.status)) c[r.status]++;
  });
  return c;
}

// Nomes de um lado ("A / B" → ['A', 'B'])
function mtNames(txt) {
  return String(txt || '').split('/').map(s => s.trim()).filter(Boolean);
}

// "~1h46" / "45 min" (restante) e "26 min" / "26 min 05 s" (tempo médio)
function mtDur(min) {
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
function mtAvg(sec) {
  return `${Math.floor(sec / 60)} min${sec % 60 ? ` ${String(sec % 60).padStart(2, '0')} s` : ''}`;
}

// ---------- DOM ----------

// Nome do dia no filtro: "Sáb 17/10" (o mesmo dos botões da Agenda)
function _mtDayName(day, idx) {
  if (typeof agendaDayLabel === 'function') return agendaDayLabel(day.date).curto;
  const d = new Date(day.date + 'T00:00:00');
  return `Dia ${idx + 1} - ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Placar de games no estilo novo (sets + cada game); fora do formato, o texto de sempre
function _mtGames(score) {
  const sp = mtScoreParts(score);
  return sp ? `<div class="mt-sc"><b>${sp.sets}</b><span class="mt-gm">${sp.games.map(g => `<i>${esc(g)}</i>`).join('')}</span></div>`
    : `<span class="mt-sc-txt">${esc(formatScoreByGames(score))}</span>`;
}

// Etiqueta da situação
function _mtStatusPill(status) {
  return `<span class="pill mt-st ${mtStatusClass(status)}"><s></s>${esc(mtStatusLabel(status))}</span>`;
}

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
        dayFilter.innerHTML+=`<option value="${esc(day.date)}">${esc(_mtDayName(day,idx))}</option>`;
      });
    }
    dayFilter.value=prevVal||'';
  }
  const tb=document.getElementById('matches-table-body');
  const matches=tournament.matches||[];
  const pendingMatches=matches.filter(m=>!isMatchDone(m));
  renderMatchesProgress();
  const vazio=t=>`<tr class="mt-empty"><td colspan="10">${t}</td></tr>`;
  if(!matches.length){tb.innerHTML=vazio('Sem partidas.');_mtChips();return;}
  if(!pendingMatches.length){tb.innerHTML=vazio('Todas as partidas foram finalizadas.');_mtChips();return;}

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

  const _nc = tournament.courts || 4;
  const _cn = tournament.courtNames || [];
  let _lastMatchTime = '';
  let _matchesAtTime = 0;
  let _lastMatchDraw = '', _lastMatchDay = '';
  // Horarios do seletor: um calculo por chave e dia (a grade e a do dia do jogo)
  const _timeChoices = {};
  const _choicesOf = m => { const k = m.drawName + '|' + (getMatchDay(m)?.date || ''); return _timeChoices[k] || (_timeChoices[k] = matchTimeChoices(m)); };
  // Quadra livre no horario (mesma linha de antes, no estilo novo)
  const _livre = (t, q) => `<tr class="court-free-row" data-time="${esc(t)}" data-draw="${esc(_lastMatchDraw)}" data-day="${esc(_lastMatchDay)}"><td></td><td class="mt-time">${esc(t)}</td><td colspan="8" class="mt-free">${esc(_cn[q] || `Quadra ${q + 1}`)} · livre</td></tr>`;

  const _svm=scheduleValidationRun().byMatch; // ⚠ da Validar programacao
  let h='';
  pendingMatches.forEach(m=>{
    const i=matches.indexOf(m);

    // Detectar mudanca de horario e mostrar quadras livres do horario anterior
    if (m.time && m.time !== _lastMatchTime) {
      if (_lastMatchTime && _matchesAtTime < _nc) {
        for (let _q = _matchesAtTime; _q < _nc; _q++) h += _livre(_lastMatchTime, _q);
      }
      _lastMatchTime = m.time;
      _matchesAtTime = 0;
    }
    _matchesAtTime++;
    _lastMatchDraw = m.drawName || '';
    _lastMatchDay = getMatchDay(m)?.date || '';

    const isDef=m.status==='A definir';
    const isEQ=m.status==='Em Quadra';
    // Provisorio da eliminatoria: grupo que ja acabou mostra o nome do classificado
    const _d=!m.player1||!m.player2?(tournament.draws||[]).find(x=>x.name===m.drawName):null;
    const _disp=(raw,disp)=>raw?(disp||raw):resolveGroupQualifierLabel(_d,disp||'A definir');
    const d1=_disp(m.player1,m.player1Display),d2=_disp(m.player2,m.player2Display);
    const restBadge=(endsAt)=>{
      const remaining=endsAt-Date.now();
      const total=Math.max(0,Math.ceil(remaining/1000));
      const mm=Math.floor(total/60),ss=total%60;
      const txt=mm>0?`${mm}m ${String(ss).padStart(2,'0')}s`:`${ss}s`;
      return `<span class="fabd-rest-timer mt-flag" data-resting-until="${endsAt}" title="Em descanso">${icon('timer')}<span class="fabd-rest-text">${txt}</span></span>`;
    };
    // Um lado do jogo: cada atleta numa linha, com o aviso de sempre
    // (em quadra em outro jogo, ausente, em descanso)
    const side=(k)=>{
      const raw=k===1?m.player1:m.player2;
      const disp=String(k===1?d1:d2);
      if(!raw)return`<div class="mt-pl is-tbd"><span class="mt-nm">${esc(disp)}</span></div>`;
      const parts=raw.split('/');
      const dispParts=disp.split('/');
      const nomes=parts.map((p,idx)=>{
        const t=p.trim();
        const shown=esc((parts.length>1?(dispParts[idx]||t):disp).trim());
        if(!isEQ&&inCourt.has(t))return`<span class="mt-nm is-court">${shown}<span class="mt-flag" title="Atleta em quadra">${icon('triangle-alert')}</span></span>`;
        if(absentPlayers.has(t))return`<span class="mt-nm is-absent">${shown}<span class="mt-flag" title="Ausente">${icon('circle-alert')}</span></span>`;
        if(!isEQ&&restingUntil.has(t))return`<span class="mt-nm is-rest">${shown}${restBadge(restingUntil.get(t))}</span>`;
        return`<span class="mt-nm">${shown}</span>`;
      });
      return`<div class="mt-pl${m.winner===k?' is-win':''}">${nomes.join('<span class="mt-sep"> / </span>')}</div>`;
    };

    let sc;
    const lv=isEQ?mtLiveScore(m):null;
    if(isSpecialResult(m)){
      // W.O., desistencia, desqualificacao, Sem jogo: o texto com a marca (match-result.js)
      sc=`<span class="mt-res" style="color:${resultColor(m.status)}">${esc(resultText(m))}</span>`;
    } else if(lv){
      // Em quadra: o placar ao vivo do arbitro (o mesmo do painel das quadras)
      sc=`<div class="mt-sc is-live"><b><s class="mt-ld"></s>${esc(lv.cur)}</b><span class="mt-gm">${lv.games.map(g=>`<i>${esc(g)}</i>`).join('')}<i class="g">${lv.gameNo}º game</i></span></div>`;
    } else if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
      sc=_mtGames(m.score);
    } else if(m.score==='W.O.'||m.score==='DSQ'||m.score==='RET'){
      sc=`<span class="mt-res is-red">${esc(m.score)}</span>`;
    } else {
      sc='<span class="mt-x">×</span>';
    }

    const isFinished=isMatchDone(m);
    const resetBtn=isFinished?`<button class="btn-soft is-gray" data-action="resetMatch" data-arg-1="${i}" title="Desfazer resultado">${icon('rotate-ccw')}Desfazer</button>`:'';
    const matchDay=getMatchDay(m);
    const dayLabel=matchDay?((d)=>{const o=new Date(d+'T00:00:00');return`${String(o.getDate()).padStart(2,'0')}/${String(o.getMonth()+1).padStart(2,'0')}`;})(matchDay.date):'-';
    const _hideRow=_dayVal&&(matchDay?.date||'')!==_dayVal?'display:none;':''; // dia do JOGO
    // Texto da busca: so o conteudo da linha (sem as opcoes das listas de quadra/arbitro)
    const _search=normSearch([dayLabel,m.time,m.drawName,m.roundName||'R'+m.round,m.num,m.player1,m.player2,d1,d2,m.court,m.umpire,m.status].join(' '));
    h+=`<tr class="mt-row${isEQ?' is-live':''}${isDef?' is-tbd':''}" data-match-id="${esc(String(m.id||''))}" data-status="${m.status}" data-draw="${esc(m.drawName||'')}" data-day="${esc(matchDay?.date||'')}" data-search="${esc(_search)}" style="${_hideRow}">`
      +`<td class="mt-num">${m.num}${scheduleValidationIcon(_svm,m)}</td>`
      +`<td class="mt-time">${isEQ?`<span class="mt-t">${esc(m.time)||'-'}</span>`:`<select class="sel-line" title="Mudar o horário" data-action="setMatchTime" data-event="change" data-arg-1="${i}" data-arg-2="$value">${getTimeOptions(m,_choicesOf(m))}</select>`}<small class="mt-day">${dayLabel}</small></td>`
      +`<td class="mt-draw"><b>${esc(m.drawName)}</b><small>${esc(m.roundName||'R'+m.round)}</small></td>`
      +`<td>${side(1)}</td><td>${sc}</td><td>${side(2)}</td>`
      +`<td>${isDef?'<span class="mt-x">-</span>':`<select class="sel-line" title="Quadra" data-action="assignCourt" data-event="change" data-arg-1="${i}" data-arg-2="$value"><option value="">Escolher</option>${getCourtOptions(m.court)}</select>`}</td>`
      +`<td>${isDef?'<span class="mt-x">-</span>':`<select class="sel-line" title="Árbitro" data-action="updateMatchField" data-event="change" data-arg-1="${i}" data-arg-2="umpire" data-arg-3="$value"><option value="">Escolher</option>${getUmpireOptions(m.umpire)}</select>`}</td>`
      +`<td>${_mtStatusPill(m.status)}</td>`
      +`<td class="acts">${isDef?'':`<button class="btn-soft" data-action="showScoreModal" data-arg-1="${i}">${icon('pencil')}Placar</button>${resetBtn}`}</td></tr>`;
  });
  // Quadras livres do ultimo horario
  if (_lastMatchTime && _matchesAtTime < _nc) {
    for (let _q = _matchesAtTime; _q < _nc; _q++) h += _livre(_lastMatchTime, _q);
  }
  tb.innerHTML=h;
  _mtChips();
  // Reaplicar filtros apos re-renderizar
  setTimeout(()=>filterMatches(),0);
}

// Progresso do dia escolhido no filtro, numa linha no cabeçalho da lista:
// finalizadas, tempo médio, restante e previsão de término (todos os dias =
// total + o de cada dia). Números em matches-forecast.js (os mesmos de antes).
function renderMatchesProgress() {
  const el=document.getElementById('matches-progress');
  if(!el||!tournament)return;
  const matches=tournament.matches||[];
  const days=tournament.daySchedule||[];
  const dayVal=document.getElementById('match-day-filter')?.value||'';
  const nowMs=Date.now();
  const allAvg=forecastAvgSec(matches);
  const dayMs=(day,hhmm)=>new Date(`${day.date}T${hhmm}:00`).getTime();
  const summarize=(list,day)=>forecastSummary(list,{
    nowMs,dayStartMs:day?dayMs(day,day.startTime||tournament.startTime||'08:00'):0,
    courts:tournament.courts||4,restMin:tournament.restMinBetweenGames||0,
    defaultMin:tournament.matchDuration||30,tournamentAvg:allAvg
  });
  const hm=ms=>{const d=new Date(ms);return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
  const jogos=n=>`${n} jogo${n>1?'s':''}`;
  const seg=(t,cls,title)=>`<span class="mt-fc-i${cls?' '+cls:''}"${title?` title="${esc(title)}"`:''}>${t}</span>`;
  const avgSeg=a=>a.source==='torneio'?seg(`média ${mtAvg(a.sec)} por jogo`,'',`média do torneio (${jogos(a.count)})`):seg(`${mtAvg(a.sec)} por jogo`,'','duração configurada (sem jogo medido)');
  const selDay=dayVal?days.find(d=>d.date===dayVal):null;
  const list=selDay?matches.filter(m=>getMatchDay(m)?.date===selDay.date):matches;
  const s=summarize(list,selDay);
  let h=seg(`<b>${s.done}</b> de ${s.total} finalizados`)+avgSeg(s.avg);
  if(selDay||!days.length){
    // Um dia (ou torneio sem agenda por dia)
    const future=selDay&&s.startMs>nowMs;
    h+=seg(s.remaining?`restante ~${mtDur(s.remainingMin)} (${jogos(s.remaining)}${future?`, a partir das ${hm(s.startMs)}`:''})`:'tudo finalizado');
    if(s.remaining&&s.endMs){
      const late=selDay&&selDay.endTime&&s.endMs>dayMs(selDay,selDay.endTime);
      h+=seg(`término ~${hm(s.endMs)}${late?` · passa das ${esc(selDay.endTime)}`:''}`,late?'is-late':'');
    } else if(s.lastFinishedMs){
      h+=seg(`encerrado às ${hm(s.lastFinishedMs)}`);
    }
  } else {
    // Todos os dias: o que falta e a previsao de cada dia
    days.forEach((day,i)=>{
      const ds=summarize(matches.filter(m=>getMatchDay(m)?.date===day.date),day);
      h+=seg(`<b>Dia ${i+1}:</b> ${ds.remaining?`${jogos(ds.remaining)}, ~${mtDur(ds.remainingMin)}${ds.endMs?`, término ${hm(ds.endMs)}`:''}`:ds.total?'encerrado':'-'}`);
    });
  }
  el.innerHTML=h;
}

// Relogio do painel: a previsao anda com o tempo mesmo sem jogo novo
if(typeof window!=='undefined'&&!window.__fabdProgressTicker){
  window.__fabdProgressTicker=setInterval(()=>{try{renderMatchesProgress();}catch(e){console.warn('[progressTicker]',e);}},60000);
}

// Busca sem diferenciar maiusculas nem acento ("jose" acha "José")
function normSearch(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
}

// Botões da situação, com a contagem das linhas da lista no dia escolhido
function _mtChips() {
  const el=document.getElementById('match-status-chips');
  if(!el)return;
  const st=document.getElementById('match-status-filter')?.value||'';
  const dayVal=document.getElementById('match-day-filter')?.value||'';
  const rows=[...document.querySelectorAll('#matches-table-body tr[data-status]')].map(r=>({status:r.dataset.status,day:r.dataset.day||''}));
  const c=mtStatusCounts(rows,dayVal);
  el.innerHTML=MT_STATUS_CHIPS.map(([v,rot])=>`<button type="button" class="mt-chip${v===st?' active':''}" data-st="${esc(v)}" data-action="setMatchStatusFilter" data-arg-1="${esc(v)}">${esc(rot)}<em>${c[v]}</em></button>`).join('');
}

function setMatchStatusFilter(v) {
  const f=document.getElementById('match-status-filter');
  if(f)f.value=v||'';
  _mtChips();
  filterMatches();
}

// Nenhum jogo com o filtro: aviso na lista (os finalizados ficam na aba Finalizadas)
function _mtNoneRow(visiveis, st) {
  const tb=document.getElementById('matches-table-body');
  if(!tb)return;
  let r=tb.querySelector('tr.mt-none');
  if(visiveis||!tb.querySelector('tr[data-status]')){if(r)r.remove();return;}
  if(!r){r=document.createElement('tr');r.className='mt-none';tb.prepend(r);}
  r.innerHTML=`<td colspan="10">${st==='Finalizada'?'Os jogos finalizados ficam na aba Finalizadas.':'Nenhum jogo com esse filtro.'}</td>`;
}

let _filterMatchesTimer = null;
function filterMatches() {
  if (_filterMatchesTimer) clearTimeout(_filterMatchesTimer);
  _filterMatchesTimer = setTimeout(() => {
    const q=normSearch(document.getElementById('search-matches')?.value||'');
    const st=document.getElementById('match-status-filter')?.value||'';
    const dayVal=document.getElementById('match-day-filter')?.value||'';
    // Primeiro: filtrar jogos normais
    const visibleTimes = new Set();
    let visiveis = 0;
    document.querySelectorAll('#matches-table-body tr:not(.court-free-row):not(.mt-empty):not(.mt-none)').forEach(r=>{
      const matchQ=!q||(r.dataset.search??normSearch(r.textContent)).includes(q);
      const matchSt=!st||(r.dataset.status||'')===st;
      const matchDay=!dayVal||(r.dataset.day||'')===dayVal; // dia do JOGO (rodadas por dia)
      const visible = matchQ&&matchSt&&matchDay;
      r.style.display=visible?'':'none';
      // Rastrear horarios visiveis para mostrar/esconder quadras livres
      if (visible) {
        visiveis++;
        const timeTd = r.querySelectorAll('td')[1];
        if (timeTd) visibleTimes.add(timeTd.textContent.trim());
      }
    });
    // Segundo: mostrar/esconder quadras livres baseado no filtro de dia
    document.querySelectorAll('#matches-table-body tr.court-free-row').forEach(r=>{
      const matchDay = !dayVal || (r.dataset.day||'') === dayVal;
      r.style.display = matchDay ? '' : 'none';
    });
    _mtNoneRow(visiveis, st);
    // Um dia escolhido: a data embaixo da hora sai (seria igual em todas as linhas)
    document.getElementById('matches-table')?.classList.toggle('is-one-day', !!dayVal);
    // Botões da situação: contagem do dia escolhido
    _mtChips();
    // Painel de progresso acompanha o dia escolhido
    renderMatchesProgress();
  }, 150);
}

let _filterFinishedTimer=null;
function filterFinished(){
  if(_filterFinishedTimer)clearTimeout(_filterFinishedTimer);
  _filterFinishedTimer=setTimeout(()=>{
    const q=normSearch(document.getElementById('search-finished')?.value||'');
    document.querySelectorAll('#finished-table-body tr').forEach(r=>{
      r.style.display=normSearch(r.textContent).includes(q)?'':'none';
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
  const vazio=t=>`<tr class="mt-empty"><td colspan="12">${t}</td></tr>`;
  if(!tournament?.matches?.length){tb.innerHTML=vazio('Sem partidas finalizadas.');return;}
  const finished=tournament.matches.filter(m=>isMatchDone(m))
    .slice().sort((a,b)=>(new Date(b.finishedAt||0).getTime())-(new Date(a.finishedAt||0).getTime()));
  if(!finished.length){tb.innerHTML=vazio('Sem partidas finalizadas.');return;}
  // Um lado: cada atleta numa linha (o " / " fica no texto, pra busca de sempre)
  const lado=(m,k)=>`<div class="mt-pl${m.winner===k?' is-win':''}">${mtNames(k===1?m.player1:m.player2).map(n=>`<span class="mt-nm">${esc(n)}</span>`).join('<span class="mt-sep"> / </span>')}</div>`;
  let h='';
  finished.forEach(m=>{
    const i=tournament.matches.indexOf(m);
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
    if(isSpecialResult(m)){
      scoreHtml=`<span class="mt-res" style="color:${resultColor(m.status)}">${esc(resultText(m))}</span>`;
    } else if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
      scoreHtml=_mtGames(m.score);
    } else {
      scoreHtml=`<span class="mt-res is-red">${esc(m.score||'-')}</span>`;
    }
    const editBtn=`<button class="btn-icon" data-action="showEditFinishedModal" data-arg-1="${i}" title="Editar placar, arbitro e quadra">${icon('pencil')}</button>`;
    const resetBtn=`<button class="btn-soft is-gray" data-action="resetMatch" data-arg-1="${i}" title="Desfazer resultado">${icon('rotate-ccw')}Desfazer</button>`;
    h+=`<tr><td class="mt-num">${m.num}</td><td class="mt-draw"><b>${esc(m.drawName)}</b><small>${esc(m.roundName||'R'+m.round)}</small></td><td>${lado(m,1)}</td><td>${scoreHtml}</td><td>${lado(m,2)}</td><td>${esc(m.court||'-')}</td><td>${esc(m.umpire||'-')}</td><td class="mt-t">${startTime}</td><td class="mt-t">${endTime}</td><td class="mt-t">${duration}</td><td>${_mtStatusPill(m.status)}</td><td class="acts">${editBtn}${resetBtn}</td></tr>`;
  });
  tb.innerHTML=h;
}

function renderUmpireStats(){
  const tb=document.getElementById('umpires-stats-body');
  const vazio=t=>`<tr class="mt-empty"><td colspan="3">${t}</td></tr>`;
  if(!tournament?.matches?.length){tb.innerHTML=vazio('Sem partidas.');return;}
  // Contar jogos por arbitro
  const stats={};
  tournament.matches.forEach(m=>{
    if(!m.umpire)return;
    if(!stats[m.umpire])stats[m.umpire]={total:0,matches:[]};
    stats[m.umpire].total++;
    stats[m.umpire].matches.push(`#${m.num} ${m.player1||'?'} vs ${m.player2||'?'}`);
  });
  const entries=Object.entries(stats).sort((a,b)=>b[1].total-a[1].total);
  if(!entries.length){tb.innerHTML=vazio('Nenhum árbitro atribuído.');return;}
  let h='';
  entries.forEach(([name,data])=>{
    h+=`<tr><td class="mt-ump">${esc(name)}</td><td><span class="pill is-sched">${data.total}</span></td><td class="mt-ump-list">${data.matches.map(x=>esc(x)).join(', ')}</td></tr>`;
  });
  tb.innerHTML=h;
}

// Quadras: o jogo "Em Quadra" de cada uma (1 por quadra), com o placar ao vivo do árbitro
function renderCourtsPanel() {
  const panel=document.getElementById('courts-panel');
  if(!panel||!tournament)return;
  const nc=tournament.courts||4,cn=tournament.courtNames||[],matches=tournament.matches||[];
  panel.style.gridTemplateColumns=`repeat(${Math.min(nc,5)},minmax(0,1fr))`;
  let h='';
  for(let c=0;c<nc;c++){
    const name=cn[c]||`Quadra ${c+1}`;
    // Mostrar SOMENTE o jogo que esta "Em Quadra" nesta quadra (1 por quadra)
    const m=matches.find(x=>x.court===name&&x.status==='Em Quadra');
    if(!m){
      h+=`<div class="qc is-free" data-court="${esc(name)}"><div class="qc-h"><b>${esc(name)}</b><span class="qc-st">Livre</span></div><div class="qc-b qc-empty">Quadra livre</div></div>`;
      continue;
    }
    const lv=mtLiveScore(m);
    const ev=[m.drawName,m.roundName||''].filter(Boolean).join(' · ');
    const pt=k=>lv?lv['p'+k]:'–';
    const ft=(lv?lv.games.map(g=>`<i>${esc(g)}</i>`).join('')+`<span>${lv.gameNo}º game</span>`:(m.score?`<i>${esc(formatScoreByGames(m.score))}</i>`:''))
      +(m.umpire?`<span>Árbitro: ${esc(m.umpire)}</span>`:'');
    h+=`<div class="qc is-live" data-court="${esc(name)}"><div class="qc-h"><b>${esc(name)}</b><span class="qc-j">· Jogo ${m.num}</span><span class="qc-lv"><s></s>Ao vivo</span></div>`
      +`<div class="qc-b"><div class="qc-ev">${esc(ev)}</div>`
      +`<div class="qc-cx"><span class="nm">${esc(m.player1||'')}</span><b>${esc(pt(1))}</b><span class="nm">${esc(m.player2||'')}</span><b>${esc(pt(2))}</b></div>`
      +(ft?`<div class="qc-ft">${ft}</div>`:'')+`</div></div>`;
  }
  panel.innerHTML=h;
}
