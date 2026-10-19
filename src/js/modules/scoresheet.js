// =====================================================================
// Sumulas de jogo (score sheets):
// A4 paisagem, 1 por folha, padrao BWF/CBBd. Funcoes puras, sem globals.
//
// Sumula EM BRANCO pro arbitro: o cabecalho do jogo sai
// preenchido (torneio, chave, rodada, n do jogo, data, horario, quadra,
// atletas e clubes; o arbitro, se ja escalado) e o resto e a mao. Filtro
// de dia, quadra e horario, pulando jogo com atleta "A definir" e as ja
// impressas. Modelo validado pelo Weslley em
// 18/10/2026 ("1-1-2"; layout em Plano de Retorno/.../sumula-modelo/).
//
// Sumula PREENCHIDA (jogos finalizados): mesma folha com o resultado do app
// — vencedor, placar, inicio/fim/duracao e a grade de pontos no padrao BWF a
// partir do ponto a ponto que o app do arbitro grava (m.rallies). Jogo sem o
// ponto a ponto (lancado no Planner) sai com o placar de cada game circulado.
// Cobertura: tests/unit/scoresheet.test.js
// =====================================================================

var SCORESHEET_MODES = { SM: 'Simples Masculino', SF: 'Simples Feminino', DM: 'Duplas Masculinas', DF: 'Duplas Femininas', DX: 'Duplas Mistas' };
var SCORESHEET_POINT_COLS = 35; // igual a sumula BWF: 35 colunas de ponto por bloco
var SCORESHEET_GAMES = 3;       // 2 blocos por game (um game de 30-29 usa 60 colunas)

