// =====================================================================
// Bracket Mutators (Parcial) — funcoes que MUTAM tournament.draws e
// tournament.matches em resposta a resultados de jogos.
//
// propagateResultToDraws(matchData): aplica resultado de match em
//   tournament.draws[i].matches e d.groupsData (grupos+elim).
// reverseResultInDraws(matchData): undo — limpa winner/score/advancer
//   e propaga de volta na arvore eliminatoria.
// updateEliminationMatchesInList(): sync de matches de eliminatoria
//   gerados apos grupos terminarem.
//
// Dep global: tournament (mutavel) — escopo de app.js. Tests injetam
// via vm.runInNewContext.
//
// NAO INCLUIDO neste modulo (ainda em app.js):
// - regenerateDrawSchedule (231 linhas, complexa)
// - repropagateAllResults (217 linhas, re-aplica todos resultados)
//
// Issue #14 sub-tarefa 14.L — auditoria 2026-05-09.
// =====================================================================

function propagateResultToDraws(matchData){
  try{
    if(!tournament?.draws?.length||!matchData.drawName)return;
    const d=tournament.draws.find(x=>x.name===matchData.drawName||x.id===matchData.drawId);
    if(!d||!d.matches?.length)return;

    // Encontrar o match na draw
    let dmIdx=matchData.drawMatchIdx;
    let dm=dmIdx!=null?d.matches[dmIdx]:null;
    if(!dm){
      dm=d.matches.find(m=>m.round===matchData.round&&m.player1===matchData.player1&&m.player2===matchData.player2);
      if(!dm)dm=d.matches.find(m=>m.round===matchData.round&&(m.player1===matchData.player1||m.player2===matchData.player2));
      if(!dm)return;
      dmIdx=d.matches.indexOf(dm);
    }

    // Atualizar resultado na draw
    const winnerName=matchData.winner===1?matchData.player1:matchData.player2;
    dm.winner=matchData.winner;
    // Advancer so faz sentido em eliminatoria
    if(d.type==='Eliminatoria')dm.advancer=winnerName;
    if(matchData.score&&matchData.score!=='W.O.'&&matchData.score!=='DSQ'&&matchData.score!=='RET'){
      const sets=matchData.score.split('/').map(s=>s.trim());
      let s1=[],s2=[];
      sets.forEach(s=>{const p=s.split('-');if(p.length===2){s1.push(p[0].trim());s2.push(p[1].trim());}});
      dm.score1=s1.join(' ');dm.score2=s2.join(' ');
    } else {
      dm.score1=matchData.score||'';dm.score2='';
    }
    // Groups+Elimination: also update groupsData (after score is set on dm)
    if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
      if(matchData.phase==='group'||dm.phase==='group'){
        const groupLabel=matchData.group||dm.group;
        if(groupLabel){
          const g=d.groupsData.groups.find(x=>x.name==='Grupo '+groupLabel);
          if(g){
            const gm=g.matches.find(m=>(m.player1===matchData.player1&&m.player2===matchData.player2)||(m.player1===matchData.player2&&m.player2===matchData.player1));
            if(gm){gm.winner=matchData.winner;gm.score1=dm.score1;gm.score2=dm.score2;}
          }
        }
      }
      if(matchData.phase==='elimination'||dm.phase==='elimination'){
        const em=d.groupsData.eliminationMatches?.find(m=>m.player1===matchData.player1&&m.player2===matchData.player2);
        if(em){em.winner=matchData.winner;em.advancer=winnerName;}
      }
    }

    // repropagateAllResults vai cuidar de avançar o vencedor

    // Atualizar matches de eliminatoria na lista de partidas (quando grupos terminam)
    updateEliminationMatchesInList();
  }catch(e){console.error('propagateResultToDraws error:',e);}
}

