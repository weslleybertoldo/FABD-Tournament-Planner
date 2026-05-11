// =====================================================================
// Bracket Elimination — geracao de chave eliminatoria BWF.
// BWF_TABLES: tabela oficial BWF de posicionamento de seeds/byes (3-64).
// gerarOrdemITF(n): ordem ITF de seeds pra brackets nao-BWF (65+).
// bwfEmbaralhar(arr): shuffle Fisher-Yates (usa Math.random).
// bwfDistribuirNonSeedsComProtecaoClube(slots, naoSeeds): preenche slots
//   livres minimizando confrontos entre atletas do mesmo clube.
// generateEliminationBracket(playerList, seeds): orquestrador.
//
// Dep global: _getPlayerClub(name) — definida em app.js (usa tournament.players).
// Issue #14 sub-tarefa 14.J — auditoria 2026-05-09.
// Cobertura: tests/unit/bracket-elim.test.js (golden master + invariantes).
// =====================================================================

const BWF_TABLES = {
  // Table 1 (3-16 entries)
  3:  { bracketSize: 4,  seedSlots: { 1:1, 2:4 },                                         byes: [2] },
  4:  { bracketSize: 4,  seedSlots: { 1:1, 2:4 },                                         byes: [] },
  5:  { bracketSize: 8,  seedSlots: { 1:1, 2:8 },                                         byes: [2,4,7] },
  6:  { bracketSize: 8,  seedSlots: { 1:1, 2:8 },                                         byes: [2,7] },
  7:  { bracketSize: 8,  seedSlots: { 1:1, 2:8 },                                         byes: [2] },
  8:  { bracketSize: 8,  seedSlots: { 1:1, 2:8 },                                         byes: [] },
  9:  { bracketSize: 16, seedSlots: { 1:1, 2:16 },                                        byes: [2,4,6,8,11,13,15] },
  10: { bracketSize: 16, seedSlots: { 1:1, 2:16 },                                        byes: [2,4,6,11,13,15] },
  11: { bracketSize: 16, seedSlots: { 1:1, 2:16 },                                        byes: [2,4,6,11,15] },
  12: { bracketSize: 16, seedSlots: { 1:1, 2:16 },                                        byes: [2,6,11,15] },
  13: { bracketSize: 16, seedSlots: { 1:1, 2:16 },                                        byes: [2,6,15] },
  14: { bracketSize: 16, seedSlots: { 1:1, 2:16 },                                        byes: [2,15] },
  15: { bracketSize: 16, seedSlots: { 1:1, 2:16 },                                        byes: [2] },
  16: { bracketSize: 16, seedSlots: { 1:1, 2:16, '3-4':[5,12] },                          byes: [] },
  // Table 2 (17-32 entries)
  17: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,4,6,8,10,12,14,16,19,21,23,25,27,29,31] },
  18: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,4,6,8,10,12,14,19,21,23,25,27,29,31] },
  19: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,4,6,8,10,12,14,19,21,23,27,29,31] },
  20: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,4,6,10,12,14,19,21,23,27,29,31] },
  21: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,4,6,10,12,14,19,23,27,29,31] },
  22: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,4,6,10,14,19,23,27,29,31] },
  23: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,4,6,10,14,19,23,27,31] },
  24: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,6,10,14,19,23,27,31] },
  25: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,6,10,14,23,27,31] },
  26: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,6,10,23,27,31] },
  27: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,6,10,23,31] },
  28: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,10,23,31] },
  29: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,10,31] },
  30: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2,31] },
  31: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24] },                          byes: [2] },
  32: { bracketSize: 32, seedSlots: { 1:1, 2:32, '3-4':[9,24], '5-8':[5,13,20,28] },      byes: [] },
  // Table 3 (33-64 entries)
  33: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,35,37,39,41,43,45,47,49,51,53,55,57,59,61,63] },
  34: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,35,37,39,41,43,45,47,49,51,53,55,57,59,61,63] },
  35: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,35,37,39,41,43,45,47,51,53,55,57,59,61,63] },
  36: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,8,10,12,14,18,20,22,24,26,28,30,35,37,39,41,43,45,47,51,53,55,57,59,61,63] },
  37: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,8,10,12,14,18,20,22,24,26,28,30,35,37,39,43,45,47,51,53,55,57,59,61,63] },
  38: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,8,10,12,14,18,20,22,26,28,30,35,37,39,43,45,47,51,53,55,57,59,61,63] },
  39: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,8,10,12,14,18,20,22,26,28,30,35,37,39,43,45,47,51,53,55,59,61,63] },
  40: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,12,14,18,20,22,26,28,30,35,37,39,43,45,47,51,53,55,59,61,63] },
  41: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,12,14,18,20,22,26,28,30,35,39,43,45,47,51,53,55,59,61,63] },
  42: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,12,14,18,20,22,26,30,35,39,43,45,47,51,53,55,59,61,63] },
  43: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,12,14,18,20,22,26,30,35,39,43,45,47,51,55,59,61,63] },
  44: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,14,18,20,22,26,30,35,39,43,45,47,51,55,59,61,63] },
  45: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,14,18,20,22,26,30,35,39,43,47,51,55,59,61,63] },
  46: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,14,18,22,26,30,35,39,43,47,51,55,59,61,63] },
  47: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,4,6,10,14,18,22,26,30,35,39,43,47,51,55,59,63] },
  48: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,14,18,22,26,30,35,39,43,47,51,55,59,63] },
  49: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,14,18,22,26,30,39,43,47,51,55,59,63] },
  50: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,14,18,22,26,39,43,47,51,55,59,63] },
  51: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,14,18,22,26,39,43,47,55,59,63] },
  52: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,18,22,26,39,43,47,55,59,63] },
  53: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,18,22,26,39,47,55,59,63] },
  54: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,18,26,39,47,55,59,63] },
  55: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,6,10,18,26,39,47,55,63] },
  56: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,10,18,26,39,47,55,63] },
  57: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,10,18,26,47,55,63] },
  58: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,10,18,47,55,63] },
  59: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,10,18,47,63] },
  60: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,18,47,63] },
  61: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,18,63] },
  62: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2,63] },
  63: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56] }, byes: [2] },
  64: { bracketSize: 64, seedSlots: { 1:1, 2:64, '3-4':[17,48], '5-8':[9,25,40,56], '9-16':[5,13,21,29,36,44,52,60] }, byes: [] }
};

