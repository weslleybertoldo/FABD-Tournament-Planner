#!/bin/bash
set -e
WS=$(powershell.exe -Command "((Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json' -UseBasicParsing).Content | ConvertFrom-Json)[0].webSocketDebuggerUrl" 2>/dev/null | tr -d '\r\n')
pscript=$(wslpath -w "$(dirname "$0")/cdp-eval.ps1")

run_eval() {
  local label="$1" expr="$2"
  local b64
  b64=$(printf '%s' "$expr" | base64 -w0)
  echo "=== $label ==="
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$pscript" -WsUrl "$WS" -ExprBase64 "$b64" 2>&1
  echo
}

# Forçar branch sorted.length===0 chamando renderDraws() diretamente
run_eval "4a. renderDraws empty - sem busca, sem filtros" '
(async()=>{
  if(typeof renderDraws!=="function") return JSON.stringify({err:"no renderDraws"});
  // Garantir que a aba está visível para os elementos existirem
  const tab=document.getElementById("draws-tab");
  if(tab) tab.style.display="block";
  // Garantir que existe tournament e allDraws=[]
  tournament={id:"smoke",name:"smoke",draws:[]};
  const s=document.getElementById("search-draws");
  if(s) s.value="";
  renderDraws();
  await new Promise(r=>setTimeout(r,200));
  const d=document.getElementById("draws-detail");
  return JSON.stringify({
    detailText: d?d.textContent.trim().slice(0,200):null,
    hasCrieMsg: d?d.textContent.includes("Crie uma chave"):null
  });
})()
'

run_eval "4b. renderDraws empty - com busca" '
(async()=>{
  const tab=document.getElementById("draws-tab");
  if(tab) tab.style.display="block";
  tournament={id:"smoke",name:"smoke",draws:[]};
  const s=document.getElementById("search-draws");
  if(!s) return JSON.stringify({err:"no search-draws"});
  s.value="__xyz_naoacha__";
  renderDraws();
  await new Promise(r=>setTimeout(r,200));
  const d=document.getElementById("draws-detail");
  return JSON.stringify({
    detailText: d?d.textContent.trim().slice(0,200):null,
    hasSearchMsg: d?d.textContent.includes("Nenhuma chave encontrada"):null,
    hasAdjustarBuscaTip: d?d.textContent.includes("ajustar a busca"):null
  });
})()
'

run_eval "4c. renderDraws empty - com filtros ativos (mock)" '
(async()=>{
  const tab=document.getElementById("draws-tab");
  if(tab) tab.style.display="block";
  if(!window.tournament) window.tournament={id:"smoke",name:"smoke"};
  // Mock: garantir _countActiveDrawFilters retorna >0
  const orig = window._countActiveDrawFilters;
  window._countActiveDrawFilters = ()=>1;
  window.allDraws=[];
  const s=document.getElementById("search-draws");
  if(s) s.value="";
  renderDraws();
  await new Promise(r=>setTimeout(r,200));
  const d=document.getElementById("draws-detail");
  const out = {
    detailText: d?d.textContent.trim().slice(0,200):null,
    hasFiltersMsg: d?d.textContent.includes("Nenhuma chave atende aos filtros"):null,
    hasAlterarFiltrosTip: d?d.textContent.includes("Altere ou remova os filtros"):null
  };
  if(orig) window._countActiveDrawFilters = orig;
  return JSON.stringify(out);
})()
'