function reverseResultInDraws(matchData){
  try{
    if(!tournament?.draws?.length||!matchData.drawName)return;
    const d=tournament.draws.find(x=>x.name===matchData.drawName||x.id===matchData.drawId);
    if(!d||!d.matches?.length)return;

    // Encontrar match na draw
    let dm=matchData.drawMatchIdx!=null?d.matches[matchData.drawMatchIdx]:null;
    if(!dm)dm=d.matches.find(m=>m.round===matchData.round&&m.player1===matchData.player1&&m.player2===matchData.player2);
    if(!dm)dm=d.matches.find(m=>m.round===matchData.round&&(m.player1===matchData.player1||m.player2===matchData.player2));
    if(!dm)return;

    const byRound={};
    d.matches.forEach((m,i)=>{if(!byRound[m.round])byRound[m.round]=[];byRound[m.round].push({match:m,globalIdx:i});});
    const totalRounds=Math.max(...d.matches.map(m=>m.round));

    const oldWinner=dm.advancer||null;
    dm.winner=undefined;dm.advancer=undefined;dm.score1='';dm.score2='';

    if(dm.round<totalRounds&&oldWinner){
      const rMatches=byRound[dm.round]||[];
      const posInRound=rMatches.findIndex(x=>x.match===dm);
      if(posInRound<0)return;
      const nextRMatches=byRound[dm.round+1]||[];
      const nextPos=Math.floor(posInRound/2);
      if(nextPos>=nextRMatches.length)return;
      const nm=nextRMatches[nextPos].match;
      const slot=posInRound%2;

      // Verificar se o próximo jogo já foi finalizado
      const nextTm=findTournamentMatch(d.name,nextRMatches[nextPos].globalIdx,nm);
      if(nextTm&&(nextTm.status==='Finalizada'||nextTm.status==='WO'||nextTm.status==='Desistencia')){
        showToast('Nao pode desfazer: jogo seguinte ja foi finalizado','warning');
        dm.winner=matchData.winner;dm.advancer=oldWinner;
        return;
      }

      if(slot===0)nm.player1=''; else nm.player2='';
      if(nextTm){
        if(slot===0){nextTm.player1='';nextTm.player1Display='A definir';}
        else{nextTm.player2='';nextTm.player2Display='A definir';}
        nextTm.isDefinida=false;nextTm.status='A definir';
      }
    }
  }catch(e){console.error('reverseResultInDraws error:',e);}
}

function updateEliminationMatchesInList(){
  if(!tournament?.draws?.length||!tournament?.matches?.length)return;
  let changed=false;
  (tournament.draws||[]).forEach(d=>{
    if(d.type!=='Grupos + Eliminatoria'||!d.groupsData)return;
    const elimMatches=d.groupsData.eliminationMatches||[];
    if(!elimMatches.length)return;

    // Contar grupo matches pra calcular drawMatchIdx base
    let groupMatchCount=0;
    (d.groupsData.groups||[]).forEach(g=>{g.matches.forEach(m=>{if(m.player1&&m.player2&&m.player1!=='BYE'&&m.player2!=='BYE')groupMatchCount++;});});

    // Pra cada match de eliminatoria
    elimMatches.forEach((em,emIdx)=>{
      const expectedIdx=groupMatchCount+emIdx;
      // Encontrar o match na lista por drawMatchIdx exato
      const existing=tournament.matches.find(m=>
        m.drawName===d.name&&m.phase==='elimination'&&m.drawMatchIdx===expectedIdx
      );
      if(!existing)return;

      // Atualizar player1
      if(em.player1&&existing.player1!==em.player1){
        existing.player1=em.player1;
        existing.player1Display=em.player1;
        changed=true;
      }
      // Atualizar player2
      if(em.player2&&existing.player2!==em.player2){
        existing.player2=em.player2;
        existing.player2Display=em.player2;
        changed=true;
      }
      // Atualizar status
      if(existing.player1&&existing.player2&&existing.status==='A definir'){
        existing.isDefinida=true;
        existing.status='Pendente';
        changed=true;
      }
      // Propagar resultado se ja tem (semi finalizada)
      if(em.winner&&!existing.winner){
        existing.winner=em.winner;
        existing.score=em.score1&&em.score2?em.score1.split(' ').map((v,i)=>v+'-'+(em.score2.split(' ')[i]||0)).join(' / '):'';
        existing.status='Finalizada';
        changed=true;
      }
    });
  });
  return changed;
}

// Preparar rankings de todas as draws pra enviar ao Supabase

