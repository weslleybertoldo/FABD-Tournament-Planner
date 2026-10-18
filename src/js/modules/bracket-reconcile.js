// =====================================================================
// Bracket Reconcile — funcoes que re-aplicam/sincronizam resultados em
// cascata pelas matches do torneio (eliminatoria, round-robin, grupos).
//
// propagateGroupsToElimination(d): apos grupos completos, gera matches
//   de eliminatoria com cruzamento oficial (1o de A vs 2o de B, etc).
// buildGroupsElimPreview(groups, qualifiers): os mesmos jogos com rotulos,
//   pra previa em formato de chave enquanto os grupos rolam.
// repropagateAllResults(): re-sincroniza bidirecionalmente draws[].matches
//   e tournament.matches, propaga advancers em eliminatoria, infere BYEs,
//   atribui drawMatchIdx, salva tournament.
//
// Deps globais (mutaveis):
// - tournament (mutavel)
// - areGroupsFinished, findTournamentMatch (modulos)
// - usesBestThirds, buildBestThirdsQuarterfinals, bestThirdsQuarterfinalLabels
//   (bracket-best-thirds)
// - updateEliminationMatchesInList (bracket-mutators)
// - fillMissingTimesByDay (regenerate-schedule.js)
// - window.api.saveTournament (IPC)
//
// Issue #14 sub-tarefa 14.M — auditoria 2026-05-09.
// =====================================================================

// 1a rodada da eliminatoria a partir dos classificados de cada grupo, no
// cruzamento oficial: grupos em duplas (A,B), (C,D)... com A1 x B2 e B1 x A2.
// byGroup[grupo] = classificados em ordem (nomes reais ou rotulos da previa).
function pairGroupsFirstRound(groupKeys, byGroup) {
  const firstRound = [];
  for (let g = 0; g < groupKeys.length; g += 2) {
    const gA = byGroup[groupKeys[g]] || [];
    const gB = byGroup[groupKeys[g + 1] || groupKeys[(g + 1) % groupKeys.length]] || [];
    // A1 vs B2
    if (gA[0] && gB[1]) firstRound.push({ player1: gA[0], player2: gB[1] });
    else if (gA[0]) firstRound.push({ player1: gA[0], player2: '' });
    // B1 vs A2
    if (gB[0] && gA[1]) firstRound.push({ player1: gB[0], player2: gA[1] });
    else if (gB[0]) firstRound.push({ player1: gB[0], player2: '' });
  }
  return firstRound;
}

// Previa da eliminatoria com os grupos em andamento: os mesmos jogos que o
// propagateGroupsToElimination vai gerar, com rotulos ("1o do Grupo A",
// "Melhor 3o colocado") no lugar dos nomes. As rodadas seguintes ficam vazias
// e o renderBracket mostra "Vencedor Jogo NN".
function buildGroupsElimPreview(groups, qualifiers) {
  let firstRound;
  if (usesBestThirds(groups, qualifiers)) {
    firstRound = bestThirdsQuarterfinalLabels(groups.map(g => g.name)).map(([player1, player2]) => ({ player1, player2 }));
  } else {
    const byGroup = {};
    groups.forEach(g => {
      const n = Math.min(qualifiers, (g.players || []).length);
      if (n > 0) byGroup[g.name] = Array.from({ length: n }, (_, i) => `${i + 1}o do ${g.name}`);
    });
    firstRound = pairGroupsFirstRound(Object.keys(byGroup), byGroup);
  }
  const matches = firstRound.map(p => ({ round: 1, player1: p.player1, player2: p.player2, isPreview: true }));
  let prevCount = firstRound.length;
  let round = 2;
  while (prevCount > 1) {
    const numMatches = Math.floor(prevCount / 2);
    for (let i = 0; i < numMatches; i++) matches.push({ round, player1: '', player2: '', isPreview: true });
    prevCount = numMatches;
    round++;
  }
  return matches;
}

