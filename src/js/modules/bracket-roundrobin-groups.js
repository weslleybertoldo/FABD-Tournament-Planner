// =====================================================================
// Bracket Round-Robin + Groups Phase — geracao de chave round-robin
// e fase de grupos com snake draft + protecao de clube.
//
// _shuffleArray(arr): Fisher-Yates shuffle (Math.random).
// _getPlayerClub(name): lookup do clube do atleta em tournament.players
//   (dep global compartilhada com bracket-elim).
// _placePlayerWithClubProtection(groups, player): distribui 1 player no
//   grupo com menos do mesmo clube + balanceamento de tamanho.
// generateRoundRobinSchedule(pls): round-robin de N players.
// generateGroupsPhase(playerList, numGroups, seeds): snake draft + RR
//   por grupo. Retorna { groups, eliminationMatches: [] }.
// computeGroupStandings(groupPlayers, matches): tabela com BWF tiebreaker
//   (mini-league entre empatados).
// areGroupsFinished(d): true se todos matches dos grupos tem winner.
//
// Issue #14 sub-tarefa 14.K — auditoria 2026-05-09.
// Cobertura: tests/unit/bracket-roundrobin-groups.test.js
// =====================================================================

function generateRoundRobinSchedule(pls) {
  const list=[...pls]; if(list.length%2!==0)list.push('BYE');
  const total=list.length,rounds=total-1,mpr=total/2,matches=[];
  // Pre-computa map name→idx do array original (O(1) lookup vs indexOf O(n) por match).
  // Preserva semantica original: indexOf retorna PRIMEIRO encontro + -1 se ausente.
  const idxMap = new Map();
  for (let i = 0; i < pls.length; i++) {
    if (!idxMap.has(pls[i])) idxMap.set(pls[i], i);
  }
  for(let r=0;r<rounds;r++){for(let m=0;m<mpr;m++){
    const home=m===0?0:(total-1-m+r)%(total-1)+1;
    const away=(m+r)%(total-1)+1;
    const p1=list[home<total?home:0],p2=list[away<total?away:0];
    if(p1==='BYE'||p2==='BYE')continue;
    matches.push({round:r+1,player1:p1,player2:p2,p1idx:idxMap.get(p1)??-1,p2idx:idxMap.get(p2)??-1,score1:'',score2:''});
  }}
  return matches;
}

// === GRUPOS + ELIMINATORIA ===
// Fisher-Yates shuffle (usado antes da distribuicao de non-seeds)
function _shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Retorna o clube do atleta (usa tournament.players como fonte). Aceita nome simples OU dupla "A / B".
// Em duplas com 2 parceiros do mesmo clube, retorna o clube UMA vez (dedup via Set).
function _getPlayerClub(name) {
  if (!tournament?.players || !name) return '';
  const parts = name.split('/').map(s => s.trim()).filter(Boolean);
  const clubs = new Set();
  for (const n of parts) {
    const p = tournament.players.find(pl => {
      const full = ((pl.firstName || '') + ' ' + (pl.lastName || '')).trim().toLowerCase();
      return full === n.toLowerCase();
    });
    if (p?.club) clubs.add(p.club);
  }
  return [...clubs].join('|');
}

// Cache de _getPlayerClub por nome — invalidado a cada chamada de _resetPlayerClubCache().
// Evita .find() em tournament.players repetido durante distribuicao de grupos.
const _playerClubCache = new Map();
function _resetPlayerClubCache() { _playerClubCache.clear(); }
function _getPlayerClubCached(name) {
  if (_playerClubCache.has(name)) return _playerClubCache.get(name);
  const v = _getPlayerClub(name);
  _playerClubCache.set(name, v);
  return v;
}

// Distribui 1 jogador no grupo com menor numero de jogadores daquele clube.
// Em empate de contagem de clube, usa grupo com menos jogadores totais (balanceamento).
function _placePlayerWithClubProtection(groups, player) {
  const clubs = _getPlayerClubCached(player).split('|').filter(Boolean);
  if (!clubs.length) {
    // Sem clube cadastrado — coloca no grupo menos populoso
    const target = groups.reduce((a, b) => (a.players.length <= b.players.length ? a : b));
    target.players.push(player);
    return;
  }
  // Score = (atletas do mesmo clube ja no grupo) * 1000 + (total de atletas no grupo)
  // Quanto menor o score, melhor
  let best = groups[0], bestScore = Infinity;
  groups.forEach(g => {
    const clubsInGroup = g.players.reduce((acc, p) => {
      const pc = _getPlayerClubCached(p).split('|').filter(Boolean);
      return acc + clubs.filter(c => pc.includes(c)).length;
    }, 0);
    const score = clubsInGroup * 1000 + g.players.length;
    if (score < bestScore) { bestScore = score; best = g; }
  });
  best.players.push(player);
}

