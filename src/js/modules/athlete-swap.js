// =====================================================================
// Trocar atleta igual ao BTP ("Replace Partner" + trocar a linha da chave),
// pedido do Weslley em 19/10/2026 ("como é feito no BTP?").
//
// Numa inscricao (key = "SM Principal", "DF Sub 15"...) sai um atleta e entra
// outro: na dupla troca so o parceiro escolhido, na simples o atleta. A
// inscricao passa pra quem entra (com substituiu = nome de quem saiu) e o nome
// da LINHA muda em TUDO: chave, cabecas, grupos, mata-mata, lista de Partidas
// (inclusive jogos ja feitos, igual ao BTP) e o W.O. por desqualificacao.
//
// O nome novo e IGUAL ao que o syncDrawsPlayers (app.js) monta — dupla na
// ordem do players[] — senao o proximo sincronismo achava a chave diferente
// e resetava o sorteio. Troca por igualdade exata (o rename do savePlayer usa
// includes e esquece seeds_list, groupsData e porDesqDe).
//
// Bloqueios (swapProblems): jogo da linha em quadra; atleta da linha marcado
// Ausente (o W.O. automatico tem que ser desfeito antes); quem entra com jogo
// pendente no mesmo dia e horario de um jogo pendente da linha (texto do BTP).
//
// Usa isMatchDone (match-result.js). Cobertura: tests/unit/athlete-swap.test.js
// =====================================================================

// Nome como o app monta (syncEntriesFromPlayers): sem trim
function swapName(p) {
  return p ? `${p.firstName} ${p.lastName}` : '';
}

function swapIsDouble(key) {
  return ['DM', 'DF', 'DX'].includes(String(key || '').split(' ')[0]);
}

// Linha da chave: simples = nome; dupla = quem vem primeiro no players[] +
// " / " + o outro ("Sem dupla" se o parceiro sumiu); dupla sem parceiro nao
// tem linha ('').
function swapEntryLabel(players, key, playerId, partnerId) {
  const p = players.find(x => x.id === playerId);
  if (!swapIsDouble(key)) return swapName(p);
  if (!partnerId) return '';
  const q = players.find(x => x.id === partnerId);
  if (!q) return `${swapName(p)} / Sem dupla`;
  return players.indexOf(p) <= players.indexOf(q)
    ? `${swapName(p)} / ${swapName(q)}`
    : `${swapName(q)} / ${swapName(p)}`;
}

// Idade cabe na categoria? Mesma regra do checkCategoryConflict (app.js): Sub X
// = idade menor que X; Senior/Master = idade a partir do limite; Principal e
// atleta sem data de nascimento = sempre. Idade pelo ano, igual ao app.
const SWAP_CAT_LIMITS = { 'Sub 11': 11, 'Sub 13': 13, 'Sub 15': 15, 'Sub 17': 17, 'Sub 19': 19, 'Sub 23': 23, 'Senior': 35, 'Master I': 45, 'Master II': 55 };
function swapAgeOk(dob, cat, year = new Date().getFullYear()) {
  const limit = SWAP_CAT_LIMITS[cat];
  if (!dob || !limit) return true;
  const age = year - new Date(dob + 'T00:00:00').getFullYear();
  return cat.startsWith('Sub') ? age < limit : age >= limit;
}

