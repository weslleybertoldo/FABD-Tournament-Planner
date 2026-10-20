// =====================================================================
// Schedule — render do schedule (aba "Agenda"), schedule por dia,
// helper de mapeamento de matches→dia.
// Inclui ensureDayScheduleDraws (sync de daySchedule.draws com lista
// de chaves do torneio — mutador de tournament.daySchedule mas NAO
// toca matches nem brackets).
// NAO INCLUI assignAutoTimes (mutador de tournament.matches — risco
// alto, fica em app.js).
// Issue #14 sub-tarefa 14.H — auditoria 2026-05-09.
// =====================================================================

// Layout novo (W20 parte 7): botões "Todos os jogos" (1º) e um por dia. Todos =
// a lista de sempre com o cartão novo; dia = grade horário × quadra com os
// mesmos jogos. Só a apresentação muda; os dados e as ações são os de sempre.
let _agendaView = 'all';

function setAgendaView(v) {
  _agendaView = v === 'all' ? 'all' : Number(v);
  renderSchedule();
}

const _AG_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function agendaDayLabel(iso) {
  if (!iso) return { curto: '-', longo: '-' };
  const d = new Date(iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  const nome = _AG_DIAS[d.getDay()];
  return { curto: `${nome.slice(0, 3)} ${dd}/${mm}`, longo: `${nome}, ${dd}/${mm}/${d.getFullYear()}` };
}

// Linhas da grade do dia: jogo com quadra na coluna dela, sem quadra na 1ª
// coluna livre; mais jogos que quadras no mesmo horário = outra linha do mesmo
// horário (nenhum some). Jogo sem horário fica fora (vai embaixo da grade).
function agendaGridRows(dayMatches, nc, courtNames) {
  const cn = courtNames || [];
  const col = c => {
    if (!c) return -1;
    const i = cn.indexOf(c);
    if (i >= 0) return i;
    const k = /(\d+)\s*$/.exec(c);
    return k ? Number(k[1]) - 1 : -1;
  };
  const comHora = dayMatches.filter(m => m.time).sort((a, b) => timeToMin(a.time) - timeToMin(b.time) || (a.num || 0) - (b.num || 0));
  const linhas = [];
  [...new Set(comHora.map(m => m.time))].forEach(t => {
    const doHorario = comHora.filter(m => m.time === t);
    const rows = [];
    const novaLinha = () => { const r = { time: t, cells: new Array(nc).fill(null) }; rows.push(r); return r; };
    novaLinha();
    const resto = [];
    doHorario.forEach(m => {
      const q = col(m.court);
      if (q >= 0 && q < nc && !rows[0].cells[q]) rows[0].cells[q] = m; else resto.push(m);
    });
    resto.forEach(m => {
      let r = rows.find(x => x.cells.includes(null));
      if (!r) r = novaLinha();
      r.cells[r.cells.indexOf(null)] = m;
    });
    linhas.push(...rows);
  });
  return linhas;
}

function _agStatus(m) {
  if (isMatchDone(m)) return ['is-done', 'Finalizada'];
  if (m.status === 'Em Quadra') return ['is-live', 'Em quadra'];
  if (m.status === 'A definir') return ['is-tbd', 'A definir'];
  return ['is-pend', 'Pendente'];
}

function _agSides(m) {
  // Provisorio da eliminatoria: grupo que ja acabou mostra o nome do classificado
  const _d = !m.player1 || !m.player2 ? (tournament.draws || []).find(x => x.name === m.drawName) : null;
  const _disp = (raw, disp) => raw ? (disp || raw) : resolveGroupQualifierLabel(_d, disp || 'A definir');
  return [esc(_disp(m.player1, m.player1Display)), esc(_disp(m.player2, m.player2Display))];
}

function renderSchedule() {
  if(!tournament){document.getElementById('schedule-no-tournament').style.display='block';document.getElementById('schedule-content').style.display='none';return;}
  document.getElementById('schedule-no-tournament').style.display='none';document.getElementById('schedule-content').style.display='block';
  const container=document.getElementById('schedule-grid-container'),infoEl=document.getElementById('schedule-info');
  _svMarks=scheduleValidationRun().byMatch; // ⚠ nos cartoes (Validar programacao)
  const nc=tournament.courts||4,cn=tournament.courtNames||[],matches=tournament.matches||[];
  // Garantir que daySchedule tem draws preenchidos
  ensureDayScheduleDraws();
  const days=tournament.daySchedule||[];
  if(_agendaView!=='all'&&!days[_agendaView])_agendaView='all';
  const viewsEl=document.getElementById('schedule-views');
  if(viewsEl){
    let vh=`<div class="tab${_agendaView==='all'?' active':''}" data-view="all" data-action="setAgendaView" data-arg-1="all">${icon('list')}Todos os jogos<em>${matches.length}</em></div>`;
    days.forEach((day,i)=>{
      const n=matches.filter(m=>getMatchDay(m)===day).length;
      vh+=`<div class="tab${_agendaView===i?' active':''}" data-view="${i}" data-action="setAgendaView" data-arg-1="${i}">${esc(agendaDayLabel(day.date).curto)}<em>${n} jogos</em></div>`;
    });
    viewsEl.innerHTML=vh;
  }
  if(!matches.length){container.innerHTML=`<div class="empty-state">${icon('calendar-days','i es-ic')}<h3>Sem partidas agendadas</h3></div>`;if(infoEl)infoEl.textContent='';return;}
  const startT=tournament.startTime||'08:00',endT=tournament.endTime||'18:00',dur=tournament.matchDuration||30;
  const bS=tournament.breakStart||'12:00',bE=tournament.breakEnd||'13:30';
  const end=timeToMin(endT),bs=timeToMin(bS);
  if(_agendaView!=='all'){
    const day=days[_agendaView];
    if(infoEl)infoEl.textContent=`${day.startTime||startT} às ${day.endTime||endT} · ${nc} quadras · jogo a cada ${dur} min`;
    container.innerHTML=renderAgendaGrid(day,_agendaView,nc,cn,matches);
    return;
  }
  if(infoEl){const done=matches.filter(m=>isMatchDone(m)).length;infoEl.textContent=`${matches.length} jogos · ${done} finalizados`;}
  const pausa=(a,b)=>`<div class="sch-pause">Pausa · ${esc(a)} às ${esc(b)}</div>`;
  const livre=(t,q)=>`<div class="sch-free"><span class="sch-time">${esc(t)}</span>${esc(cn[q]||`Quadra ${q+1}`)} · livre</div>`;
  const porHora=(a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;};
  // Lista de um bloco de jogos (dia ou sem dia), com a pausa e as quadras livres de cada horario
  const lista=(sorted,brk,brkA,brkB)=>{
    let r='',pausaRendered=false,lastTime='',matchesAtTime=0;
    sorted.forEach((m,si)=>{
      const mTime=m.time?timeToMin(m.time):0;
      if(brk!==null&&!pausaRendered&&m.time&&mTime>=brk){pausaRendered=true;r+=pausa(brkA,brkB);}
      if(m.time&&m.time!==lastTime){
        if(lastTime&&matchesAtTime<nc)for(let q=matchesAtTime;q<nc;q++)r+=livre(lastTime,q);
        lastTime=m.time;matchesAtTime=0;
      }
      matchesAtTime++;
      r+=renderScheduleMatch(m);
      if(si===sorted.length-1&&m.time&&matchesAtTime<nc)for(let q=matchesAtTime;q<nc;q++)r+=livre(m.time,q);
    });
    if(brk!==null&&!pausaRendered&&sorted.length&&brk<end)r+=pausa(brkA,brkB);
    return r;
  };
  let h='';
  if(days.length){
    // Agrupar matches pelo dia de CADA jogo (rodadas por dia; antes pela
    // chave: 2 dias "Todas" repetiam todos os jogos nos 2 dias)
    days.forEach((day,dayIdx)=>{
      const dayMatches=matches.filter(m=>getMatchDay(m)===day);
      if(!dayMatches.length)return;
      h+=`<div class="sch-day"><b>Dia ${dayIdx+1} · ${esc(agendaDayLabel(day.date).longo)}</b><span>${esc(day.startTime||'08:00')} às ${esc(day.endTime||'18:00')} · ${dayMatches.length} jogos</span></div>`;
      // v4.2: dia com noBreak NAO renderiza o badge PAUSA
      h+=lista([...dayMatches].sort(porHora),day.noBreak?null:timeToMin(day.breakStart||bS),day.breakStart||bS,day.breakEnd||bE);
    });
    // Matches sem dia atribuido
    const unassigned=matches.filter(m=>!getMatchDay(m));
    if(unassigned.length){
      h+=`<div class="sch-day is-none"><b>Sem dia definido</b><span>${unassigned.length} jogos</span></div>`;
      unassigned.sort(porHora).forEach(m=>{h+=renderScheduleMatch(m);});
    }
  } else {
    // Sem daySchedule: layout original
    h+=lista([...matches].sort(porHora),bs,bS,bE);
  }
  container.innerHTML=h;
}

function renderScheduleMatch(m){
  const [st,rot]=_agStatus(m);
  const [p1,p2]=_agSides(m);
  let scoreHtml='';
  if(isSpecialResult(m)){
    scoreHtml=`<span class="sch-score" style="color:${resultColor(m.status)}">${esc(resultText(m))}</span>`;
  } else if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
    scoreHtml=`<span class="sch-score">${esc(formatScoreByGames(m.score))}</span>`;
  } else if(m.score==='W.O.'||m.score==='DSQ'||m.score==='RET'){
    scoreHtml=`<span class="sch-score is-red">${esc(m.score)}</span>`;
  } else {
    scoreHtml='<span class="sch-x">×</span>';
  }
  const quadra=m.court?`<span class="sch-court">${esc(m.court)}</span>`:(st==='is-pend'?'<span class="sch-court is-tbd">quadra a definir</span>':'');
  return `<div class="sch-card ${st}">
    <div class="sch-top"><div class="sch-meta"><span class="sch-num">Jogo ${m.num}${scheduleValidationIcon(_svMarks,m)}</span><span class="sch-time">${esc(m.time||'-')}</span><span class="sch-draw">${esc(m.drawName)}</span><span class="sch-rd">${esc(m.roundName||'R'+m.round)}</span></div>
    <div class="sch-tags">${quadra}${m.umpire?`<span class="sch-ump">${esc(m.umpire)}</span>`:''}<span class="pill sch-st ${st}"><s></s>${rot}</span></div></div>
    <div class="sch-mid"><span class="sch-p${m.winner===1?' is-win':''}">${p1}</span>${scoreHtml}<span class="sch-p${m.winner===2?' is-win':''}">${p2}</span></div>
  </div>`;
}