function propagateGroupsToElimination(d) {
  if (!areGroupsFinished(d)) return false;
  if (d.groupsData.eliminationGenerated) return false;
  const qualifiers = d.groupQualifiers || 2;
  const qualified = [];

  // Collect top N from each group
  d.groupsData.groups.forEach(g => {
    const standings = computeGroupStandings(g.players, g.matches);
    const top = standings.slice(0, qualifiers);
    top.forEach((s, i) => { qualified.push({ name: s.name, group: g.name, seed: i }); });
  });

  if (qualified.length < 2) return false;

  // Cruzamento oficial: 1o de cada grupo vs 2o de outro grupo (nunca do mesmo)
  const numGroups = d.groupsData.groups.length;
  const byGroup = {};
  qualified.forEach(q => {
    const gName = q.group;
    if (!byGroup[gName]) byGroup[gName] = [];
    byGroup[gName].push(q.name);
  });
  const groupKeys = Object.keys(byGroup);

  // Criar matches de eliminatoria DIRETAMENTE com cruzamento correto
  // (sem usar generateEliminationBracket que reordena com seed positions)
  const elimMatches = [];

  // 3 grupos x 2: os 6 nao fecham chave — puxa os 2 melhores 3os e fecha 8
  // nas quartas (bracket-best-thirds.js)
  const semis = [];
  if (usesBestThirds(d.groupsData.groups, qualifiers)) {
    semis.push(...buildBestThirdsQuarterfinals(d.groupsData.groups));
  } else {
    semis.push(...pairGroupsFirstRound(groupKeys, byGroup));
  }

  // R1: semifinais
  semis.forEach((s, i) => {
    elimMatches.push({
      round: 1, slotIdx: i, player1: s.player1, player2: s.player2,
      score1: '', score2: '', winner: undefined, isBye: false, advancer: '',
      phase: 'elimination'
    });
  });

  // Gerar rodadas seguintes (quartas, semi, final)
  let prevCount = semis.length;
  let round = 2;
  while (prevCount > 1) {
    const numMatches = Math.floor(prevCount / 2);
    for (let i = 0; i < numMatches; i++) {
      elimMatches.push({
        round, slotIdx: i, player1: '', player2: '',
        score1: '', score2: '', winner: undefined, isBye: false, advancer: '',
        phase: 'elimination'
      });
    }
    prevCount = numMatches;
    round++;
  }

  d.groupsData.eliminationMatches = elimMatches;
  d.groupsData.eliminationGenerated = true;

  // Add elimination matches to d.matches
  elimMatches.forEach(m => d.matches.push(m));

  return true;
}