function generateGroupsPhase(playerList, numGroups, seeds) {
  seeds = seeds || [];
  _resetPlayerClubCache(); // invalida cache no inicio de cada geracao
  const groupLabels = 'ABCDEFGH';
  const groups = [];
  for (let i = 0; i < numGroups; i++) {
    groups.push({ name: 'Grupo ' + groupLabels[i], players: [], matches: [] });
  }

  // BWF/BTP: seeds distribuidas em SNAKE draft (nao round-robin simples)
  // Com 8 seeds e 4 grupos: A(1,8), B(2,7), C(3,6), D(4,5) — balanceamento de forca
  let si = 0, sdir = 1;
  seeds.forEach(s => {
    groups[si].players.push(s);
    si += sdir;
    if (si >= numGroups) { si = numGroups - 1; sdir = -1; }
    else if (si < 0) { si = 0; sdir = 1; }
  });

  // BWF/BTP: non-seeds EMBARALHADOS (shuffle) antes da distribuicao pra aleatoriedade real
  // + protecao de clube (atletas do mesmo clube evitam o mesmo grupo quando possivel)
  const remaining = _shuffleArray(playerList.filter(p => !seeds.includes(p)));
  remaining.forEach(p => _placePlayerWithClubProtection(groups, p));

  // Generate round-robin matches for each group
  groups.forEach(g => {
    const gLabel = (g.name || 'Grupo').replace('Grupo ', '');
    const rr = generateRoundRobinSchedule(g.players);
    g.matches = rr.map(m => ({ ...m, group: gLabel, phase: 'group' }));
  });

  return { groups, eliminationMatches: [] };
}

function computeGroupStandings(groupPlayers, matches) {
  const stats = {};
  groupPlayers.forEach(p => { stats[p] = { name: p, wins: 0, losses: 0, ptsFor: 0, ptsAgainst: 0, headToHead: {} }; });
  matches.forEach(m => {
    if (m.winner === undefined) return;
    const p1 = m.player1, p2 = m.player2;
    if (!stats[p1] || !stats[p2]) return;
    let p1Pts = 0, p2Pts = 0;
    if (m.score1 && m.score2 && m.score1 !== 'W.O.' && m.score2 !== 'W.O.') {
      String(m.score1).split(' ').map(Number).filter(n => !isNaN(n)).forEach(v => p1Pts += v);
      String(m.score2).split(' ').map(Number).filter(n => !isNaN(n)).forEach(v => p2Pts += v);
    }
    if (m.winner === 1) { stats[p1].wins++; stats[p2].losses++; stats[p1].headToHead[p2] = 1; stats[p2].headToHead[p1] = 0; }
    else if (m.winner === 2) { stats[p2].wins++; stats[p1].losses++; stats[p2].headToHead[p1] = 1; stats[p1].headToHead[p2] = 0; }
    stats[p1].ptsFor += p1Pts; stats[p1].ptsAgainst += p2Pts;
    stats[p2].ptsFor += p2Pts; stats[p2].ptsAgainst += p1Pts;
  });
  Object.values(stats).forEach(s => { s.ptsDiff = s.ptsFor - s.ptsAgainst; });
  const arr = Object.values(stats);

  // Ordenacao inicial: wins -> ptsDiff -> ptsFor
  arr.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.ptsDiff !== a.ptsDiff) return b.ptsDiff - a.ptsDiff;
    if (b.ptsFor !== a.ptsFor) return b.ptsFor - a.ptsFor;
    return 0;
  });

  // BWF tiebreaker: empates (2+) em wins+ptsDiff+ptsFor sao resolvidos por
  // MINI-CAMPEONATO entre os empatados (H2H entre o grupo de empatados).
  // - Empate de 2: pega o resultado direto (quem venceu o outro)
  // - Empate de 3+: conta quantos venceram DENTRO do sub-grupo (mini-league)
  const tiedBlocks = [];
  let i = 0;
  while (i < arr.length) {
    let j = i + 1;
    while (j < arr.length
      && arr[j].wins === arr[i].wins
      && arr[j].ptsDiff === arr[i].ptsDiff
      && arr[j].ptsFor === arr[i].ptsFor) j++;
    if (j - i >= 2) tiedBlocks.push([i, j]); // [start, end) — bloco empatado
    i = j;
  }

  tiedBlocks.forEach(([start, end]) => {
    const block = arr.slice(start, end);
    const names = new Set(block.map(s => s.name));
    // Mini-wins: contagem de vitorias so contra oponentes DENTRO do bloco empatado
    block.forEach(s => {
      s._miniWins = 0;
      Object.entries(s.headToHead).forEach(([opp, result]) => {
        if (names.has(opp) && result === 1) s._miniWins++;
      });
    });
    // Re-ordenar dentro do bloco: mini-wins desc; se ainda empatar, ordem original
    block.sort((a, b) => (b._miniWins - a._miniWins) || 0);
    // Escrever de volta no arr mantendo as posicoes do bloco
    for (let k = start; k < end; k++) arr[k] = block[k - start];
  });

  return arr;
}

function areGroupsFinished(d) {
  if (!d.groupsData || !d.groupsData.groups) return false;
  return d.groupsData.groups.every(g => {
    const realMatches = g.matches.filter(m => m.player1 && m.player2 && m.player1 !== 'BYE' && m.player2 !== 'BYE');
    return realMatches.length > 0 && realMatches.every(m => m.winner !== undefined && m.winner !== null);
  });
}

