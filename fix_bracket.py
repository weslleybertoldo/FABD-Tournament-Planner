import sys
data = open('src/js/app.js', 'r', encoding='utf-8').read()
start = data.find('function renderBracket(d) {')
end = data.find('\nfunction renderRoundRobin(d)', start)

new_func = """function renderBracket(d) {
  const rounds = {};
  d.matches.forEach(m => { if (!rounds[m.round]) rounds[m.round] = []; rounds[m.round].push(m); });
  const totalRounds = Math.max(...d.matches.map(m => m.round));

  let gn = 1;
  const gnMap = {};
  for (let r = 1; r <= totalRounds; r++) {
    (rounds[r] || []).forEach((m, i) => {
      if (!m.isBye && m.winner !== 0) { gnMap[r + '-' + i] = gn++; }
    });
  }
  const getGN = (r, i) => gnMap[r + '-' + i] || 0;
  const rName = (r) => r === totalRounds ? 'FINAL' : r === totalRounds - 1 ? 'SEMIFINAL' : r === totalRounds - 2 ? 'QUARTAS' : 'RODADA ' + r;

  const getDisp = (r, i, slot) => {
    const m = (rounds[r] || [])[i];
    if (!m) return 'A definir';
    const p = slot === 1 ? m.player1 : m.player2;
    if (p) return p;
    if (r <= 1) return '';
    const pi = slot === 1 ? i * 2 : i * 2 + 1;
    const pm = (rounds[r - 1] || [])[pi];
    if (pm && pm.advancer) return pm.advancer;
    const n = getGN(r - 1, pi);
    return n ? 'Vencedor Jogo ' + String(n).padStart(2, '0') : 'A definir';
  };

  const matchH = 70;
  const matchW = 210;
  const connW = 40;
  const gapBase = 14;

  const positions = {};
  let totalH = 0;

  for (let r = 1; r <= totalRounds; r++) {
    const ms = (rounds[r] || []);
    if (r === 1) {
      let y = 0;
      ms.forEach((m, i) => {
        positions[r + '-' + i] = { y, cy: y + matchH / 2 };
        y += matchH + gapBase;
      });
      totalH = y - gapBase;
    } else {
      ms.forEach((m, i) => {
        const p1 = positions[(r-1) + '-' + (i*2)];
        const p2 = positions[(r-1) + '-' + (i*2+1)];
        if (p1 && p2) {
          const cy = (p1.cy + p2.cy) / 2;
          positions[r + '-' + i] = { y: cy - matchH / 2, cy };
        } else if (p1) {
          positions[r + '-' + i] = { y: p1.y, cy: p1.cy };
        } else {
          positions[r + '-' + i] = { y: 0, cy: matchH / 2 };
        }
      });
    }
  }

  const svgW = (matchW + connW) * totalRounds + 180;
  const svgH = totalH + 50;
  const oY = 35;

  let h = '<div style="overflow-x:auto;padding:10px 0">';
  h += '<svg width="' + svgW + '" height="' + svgH + '" xmlns="http://www.w3.org/2000/svg" style="font-family:Segoe UI,sans-serif">';

  for (let r = 1; r <= totalRounds; r++) {
    const ms = rounds[r] || [];
    const x = (r - 1) * (matchW + connW);

    h += '<rect x="' + x + '" y="0" width="' + matchW + '" height="26" rx="4" fill="#1E3A8A"/>';
    h += '<text x="' + (x + matchW/2) + '" y="17" text-anchor="middle" fill="white" font-size="11" font-weight="700" letter-spacing="1">' + rName(r) + '</text>';

    ms.forEach((m, i) => {
      const pos = positions[r + '-' + i];
      if (!pos) return;
      const y = pos.y + oY;
      const num = getGN(r, i);
      const isBye = m.isBye;
      const p1 = getDisp(r, i, 1);
      const p2 = getDisp(r, i, 2);
      const future = !m.player1 && !m.player2 && r > 1;
      const dash = (future || isBye) ? ' stroke-dasharray="5,3"' : '';
      const sc = isBye ? '#CED4DA' : '#343A40';
      const f1 = m.winner === 1 ? '#D1FAE5' : '#fff';
      const f2 = m.winner === 2 ? '#D1FAE5' : '#fff';

      h += '<rect x="'+x+'" y="'+y+'" width="'+matchW+'" height="'+(matchH/2)+'" fill="'+f1+'" stroke="'+sc+'" stroke-width="2"'+dash+'/>';
      h += '<rect x="'+x+'" y="'+(y+matchH/2)+'" width="'+matchW+'" height="'+(matchH/2)+'" fill="'+f2+'" stroke="'+sc+'" stroke-width="2"'+dash+'/>';

      if (num && !isBye) h += '<text x="'+(x+8)+'" y="'+(y+13)+'" fill="#C41E2A" font-size="10" font-weight="700">Jogo '+String(num).padStart(2,'0')+'</text>';
      if (isBye) h += '<text x="'+(x+8)+'" y="'+(y+13)+'" fill="#ADB5BD" font-size="10" font-weight="700">BYE</text>';

      const c1 = m.winner===1?'#065F46':(isBye?'#ADB5BD':'#1E3A8A');
      h += '<text x="'+(x+8)+'" y="'+(y+30)+'" fill="'+c1+'" font-size="12" font-weight="600">'+esc(p1||'-')+'</text>';

      const c2 = m.winner===2?'#065F46':(isBye?'#DEE2E6':'#1E3A8A');
      h += '<text x="'+(x+8)+'" y="'+(y+matchH/2+22)+'" fill="'+c2+'" font-size="12" font-weight="600">'+(isBye?'- - -':esc(p2||'-'))+'</text>';

      if (m.score1) h += '<text x="'+(x+matchW-8)+'" y="'+(y+30)+'" text-anchor="end" fill="#495057" font-size="11" font-weight="700">'+esc(m.score1)+'</text>';
      if (m.score2) h += '<text x="'+(x+matchW-8)+'" y="'+(y+matchH/2+22)+'" text-anchor="end" fill="#495057" font-size="11" font-weight="700">'+esc(m.score2)+'</text>';

      // LINHAS CONECTORAS
      if (r < totalRounds) {
        const myMidY = y + matchH / 2;
        const lx = x + matchW;
        const mx = lx + connW / 2;

        // Linha horizontal saindo do jogo
        h += '<line x1="'+lx+'" y1="'+myMidY+'" x2="'+mx+'" y2="'+myMidY+'" stroke="#343A40" stroke-width="2"/>';

        // Linha vertical conectando par (so no jogo de cima do par)
        if (i % 2 === 0) {
          const pairPos = positions[r + '-' + (i+1)];
          if (pairPos) {
            const pairMidY = pairPos.y + oY + matchH / 2;
            // Vertical
            h += '<line x1="'+mx+'" y1="'+myMidY+'" x2="'+mx+'" y2="'+pairMidY+'" stroke="#343A40" stroke-width="2"/>';
            // Horizontal saindo pro proximo jogo
            const nextI = Math.floor(i / 2);
            const nextPos = positions[(r+1) + '-' + nextI];
            if (nextPos) {
              const nextMidY = nextPos.y + oY + matchH / 2;
              h += '<line x1="'+mx+'" y1="'+nextMidY+'" x2="'+(lx+connW)+'" y2="'+nextMidY+'" stroke="#343A40" stroke-width="2"/>';
            }
          }
        }
      }
    });
  }

  // Campeao
  const finalM = (rounds[totalRounds] || [])[0];
  const cp = positions[totalRounds + '-0'];
  if (cp) {
    const cx = totalRounds * (matchW + connW);
    const cy = cp.cy + oY;
    h += '<line x1="'+((totalRounds-1)*(matchW+connW)+matchW)+'" y1="'+cy+'" x2="'+cx+'" y2="'+cy+'" stroke="#343A40" stroke-width="2"/>';
    h += '<rect x="'+cx+'" y="'+(cy-28)+'" width="150" height="56" rx="8" fill="#FEF3C7" stroke="#F59E0B" stroke-width="3"/>';
    h += '<text x="'+(cx+75)+'" y="'+(cy-8)+'" text-anchor="middle" fill="#92400E" font-size="10" font-weight="700">CAMPEAO</text>';
    const champ = finalM && finalM.winner === 1 ? finalM.player1 : finalM && finalM.winner === 2 ? finalM.player2 : 'A definir';
    h += '<text x="'+(cx+75)+'" y="'+(cy+14)+'" text-anchor="middle" fill="#92400E" font-size="14" font-weight="800">'+esc(champ)+'</text>';
  }

  h += '</svg></div>';
  return h;
}
"""

result = data[:start] + new_func + data[end:]
open('src/js/app.js', 'w', encoding='utf-8').write(result)
print('OK - bracket SVG aplicado')