function _agCell(m){
  const [st]=_agStatus(m);
  const [p1,p2]=_agSides(m);
  const sc=isSpecialResult(m)?esc(resultText(m)):(m.score&&m.score!=='-')?esc(m.score==='W.O.'||m.score==='DSQ'||m.score==='RET'?m.score:formatScoreByGames(m.score)):'';
  return `<div class="ag-cell ${st}"><div class="ag-c1"><span class="sch-num">Jogo ${m.num}${scheduleValidationIcon(_svMarks,m)}</span><span class="ag-d">${esc(m.drawName)} · ${esc(m.roundName||'R'+m.round)}</span>${sc?`<span class="ag-sc">${sc}</span>`:''}</div>
    <div class="ag-p${m.winner===1?' is-win':''}">${p1}</div><div class="ag-p${m.winner===2?' is-win':''}"><i>×</i> ${p2}</div>${!m.court&&st==='is-pend'?'<span class="ag-q">quadra a definir</span>':''}</div>`;
}

function renderAgendaGrid(day,dayIdx,nc,cn,matches){
  const dm=matches.filter(m=>getMatchDay(m)===day);
  const bS=day.breakStart||tournament.breakStart||'12:00',bE=day.breakEnd||tournament.breakEnd||'13:30',bs=timeToMin(bS);
  let h=`<div class="cd ag-grid" style="--nc:${nc}"><div class="ag-row ag-head"><span></span>${Array.from({length:nc},(_,q)=>`<b>${esc(cn[q]||`Quadra ${q+1}`)}</b>`).join('')}</div>`;
  let pausa=day.noBreak;
  agendaGridRows(dm,nc,cn).forEach((l,i,arr)=>{
    if(!pausa&&timeToMin(l.time)>=bs){pausa=true;h+=`<div class="ag-pause">Pausa · ${esc(bS)} às ${esc(bE)}</div>`;}
    const rep=i>0&&arr[i-1].time===l.time;
    h+=`<div class="ag-row"><span class="ag-t">${rep?'':esc(l.time)}</span>${l.cells.map(m=>m?_agCell(m):'<div class="ag-free">livre</div>').join('')}</div>`;
  });
  const semHora=dm.filter(m=>!m.time);
  if(semHora.length)h+=`<div class="ag-row ag-nohour"><span class="ag-t">Sem horário</span><div class="ag-list">${semHora.map(_agCell).join('')}</div></div>`;
  if(!dm.length)h+=`<div class="empty-state">${icon('calendar-days','i es-ic')}<h3>Nenhum jogo neste dia</h3></div>`;
  return h+'</div>';
}

