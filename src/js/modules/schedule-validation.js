// =====================================================================
// Schedule Validation — "Validar programacao" (Weslley, 19/10/2026). Lista
// os problemas da agenda AGRUPADOS por checagem, dia a dia; nao bloqueia nada.
// - Regras da agenda (as mesmas do encaixe e do horario mudado a mao, via
//   scheduleConflictItems): marcam ⚠ no jogo em Partidas e na Agenda.
// - Outras checagens (tarde/cedo, simples depois de duplas, maximos por
//   dia): so na lista. Padroes: tudo ligado, 19:00/10:00, 2/1/1.
// PURO: recebe tudo por parametro. Usa as funcoes de schedule-slots.js.
// Usado por schedule.js (janela Validar programacao) e matches-ui.js (⚠).
// Cobertura: tests/unit/schedule-validation.test.js
// =====================================================================

// Checagens na ordem da lista. regra = da agenda (⚠ no jogo).
function scheduleValidationGroups() {
  return [
    { id: 'semHorario', titulo: 'Sem horário', regra: true },
    { id: 'conflito', titulo: 'Atleta em 2 jogos ao mesmo tempo', regra: true },
    { id: 'descanso', titulo: 'Descanso', regra: true },
    { id: 'quadras', titulo: 'Quadras cheias', regra: true },
    { id: 'ordem', titulo: 'Ordem das fases da chave', regra: true },
    { id: 'horarioDoDia', titulo: 'Fora do horário do dia', regra: true },
    { id: 'tardeCedo', titulo: 'Termina tarde e começa cedo' },
    { id: 'simplesDepoisDuplas', titulo: 'Simples depois de duplas' },
    { id: 'maxDia', titulo: 'Máximo de partidas por dia' },
    { id: 'maxSimplesDia', titulo: 'Máximo de simples por dia' },
    { id: 'maxChaveDia', titulo: 'Máximo de partidas por chave por dia' },
  ];
}

// Configuracao salva (tournament.scheduleValidation) com os padroes.
// rest = descanso do torneio (padrao do campo Descanso da janela).
function scheduleValidationSettings(saved, rest) {
  const s = saved || {};
  const on = v => v !== false;
  const num = (v, d, min) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min ? n : d; };
  const hora = (v, d) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? v : d);
  return {
    semHorario: on(s.semHorario), conflito: on(s.conflito),
    descanso: on(s.descanso), descansoMin: num(s.descansoMin, rest == null ? 20 : rest, 0),
    quadras: on(s.quadras), ordem: on(s.ordem), horarioDoDia: on(s.horarioDoDia),
    tardeCedo: on(s.tardeCedo), tardeDepois: hora(s.tardeDepois, '19:00'), cedoAntes: hora(s.cedoAntes, '10:00'),
    simplesDepoisDuplas: on(s.simplesDepoisDuplas),
    maxDia: on(s.maxDia), maxDiaN: num(s.maxDiaN, 2, 1),
    maxSimplesDia: on(s.maxSimplesDia), maxSimplesDiaN: num(s.maxSimplesDiaN, 1, 1),
    maxChaveDia: on(s.maxChaveDia), maxChaveDiaN: num(s.maxChaveDiaN, 1, 1),
  };
}

// "Ana x Bia" (ou o que a lista mostra no lugar: "Venc. jogo 5", "A definir")
function scheduleValidationMatchName(m) {
  const lado = s => m['player' + s] || m['player' + s + 'Display'] || 'A definir';
  return `${lado(1)} x ${lado(2)}`;
}

function scheduleValidationIsDouble(m) {
  const ev = String(m.event || String(m.drawName || '').split(' ')[0]).toUpperCase();
  return ev === 'DM' || ev === 'DF' || ev === 'DX';
}

