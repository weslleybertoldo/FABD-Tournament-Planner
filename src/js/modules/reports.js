// =====================================================================
// Reports — funcoes de geracao de relatorios (HTML em nova janela).
// Leem globals (tournament, players, gameProfiles, scoringTables) e
// usam helpers (esc, safeHTML, fmtDate) que continuam em app.js.
// Sem mutacao de estado; sem manipulacao do DOM principal.
// Carregado ANTES de app.js — funcoes ficam disponiveis como globais.
// Issue #14 sub-tarefa 14.B — auditoria 2026-05-09.
// =====================================================================

function printReport(type){
  if(!tournament){showToast('Nenhum torneio ativo','warning');return;}
  const tName=esc(tournament.name);
  const tDate=fmtDate(tournament.startDate)+(tournament.endDate&&tournament.endDate!==tournament.startDate?' a '+fmtDate(tournament.endDate):'');
  const tLocation=esc(tournament.location||'')+' - '+esc(tournament.city||'');

  const reportStyles=`
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',Tahoma,sans-serif;font-size:13px;color:#1a1a1a;padding:20px 30px;}
      .report-header{text-align:center;margin-bottom:24px;border-bottom:3px solid #1E3A8A;padding-bottom:16px;}
      .report-header h1{font-size:20px;color:#1E3A8A;margin-bottom:4px;}
      .report-header h2{font-size:15px;color:#333;font-weight:600;margin-bottom:4px;}
      .report-header p{font-size:12px;color:#666;}
      .report-header .fabd-name{font-size:14px;color:#C41E2A;font-weight:700;letter-spacing:1px;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#1E3A8A;color:white;padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;}
      td{padding:5px 10px;border-bottom:1px solid #ddd;font-size:12px;}
      tr:nth-child(even){background:#f8f9fa;}
      .cat-title{background:#f0f4ff;padding:8px 12px;font-weight:700;color:#1E3A8A;font-size:14px;margin:16px 0 8px;border-left:4px solid #1E3A8A;}
      .medal-gold{color:#D97706;font-weight:700;}
      .medal-silver{color:#6B7280;font-weight:700;}
      .medal-bronze{color:#92400E;font-weight:700;}
      .winner{color:#059669;font-weight:700;}
      .no-print{margin:20px 0;}
      .bracket-svg{overflow-x:auto;margin:10px 0;}
      .rr-table th,.rr-table td{text-align:center;padding:4px 6px;font-size:11px;}
      .rr-table td:nth-child(2){text-align:left;}
      .page-break{page-break-before:always;}
      @media print{.no-print{display:none !important;}}
    </style>`;
  const reportHeader=`<div class="report-header">
    <div class="fabd-name">FEDERACAO ALAGOANA DE BADMINTON</div>
    <h1>${tName}</h1>
    <p>${tDate} | ${tLocation}</p>
  </div>`;
  const printBtn='<div class="no-print" style="text-align:center"><button data-action="print" style="padding:10px 24px;font-size:14px;background:#1E3A8A;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Imprimir</button> <button data-action="close" style="padding:10px 24px;font-size:14px;background:#6B7280;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;margin-left:8px">Fechar</button></div>';

  let body='';
  switch(type){
    case 'entries': body=reportEntries(); break;
    case 'draws': body=reportDraws(); break;
    case 'results': body=reportResults(); break;
    case 'oop': body=reportOOP(); break;
    case 'winners': body=reportWinners(); break;
    case 'classification': body=reportClassification(); break;
    case 'rankingFederados': body=reportRankingFederados(); break;
    case 'atletasPorClube': body=reportAtletasPorClube(); break;
    case 'medalhasPorClube': body=reportMedalhasPorClube(); break;
    case 'players': body=reportPlayers(); break;
    default: body='<p>Relatorio nao encontrado.</p>';
  }

  const w=window.open('','_blank','width=900,height=700');
  if(!w){showToast('Popup bloqueado. Permita popups para imprimir.','warning');return;}
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(tName)} - Relatorio</title>${reportStyles}</head><body>${reportHeader}${printBtn}${body}${printBtn}</body></html>`);
  w.document.close();
  // Delegate da janela principal nao alcanca w.document — registrar localmente.
  // window.print/close: globais standard, disponiveis em qualquer Window.
  w.document.addEventListener('click', (e) => {
    // nodeType===1 (ELEMENT_NODE) e cross-realm safe (instanceof Element falha
    // porque Element do popup difere do Element da janela principal).
    const t = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
    const el = t?.closest?.('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    if (action === 'print') w.print();
    else if (action === 'close') w.close();
  });
}

function reportEntries(){
  const entries=tournament.entries||[];
  if(!entries.length)return'<p>Nenhum inscrito.</p>';
  const groups={};
  entries.forEach(e=>{if(!groups[e.key])groups[e.key]=[];groups[e.key].push(e);});

  const simpleKeys=Object.keys(groups).filter(isSimplesMod).sort((a,b)=>{
    const ca=getCatIdx(a),cb=getCatIdx(b);
    if(ca<cb)return-1;if(ca>cb)return 1;
    // SM antes de SF
    const aSM=a.startsWith('SM')?0:1;
    const bSM=b.startsWith('SM')?0:1;
    if(aSM<bSM)return-1;if(aSM>bSM)return 1;
    return a.localeCompare(b);
  });
  const doubleKeys=Object.keys(groups).filter(isDuplaMod).sort((a,b)=>{
    const ca=getCatIdx(a),cb=getCatIdx(b);
    if(ca<cb)return-1;if(ca>cb)return 1;
    // DM, DF, DX order
    const order={'DM':0,'DF':1,'DX':2};
    const oa=order[a.slice(0,2)]??3,ob=order[b.slice(0,2)]??3;
    if(oa<ob)return-1;if(oa>ob)return 1;
    return a.localeCompare(b);
  });

  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Lista de Inscritos</h2>';

  // SECAO SIMPLES
  if(simpleKeys.length){
    h+='<div class="cat-title" style="background:#1E3A8A;color:#fff;padding:8px 12px;border-radius:4px;margin-top:8px">Inscritos Simples</div>';
    simpleKeys.forEach(key=>{
      const list=groups[key].filter(e=>!e.partner);
      if(!list.length)return;
      h+=`<div class="cat-title">${esc(key)} (${list.length})</div>`;
      h+='<table><thead><tr><th>#</th><th>Jogador</th><th>Clube</th></tr></thead><tbody>';
      list.forEach((e,i)=>{
        h+=`<tr><td>${i+1}</td><td>${esc(e.playerName||'')}</td><td>${esc(e.club||'-')}</td></tr>`;
      });
      h+='</tbody></table>';
    });
  }

  // SECAO DUPLAS
  if(doubleKeys.length){
    h+='<div class="cat-title" style="background:#C41E2A;color:#fff;padding:8px 12px;border-radius:4px;margin-top:16px">Inscritos Duplas</div>';
    doubleKeys.forEach(key=>{
      const list=groups[key];
      // Deduplicar duplas
      const seenPartners=new Set();
      const uniquePairs=[];
      list.forEach(e=>{
        if(e.partner){
          const [p1,p2]=[e.playerId,e.partner].sort();
          const k=`${p1}-${p2}`;
          if(!seenPartners.has(k)){
            seenPartners.add(k);
            const d1=list.find(x=>x.playerId===p1);
            const d2=list.find(x=>x.playerId===p2);
            if(d1&&d2)uniquePairs.push([d1,d2]);
          }
        }
      });
      if(!uniquePairs.length)return;
      h+=`<div class="cat-title">${esc(key)} (${list.length})</div>`;
      h+='<table><thead><tr><th>#</th><th>Jogador</th><th>Clube</th><th>Dupla</th><th>Clube Dupla</th></tr></thead><tbody>';
      uniquePairs.forEach((pair,idx)=>{
        const [e1,e2]=pair;
        h+=`<tr><td>${idx+1}</td><td>${esc(e1.playerName||'')}</td><td>${esc(e1.club||'-')}</td><td>${esc(e2?.playerName||'-')}</td><td>${esc(e2?.club||'-')}</td></tr>`;
      });
      h+='</tbody></table>';
    });
  }
  return h;
}

function reportDraws(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Chaves / Brackets</h2>';
  draws.forEach((d,di)=>{
    if(di>0)h+='<div class="page-break"></div>';
    h+=`<div class="cat-title">${esc(d.name)} - ${esc(d.type)} (${d.players?.length||0} jogadores)</div>`;
    if(!d.matches?.length){
      h+='<p style="padding:8px;color:#666">Chave ainda nao sorteada.</p>';
      h+='<table><thead><tr><th>#</th><th>Jogador</th></tr></thead><tbody>';
      (d.players||[]).forEach((p,i)=>{h+=`<tr><td>${i+1}</td><td>${esc(p)}</td></tr>`;});
      h+='</tbody></table>';
      return;
    }
    if(d.type==='Eliminatoria'){
      h+=reportBracketSVG(d);
    } else {
      h+=reportRoundRobinTable(d);
    }
  });
  return h;
}

function reportBracketSVG(d){
  // Reuse the renderBracket logic but return the SVG HTML
  return renderBracket(d);
}

function reportRoundRobinTable(d){
  if(!d.players?.length)return'';
  let h='<table class="rr-table"><thead><tr><th>#</th><th>Jogador</th>';
  d.players.forEach((_,i)=>h+=`<th>${i+1}</th>`);
  h+='<th>V</th><th>D</th><th>Pts</th></tr></thead><tbody>';
  d.players.forEach((p,i)=>{
    h+=`<tr><td>${i+1}</td><td style="text-align:left"><strong>${esc(p)}</strong></td>`;
    d.players.forEach((q,j)=>{
      if(i===j){h+='<td style="background:#e5e7eb">-</td>';return;}
      const m=(d.matches||[]).find(x=>(x.player1===p&&x.player2===q)||(x.player1===q&&x.player2===p));
      if(!m||m.winner===undefined){h+='<td>-</td>';return;}
      const isP1=m.player1===p;
      if(m.score1==='W.O.'||m.score2==='W.O.'){
        const iWon=(isP1&&m.winner===1)||(!isP1&&m.winner===2);
        h+=`<td style="color:${iWon?'#10B981':'#DC2626'};font-weight:700">${iWon?'W':'L'}</td>`;
        return;
      }
      h+=`<td>${m.score1!==undefined&&m.score1!==''?(isP1?`${m.score1}-${m.score2}`:`${m.score2}-${m.score1}`):'-'}</td>`;
    });
    let w=0,l=0;
    (d.matches||[]).forEach(m=>{
      if(m.winner===undefined)return;
      const isP1=m.player1===p;const isP2=m.player2===p;
      if(!isP1&&!isP2)return;
      if((isP1&&m.winner===1)||(isP2&&m.winner===2))w++;
      if((isP1&&m.winner===2)||(isP2&&m.winner===1))l++;
    });
    h+=`<td>${w}</td><td>${l}</td><td><strong>${w*2}</strong></td></tr>`;
  });
  h+='</tbody></table>';
  return h;
}

function reportResults(){
  const matches=tournament.matches||[];
  const finished=matches.filter(m=>m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao');
  if(!finished.length)return'<p>Nenhum resultado registrado.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Resultados</h2>';
  const groups={};
  finished.forEach(m=>{const k=m.drawName||'Sem chave';if(!groups[k])groups[k]=[];groups[k].push(m);});
  Object.keys(groups).sort().forEach(key=>{
    const list=groups[key];
    h+=`<div class="cat-title">${esc(key)}</div>`;
    h+='<table><thead><tr><th>Jogo</th><th>Rodada</th><th>Jogador 1</th><th>Placar</th><th>Jogador 2</th><th>Quadra</th><th>Arbitro</th></tr></thead><tbody>';
    list.forEach(m=>{
      const p1Style=m.winner===1?'class="winner"':'';
      const p2Style=m.winner===2?'class="winner"':'';
      let scoreStr=m.score||'-';
      h+=`<tr><td>${m.num}</td><td>${esc(m.roundName||'R'+m.round)}</td><td ${p1Style}>${esc(m.player1||'-')}</td><td style="text-align:center;font-weight:700">${esc(scoreStr)}</td><td ${p2Style}>${esc(m.player2||'-')}</td><td>${esc(m.court||'-')}</td><td>${esc(m.umpire||'-')}</td></tr>`;
    });
    h+='</tbody></table>';
  });
  return h;
}

function reportOOP(){
  const matches=tournament.matches||[];
  if(!matches.length)return'<p>Sem partidas agendadas.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Ordem de Jogo</h2>';

  const renderMatchTable=(list)=>{
    let t='<table><thead><tr><th>Hora</th><th>Jogo</th><th>Chave</th><th>Rodada</th><th>Jogador 1</th><th>x</th><th>Jogador 2</th><th>Quadra</th><th>Status</th></tr></thead><tbody>';
    list.forEach(m=>{
      const done=m.status==='Finalizada'||m.status==='WO';
      const p1Style=m.winner===1?'class="winner"':'';
      const p2Style=m.winner===2?'class="winner"':'';
      t+=`<tr${done?' style="color:#888"':''}>
        <td>${esc(m.time||'-')}</td><td>${m.num}</td><td>${esc(m.drawName||'-')}</td><td>${esc(m.roundName||'R'+m.round)}</td>
        <td ${p1Style}>${esc(m.player1Display||m.player1||'A definir')}</td><td style="text-align:center">x</td>
        <td ${p2Style}>${esc(m.player2Display||m.player2||'A definir')}</td><td>${esc(m.court||'-')}</td><td>${esc(m.status)}</td></tr>`;
    });
    t+='</tbody></table>';
    return t;
  };

  if(tournament.daySchedule?.length){
    // Agrupar por dia
    const modeLabels={'todas':'Todas as categorias','simples':'Simples (SM/SF)','duplas':'Duplas (DM/DF/DX)'};
    tournament.daySchedule.forEach((day,idx)=>{
      const dObj=new Date(day.date+'T00:00:00');
      const dayLabel=`Dia ${idx+1} - ${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}/${dObj.getFullYear()}`;
      const modLabel=modeLabels[day.mode||'todas']||'Todas';
      // Filtrar matches deste dia pelo mode
      const mode=day.mode||'todas';
      const dayMatches=matches.filter(m=>{
        const dn=m.drawName||'';
        if(mode==='todas')return true;
        if(mode==='simples')return dn.startsWith('SM ')||dn.startsWith('SF ');
        if(mode==='duplas')return dn.startsWith('DM ')||dn.startsWith('DF ')||dn.startsWith('DX ');
        return false;
      });
      if(!dayMatches.length)return;
      const sorted=[...dayMatches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
      h+=`<div class="cat-title" style="margin-top:${idx?'24':'0'}px">${dayLabel} - ${modLabel}</div>`;
      h+=renderMatchTable(sorted);
    });
    // Matches sem dia
    const assignedModes=tournament.daySchedule.map(d=>d.mode||'todas');
    if(!assignedModes.includes('todas')){
      const unassigned=matches.filter(m=>{
        const dn=m.drawName||'';
        const isSimples=dn.startsWith('SM ')||dn.startsWith('SF ');
        const isDupla=dn.startsWith('DM ')||dn.startsWith('DF ')||dn.startsWith('DX ');
        return !(assignedModes.includes('simples')&&isSimples)&&!(assignedModes.includes('duplas')&&isDupla);
      });
      if(unassigned.length){
        const sorted=[...unassigned].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
        h+=`<div class="cat-title" style="margin-top:24px">Sem dia definido</div>`;
        h+=renderMatchTable(sorted);
      }
    }
  } else {
    // Sem programacao: lista unica
    const sorted=[...matches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
    h+=renderMatchTable(sorted);
  }
  return h;
}

function reportWinners(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Premiacao</h2>';
  let count=0;
  draws.forEach(d=>{
    // So mostrar categorias com TODOS os jogos finalizados
    const realMatches=(d.matches||[]).filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE');
    const allFinished=realMatches.length>0&&realMatches.every(m=>m.winner!==undefined&&m.winner!==null);
    if(!allFinished)return;
    const ranking=computeDrawRanking(d);
    if(!ranking||!ranking.length)return;
    count++;
    h+=`<div class="cat-title">${esc(d.name)}</div>`;
    h+='<table><thead><tr><th>Pos.</th><th>Medalha</th><th>Jogador</th></tr></thead><tbody>';
    ranking.forEach(r=>{
      const medalClass=r.pos===1?'medal-gold':r.pos===2?'medal-silver':'medal-bronze';
      const medalLabel=r.pos===1?'Ouro':r.pos===2?'Prata':'Bronze';
      const medalIcon=r.pos===1?'\uD83E\uDD47':r.pos===2?'\uD83E\uDD48':'\uD83E\uDD49';
      h+=`<tr><td class="${medalClass}">${r.pos}o</td><td class="${medalClass}">${medalIcon} ${medalLabel}</td><td class="${medalClass}">${esc(r.name)}</td></tr>`;
    });
    h+='</tbody></table>';
  });
  if(!count)h+='<p>Nenhuma categoria finalizada.</p>';
  return h;
}

function computeFullClassification(d){
  if(!d.players?.length)return[];

  if(d.type==='Eliminatoria'){
    // Classificar pela rodada em que foi eliminado (mais longe = melhor posicao)
    const totalR=Math.max(...(d.matches||[]).map(m=>m.round)||[1]);
    const playerRound={}; // jogador -> rodada mais alta que jogou
    d.players.forEach(p=>{playerRound[p]=0;});
    (d.matches||[]).forEach(m=>{
      if(m.isBye)return;
      if(m.player1&&playerRound[m.player1]!==undefined)playerRound[m.player1]=Math.max(playerRound[m.player1],m.round);
      if(m.player2&&m.player2!=='BYE'&&playerRound[m.player2]!==undefined)playerRound[m.player2]=Math.max(playerRound[m.player2],m.round);
    });
    // Campeao e vice
    const finalM=(d.matches||[]).find(m=>m.round===totalR);
    const champion=finalM?.winner===1?finalM.player1:finalM?.winner===2?finalM.player2:null;
    const vice=finalM?.winner===1?finalM.player2:finalM?.winner===2?finalM.player1:null;

    // Ordenar: campeao (1), vice (2), depois por rodada mais alta (desc)
    const sorted=[...d.players].sort((a,b)=>{
      if(a===champion)return-1;if(b===champion)return 1;
      if(a===vice)return-1;if(b===vice)return 1;
      return(playerRound[b]||0)-(playerRound[a]||0);
    });

    // Atribuir posicoes (empatados na mesma rodada = mesma posicao)
    // R10: shape consistente — todos pushes incluem wins/losses (null em eliminatoria).
    const result=[];
    let pos=1;
    for(let i=0;i<sorted.length;i++){
      const p=sorted[i];
      if(p===champion){result.push({pos:1,name:p,round:totalR,note:'Campeao',wins:null,losses:null});pos=2;continue;}
      if(p===vice){result.push({pos:2,name:p,round:totalR,note:'Vice',wins:null,losses:null});pos=3;continue;}
      // Mesmo round = mesma posicao
      if(i>0&&sorted[i-1]!==champion&&sorted[i-1]!==vice&&playerRound[p]===playerRound[sorted[i-1]]){
        result.push({pos:result[result.length-1].pos,name:p,round:playerRound[p]||0,note:'',wins:null,losses:null});
      } else {
        result.push({pos:i+1,name:p,round:playerRound[p]||0,note:'',wins:null,losses:null});
      }
    }
    return result;
  }

  if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
    const classification=[];
    // Fase de eliminatoria: top posicoes
    const elimM=d.groupsData.eliminationMatches||[];
    const hasFinalWinner=elimM.length&&elimM.find(m=>m.round===Math.max(...elimM.map(x=>x.round)))?.winner;
    if(!hasFinalWinner){
      // Eliminatoria nao concluida — nao mostrar classificacao parcial
      return[{pos:0,name:'Chave em andamento',note:'Aguardando finalizacao',wins:null,losses:null}];
    }
    if(elimM.length){
      const totalR=Math.max(...elimM.map(m=>m.round));
      const finalM=elimM.find(m=>m.round===totalR);
      if(finalM?.winner){
        const champ=finalM.winner===1?finalM.player1:finalM.player2;
        const vice=finalM.winner===1?finalM.player2:finalM.player1;
        classification.push({pos:1,name:champ,note:'Campeao',wins:null,losses:null});
        classification.push({pos:2,name:vice,note:'Vice',wins:null,losses:null});
        // Perdedores das semis = 3o
        if(totalR>=2){
          elimM.filter(m=>m.round===totalR-1).forEach(sm=>{
            if(!sm.winner)return;
            const loser=sm.winner===1?sm.player2:sm.player1;
            if(loser&&loser!==champ&&loser!==vice&&!classification.find(c=>c.name===loser)){
              classification.push({pos:3,name:loser,note:'3o colocado',wins:null,losses:null});
            }
          });
        }
        // Perdedores de rodadas anteriores
        for(let r=totalR-2;r>=1;r--){
          const roundLosers=elimM.filter(m=>m.round===r&&m.winner).map(m=>m.winner===1?m.player2:m.player1).filter(n=>n&&!classification.find(c=>c.name===n));
          const nextPos=classification.length+1;
          roundLosers.forEach(loser=>{classification.push({pos:nextPos,name:loser,note:'',wins:null,losses:null});});
        }
      }
    }
    // Fase de grupos: quem nao classificou
    // Agrupar por colocacao no grupo (3o de todos os grupos = mesma posicao)
    const classified=new Set(classification.map(c=>c.name));
    const qualifiers=d.groupQualifiers||2;
    const numGroups=(d.groupsData.groups||[]).length;
    const maxPlayers=Math.max(...(d.groupsData.groups||[]).map(g=>g.players?.length||0));

    for(let posInGroup=qualifiers;posInGroup<maxPlayers;posInGroup++){
      const basePos=classification.length+1;
      (d.groupsData.groups||[]).forEach(g=>{
        const standings=computeGroupStandings(g.players,g.matches);
        const s=standings[posInGroup];
        if(!s||classified.has(s.name))return;
        classified.add(s.name);
        classification.push({pos:basePos,name:s.name,note:`${posInGroup+1}o ${g.name}`,wins:s.wins,losses:s.losses});
      });
    }
    return classification;
  }

  // Todos contra Todos
  if(d.type==='Todos contra Todos'){
    const stats={};
    d.players.forEach(p=>{stats[p]={name:p,wins:0,losses:0,ptsFor:0,ptsAgainst:0};});
    (d.matches||[]).forEach(m=>{
      if(!m.winner)return;
      if(stats[m.player1]&&stats[m.player2]){
        if(m.winner===1){stats[m.player1].wins++;stats[m.player2].losses++;}
        else{stats[m.player2].wins++;stats[m.player1].losses++;}
        if(m.score1&&m.score2){
          const s1=String(m.score1).split(' ').map(Number).filter(n=>!isNaN(n));
          const s2=String(m.score2).split(' ').map(Number).filter(n=>!isNaN(n));
          s1.forEach(v=>{stats[m.player1].ptsFor+=v;});
          s2.forEach(v=>{stats[m.player2].ptsFor+=v;stats[m.player1].ptsAgainst+=v;});
          s1.forEach(v=>{stats[m.player2].ptsAgainst+=v;});
        }
      }
    });
    return Object.values(stats).sort((a,b)=>b.wins-a.wins||(b.ptsFor-b.ptsAgainst)-(a.ptsFor-a.ptsAgainst)||b.ptsFor-a.ptsFor).map((s,i)=>({pos:i+1,name:s.name,wins:s.wins,losses:s.losses,note:''}));
  }

  return[];
}

function reportClassification(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';

  // Ordem das categorias (crescente)
  const catOrder=['Sub 11','Sub 13','Sub 15','Sub 17','Sub 19','Sub 23','Principal','Senior','Master I','Master II'];
  function getCatSort(name){
    for(let i=0;i<catOrder.length;i++){if(name.includes(catOrder[i]))return i;}
    return 99;
  }

  // Ordem modalidades: SM antes SF, DM antes DF antes DX
  const modOrder={'SM':0,'SF':1,'DM':0,'DF':1,'DX':2};

  // Separar simples e duplas, ordenar por categoria crescente + modalidade
  const simples=draws.filter(d=>d.event==='SM'||d.event==='SF').sort((a,b)=>getCatSort(a.name)-getCatSort(b.name)||(modOrder[a.event]||0)-(modOrder[b.event]||0));
  const duplas=draws.filter(d=>d.event==='DM'||d.event==='DF'||d.event==='DX').sort((a,b)=>getCatSort(a.name)-getCatSort(b.name)||(modOrder[a.event]||0)-(modOrder[b.event]||0));

  const scoringTable=getCurrentScoringTable();

  function renderSection(drawList){
    let h='',count=0;
    drawList.forEach(d=>{
      const classification=computeFullClassification(d);
      if(!classification.length)return;
      count++;
      const isDoubles=d.event==='DM'||d.event==='DF'||d.event==='DX';
      h+=`<div class="cat-title">${esc(d.name)} <span style="font-size:11px;color:#666;font-weight:400">(${d.type} - ${d.players?.length||0} atletas)</span></div>`;
      h+='<table><thead><tr><th style="width:50px">Pos.</th><th>Jogador</th><th>Clube</th><th style="width:60px">V</th><th style="width:60px">D</th><th style="width:70px;text-align:right">Pontos</th><th>Obs.</th></tr></thead><tbody>';
      classification.forEach(c=>{
        const posStyle=c.pos===1?'color:#D4AF37;font-weight:800':c.pos===2?'color:#AAA;font-weight:700':c.pos===3?'color:#CD7F32;font-weight:700':'';
        const medal=c.pos===1?'\uD83E\uDD47 ':c.pos===2?'\uD83E\uDD48 ':c.pos===3?'\uD83E\uDD49 ':'';
        const pts=c.pos>0?pointsForPosition(c.pos,scoringTable):0;
        const clube=_clubForClassificationEntry(c.name,isDoubles);
        h+=`<tr><td style="${posStyle}">${medal}${c.pos}o</td><td>${esc(c.name)}</td><td style="font-size:12px">${esc(clube)}</td><td style="text-align:center">${c.wins!=null?c.wins:'-'}</td><td style="text-align:center">${c.losses!=null?c.losses:'-'}</td><td style="text-align:right;font-weight:600">${pts.toLocaleString('pt-BR')}</td><td style="font-size:11px;color:#666">${esc(c.note||'')}</td></tr>`;
      });
      h+='</tbody></table>';
    });
    return{html:h,count};
  }

  let h=`<h2 style="color:#1E3A8A;margin-bottom:8px">Classificacao Geral</h2>
  <p style="font-size:12px;color:#64748B;margin-bottom:16px">Pontua\u00E7\u00E3o aplicada: <strong>${esc(scoringTable.name)}</strong></p>`;

  // Simples
  if(simples.length){
    h+='<h3 style="color:#1E3A8A;margin:20px 0 12px;border-bottom:2px solid #1E3A8A;padding-bottom:6px">Classificacao Simples</h3>';
    const s=renderSection(simples);
    h+=s.html;
  }

  // Duplas
  if(duplas.length){
    h+='<h3 style="color:#1E3A8A;margin:30px 0 12px;border-bottom:2px solid #1E3A8A;padding-bottom:6px">Classificacao das Duplas</h3>';
    const d=renderSection(duplas);
    h+=d.html;
  }

  if(!simples.length&&!duplas.length)h+='<p>Nenhuma categoria com resultados.</p>';
  return h;
}

// Categoria-base extraída do nome da chave (Sub 11, Sub 13, ..., Master II)
const RANKING_CATEGORY_ORDER=['Sub 11','Sub 13','Sub 15','Sub 17','Sub 19','Sub 23','Principal','Senior','Master I','Master II'];
function _categoryFromDrawName(name){
  if(!name)return 'Outras';
  for(const cat of RANKING_CATEGORY_ORDER){
    if(name.includes(cat))return cat;
  }
  return 'Outras';
}

function _findPlayerByNameForRanking(name){
  if(!name||!players)return null;
  const target=name.toLowerCase().trim();
  return players.find(p=>{
    const full=`${p.firstName||''} ${p.lastName||''}`.toLowerCase().trim();
    return full===target;
  })||null;
}

// Retorna o clube formatado para uma entrada de classificação (singles ou dupla).
// Em duplas, mostra "Clube1 / Clube2" (ou só o clube se ambos forem do mesmo).
function _clubForClassificationEntry(name,isDoubles){
  if(!name)return '-';
  if(isDoubles){
    const partners=String(name).split(/\s*\/\s*/).filter(Boolean);
    const clubs=partners.map(p=>{
      const pl=_findPlayerByNameForRanking(p);
      return (pl?.club||'').trim()||'-';
    });
    if(clubs.length===2 && clubs[0]===clubs[1])return clubs[0];
    return clubs.join(' / ');
  }
  const pl=_findPlayerByNameForRanking(name);
  return (pl?.club||'').trim()||'-';
}

function _isPersonFederado(name,adimSet){
  const pl=_findPlayerByNameForRanking(name);
  return pl && adimSet.has(_normalizeClubKey(pl.club||''));
}

function _isEntryFederado(classificationName,isDoubles,adimSet){
  if(isDoubles){
    const partners=String(classificationName).split(/\s*\/\s*/).filter(Boolean);
    if(!partners.length)return false;
    return partners.every(p=>_isPersonFederado(p,adimSet));
  }
  return _isPersonFederado(classificationName,adimSet);
}

// Reposiciona atletas federados de uma classificação preservando empates da chave original.
// Retorna [{...c, pos: novaPos, points: novaPontuação, originalPos}]
function _reassignFederados(classification,scoringTable,isDoubles,adimSet){
  const federados=classification.filter(c=>c.pos>=1 && _isEntryFederado(c.name,isDoubles,adimSet));
  const reassigned=[];
  let lastOldPos=null,currentNewPos=0;
  for(let i=0;i<federados.length;i++){
    const c=federados[i];
    if(c.pos!==lastOldPos){
      currentNewPos=reassigned.length+1;
      lastOldPos=c.pos;
    }
    reassigned.push({...c,pos:currentNewPos,points:pointsForPosition(currentNewPos,scoringTable),originalPos:c.pos});
  }
  return reassigned;
}

// === Helpers compartilhados pra Ranking Federados (formato igual Classificação Geral) ===
const RANKING_MODE_ORDER={'SM':0,'SF':1,'DM':0,'DF':1,'DX':2};
function _drawCatSort(name){
  for(let i=0;i<RANKING_CATEGORY_ORDER.length;i++){
    if(name && name.includes(RANKING_CATEGORY_ORDER[i]))return i;
  }
  return 99;
}
function _sortDrawsByCatThenMod(arr){
  return arr.slice().sort((a,b)=>_drawCatSort(a.name)-_drawCatSort(b.name)||(RANKING_MODE_ORDER[a.event]||0)-(RANKING_MODE_ORDER[b.event]||0));
}

// Renderiza UMA chave como tabela. opts.reassign?:bool, opts.adimSet?:Set, opts.scoringTable
function _renderDrawAsRankingTable(d,opts){
  let classification=computeFullClassification(d);
  if(!classification.length)return'';
  const isDoubles=d.event==='DM'||d.event==='DF'||d.event==='DX';
  const sc=opts.scoringTable;
  if(opts.reassign){
    classification=_reassignFederados(classification,sc,isDoubles,opts.adimSet||new Set());
  }
  if(!classification.length)return'';
  let h=`<div class="cat-title">${esc(d.name)} <span style="font-size:11px;color:#666;font-weight:400">(${d.type} - ${d.players?.length||0} atletas)</span></div>`;
  h+='<table><thead><tr><th style="width:50px">Pos.</th><th>Atleta</th><th>Clube</th><th style="width:60px">V</th><th style="width:60px">D</th><th style="width:80px;text-align:right">Pontos</th><th>Obs.</th></tr></thead><tbody>';
  classification.forEach(c=>{
    const posStyle=c.pos===1?'color:#D4AF37;font-weight:800':c.pos===2?'color:#AAA;font-weight:700':c.pos===3?'color:#CD7F32;font-weight:700':'';
    const medal=c.pos===1?'🥇 ':c.pos===2?'🥈 ':c.pos===3?'🥉 ':'';
    const pts=c.points!=null?c.points:(c.pos>0?pointsForPosition(c.pos,sc):0);
    const note=opts.reassign&&c.originalPos&&c.originalPos!==c.pos?`Era ${c.originalPos}º na chave`:(c.note||'');
    const clube=_clubForClassificationEntry(c.name,isDoubles);
    h+=`<tr><td style="${posStyle}">${medal}${c.pos}o</td><td><strong>${esc(c.name)}</strong></td><td style="font-size:12px">${esc(clube)}</td><td style="text-align:center">${c.wins!=null?c.wins:'-'}</td><td style="text-align:center">${c.losses!=null?c.losses:'-'}</td><td style="text-align:right;font-weight:700">${pts.toLocaleString('pt-BR')}</td><td style="font-size:11px;color:#666">${esc(note)}</td></tr>`;
  });
  h+='</tbody></table>';
  return h;
}

function _renderRankingByDraws(simples,duplas,title,subtitle,opts){
  let h=`<h2 style="color:#1E3A8A;margin-bottom:8px">${esc(title)}</h2>
  <p style="font-size:12px;color:#64748B;margin-bottom:16px">${subtitle}</p>`;
  let total=0;
  if(simples.length){
    let secHtml='';
    simples.forEach(d=>{const t=_renderDrawAsRankingTable(d,opts);if(t){secHtml+=t;total++;}});
    if(secHtml){
      h+='<h3 style="color:#1E3A8A;margin:20px 0 12px;border-bottom:2px solid #1E3A8A;padding-bottom:6px">'+esc(title)+' - Simples</h3>';
      h+=secHtml;
    }
  }
  if(duplas.length){
    let secHtml='';
    duplas.forEach(d=>{const t=_renderDrawAsRankingTable(d,opts);if(t){secHtml+=t;total++;}});
    if(secHtml){
      h+='<h3 style="color:#1E3A8A;margin:30px 0 12px;border-bottom:2px solid #1E3A8A;padding-bottom:6px">'+esc(title)+' - Duplas</h3>';
      h+=secHtml;
    }
  }
  if(total===0){
    h+='<p style="font-size:13px;color:#64748B;padding:16px;background:#F8FAFC;border-radius:6px">Nenhuma chave com classificação. Conclua chaves para ver o ranking.</p>';
  }
  return h;
}

function reportRankingFederados(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';
  const clubStatuses=tournament.clubStatuses||{};
  const adimplentes=Object.keys(clubStatuses).filter(k=>clubStatuses[k]==='adimplente');
  if(!adimplentes.length){
    return`<h2 style="color:#1E3A8A;margin-bottom:8px">Ranking Federados</h2>
    <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:14px;border-radius:6px;font-size:13px;color:#92400E">
      <strong>Nenhum clube marcado como Adimplente.</strong><br>
      Para gerar este ranking, vá em <strong>Configurar Torneio &rarr; Clubes Ativos</strong> e marque os clubes adimplentes.
    </div>`;
  }
  const scoringTable=getCurrentScoringTable();
  const adimSet=new Set(adimplentes.map(c=>_normalizeClubKey(c)));
  const simples=_sortDrawsByCatThenMod(draws.filter(d=>d.event==='SM'||d.event==='SF'));
  const duplas=_sortDrawsByCatThenMod(draws.filter(d=>d.event==='DM'||d.event==='DF'||d.event==='DX'));
  const subtitle=`Apenas atletas/duplas <strong>federados</strong> (clubes Adimplentes) · Pontuação: <strong>${esc(scoringTable.name)}</strong> · uma tabela por chave · pontos pela posição entre federados (1º federado = 1000, 2º = 850, etc) · ${adimplentes.length} clube(s) · em duplas, ambos parceiros federados`;
  return _renderRankingByDraws(simples,duplas,'Ranking Federados',subtitle,{scoringTable,reassign:true,adimSet});
}

function reportAtletasPorClube(){
  if(!players?.length)return'<p>Nenhum atleta cadastrado.</p>';
  // Agrupa via mesma normalização da aba Clubes Ativos (case-insensitive)
  const groups={};
  let semClube=0;
  players.forEach(p=>{
    const raw=(p.club||'').trim();
    if(_isInvalidClubName(raw)){semClube++;return;}
    const key=_normalizeClubKey(raw);
    if(!groups[key])groups[key]={displayCounts:{},total:0};
    groups[key].displayCounts[raw]=(groups[key].displayCounts[raw]||0)+1;
    groups[key].total++;
  });
  const list=Object.values(groups).map(g=>{
    const sortedDisplays=Object.entries(g.displayCounts).sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length);
    return{name:sortedDisplays[0][0],count:g.total,isSemClube:false};
  }).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));
  // Adiciona linha "Sem Clube / S/C" no final se houver atletas sem clube
  if(semClube>0){
    list.push({name:'Sem Clube (S/C)',count:semClube,isSemClube:true});
  }
  const total=list.reduce((s,c)=>s+c.count,0);
  let h=`<h2 style="color:#1E3A8A;margin-bottom:8px">Atletas por Clube</h2>
  <p style="font-size:12px;color:#64748B;margin-bottom:16px">${list.filter(c=>!c.isSemClube).length} clube(s) com atletas · ${total} atleta(s) total${semClube?` · ${semClube} sem clube cadastrado`:''}</p>`;
  h+='<table><thead><tr><th style="width:50px">#</th><th>Clube</th><th style="text-align:right;width:100px">Atletas</th><th style="text-align:right;width:80px">%</th></tr></thead><tbody>';
  list.forEach((c,i)=>{
    const pct=total>0?(c.count/total*100).toFixed(1):'0.0';
    const rowStyle=c.isSemClube?'background:#FEF3C7;color:#92400E':'';
    const nameStyle=c.isSemClube?'font-style:italic':'';
    h+=`<tr style="${rowStyle}"><td>${i+1}</td><td style="${nameStyle}"><strong>${esc(c.name)}</strong></td><td style="text-align:right;font-weight:700">${c.count}</td><td style="text-align:right;color:#64748B">${pct}%</td></tr>`;
  });
  h+=`</tbody><tfoot><tr style="background:#f8fafc;border-top:2px solid var(--fabd-gray-300)"><td colspan="2" style="padding:10px;font-weight:700">TOTAL</td><td style="padding:10px;text-align:right;font-weight:800">${total}</td><td style="padding:10px;text-align:right">100%</td></tr></tfoot></table>`;
  return h;
}

function reportMedalhasPorClube(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';
  // Agrupa por chave normalizada (case-insensitive). { [key]: {displayCounts, ouro, prata, bronze, total} }
  const medals={};
  const SC_KEY='__sc__';

  function addMedal(personName,kind){
    const pl=_findPlayerByNameForRanking(personName);
    const raw=(pl?.club||'').trim();
    let key,display;
    if(_isInvalidClubName(raw)){
      key=SC_KEY;
      display='Sem Clube (S/C)';
    }else{
      key=_normalizeClubKey(raw);
      display=raw;
    }
    if(!medals[key])medals[key]={displayCounts:{},ouro:0,prata:0,bronze:0,total:0};
    medals[key].displayCounts[display]=(medals[key].displayCounts[display]||0)+1;
    medals[key][kind]++;
    medals[key].total++;
  }

  draws.forEach(d=>{
    const classification=computeFullClassification(d);
    if(!classification.length)return;
    const isDoubles=d.event==='DM'||d.event==='DF'||d.event==='DX';
    classification.forEach(c=>{
      let kind=null;
      if(c.pos===1)kind='ouro';
      else if(c.pos===2)kind='prata';
      else if(c.pos===3||c.pos===4)kind='bronze';
      if(!kind)return;
      if(isDoubles){
        const partners=String(c.name).split(/\s*\/\s*/).filter(Boolean);
        partners.forEach(name=>addMedal(name,kind));
      }else{
        addMedal(c.name,kind);
      }
    });
  });

  // Resolve display name (forma mais frequente; em empate, a com mais letras)
  const list=Object.entries(medals).map(([key,m])=>{
    const sortedDisplays=Object.entries(m.displayCounts).sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length);
    return{club:sortedDisplays[0][0],ouro:m.ouro,prata:m.prata,bronze:m.bronze,total:m.total,_isSC:key===SC_KEY};
  }).sort((a,b)=>b.total-a.total||b.ouro-a.ouro||b.prata-a.prata||b.bronze-a.bronze||a.club.localeCompare(b.club,'pt-BR'));
  if(!list.length){
    return`<h2 style="color:#1E3A8A;margin-bottom:8px">Medalhas por Clube</h2>
    <p style="font-size:13px;color:#64748B">Nenhuma medalha distribuída ainda. Conclua as finais e semifinais para ver o quadro de medalhas.</p>`;
  }
  const totalOuro=list.reduce((s,c)=>s+c.ouro,0);
  const totalPrata=list.reduce((s,c)=>s+c.prata,0);
  const totalBronze=list.reduce((s,c)=>s+c.bronze,0);
  const totalGeral=totalOuro+totalPrata+totalBronze;

  let h=`<h2 style="color:#1E3A8A;margin-bottom:8px">Medalhas por Clube</h2>
  <p style="font-size:12px;color:#64748B;margin-bottom:16px">${list.length} clube(s) com medalhas · 🥇 ${totalOuro} · 🥈 ${totalPrata} · 🥉 ${totalBronze} · Total ${totalGeral}</p>`;
  h+='<table><thead><tr><th style="width:50px">#</th><th>Clube</th><th style="text-align:center;width:80px">🥇 Ouro</th><th style="text-align:center;width:80px">🥈 Prata</th><th style="text-align:center;width:80px">🥉 Bronze</th><th style="text-align:right;width:90px">Total</th></tr></thead><tbody>';
  list.forEach((c,i)=>{
    let rowStyle='';
    if(c._isSC)rowStyle='background:#FEF3C7;color:#92400E';
    else if(i===0)rowStyle='background:#FEF9C3';
    else if(i===1)rowStyle='background:#F1F5F9';
    else if(i===2)rowStyle='background:#FED7AA';
    const nameStyle=c._isSC?'font-style:italic':'';
    h+=`<tr style="${rowStyle}"><td><strong>${i+1}</strong></td><td style="${nameStyle}"><strong>${esc(c.club)}</strong></td><td style="text-align:center;font-weight:600">${c.ouro||'-'}</td><td style="text-align:center;font-weight:600">${c.prata||'-'}</td><td style="text-align:center;font-weight:600">${c.bronze||'-'}</td><td style="text-align:right;font-weight:800;font-size:15px">${c.total}</td></tr>`;
  });
  h+=`</tbody><tfoot><tr style="background:#f8fafc;border-top:2px solid var(--fabd-gray-300)"><td colspan="2" style="padding:10px;font-weight:700">TOTAL</td><td style="padding:10px;text-align:center;font-weight:800">${totalOuro}</td><td style="padding:10px;text-align:center;font-weight:800">${totalPrata}</td><td style="padding:10px;text-align:center;font-weight:800">${totalBronze}</td><td style="padding:10px;text-align:right;font-weight:800;font-size:16px">${totalGeral}</td></tr></tfoot></table>`;
  return h;
}

function reportPlayers(){
  if(!players.length)return'<p>Nenhum jogador cadastrado.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Lista de Jogadores</h2>';
  h+='<table><thead><tr><th>#</th><th>Nome</th><th>Genero</th><th>Data Nasc.</th><th>Categoria</th><th>Clube</th><th>Estado</th><th>Inscricoes</th></tr></thead><tbody>';
  players.forEach((p,i)=>{
    const cat=calculateCategory(p.dob);
    const inscs=(p.inscriptions||[]).map(x=>x.key).join(', ');
    h+=`<tr><td>${i+1}</td><td>${esc(p.firstName)} ${esc(p.lastName)}</td><td>${p.gender==='M'?'Masc':'Fem'}</td><td>${fmtDate(p.dob)}</td><td>${esc(cat)}</td><td>${esc(p.club||'-')}</td><td>${esc(p.state||'-')}</td><td style="font-size:11px">${esc(inscs)||'-'}</td></tr>`;
  });
  h+='</tbody></table>';
  return h;
}

// === RANKING / PREMIACAO ===
// Atualizar matches de eliminatoria na lista de partidas quando jogadores ficam disponiveis