// === DRAW WIZARD ===

function renderDaySchedule(){
  if(!tournament)return;
  const container=document.getElementById('tc-day-schedule-container');
  const days=getDaysBetween(tournament.startDate,tournament.endDate);
  if(!days.length){container.innerHTML='<div style="color:var(--fabd-gray-500);text-align:center;padding:24px">Defina as datas do torneio para configurar a programacao por dia.</div>';return;}
  const existing=tournament.daySchedule||[];
  const drawNames=(tournament.draws||[]).map(d=>d.name);
  // Separar simples e duplas
  const simples=drawNames.filter(n=>n.startsWith('SM ')||n.startsWith('SF '));
  const duplas=drawNames.filter(n=>n.startsWith('DM ')||n.startsWith('DF ')||n.startsWith('DX '));
  let h='';
  days.forEach((date,idx)=>{
    const saved=existing.find(d=>d.date===date)||{};
    const dObj=new Date(date+'T00:00:00');
    const label=`Dia ${idx+1} - ${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}/${dObj.getFullYear()}`;
    const st=saved.startTime||tournament.startTime||'08:00';
    const et=saved.endTime||tournament.endTime||'18:00';
    const bs=saved.breakStart||tournament.breakStart||'12:00';
    const be=saved.breakEnd||tournament.breakEnd||'13:30';
    const mode=saved.mode||'todas';
    h+=`<div style="background:var(--fabd-gray-100);border-radius:8px;padding:16px;margin-bottom:12px" data-day-date="${date}">`;
    h+=`<h4 style="margin-bottom:12px;color:var(--fabd-blue)">${label}</h4>`;
    const noBreak = !!saved.noBreak;
    h+=`<div class="form-row">`;
    h+=`<div class="form-group"><label>Inicio</label><input type="time" class="form-control ds-start" value="${st}"></div>`;
    h+=`<div class="form-group"><label>Termino</label><input type="time" class="form-control ds-end" value="${et}"></div>`;
    h+=`<div class="form-group" style="max-width:100px"><label>Pausa inicio</label><input type="time" class="form-control ds-break-start" value="${bs}" ${noBreak?'disabled':''}></div>`;
    h+=`<div class="form-group" style="max-width:100px"><label>Pausa fim</label><input type="time" class="form-control ds-break-end" value="${be}" ${noBreak?'disabled':''}></div>`;
    h+=`<div class="form-group" style="display:flex;align-items:flex-end"><label style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:${noBreak?'#2563EB':'#fff'};color:${noBreak?'#fff':'#333'};border-radius:8px;border:2px solid ${noBreak?'#2563EB':'#cbd5e1'};cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap"><input type="checkbox" class="ds-no-break" ${noBreak?'checked':''} style="display:none">Sem pausa</label></div>`;
    h+=`</div>`;
    h+=`<div style="margin-top:12px"><label style="font-weight:600;font-size:13px;margin-bottom:8px;display:block">Modalidades neste dia:</label>`;
    h+=`<div style="display:flex;gap:12px;flex-wrap:wrap">`;
    h+=`<label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;background:${mode==='todas'?'#2563EB':'#fff'};color:${mode==='todas'?'#fff':'#333'};border-radius:8px;border:2px solid ${mode==='todas'?'#2563EB':'#cbd5e1'}"><input type="radio" name="ds-mode-${idx}" class="ds-mode" value="todas" ${mode==='todas'?'checked':''} style="display:none"> Todas as categorias</label>`;
    h+=`<label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;background:${mode==='simples'?'#2563EB':'#fff'};color:${mode==='simples'?'#fff':'#333'};border-radius:8px;border:2px solid ${mode==='simples'?'#2563EB':'#cbd5e1'}"><input type="radio" name="ds-mode-${idx}" class="ds-mode" value="simples" ${mode==='simples'?'checked':''} style="display:none"> Simples (SM/SF)</label>`;
    h+=`<label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;background:${mode==='duplas'?'#2563EB':'#fff'};color:${mode==='duplas'?'#fff':'#333'};border-radius:8px;border:2px solid ${mode==='duplas'?'#2563EB':'#cbd5e1'}"><input type="radio" name="ds-mode-${idx}" class="ds-mode" value="duplas" ${mode==='duplas'?'checked':''} style="display:none"> Duplas (DM/DF/DX)</label>`;
    h+=`</div>`;
    // Mostrar quais categorias ficam neste dia
    const modeDraws=mode==='simples'?simples:mode==='duplas'?duplas:drawNames;
    if(modeDraws.length)h+=`<div style="margin-top:8px;font-size:12px;color:var(--fabd-gray-500)">Categorias: ${modeDraws.map(esc).join(', ')}</div>`;
    h+=`</div></div>`;
  });
  container.innerHTML=h+renderRoundDaysTable(days);
  // Listener: ao trocar radio, salvar estado atual e re-renderizar
  container.querySelectorAll('.ds-mode').forEach(r=>{
    r.addEventListener('change',()=>{
      tournament.daySchedule=collectDaySchedule();
      tournament.roundDays=collectRoundDays();
      renderDaySchedule();
    });
  });
  // Listener "Sem pausa": re-render pra disable/enable os inputs
  container.querySelectorAll('.ds-no-break').forEach(c=>{
    c.addEventListener('change',()=>{
      tournament.daySchedule=collectDaySchedule();
      tournament.roundDays=collectRoundDays();
      renderDaySchedule();
    });
  });
}