function _ssEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _ssMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Jogos da sumula, na ordem de dia, horario e numero.
// f = { filled, day: ''|indice, court: ''|nome, from/to: ''|'HH:MM', skipUnknown, skipPrinted }
//   filled = sumula preenchida: so os jogos finalizados (os 2 "pular" nao valem)
// ctx = { dayOf(m) -> indice do dia (-1 sem dia), isDone(m), isToDefine(m) }
function scoresheetSelect(matches, f, ctx) {
  const from = _ssMin(f.from), to = _ssMin(f.to);
  const day = f.day === '' || f.day == null ? null : Number(f.day);
  const isBye = m => m.player1 === 'BYE' || m.player2 === 'BYE';
  const known = m => !!m.player1 && !!m.player2 && !ctx.isToDefine(m);
  const list = (matches || []).filter(m => {
    if (!m || isBye(m) || !!f.filled !== !!ctx.isDone(m)) return false;
    if (!f.filled && f.skipUnknown && !known(m)) return false;
    if (!f.filled && f.skipPrinted && m.scoresheetPrintedAt) return false;
    if (day != null && ctx.dayOf(m) !== day) return false;
    if (f.court && m.court !== f.court) return false;
    if (from != null || to != null) {
      const t = _ssMin(m.time);
      if (t == null || (from != null && t < from) || (to != null && t > to)) return false;
    }
    return true;
  });
  const key = m => {
    const d = ctx.dayOf(m), t = _ssMin(m.time);
    return [d < 0 ? Infinity : d, t == null ? Infinity : t, Number(m.num) || 0];
  };
  return list.map(m => ({ m, k: key(m) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .map(x => x.m);
}

function _ssKv(label, value, extraClass) {
  return `<div class="kv${extraClass ? ' ' + extraClass : ''}"><span class="k">${label}</span><span class="v">${value}</span></div>`;
}
function _ssKv2(label1, value1, label2, value2) {
  return `<div class="kv"><span class="k">${label1}</span><span class="v">${value1}</span><span class="k2">${label2}</span><span class="v">${value2}</span></div>`;
}

// win: undefined = sumula em branco (caixa VENCEDOR pro arbitro marcar);
// true/false = preenchida (selo VENCEDOR so no lado que ganhou)
function _ssSide(n, names, clubs, word, win) {
  const lr = '<div class="lr"><i></i><span>E / D</span></div>';
  const club = [...new Set(clubs.filter(Boolean))].join(' / ');
  const mark = win === undefined ? ' <span class="vbox"><i></i>VENCEDOR</span>' : (win ? ' <em>VENCEDOR</em>' : '');
  return `<div class="side side${n}${win ? ' win' : ''}">
      <div class="cap">${word} ${n}${mark}</div>
      <div class="side-row">${n === 1 ? lr : ''}
        <div class="names">
          <div class="nm">${_ssEsc(names[0] || '')}</div>
          <div class="nm second">${_ssEsc(names[1] || '')}</div>
          <div class="club">${_ssEsc(club)}</div>
        </div>${n === 2 ? lr : ''}
      </div>
    </div>`;
}

// games = [[pontos do lado 1, do lado 2], ...] (preenchida); done[i] = o game
// terminou (destaca quem ganhou)
function _ssScoreBox(games, done) {
  let h = '<div class="scorebox"><div class="cap">Placar</div><div class="sb">';
  for (let i = 0; i < SCORESHEET_GAMES; i++) {
    const g = games && games[i];
    const w = s => (g && done[i] && g[s] > g[1 - s] ? ' class="w"' : '');
    h += `<div class="sg"><i>${i + 1}º</i><b${w(0)}>${g ? g[0] : ''}</b><span>:</span><b${w(1)}>${g ? g[1] : ''}</b></div>`;
  }
  return h + '</div></div>';
}

// Um bloco da grade: 4 linhas (2 do lado 1, 2 do lado 2 sombreadas), coluna
// do nome, coluna S/R e 35 colunas de ponto. Preenchida: cells[linha][coluna]
// = {val, fin (ultimo ponto, circulado), occ (Ret/Dis)}, sr = {linha: 'S'|'R'};
// fin = {score, done}: placar do game circulado no inicio (sem o ponto a ponto).
function _ssBlock(rowNames, cells, sr, fin) {
  let h = '<table class="blk"><colgroup><col class="cn"><col class="cs">' + '<col>'.repeat(SCORESHEET_POINT_COLS) + '</colgroup><tbody>';
  const rowCls = ['r1', 'r2', 'r3 sh', 'r4 sh'];
  for (let r = 0; r < 4; r++) {
    h += `<tr class="${rowCls[r]}"><td class="n">${_ssEsc(rowNames[r] || '')}</td>`;
    h += sr ? `<td class="s pt">${sr[r] || ''}</td>` : '<td class="s"></td>';
    let c = 0;
    if (fin) {
      if (r === 0 || r === 2) {
        const v = fin.score[r === 0 ? 0 : 1], o = fin.score[r === 0 ? 1 : 0];
        h += `<td class="fin${r === 0 ? ' top' : ''}" rowspan="2" colspan="3"><span class="circ${fin.done && v > o ? ' w' : ''}">${v}</span></td>`;
      }
      c = 3;
    }
    for (; c < SCORESHEET_POINT_COLS; c++) {
      const v = cells && cells[r][c];
      h += !v ? '<td></td>' : `<td class="pt${v.occ ? ' occ' : ''}">${v.fin ? `<span class="pc">${v.val}</span>` : v.val}</td>`;
    }
    h += '</tr>';
  }
  return h + '</tbody></table>';
}

// Linha da grade de um lado (0/1 = lado 1, 2/3 = lado 2; simples so 0 e 2).
// Linha gravada fora do lado (dado torto) vira o 1o nome do lado.
function _ssRow(row, side, dupla) {
  const rows = side === 1 ? (dupla ? [0, 1] : [0]) : (dupla ? [2, 3] : [2]);
  return rows.includes(row) ? row : rows[0];
}

// Grade BWF de 1 game a partir do ponto a ponto do app do arbitro
// (live_scores.rallies: {srv, rcv, pts: [[lado que ganhou o rali 1|2, linha
// de quem saca o proximo]]}): 1a coluna = 0 na linha do sacador (S) e do
// recebedor (R, so em duplas); depois, a cada rali, o placar de quem ganhou
// na coluna seguinte, na linha de quem saca o proximo — as linhas GRAVADAS,
// sem deduzir. O ultimo ponto sai circulado (cut = game interrompido por
// desistencia/desqualificacao: sem circulo). 2 blocos de 35 colunas (um game
// de 30-29 usa 60).
// -> { blocks: [celulas do bloco 1, do bloco 2], sr, score: [lado 1, lado 2], used: colunas usadas }
function scoresheetGrid(game, dupla, cut) {
  const pts = (game && Array.isArray(game.pts) ? game.pts : []).filter(p => Array.isArray(p) && (p[0] === 1 || p[0] === 2));
  const srvSide = game && (game.srv === 2 || game.srv === 3) ? 2 : 1;
  const srv = _ssRow(game && game.srv, srvSide, dupla), rcv = _ssRow(game && game.rcv, 3 - srvSide, dupla);
  const sr = dupla ? { [srv]: 'S', [rcv]: 'R' } : { [srv]: 'S' };
  const score = [0, 0];
  const cols = [[{ row: srv, val: 0 }, { row: rcv, val: 0 }]];
  pts.forEach(([side, row]) => {
    score[side - 1]++;
    cols.push([{ row: _ssRow(row, side, dupla), val: score[side - 1] }]);
  });
  if (pts.length && !cut) cols[cols.length - 1][0].fin = true;
  const empty = () => [0, 1, 2, 3].map(() => Array(SCORESHEET_POINT_COLS).fill(null));
  const blocks = [empty(), empty()];
  cols.forEach((col, k) => col.forEach(p => {
    const b = blocks[Math.floor(k / SCORESHEET_POINT_COLS)];
    if (b) b[p.row][k % SCORESHEET_POINT_COLS] = p;
  }));
  return { blocks, sr, score, used: cols.length };
}

// Placar game a game do jogo: "21-18 / 17-21" -> [[21, 18], [17, 21]] ("W.O." -> [])
function scoresheetGames(score) {
  return String(score || '').split('/')
    .map(s => /^(\d+)\s*-\s*(\d+)$/.exec(s.trim())).filter(Boolean)
    .map(([, a, b]) => [Number(a), Number(b)]);
}

// Hora local (hh:mm) e data (dd/mm/aaaa) de um ISO (startedAt/finishedAt)
function _ssDateOf(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d : null;
}
function _ssHhmm(iso) {
  const d = _ssDateOf(iso), p = n => String(n).padStart(2, '0');
  return d ? `${p(d.getHours())}:${p(d.getMinutes())}` : '';
}
function _ssDay(iso) {
  const d = _ssDateOf(iso), p = n => String(n).padStart(2, '0');
  return d ? `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

// Uma folha. t = { name, dateText, location }
// info = { day: 'dd/mm/aaaa', clubOf(nome), filled, points, maxPoints }
//   filled = sumula preenchida com o resultado do app (jogo finalizado);
//   points/maxPoints = pontuacao do torneio (21/30), pra saber se o ultimo
//   game de uma desistencia terminou.
function scoresheetSheet(m, t, info) {
  const filled = !!info.filled;
  const side = (p, disp) => String(p || disp || '').split(' / ').map(x => x.trim());
  const p1 = side(m.player1, m.player1Display), p2 = side(m.player2, m.player2Display);
  const code = String(m.drawName || '').split(' ')[0];
  const dupla = /^D[MFX]$/.test(code) || p1.length > 1 || p2.length > 1;
  const word = dupla ? 'Dupla' : 'Atleta';
  const clubs = (ps, real) => (real ? ps.map(n => (info.clubOf ? info.clubOf(n) : '')) : []);
  const rowNames = dupla ? [p1[0], p1[1], p2[0], p2[1]] : [p1[0], '', p2[0], ''];
  const blank = '<span class="hand"></span>';

  // Resultado (so na preenchida)
  const st = m.status, wn = m.winner === 1 || m.winner === 2 ? m.winner : 0;
  const games = filled ? scoresheetGames(m.score) : [];
  const P = Number(info.points) || 21, MAXP = Number(info.maxPoints) || 30;
  const over = g => { const w = Math.max(g[0], g[1]), l = Math.min(g[0], g[1]); return w >= P && (w - l >= 2 || w >= MAXP); };
  const stopped = st === 'Desistencia' || st === 'Desqualificacao';
  const done = games.map((g, i) => !(stopped && i === games.length - 1 && !over(g)));
  const ini = filled ? _ssHhmm(m.startedAt) : '', fim = filled ? _ssHhmm(m.finishedAt) : '';
  const t0 = _ssDateOf(m.startedAt), t1 = _ssDateOf(m.finishedAt);
  const dur = filled && t0 && t1 && t1 >= t0 ? Math.round((t1 - t0) / 60000) : null;
  const dayText = (filled && _ssDay(m.finishedAt)) || info.day;

  const left = [
    _ssKv('Chave', _ssEsc(m.drawName)),
    _ssKv('', _ssEsc(SCORESHEET_MODES[code] || ''), 'sub'),
    _ssKv('Rodada', _ssEsc(m.roundName || '')),
    _ssKv('Data', dayText ? _ssEsc(dayText) : blank),
    _ssKv('Horário', m.time ? `${_ssEsc(m.time)} <small>(previsto)</small>` : blank),
  ].join('');
  const right = [
    _ssKv('Quadra', m.court ? _ssEsc(m.court) : blank),
    _ssKv('Árbitro', m.umpire ? _ssEsc(m.umpire) : blank),
    _ssKv('Juiz de serviço', blank),
    _ssKv2('Início do jogo', ini || blank, 'Fim', fim || blank),
    _ssKv('Duração', dur != null ? `${dur} min` : `${blank}<small>min</small>`),
    _ssKv('Petecas usadas', blank),
  ].join('');

  let result;
  if (!filled) {
    result = `<div class="result"><span class="k">Resultado</span><span class="rv">Games: <span class="hand w8"></span> × <span class="hand w8"></span></span>
         <span class="chk"><i></i>W.O.</span><span class="chk"><i></i>Desistência (Ret)</span><span class="chk"><i></i>Desqualificação (Dis)</span></div>`;
  } else {
    const W = n => `${word} ${n}`;
    const scoreTxt = _ssEsc(games.map(g => g.join('-')).join(' / '));
    const vence = wn ? ` · vence <b>${W(wn)}</b>` : '';
    const de = wn ? ` de ${W(3 - wn)}` : '';
    const parcial = games.length ? ` · parcial ${scoreTxt}` : '';
    const won = s => games.filter((g, i) => done[i] && g[s] > g[1 - s]).length;
    const txt = {
      WO: [`<b>W.O.${m.atestado ? ' (atestado)' : ''}</b>${de}${vence}`, 'W.O.'],
      SemJogo: ['<b>Sem jogo</b> · os dois lados ausentes, ninguém avança', 'W.O.'],
      Desistencia: [`<b>Desistência</b>${de}${vence}${parcial}`, 'Desistência (Ret)'],
      Desqualificacao: [`<b>Desqualificação</b>${de}${vence}${parcial}`, 'Desqualificação (Dis)'],
    }[st];
    result = txt
      ? `<div class="result"><span class="k">Resultado</span><span class="chk on"><i></i>${txt[1]}</span><span class="rv">${txt[0]}</span></div>`
      : `<div class="result"><span class="k">Resultado</span><span class="rv">Vencedor: <b>${wn ? W(wn) : '—'}</b> · games <b>${won(0)} × ${won(1)}</b> · ${scoreTxt}</span></div>`;
  }

  // Grade: ponto a ponto do arbitro quando bate com o placar do jogo; senao o
  // placar do game circulado no inicio (jogo lancado no Planner, resultado
  // corrigido depois ou de antes do ponto a ponto)
  const rallies = filled && Array.isArray(m.rallies) ? m.rallies : [];
  const occ = { Desistencia: 'Ret', Desqualificacao: 'Dis' }[st];
  let grid = '';
  for (let i = 0; i < SCORESHEET_GAMES; i++) {
    const g = games[i];
    let b1 = _ssBlock(rowNames), b2 = _ssBlock(rowNames), ovl = '';
    if (filled && g) {
      const cut = !done[i];
      const gr = rallies[i] ? scoresheetGrid(rallies[i], dupla, cut) : null;
      if (gr && gr.score[0] === g[0] && gr.score[1] === g[1]) {
        if (cut && occ && wn && gr.used < 2 * SCORESHEET_POINT_COLS) {
          const k = gr.used, row = wn === 1 ? 2 : 0;
          gr.blocks[Math.floor(k / SCORESHEET_POINT_COLS)][row][k % SCORESHEET_POINT_COLS] = { val: occ, occ: true };
        }
        b1 = _ssBlock(rowNames, gr.blocks[0], gr.sr);
        b2 = _ssBlock(rowNames, gr.blocks[1]);
      } else {
        b1 = _ssBlock(rowNames, null, null, { score: g, done: !cut });
        const how = cut ? `interrompido (${st === 'Desistencia' ? 'desistência' : 'desqualificação'})` : `venceu ${word} ${g[0] > g[1] ? 1 : 2}`;
        ovl = `<div class="ovl"><b>${i + 1}º game: ${g[0]} × ${g[1]}</b> (${how}) · <span>ponto a ponto não registrado</span></div>`;
      }
    } else if (filled) {
      const why = i > 0 ? '' : ({
        WO: `W.O.${m.atestado ? ' (atestado)' : ''}`, SemJogo: 'os dois lados ausentes',
        Desistencia: 'desistência antes do 1º ponto', Desqualificacao: 'desqualificação antes do 1º ponto',
      }[st] || '');
      ovl = i === 0 && why ? `<div class="ovl"><b>Jogo não disputado</b> · <span>${why}</span></div>`
        : `<div class="ovl"><b>${i + 1}º game não disputado</b></div>`;
    }
    grid += `<div class="game"><div class="glabel"><span>${i + 1}º GAME</span></div><div class="gblocks">
      <div class="bw">${b1}${ovl}</div><div class="bw">${b2}</div></div></div>`;
  }

  const note = filled
    ? '<b>Súmula preenchida pelo app:</b> o app do árbitro salva cada rali com quem sacou; a grade sai no padrão BWF — 0 a 0 na 1ª coluna (S = sacador, R = recebedor), depois o placar de quem ganhou o rali na coluna seguinte, na linha de quem saca o próximo; o ponto final do game sai circulado. Jogo sem o ponto a ponto (lançado no Planner) sai com o placar de cada game circulado.'
    : '<b>Súmula em branco:</b> grade de pontos, placar, horários, petecas, vencedor, observações e assinaturas são preenchidos à mão pelo árbitro.';

  return `
<section class="sheet${filled ? ' is-filled' : ''}">
  <header class="brand">
    <div class="brand-left">
      <div class="fabd-name">FEDERAÇÃO ALAGOANA DE BADMINTON</div>
      <div class="t-name">${_ssEsc(t.name)}</div>
      <div class="t-meta">${_ssEsc([t.dateText, t.location].filter(Boolean).join(' | '))}</div>
    </div>
    <div class="brand-right">
      <div class="doc-title">SÚMULA DE JOGO<small>${filled ? 'preenchida com o resultado do app' : 'em branco para o árbitro'} · padrão BWF / CBBd</small></div>
      <div class="match-no"><span>JOGO Nº</span><b>${_ssEsc(m.num)}</b></div>
    </div>
  </header>
  <div class="info">
    <div class="info-left">${left}</div>
    <div class="info-center">
      <div class="sides">
        ${_ssSide(1, p1, clubs(p1, !!m.player1), word, filled ? wn === 1 : undefined)}
        ${_ssScoreBox(games, done)}
        ${_ssSide(2, p2, clubs(p2, !!m.player2), word, filled ? wn === 2 : undefined)}
      </div>
      ${result}
    </div>
    <div class="info-right">${right}</div>
  </div>
  <div class="games">${grid}</div>
  <div class="legend">
    <div><b>Como marcar:</b> S = sacador · R = recebedor (só em duplas) · E/D = lado esquerdo/direito do árbitro após o sorteio · cada game começa com 0 para os dois lados · um número por coluna, na linha de quem fez o ponto · 20-20: risco diagonal na próxima coluna · fim do game: placar circulado e copiado no PLACAR · fim do jogo: marcar o VENCEDOR, a hora e as petecas · intervalo: até 60 s quando um lado chega a 11 e até 120 s entre games.</div>
    <div><b>Ocorrências</b> (letra na coluna do momento + explicação em Observações): W advertência (cartão amarelo) · F falta (cartão vermelho) · R árbitro geral chamado à quadra · I lesão · S jogo suspenso · Ret desistência · Dis desqualificação (cartão preto).</div>
  </div>
  <div class="bottom">
    <div class="obs"><div class="k">Observações / ocorrências</div><div class="ln"></div><div class="ln"></div></div>
    <div class="sig"><div class="sl"></div><div class="sk">Assinatura do árbitro${filled && m.umpire ? ` · <b>${_ssEsc(m.umpire)}</b>` : ''}</div></div>
    <div class="sig"><div class="sl"></div><div class="sk">Assinatura do árbitro geral</div></div>
  </div>
  <footer class="foot">
    <div class="note">${note}</div>
    <div class="gen">FABD Tournament Planner</div>
  </footer>
</section>`;
}

function scoresheetCss() {
  return `
:root{--blue:#1E3A8A;--red:#C41E2A;--green:#059669;--line:#8E99AB;--shade:#E8EDF7;--ink:#1a1a1a;--muted:#5B6474}
*{margin:0;padding:0;box-sizing:border-box}
@page{size:A4 landscape;margin:0}
html,body{background:#D9DDE3}
body{font-family:'Segoe UI',Tahoma,'Liberation Sans',Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:center;align-items:center;padding:10px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.15);font-size:13px}
.toolbar button{padding:9px 22px;font-size:14px;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600}
.toolbar .info{color:var(--muted);margin-right:8px}
.sheet{width:297mm;height:210mm;padding:7mm 8mm 6mm;background:#fff;margin:10mm auto;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.18)}
@media print{html,body{background:#fff}.toolbar{display:none}.sheet{margin:0;box-shadow:none;break-after:page;page-break-after:always}.sheet:last-of-type{break-after:auto;page-break-after:auto}}
.brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:0.8mm solid var(--blue);padding-bottom:1.5mm}
.fabd-name{font-size:8pt;font-weight:700;color:var(--red);letter-spacing:.35mm}
.t-name{font-size:14pt;font-weight:700;color:var(--blue);line-height:1.2}
.t-meta{font-size:8pt;color:var(--muted)}
.brand-right{display:flex;align-items:flex-end;gap:4mm}
.doc-title{text-align:right;font-size:15pt;font-weight:700;color:var(--blue);line-height:1.15}
.doc-title small{display:block;font-size:7.5pt;font-weight:400;color:var(--muted)}
.match-no{border:0.5mm solid var(--blue);border-radius:1.5mm;text-align:center;padding:0.5mm 3mm 0.8mm;min-width:22mm}
.match-no span{display:block;font-size:6.5pt;font-weight:700;color:var(--muted);letter-spacing:.3mm}
.match-no b{display:block;font-size:18pt;line-height:1;color:var(--blue)}
.info{display:grid;grid-template-columns:50mm minmax(0,1fr) 62mm;gap:5mm;margin-top:2.3mm;align-items:start}
.kv{display:flex;align-items:flex-end;gap:1.5mm;height:4.75mm}
.kv .k{width:17mm;flex:none;font-size:6.8pt;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1mm;white-space:nowrap;padding-bottom:0.5mm}
.info-right .kv .k{width:25mm}
.kv .v{flex:1;min-width:0;font-size:9.5pt;font-weight:700;line-height:4.2mm;height:4.4mm;border-bottom:0.25mm dotted #6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:flex-end;gap:1mm}
.kv .v small{font-size:7pt;font-weight:400;color:var(--muted)}
.kv .k2{flex:none;font-size:6.8pt;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1mm;padding-bottom:0.5mm;margin-left:1.5mm}
.kv.sub{height:4.2mm}
.kv.sub .v{font-size:7.5pt;font-weight:600;color:var(--muted);border-bottom:0;height:3.8mm;line-height:3.8mm}
.hand{display:inline-block;flex:1}
.sides{display:grid;grid-template-columns:1fr 25mm 1fr;gap:3mm;align-items:start}
.cap{height:4mm;display:flex;align-items:center;gap:1mm;font-size:6.8pt;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.2mm;white-space:nowrap}
.side1 .cap{padding-left:7.5mm}
.side2 .cap{justify-content:flex-end;padding-right:7.5mm}
.cap em{font-style:normal;color:#fff;background:var(--green);border-radius:1mm;padding:0 1.5mm;margin-left:1mm;letter-spacing:.3mm}
.vbox{display:inline-flex;align-items:center;gap:1mm;margin-left:2mm;color:var(--ink)}
.vbox i{display:inline-block;width:3mm;height:3mm;border:0.3mm solid var(--blue);background:#fff}
.side-row{display:flex;gap:1.5mm;align-items:flex-start}
.lr{width:6mm;flex:none;text-align:center}
.lr i{display:block;width:6mm;height:6mm;border:0.35mm solid var(--blue);background:#fff}
.lr span{display:block;margin-top:0.4mm;font-size:5.5pt;font-weight:700;color:var(--muted);white-space:nowrap}
.names{flex:1;min-width:0;border:0.35mm solid var(--blue);background:#fff}
.side2 .names{background:var(--shade)}
.names .nm{height:6mm;line-height:6mm;padding:0 2mm;font-size:10pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.names .nm.second{border-top:0.25mm dashed var(--line)}
.names .club{height:5.4mm;line-height:5.4mm;padding:0 2mm;font-size:8pt;color:var(--muted);border-top:0.3mm solid var(--blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.side.win .names{border-color:var(--green);box-shadow:inset 0 0 0 0.4mm var(--green)}
.scorebox .cap{justify-content:center}
.sb{border:0.35mm solid var(--blue)}
.sg{display:grid;grid-template-columns:5mm 1fr 2mm 1fr 1mm;align-items:center;height:5.8mm;border-top:0.25mm solid var(--line);font-size:10.5pt}
.sg:first-child{border-top:0}
.sg i{font-style:normal;font-size:6.3pt;font-weight:700;color:var(--muted);text-align:center}
.sg b{text-align:center;font-weight:600}
.sg b.w{font-weight:700;color:var(--blue)}
.sg span{text-align:center;color:var(--muted);font-weight:700}
.result{margin-top:2.4mm;display:flex;align-items:flex-end;gap:2.5mm;font-size:8.5pt;white-space:nowrap}
.result .k{font-size:6.8pt;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1mm;padding-bottom:0.3mm}
.result .rv{display:flex;align-items:flex-end;gap:1.2mm;overflow:hidden;text-overflow:ellipsis}
.result .rv b{color:var(--ink)}
.is-filled .result .rv{display:block}
.result .hand{flex:none;border-bottom:0.25mm dotted #6B7280;height:4mm}
.result .hand.w8{width:7mm}
.chk{display:inline-flex;align-items:center;gap:1mm;font-size:7.5pt;margin-left:1.5mm}
.chk i{display:inline-block;width:3mm;height:3mm;border:0.3mm solid var(--blue)}
.chk.on{font-weight:700;color:var(--red)}
.chk.on i{background:var(--blue);box-shadow:inset 0 0 0 0.5mm #fff}
.games{margin-top:2.4mm;display:flex;flex-direction:column;gap:2mm}
.game{display:flex;gap:1.2mm}
.glabel{width:5mm;flex:none;background:var(--blue);color:#fff;border-radius:1mm;display:flex;align-items:center;justify-content:center}
.glabel span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:7pt;font-weight:700;letter-spacing:.4mm;white-space:nowrap}
.gblocks{flex:1;min-width:0;display:flex;flex-direction:column;gap:1.1mm}
.bw{position:relative}
table.blk{width:100%;table-layout:fixed;border-collapse:collapse;border:0.45mm solid var(--blue)}
table.blk col.cn{width:40mm}
table.blk col.cs{width:6mm}
table.blk td{height:4.25mm;border:0.2mm solid var(--line);padding:0;font-size:7.5pt;line-height:1}
table.blk td.n{padding:0 1.5mm;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
table.blk td.s{border-right:0.45mm solid var(--blue)}
table.blk tr.r2 td,table.blk td.fin.top{border-bottom:0.45mm solid var(--blue)}
table.blk tr.sh td{background:var(--shade)}
table.blk td.pt{text-align:center;font-weight:700;color:var(--blue);font-size:7pt}
table.blk td.pt.occ{color:var(--red);font-size:6pt}
table.blk td.fin{text-align:center;vertical-align:middle}
.pc{display:inline-block;min-width:3.4mm;border:0.35mm solid var(--green);border-radius:50%;color:var(--green)}
.circ{display:inline-flex;align-items:center;justify-content:center;width:6.6mm;height:6.6mm;border:0.4mm solid var(--blue);border-radius:50%;background:#fff;font-size:9.5pt;font-weight:700;color:var(--blue)}
.circ.w{border-color:var(--green);color:var(--green)}
.ovl{position:absolute;left:72mm;right:4mm;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.95);border:0.3mm solid var(--blue);border-radius:1.5mm;padding:0.8mm 3mm;font-size:8pt;color:var(--blue);text-align:center;white-space:nowrap;overflow:hidden}
.ovl span{color:var(--muted)}
.legend{margin-top:2mm;font-size:6.5pt;line-height:1.35;color:#374151}
.legend b{color:var(--blue)}
.bottom{margin-top:1.6mm;display:grid;grid-template-columns:1fr 60mm 60mm;gap:7mm;align-items:end}
.obs .k{font-size:6.8pt;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1mm}
.obs .ln{height:4.4mm;border-bottom:0.25mm solid #9CA3AF}
.sig .sl{height:9mm;border-bottom:0.3mm solid var(--ink)}
.sig .sk{margin-top:0.8mm;font-size:7pt;color:var(--muted);text-align:center;white-space:nowrap}
.sig .sk b{color:var(--ink)}
.foot{margin-top:auto;padding-top:1.4mm;border-top:0.25mm solid #CBD5E1;display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;font-size:6.5pt;line-height:1.35;color:var(--muted)}
.foot .note b{color:var(--blue)}
.foot .gen{flex:none;text-align:right;white-space:nowrap}
`;
}

// Documento da janela de impressao: barra (Imprimir/Fechar, some na
// impressao) + as folhas. O clique e tratado por quem abre a janela (CSP sem
// script inline).
function scoresheetDocument(sheets, title) {
  const n = sheets.length;
  const bar = `<div class="toolbar"><span class="info">${n} súmula${n === 1 ? '' : 's'} · A4 paisagem, 1 por folha</span>`
    + '<button data-action="print" style="background:#1E3A8A">Imprimir</button>'
    + '<button data-action="close" style="background:#6B7280">Fechar</button></div>';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${_ssEsc(title)}</title><style>${scoresheetCss()}</style></head><body>${bar}${sheets.join('')}</body></html>`;
}
