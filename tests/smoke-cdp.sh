#!/bin/bash
set -e

WS=$(powershell.exe -Command "((Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json' -UseBasicParsing).Content | ConvertFrom-Json)[0].webSocketDebuggerUrl" 2>/dev/null | tr -d '\r\n')
echo "WS: $WS"

run_eval() {
  local label="$1"
  local expr="$2"
  local b64
  b64=$(printf '%s' "$expr" | base64 -w0)
  local pscript
  pscript=$(wslpath -w "$(dirname "$0")/cdp-eval.ps1")
  echo "=== $label ==="
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$pscript" -WsUrl "$WS" -ExprBase64 "$b64" 2>&1
  echo
}

# 1) Versão
run_eval "1. APP_VERSION" 'JSON.stringify({appVersion: typeof APP_VERSION!=="undefined"?APP_VERSION:null})'

# 2) Texto novo de Rankings + ausência do antigo
run_eval "2. Rankings text" '
(async()=>{
  const tabBtn=[...document.querySelectorAll("[onclick]")].find(e=>/setSettingsTab\(.*settings-rankings/.test(e.getAttribute("onclick")||""));
  // Abre o modal de Settings primeiro se necessário
  const settingsBtn=[...document.querySelectorAll("[onclick]")].find(e=>/openSettings|showSettings/i.test(e.getAttribute("onclick")||""));
  if(settingsBtn) settingsBtn.click();
  await new Promise(r=>setTimeout(r,300));
  if(tabBtn) tabBtn.click();
  await new Promise(r=>setTimeout(r,500));
  if(typeof renderScoringTables==="function") renderScoringTables();
  await new Promise(r=>setTimeout(r,200));
  const c=document.getElementById("settings-rankings-content");
  const html=c?c.innerHTML:"";
  return JSON.stringify({
    contentFound: !!c,
    hasNewText: html.includes("Classificação Geral") && html.includes("Ranking Federados"),
    hasOldText: html.includes("Use no relatório \"Ranking Geral\""),
    snippet: html.slice(0,200)
  });
})()
'

# 3) Função renderTcClubes usa data-club-key e addEventListener (não onclick string)
run_eval "3. renderTcClubes usa data-attr" '
JSON.stringify({
  hasFn: typeof renderTcClubes==="function",
  src_hasDataClubKey: typeof renderTcClubes==="function" && renderTcClubes.toString().includes("data-club-key"),
  src_hasAddEventListener: typeof renderTcClubes==="function" && renderTcClubes.toString().includes("addEventListener"),
  src_hasOldOnclickPattern: typeof renderTcClubes==="function" && /onclick=\"setClubStatus\(/.test(renderTcClubes.toString())
})'

# 4) Empty state da aba Chaves quando busca não acha
run_eval "4. Draws empty state (busca)" '
(async()=>{
  // Tentar abrir a aba Chaves
  const tabs=[...document.querySelectorAll("[onclick]")].filter(e=>/showTab\(.*draws|chaves/i.test(e.getAttribute("onclick")||""));
  if(tabs[0]) tabs[0].click();
  await new Promise(r=>setTimeout(r,400));
  const search=document.getElementById("search-draws");
  if(!search) return JSON.stringify({ok:false, reason:"search-draws not found"});
  search.value="____xyz_naoexiste_____";
  search.dispatchEvent(new Event("input",{bubbles:true}));
  await new Promise(r=>setTimeout(r,400));
  const detail=document.getElementById("draws-detail");
  return JSON.stringify({
    ok:true,
    detailText: detail?detail.textContent.trim().slice(0,200):null,
    hasSearchEmptyMsg: detail?detail.textContent.includes("Nenhuma chave encontrada"):null
  });
})()
'