// Rodadas por dia (Weslley, 18/10/2026): 1 linha por chave
// sorteada, 1 seletor por rodada ("Automatico" = o dia da modalidade, igual
// antes). Grava tournament.roundDays[chave][fase] = data (scheduleDayOf).
function renderRoundDaysTable(dates){
  if(dates.length<2)return '';
  const rd=tournament.roundDays||{};
  const byDraw={};
  (tournament.matches||[]).forEach(m=>{
    const st=scheduleStageOf(m), r=(byDraw[m.drawName]=byDraw[m.drawName]||{});
    if(!(st in r))r[st]=st===0?'Grupos':(m.roundName||`Rodada ${st}`);
  });
  const box='background:var(--fabd-gray-100);border-radius:8px;padding:16px;margin-bottom:12px';
  const names=Object.keys(byDraw);
  if(!names.length)return `<div style="${box};font-size:13px;color:var(--fabd-gray-500)">Rodadas por dia: sorteie as chaves pra escolher o dia de cada rodada.</div>`;
  let h=`<div style="${box}"><h4 style="margin-bottom:4px;color:var(--fabd-blue)">Rodadas por dia</h4><div style="font-size:12px;color:var(--fabd-gray-500);margin-bottom:12px">Escolha em que dia vai cada rodada. "Automático" = o dia da modalidade ou, se uma rodada anterior foi escolhida, o dia dela.</div>`;
  names.forEach(n=>{
    h+=`<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #e5e7eb"><strong style="min-width:140px;font-size:13px">${esc(n)}</strong>`;
    Object.keys(byDraw[n]).map(Number).sort((a,b)=>a-b).forEach(st=>{
      const cur=(rd[n]||{})[st]||'';
      h+=`<label style="font-size:12px;display:flex;align-items:center;gap:4px">${esc(byDraw[n][st])}<select class="form-control rd-select" data-draw="${esc(n)}" data-stage="${st}" style="width:auto;padding:2px 4px;font-size:12px"><option value="">Automático</option>${dates.map((d,i)=>`<option value="${d}"${cur===d?' selected':''}>Dia ${i+1}</option>`).join('')}</select></label>`;
    });
    h+=`</div>`;
  });
  return h+`</div>`;
}