// Algoritmo ITF dinamico (fallback para 65+ atletas)
function gerarOrdemITF(n) {
  if(n===1)return[1];
  const metade=gerarOrdemITF(n/2);
  const resultado=[];
  for(const seed of metade){
    resultado.push(seed);
    resultado.push(n+1-seed);
  }
  return resultado;
}

// Embaralhar array (Fisher-Yates)
function bwfEmbaralhar(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

// PROTECAO DE CLUBE - distribui non-seeds nos slots minimizando confrontos do mesmo clube
// Reaproveita _getPlayerClub() ja existente no app (busca em tournament.players)
function bwfDistribuirNonSeedsComProtecaoClube(slots, naoSeeds){
  // Mapear: slot -> qual sera o adversario (ja preenchido com seed/bye)?
  // Em chave eliminatoria, slot par i joga contra slot impar i+1 (ou vice-versa)
  const slotsLivres=[];
  for(let i=0;i<slots.length;i++){
    if(slots[i]==null)slotsLivres.push(i);
  }

  // Embaralha non-seeds para aleatoriedade
  const candidatos=bwfEmbaralhar(naoSeeds);

  // Para cada non-seed, escolhe o melhor slot livre (que minimize confrontos do mesmo clube)
  for(const player of candidatos){
    let clubsPlayer=[];
    try{ clubsPlayer=_getPlayerClub(player).split('|').filter(Boolean); }catch(e){}

    if(slotsLivres.length===0)break;

    // Se nao tem clube cadastrado, pega primeiro slot livre
    if(clubsPlayer.length===0){
      const slot=slotsLivres.shift();
      slots[slot]=player;
      continue;
    }

    // Score de cada slot livre: 0 = otimo (adversario diferente clube)
    //                           1000 = ruim (adversario mesmo clube)
    let melhorIdx=0, melhorScore=Infinity;
    for(let k=0;k<slotsLivres.length;k++){
      const slot=slotsLivres[k];
      const slotAdversario=slot%2===0?slot+1:slot-1;
      const adversario=slots[slotAdversario];
      let score=0;
      if(adversario&&adversario!=='BYE'){
        let clubsAdv=[];
        try{ clubsAdv=_getPlayerClub(adversario).split('|').filter(Boolean); }catch(e){}
        const conflito=clubsPlayer.some(c=>clubsAdv.includes(c));
        if(conflito)score=1000;
      }
      if(score<melhorScore){
        melhorScore=score;
        melhorIdx=k;
        if(score===0)break; // achou um sem conflito, otimo
      }
    }
    const escolhido=slotsLivres.splice(melhorIdx,1)[0];
    slots[escolhido]=player;
  }
}

function generateEliminationBracket(playerList, seeds) {
  seeds=seeds||[];
  const n=seeds.length+playerList.length;
  if(n<2)return[];

  let bracketSize, slots;

  // Caminho 1: usar tabela oficial BWF (3-64 atletas)
  if(n>=3&&n<=64&&BWF_TABLES[n]){
    const tabela=BWF_TABLES[n];
    bracketSize=tabela.bracketSize;
    slots=new Array(bracketSize).fill(null);

    // BWF limita o numero de seeds por tamanho de chave.
    // Se o usuario passar mais seeds que a tabela prevê, os "extras" sao tratados como non-seeds.
    let maxSeedsBWF=2;
    if(tabela.seedSlots['3-4'])maxSeedsBWF=4;
    if(tabela.seedSlots['5-8'])maxSeedsBWF=8;
    if(tabela.seedSlots['9-16'])maxSeedsBWF=16;
    const seedsValidos=seeds.slice(0,maxSeedsBWF);
    const seedsExtras=seeds.slice(maxSeedsBWF);
    playerList=[...playerList,...seedsExtras];

    // Posicionar seeds (seeds 1,2 fixos; demais grupos sorteados entre si)
    for(let i=0;i<seedsValidos.length;i++){
      const seedNum=i+1;
      if(seedNum===1&&tabela.seedSlots[1]){
        slots[tabela.seedSlots[1]-1]=seedsValidos[i];
      } else if(seedNum===2&&tabela.seedSlots[2]){
        slots[tabela.seedSlots[2]-1]=seedsValidos[i];
      } else {
        let grupoSlots=null;
        if(seedNum>=3&&seedNum<=4&&tabela.seedSlots['3-4'])grupoSlots=tabela.seedSlots['3-4'];
        else if(seedNum>=5&&seedNum<=8&&tabela.seedSlots['5-8'])grupoSlots=tabela.seedSlots['5-8'];
        else if(seedNum>=9&&seedNum<=16&&tabela.seedSlots['9-16'])grupoSlots=tabela.seedSlots['9-16'];
        if(grupoSlots){
          const livres=grupoSlots.filter(s=>slots[s-1]==null);
          if(livres.length>0){
            const escolhido=livres[Math.floor(Math.random()*livres.length)];
            slots[escolhido-1]=seedsValidos[i];
          }
        }
      }
    }

    // Marcar byes nas posicoes oficiais
    for(const slotBye of tabela.byes){
      slots[slotBye-1]='BYE';
    }
  } else {
    // Caminho 2: algoritmo dinamico para 65+ atletas
    bracketSize=Math.pow(2,Math.ceil(Math.log2(n)));
    const numByes=bracketSize-n;
    const ordemITF=gerarOrdemITF(bracketSize);
    slots=new Array(bracketSize).fill(null);

    for(let i=0;i<seeds.length;i++){
      const seedNum=i+1;
      const slotIdx=ordemITF.indexOf(seedNum);
      slots[slotIdx]=seeds[i];
    }

    const slotsComBye=new Set();
    let byesRestantes=numByes;
    for(let seedNum=1;seedNum<=bracketSize&&byesRestantes>0;seedNum++){
      const slotSeed=ordemITF.indexOf(seedNum);
      if(slots[slotSeed]==null)continue;
      const vizinho=slotSeed%2===0?slotSeed+1:slotSeed-1;
      if(slots[vizinho]==null&&!slotsComBye.has(vizinho)){
        slotsComBye.add(vizinho);
        byesRestantes--;
      }
    }
    if(byesRestantes>0){
      for(let seedNum=1;seedNum<=bracketSize&&byesRestantes>0;seedNum++){
        const slotIdeal=ordemITF.indexOf(seedNum);
        if(slots[slotIdeal]!=null||slotsComBye.has(slotIdeal))continue;
        const vizinho=slotIdeal%2===0?slotIdeal+1:slotIdeal-1;
        if(slotsComBye.has(vizinho))continue;
        slotsComBye.add(slotIdeal);
        byesRestantes--;
      }
    }
    slotsComBye.forEach(i=>{slots[i]='BYE';});
  }

  // Distribuir non-seeds COM PROTECAO DE CLUBE (nova logica)
  bwfDistribuirNonSeedsComProtecaoClube(slots, playerList);

  // Garantia: qualquer slot ainda nulo vira BYE (defensivo)
  for(let i=0;i<bracketSize;i++){
    if(slots[i]==null)slots[i]='BYE';
  }

  const r1Matches=bracketSize/2;
  const totalRounds=Math.log2(bracketSize);

  // Montar pares da R1
  const matches=[];
  for(let i=0;i<r1Matches;i++){
    const s1=slots[i*2], s2=slots[i*2+1];
    const p1IsBye=s1==='BYE', p2IsBye=s2==='BYE';
    const doubleBye=p1IsBye&&p2IsBye;
    if(doubleBye){
      matches.push({round:1,slotIdx:i,player1:'BYE',player2:'BYE',score1:'',score2:'',winner:0,isBye:true,advancer:''});
    } else if(p1IsBye||p2IsBye){
      const real=p1IsBye?s2:s1;
      matches.push({round:1,slotIdx:i,player1:s1,player2:s2,score1:'',score2:'',winner:p1IsBye?2:1,isBye:true,advancer:real});
    } else {
      matches.push({round:1,slotIdx:i,player1:s1,player2:s2,score1:'',score2:'',winner:undefined,isBye:false,advancer:''});
    }
  }

  // Rodadas seguintes
  for(let round=2;round<=totalRounds;round++){
    const prevMatches=matches.filter(m=>m.round===round-1);
    const thisCount=prevMatches.length/2;
    for(let i=0;i<thisCount;i++){
      const m1=prevMatches[i*2], m2=prevMatches[i*2+1];
      const p1=m1?.advancer||'';
      const p2=m2?.advancer||'';
      const m1Empty=m1?.winner===0;
      const m2Empty=m2?.winner===0;
      let advancer='', isBye=false, winner;
      if(m1Empty&&m2Empty){winner=0;isBye=true;advancer='';}
      else if(m1Empty&&p2){winner=2;isBye=true;advancer=p2;}
      else if(m2Empty&&p1){winner=1;isBye=true;advancer=p1;}
      else{winner=undefined;isBye=false;}
      matches.push({round,slotIdx:i,player1:m1Empty?'':p1,player2:m2Empty?'':p2,score1:'',score2:'',winner,isBye,advancer});
    }
  }

  return matches;
}