// Problemas da programacao. ctx = { days, roundDays, gridOf(dia) -> cfg do dia
// em min { start, end, breakStart, breakEnd, dur, rest, courts } (dia -1 = sem
// dia), drawOf(jogo) -> chave, settings (scheduleValidationSettings) }.
// Devolve { rows, byMatch }: rows = [{ grupo, nome, m, num, drawName,
// roundName, day, time, texto }] na ordem dos grupos -> dia -> horario -> no;
// byMatch = Map(jogo -> textos das regras da agenda) pro ⚠.
function scheduleValidate(matches, ctx) {
  const days = ctx.days || [];
  const st = ctx.settings || scheduleValidationSettings(null, 20);
  const drawOf = ctx.drawOf || (() => null);
  const dayOf = m => (days.length ? scheduleDayOf(m, days, ctx.roundDays) : -1);
  const live = (matches || []).filter(m => !scheduleIsDone(m));
  const rows = [], byMatch = new Map();
  const row = (grupo, nome, m, day, texto, chave) => rows.push({
    grupo, nome, m: m || null, num: m ? m.num : null, drawName: m ? m.drawName || '' : chave || '',
    roundName: m ? m.roundName || '' : '', day, time: m ? m.time || '' : '', texto,
  });
  const mark = (m, texto) => { if (!byMatch.has(m)) byMatch.set(m, []); byMatch.get(m).push(texto); };

  // Sem horario (jogo em quadra ja esta sendo jogado)
  if (st.semHorario) {
    live.filter(m => !m.time && m.status !== 'Em Quadra').forEach(m => {
      row('semHorario', scheduleValidationMatchName(m), m, dayOf(m), 'Sem horário.');
      mark(m, 'Sem horário.');
    });
  }

  const byDay = new Map();
  live.filter(m => m.time).forEach(m => { const d = dayOf(m); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(m); });
  const order = list => [...list].sort((a, b) => scheduleMinutes(a.time) - scheduleMinutes(b.time) || (a.num || 0) - (b.num || 0));

  // Regras da agenda: cada jogo contra os ANTERIORES do mesmo dia -> cada par
  // sai 1 vez (no jogo de depois) e o ⚠ vai nos 2, cada um citando o outro.
  const grupoDo = { 'fora-do-dia': 'horarioDoDia', pausa: 'horarioDoDia', quadras: 'quadras', 'fase-anterior': 'ordem',
    'fase-seguinte': 'ordem', 'atleta-possivel': 'conflito', 'atleta-2-jogos': 'conflito', descanso: 'descanso' };
  const refDe = m => `(jogo ${m.num ? '#' + m.num + ' ' : ''}às ${m.time}, ${m.drawName || 'sem chave'})`;
  byDay.forEach((list, d) => {
    const cfg = { ...ctx.gridOf(d), rest: st.descansoMin };
    const sorted = order(list);
    sorted.forEach((m, i) => {
      scheduleConflictItems(m, scheduleMinutes(m.time), sorted.slice(0, i), cfg, drawOf).forEach(it => {
        // "A definir": ao mesmo tempo = conflito; so sem descanso = descanso
        const g = it.tipo === 'atleta-possivel' && it.dist >= Math.max(1, cfg.dur || 30) ? 'descanso' : grupoDo[it.tipo];
        if (!st[g]) return;
        row(g, it.athletes ? it.athletes.join(', ') : scheduleValidationMatchName(m), m, d, it.texto);
        mark(m, it.texto);
        if (it.other) mark(it.other, it.texto.replace(/\(jogo [^)]*\)/, refDe(m)));
      });
    });
  });

  // Outras checagens, por atleta e dia. Atletas do jogo: os conhecidos e, no
  // "A definir" de Eliminatoria, quem pode chegar (o caminho na chave). Grupos +
  // Eliminatoria fica com os conhecidos (la "pode chegar" = o grupo inteiro).
  const athletesOf = m => {
    const d = drawOf(m);
    if (scheduleIsToDefine(m) && d && d.type === 'Eliminatoria') return schedulePossibleAthletes(m, d);
    return scheduleAthletes(m.player1, m.player2);
  };
  const perAthlete = new Map(); // atleta -> Map(dia -> jogos em ordem)
  byDay.forEach((list, d) => order(list).forEach(m => athletesOf(m).forEach(a => {
    if (!perAthlete.has(a)) perAthlete.set(a, new Map());
    const pd = perAthlete.get(a);
    if (!pd.has(d)) pd.set(d, []);
    pd.get(d).push(m);
  })));
  const nextDate = date => {
    const [y, mo, da] = String(date || '').split('-').map(Number);
    return y ? new Date(Date.UTC(y, mo - 1, da + 1)).toISOString().slice(0, 10) : '';
  };
  const ddmm = date => { const p = String(date || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : ''; };
  perAthlete.forEach((pd, a) => {
    pd.forEach((list, d) => {
      const duplas = list.filter(scheduleValidationIsDouble), simples = list.filter(m => !scheduleValidationIsDouble(m));
      if (st.simplesDepoisDuplas && duplas.length && simples.length) {
        const dup = duplas[0], sim = simples[simples.length - 1];
        if (scheduleMinutes(dup.time) < scheduleMinutes(sim.time)) {
          const texto = `Dupla às ${dup.time} e simples às ${sim.time}.`;
          row('simplesDepoisDuplas', a, dup, d, texto);
          row('simplesDepoisDuplas', a, sim, d, texto);
        }
      }
      if (st.maxDia && list.length > st.maxDiaN) row('maxDia', a, null, d, `${list.length} partidas`);
      if (st.maxSimplesDia && simples.length > st.maxSimplesDiaN) row('maxSimplesDia', a, null, d, `${simples.length} partidas de simples`);
      if (st.maxChaveDia) {
        const porChave = new Map();
        list.forEach(m => porChave.set(m.drawName || '', (porChave.get(m.drawName || '') || 0) + 1));
        porChave.forEach((n, chave) => { if (n > st.maxChaveDiaN) row('maxChaveDia', a, null, d, `${n} partidas em ${chave || 'sem chave'}`, chave); });
      }
      // Termina tarde (inicio >= tardeDepois) e comeca cedo no dia seguinte (<= cedoAntes)
      const day = days[d], seguinte = day ? days.findIndex(x => x.date && x.date === nextDate(day.date)) : -1;
      if (st.tardeCedo && seguinte >= 0 && pd.has(seguinte)) {
        const tarde = list.filter(m => scheduleMinutes(m.time) >= scheduleMinutes(st.tardeDepois));
        const cedo = pd.get(seguinte).filter(m => scheduleMinutes(m.time) <= scheduleMinutes(st.cedoAntes));
        if (tarde.length && cedo.length) {
          const ult = tarde[tarde.length - 1], pri = cedo[0];
          const texto = `Joga às ${ult.time} (${ddmm(day.date)}) e às ${pri.time} do dia seguinte.`;
          row('tardeCedo', a, ult, d, texto);
          row('tardeCedo', a, pri, seguinte, texto);
        }
      }
    });
  });

  const pos = new Map(scheduleValidationGroups().map((g, i) => [g.id, i]));
  const at = r => (r.time ? scheduleMinutes(r.time) : 9999);
  rows.sort((x, y) => pos.get(x.grupo) - pos.get(y.grupo) || x.day - y.day || at(x) - at(y)
    || (x.num || 0) - (y.num || 0) || String(x.nome).localeCompare(String(y.nome)));
  return { rows, byMatch };
}