function collectRoundDays(){
  const out={};
  document.querySelectorAll('#tc-day-schedule-container .rd-select').forEach(s=>{
    if(s.value)(out[s.dataset.draw]=out[s.dataset.draw]||{})[s.dataset.stage]=s.value;
  });
  return out;
}

function collectDaySchedule(){
  const panels=document.querySelectorAll('#tc-day-schedule-container [data-day-date]');
  const drawNames=(tournament?.draws||[]).map(d=>d.name);
  const simples=drawNames.filter(n=>n.startsWith('SM ')||n.startsWith('SF '));
  const duplas=drawNames.filter(n=>n.startsWith('DM ')||n.startsWith('DF ')||n.startsWith('DX '));
  const schedule=[];
  panels.forEach(panel=>{
    const date=panel.dataset.dayDate;
    const startTime=panel.querySelector('.ds-start')?.value||'08:00';
    const endTime=panel.querySelector('.ds-end')?.value||'18:00';
    const noBreak=!!panel.querySelector('.ds-no-break')?.checked;
    // v4.2: noBreak=true → bs=be=00:00 (janela vazia, todos os checks de pausa
    // viram no-op naturalmente — assignAutoTimes/regenerateDrawSchedule/render).
    const breakStart=noBreak?'00:00':(panel.querySelector('.ds-break-start')?.value||'12:00');
    const breakEnd=noBreak?'00:00':(panel.querySelector('.ds-break-end')?.value||'13:30');
    const modeEl=panel.querySelector('.ds-mode:checked');
    const mode=modeEl?.value||'todas';
    const draws=mode==='simples'?simples:mode==='duplas'?duplas:drawNames;
    schedule.push({date,startTime,endTime,breakStart,breakEnd,noBreak,mode,draws});
  });
  return schedule;
}