function repropagateAllResults(){
  if(!tournament?.draws?.length||!tournament?.matches?.length)return;
  let changed=false;

  // Passo 0: Atribuir drawMatchIdx e remover matches de BYE implicito
  (tournament.draws||[]).forEach(d=>{
    if(!d.matches?.length)return;
    d.matches.forEach((dm,i)=>{
      if(dm.player1==='BYE'||dm.player2==='BYE')return;
      // Verificar se ja existe um tournament.match com este drawMatchIdx
      const hasIdx=tournament.matches.some(m=>m.drawName===d.name&&m.drawMatchIdx===i);
      if(hasIdx)return;
      // Buscar tournament.match sem drawMatchIdx que corresponda
      const tm=tournament.matches.find(m=>m.drawName===d.name&&m.drawMatchIdx==null&&m.round===dm.round&&
        ((m.player1===dm.player1&&m.player2===dm.player2)||(m.player1===dm.player1&&!dm.player2)||(m.player2===dm.player2&&!dm.player1)||
         (!m.player1&&!m.player2&&m.status==='A definir')));
      if(tm){tm.drawMatchIdx=i;changed=true;}
    });
  });
  // Remover tournament.matches que sao BYE implicito (um player vazio e draw ja tem advancer)
  const beforeLen=tournament.matches.length;
  tournament.matches=tournament.matches.filter(m=>{
    if(m.status!=='A definir')return true;
    if(!m.drawName||m.drawMatchIdx==null)return true;
    const d=tournament.draws.find(x=>x.name===m.drawName);
    if(!d||!d.matches)return true;
    const dm=d.matches[m.drawMatchIdx];
    if(!dm)return true;
    // Se o draw match tem player1 mas nao player2 (ou vice-versa) e ja tem advancer = BYE implicito
    if(dm.advancer&&((dm.player1&&!dm.player2)||(dm.player2&&!dm.player1)))return false;
    return true;
  });
  if(tournament.matches.length!==beforeLen){
    // Renumerar
    tournament.matches.forEach((m,i)=>{m.id=(i+1).toString();m.num=i+1;});
    changed=true;
  }

  (tournament.draws||[]).forEach(d=>{
    if(!d.matches?.length)return;

    // Grupos + Eliminatoria: sincronizar grupo e propagar eliminatoria
    if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
      // Sync group matches
      d.groupsData.groups.forEach(g=>{
        g.matches.forEach(dm=>{
          const dmInDraw=d.matches.find(m=>m.phase==='group'&&m.group===dm.group&&m.player1===dm.player1&&m.player2===dm.player2);
          const tm=(tournament.matches||[]).find(m=>m.drawName===d.name&&m.phase==='group'&&m.player1===dm.player1&&m.player2===dm.player2);
          if(!dm.winner){
            if(dmInDraw&&dmInDraw.winner){dm.winner=dmInDraw.winner;dm.score1=dmInDraw.score1;dm.score2=dmInDraw.score2;changed=true;}
            if(tm&&tm.winner&&tm.score&&tm.score!==''){
              dm.winner=tm.winner;dm.score1=tm.score1||dm.score1;dm.score2=tm.score2||dm.score2;
              if(dmInDraw){dmInDraw.winner=tm.winner;dmInDraw.score1=tm.score1;dmInDraw.score2=tm.score2;}
              changed=true;
            }
          }
          // Sync inverso: draw→tournament.match
          if(dm.winner&&tm&&(!tm.winner||tm.status==='Pendente')){
            const s1=dm.score1||'',s2=dm.score2||'';
            if(s1||s2){
              const s1P=String(s1).split(' ').filter(x=>x);
              const s2P=String(s2).split(' ').filter(x=>x);
              if(s1P.length&&s2P.length){
                tm.score=s1P.map((v,idx)=>v+'-'+(s2P[idx]||'0')).join(' / ');
                tm.winner=dm.winner;tm.status='Finalizada';tm.finishedAt=tm.finishedAt||new Date().toISOString();
                changed=true;
              }
            }
          }
        });
      });
      // Check if groups finished and propagate to elimination
      if(areGroupsFinished(d)&&!d.groupsData.eliminationGenerated){
        if(propagateGroupsToElimination(d)){
          updateEliminationMatchesInList();
          changed=true;
        }
      }
      // Handle elimination phase propagation
      if(d.groupsData.eliminationMatches?.length){
        const elimMatches=d.groupsData.eliminationMatches;
        const byRound={};
        elimMatches.forEach((m,i)=>{if(!byRound[m.round])byRound[m.round]=[];byRound[m.round].push({match:m,globalIdx:i});});
        const totalRounds=Math.max(...elimMatches.map(m=>m.round));
        for(let r=1;r<=totalRounds;r++){
          (byRound[r]||[]).forEach((entry,posInRound)=>{
            const dm=entry.match;
            if(dm.player2==='BYE'&&dm.player1&&!dm.advancer){dm.winner=1;dm.advancer=dm.player1;changed=true;}
            if(dm.player1==='BYE'&&dm.player2&&!dm.advancer){dm.winner=2;dm.advancer=dm.player2;changed=true;}
            if(!dm.winner||!dm.score1){
              const tm=(tournament.matches||[]).find(m=>m.drawName===d.name&&m.phase==='elimination'&&m.player1===dm.player1&&m.player2===dm.player2);
              if(tm&&tm.winner&&!dm.winner){dm.winner=tm.winner;dm.advancer=tm.winner===1?tm.player1:tm.player2;changed=true;}
              // placar que nao chegou na chave (site le daqui) — 18/10/2026
              if(tm&&tm.winner&&tm.score&&dm.winner&&!dm.score1){Object.assign(dm,drawScoreSides(tm.score));changed=true;}
            }
            if(dm.advancer&&r<totalRounds){
              const nextRMatches=byRound[r+1]||[];
              const nextPos=Math.floor(posInRound/2);
              if(nextPos<nextRMatches.length){
                const nm=nextRMatches[nextPos].match;
                const slot=posInRound%2;
                if(slot===0&&nm.player1!==dm.advancer){nm.player1=dm.advancer;changed=true;}
                if(slot===1&&nm.player2!==dm.advancer){nm.player2=dm.advancer;changed=true;}
                // A lista de partidas segue a chave pelo drawMatchIdx exato
                // (updateEliminationMatchesInList, no fim). Antes ia pro 1o jogo da
                // rodada seguinte com vaga vazia: no II Festival (18/10/2026) o
                // vencedor da 4a quarta apareceu na 1a semi da lista.
              }
            }
          });
        }
      }
      return;
    }

    const isElim=d.type==='Eliminatoria';
    const byRound={};
    d.matches.forEach((m,i)=>{if(!byRound[m.round])byRound[m.round]=[];byRound[m.round].push({match:m,globalIdx:i});});
    const totalRounds=Math.max(...d.matches.map(m=>m.round));

    // Round Robin: sincronizar resultados bidirecionalmente
    if(!isElim){
      (d.matches||[]).forEach((dm,i)=>{
        const tm=findTournamentMatch(d.name,i,dm);
        if(!tm)return;
        if(!dm.winner&&tm.winner&&tm.score&&tm.score!==''){
          // tournament.match → draw
          dm.winner=tm.winner;changed=true;
        } else if(dm.winner&&(!tm.winner||tm.status==='Pendente')){
          // draw → tournament.match (draw tem resultado mas tournament nao)
          const s1=dm.score1||'',s2=dm.score2||'';
          if(s1||s2){
            // Converter scores da draw para formato de placar
            const s1Parts=String(s1).split(' ').filter(x=>x);
            const s2Parts=String(s2).split(' ').filter(x=>x);
            if(s1Parts.length&&s2Parts.length){
              const score=s1Parts.map((v,idx)=>v+'-'+(s2Parts[idx]||'0')).join(' / ');
              tm.score=score;
              tm.winner=dm.winner;
              tm.status='Finalizada';
              tm.finishedAt=tm.finishedAt||new Date().toISOString();
              changed=true;
            }
          } else if(dm.score1==='W.O.'||dm.score2==='W.O.'){
            tm.score='W.O.';tm.winner=dm.winner;tm.status='WO';changed=true;
          }
        }
      });
      return;
    }

    // Eliminatoria: processar round por round
    for(let r=1;r<=totalRounds;r++){
      const rMatches=byRound[r]||[];
      rMatches.forEach((entry,posInRound)=>{
        const dm=entry.match;

        // BYE: avançar automaticamente
        if(dm.player2==='BYE'&&dm.player1&&!dm.advancer){dm.winner=1;dm.advancer=dm.player1;changed=true;}
        if(dm.player1==='BYE'&&dm.player2&&!dm.advancer){dm.winner=2;dm.advancer=dm.player2;changed=true;}

        // Buscar resultado em tournament.matches se draw nao tem
        if(!dm.winner){
          const tm=findTournamentMatch(d.name,entry.globalIdx,dm);
          if(tm&&tm.winner){
            dm.winner=tm.winner;
            dm.advancer=tm.winner===1?tm.player1:tm.player2;
            changed=true;
          }
        }

        // Propagar advancer para proximo round (SOMENTE eliminatoria)
        if(dm.advancer&&r<totalRounds){
          const nextRMatches=byRound[r+1]||[];
          const nextPosInRound=Math.floor(posInRound/2);
          if(nextPosInRound<nextRMatches.length){
            const nm=nextRMatches[nextPosInRound].match;
            const slot=posInRound%2;
            // Atualizar draw match
            if(slot===0&&nm.player1!==dm.advancer){nm.player1=dm.advancer;changed=true;}
            if(slot===1&&nm.player2!==dm.advancer){nm.player2=dm.advancer;changed=true;}
            // Atualizar tournament.match usando drawMatchIdx
            const nextTm=findTournamentMatch(d.name,nextRMatches[nextPosInRound].globalIdx,nm);
            if(nextTm){
              if(slot===0&&nextTm.player1!==dm.advancer){nextTm.player1=dm.advancer;nextTm.player1Display=dm.advancer;changed=true;}
              if(slot===1&&nextTm.player2!==dm.advancer){nextTm.player2=dm.advancer;nextTm.player2Display=dm.advancer;changed=true;}
              if(nextTm.player1&&nextTm.player2&&nextTm.status==='A definir'){nextTm.isDefinida=true;nextTm.status='Pendente';changed=true;}
            } else {
              console.warn('repropagateAllResults: nao encontrou tournament.match para',d.name,'drawMatchIdx=',nextRMatches[nextPosInRound].globalIdx,'round=',nm.round,'p1=',nm.player1,'p2=',nm.player2);
            }
          }
        }
      });
    }

    // Vaga em aberto: rotulo com o numero do jogo NA LISTA ("Venc. jogo 36"),
    // que muda quando a lista e renumerada (Regenerar) — 18/10/2026. So pelo
    // drawMatchIdx exato: os outros caminhos de busca pegam a 1a vaga vazia.
    const naLista=idx=>(tournament.matches||[]).find(x=>x.drawName===d.name&&x.drawMatchIdx===idx);
    for(let r=2;r<=totalRounds;r++){
      (byRound[r]||[]).forEach((entry,posInRound)=>{
        const tm=naLista(entry.globalIdx);
        if(!tm||(tm.status!=='A definir'&&tm.status!=='Pendente'))return;
        ['player1','player2'].forEach((k,s)=>{
          if(tm[k])return;
          const f=(byRound[r-1]||[])[posInRound*2+s];
          const ftm=f?naLista(f.globalIdx):null;
          const label=ftm?.num?`Venc. jogo ${ftm.num}`:'A definir';
          if(tm[k+'Display']!==label){tm[k+'Display']=label;changed=true;}
        });
      });
    }
  });
  // Lista de partidas da eliminatoria = chave (sempre, nao so quando a chave mudou)
  if(updateEliminationMatchesInList())changed=true;
  if(changed){
    // Dar horario so a jogo definido que ficou sem, no proprio dia (o
    // assignAutoTimes com todos os jogos apagava os horarios do outro dia)
    fillMissingTimesByDay();
    window.api.saveTournament(tournament);
    // O site tambem: o envio do fim do jogo sai ANTES deste avanco e o site
    // ficava com a semi "A definir" ate o proximo envio (18/10/2026)
    prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  }
}

// Buscar tournament.match correspondente a um draw match
// findTournamentMatch extraido pra src/js/modules/match-helpers.js (issue #14.I).

