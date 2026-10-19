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

function renderSchedule() {
  if(!tournament){document.getElementById('schedule-no-tournament').style.display='block';document.getElementById('schedule-content').style.display='none';return;}
  document.getElementById('schedule-no-tournament').style.display='none';document.getElementById('schedule-content').style.display='block';
  const container=document.getElementById('schedule-grid-container'),infoEl=document.getElementById('schedule-info');
  const nc=tournament.courts||4,cn=tournament.courtNames||[],matches=tournament.matches||[];
  if(!matches.length){container.innerHTML='<div class="empty-state"><div class="icon">&#128197;</div><h3>Sem partidas agendadas</h3></div>';return;}
  const startT=tournament.startTime||'08:00',endT=tournament.endTime||'18:00',dur=tournament.matchDuration||30,rest=tournament.restMinBetweenGames||20;
  const bS=tournament.breakStart||'12:00',bE=tournament.breakEnd||'13:30',slot=dur+rest;
  const slots=[];let cur=timeToMin(startT);const end=timeToMin(endT),bs=timeToMin(bS),be=timeToMin(bE);
  while(cur<end){
    if(cur>=bs&&cur<be){cur=be;continue;}
    if(cur+dur>bs&&cur<bs){cur=be;continue;}
    slots.push(cur);cur+=slot;
  }
  if(infoEl){const done=matches.filter(m=>m.status==='Finalizada'||m.status==='WO').length;infoEl.textContent=`${matches.length} jogos | ${done} finalizados`;}

  // Garantir que daySchedule tem draws preenchidos
  ensureDayScheduleDraws();
  // Agrupar por dia se daySchedule existe
  const hasDaySchedule=tournament.daySchedule?.length>0;
  let h='';

  if(hasDaySchedule){
    // Agrupar matches pelo dia de CADA jogo (rodadas por dia; antes pela
    // chave: 2 dias "Todas" repetiam todos os jogos nos 2 dias)
    tournament.daySchedule.forEach((day,dayIdx)=>{
      const dayMatches=matches.filter(m=>getMatchDay(m)===day);
      if(!dayMatches.length)return;
      const dObj=new Date(day.date+'T00:00:00');
      const dayLabel=`Dia ${dayIdx+1} - ${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}/${dObj.getFullYear()}`;
      h+=`<div style="background:#1E3A8A;color:white;padding:12px 16px;border-radius:8px;margin-bottom:8px;font-weight:700;font-size:16px">${dayLabel} <span style="font-size:12px;font-weight:400;opacity:0.8">${day.startTime||'08:00'} - ${day.endTime||'18:00'}</span></div>`;
      const dayBs=timeToMin(day.breakStart||bS);const dayBe=timeToMin(day.breakEnd||bE);
      const sorted=[...dayMatches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
      let pausaRendered=false;
      // Agrupar por horario para detectar quadras livres
      let lastTime='';
      let matchesAtTime=0;
      sorted.forEach((m,si)=>{
        const mTime=m.time?timeToMin(m.time):0;
        // v4.2: dia com noBreak NAO renderiza o badge PAUSA
        if(!pausaRendered&&m.time&&mTime>=dayBs&&!day.noBreak){
          pausaRendered=true;
          h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${day.breakStart||bS} - ${day.breakEnd||bE})</div>`;
        }
        // Contar jogos por horario e mostrar quadras livres quando muda o horario
        if(m.time&&m.time!==lastTime){
          // Antes de mudar de horario, verificar quadras livres do horario anterior
          if(lastTime&&matchesAtTime<nc){
            const livres=nc-matchesAtTime;
            for(let q=0;q<livres;q++){
              const courtName=cn[matchesAtTime+q]||`Quadra ${matchesAtTime+q+1}`;
              h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${lastTime}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
            }
          }
          lastTime=m.time;
          matchesAtTime=0;
        }
        matchesAtTime++;
        h+=renderScheduleMatch(m);
        // Ultimo jogo do dia: verificar quadras livres
        if(si===sorted.length-1&&m.time&&matchesAtTime<nc){
          const livres=nc-matchesAtTime;
          for(let q=0;q<livres;q++){
            const courtName=cn[matchesAtTime+q]||`Quadra ${matchesAtTime+q+1}`;
            h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${m.time}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
          }
        }
      });
      if(!pausaRendered&&dayBs<end&&!day.noBreak)h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${day.breakStart||bS} - ${day.breakEnd||bE})</div>`;
    });
    // Matches sem dia atribuido
    const unassigned=matches.filter(m=>!getMatchDay(m));
    if(unassigned.length){
      h+=`<div style="background:#334155;color:white;padding:12px 16px;border-radius:8px;margin:16px 0 8px;font-weight:700">Sem dia definido</div>`;
      unassigned.sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;}).forEach(m=>{h+=renderScheduleMatch(m);});
    }
  } else {
    // Sem daySchedule: layout original
    const sorted=[...matches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
    let pausaRendered=false;
    let lastTimeSingle='';let matchesAtTimeSingle=0;
    sorted.forEach((m,si)=>{
      const mTime=m.time?timeToMin(m.time):0;
      if(!pausaRendered&&m.time&&mTime>=bs){
        pausaRendered=true;
        h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${bS} - ${bE})</div>`;
      }
      if(m.time&&m.time!==lastTimeSingle){
        if(lastTimeSingle&&matchesAtTimeSingle<nc){
          const livres=nc-matchesAtTimeSingle;
          for(let q=0;q<livres;q++){
            const courtName=cn[matchesAtTimeSingle+q]||`Quadra ${matchesAtTimeSingle+q+1}`;
            h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${lastTimeSingle}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
          }
        }
        lastTimeSingle=m.time;matchesAtTimeSingle=0;
      }
      matchesAtTimeSingle++;
      h+=renderScheduleMatch(m);
      if(si===sorted.length-1&&m.time&&matchesAtTimeSingle<nc){
        const livres=nc-matchesAtTimeSingle;
        for(let q=0;q<livres;q++){
          const courtName=cn[matchesAtTimeSingle+q]||`Quadra ${matchesAtTimeSingle+q+1}`;
          h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${m.time}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
        }
      }
    });
    if(!pausaRendered&&sorted.length&&bs<end)h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${bS} - ${bE})</div>`;
  }
  container.innerHTML=h;
}

function renderScheduleMatch(m){
  const done=m.status==='Finalizada'||m.status==='WO',eq=m.status==='Em Quadra',adef=m.status==='A definir';
  let bg='#fff';if(eq)bg='#FFF3E0';if(done)bg='#D1FAE5';if(adef)bg='#F9FAFB';
  const border=done?'#10B981':eq?'#F59E0B':adef?'var(--fabd-gray-300)':'var(--fabd-blue)';
  // Provisorio da eliminatoria: grupo que ja acabou mostra o nome do classificado
  const _d=!m.player1||!m.player2?(tournament.draws||[]).find(x=>x.name===m.drawName):null;
  const _disp=(raw,disp)=>raw?(disp||raw):resolveGroupQualifierLabel(_d,disp||'A definir');
  const p1=esc(_disp(m.player1,m.player1Display)),p2=esc(_disp(m.player2,m.player2Display));
  const p1Style=m.winner===1?'color:#10B981;font-weight:700':'font-weight:600';
  const p2Style=m.winner===2?'color:#10B981;font-weight:700':'font-weight:600';
  let scoreHtml='';
  if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
    scoreHtml=`<span style="color:var(--fabd-gray-700);font-weight:700;white-space:nowrap">${esc(formatScoreByGames(m.score))}</span>`;
  } else if(m.score==='W.O.'||m.score==='DSQ'||m.score==='RET'){
    scoreHtml=`<span style="color:var(--fabd-red);font-weight:700">${esc(m.score)}</span>`;
  } else {
    scoreHtml='<span style="color:var(--fabd-gray-400);font-weight:700">x</span>';
  }
  let r='';
  r+=`<div style="background:${bg};border-left:4px solid ${border};border-radius:8px;padding:12px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">`;
  r+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">`;
  r+=`<div style="display:flex;align-items:center;gap:12px">`;
  r+=`<span style="font-weight:700;color:var(--fabd-blue);font-size:14px">Jogo ${m.num}</span>`;
  r+=`<span style="font-size:12px;color:var(--fabd-gray-500)">${esc(m.time||'-')}</span>`;
  r+=`<span style="font-size:12px;color:var(--fabd-gray-500)">${esc(m.drawName)}</span>`;
  r+=`<span style="font-size:11px;color:var(--fabd-gray-500)">${esc(m.roundName||'R'+m.round)}</span>`;
  r+=`</div>`;
  r+=`<div style="display:flex;align-items:center;gap:8px">`;
  if(m.court)r+=`<span style="font-size:11px;background:var(--fabd-blue);color:white;padding:2px 8px;border-radius:4px">${esc(m.court)}</span>`;
  if(m.umpire)r+=`<span style="font-size:11px;background:var(--fabd-gray-200);color:var(--fabd-gray-700);padding:2px 8px;border-radius:4px">${esc(m.umpire)}</span>`;
  r+=`</div></div>`;
  r+=`<div style="display:flex;align-items:center;justify-content:center;gap:16px;font-size:15px">`;
  r+=`<span style="${p1Style}">${p1}</span>`;
  r+=`<span style="font-size:14px">${scoreHtml}</span>`;
  r+=`<span style="${p2Style}">${p2}</span>`;
  r+=`</div></div>`;
  return r;
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

// Rodadas por dia, igual ao BTP (Weslley, 18/10/2026): 1 linha por chave
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
  let h=`<div style="${box}"><h4 style="margin-bottom:4px;color:var(--fabd-blue)">Rodadas por dia</h4><div style="font-size:12px;color:var(--fabd-gray-500);margin-bottom:12px">Escolha em que dia vai cada rodada (igual ao BTP). "Automático" = o dia da modalidade ou, se uma rodada anterior foi escolhida, o dia dela.</div>`;
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