// Recalcular draws de cada dia baseado no mode (corrige draws vazios)
function ensureDayScheduleDraws() {
  if (!tournament?.daySchedule?.length || !tournament?.draws?.length) return;
  const drawNames = tournament.draws.map(d => d.name);
  const simples = drawNames.filter(n => n.startsWith('SM ') || n.startsWith('SF '));
  const duplas = drawNames.filter(n => n.startsWith('DM ') || n.startsWith('DF ') || n.startsWith('DX '));
  tournament.daySchedule.forEach(day => {
    const mode = day.mode || 'todas';
    // Recalcular draws se estao vazios ou se o numero de chaves mudou
    if (!day.draws?.length || day.draws.length === 0) {
      day.draws = mode === 'simples' ? [...simples] : mode === 'duplas' ? [...duplas] : [...drawNames];
    }
  });
}

function getMatchDay(match){
  if(!tournament?.daySchedule?.length)return null;
  ensureDayScheduleDraws();
  // Dia do JOGO (fases por dia; antes: pelo modo + prefixo, e 2 dias "todas" davam tudo no dia 1)
  const i=scheduleDayOf(match,tournament.daySchedule,tournament.roundDays);
  return i>=0?tournament.daySchedule[i]:null;
}

// ---------------------------------------------------------------------
// Validar programacao — janela da Agenda (Weslley, 19/10/2026; nucleo puro em
// schedule-validation.js): Dia, lista agrupada por checagem, aba Configuracoes
// (tournament.scheduleValidation; nao vai pro Supabase), Ver jogo / Ver chave /
// Imprimir. So sob demanda e nao bloqueia nada. O ⚠ das regras da agenda
// aparece em Partidas e na Agenda.
// ---------------------------------------------------------------------
let _svRows = [], _svSel = -1, _svMarks = null;

function scheduleValidationSettingsNow() {
  return scheduleValidationSettings(tournament.scheduleValidation, tournament.restMinBetweenGames || 20);
}

// Problemas da programacao do torneio ativo: { rows, byMatch }
function scheduleValidationRun() {
  ensureDayScheduleDraws();
  const days = tournament.daySchedule || [];
  return scheduleValidate(tournament.matches || [], {
    days, roundDays: tournament.roundDays,
    gridOf: i => dayGridCfg(i >= 0 ? days[i] : null),
    drawOf: m => (tournament.draws || []).find(d => d.name === m.drawName) || null,
    settings: scheduleValidationSettingsNow(),
  });
}

// ⚠ do jogo com problema na programacao (Partidas e Agenda); o title lista os problemas
function scheduleValidationIcon(marks, m) {
  const t = marks && marks.get(m);
  if (!t || !t.length) return '';
  return `<span class="sv-warn" title="${esc('Programação:\n' + t.map(x => '⚠ ' + x).join('\n'))}">${icon('triangle-alert')}</span>`;
}