// Quem pode entrar no lugar de outId: quem ainda nao esta na chave e tem idade
// pra categoria; simples e dupla do mesmo sexo da modalidade, mista do mesmo
// sexo de quem sai.
function swapCandidates(players, key, outId, year) {
  const out = players.find(p => p.id === outId);
  if (!out) return [];
  const [mod, ...rest] = String(key).split(' ');
  const cat = rest.join(' ');
  const sex = ['SM', 'DM'].includes(mod) ? 'M' : ['SF', 'DF'].includes(mod) ? 'F' : out.gender;
  return players
    .filter(p => p.id !== outId && (!sex || p.gender === sex) && swapAgeOk(p.dob, cat, year) && !(p.inscriptions || []).some(i => i.key === key))
    .map(p => ({ id: p.id, name: swapName(p), club: p.club || '', category: p.category || '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// Jogos da lista de Partidas em que a linha joga (lado igual)
function swapLineMatches(matches, drawName, label) {
  if (!label) return [];
  return (matches || []).filter(m => m.drawName === drawName && (m.player1 === label || m.player2 === label));
}

// Jogos de um atleta em qualquer chave (sozinho ou dentro de "A / B")
function swapAthleteMatches(matches, name) {
  const has = side => String(side || '').split('/').some(n => n.trim() === name);
  return (matches || []).filter(m => has(m.player1) || has(m.player2));
}

// Linha (inscricao de quem sai) e os atletas dela, antes da troca
function _swapLine(players, key, outId) {
  const out = players.find(p => p.id === outId);
  const insc = out && (out.inscriptions || []).find(i => i.key === key);
  if (!insc) return null;
  const partnerId = swapIsDouble(key) ? (insc.partner || '') : '';
  return { out, insc, partnerId, label: swapEntryLabel(players, key, outId, partnerId) };
}

// Motivos que impedem a troca (lista vazia = pode trocar). dayOf(m) = indice
// do dia do jogo (scheduleDayOf no app).
function swapProblems(tournament, players, { key, outId, inId }, dayOf) {
  const line = _swapLine(players, key, outId);
  if (!line) return [];
  const out = [];
  [outId, line.partnerId].filter(Boolean).forEach(id => {
    const e = (tournament.entries || []).find(x => x.playerId === id && x.key === key);
    if (e && e.status === 'ausente') {
      out.push(`${swapName(players.find(p => p.id === id))} está como Ausente em ${key}: volte para Confirmado (desfaz o W.O. automático) antes de trocar.`);
    }
  });
  const mine = swapLineMatches(tournament.matches, key, line.label);
  mine.filter(m => m.status === 'Em Quadra').forEach(m => {
    out.push(`O jogo #${m.num} está em quadra: termine ou tire da quadra antes de trocar.`);
  });
  const inn = players.find(p => p.id === inId);
  if (inn) {
    const pend = m => !isMatchDone(m) && m.status !== 'A definir' && m.time;
    const his = swapAthleteMatches(tournament.matches, swapName(inn)).filter(pend);
    mine.filter(pend).forEach(a => his.forEach(b => {
      if (a.time === b.time && dayOf(a) === dayOf(b)) {
        out.push(`${swapName(inn)} já joga um jogo às ${b.time} (jogo #${b.num}, ${b.drawName}) e não pode ser escolhido. Escolha outro atleta ou mude o horário do jogo em conflito.`);
      }
    }));
  }
  return out;
}

// Troca o nome da linha em todos os lugares da chave drawName. Devolve quantos
// jogos da lista de Partidas mudaram; jogo pendente trocado perde a marca de
// sumula impressa (a folha velha tem o nome antigo).
function swapRenameLine(tournament, drawName, oldLabel, newLabel) {
  if (!oldLabel || oldLabel === newLabel) return { matches: 0 };
  const fixFields = o => {
    let hit = 0;
    ['player1', 'player2', 'player1Display', 'player2Display', 'advancer'].forEach(f => {
      if (o && o[f] === oldLabel) { o[f] = newLabel; hit++; }
    });
    return hit;
  };
  const fixList = list => (list || []).forEach((v, i, a) => { if (v === oldLabel) a[i] = newLabel; });
  (tournament.draws || []).filter(d => d.name === drawName).forEach(d => {
    fixList(d.players);
    fixList(d.seeds_list);
    (d.matches || []).forEach(fixFields);
    const g = d.groupsData;
    if (g) {
      (g.groups || []).forEach(gr => { fixList(gr.players); (gr.matches || []).forEach(fixFields); });
      (g.eliminationMatches || []).forEach(fixFields);
    }
  });
  let matches = 0;
  (tournament.matches || []).forEach(m => {
    if (m.drawName === drawName && fixFields(m)) {
      matches++;
      if (!isMatchDone(m)) delete m.scoresheetPrintedAt;
    }
    if (m.porDesqDe) {
      const [dn, p1, p2] = String(m.porDesqDe).split('|');
      if (dn === drawName && (p1 === oldLabel || p2 === oldLabel)) {
        m.porDesqDe = [dn, p1 === oldLabel ? newLabel : p1, p2 === oldLabel ? newLabel : p2].join('|');
      }
    }
  });
  return { matches };
}

// Faz a troca: inscricoes (players, mexe nos objetos) + o nome da linha.
// Devolve {oldLabel, newLabel, matches} ou {error}.
function swapApply(tournament, players, { key, outId, inId }) {
  const line = _swapLine(players, key, outId);
  if (!line) return { error: `Atleta não está inscrito em ${key}.` };
  const inn = players.find(p => p.id === inId);
  if (!inn) return { error: 'Atleta que entra não encontrado.' };
  if ((inn.inscriptions || []).some(i => i.key === key)) return { error: `${swapName(inn)} já está inscrito em ${key}.` };

  const { out, insc, partnerId, label: oldLabel } = line;
  out.inscriptions = out.inscriptions.filter(i => i !== insc);
  const { substituiu, ...base } = insc;
  inn.inscriptions = [...(inn.inscriptions || []), { ...base, partner: partnerId, substituiu: swapName(out) }];
  if (partnerId) {
    const partner = players.find(p => p.id === partnerId);
    const pi = partner && (partner.inscriptions || []).find(i => i.key === key);
    if (pi) pi.partner = inId;
  }
  const newLabel = swapEntryLabel(players, key, inId, partnerId);
  return { oldLabel, newLabel, ...swapRenameLine(tournament, key, oldLabel, newLabel) };
}
