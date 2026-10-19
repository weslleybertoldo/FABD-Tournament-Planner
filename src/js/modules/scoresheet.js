// =====================================================================
// Sumulas de jogo (score sheets) — igual ao BTP (Report > Scoresheets):
// A4 paisagem, 1 por folha, padrao BWF/CBBd. Funcoes puras, sem globals.
//
// Sumula EM BRANCO pro arbitro (o padrao do BTP): o cabecalho do jogo sai
// preenchido (torneio, chave, rodada, n do jogo, data, horario, quadra,
// atletas e clubes; o arbitro, se ja escalado) e o resto e a mao. Filtro
// de dia, quadra e horario, pulando jogo com atleta "A definir" e as ja
// impressas (FRMPRINTSCORESHEETS do BTP: "Skip if not all players are
// known" / "Skip if already printed"). Modelo validado pelo Weslley em
// 18/10/2026 ("1-1-2"; layout em Plano de Retorno/.../sumula-modelo/).
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

// Jogos da sumula em branco, na ordem de dia, horario e numero.
// f = { day: ''|indice, court: ''|nome, from/to: ''|'HH:MM', skipUnknown, skipPrinted }
// ctx = { dayOf(m) -> indice do dia (-1 sem dia), isDone(m), isToDefine(m) }
function scoresheetSelect(matches, f, ctx) {
  const from = _ssMin(f.from), to = _ssMin(f.to);
  const day = f.day === '' || f.day == null ? null : Number(f.day);
  const isBye = m => m.player1 === 'BYE' || m.player2 === 'BYE';
  const known = m => !!m.player1 && !!m.player2 && !ctx.isToDefine(m);
  const list = (matches || []).filter(m => {
    if (!m || ctx.isDone(m) || isBye(m)) return false;
    if (f.skipUnknown && !known(m)) return false;
    if (f.skipPrinted && m.scoresheetPrintedAt) return false;
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

function _ssSide(n, names, clubs, word) {
  const lr = '<div class="lr"><i></i><span>E / D</span></div>';
  const club = [...new Set(clubs.filter(Boolean))].join(' / ');
  return `<div class="side side${n}">
      <div class="cap">${word} ${n} <span class="vbox"><i></i>VENCEDOR</span></div>
      <div class="side-row">${n === 1 ? lr : ''}
        <div class="names">
          <div class="nm">${_ssEsc(names[0] || '')}</div>
          <div class="nm second">${_ssEsc(names[1] || '')}</div>
          <div class="club">${_ssEsc(club)}</div>
        </div>${n === 2 ? lr : ''}
      </div>
    </div>`;
}

function _ssScoreBox() {
  let h = '<div class="scorebox"><div class="cap">Placar</div><div class="sb">';
  for (let i = 0; i < SCORESHEET_GAMES; i++) h += `<div class="sg"><i>${i + 1}º</i><b></b><span>:</span><b></b></div>`;
  return h + '</div></div>';
}

// Um bloco da grade: 4 linhas (2 do lado 1, 2 do lado 2 sombreadas), coluna
// do nome, coluna S/R e 35 colunas de ponto.
function _ssBlock(rowNames) {
  let h = '<table class="blk"><colgroup><col class="cn"><col class="cs">' + '<col>'.repeat(SCORESHEET_POINT_COLS) + '</colgroup><tbody>';
  const rowCls = ['r1', 'r2', 'r3 sh', 'r4 sh'];
  for (let r = 0; r < 4; r++) {
    h += `<tr class="${rowCls[r]}"><td class="n">${_ssEsc(rowNames[r] || '')}</td><td class="s"></td>` + '<td></td>'.repeat(SCORESHEET_POINT_COLS) + '</tr>';
  }
  return h + '</tbody></table>';
}

// Uma folha. t = { name, dateText, location }; info = { day: 'dd/mm/aaaa', clubOf(nome) }
function scoresheetSheet(m, t, info) {
  const side = (p, disp) => String(p || disp || '').split(' / ').map(x => x.trim());
  const p1 = side(m.player1, m.player1Display), p2 = side(m.player2, m.player2Display);
  const code = String(m.drawName || '').split(' ')[0];
  const dupla = /^D[MFX]$/.test(code) || p1.length > 1 || p2.length > 1;
  const word = dupla ? 'Dupla' : 'Atleta';
  const clubs = (ps, real) => (real ? ps.map(n => (info.clubOf ? info.clubOf(n) : '')) : []);
  const rowNames = dupla ? [p1[0], p1[1], p2[0], p2[1]] : [p1[0], '', p2[0], ''];
  const blank = '<span class="hand"></span>';

  const left = [
    _ssKv('Chave', _ssEsc(m.drawName)),
    _ssKv('', _ssEsc(SCORESHEET_MODES[code] || ''), 'sub'),
    _ssKv('Rodada', _ssEsc(m.roundName || '')),
    _ssKv('Data', info.day ? _ssEsc(info.day) : blank),
    _ssKv('Horário', m.time ? `${_ssEsc(m.time)} <small>(previsto)</small>` : blank),
  ].join('');
  const right = [
    _ssKv('Quadra', m.court ? _ssEsc(m.court) : blank),
    _ssKv('Árbitro', m.umpire ? _ssEsc(m.umpire) : blank),
    _ssKv('Juiz de serviço', blank),
    _ssKv2('Início do jogo', blank, 'Fim', blank),
    _ssKv('Duração', `${blank}<small>min</small>`),
    _ssKv('Petecas usadas', blank),
  ].join('');
  const result = `<div class="result"><span class="k">Resultado</span><span class="rv">Games: <span class="hand w8"></span> × <span class="hand w8"></span></span>
         <span class="chk"><i></i>W.O.</span><span class="chk"><i></i>Desistência (Ret)</span><span class="chk"><i></i>Desqualificação (Dis)</span></div>`;
  let grid = '';
  for (let i = 0; i < SCORESHEET_GAMES; i++) {
    grid += `<div class="game"><div class="glabel"><span>${i + 1}º GAME</span></div><div class="gblocks">
      <div class="bw">${_ssBlock(rowNames)}</div><div class="bw">${_ssBlock(rowNames)}</div></div></div>`;
  }

  return `
<section class="sheet">
  <header class="brand">
    <div class="brand-left">
      <div class="fabd-name">FEDERAÇÃO ALAGOANA DE BADMINTON</div>
      <div class="t-name">${_ssEsc(t.name)}</div>
      <div class="t-meta">${_ssEsc([t.dateText, t.location].filter(Boolean).join(' | '))}</div>
    </div>
    <div class="brand-right">
      <div class="doc-title">SÚMULA DE JOGO<small>em branco para o árbitro · padrão BWF / CBBd</small></div>
      <div class="match-no"><span>JOGO Nº</span><b>${_ssEsc(m.num)}</b></div>
    </div>
  </header>
  <div class="info">
    <div class="info-left">${left}</div>
    <div class="info-center">
      <div class="sides">
        ${_ssSide(1, p1, clubs(p1, !!m.player1), word)}
        ${_ssScoreBox()}
        ${_ssSide(2, p2, clubs(p2, !!m.player2), word)}
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
    <div class="sig"><div class="sl"></div><div class="sk">Assinatura do árbitro</div></div>
    <div class="sig"><div class="sl"></div><div class="sk">Assinatura do árbitro geral</div></div>
  </div>
  <footer class="foot">
    <div class="note"><b>Súmula em branco:</b> grade de pontos, placar, horários, petecas, vencedor, observações e assinaturas são preenchidos à mão pelo árbitro.</div>
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
.scorebox .cap{justify-content:center}
.sb{border:0.35mm solid var(--blue)}
.sg{display:grid;grid-template-columns:5mm 1fr 2mm 1fr 1mm;align-items:center;height:5.8mm;border-top:0.25mm solid var(--line);font-size:10.5pt}
.sg:first-child{border-top:0}
.sg i{font-style:normal;font-size:6.3pt;font-weight:700;color:var(--muted);text-align:center}
.sg b{text-align:center;font-weight:600}
.sg span{text-align:center;color:var(--muted);font-weight:700}
.result{margin-top:2.4mm;display:flex;align-items:flex-end;gap:2.5mm;font-size:8.5pt;white-space:nowrap}
.result .k{font-size:6.8pt;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1mm;padding-bottom:0.3mm}
.result .rv{display:flex;align-items:flex-end;gap:1.2mm;overflow:hidden;text-overflow:ellipsis}
.result .hand{flex:none;border-bottom:0.25mm dotted #6B7280;height:4mm}
.result .hand.w8{width:7mm}
.chk{display:inline-flex;align-items:center;gap:1mm;font-size:7.5pt;margin-left:1.5mm}
.chk i{display:inline-block;width:3mm;height:3mm;border:0.3mm solid var(--blue)}
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
table.blk tr.r2 td{border-bottom:0.45mm solid var(--blue)}
table.blk tr.sh td{background:var(--shade)}
.legend{margin-top:2mm;font-size:6.5pt;line-height:1.35;color:#374151}
.legend b{color:var(--blue)}
.bottom{margin-top:1.6mm;display:grid;grid-template-columns:1fr 60mm 60mm;gap:7mm;align-items:end}
.obs .k{font-size:6.8pt;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1mm}
.obs .ln{height:4.4mm;border-bottom:0.25mm solid #9CA3AF}
.sig .sl{height:9mm;border-bottom:0.3mm solid var(--ink)}
.sig .sk{margin-top:0.8mm;font-size:7pt;color:var(--muted);text-align:center;white-space:nowrap}
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