function _svDayLabel(i) {
  const days = tournament.daySchedule || [];
  if (i < 0) return days.length ? 'Sem dia definido' : 'Todos os jogos';
  return `Dia ${i + 1} - ${fmtDate(days[i].date)}`;
}

function showScheduleValidation() {
  if (!tournament) { showToast('Nenhum torneio ativo', 'warning'); return; }
  setScheduleValidationTab('list');
  openModal('modal-schedule-validation');
}

// Abas Lista / Configuracoes (voltar pra Lista recalcula)
function setScheduleValidationTab(tab) {
  const list = tab !== 'settings';
  document.getElementById('sv-list').style.display = list ? '' : 'none';
  document.getElementById('sv-settings').style.display = list ? 'none' : '';
  document.getElementById('sv-tab-list').className = 'btn btn-sm ' + (list ? 'btn-primary' : 'btn-secondary');
  document.getElementById('sv-tab-settings').className = 'btn btn-sm ' + (list ? 'btn-secondary' : 'btn-primary');
  if (list) renderScheduleValidation(); else renderScheduleValidationSettings();
}

function _svButtons() {
  const r = _svRows[_svSel];
  document.getElementById('sv-show-match').disabled = !(r && r.m);
  document.getElementById('sv-show-draw').disabled = !(r && r.drawName);
}

function renderScheduleValidation() {
  _svRows = scheduleValidationRun().rows;
  const days = tournament.daySchedule || [];
  const sel = document.getElementById('sv-day');
  const opts = days.map((_, i) => i);
  if (!days.length || _svRows.some(r => r.day < 0)) opts.push(-1);
  const prev = sel.value;
  sel.innerHTML = opts.map(i => `<option value="${i}">${esc(_svDayLabel(i))} (${_svRows.filter(r => r.day === i).length})</option>`).join('');
  sel.value = opts.map(String).includes(prev) ? prev : String(opts[0]);
  const day = Number(sel.value);
  _svSel = -1; _svButtons();
  const list = _svRows.map((r, idx) => ({ r, idx })).filter(o => o.r.day === day);
  const box = document.getElementById('sv-list');
  if (!list.length) { box.innerHTML = `<p class="sv-empty">${icon('circle-check')} Nenhum problema neste dia.</p>`; return; }
  let h = '<div class="sv-scroll"><table class="sv-table"><thead><tr><th>Nome</th><th>Chave</th><th>Rodada</th><th>Jogo</th><th>Hora</th><th>Coment&aacute;rio</th></tr></thead><tbody>';
  scheduleValidationGroups().forEach(g => {
    const rows = list.filter(o => o.r.grupo === g.id);
    if (!rows.length) return;
    h += `<tr class="sv-group ${g.regra ? 'sv-regra' : 'sv-extra'}"><td colspan="6"><span class="sv-gi">${icon(g.regra ? 'triangle-alert' : 'info')}</span>${esc(g.titulo)} (${rows.length})</td></tr>`;
    rows.forEach(({ r, idx }) => {
      h += `<tr class="sv-row" data-sv-idx="${idx}" data-action="selectScheduleValidationRow" data-event="click dblclick" data-arg-1="${idx}" data-arg-2="$event"><td>${esc(r.nome)}</td><td>${esc(r.drawName || '-')}</td><td>${esc(r.roundName || '-')}</td><td>${r.num != null ? '#' + r.num : '-'}</td><td>${esc(r.time || '-')}</td><td>${esc(r.texto)}</td></tr>`;
    });
  });
  box.innerHTML = h + '</tbody></table></div>';
}

// Clique seleciona a linha; duplo clique = Ver jogo
function selectScheduleValidationRow(idx, ev) {
  _svSel = Number(idx);
  document.querySelectorAll('#sv-list .sv-row').forEach(tr => tr.classList.toggle('selected', Number(tr.dataset.svIdx) === _svSel));
  _svButtons();
  if (ev && ev.type === 'dblclick') scheduleValidationShowMatch();
}

// Ver jogo: Partidas no dia do jogo, com a linha dele acesa
function scheduleValidationShowMatch() {
  const r = _svRows[_svSel]; if (!r || !r.m) return;
  const m = r.m;
  closeModal('modal-schedule-validation');
  navigateTo('matches');
  const df = document.getElementById('match-day-filter'); if (df) df.value = getMatchDay(m)?.date || '';
  const sf = document.getElementById('match-status-filter'); if (sf) sf.value = '';
  const sm = document.getElementById('search-matches'); if (sm) sm.value = '';
  filterMatches();
  const tr = document.querySelector(`#matches-table-body tr[data-match-id="${CSS.escape(String(m.id || ''))}"]`);
  if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('sv-flash'); setTimeout(() => tr.classList.remove('sv-flash'), 2600); }
}

// Ver chave: abre a chave na aba Chaves
function scheduleValidationShowDraw() {
  const r = _svRows[_svSel]; if (!r || !r.drawName) return;
  const idx = (tournament.draws || []).findIndex(d => d.name === r.drawName);
  if (idx < 0) return;
  closeModal('modal-schedule-validation');
  navigateTo('draws');
  selectDraw(idx);
}

function renderScheduleValidationSettings() {
  const st = scheduleValidationSettingsNow();
  const ev = 'data-action="onScheduleValidationSetting" data-event="change"';
  const chk = id => `<input type="checkbox" data-sv="${id}" ${st[id] ? 'checked' : ''} ${ev}>`;
  const num = (id, min, max, step) => `<input type="number" class="form-control sv-num" data-sv="${id}" value="${st[id]}" min="${min}" max="${max}" step="${step || 1}" ${ev}>`;
  const hora = id => `<input type="time" class="form-control sv-time" data-sv="${id}" value="${st[id]}" ${ev}>`;
  const linha = inner => `<label class="sv-opt">${inner}</label>`;
  document.getElementById('sv-settings').innerHTML =
    `<p class="sv-hint">Regras da agenda: marcam ${icon('triangle-alert')} no jogo em Partidas e na Agenda.</p>` +
    linha(`${chk('semHorario')} Jogo sem hor&aacute;rio`) +
    linha(`${chk('conflito')} Atleta em 2 jogos ao mesmo tempo`) +
    linha(`${chk('descanso')} Descanso m&iacute;nimo entre o fim de um jogo e o in&iacute;cio do outro: ${num('descansoMin', 0, 1440, 5)} min <span class="sv-hint">(no torneio: ${tournament.restMinBetweenGames || 20} min)</span>`) +
    linha(`${chk('quadras')} Mais jogos que quadras no mesmo hor&aacute;rio`) +
    linha(`${chk('ordem')} Fase da chave antes de acabar a anterior`) +
    linha(`${chk('horarioDoDia')} Fora do hor&aacute;rio do dia ou na pausa`) +
    '<p class="sv-hint" style="margin-top:14px">Outras checagens: s&oacute; aparecem nesta lista.</p>' +
    linha(`${chk('tardeCedo')} Termina tarde e come&ccedil;a cedo: jogo a partir das ${hora('tardeDepois')} e, no dia seguinte, at&eacute; as ${hora('cedoAntes')}`) +
    linha(`${chk('simplesDepoisDuplas')} Simples depois de duplas no mesmo dia`) +
    linha(`${chk('maxDia')} M&aacute;ximo de partidas por dia: ${num('maxDiaN', 1, 99)}`) +
    linha(`${chk('maxSimplesDia')} M&aacute;ximo de simples por dia: ${num('maxSimplesDiaN', 1, 99)}`) +
    linha(`${chk('maxChaveDia')} M&aacute;ximo de partidas por chave por dia: ${num('maxChaveDiaN', 1, 99)}`) +
    '<div style="margin-top:12px"><button class="btn btn-sm btn-secondary" data-action="resetScheduleValidationSettings">Voltar ao padr&atilde;o</button></div>';
}

async function _svSaveSettings(value) {
  if (value) tournament.scheduleValidation = value; else delete tournament.scheduleValidation;
  await window.api.saveTournament(tournament);
  renderScheduleValidationSettings();
  renderSchedule(); // ⚠ dos cartoes com as regras ligadas agora
}

function onScheduleValidationSetting() {
  const s = {};
  document.querySelectorAll('#sv-settings [data-sv]').forEach(el => { s[el.dataset.sv] = el.type === 'checkbox' ? el.checked : el.value; });
  return _svSaveSettings(scheduleValidationSettings(s, tournament.restMinBetweenGames || 20));
}

function resetScheduleValidationSettings() { return _svSaveSettings(null); }

function printScheduleValidation() { printReport('scheduleValidation'); }
