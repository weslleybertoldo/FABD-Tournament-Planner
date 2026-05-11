// ============================================
// FABD Tournament Planner v3.0
// 1 torneio por vez, jogadores no torneio
// ============================================

let currentPage = 'overview';
let tournament = null; // torneio ativo (unico)
let players = []; // ref para tournament.players
let editingPlayerId = null;
let wizardStep = 0;
let scoringMatchIdx = null;
let wizHasProfile = false;
let wizSteps = [];
let selectedDrawIdx = -1;
let gameProfiles = [];
let lastScoreUpdateTimestamp = {};

// Categorias e modalidades
const CATEGORIES = ['Sub 11','Sub 13','Sub 15','Sub 17','Sub 19','Sub 23','Principal','Senior','Master I','Master II'];
const MODALITIES = [
  { code: 'SM', name: 'Simples Masculino', isDupla: false },
  { code: 'SF', name: 'Simples Feminino', isDupla: false },
  { code: 'DM', name: 'Duplas Masculinas', isDupla: true },
  { code: 'DF', name: 'Duplas Femininas', isDupla: true },
  { code: 'DX', name: 'Duplas Mistas', isDupla: true },
];

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[INIT] Starting app...');
    // Gate de autenticacao: bloqueia o app ate o organizador estar logado
    const authOk = await ensureAuthenticated();
    console.log('[INIT] Auth result:', authOk);
    if (!authOk) return; // Login overlay esta visivel; app nao prossegue

    await loadData();
    console.log('[INIT] Data loaded');
    setupNavigation();
    console.log('[INIT] Navigation set up');
    setupValidation();
    updateOverview();
    console.log('[INIT] Overview updated');
    const verEl=document.getElementById('current-version');
    if(verEl)verEl.textContent=`Versao atual: v${APP_VERSION}`;
    setupAutoUpdaterUI();
    console.log('[INIT] Done!');
  } catch(e) {
    console.error('[INIT] ERROR:', e.message, e.stack);
    alert('Erro ao iniciar: ' + e.message);
  }
});

// === AUTH (login OTP por email) ===
let _authState = { email: '' };

// v3.97: registra listener pra logout vindo do main process (refresh falhou,
// user forcou logout em outra janela, etc.). Mostra alerta antes que queries
// silently falhem por sessao expirada.
if (window.api?.onAuthSignedOut) {
  window.api.onAuthSignedOut(() => {
    window.__fabdStats.authSignedOut++;
    showToast('Sessao expirada — faca login novamente', 'error');
    setTimeout(() => location.reload(), 1500);
  });
}

// v3.97: helper pra calcular ID estavel local (mesma funcao do main.js stableMatchId)
// _stableMatchId extraido pra src/js/modules/match-helpers.js (issue #14.I).
function _registerEmQuadraIds() {
  if (!tournament || !window.api?.supabaseRegisterEmQuadra) return;
  const ids = (tournament.matches || [])
    .filter(m => m.status === 'Em Quadra')
    .map(m => _stableMatchId(tournament.id, m));
  window.api.supabaseRegisterEmQuadra(tournament.id, ids).catch(e => console.warn('[supabase] registerEmQuadra falhou (offline ou RLS):', e?.message || e));
}

// Reconciliacao: main detectou divergencia e nos pede pra re-sincronizar
if (window.api?.onReconcileNeeded) {
  window.api.onReconcileNeeded(async ({ missing, wrongStatus }) => {
    if (!tournament) return;
    const fix = [...(missing || []), ...(wrongStatus || [])];
    if (!fix.length) return;
    window.__fabdStats.reconcileEvents++;
    console.warn('[reconcile] re-sincronizando', fix.length, 'jogo(s)');
    for (const id of fix) {
      const m = (tournament.matches || []).find(x => _stableMatchId(tournament.id, x) === id);
      if (m && m.status === 'Em Quadra') {
        try { await window.api.supabaseUpsertMatch(tournament.id, m); } catch (e) { console.warn('[reconcile] upsertMatch falhou para', id, ':', e?.message || e); }
      }
    }
  });
}

async function ensureAuthenticated() {
  try {
    console.log('[AUTH] Calling authStatus...');
    const st = await window.api.authStatus();
    console.log('[AUTH] authStatus returned:', st);
    if (st.hasServiceRole || st.isAuthorized) {
      // Atualiza badge no rodape (se houver)
      showOrganizerBadge(st);
      return true;
    }
    showAuthOverlay();
    return false;
  } catch (e) {
    console.error('Auth status:', e);
    showAuthOverlay();
    return false;
  }
}

function showAuthOverlay() {
  const o = document.getElementById('auth-overlay');
  if (o) o.style.display = 'flex';
  document.getElementById('auth-step-email').style.display = 'block';
  document.getElementById('auth-step-code').style.display = 'none';
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

function hideAuthOverlay() {
  const o = document.getElementById('auth-overlay');
  if (o) o.style.display = 'none';
}

async function authSendCode() {
  const emailEl = document.getElementById('auth-email');
  const msgEl = document.getElementById('auth-email-msg');
  const btnEl = document.getElementById('auth-send-btn');
  const email = (emailEl.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { msgEl.textContent = 'Informe um email valido'; return; }
  msgEl.style.color = '#94A3B8'; msgEl.textContent = 'Enviando...';
  btnEl.disabled = true;
  try {
    const res = await window.api.authSendOtp(email);
    if (!res.ok) { msgEl.style.color = '#EF4444'; msgEl.textContent = res.error || 'Falhou ao enviar codigo'; btnEl.disabled = false; return; }
    _authState.email = email;
    document.getElementById('auth-email-shown').textContent = email;
    document.getElementById('auth-step-email').style.display = 'none';
    document.getElementById('auth-step-code').style.display = 'block';
    setTimeout(() => document.getElementById('auth-code')?.focus(), 100);
  } catch (e) { msgEl.style.color = '#EF4444'; msgEl.textContent = e.message || 'Erro'; }
  finally { btnEl.disabled = false; }
}

async function authVerifyCode() {
  const codeEl = document.getElementById('auth-code');
  const msgEl = document.getElementById('auth-code-msg');
  const btnEl = document.getElementById('auth-verify-btn');
  const token = (codeEl.value || '').trim();
  if (!/^\d{6}$/.test(token)) { msgEl.style.color = '#EF4444'; msgEl.textContent = 'Codigo deve ter 6 digitos'; return; }
  msgEl.style.color = '#94A3B8'; msgEl.textContent = 'Verificando...';
  btnEl.disabled = true;
  try {
    const res = await window.api.authVerifyOtp(_authState.email, token);
    if (!res.ok) { msgEl.style.color = '#EF4444'; msgEl.textContent = res.error || 'Codigo invalido'; btnEl.disabled = false; return; }
    msgEl.style.color = '#10B981'; msgEl.textContent = 'Sucesso! Carregando...';
    hideAuthOverlay();
    showOrganizerBadge(await window.api.authStatus());
    await loadData();
    setupNavigation();
    setupValidation();
    updateOverview();
  } catch (e) { msgEl.style.color = '#EF4444'; msgEl.textContent = e.message || 'Erro'; }
  finally { btnEl.disabled = false; }
}

// === GERENCIAR ACESSOS (admin/super_admin) ===
let _accessCurrentFedId = null;
let _accessFedList = [];

async function renderAccessPage() {
  const st = await window.api.authStatus();
  const role = st?.organizer?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    document.getElementById('access-list').innerHTML = '<p style="color:#EF4444">Acesso restrito a admin/super_admin.</p>';
    return;
  }
  const switcher = document.getElementById('access-fed-switcher');
  if (role === 'super_admin') {
    switcher.style.display = '';
    if (!_accessFedList.length) {
      const r = await window.api.federationsList();
      _accessFedList = r?.federations || [];
    }
    const sel = document.getElementById('access-fed-select');
    sel.innerHTML = _accessFedList.map(f => `<option value="${f.id}">${esc(f.short_name)} - ${esc(f.name)}</option>`).join('');
    if (!_accessCurrentFedId) _accessCurrentFedId = st?.federation?.id || _accessFedList[0]?.id;
    sel.value = _accessCurrentFedId;
  } else {
    switcher.style.display = 'none';
    _accessCurrentFedId = st?.federation?.id;
  }
  await loadAccessOrganizers();
}

async function loadAccessOrganizers() {
  const sel = document.getElementById('access-fed-select');
  if (sel && sel.value) _accessCurrentFedId = sel.value;
  const cnt = document.getElementById('access-list');
  cnt.innerHTML = '<p style="color:#94A3B8">Carregando...</p>';
  const r = await window.api.organizersList(_accessCurrentFedId);
  if (!r.ok) { cnt.innerHTML = `<p style="color:#EF4444">Erro: ${esc(r.error)}</p>`; return; }
  if (!r.organizers.length) { cnt.innerHTML = '<p style="color:#94A3B8">Nenhum organizador nesta federacao ainda.</p>'; return; }
  const me = (await window.api.authStatus())?.organizer?.email?.toLowerCase();
  let h = '<table class="data-table" style="width:100%;font-size:13px"><thead><tr><th>Status</th><th>Nome</th><th>Email</th><th>Role</th><th>Ultimo login</th><th></th></tr></thead><tbody>';
  r.organizers.forEach(o => {
    const fmt = o.last_login_at ? new Date(o.last_login_at).toLocaleString('pt-BR') : 'Nunca';
    const isMe = o.email?.toLowerCase() === me;
    const dot = o.active ? '<span style="display:inline-block;width:8px;height:8px;background:#10B981;border-radius:50%"></span>' : '<span style="display:inline-block;width:8px;height:8px;background:#EF4444;border-radius:50%"></span>';
    // O1: remover emojis, usar texto simples (institucional).
    const roleBadge = o.role === 'super_admin' ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">Super admin</span>'
      : o.role === 'admin' ? '<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">Admin</span>'
      : '<span style="background:#F3F4F6;color:#6B7280;padding:2px 8px;border-radius:10px;font-size:11px">Organizer</span>';
    const actions = isMe ? '<span style="color:#94A3B8;font-size:11px">(voce)</span>' :
      `<button class="btn btn-sm" style="background:#F3F4F6;color:#374151;margin-right:4px" data-action="toggleAccessOrganizer" data-arg-1="${esc(o.email)}" data-arg-2="${!o.active}">${o.active?'Desativar':'Ativar'}</button>
       <button class="btn btn-sm btn-danger" data-action="removeAccessOrganizer" data-arg-1="${esc(o.email)}">Remover</button>`;
    h += `<tr><td>${dot}</td><td><strong>${esc(o.name)}</strong></td><td>${esc(o.email)}</td><td>${roleBadge}</td><td style="font-size:11px;color:#64748B">${fmt}</td><td>${actions}</td></tr>`;
  });
  h += '</tbody></table>';
  cnt.innerHTML = h;
}

async function addAccessOrganizer() {
  const email = document.getElementById('access-new-email').value;
  const name = document.getElementById('access-new-name').value;
  const role = document.getElementById('access-new-role').value;
  const msg = document.getElementById('access-msg');
  msg.style.color = '#94A3B8'; msg.textContent = 'Enviando...';
  const r = await window.api.organizersAdd({ email, name, role, federation_id: _accessCurrentFedId });
  if (!r.ok) { msg.style.color = '#EF4444'; msg.textContent = r.error || 'Erro'; return; }
  msg.style.color = '#10B981'; msg.textContent = 'Adicionado!';
  document.getElementById('access-new-email').value = '';
  document.getElementById('access-new-name').value = '';
  document.getElementById('access-new-role').value = 'organizer';
  await loadAccessOrganizers();
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

async function toggleAccessOrganizer(email, active) {
  const r = await window.api.organizersUpdate(email, { active });
  if (!r.ok) { alert('Erro: ' + r.error); return; }
  await loadAccessOrganizers();
}

async function removeAccessOrganizer(email) {
  if (!confirm(`Remover organizador "${email}" permanentemente?`)) return;
  const r = await window.api.organizersRemove(email);
  if (!r.ok) { alert('Erro: ' + r.error); return; }
  await loadAccessOrganizers();
}

function authBackToEmail() {
  document.getElementById('auth-step-code').style.display = 'none';
  document.getElementById('auth-step-email').style.display = 'block';
  document.getElementById('auth-code').value = '';
  document.getElementById('auth-code-msg').textContent = '';
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

// Mostra/esconde aba "Gerenciar Acessos" baseado no role
function applyAccessVisibility(st) {
  const navEl = document.getElementById('nav-access');
  if (navEl) {
    const role = st?.organizer?.role;
    const canManage = role === 'admin' || role === 'super_admin';
    navEl.style.display = canManage ? '' : 'none';
  }
  applyFederationBrandingToSidebar(st?.federation);
  applyFederationLogoToSettings(st?.federation);
}

// Sidebar: se tiver logo_url -> mostra imagem; senao -> mostra sigla
function applyFederationBrandingToSidebar(fed) {
  if (!fed) return;
  const imgEl = document.getElementById('sidebar-fed-logo');
  const initialsEl = document.getElementById('sidebar-fed-initials');
  const nameEl = document.getElementById('sidebar-fed-name');
  if (fed.logo_url) {
    if (imgEl) { imgEl.src = fed.logo_url; imgEl.style.display = ''; }
    if (initialsEl) initialsEl.style.display = 'none';
  } else {
    if (imgEl) imgEl.style.display = 'none';
    if (initialsEl) {
      initialsEl.textContent = (fed.short_name || '?').substring(0, 6).toUpperCase();
      initialsEl.style.display = 'flex';
    }
  }
  if (nameEl && fed.name) nameEl.textContent = fed.name.toUpperCase();
}

// Preview na pagina de configuracoes
function applyFederationLogoToSettings(fed) {
  const previewEl = document.getElementById('logo-preview');
  const removeBtn = document.getElementById('logo-remove-btn');
  if (!previewEl) return;
  if (fed?.logo_url) {
    previewEl.innerHTML = `<img src="${esc(fed.logo_url)}" alt="Logo" style="width:100%;height:100%;object-fit:cover">`;
    previewEl.style.border = 'none';
    if (removeBtn) removeBtn.style.display = '';
  } else {
    previewEl.innerHTML = esc((fed?.short_name||'?').substring(0,4));
    previewEl.style.border = '2px dashed var(--fabd-gray-300)';
    previewEl.style.color = 'var(--fabd-gray-400)';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

async function uploadFederationLogo(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const msg = document.getElementById('logo-msg');
  msg.style.color = 'var(--fabd-gray-500)'; msg.textContent = 'Enviando...';
  try {
    if (file.size > 2 * 1024 * 1024) { msg.style.color = '#DC2626'; msg.textContent = 'Arquivo maior que 2MB'; return; }
    const buffer = await file.arrayBuffer();
    const r = await window.api.federationsUploadLogo(buffer, file.type);
    if (!r.ok) { msg.style.color = '#DC2626'; msg.textContent = r.error || 'Erro'; return; }
    msg.style.color = '#10B981'; msg.textContent = 'Logo atualizada!';
    const st = await window.api.authStatus();
    applyFederationBrandingToSidebar(st?.federation);
    applyFederationLogoToSettings(st?.federation);
    setTimeout(() => { msg.textContent = ''; }, 3000);
  } catch (e) {
    msg.style.color = '#DC2626'; msg.textContent = 'Erro: ' + e.message;
  } finally {
    ev.target.value = '';
  }
}

async function removeFederationLogo() {
  if (!confirm('Remover a logo da federacao? Voltara a exibir apenas a sigla.')) return;
  const msg = document.getElementById('logo-msg');
  msg.style.color = 'var(--fabd-gray-500)'; msg.textContent = 'Removendo...';
  const r = await window.api.federationsRemoveLogo();
  if (!r.ok) { msg.style.color = '#DC2626'; msg.textContent = r.error || 'Erro'; return; }
  msg.style.color = '#10B981'; msg.textContent = 'Logo removida.';
  const st = await window.api.authStatus();
  applyFederationBrandingToSidebar(st?.federation);
  applyFederationLogoToSettings(st?.federation);
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

function showOrganizerBadge(st) {
  if (!st) return;
  applyAccessVisibility(st);
  let el = document.getElementById('organizer-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'organizer-badge';
    el.style.cssText = 'position:fixed;bottom:8px;right:12px;background:#1E3A8A;color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;z-index:9000;font-family:Inter,sans-serif;cursor:pointer';
    el.title = 'Clique para sair';
    el.onclick = async () => {
      if (!confirm('Deseja sair do app?')) return;
      await window.api.authSignOut();
      location.reload();
    };
    document.body.appendChild(el);
  }
  const name = st.organizer?.name || 'Organizador';
  const role = st.organizer?.role === 'super_admin' ? '★' : (st.organizer?.role === 'admin' ? '⚡' : '');
  const fed = st.federation?.short_name ? ` · ${st.federation.short_name}` : '';
  el.textContent = `${role} ${name}${fed}`.trim();
  el.title = `${st.organizer?.email || ''} · ${st.federation?.name || ''} · clique para sair`;
}

async function loadData(autoLoad=false) {
  try {
    if(autoLoad){
      tournament = await window.api.getTournament();
    } else {
      tournament = null;
    }
    players = tournament?.players || [];
    await loadGameProfiles();
    await loadScoringTables();
    // Carregar arbitros do banco se localStorage vazio
    try{
      const umps=loadUmpires();
      if(!umps.length){
        const s=await window.api.getSettings();
        if(s?.umpires?.length){saveUmpires(s.umpires);}
      }
    }catch(e){console.warn('Erro ao carregar umpires:', e);}
    updateOverview();
    if (tournament) {
      document.getElementById('breadcrumb').textContent = tournament.name;
      showTournamentPages();

      // Migrar inscritos antigos de "inscrito" para "confirmado"
      let changed = false;
      (tournament.entries || []).forEach(e => {
        if (e.status === 'inscrito') { e.status = 'confirmado'; changed = true; }
      });

      // Se nao tem chaves e tem inscritos, gerar chaves
      if ((tournament.entries || []).length > 0 && !(tournament.draws || []).length) {
        autoGenerateDraws();
        changed = true;
      }

      // Reparar sincronizacao de duplas
      players.forEach(p=>{
        (p.inscriptions||[]).forEach(insc=>{
          if(!['DM','DF','DX'].includes(insc.mod)||!insc.partner)return;
          const partner=players.find(x=>x.id===insc.partner);
          if(!partner)return;
          if(!partner.inscriptions)partner.inscriptions=[];
          const back=partner.inscriptions.find(i=>i.key===insc.key);
          if(!back){
            partner.inscriptions.push({key:insc.key,mod:insc.mod,cat:insc.cat,partner:p.id});
            changed=true;
          } else if(back.partner!==p.id){
            back.partner=p.id;
            changed=true;
          }
        });
      });

      if (changed) window.api.saveTournament(tournament);

      // Auto-gerar eliminatorias ou placeholders ao carregar torneio
      (tournament.draws||[]).forEach(d => {
        if (d.type !== 'Grupos + Eliminatoria' || !d.groupsData) return;
        if (areGroupsFinished(d) && !d.groupsData.eliminationGenerated) {
          // Grupos terminaram: gerar eliminatoria real
          propagateGroupsToElimination(d);
          updateEliminationMatchesInList();
          window.api.saveTournament(tournament);
        } else if (!d.groupsData.eliminationGenerated) {
          // Grupos em andamento: garantir placeholders existem na lista de partidas
          const hasElimPlaceholders = (tournament.matches||[]).some(m => m.drawName === d.name && m.phase === 'elimination');
          if (!hasElimPlaceholders && d.matches?.length) {
            // Criar placeholders usando rebuildGroupsElimMatches
            const tempArr = [];
            rebuildGroupsElimMatches(d, tempArr);
            const elimOnly = tempArr.filter(m => m.phase === 'elimination');
            const lastNum = Math.max(0,...(tournament.matches||[]).map(m=>m.num||0));
            elimOnly.forEach((m, i) => {
              tournament.matches.push({...m, id: String(lastNum+1+i), num: lastNum+1+i});
            });
            if (elimOnly.length) window.api.saveTournament(tournament);
          }
        }
      });

      // Cleanup Supabase: limpar dados orfaos do painel ao vivo
      // Se nao tem jogos em quadra, limpa live_matches/live_scores (dados de sessao anterior)
      // Se tem jogos em quadra, mantem somente esses jogos
      try {
        const emQuadra = (tournament.matches||[]).filter(m => m.status === 'Em Quadra');
        if (emQuadra.length === 0) {
          // Nenhum jogo em quadra: limpar tudo do Supabase
          await window.api.supabaseCleanup(tournament.id);
          console.log('Supabase cleanup: nenhum jogo em quadra, dados ao vivo limpos');
        } else {
          // Tem jogos em quadra: sincronizar apenas esses
          console.log(`${emQuadra.length} jogo(s) em quadra, mantendo no Supabase`);
        }
      } catch(e) { console.warn('Supabase cleanup:', e); }

      // Sincronizar dados com Supabase (sem ativar Realtime ainda)
      try {
        prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id, tournament.name, tournament);
        window.api.onScoreUpdate(handleRealtimeScoreUpdate);
        // Ativar Realtime somente se ja tem jogos em quadra
        const hasEmQuadra = (tournament.matches||[]).some(m => m.status === 'Em Quadra');
        if (hasEmQuadra) {
          await window.api.supabaseSubscribe(tournament.id);
          console.log('Realtime ativado (jogos em quadra detectados)');
        }
      } catch(e) { console.warn('Supabase connect:', e); }
    }
  } catch(e) { console.error('Erro:', e); }
  // Versão no rodapé (dinâmica)
  const vFooter=document.getElementById('app-version-footer');
  if(vFooter)vFooter.textContent='FABD Tournament Planner v'+APP_VERSION;
  // Verificação automática de atualização
  checkAutoUpdate();
}

function isNewerVersion(remote, local){
  const r=remote.split('.').map(Number);
  const l=local.split('.').map(Number);
  for(let i=0;i<Math.max(r.length,l.length);i++){
    const rv=r[i]||0, lv=l[i]||0;
    if(rv>lv)return true;
    if(rv<lv)return false;
  }
  return false;
}

async function checkAutoUpdate(){
  try{
    const data=await window.api.checkUpdate();
    if(!data||data.error)return;
    const latestVersion=(data.tag_name||'').replace('v','');
    if(!latestVersion)return;
    if(isNewerVersion(latestVersion,APP_VERSION)){
      const exeAsset=(data.assets||[]).find(a=>a.name.endsWith('.exe'));
      const bar=document.getElementById('update-bar');
      const txt=document.getElementById('update-bar-text');
      const btn=document.getElementById('update-bar-btn');
      if(bar&&txt){
        txt.textContent='Nova versao disponivel: v'+latestVersion;
        if(exeAsset&&btn){
          btn.onclick=()=>window.api.openExternal(exeAsset.browser_download_url);
          btn.style.display='inline-block';
        } else if(btn){ btn.style.display='none'; }
        bar.style.display='flex';
      }
    }
  }catch(e){/* silencioso — nao bloqueia o app */}
}

// Mostrar/esconder abas dependentes de torneio
function showTournamentPages() {
  ['roster','draws','matches','schedule'].forEach(p => {
    const noT = document.getElementById(`${p}-no-tournament`);
    const ct = document.getElementById(`${p}-content`);
    if (tournament) {
      if (noT) noT.style.display = 'none';
      if (ct) ct.style.display = 'block';
    } else {
      if (noT) noT.style.display = 'block';
      if (ct) ct.style.display = 'none';
    }
  });
}

// === NORMALIZE CATEGORY ===
// Converte variações de nome de categoria para o padrão oficial
const MOD_CODES={SM:['SM','SIMPLES MASCULINO','SIMPLES M','S M','MASCULINO','MALE'],SF:['SF','SIMPLES FEMININO','SIMPLES F','S F','FEMININO','FEMALE','F'],DM:['DM','DUPLA MASCULINA','DUPLAS MASCULINAS','DUPLA M','D M','MASCULINAS','M'],DF:['DF','DUPLA FEMININA','DUPLAS FEMININAS','DUPLA F','D F','FEMININAS','FEM'],DX:['DX','DUPLA MISTA','DUPLAS MISTAS','DUPLA MIST','D MIST','MISTA','MIXED','MIX']};
const CAT_CODES={'SUB 11':['SUB 11','SUB-11','SUB11','UNDER 11','U11'],'SUB 13':['SUB 13','SUB-13','SUB13','UNDER 13','U13'],'SUB 15':['SUB 15','SUB-15','SUB15','UNDER 15','U15'],'SUB 17':['SUB 17','SUB-17','SUB17','UNDER 17','U17'],'SUB 19':['SUB 19','SUB-19','SUB19','UNDER 19','U19'],'SUB 23':['SUB 23','SUB-23','SUB23','UNDER 23','U23','ADULTO'],'PRINCIPAL':['PRINCIPAL','OPEN','ABSOLUTO','SENIOR A'],'SENIOR':['SENIOR','SENIOR A','35+','35 PLUS'],'MASTER I':['MASTER I','MASTER 1','MI','MASTER'],'MASTER II':['MASTER II','MASTER 2','MII','MASTER II']};
function normalizeCategory(catStr){
  if(!catStr)return'';
  const s=String(catStr).toUpperCase().replace(/[^A-Z0-9 \-\_]/g,' ').replace(/\s+/g,' ').trim();
  // Extrair modalidade
  for(const[code,variants]of Object.entries(MOD_CODES)){
    if(variants.some(v=>s===v||s.startsWith(v+' ')||s.includes(' '+v+' ')||s.endsWith(' '+v)))return code;
  }
  // Extrair categoria de idade
  for(const[code,variants]of Object.entries(CAT_CODES)){
    if(variants.some(v=>s===v||s.startsWith(v+' ')||s.includes(' '+v+' ')||s.endsWith(' '+v)))return code;
  }
  return catStr; // retorna original se não reconhecer
}

// === CATEGORY BY AGE ===
// calculateCategory() extraida pra src/js/modules/csv-parser.js (issue #14)

function checkAloneInCategory(playerInscriptions) {
  if (!tournament?.entries?.length || !playerInscriptions?.length) return [];
  const alone = [];
  playerInscriptions.forEach(insc => {
    const key = insc.key;
    const mod = insc.mod;
    const isDupla = ['DM','DF','DX'].includes(mod);
    // Contar quantos inscritos nesta chave (excluindo ausentes)
    const count = (tournament.entries||[]).filter(e => e.key === key && e.status !== 'ausente').length;
    if (isDupla) {
      // Duplas: precisa de 2 duplas (4 inscricoes com parceiro)
      const pairs = new Set();
      (tournament.entries||[]).filter(e => e.key === key && e.status !== 'ausente' && e.partner).forEach(e => {
        pairs.add([e.playerId, e.partner].sort().join('-'));
      });
      if (pairs.size < 2) alone.push(key);
    } else {
      if (count < 2) alone.push(key);
    }
  });
  return alone;
}

function checkDuplaSemParceiro(playerInscriptions) {
  if (!playerInscriptions?.length) return [];
  const semParceiro = [];
  playerInscriptions.forEach(insc => {
    const mod = insc.mod;
    const isDupla = ['DM','DF','DX'].includes(mod);
    if (isDupla && !insc.partner) {
      semParceiro.push(insc.key);
    }
  });
  return semParceiro;
}

function checkCategoryConflict(dob, inscriptions){
  if(!dob||!inscriptions?.length)return false;
  const birth=new Date(dob+'T00:00:00');
  const age=new Date().getFullYear()-birth.getFullYear();
  const catLimits={'Sub 11':11,'Sub 13':13,'Sub 15':15,'Sub 17':17,'Sub 19':19,'Sub 23':23,'Senior':35,'Master I':45,'Master II':55};
  for(const insc of inscriptions){
    const cat=insc.cat;
    if(!cat||cat==='Principal')continue;
    const limit=catLimits[cat];
    if(!limit)continue;
    if(cat.startsWith('Sub')){
      // Sub: idade precisa ser MENOR que o limite
      if(age>=limit)return true;
    } else {
      // Senior/Master: idade precisa ser MAIOR OU IGUAL ao limite
      if(age<limit)return true;
    }
  }
  return false;
}

// === NAVIGATION ===
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  const titles = { overview:'Visao Geral', tournaments:'Torneio', players:'Jogadores', roster:'Inscritos', draws:'Chaves', matches:'Partidas', schedule:'Agenda', reports:'Relatorios', access:'Gerenciar Acessos', settings:'Configuracoes' };
  document.getElementById('page-title').textContent = titles[page] || page;

  switch(page) {
    case 'overview': updateOverview(); break;
    case 'tournaments': renderTournamentPage(); break;
    case 'players': renderPlayers(); setTimeout(()=>document.getElementById('search-players')?.focus(),50); break;
    case 'roster': showTournamentPages(); renderRoster(); break;
    case 'draws': showTournamentPages(); renderDraws(); setTimeout(()=>document.getElementById('search-draws')?.focus(),50); break;
    case 'matches': showTournamentPages(); if(tournament){ cleanOrphanMatches(); } renderMatches(); break;
    case 'schedule': showTournamentPages(); renderSchedule(); break;
    case 'access': renderAccessPage(); break;
  }
}

// === VALIDATION ===
function setupValidation() {
  document.addEventListener('focusout', (e) => { if(e.target.matches('.form-control[required]')) validateField(e.target); });
  document.addEventListener('input', (e) => { if(e.target.matches('.form-control.error')) validateField(e.target); });
}
function validateField(input) {
  const val = input.value.trim();
  if (input.hasAttribute('required') && !val) { input.classList.add('error'); input.classList.remove('valid'); return false; }
  input.classList.remove('error'); if(val) input.classList.add('valid'); return true;
}
function validateForm(ids) { let v=true; ids.forEach(id=>{ const el=document.getElementById(id); if(el&&!validateField(el))v=false; }); return v; }

// === SPINNERS ===
function spinUp(id,max){ const el=document.getElementById(id); const v=parseInt(el.value)||0; if(v<max)el.value=v+1; }
function spinDown(id,min){ const el=document.getElementById(id); const v=parseInt(el.value)||0; if(v>min)el.value=v-1; }

// === OVERVIEW ===
function updateOverview() {
  document.getElementById('stat-tournaments').textContent = tournament ? '1' : '0';
  document.getElementById('stat-players').textContent = players.length;
  const tm = tournament?.matches?.length || 0;
  const done = (tournament?.matches||[]).filter(m=>m.status==='Finalizada'||m.status==='WO').length;
  document.getElementById('stat-matches').textContent = tm;
  // Calcular total de inscricoes arrecadadas
  let totalArrecadado=0;
  const valorPadrao=tournament?.valorInscricao||30;
  players.forEach(p=>{
    const catCount=(p.inscriptions||[]).length;
    const valor=p.valorCategoria||valorPadrao;
    const pStatus=p.pagamentoStatus||'pago';
    if(pStatus==='pago')totalArrecadado+=catCount*valor;
  });
  const statActive=document.getElementById('stat-active');
  if(statActive)statActive.textContent=`R$ ${totalArrecadado.toFixed(2)}`;

  const c = document.getElementById('recent-tournaments');
  if (!tournament) {
    c.innerHTML = '<div class="empty-state"><div class="icon">&#127942;</div><h3>Nenhum torneio ativo</h3><p>Crie um novo torneio ou abra um backup</p></div>';
    document.getElementById('breadcrumb').textContent = '';
    return;
  }
  document.getElementById('breadcrumb').textContent = tournament.name;
  c.innerHTML = `<table><tbody>
    <tr><td><strong>${esc(tournament.name)}</strong></td><td>${fmtDate(tournament.startDate)} - ${fmtDate(tournament.endDate)}</td><td>${esc(tournament.location)||'-'}</td><td>${statusTag(tournament)}</td>
    <td><button class="btn btn-sm btn-primary" data-action="navigateTo" data-arg-1="players">Gerenciar</button></td></tr>
  </tbody></table>`;
}

// === TOURNAMENT PAGE ===
function renderTournamentPage() {
  const tb = document.getElementById('tournaments-table-body');
  const em = document.getElementById('tournaments-empty');
  if (!tournament) {
    tb.innerHTML = ''; em.style.display = 'block'; return;
  }
  em.style.display = 'none';
  const ev = [];
  if(tournament.events?.sm)ev.push('SM'); if(tournament.events?.sf)ev.push('SF');
  if(tournament.events?.dm)ev.push('DM'); if(tournament.events?.df)ev.push('DF'); if(tournament.events?.mx)ev.push('MX');
  const profile = gameProfiles.find(p=>p.id===tournament.gameProfileId);
  const sysName = profile ? esc(profile.name) : '-';
  tb.innerHTML = `<tr>
    <td><strong>${esc(tournament.name)}</strong></td><td>${esc(tournament.location)||'-'}</td>
    <td>${fmtDate(tournament.startDate)}</td><td>${fmtDate(tournament.endDate)}</td>
    <td>${ev.join(', ')||'-'}</td><td>${sysName}</td><td>${statusTag(tournament)}</td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="showTournamentConfig" title="Configuracao">&#9881;</button>
      <button class="btn btn-sm btn-secondary" data-action="exportTournamentBackup" title="Backup">&#128230;</button>
      <button class="btn btn-sm btn-danger" data-action="closeTournament">Fechar Torneio</button>
    </td></tr>`;
}

function showNewTournamentModal() {
  if (tournament) {
    if (!confirm('Ja existe um torneio ativo. Para criar um novo, o torneio atual sera fechado.\n\nDeseja fazer backup antes de fechar?')) return;
    exportTournamentBackup().then(() => {
      tournament = null; players = [];
      openNewTournamentForm();
    });
    return;
  }
  openNewTournamentForm();
}

function openNewTournamentForm() {
  ['t-name','t-start','t-end','t-location'].forEach(id=>{ const e=document.getElementById(id); if(e){e.value='';e.classList.remove('error','valid');} });
  document.getElementById('t-city').value = 'Maceio - AL';
  document.getElementById('t-courts').value = '4';
  ['t-ev-sm','t-ev-sf','t-ev-dm','t-ev-df','t-ev-mx'].forEach(id=>{ const e=document.getElementById(id); if(e) e.checked=true; });
  document.getElementById('modal-tournament-title').textContent = 'Novo Torneio';
  openModal('modal-tournament');
  requestAnimationFrame(()=>document.getElementById('t-name')?.focus());
}

async function saveTournament() {
  try {
    if (!validateForm(['t-name'])) return;
    const t = {
      name: gv('t-name'), startDate: gv('t-start'), endDate: gv('t-end'),
      location: gv('t-location'), city: gv('t-city'),
      courts: parseInt(gv('t-courts'))||4,
      events: { sm:gc('t-ev-sm'), sf:gc('t-ev-sf'), dm:gc('t-ev-dm'), df:gc('t-ev-df'), mx:gc('t-ev-mx') },
      players: [], entries: [], draws: [], matches: []
    };
    tournament = await window.api.newTournament(t);
    players = tournament.players;
    closeModal('modal-tournament');
    document.getElementById('breadcrumb').textContent = tournament.name;
    renderTournamentPage(); updateOverview();
    showToast('Torneio criado!');
  } catch(e) { console.error(e); showToast('Erro: '+e.message, 'error'); }
}

async function closeTournament() {
  if (!tournament) return;
  if (!confirm('ATENÇÃO: Fechar o torneio atual?\n\n• Os dados serao removidos do app\n• O site publico sera limpo (chaves, partidas, placar)\n• Recomendamos fazer backup antes\n\nDeseja continuar?')) return;
  if (!confirm('TEM CERTEZA?\n\nEsta acao ira:\n1. Limpar todos os dados locais\n2. Remover o torneio do site publico\n3. Apagar placares e partidas online\n\nDigite OK para confirmar.')) return;
  showToast('Fechando torneio e limpando dados online...','info');
  await window.api.closeTournament();
  showToast('Torneio fechado! Dados locais e online foram limpos.');
  tournament = null; players = [];
  selectedDrawIdx = -1;
  document.getElementById('breadcrumb').textContent = '';

  // Limpar todas as abas dependentes
  document.getElementById('draws-list').innerHTML = '';
  document.getElementById('draws-detail').innerHTML = '';
  document.getElementById('roster-table-body').innerHTML = '';
  document.getElementById('matches-table-body').innerHTML = '';
  document.getElementById('courts-panel').innerHTML = '';
  document.getElementById('schedule-grid-container').innerHTML = '';

  // Esconder conteudo e mostrar "sem torneio"
  ['roster','draws','matches','schedule'].forEach(p => {
    const noT = document.getElementById(`${p}-no-tournament`);
    const ct = document.getElementById(`${p}-content`);
    if (noT) noT.style.display = 'block';
    if (ct) ct.style.display = 'none';
  });

  renderTournamentPage(); updateOverview();
  showToast('Torneio fechado');
}

async function exportTournamentBackup() {
  try {
    const result = await window.api.exportTournament();
    if (result) showToast('Backup exportado!');
  } catch(e) { showToast('Erro: '+e.message, 'error'); }
}

async function importTournamentBackup() {
  try {
    const result = await window.api.importTournament();
    if (!result) return;
    await loadData(true);
    document.getElementById('breadcrumb').textContent = tournament?.name || '';
    renderTournamentPage(); updateOverview();
    showToast(`Torneio "${result.name}" importado!`);
  } catch(e) { showToast('Erro: '+e.message, 'error'); }
}

// === PLAYERS (dentro do torneio) ===
// renderPlayers + showNewPlayerModal + editPlayer + savePlayer + deletePlayer
// + deleteAllPlayers + renderPlayerCategories + collectInscriptions + setPlayerTab
// + renderInscricaoTab + onCatCheckChange + onGenderChange + onDobChange
// extraidos pra src/js/modules/players.js (issue #14.E).

function syncEntriesFromPlayers() {
  if (!tournament) return;

  // Preservar status existentes
  const existingStatus = {};
  (tournament.entries || []).forEach(e => {
    existingStatus[e.playerId + '|' + e.key] = e.status;
  });

  tournament.entries = [];
  players.forEach(p => {
    (p.inscriptions || []).forEach(insc => {
      const prevStatus = existingStatus[p.id + '|' + insc.key];
      tournament.entries.push({
        playerId: p.id,
        playerName: `${p.firstName} ${p.lastName}`,
        club: p.club || '',
        events: [insc.mod],
        category: insc.cat,
        key: insc.key,
        partner: insc.partner || '',
        status: prevStatus || 'confirmado'
      });
    });
  });

  // Gerar/atualizar chaves automaticamente
  autoGenerateDraws();

  // Sincronizar chaves ja sorteadas com mudancas nos jogadores
  syncDrawsPlayers();

  window.api.saveTournament(tournament);
}

// Sincronizar jogadores das chaves com inscritos atuais (para chaves nao sorteadas)
function syncDrawsPlayers(){
  if(!tournament?.draws?.length)return;
  const toReset=[];
  (tournament.draws||[]).forEach(d=>{
    const entries=(tournament.entries||[]).filter(e=>e.key===d.name&&e.status!=='ausente');
    const mod=d.name.split(' ')[0];
    const isDupla=['DM','DF','DX'].includes(mod);
    let newPlayers;
    if(isDupla){
      const pairs=new Set();
      newPlayers=[];
      entries.forEach(e=>{
        if(!e.partner)return;
        const pairKey=[e.playerId,e.partner].sort().join('-');
        if(!pairs.has(pairKey)){
          pairs.add(pairKey);
          const partner=players.find(p=>p.id===e.partner);
          const partnerName=partner?`${partner.firstName} ${partner.lastName}`:'Sem dupla';
          newPlayers.push(`${e.playerName} / ${partnerName}`);
        }
      });
    } else {
      newPlayers=entries.map(e=>e.playerName);
    }

    // Verificar se tipo ideal mudou
    const autoType=getDrawTypeForCount(tournament,newPlayers.length);
    const idealType=autoType||d.type;

    // Aviso: nomes duplicados na mesma chave
    const nameSet=new Set();
    newPlayers.forEach(n=>{if(nameSet.has(n)){showToast(`Aviso: nome duplicado "${n}" na chave ${d.name}. Considere diferenciar os nomes.`,'warning');}nameSet.add(n);});

    if(d.matches?.length){
      // Chave ja sorteada: verificar se houve mudanca significativa
      const sortedOld=[...d.players].sort();
      const sortedNew=[...newPlayers].sort();
      const playersChanged=sortedOld.length!==sortedNew.length||sortedOld.some((p,i)=>p!==sortedNew[i]);
      const typeChanged=idealType!==d.type;
      if(playersChanged||typeChanged){
        // Verificar se tem jogos finalizados — NÃO resetar se tiver
        const hasFinished=(tournament.matches||[]).some(m=>m.drawName===d.name&&(m.status==='Finalizada'||m.status==='WO'));
        if(hasFinished){
          // Apenas atualizar lista de jogadores sem resetar matches
          d.players=newPlayers;
          // Não mudar tipo nem limpar matches/partidas
          showToast(`Chave "${d.name}" tem jogos finalizados. Jogadores atualizados mas chave mantida.`,'info');
        } else {
          // Resetar chave para re-sortear com novos dados
          d.players=newPlayers;
          d.type=idealType;
          d.matches=[];
          d.awarded=false;
          toReset.push(d.name);
          // Limpar partidas desta chave
          if(tournament.matches){
            tournament.matches=tournament.matches.filter(m=>m.drawName!==d.name);
            tournament.matches.forEach((m,i)=>{m.id=(i+1).toString();m.num=i+1;});
          }
        }
      }
    } else {
      // Chave nao sorteada: atualizar livremente
      d.players=newPlayers;
      if(autoType)d.type=autoType;
    }
  });
  if(toReset.length){
    showToast(`Chave(s) ${toReset.join(', ')} resetada(s) por mudanca de jogadores. Sorteie novamente.`,'warning');
  }
}

// Gera chaves automaticamente baseado nos inscritos confirmados
function autoGenerateDraws() {
  if (!tournament) return;
  if (!tournament.draws) tournament.draws = [];

  // Agrupar inscritos confirmados por key (ex: "SM Principal", "DM Sub 13")
  const groups = {};
  (tournament.entries || []).forEach(e => {
    if (e.status === 'ausente') return; // Ignorar ausentes
    if (!groups[e.key]) groups[e.key] = [];
    groups[e.key].push(e);
  });

  // Funcao para montar lista de jogadores de uma key
  function buildDrawPlayers(key, entries) {
    const mod = key.split(' ')[0];
    const isDupla = ['DM', 'DF', 'DX'].includes(mod);
    if (isDupla) {
      const pairs = new Set();
      let drawPlayers = [];
      entries.forEach(e => {
        if (!e.partner) return;
        const pairKey = [e.playerId, e.partner].sort().join('-');
        if (!pairs.has(pairKey)) {
          pairs.add(pairKey);
          const partner = players.find(p => p.id === e.partner);
          const partnerName = partner ? `${partner.firstName} ${partner.lastName}` : 'Sem dupla';
          drawPlayers.push(`${e.playerName} / ${partnerName}`);
        }
      });
      return drawPlayers.length >= 2 ? drawPlayers : null;
    }
    return entries.map(e => e.playerName);
  }

  // Para cada grupo com 2+ inscritos
  Object.keys(groups).forEach(key => {
    const entries = groups[key];
    if (entries.length < 2) return;

    const drawPlayers = buildDrawPlayers(key, entries);
    if (!drawPlayers) return;

    // Para duplas, contar duplas formadas; para simples, contar jogadores
    const count = drawPlayers.length;
    let type = 'Eliminatoria';
    const autoType = getDrawTypeForCount(tournament, count);
    if (autoType) type = autoType;

    // Verificar se ja existe chave para esta key
    const existing = tournament.draws.find(d => d.name === key);
    if (existing) {
      // Chave existe: atualizar jogadores e tipo SE nao foi sorteada
      if (!existing.matches?.length) {
        existing.players = drawPlayers;
        existing.type = type;
      }
      return;
    }

    // Criar nova chave
    const newDraw = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      name: key,
      event: key.split(' ')[0],
      category: key.split(' ').slice(1).join(' '),
      type,
      players: drawPlayers,
      matches: [],
      seeds: 0
    };
    if (type === 'Grupos + Eliminatoria') {
      // Auto por BTP (min 2 grupos em Grupos+Elim); editavel manualmente por chave.
      newDraw.numGroups = Math.max(2, calcIdealGroupCount(drawPlayers.length));
      newDraw.groupQualifiers = 2;
    }
    tournament.draws.push(newDraw);
  });

  // Remover chaves que nao tem mais inscritos suficientes E nao foram sorteadas
  tournament.draws = tournament.draws.filter(d => {
    const entries = (tournament.entries || []).filter(e => e.key === d.name && e.status !== 'ausente');
    return entries.length >= 2 || (d.matches && d.matches.length > 0);
  });
}

let _filterTournamentsTimer=null,_filterRosterTimer=null;
function filterTournaments() {
  clearTimeout(_filterTournamentsTimer);
  _filterTournamentsTimer=setTimeout(()=>filterTable('search-tournaments','tournaments-table-body'),150);
}
function filterRoster() {
  clearTimeout(_filterRosterTimer);
  _filterRosterTimer=setTimeout(()=>filterTable('search-roster','roster-table-body'),150);
}
function filterTable(searchId, tableBodyId) {
  const input = document.getElementById(searchId);
  if (!input) return;
  const term = input.value.toLowerCase().trim();
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    const text = row.textContent || '';
    row.style.display = text.toLowerCase().includes(term) ? '' : 'none';
  });
}

async function exportPlayersCSV() {
  if (!players.length) { showToast('Nenhum jogador','warning'); return; }

  // Gerar uma linha POR INSCRICAO (atleta pode ter varias linhas, uma por categoria)
  // v3.50+: tambem emite DOB+Clube do parceiro (dupla e mista) em colunas dedicadas
  const data = [];
  // C8: se partner.id referenciar player inexistente (deletado, corrompido),
  // usar snapshot salvo em insc.partnerName/Dob/Club (gravado no bind).
  const findPartnerInfo = (p, mod, cat) => {
    const insc = (p.inscriptions||[]).find(i=>i.mod===mod&&i.cat===cat);
    if (!insc) return { name:'', dob:'', club:'' };
    const partner = insc.partner ? players.find(x=>x.id===insc.partner) : null;
    if (partner) {
      return {
        name: (partner.firstName+' '+partner.lastName).trim(),
        dob: partner.dob || '',
        club: partner.club || '',
      };
    }
    return {
      name: insc.partnerName || '',
      dob: insc.partnerDob || '',
      club: insc.partnerClub || '',
    };
  };

  players.forEach(p => {
    const name = (p.firstName+' '+p.lastName).trim();
    const inscs = p.inscriptions||[];
    if (!inscs.length) return;

    // Agrupar inscricoes por categoria
    const catMap = {};
    inscs.forEach(i => {
      const cat = i.cat || 'Principal';
      if (!catMap[cat]) catMap[cat] = { simples:false, dupla:false, mista:false,
        parceiroDupla:'', parceiroDuplaDOB:'', parceiroDuplaClube:'',
        parceiroMista:'', parceiroMistaDOB:'', parceiroMistaClube:'' };
      if (i.mod === 'SM' || i.mod === 'SF') catMap[cat].simples = true;
      if (i.mod === 'DM' || i.mod === 'DF') {
        catMap[cat].dupla = true;
        const info = findPartnerInfo(p, i.mod, cat);
        catMap[cat].parceiroDupla = info.name;
        catMap[cat].parceiroDuplaDOB = info.dob;
        catMap[cat].parceiroDuplaClube = info.club;
      }
      if (i.mod === 'DX') {
        catMap[cat].mista = true;
        const info = findPartnerInfo(p, 'DX', cat);
        catMap[cat].parceiroMista = info.name;
        catMap[cat].parceiroMistaDOB = info.dob;
        catMap[cat].parceiroMistaClube = info.club;
      }
    });

    // Uma linha por categoria
    let first = true;
    Object.entries(catMap).forEach(([cat, m]) => {
      data.push({
        name, gender: p.gender||'', dob: p.dob||'', club: p.club||'',
        categoria: cat, phone: first ? (p.phone||'') : '',
        simples: m.simples ? 'X' : '',
        dupla: m.dupla ? 'X' : '',
        parceiroDupla: m.parceiroDupla,
        parceiroDuplaDOB: m.parceiroDuplaDOB,
        parceiroDuplaClube: m.parceiroDuplaClube,
        mista: m.mista ? 'X' : '',
        parceiroMista: m.parceiroMista,
        parceiroMistaDOB: m.parceiroMistaDOB,
        parceiroMistaClube: m.parceiroMistaClube,
      });
      first = false;
    });
  });

  const ok = await window.api.xlsxExport(data);
  if (ok) showToast(`Planilha exportada! ${data.length} inscricoes de ${players.length} atletas.`);
}

// === ROSTER (sincronizado com jogadores) ===
function renderRoster() {
  if (!tournament) return;
  const tb = document.getElementById('roster-table-body');
  const entries = tournament.entries || [];
  if (!entries.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Nenhum inscrito. Adicione categorias nos jogadores.</td></tr>`; return; }

  // Filtro ativo
  const activeTab = document.querySelector('#roster-tabs .tab.active');
  const filterMod = activeTab?.dataset?.mod || '';
  const filterCat = document.getElementById('roster-cat-filter')?.value || '';

  let h = '';
  let count = 0;
  entries.forEach((e, i) => {
    if (filterMod && !e.events.includes(filterMod)) return;
    if (filterCat && e.category !== filterCat) return;
    count++;
    const partner = e.partner ? players.find(p=>p.id===e.partner) : null;
    const partnerName = partner ? `${partner.firstName} ${partner.lastName}` : '';
    const st = { inscrito:'tag-gray', confirmado:'tag-green', presente:'tag-blue', ausente:'tag-red' };
    h += `<tr>
      <td>${count}</td>
      <td><strong>${esc(e.playerName)}</strong>${partnerName ? '<br><small style="color:var(--fabd-gray-500)">Dupla: '+esc(partnerName)+'</small>':''}</td>
      <td>${esc(e.club)||'-'}</td>
      <td><span class="tag tag-blue">${esc(e.key)}</span></td>
      <td><span class="tag ${st[e.status]||'tag-gray'}">${esc(e.status)}</span></td>
      <td><select class="form-control" style="width:110px;padding:2px 4px;font-size:11px" data-action="updateEntryStatus" data-event="change" data-arg-1="${i}" data-arg-2="$value">
        <option value="inscrito"${e.status==='inscrito'?' selected':''}>Inscrito</option>
        <option value="confirmado"${e.status==='confirmado'?' selected':''}>Confirmado</option>
        <option value="presente"${e.status==='presente'?' selected':''}>Presente</option>
        <option value="ausente"${e.status==='ausente'?' selected':''}>Ausente</option>
      </select></td>
      <td></td></tr>`;
  });
  if (!count) h = `<tr><td colspan="7" style="text-align:center;color:var(--fabd-gray-500);padding:20px">Nenhum inscrito nesta categoria</td></tr>`;
  tb.innerHTML = h;
}

function setRosterTab(el, mod) {
  document.querySelectorAll('#roster-tabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderRoster();
}

async function updateEntryStatus(idx, status) {
  if (!tournament?.entries?.[idx]) return;
  const entry = tournament.entries[idx];
  entry.status = status;

  // Verificar se um jogador (individual) participa de uma partida (funciona para singles e duplas)
  const playerInMatch = (playerName, matchPlayer) => {
    if (!matchPlayer) return false;
    return matchPlayer.split('/').some(n => n.trim() === playerName);
  };

  // Se marcou como AUSENTE, aplicar WO apenas nas partidas DIRETAS deste jogador
  if (status === 'ausente') {
    const playerName = entry.playerName;
    // Coletar partidas a marcar WO primeiro (para nao modificar durante iteracao)
    const toWO = [];
    (tournament.matches || []).forEach(m => {
      if (m.status === 'Finalizada' || m.status === 'WO') return;
      if (m.status === 'A definir') return; // Nao aplicar WO em jogos futuros
      if (playerInMatch(playerName, m.player1)) toWO.push({match:m, winner:2});
      else if (playerInMatch(playerName, m.player2)) toWO.push({match:m, winner:1});
    });
    toWO.forEach(({match:m, winner})=>{
      m.status = 'WO'; m.score = 'W.O.'; m.winner = winner; m.finishedAt = new Date().toISOString();
      propagateResultToDraws(m);
    });
    // Tambem atualizar round robin draws
    (tournament.draws||[]).forEach(d=>{
      if(d.type!=='Eliminatoria'){
        (d.matches||[]).forEach(dm=>{
          if(dm.winner)return;
          const p1Has=dm.player1&&dm.player1.split('/').some(n=>n.trim()===playerName);
          const p2Has=dm.player2&&dm.player2.split('/').some(n=>n.trim()===playerName);
          if(p1Has){dm.winner=2;dm.score1='W.O.';dm.score2='';}
          else if(p2Has){dm.winner=1;dm.score1='';dm.score2='W.O.';}
        });
      }
    });
    showToast(`${playerName} marcado como ausente. W.O. aplicado.`, 'warning');
  }

  // Se voltou para presente/confirmado, reverter WOs automaticos
  if (status === 'presente' || status === 'confirmado') {
    const playerName = entry.playerName;
    // Reverter em tournament.matches
    (tournament.matches || []).forEach(m => {
      if (m.status === 'WO' && m.score === 'W.O.') {
        if (playerInMatch(playerName, m.player1) || playerInMatch(playerName, m.player2)) {
          reverseResultInDraws(m);
          m.status = 'Pendente'; m.score = ''; m.winner = undefined; m.finishedAt = undefined;
        }
      }
    });
    // Reverter em round robin draws
    (tournament.draws||[]).forEach(d=>{
      if(d.type!=='Eliminatoria'){
        (d.matches||[]).forEach(dm=>{
          const p1Has=dm.player1&&dm.player1.split('/').some(n=>n.trim()===playerName);
          const p2Has=dm.player2&&dm.player2.split('/').some(n=>n.trim()===playerName);
          if((p1Has||p2Has)&&dm.winner&&(dm.score1==='W.O.'||dm.score2==='W.O.')){
            dm.winner=undefined;dm.score1='';dm.score2='';
          }
        });
      }
    });
    showToast(`${playerName} confirmado. W.O. revertido.`, 'info');
  }

  // Re-gerar chaves (pode ter mudado com ausente/confirmado)
  autoGenerateDraws();

  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderRoster();
}

// ═══════════════════════════════════════════════════════════════════════════
// TELEMETRIA LEVE (v4.1 — diagnóstico passivo via DevTools)
// ═══════════════════════════════════════════════════════════════════════════
// No DevTools (Ctrl+Shift+I) rodar: console.table(window.__fabdStats)
// pra ver contadores em tempo real. Útil pra depurar problemas em produção
// sem UI extra. Telemetria zero-overhead (apenas incrementa contadores).
window.__fabdStats = {
  realtimeUpdates: 0,            // eventos Realtime score recebidos
  rendersDeferred: 0,            // renders adiados por input em foco
  rendersFlushed: 0,             // renders executados (após coalesce)
  upsertMatchOk: 0,
  upsertMatchNetwork: 0,         // falhou todas as 3 tentativas (rede)
  upsertMatchPermanent: 0,       // falhou imediato (RLS, sem federacao)
  removeFromCourtOk: 0,
  removeFromCourtFail: 0,
  reconcileEvents: 0,            // vezes que main detectou divergencia
  authSignedOut: 0,
  startedAt: new Date().toISOString(),
};

// ═══════════════════════════════════════════════════════════════════════════
// RENDER COALESCING (v3.95 — fix "aba pisca" e "input trava ao digitar")
// ═══════════════════════════════════════════════════════════════════════════
//
// Problema: cada update do Realtime / polling disparava renderMatches +
// renderCourtsPanel imediatamente. tb.innerHTML = h descarta o input que o
// usuario esta digitando, perde foco, "aba pisca". Em jogo ativo, arbitro
// marca 1 ponto = 1 evento Realtime = 1 re-render = 1 piscada.
//
// Solucao: cada render passa por scheduleRender(name, fn) que:
//   1. Coalesce — se varios scheduleRender chegam no mesmo frame, executa 1
//   2. Defer-when-typing — se ha input/textarea/select em foco, ADIA o render
//      ate o blur (instala listener once). Render nao destroi o input ativo.
// ═══════════════════════════════════════════════════════════════════════════

const _pendingRenders = new Map(); // name -> render fn
let _renderRafId = null;
let _renderBlurListener = null;

function _isUserTyping() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
  if (a.type === 'checkbox' || a.type === 'radio' || a.type === 'button' || a.type === 'submit') return false;
  if (a.readOnly || a.disabled) return false;
  return true;
}

function _flushPendingRenders() {
  _renderRafId = null;
  // Se voltou a ter input em foco entre o schedule e o flush, re-adia
  if (_isUserTyping()) { _attachBlurFlush(); return; }
  const fns = [..._pendingRenders.values()];
  _pendingRenders.clear();
  for (const fn of fns) { try { fn(); window.__fabdStats.rendersFlushed++; } catch (e) { console.warn('render error:', e); } }
}

function _attachBlurFlush() {
  if (_renderBlurListener) return; // ja instalado
  const active = document.activeElement;
  if (!active) { _renderRafId = requestAnimationFrame(_flushPendingRenders); return; }
  _renderBlurListener = () => {
    active.removeEventListener('blur', _renderBlurListener);
    _renderBlurListener = null;
    if (_renderRafId == null) _renderRafId = requestAnimationFrame(_flushPendingRenders);
  };
  active.addEventListener('blur', _renderBlurListener, { once: true });
}

// opts.deferWhenTyping (default true): se há input em foco, espera o blur.
// Para filtros onde o próprio input em foco é a FONTE do render (ex: search-draws),
// passar { deferWhenTyping: false } — coalesce via rAF mas roda imediatamente.
function scheduleRender(name, fn, opts) {
  _pendingRenders.set(name, fn);
  const defer = !opts || opts.deferWhenTyping !== false;
  if (defer && _isUserTyping()) { window.__fabdStats.rendersDeferred++; _attachBlurFlush(); return; }
  if (_renderRafId == null) _renderRafId = requestAnimationFrame(_flushPendingRenders);
}

// === DRAWS (sorteio individual por chave) ===
const MOD_ORDER=['SM','SF','DM','DF','DX'];
const CAT_ORDER=['Sub 11','Sub 13','Sub 15','Sub 17','Sub 19','Sub 23','Principal','Senior','Master I','Master II'];
function getCatIdx(name){for(let i=0;i<CAT_ORDER.length;i++)if(name.includes(CAT_ORDER[i]))return i;return 999;}
const SIMPLES_MOD=['SM','SF'];
const DUPLAS_MOD=['DM','DF','DX'];
function isSimplesMod(n){return SIMPLES_MOD.some(m=>n.startsWith(m));}
function isDuplaMod(n){return DUPLAS_MOD.some(m=>n.startsWith(m));}
// sortDraws + computeDrawState + applyDrawFilters + drawFilters helpers
// + renderDraws/selectDraw/renderDrawDetail + drawFilters (let global)
// extraidos pra src/js/modules/draws-ui.js (issue #14.F parcial).
// Logica de geracao/propagacao (generateBracket, regenerateDrawSchedule,
// repropagateAllResults) PERMANECE em app.js — risco alto sem testes.

async function toggleAwarded(idx){
  const d=tournament.draws[idx];if(!d)return;
  // Verificar se todos os jogos estao finalizados antes de premiar
  if(!d.awarded){
    const realMatches=(d.matches||[]).filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE');
    const allFinished=realMatches.every(m=>m.winner!==undefined&&m.winner!==null);
    if(!allFinished){showToast('Finalize todos os jogos desta categoria antes de premiar.','warning');return;}
  }
  d.awarded=!d.awarded;
  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderDraws();
  showToast(d.awarded?`Chave "${d.name}" premiada!`:`Premiacao removida de "${d.name}"`);
}

// Sincronizar chaves com novos atletas adicionados
async function syncDrawsWithPlayers() {
  if (!tournament) return;

  syncEntriesFromPlayers();

  let added = 0, created = 0;

  // Para cada chave existente, verificar se tem novos inscritos
  (tournament.draws || []).forEach(d => {
    const key = d.name; // ex: "SM Principal"
    const entries = (tournament.entries || []).filter(e => e.key === key && e.status !== 'ausente');

    // Montar lista atualizada de jogadores
    const mod = key.split(' ')[0];
    const isDupla = ['DM', 'DF', 'DX'].includes(mod);
    let newPlayers;

    if (isDupla) {
      const pairs = new Set();
      newPlayers = [];
      entries.forEach(e => {
        if (!e.partner) return;
        const pairKey = [e.playerId, e.partner].sort().join('-');
        if (!pairs.has(pairKey)) {
          pairs.add(pairKey);
          const partner = players.find(p => p.id === e.partner);
          const partnerName = partner ? `${partner.firstName} ${partner.lastName}` : '';
          newPlayers.push(`${e.playerName} / ${partnerName}`);
        }
      });
    } else {
      newPlayers = entries.map(e => e.playerName);
    }

    // Encontrar atletas novos (que nao estao na chave)
    const currentPlayers = d.players || [];
    const novos = newPlayers.filter(p => !currentPlayers.includes(p));

    if (novos.length > 0) {
      novos.forEach(n => d.players.push(n));
      added += novos.length;

      // Se chave ja foi sorteada, adicionar novos jogos SEM mexer nos existentes
      if (d.matches?.length) {
        if (d.type === 'Grupos + Eliminatoria') {
          // Re-sortear grupos quando novos jogadores chegam
          d.matches = [];
          d.groupsData = null;
        } else if (d.type === 'Todos contra Todos') {
          // Round Robin: adicionar jogos do novo atleta contra todos os existentes
          novos.forEach(novoP => {
            currentPlayers.forEach(existP => {
              const p1idx = d.players.indexOf(novoP);
              const p2idx = d.players.indexOf(existP);
              d.matches.push({ round: 1, player1: novoP, player2: existP, p1idx, p2idx, score1: '', score2: '' });
            });
          });
        } else {
          // Eliminatoria: adicionar na rodada 1 com BYE ou contra outro novo
          for (let i = 0; i < novos.length; i += 2) {
            const p1 = novos[i];
            const p2 = novos[i + 1] || 'BYE';
            d.matches.push({ round: 1, player1: p1, player2: p2 === 'BYE' ? 'BYE' : p2, score1: '', score2: '', winner: p2 === 'BYE' ? 1 : undefined });
          }
        }
      }
    }

    // REMOVER jogadores que nao estao mais inscritos nesta categoria
    if (!newPlayers) newPlayers = [];
    const removidos = currentPlayers.filter(p => !newPlayers.includes(p));
    if (removidos.length > 0) {
      d.players = d.players.filter(p => !removidos.includes(p));
      // Se chave ja foi sorteada, precisa re-sortear
      if (d.matches?.length) d.matches = [];
      added += removidos.length; // flag para atualizar partidas
    }
  });

  // Remover chaves vazias (sem jogadores suficientes)
  tournament.draws = (tournament.draws || []).filter(d => (d.players || []).length >= 2 || (d.matches && d.matches.length > 0));

  // Auto-gerar novas chaves para categorias sem chave
  const beforeCount = (tournament.draws || []).length;
  autoGenerateDraws();
  created = (tournament.draws || []).length - beforeCount;

  // Atualizar partidas: adicionar novos jogos sem perder os existentes
  if (added > 0) {
    // Coletar partidas existentes com dados (preservar)
    const existingMatches = (tournament.matches || []).filter(m =>
      m.score || m.status === 'Finalizada' || m.status === 'WO' || m.status === 'Em Quadra'
    );
    const existingKeys = new Set(existingMatches.map(m => `${m.drawName}|${m.player1}|${m.player2}|${m.round}`));

    // Coletar TODOS os jogos das chaves
    const allNewMatches = [];
    (tournament.draws || []).forEach(d => {
      (d.matches || []).forEach(m => {
        if (m.player2 === 'BYE' || m.player1 === 'BYE') return;
        const p1 = m.player1 || '', p2 = m.player2 || '';
        if (!p1 && !p2) return;
        const key = `${d.name}|${p1}|${p2}|${m.round}`;
        const totalR = Math.max(...(d.matches || []).map(x => x.round));
        const rn = m.round === totalR ? 'Final' : m.round === totalR - 1 ? 'Semifinal' : `R${m.round}`;

        if (existingKeys.has(key)) return; // Ja existe, pular

        allNewMatches.push({
          drawId: d.id, drawName: d.name, event: d.event, round: m.round, roundName: rn,
          player1: p1, player2: p2, player1Display: p1, player2Display: p2,
          isDefinida: !!(p1 && p2), score: '', court: '', time: '', umpire: '',
          status: (p1 && p2) ? 'Pendente' : 'A definir'
        });
      });
    });

    // Atribuir horarios aos novos jogos
    assignAutoTimes(allNewMatches.filter(m => m.isDefinida));

    // Juntar: existentes + novos
    tournament.matches = [...(tournament.matches || []), ...allNewMatches]
      .map((m, i) => ({ ...m, id: (i + 1).toString(), num: i + 1 }));
  }

  await window.api.saveTournament(tournament);
  renderDraws();

  if (added > 0 || created > 0) {
    let msg = '';
    if (added > 0) msg += `${added} atleta(s) adicionado(s). Novos jogos gerados nas partidas. `;
    if (created > 0) msg += `${created} nova(s) chave(s) criada(s). `;
    showToast(msg, 'info');
  } else {
    showToast('Tudo sincronizado! Nenhum novo atleta.', 'info');
  }
}

// Sortear TODAS as chaves de uma vez
let _generatingDraws = false;
async function generateAllDraws() {
  if (_generatingDraws) { showToast('Sorteio em andamento, aguarde...', 'warning'); return; }
  if (!tournament?.draws?.length) { showToast('Nenhuma chave para sortear', 'warning'); return; }
  const pending = tournament.draws.filter(d => !d.matches?.length);
  if (!pending.length) {
    if (!confirm('Todas as chaves ja foram sorteadas. Deseja sortear novamente?')) return;
    // Resetar todas
    tournament.draws.forEach(d => { d.matches = []; });
  }

  _generatingDraws = true;
  try {
    let count = 0;
    tournament.draws.forEach((d, idx) => {
      if (d.matches?.length && pending.length > 0) return;
      const seeds=(d.seeds_list||[]).filter(s=>s);
      const nonSeeds=[...d.players].filter(p=>!seeds.includes(p)).sort(()=>Math.random()-0.5);
      if (d.type === 'Eliminatoria') {
        d.matches = generateEliminationBracket(nonSeeds,seeds);
      } else if (d.type === 'Grupos + Eliminatoria') {
        const numG = d.numGroups || 2;
        const qual = d.groupQualifiers || 2;
        const allP = [...seeds, ...nonSeeds];
        d.groupsData = generateGroupsPhase(allP, numG, seeds);
        d.groupQualifiers = qual;
        d.numGroups = numG;
        d.matches = [];
        d.groupsData.groups.forEach(g => { g.matches.forEach(m => d.matches.push(m)); });
      } else {
        const sh=[...seeds,...nonSeeds];
        d.matches = generateRoundRobinSchedule(sh);
      }
      count++;
    });

    ensureDayScheduleDraws();
    rebuildMatchList();
    await window.api.saveTournament(tournament);
    prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    renderDraws();
    showToast(`${count} chave(s) sorteada(s)!`);
  } catch(e) {
    console.error('Erro ao gerar chaves:', e);
    showToast('Erro ao gerar chaves: ' + e.message, 'error');
  } finally {
    _generatingDraws = false;
  }
}

async function updateSeed(drawIdx,seedIdx,playerName){
  const d=tournament.draws[drawIdx];if(!d)return;
  if(!d.seeds_list)d.seeds_list=[];
  d.seeds_list[seedIdx]=playerName||'';
  // Limpar posicoes vazias do final
  while(d.seeds_list.length&&!d.seeds_list[d.seeds_list.length-1])d.seeds_list.pop();
  await window.api.saveTournament(tournament);
  renderDrawDetail(drawIdx);
}

// Handlers para edicao manual de grupos/classificados por chave (pre-sorteio).
// Persistem no draw e sincronizam com Supabase. Nao mexe em chave ja sorteada
// (input fica disabled na UI; validacao de seguranca aqui tambem).
async function updateDrawNumGroups(idx, value) {
  const d = tournament.draws?.[idx];
  if (!d) return;
  if (d.matches?.length) { showToast('Re-sorteie a chave para mudar o numero de grupos', 'warning'); return; }
  const n = Math.max(1, Math.min(8, parseInt(value) || 2));
  d.numGroups = n;
  await window.api.saveTournament(tournament);
  prepareRankingsForSync(); window.api.supabaseUpsertTournament(tournament.id, tournament.name, tournament);
  renderDrawDetail(idx);
}

async function updateDrawQualifiers(idx, value) {
  const d = tournament.draws?.[idx];
  if (!d) return;
  if (d.matches?.length) { showToast('Re-sorteie a chave para mudar classificados/grupo', 'warning'); return; }
  const n = Math.max(1, Math.min(4, parseInt(value) || 2));
  d.groupQualifiers = n;
  await window.api.saveTournament(tournament);
  prepareRankingsForSync(); window.api.supabaseUpsertTournament(tournament.id, tournament.name, tournament);
  renderDrawDetail(idx);
}

// Sortear UMA chave individual
let _generatingSingleDraw = false;
async function generateSingleDraw(idx) {
  if (_generatingSingleDraw) { showToast('Sorteio em andamento, aguarde...', 'warning'); return; }
  const d = tournament.draws[idx];
  if (!d) return;
  // Reforço v3.88: bloqueia re-sorteio durante o torneio em andamento — proteção contra
  // perda acidental de resultado. Em quadra = bloqueio total. Finalizada = aviso forte.
  if (d.matches?.length) {
    const inProgress = (tournament.matches || []).filter(m => m.drawName === d.name && m.status === 'Em Quadra').length;
    const finished = (tournament.matches || []).filter(m => m.drawName === d.name && (m.status === 'Finalizada' || m.status === 'WO' || m.status === 'Desistencia' || m.status === 'Desqualificacao')).length;
    if (inProgress > 0) { showToast(`Não pode re-sortear "${d.name}": ${inProgress} jogo(s) em quadra agora.`, 'error'); return; }
    if (finished > 0) {
      if (!confirm(`ATENÇÃO: a chave "${d.name}" tem ${finished} jogo(s) finalizado(s).\n\nRe-sortear vai PERDER esses resultados.\n\nConfirmar mesmo assim?`)) return;
    } else {
      if (!confirm('Esta chave ja foi sorteada. Deseja sortear novamente?')) return;
    }
  }
  _generatingSingleDraw = true;
  try {

  const seeds=(d.seeds_list||[]).filter(s=>s);
  const nonSeeds=[...d.players].filter(p=>!seeds.includes(p)).sort(()=>Math.random()-0.5);

  if (d.type === 'Eliminatoria') {
    d.matches = generateEliminationBracket(nonSeeds,seeds);
  } else if (d.type === 'Grupos + Eliminatoria') {
    const numG = d.numGroups || 2;
    const qual = d.groupQualifiers || 2;
    const allP = [...seeds, ...nonSeeds];
    d.groupsData = generateGroupsPhase(allP, numG, seeds);
    d.groupQualifiers = qual;
    d.numGroups = numG;
    d.matches = [];
    d.groupsData.groups.forEach(g => { g.matches.forEach(m => d.matches.push(m)); });
  } else {
    d.matches = generateRoundRobinSchedule([...seeds,...nonSeeds]);
  }

  // Se ja existem matches de outras chaves, preservar e só encaixar esta
  const otherDrawsHaveMatches = (tournament.matches || []).some(m => m.drawName !== d.name);
  if (otherDrawsHaveMatches) {
    // Remover matches antigos desta chave (o regenerate vai recriar com o novo sorteio)
    tournament.matches = (tournament.matches || []).filter(m => m.drawName !== d.name);
    // Usar regenerateDrawSchedule que preserva outras categorias (skip confirm, ja perguntou)
    await regenerateDrawSchedule(idx, true);
  } else {
    // Primeiro sorteio ou unica chave — pode reconstruir toda a lista
    rebuildMatchList();
    await window.api.saveTournament(tournament);
    prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    renderMatches();
  }
  // Renderizar chaves e detalhe da chave sorteada
  selectedDrawIdx = idx;
  renderDraws();
  renderDrawDetail(idx);
  showToast(`Chave "${d.name}" sorteada!`);
  } catch(e) { console.error('Erro ao sortear chave:', e); showToast('Erro ao sortear: ' + e.message, 'error'); }
  finally { _generatingSingleDraw = false; }
}

// Gerar chave eliminatoria com seeds e BYEs
// REGRA OFICIAL BWF (Section 5.3.8 - Tables 1-3, In Force 01/01/2018)
// + PROTECAO DE CLUBE: minimiza confrontos do mesmo clube na 1a rodada
// Funciona para 2-64 atletas usando tabelas oficiais BWF
// Para 65+ atletas, usa algoritmo ITF dinamico equivalente

// ============================================================
// TABELAS OFICIAIS BWF (Section 5.3.8)
// ============================================================
// BWF_TABLES + gerarOrdemITF + bwfEmbaralhar +
// bwfDistribuirNonSeedsComProtecaoClube + generateEliminationBracket
// extraidos pra src/js/modules/bracket-elim.js (issue #14.J).

function renderBracket(d) {
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
  const matchW = 280;
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

  const svgW = (matchW + connW) * totalRounds + 280;
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

      const clipId='clip-'+r+'-'+i;
      h += '<clipPath id="'+clipId+'"><rect x="'+(x+6)+'" y="'+y+'" width="'+(matchW-50)+'" height="'+matchH+'"/></clipPath>';
      const c1 = m.winner===1?'#065F46':(isBye?'#ADB5BD':'#1E3A8A');
      h += '<text clip-path="url(#'+clipId+')" x="'+(x+8)+'" y="'+(y+30)+'" fill="'+c1+'" font-size="12" font-weight="600">'+esc(p1||'-')+'</text>';

      const c2 = m.winner===2?'#065F46':(isBye?'#DEE2E6':'#1E3A8A');
      h += '<text clip-path="url(#'+clipId+')" x="'+(x+8)+'" y="'+(y+matchH/2+22)+'" fill="'+c2+'" font-size="12" font-weight="600">'+(isBye?'- - -':esc(p2||'-'))+'</text>';

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
    const champW=250;
    h += '<rect x="'+cx+'" y="'+(cy-28)+'" width="'+champW+'" height="56" rx="8" fill="#FEF3C7" stroke="#F59E0B" stroke-width="3"/>';
    h += '<text x="'+(cx+champW/2)+'" y="'+(cy-8)+'" text-anchor="middle" fill="#92400E" font-size="10" font-weight="700">CAMPEAO</text>';
    const champ = finalM && finalM.winner === 1 ? finalM.player1 : finalM && finalM.winner === 2 ? finalM.player2 : 'A definir';
    h += '<text x="'+(cx+champW/2)+'" y="'+(cy+14)+'" text-anchor="middle" fill="#92400E" font-size="13" font-weight="800">'+esc(champ)+'</text>';
  }

  h += '</svg></div>';
  return h;
}

function renderRoundRobin(d) {
  if(!d.players?.length) return '';
  let h='<div class="table-container"><table><thead><tr><th>#</th><th>Jogador</th>';
  d.players.forEach((_,i)=>h+=`<th>${i+1}</th>`);
  h+='<th>V</th><th>D</th><th>Pts</th></tr></thead><tbody>';
  d.players.forEach((p,i)=>{
    h+=`<tr><td>${i+1}</td><td><strong>${esc(p)}</strong></td>`;
    d.players.forEach((q,j)=>{
      if(i===j){h+='<td style="background:var(--fabd-gray-200)">-</td>';return;}
      // Buscar por nome dos jogadores (mais robusto que p1idx/p2idx)
      const m=(d.matches||[]).find(x=>(x.player1===p&&x.player2===q)||(x.player1===q&&x.player2===p));
      if(!m||m.winner===undefined){h+='<td>-</td>';return;}
      const isP1=m.player1===p;
      // WO
      if(m.score1==='W.O.'||m.score2==='W.O.'){
        const iWon=(isP1&&m.winner===1)||(!isP1&&m.winner===2);
        h+=`<td style="color:${iWon?'#10B981':'#DC2626'};font-weight:700;font-size:11px">${iWon?'W':'L'}</td>`;
        return;
      }
      h+=`<td>${m.score1!==undefined&&m.score1!==''?(isP1?`${m.score1}-${m.score2}`:`${m.score2}-${m.score1}`):'-'}</td>`;
    });
    let w=0,l=0;
    (d.matches||[]).forEach(m=>{
      if(m.winner===undefined)return;
      const isP1=m.player1===p;const isP2=m.player2===p;
      if(!isP1&&!isP2)return;
      if((isP1&&m.winner===1)||(isP2&&m.winner===2))w++;
      if((isP1&&m.winner===2)||(isP2&&m.winner===1))l++;
    });
    h+=`<td>${w}</td><td>${l}</td><td><strong>${w*2}</strong></td></tr>`;
  });
  return h+'</tbody></table></div>';
}

// generateRoundRobinSchedule + _shuffleArray + _getPlayerClub +
// _placePlayerWithClubProtection + generateGroupsPhase + computeGroupStandings +
// areGroupsFinished extraidos pra src/js/modules/bracket-roundrobin-groups.js
// (issue #14.K).

// propagateGroupsToElimination extraida pra src/js/modules/bracket-reconcile.js (issue #14.M)
function renderGroupsElimination(d) {
  let h = '';
  if (!d.groupsData || !d.groupsData.groups) return '<p>Dados de grupos nao encontrados.</p>';

  const qualifiers = d.groupQualifiers || 2;
  const groupsFinished = areGroupsFinished(d);
  const groups = d.groupsData.groups;
  const hasElim = groupsFinished && d.groupsData.eliminationMatches?.length;

  // Abas: Grupo A | Grupo B | ... | Eliminatorias (sempre visivel)
  h += `<div class="tabs" id="ge-tabs" style="margin-bottom:16px">`;
  groups.forEach((g, i) => {
    h += `<div class="tab${i === 0 ? ' active' : ''}" data-action="setGeTab" data-arg-1="${i}">${esc(g.name)}</div>`;
  });
  h += `<div class="tab" data-action="setGeTab" data-arg-1="${groups.length}">Eliminatorias</div>`;
  h += `</div>`;

  // Paineis dos grupos
  groups.forEach((g, gi) => {
    const gLabel = (g.name || 'Grupo').replace('Grupo ', '');
    const groupMatches = d.matches.filter(m => m.group === gLabel && m.phase === 'group');
    g.matches = groupMatches.length ? groupMatches : g.matches;
    const standings = computeGroupStandings(g.players, g.matches);

    h += `<div class="ge-panel" id="ge-panel-${gi}" style="${gi > 0 ? 'display:none' : ''}">`;
    // Classificacao
    h += '<div class="table-container"><table><thead><tr><th style="text-align:center;width:40px">Pos</th><th>Jogador</th><th style="text-align:center">V</th><th style="text-align:center">D</th><th style="text-align:center">Pts+</th><th style="text-align:center">Pts-</th><th style="text-align:center">Diff</th></tr></thead><tbody>';
    standings.forEach((s, i) => {
      const isQ = i < qualifiers;
      h += `<tr style="background:${isQ ? '#D1FAE5' : i % 2 === 0 ? '#fff' : '#f8f9fa'}"><td style="text-align:center;font-weight:${isQ ? '700' : '400'};color:${isQ ? '#065F46' : '#1a1a1a'}">${i + 1}o</td><td style="font-weight:${isQ ? '700' : '400'}">${esc(s.name)}${isQ ? ' <span style="background:#10B981;color:white;font-size:10px;padding:1px 6px;border-radius:10px">Classif.</span>' : ''}</td><td style="text-align:center">${s.wins}</td><td style="text-align:center">${s.losses}</td><td style="text-align:center">${s.ptsFor}</td><td style="text-align:center">${s.ptsAgainst}</td><td style="text-align:center;font-weight:700;color:${s.ptsDiff > 0 ? '#059669' : s.ptsDiff < 0 ? '#DC2626' : '#666'}">${s.ptsDiff > 0 ? '+' : ''}${s.ptsDiff}</td></tr>`;
    });
    h += '</tbody></table></div>';
    // Confrontos
    h += '<div class="table-container" style="margin-top:8px"><table><thead><tr><th>#</th><th>Jogador</th>';
    g.players.forEach((_, i) => h += `<th style="text-align:center">${i + 1}</th>`);
    h += '</tr></thead><tbody>';
    g.players.forEach((p, i) => {
      h += `<tr><td>${i + 1}</td><td><strong>${esc(p)}</strong></td>`;
      g.players.forEach((q, j) => {
        if (i === j) { h += '<td style="background:var(--fabd-gray-200);text-align:center">-</td>'; return; }
        const m = g.matches.find(x => (x.player1 === p && x.player2 === q) || (x.player1 === q && x.player2 === p));
        if (!m || m.winner === undefined) { h += '<td style="text-align:center">-</td>'; return; }
        const isP1 = m.player1 === p;
        if (m.score1 === 'W.O.' || m.score2 === 'W.O.') {
          const iWon = (isP1 && m.winner === 1) || (!isP1 && m.winner === 2);
          h += `<td style="text-align:center;color:${iWon ? '#10B981' : '#DC2626'};font-weight:700;font-size:11px">${iWon ? 'W' : 'L'}</td>`;
          return;
        }
        h += `<td style="text-align:center">${m.score1 !== undefined && m.score1 !== '' ? (isP1 ? `${m.score1}-${m.score2}` : `${m.score2}-${m.score1}`) : '-'}</td>`;
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
  });

  // Painel Eliminatorias (sempre como aba)
  h += `<div class="ge-panel" id="ge-panel-${groups.length}" style="display:none">`;
  if (hasElim) {
    const elimDraw = { matches: d.groupsData.eliminationMatches, players: d.groupsData.eliminationMatches.filter(m => m.round === 1).flatMap(m => [m.player1, m.player2]).filter(p => p && p !== 'BYE') };
    h += renderBracket(elimDraw);
  } else {
    // Mostrar preview das eliminatorias com placeholders
    const totalGM = groups.reduce((s, g) => s + g.matches.filter(m => m.player1 && m.player2 && m.player1 !== 'BYE' && m.player2 !== 'BYE').length, 0);
    const doneGM = groups.reduce((s, g) => s + g.matches.filter(m => m.winner !== undefined && m.winner !== null).length, 0);
    h += `<div style="padding:16px;background:var(--fabd-gray-100);border-radius:8px;margin-bottom:16px;text-align:center">
      <p style="color:var(--fabd-gray-600);font-weight:600">Fase de grupos: ${doneGM}/${totalGM} partidas concluidas</p>
      <p style="color:var(--fabd-gray-500);font-size:12px;margin-top:4px">Os jogos abaixo serao preenchidos ao concluir os grupos.</p></div>`;
    // Gerar preview dos confrontos da eliminatoria
    const totalQualified = groups.length * qualifiers;
    const elimSlots = Math.pow(2, Math.ceil(Math.log2(totalQualified)));
    const semis = elimSlots / 2;
    h += `<div style="display:flex;flex-direction:column;gap:12px;max-width:500px;margin:0 auto">`;
    for (let i = 0; i < semis; i++) {
      const gIdxA = i % groups.length;
      const gIdxB = (i + 1) % groups.length;
      const posA = Math.floor(i / groups.length) + 1;
      const posB = qualifiers - Math.floor(i / groups.length);
      const labelA = `${posA}o do ${groups[gIdxA]?.name || 'Grupo '+(gIdxA+1)}`;
      const labelB = `${posB}o do ${groups[gIdxB]?.name || 'Grupo '+(gIdxB+1)}`;
      h += `<div style="background:#fff;border:2px dashed var(--fabd-gray-300);border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:600;color:var(--fabd-blue)">${esc(labelA)}</span>
        <span style="color:var(--fabd-gray-400);font-weight:700">VS</span>
        <span style="font-weight:600;color:#DC2626">${esc(labelB)}</span>
      </div>`;
    }
    if (semis > 1) {
      h += `<div style="background:#FEF3C7;border:2px dashed #F59E0B;border-radius:8px;padding:12px 16px;text-align:center">
        <span style="font-weight:700;color:#92400E">FINAL</span>
        <p style="font-size:12px;color:#92400E;margin-top:4px">Vencedores das semifinais</p>
      </div>`;
    }
    h += `</div>`;
  }
  h += '</div>';

  return h;
}

function setGeTab(idx){
  document.querySelectorAll('#ge-tabs .tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  document.querySelectorAll('.ge-panel').forEach((p,i)=>p.style.display=i===idx?'':'none');
}

async function deleteDraw(i) {
  if(!confirm('Excluir chave e partidas?'))return;
  const d=tournament.draws[i];
  tournament.draws.splice(i,1);
  if(tournament.matches) tournament.matches=tournament.matches.filter(m=>m.drawId!==d?.id&&m.drawName!==d?.name).map((m,i)=>({...m,id:(i+1).toString(),num:i+1}));
  if(!tournament.draws.length)tournament.matches=[];
  cleanOrphanMatches(); selectedDrawIdx=-1;
  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderDraws(); showToast('Chave excluida');
}

function rebuildGroupsElimMatches(d, allM) {
  // Group phase matches
  let matchIdx = 0;
  (d.groupsData.groups || []).forEach(g => {
    g.matches.forEach((m, mi) => {
      if (m.player2 === 'BYE' || m.player1 === 'BYE') return;
      const p1 = m.player1 || '', p2 = m.player2 || '';
      if (!p1 || !p2) return;
      const groupLabel = m.group || (g.name || 'Grupo').replace('Grupo ', '');
      allM.push({
        drawId: d.id, drawName: d.name, event: d.event, round: m.round,
        roundName: `Grupo ${groupLabel} - R${m.round}`,
        drawMatchIdx: matchIdx, player1: p1, player2: p2,
        player1Display: p1, player2Display: p2, isDefinida: true,
        score: '', court: '', time: '', umpire: '', status: 'Pendente',
        group: groupLabel, phase: 'group'
      });
      matchIdx++;
    });
  });

  // Elimination phase matches
  const elimMatches = d.groupsData.eliminationMatches || [];
  if (elimMatches.length) {
    let mNum = 1; const mNums = new Map();
    elimMatches.forEach((m, i) => { if ((m.player1 && m.player2 && m.player2 !== 'BYE' && m.player1 !== 'BYE') || m.round > 1) { mNums.set(i, mNum); mNum++; } });
    const matchesByRound = {};
    elimMatches.forEach((m, i) => { if (!matchesByRound[m.round]) matchesByRound[m.round] = []; matchesByRound[m.round].push({ match: m, idx: i }); });
    let futIdx = 0;
    // Gerar nomes descritivos pra eliminatoria baseada em grupos
    const numGroups = (d.groupsData.groups||[]).length;
    const groupNames = (d.groupsData.groups||[]).map(g => (g.name || 'Grupo').replace('Grupo ',''));
    const qual = d.groupQualifiers || 2;

    elimMatches.forEach((m, i) => {
      if (m.player2 === 'BYE' || m.player1 === 'BYE') return;
      const p1 = m.player1 || '', p2 = m.player2 || '';
      const def = !!(p1 && p2);
      let d1 = p1, d2 = p2;

      // R1 da eliminatoria: nomes descritivos com cruzamento correto
      // Padrao: slot 0 = 1oA vs 2oB, slot 1 = 1oB vs 2oA, slot 2 = 1oC vs 2oD, etc.
      if (!def && m.round === 1) {
        const slotIdx = m.slotIdx != null ? m.slotIdx : i;
        if (numGroups >= 2) {
          const pairIdx = Math.floor(slotIdx / 2); // qual par de grupos (0=AB, 1=CD)
          const isSecond = slotIdx % 2 === 1; // false=1oA vs 2oB, true=1oB vs 2oA
          const gIdxA = pairIdx * 2; // grupo A do par
          const gIdxB = pairIdx * 2 + 1; // grupo B do par
          if (!p1) d1 = `1o do Grupo ${groupNames[isSecond ? gIdxB : gIdxA] || String.fromCharCode(65+(isSecond ? gIdxB : gIdxA))}`;
          if (!p2) d2 = `2o do Grupo ${groupNames[isSecond ? gIdxA : gIdxB] || String.fromCharCode(65+(isSecond ? gIdxA : gIdxB))}`;
        }
        if (!d1) d1 = 'A definir';
        if (!d2) d2 = 'A definir';
      } else if (!def && m.round > 1) {
        const prevAll = matchesByRound[m.round - 1] || [];
        const feedMatch1 = prevAll[futIdx * 2], feedMatch2 = prevAll[futIdx * 2 + 1];
        if (!p1 && feedMatch1) { const fn = mNums.get(feedMatch1.idx); d1 = fn ? `Venc. jogo ${fn}` : 'A definir'; }
        if (!p2 && feedMatch2) { const fn = mNums.get(feedMatch2.idx); d2 = fn ? `Venc. jogo ${fn}` : 'A definir'; }
        futIdx++;
      }

      const totalR = Math.max(...elimMatches.map(x => x.round));
      const rn = m.round === totalR ? 'Final' : m.round === totalR - 1 ? 'Semifinal' : m.round === totalR - 2 ? 'Quartas' : `Elim R${m.round}`;
      allM.push({
        drawId: d.id, drawName: d.name, event: d.event, round: m.round,
        roundName: rn, drawMatchIdx: matchIdx + i,
        player1: p1, player2: p2, player1Display: d1, player2Display: d2,
        isDefinida: def, score: '', court: '', time: '', umpire: '',
        status: def ? 'Pendente' : 'A definir', phase: 'elimination'
      });
    });
  } else {
    // Eliminatoria ainda nao gerada — criar placeholders baseados nos grupos
    const numGroups = (d.groupsData.groups||[]).length;
    const qual = d.groupQualifiers || 2;
    const groupNames = (d.groupsData.groups||[]).map(g => (g.name || 'Grupo').replace('Grupo ',''));

    if (numGroups >= 2) {
      // Calcular quantos classificam no total
      const totalClassificados = numGroups * qual;
      // Gerar semifinais e final
      const elimPlaceholders = [];

      if (totalClassificados >= 4) {
        // Semifinais: 1oA vs 2oB, 1oB vs 2oA (padrao cruzamento)
        elimPlaceholders.push({ round: 1, d1: `1o do Grupo ${groupNames[0]||'A'}`, d2: `2o do Grupo ${groupNames[1]||'B'}`, rn: 'Semifinal' });
        elimPlaceholders.push({ round: 1, d1: `1o do Grupo ${groupNames[1]||'B'}`, d2: `2o do Grupo ${groupNames[0]||'A'}`, rn: 'Semifinal' });
        // Final
        elimPlaceholders.push({ round: 2, d1: 'Venc. Semifinal 1', d2: 'Venc. Semifinal 2', rn: 'Final' });
      } else if (totalClassificados >= 2) {
        // Apenas final
        elimPlaceholders.push({ round: 1, d1: `1o do Grupo ${groupNames[0]||'A'}`, d2: `1o do Grupo ${groupNames[1]||'B'}`, rn: 'Final' });
      }

      elimPlaceholders.forEach((ep, i) => {
        allM.push({
          drawId: d.id, drawName: d.name, event: d.event, round: ep.round,
          roundName: ep.rn, drawMatchIdx: matchIdx + i,
          player1: '', player2: '', player1Display: ep.d1, player2Display: ep.d2,
          isDefinida: false, score: '', court: '', time: '', umpire: '',
          status: 'A definir', phase: 'elimination'
        });
      });
    }
  }
}

// Reconstruir partidas do ZERO (usado apos novo sorteio — limpa tudo)
function rebuildMatchList() {
  const allM = [];
  (tournament.draws || []).forEach(d => {
    // Groups + Elimination: handle separately
    if (d.type === 'Grupos + Eliminatoria' && d.groupsData) {
      rebuildGroupsElimMatches(d, allM);
      return;
    }
    // Numerar apenas jogos reais (sem BYE) para referencia
    let mNum = 1; const mNums = new Map();
    (d.matches || []).forEach((m, i) => { if ((m.player1 && m.player2 && m.player2 !== 'BYE' && m.player1 !== 'BYE') || m.round > 1) { mNums.set(i, mNum); mNum++; } });
    // Mapear cada jogo ao seus 2 jogos alimentadores (da rodada anterior, incluindo BYEs)
    const matchesByRound = {};
    (d.matches || []).forEach((m, i) => { if (!matchesByRound[m.round]) matchesByRound[m.round] = []; matchesByRound[m.round].push({ match: m, idx: i }); });
    let futIdx = 0;
    (d.matches || []).forEach((m, i) => {
      if (m.player2 === 'BYE' || m.player1 === 'BYE') return;
      // Pular BYE implicito: R1 com apenas 1 jogador (o outro e vazio)
      if (m.round === 1 && ((m.player1 && !m.player2) || (!m.player1 && m.player2))) return;
      const p1 = m.player1 || '', p2 = m.player2 || '';
      const def = !!(p1 && p2);
      let d1 = p1, d2 = p2;
      if (!def && m.round > 1) {
        // Pegar TODOS os jogos da rodada anterior (incluindo BYEs) para manter indice correto
        const prevAll = matchesByRound[m.round - 1] || [];
        const feedMatch1 = prevAll[futIdx * 2], feedMatch2 = prevAll[futIdx * 2 + 1];
        if (!p1 && feedMatch1) {
          // Se o jogo alimentador era BYE, o jogador ja esta definido; senao, referencia o jogo
          const fn = mNums.get(feedMatch1.idx);
          d1 = fn ? `Venc. jogo ${fn}` : 'A definir';
        }
        if (!p2 && feedMatch2) {
          const fn = mNums.get(feedMatch2.idx);
          d2 = fn ? `Venc. jogo ${fn}` : 'A definir';
        }
        futIdx++;
      }
      const totalR = Math.max(...(d.matches || []).map(x => x.round));
      let rn;
      if(d.type==='Todos contra Todos'){
        rn=`R${m.round}`;
      } else if(d.type==='Eliminatoria'){
        rn = m.round === totalR ? 'Final' : m.round === totalR - 1 ? 'Semifinal' : m.round === totalR - 2 ? 'Quartas' : `R${m.round}`;
      } else {
        rn = `R${m.round}`;
      }
      // Tudo zerado — novo sorteio = dados limpos
      allM.push({
        drawId: d.id, drawName: d.name, event: d.event, round: m.round, roundName: rn,
        drawMatchIdx: i, player1: p1, player2: p2, player1Display: d1, player2Display: d2, isDefinida: def,
        score: '', court: '', time: '', umpire: '', status: def ? 'Pendente' : 'A definir'
      });
    });
  });
  // Incluir todos os jogos (definidos e a definir) na lista
  // Separar definidos e "A definir"
  // Ordem BTP: R1 inteira (Sub 11 → Master II, M → F → X, simples → duplas) antes de R2 etc.
  const dist = sortMatchesByBTPOrder(allM.filter(m => m.isDefinida));
  const adefs = allM.filter(m => !m.isDefinida);
  // Atribuir horarios aos definidos (assignAutoTimes percorre na ordem recebida)
  assignAutoTimes(dist);
  // Jogos "A definir": atribuir horario APOS o ultimo jogo de GRUPO da mesma categoria
  // Ordenar adefs: semifinais antes de finais (por round)
  adefs.sort((a,b) => (a.drawName===b.drawName ? (a.round||0)-(b.round||0) : 0));
  const slotDur = (tournament.matchDuration || 30) + (tournament.restMinBetweenGames || 20);
  // Gerar slots e contar ocupacao para respeitar limite de quadras
  const rbStart = timeToMin(tournament.startTime||'08:00'), rbEnd = timeToMin(tournament.endTime||'18:00');
  const rbS = timeToMin(tournament.breakStart||'12:00'), rbE = timeToMin(tournament.breakEnd||'13:30');
  const rbCourts = tournament.courts||4;
  const rbSlots = [];
  let rbCur = rbStart;
  while (rbCur + (tournament.matchDuration||30) <= rbEnd) {
    if (rbCur >= rbS && rbCur < rbE) { rbCur = rbE; continue; }
    if (rbCur + (tournament.matchDuration||30) > rbS && rbCur < rbS) { rbCur = rbE; continue; }
    rbSlots.push(rbCur);
    rbCur += slotDur;
  }
  const rbCount = new Array(rbSlots.length).fill(0);
  dist.forEach(m => { if(m.time){ const si=rbSlots.indexOf(timeToMin(m.time)); if(si>=0) rbCount[si]++; }});
  adefs.forEach(m => {
    const sameDrawGroupTimes = dist.filter(d => d.drawName === m.drawName && d.phase === 'group' && d.time).map(d => timeToMin(d.time));
    const sameDrawAdefTimes = adefs.filter(d => d.drawName === m.drawName && d.time && d !== m).map(d => timeToMin(d.time));
    const allTimes = [...sameDrawGroupTimes, ...sameDrawAdefTimes];
    if (allTimes.length) {
      const lastMin = Math.max(...allTimes);
      for (let si = 0; si < rbSlots.length; si++) {
        if (rbSlots[si] <= lastMin) continue;
        if (rbCount[si] < rbCourts) {
          m.time = minToTime(rbSlots[si]);
          rbCount[si]++;
          break;
        }
      }
    }
  });
  tournament.matches = [...dist, ...adefs].map((m, i) => ({ ...m, id: (i + 1).toString(), num: i + 1 }));
}

// Ordem BTP (BWF Tournament Planner): R1 inteira primeiro (Sub 11 → Master II,
// masculino → feminino → mista, simples → duplas), depois R2 inteira, etc.
// Usado em rebuildMatchList ao gerar/regenerar todas as chaves.
const EVENT_ORDER_BTP = ['SM', 'DM', 'SF', 'DF', 'DX'];

// sortMatchesByBTPOrder extraido pra src/js/modules/match-helpers.js (issue #14.I).
// distributeMatches extraido pra src/js/modules/match-helpers.js (issue #14.I).
function assignAutoTimes(matches) {
  const start = timeToMin(tournament.startTime || '08:00'), end = timeToMin(tournament.endTime || '18:00');
  const dur = tournament.matchDuration || 30, rest = tournament.restMinBetweenGames || 20;
  const bS = timeToMin(tournament.breakStart || '12:00'), bE = timeToMin(tournament.breakEnd || '13:30');
  const slot = dur + rest, courts = tournament.courts || 4;

  // Gerar slots de horario
  const slots = [];
  let cur = start;
  while (cur + dur <= end) {
    if (cur >= bS && cur < bE) { cur = bE; continue; }
    if (cur + dur > bS && cur < bS) { cur = bE; continue; }
    slots.push(cur);
    cur += slot;
  }

  // Controle de ocupacao: quantos jogos em cada slot
  const slotCount = new Array(slots.length).fill(0);
  const playerLastSlot = {};

  // Extrair nomes individuais de duplas ("Joao Silva / Maria Santos" -> ["Joao Silva", "Maria Santos"])
  function getIndividualPlayers(name) {
    if (!name) return [];
    if (name.includes('/')) return name.split('/').map(n => n.trim()).filter(Boolean);
    return [name.trim()];
  }
  function registerPlayerSlot(name, slotIdx) {
    getIndividualPlayers(name).forEach(p => { playerLastSlot[p] = slotIdx; });
  }
  function checkPlayerAvailable(name, slotIdx) {
    return getIndividualPlayers(name).every(p => {
      const last = playerLastSlot[p];
      return last == null || slotIdx > last;
    });
  }

  // Registrar jogos ja finalizados/em quadra
  matches.forEach(m => {
    if (m.time && (m.status === 'Finalizada' || m.status === 'WO' || m.status === 'Em Quadra' || m.status === 'Desistencia' || m.status === 'Desqualificacao')) {
      const slotIdx = slots.indexOf(timeToMin(m.time));
      if (slotIdx >= 0) {
        slotCount[slotIdx]++;
        registerPlayerSlot(m.player1, slotIdx);
        registerPlayerSlot(m.player2, slotIdx);
      }
    }
  });

  // Registrar jogos que ja tem horario valido (mesmo que pendentes)
  matches.forEach(m => {
    if (m.time && (m.status === 'Finalizada' || m.status === 'WO' || m.status === 'Em Quadra' || m.status === 'Desistencia' || m.status === 'Desqualificacao')) return;
    if (m.time) {
      const mMin = timeToMin(m.time);
      // Verificar se horario nao cai em pausa
      const inBreak = mMin >= bS && mMin < bE;
      const slotIdx = inBreak ? -1 : slots.indexOf(mMin);
      if (slotIdx >= 0 && slotCount[slotIdx] < courts) {
        // Slot tem vaga — manter horario existente
        slotCount[slotIdx]++;
        registerPlayerSlot(m.player1, slotIdx);
        registerPlayerSlot(m.player2, slotIdx);
        return;
      }
      // Slot cheio — precisa reatribuir, limpar horario
      m.time = '';
    }
  });

  // Atribuir horarios aos jogos sem horario
  let startSearch = 0;
  matches.forEach(m => {
    if (m.time) return; // ja tem horario

    // Encontrar proximo slot com vaga E onde TODOS jogadores individuais descansaram
    for (let si = startSearch; si < slots.length; si++) {
      if (slotCount[si] >= courts) continue;
      const p1Ok = checkPlayerAvailable(m.player1, si);
      const p2Ok = checkPlayerAvailable(m.player2, si);

      if (p1Ok && p2Ok) {
        m.time = minToTime(slots[si]);
        if (!m.court) m.court = '';
        slotCount[si]++;
        registerPlayerSlot(m.player1, si);
        registerPlayerSlot(m.player2, si);
        return;
      }
    }
    // Sem slot ideal — relaxar regra de descanso e tentar qualquer slot com vaga
    for (let si = 0; si < slots.length; si++) {
      if (slotCount[si] < courts) {
        m.time = minToTime(slots[si]);
        if (!m.court) m.court = '';
        slotCount[si]++;
        registerPlayerSlot(m.player1, si);
        registerPlayerSlot(m.player2, si);
        return;
      }
    }
  });
}

function timeToMin(t){const[h,m]=(t||'08:00').split(':').map(Number);return h*60+m;}
function minToTime(min){return`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;}

function cleanOrphanMatches() {
  if(!tournament?.matches?.length)return;
  const ids=(tournament.draws||[]).map(d=>d.id),names=(tournament.draws||[]).map(d=>d.name);
  // Remover orfas
  tournament.matches=tournament.matches.filter(m=>(m.drawId&&ids.includes(m.drawId))||(m.drawName&&names.includes(m.drawName)));
  // Remover duplicatas (preferir drawMatchIdx, fallback para drawName+round+players)
  const seen=new Set();
  tournament.matches=tournament.matches.filter(m=>{
    const key=m.drawMatchIdx!=null?`${m.drawName}|idx:${m.drawMatchIdx}`:`${m.drawName}|${m.player1}|${m.player2}|${m.round}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
  // Renumerar
  tournament.matches.forEach((m,i)=>{m.id=(i+1).toString();m.num=i+1;});
}

function autoFillTimes() {
  if(!tournament?.matches?.length)return;
  const all=tournament.matches;
  if(all.some(m=>!m.time)){
    // Jogos definidos primeiro, depois "A definir" — todos recebem horario
    const defs=all.filter(m=>m.isDefinida!==false&&m.status!=='A definir');
    const adefs=all.filter(m=>m.isDefinida===false||m.status==='A definir');
    const ordered=[...defs,...adefs];
    assignAutoTimes(ordered);
    window.api.saveTournament(tournament);
  }
}

// Sincronizar partidas com as chaves (adiciona novos jogos sem perder os existentes)
async function syncMatchesWithDraws() {
  if (!tournament?.draws?.length) { showToast('Sem chaves para sincronizar', 'warning'); return; }

  // Coletar todas as partidas que devem existir baseado nas chaves sorteadas
  const shouldExist = [];
  (tournament.draws || []).forEach(d => {
    // Groups + Elimination: use dedicated handler
    if (d.type === 'Grupos + Eliminatoria' && d.groupsData) {
      const tempArr = [];
      rebuildGroupsElimMatches(d, tempArr);
      tempArr.forEach(m => shouldExist.push({ drawName: d.name, drawId: d.id, drawMatchIdx: m.drawMatchIdx, player1: m.player1, player2: m.player2, player1Display: m.player1Display, player2Display: m.player2Display, round: m.round, roundName: m.roundName, event: d.event, group: m.group, phase: m.phase }));
      return;
    }
    // Numerar jogos reais para referencia
    let mNum = 1; const mNums = new Map();
    (d.matches || []).forEach((m, i) => { if ((m.player1 && m.player2 && m.player2 !== 'BYE' && m.player1 !== 'BYE') || m.round > 1) { mNums.set(i, mNum); mNum++; } });
    const matchesByRound = {};
    (d.matches || []).forEach((m, i) => { if (!matchesByRound[m.round]) matchesByRound[m.round] = []; matchesByRound[m.round].push({ match: m, idx: i }); });
    let futIdx = 0;
    (d.matches || []).forEach((m, i) => {
      if (m.player2 === 'BYE' || m.player1 === 'BYE') return;
      // Pular BYE implicito: R1 com apenas 1 jogador
      if (m.round === 1 && ((m.player1 && !m.player2) || (!m.player1 && m.player2))) return;
      const p1 = m.player1 || '', p2 = m.player2 || '';
      // R1 com ambos vazios = chave criada mas nao sorteada (ignorar);
      // R>1 com ambos vazios = placeholder normal de bracket — gera "Venc. jogo X"
      if (m.round === 1 && !p1 && !p2) return;
      let d1 = p1, d2 = p2;
      if ((!p1 || !p2) && m.round > 1) {
        const prevAll = matchesByRound[m.round - 1] || [];
        const f1 = prevAll[futIdx * 2], f2 = prevAll[futIdx * 2 + 1];
        if (!p1 && f1) { const fn = mNums.get(f1.idx); d1 = fn ? `Venc. jogo ${fn}` : 'A definir'; }
        if (!p2 && f2) { const fn = mNums.get(f2.idx); d2 = fn ? `Venc. jogo ${fn}` : 'A definir'; }
        futIdx++;
      }
      shouldExist.push({ drawName: d.name, drawId: d.id, drawMatchIdx: i, player1: p1, player2: p2, player1Display: d1, player2Display: d2, round: m.round, event: d.event });
    });
  });

  // ATUALIZAR matches "A definir" quando jogadores ficam disponiveis (eliminatoria gerada)
  // Atualizar por drawMatchIdx (unico) OU por ordem na mesma round/draw
  const elimShouldExist = shouldExist.filter(s => s.phase === 'elimination');
  const elimExisting = (tournament.matches||[]).filter(m => m.status === 'A definir' && m.phase === 'elimination');

  elimShouldExist.forEach(s => {
    // Encontrar match existente: mesmo draw + mesmo drawMatchIdx
    let existing = elimExisting.find(m => m.drawName === s.drawName && m.drawMatchIdx === s.drawMatchIdx);
    // Fallback: mesmo draw + mesmo round + mesmo roundName (pra placeholders sem drawMatchIdx correto)
    if (!existing) {
      existing = elimExisting.find(m => m.drawName === s.drawName && m.round === s.round && m.roundName === s.roundName && !m._updated);
    }
    if (existing) {
      existing.player1 = s.player1 || '';
      existing.player2 = s.player2 || '';
      existing.player1Display = s.player1Display || s.player1 || existing.player1Display || 'A definir';
      existing.player2Display = s.player2Display || s.player2 || existing.player2Display || 'A definir';
      existing.isDefinida = !!(s.player1 && s.player2);
      if (existing.isDefinida) existing.status = 'Pendente';
      if (s.roundName) existing.roundName = s.roundName;
      existing.drawMatchIdx = s.drawMatchIdx; // atualizar idx
      existing._updated = true; // marcar pra nao reusar no fallback
    }
  });
  // Limpar flag temporaria
  elimExisting.forEach(m => delete m._updated);

  // Verificar quais ja existem nas partidas (usar drawMatchIdx como chave primaria)
  const existingByIdx = new Set((tournament.matches || []).filter(m=>m.drawMatchIdx!=null).map(m => `${m.drawName}|${m.drawMatchIdx}`));
  const existingByKey = new Set((tournament.matches || []).map(m => `${m.drawName}|${m.round}|${m.player1}|${m.player2}`));

  // Encontrar novos jogos
  let added = 0;
  shouldExist.forEach(s => {
    // Verificar por drawMatchIdx primeiro, depois por chave tradicional
    if (s.drawMatchIdx!=null && existingByIdx.has(`${s.drawName}|${s.drawMatchIdx}`)) return;
    const key = `${s.drawName}|${s.round}|${s.player1}|${s.player2}`;
    if (existingByKey.has(key)) return;
    // Verificar se ja existe um match neste drawName+round (evitar duplicatas de rounds futuros)
    const existingInRound = tournament.matches.find(m=>m.drawName===s.drawName&&m.round===s.round&&m.drawMatchIdx===s.drawMatchIdx);
    if (existingInRound) return;

    const def = !!(s.player1 && s.player2);
    // Usar roundName do placeholder se disponivel, senao calcular
    let rn = s.roundName || '';
    if (!rn) {
      const totalR = Math.max(...(tournament.draws.find(d => d.name === s.drawName)?.matches || []).map(x => x.round) || [1]);
      rn = s.round === totalR ? 'Final' : s.round === totalR - 1 ? 'Semifinal' : `R${s.round}`;
    }

    tournament.matches.push({
      drawId: s.drawId, drawName: s.drawName, drawMatchIdx: s.drawMatchIdx, event: s.event, round: s.round, roundName: rn,
      player1: s.player1, player2: s.player2,
      player1Display: s.player1Display || s.player1 || 'A definir', player2Display: s.player2Display || s.player2 || 'A definir',
      isDefinida: def, score: '', court: '', time: '', umpire: '',
      status: def ? 'Pendente' : 'A definir', phase: s.phase || ''
    });
    added++;
  });

  // Renumerar e gerar horarios para os novos
  tournament.matches.forEach((m, i) => { m.id = (i + 1).toString(); m.num = i + 1; });

  // Gerar horarios para partidas sem horario
  const semHorario = tournament.matches.filter(m => !m.time && m.isDefinida !== false && m.status !== 'A definir');
  if (semHorario.length) assignAutoTimes(semHorario);

  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderMatches();

  if (added > 0) {
    showToast(`${added} nova(s) partida(s) adicionada(s) e distribuida(s)!`, 'info');
  } else {
    showToast('Partidas ja estao sincronizadas!', 'info');
  }
}

async function regenerateSchedule() {
  if(!tournament?.matches?.length&&!tournament?.draws?.length){showToast('Sem partidas','warning');return;}
  if(!confirm('Regenerar todos os horarios e renumerar jogos? Jogos finalizados e em quadra serao preservados.'))return;

  // Sincronizar matches com draws (inclui placeholders de eliminatoria)
  await syncMatchesWithDraws();

  // Limpar horarios dos jogos pendentes
  tournament.matches.forEach(m=>{
    if(m.status!=='Finalizada'&&m.status!=='WO'&&m.status!=='Em Quadra'&&m.status!=='Desistencia'&&m.status!=='Desqualificacao'){
      m.time='';
    }
  });

  ensureDayScheduleDraws();
  const hasDays=tournament.daySchedule?.length>0;

  if(hasDays){
    // Atribuir horarios POR DIA (cada dia comeca do horario configurado)
    const dayDraws=[];
    tournament.daySchedule.forEach(day=>{dayDraws.push(new Set(day.draws||[]));});

    // Separar matches por dia
    const matchesByDay=tournament.daySchedule.map(()=>[]);
    const orphans=[];
    tournament.matches.forEach(m=>{
      let assigned=false;
      dayDraws.forEach((s,i)=>{if(s.has(m.drawName)&&!assigned){matchesByDay[i].push(m);assigned=true;}});
      if(!assigned)orphans.push(m);
    });

    // Atribuir horarios para cada dia separadamente
    const slotDur = (tournament.matchDuration||30) + (tournament.restMinBetweenGames||20);
    matchesByDay.forEach((dayMatches,i)=>{
      if(!dayMatches.length)return;
      const day=tournament.daySchedule[i];
      const origStart=tournament.startTime, origEnd=tournament.endTime;
      const origBS=tournament.breakStart, origBE=tournament.breakEnd;
      tournament.startTime=day.startTime||origStart||'08:00';
      tournament.endTime=day.endTime||origEnd||'18:00';
      tournament.breakStart=day.breakStart||origBS||'12:00';
      tournament.breakEnd=day.breakEnd||origBE||'13:30';

      // Separar: jogos definidos (grupo+outros) vs eliminatoria "A definir"
      const definidos = dayMatches.filter(m => m.status !== 'A definir');
      const elimAdefs = dayMatches.filter(m => m.status === 'A definir');

      // Atribuir horarios aos definidos primeiro
      assignAutoTimes(definidos);

      // Eliminatoria "A definir": horario APOS ultimo jogo de grupo da mesma categoria
      // Respeitando limite de quadras por slot
      const dayBS = timeToMin(tournament.breakStart||'12:00');
      const dayBE = timeToMin(tournament.breakEnd||'13:30');
      const dayStart = timeToMin(tournament.startTime||'08:00');
      const dayEnd = timeToMin(tournament.endTime||'18:00');
      const dayCourts = tournament.courts||4;

      // Gerar slots do dia
      const daySlots = [];
      let dsCur = dayStart;
      while (dsCur + (tournament.matchDuration||30) <= dayEnd) {
        if (dsCur >= dayBS && dsCur < dayBE) { dsCur = dayBE; continue; }
        if (dsCur + (tournament.matchDuration||30) > dayBS && dsCur < dayBS) { dsCur = dayBE; continue; }
        daySlots.push(dsCur);
        dsCur += slotDur;
      }
      // Contar ocupacao dos slots (jogos definidos ja atribuidos)
      const dsCount = new Array(daySlots.length).fill(0);
      definidos.forEach(m => { if(m.time){ const si=daySlots.indexOf(timeToMin(m.time)); if(si>=0) dsCount[si]++; }});

      elimAdefs.sort((a,b) => a.drawName===b.drawName ? (a.round||0)-(b.round||0) : 0);
      elimAdefs.forEach(m => {
        const sameDrawGroupTimes = definidos.filter(d => d.drawName === m.drawName && d.time).map(d => timeToMin(d.time));
        const sameDrawAdefTimes = elimAdefs.filter(d => d.drawName === m.drawName && d.time && d !== m).map(d => timeToMin(d.time));
        const allTimes = [...sameDrawGroupTimes, ...sameDrawAdefTimes];
        if (allTimes.length) {
          const lastMin = Math.max(...allTimes);
          // Encontrar proximo slot APOS o ultimo jogo da categoria que tenha vaga
          for (let si = 0; si < daySlots.length; si++) {
            if (daySlots[si] <= lastMin) continue; // deve ser APOS
            if (dsCount[si] < dayCourts) {
              m.time = minToTime(daySlots[si]);
              dsCount[si]++;
              break;
            }
          }
        }
      });

      tournament.startTime=origStart;tournament.endTime=origEnd;
      tournament.breakStart=origBS;tournament.breakEnd=origBE;
    });

    // Orfaos (sem dia): atribuir com config padrao
    if(orphans.length)assignAutoTimes(orphans);

    // Ordenar: dia -> horario
    tournament.matches.sort((a,b)=>{
      let dayA=dayDraws.length,dayB=dayDraws.length;
      dayDraws.forEach((s,i)=>{if(s.has(a.drawName))dayA=i;if(s.has(b.drawName))dayB=i;});
      if(dayA!==dayB)return dayA-dayB;
      const ta=a.time?timeToMin(a.time):9999;
      const tb=b.time?timeToMin(b.time):9999;
      if(ta!==tb)return ta-tb;
      return(a.num||0)-(b.num||0);
    });
  } else {
    // Sem daySchedule: separar definidos vs eliminatoria "A definir"
    const definidos = tournament.matches.filter(m => m.status !== 'A definir');
    const elimAdefs = tournament.matches.filter(m => m.status === 'A definir');
    assignAutoTimes(definidos);
    // Eliminatoria: apos ultimo jogo de grupo da mesma categoria (respeitando limite de quadras)
    const slotDurNoDay = (tournament.matchDuration||30) + (tournament.restMinBetweenGames||20);
    const noBrS = timeToMin(tournament.breakStart||'12:00');
    const noBrE = timeToMin(tournament.breakEnd||'13:30');
    const ndStart = timeToMin(tournament.startTime||'08:00');
    const ndEnd = timeToMin(tournament.endTime||'18:00');
    const ndCourts = tournament.courts||4;
    // Gerar slots
    const ndSlots = [];
    let ndCur = ndStart;
    while (ndCur + (tournament.matchDuration||30) <= ndEnd) {
      if (ndCur >= noBrS && ndCur < noBrE) { ndCur = noBrE; continue; }
      if (ndCur + (tournament.matchDuration||30) > noBrS && ndCur < noBrS) { ndCur = noBrE; continue; }
      ndSlots.push(ndCur);
      ndCur += slotDurNoDay;
    }
    const ndCount = new Array(ndSlots.length).fill(0);
    definidos.forEach(m => { if(m.time){ const si=ndSlots.indexOf(timeToMin(m.time)); if(si>=0) ndCount[si]++; }});
    elimAdefs.sort((a,b) => a.drawName===b.drawName ? (a.round||0)-(b.round||0) : 0);
    elimAdefs.forEach(m => {
      const sameDrawGroupTimes = definidos.filter(d => d.drawName === m.drawName && d.time).map(d => timeToMin(d.time));
      const sameDrawAdefTimes = elimAdefs.filter(d => d.drawName === m.drawName && d.time && d !== m).map(d => timeToMin(d.time));
      const allTimes = [...sameDrawGroupTimes, ...sameDrawAdefTimes];
      if (allTimes.length) {
        const lastMin = Math.max(...allTimes);
        for (let si = 0; si < ndSlots.length; si++) {
          if (ndSlots[si] <= lastMin) continue;
          if (ndCount[si] < ndCourts) {
            m.time = minToTime(ndSlots[si]);
            ndCount[si]++;
            break;
          }
        }
      }
    });
    tournament.matches = [...definidos, ...elimAdefs];
    tournament.matches.sort((a,b)=>{
      const ta=a.time?timeToMin(a.time):9999;
      const tb=b.time?timeToMin(b.time):9999;
      if(ta!==tb)return ta-tb;
      return(a.num||0)-(b.num||0);
    });
  }

  // Atribuir numeros sequenciais
  tournament.matches.forEach((m,i)=>{m.id=(i+1).toString();m.num=i+1;});
  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderSchedule();
  const total=tournament.matches.filter(m=>m.time).length;
  showToast(`Horarios regenerados e renumerados! ${total} jogos.`);
}

// Re-sincronizar estado das draws com tournament.matches
// repropagateAllResults extraida pra src/js/modules/bracket-reconcile.js (issue #14.M)
// === MATCHES ===
// renderMatches + filterMatches + filterFinished + setMatchesTab
// + renderFinishedMatches + renderUmpireStats + renderCourtsPanel
// extraidos pra src/js/modules/matches-ui.js (issue #14.G parcial).

async function handleRealtimeScoreUpdate(data){
  try {
    window.__fabdStats.realtimeUpdates++;
    if(!data||!data.match_id||!tournament?.matches?.length)return;
    const matchId=data.match_id||'';
    // Buscar match pelo ID estavel (drawName + players) ou fallback por match_num
    let m=null;
    // Tentar encontrar pelo match_id que contem drawName e players
    for(const mx of tournament.matches){
      const draw=(mx.drawName||'').replace(/[^a-zA-Z0-9]/g,'');
      const p1=(mx.player1||'').replace(/[^a-zA-Z0-9]/g,'').substring(0,20);
      const p2=(mx.player2||'').replace(/[^a-zA-Z0-9]/g,'').substring(0,20);
      const stableId=`${tournament.id}_${draw}_${p1}_${p2}`;
      if(matchId===stableId){m=mx;break;}
    }
    // Fallback: por match_num (para compatibilidade com dados antigos)
    if(!m){
      const parts=matchId.split('_');
      const matchNum=parseInt(parts[parts.length-1]);
      if(matchNum)m=tournament.matches.find(x=>x.num===matchNum);
    }
    if(!m)return;
    // Deduplicacao: ignorar updates com timestamp igual ou anterior ao ultimo processado
    const updateKey = data.match_id;
    const updateTs = data.updated_at;
    if (lastScoreUpdateTimestamp[updateKey] && lastScoreUpdateTimestamp[updateKey] >= updateTs) return;
    lastScoreUpdateTimestamp[updateKey] = updateTs;
    // Se jogo ja foi finalizado localmente, ignorar
    if(m.status==='Finalizada'||m.status==='WO')return;
    // Se arbitro finalizou (winner+final_score), aceita independente do status local —
    // cobre caso onde organizador nao marcou "Em Quadra" no Planner mas o referee
    // pegou e finalizou direto. Antes desse fix, finalizacao ficava presa local.
    const _isFinalUpdate = !!(data.winner && data.final_score);
    if(m.status!=='Em Quadra' && !_isFinalUpdate)return;

    // Atualizar placar ao vivo para exibicao
    const s1=data.score_p1||0, s2=data.score_p2||0, set=data.current_set||1;
    m.liveScore=`${s1} - ${s2} (Set ${set})`;
    // Sets anteriores para exibicao
    const setsP1=data.sets_p1||[],setsP2=data.sets_p2||[];
    m.liveSets=setsP1.map((v,i)=>v+'-'+(setsP2[i]||0));
    // Atualizar arbitro em tempo real
    if(data.umpire_name)m.umpire=data.umpire_name;

    // Se arbitro finalizou o jogo (winner definido)
    if(data.winner&&data.final_score){
      m.score=data.final_score;
      m.status='Finalizada';
      m.winner=data.winner;
      m.finishedAt=new Date().toISOString();
      m.liveScore='';
      try{propagateResultToDraws(m);}catch(e){console.warn('Erro ao propagar resultado:',e);showToast('Aviso: resultado recebido mas propagacao na chave falhou','warning');}
      await window.api.saveTournament(tournament);
      // Supabase ja sincronizado acima, apenas log
      showToast(`Jogo #${m.num} finalizado pelo arbitro! ${m.player1} vs ${m.player2}: ${m.score}`);
    }

    // Coalesce + defer-when-typing: nao re-renderiza durante digitacao
    scheduleRender('courts', renderCourtsPanel);
    scheduleRender('matches', renderMatches);
  } catch(e) { console.error('[RealtimeScoreUpdate] Error:', e.message); }
}

function getCourtOptions(sel) {
  const nc=tournament?.courts||4,cn=tournament?.courtNames||[];let h='';
  for(let i=0;i<nc;i++){const n=cn[i]||`Quadra ${i+1}`;h+=`<option value="${esc(n)}"${sel===n?' selected':''}>${esc(n)}</option>`;}
  return h;
}

function getUmpireOptions(sel) {
  // v4.9: se o arbitro veio via Referee (Google login) e nao esta pre-cadastrado
  // localmente, ainda assim mostrar o nome no select. Antes ficava "-" porque o
  // <option value=sel> nao existia. Agora adiciona option dinamica pra preservar.
  let h='';const umps=loadUmpires();
  const knownNames = new Set(umps.map(u => u.name));
  umps.forEach(u=>{h+=`<option value="${esc(u.name)}"${sel===u.name?' selected':''}>${esc(u.name)}</option>`;});
  if (sel && !knownNames.has(sel)) {
    // Arbitro vindo do Referee — adiciona como option dinamica selecionada
    h += `<option value="${esc(sel)}" selected>${esc(sel)}</option>`;
  }
  return h;
}

async function assignCourt(idx, value) {
  const m=tournament.matches[idx]; if(!m)return;
  if(value){
    // Verificar se ja tem jogo nesta quadra
    const courtOccupied = tournament.matches.find(x => x.status === 'Em Quadra' && x.court === value && x.id !== m.id);
    if (courtOccupied) {
      showToast(`${value} ja tem um jogo! (Jogo #${courtOccupied.num}: ${courtOccupied.player1} vs ${courtOccupied.player2})`, 'warning');
      renderMatches(); return;
    }
    // Verificar se jogador ja esta em quadra (incluindo duplas)
    const inC=tournament.matches.filter(x=>x.status==='Em Quadra'&&x.id!==m.id);
    const pIC=new Set();
    const pICDetail={};
    inC.forEach(x=>{
      [x.player1,x.player2].forEach(name=>{
        if(!name)return;
        name.split('/').forEach(n=>{const t=n.trim();pIC.add(t);pICDetail[t]={num:x.num,court:x.court};});
      });
    });
    // Verificar cada jogador individual do jogo atual
    const myPlayers=[];
    [m.player1,m.player2].forEach(name=>{if(name)name.split('/').forEach(n=>myPlayers.push(n.trim()));});
    for(const p of myPlayers){
      if(pIC.has(p)){const d=pICDetail[p];showToast(`${p} ja em quadra! (Jogo #${d.num} - ${d.court})`,'warning');renderMatches();return;}
    }
  }
  m.court=value;
  const wasEmQuadra = m.status === 'Em Quadra';
  if(value&&m.status==='Pendente'){m.status='Em Quadra';if(!m.startedAt)m.startedAt=new Date().toISOString();}
  if(!value&&m.status==='Em Quadra'){m.status='Pendente';m.startedAt=undefined;}
  await window.api.saveTournament(tournament);
  // Sincronizar com Supabase
  try{
    if(value&&m.status==='Em Quadra'){
      // Ativar Realtime ao colocar primeiro jogo em quadra
      const emQuadraCount = tournament.matches.filter(x => x.status === 'Em Quadra').length;
      if (emQuadraCount === 1) {
        await window.api.supabaseSubscribe(tournament.id);
        console.log('Realtime ativado (primeiro jogo em quadra)');
      }
      prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
      const r=await window.api.supabaseUpsertMatch(tournament.id,m);
      // r === 'ok' | 'network' | 'permanent' (v4.0)
      if(r==='ok')window.__fabdStats.upsertMatchOk++;
      else if(r==='network'){window.__fabdStats.upsertMatchNetwork++;showToast('Verifique sua conexão com a internet. O jogo será sincronizado automaticamente quando voltar.','warning');}
      else {window.__fabdStats.upsertMatchPermanent++;showToast('Erro de sincronização. Verifique sua sessão (faça login novamente se necessário).','error');}
    }
    else if(!value){
      const r = await window.api.supabaseRemoveFromCourt(tournament.id,m);
      if (r==='ok') window.__fabdStats.removeFromCourtOk++;
      else { window.__fabdStats.removeFromCourtFail++;
        if (r==='network') showToast('Verifique sua conexão com a internet. A remoção será sincronizada automaticamente.','warning');
        else showToast('Erro ao remover da quadra. Verifique sua sessão.','error');
      }
      prepareRankingsForSync();
      window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
      // Desativar Realtime se nao tem mais jogos em quadra
      const emQuadraCount = tournament.matches.filter(x => x.status === 'Em Quadra').length;
      if (emQuadraCount === 0) {
        window.api.supabaseUnsubscribe();
        console.log('Realtime desativado (nenhum jogo em quadra)');
      }
    }
  }catch(e){console.warn('Supabase sync:',e);showToast('Aviso: sincronizacao online falhou','warning');}
  _registerEmQuadraIds(); // v3.97: notifica main pra reconciliacao
  renderCourtsPanel();renderMatches();
}

async function updateMatchField(idx, field, value) {
  if(!tournament?.matches?.[idx])return;
  tournament.matches[idx][field]=value;
  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
}

function showScoreModal(idx) {
  const m=tournament.matches[idx];if(!m)return;scoringMatchIdx=idx;
  document.getElementById('score-p1').textContent=m.player1;
  document.getElementById('score-p2').textContent=m.player2;
  document.getElementById('score-winner').value='';
  document.getElementById('score-status').value='Finalizada';
  const sets=tournament?.scoring?.sets||3;
  // Atualizar select de vencedor com nomes dos jogadores
  const wSel=document.getElementById('score-winner');
  wSel.innerHTML=`<option value="">Selecione...</option><option value="1">${esc(m.player1)}</option><option value="2">${esc(m.player2)}</option>`;
  const c=document.getElementById('score-sets-container');let h='';
  h+=`<div class="score-row score-row-header"><div class="score-cell-name" style="color:var(--fabd-blue);font-weight:700">${esc(m.player1)}</div><div class="score-cell-label"></div><div class="score-cell-name" style="color:var(--fabd-red);font-weight:700">${esc(m.player2)}</div></div>`;
  for(let s=1;s<=sets;s++){
    h+=`<div class="score-row"><div class="score-cell"><input type="number" id="set-${s}-p1" min="0" max="30" value="" placeholder="0" data-action="autoDetectWinner" data-event="change input"></div><div class="score-cell-label">SET ${s}</div><div class="score-cell"><input type="number" id="set-${s}-p2" min="0" max="30" value="" placeholder="0" data-action="autoDetectWinner" data-event="change input"></div></div>`;
  }
  c.innerHTML=h;openModal('modal-score');
}

async function saveScore() {
  try{
    const m=tournament.matches[scoringMatchIdx];if(!m)return;
    const status=document.getElementById('score-status').value,winner=document.getElementById('score-winner').value;
    if(status==='WO'||status==='Desqualificacao'){if(!winner){alert('Selecione vencedor');return;}m.score=status==='WO'?'W.O.':'DSQ';m.status=status;m.winner=parseInt(winner);m.finishedAt=new Date().toISOString();propagateResultToDraws(m);await window.api.saveTournament(tournament);prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);try{await window.api.supabaseFinalizeMatch(tournament.id,m,{winner:m.winner,final_score:m.score,umpire_name:m.umpire||''});}catch(e){console.warn('finalizeMatch:',e);}_registerEmQuadraIds();if(!(tournament.matches||[]).some(x=>x.status==='Em Quadra')){window.api.supabaseUnsubscribe();console.log('Realtime desativado');}closeModal('modal-score');renderMatches();showToast('Resultado registrado');return;}
    if(!winner){alert('Selecione vencedor');return;}
    const numSets=tournament?.scoring?.sets||3,pts=tournament?.scoring?.points||21,maxP=tournament?.scoring?.maxPoints||30;
    let scores=[];
    for(let s=1;s<=numSets;s++){const p1=parseInt(document.getElementById(`set-${s}-p1`)?.value),p2=parseInt(document.getElementById(`set-${s}-p2`)?.value);if(isNaN(p1)||isNaN(p2))continue;const v=validateBadmintonSet(p1,p2,pts,maxP);if(!v.valid){alert(`Set ${s}: ${v.error}`);return;}scores.push(`${p1}-${p2}`);}
    if(!scores.length&&status!=='Desistencia'){alert('Insira placar');return;}
    m.score=scores.join(' / ')||(status==='Desistencia'?'RET':'');m.status=status;m.winner=parseInt(winner);m.finishedAt=new Date().toISOString();
    propagateResultToDraws(m);
    await window.api.saveTournament(tournament);prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    // Sincroniza Supabase: live_matches.status='Finalizada' + live_scores.winner — site Ao Vivo e Referee param de mostrar
    try {
      const setsP1=[],setsP2=[];let setsWonP1=0,setsWonP2=0;
      for(const sc of scores){const [a,b]=sc.split('-').map(n=>parseInt(n));setsP1.push(isNaN(a)?0:a);setsP2.push(isNaN(b)?0:b);if(!isNaN(a)&&!isNaN(b)){if(a>b)setsWonP1++;else if(b>a)setsWonP2++;}}
      const last=scores.length?scores[scores.length-1].split('-').map(n=>parseInt(n)):[0,0];
      await window.api.supabaseFinalizeMatch(tournament.id,m,{
        winner:m.winner,final_score:m.score,umpire_name:m.umpire||'',
        current_set:scores.length||1,score_p1:last[0]||0,score_p2:last[1]||0,
        sets_p1:setsP1,sets_p2:setsP2,sets_won_p1:setsWonP1,sets_won_p2:setsWonP2,
      });
    } catch(e) { console.warn('finalizeMatch:',e); }
    // Desativar Realtime se nao tem mais jogos em quadra
    _registerEmQuadraIds(); // v3.97
    if(!(tournament.matches||[]).some(x=>x.status==='Em Quadra')){window.api.supabaseUnsubscribe();console.log('Realtime desativado (nenhum jogo em quadra)');}
    closeModal('modal-score');renderMatches();showToast('Placar salvo!');
  }catch(e){console.error(e);showToast('Erro: '+e.message,'error');}
}

// propagateResultToDraws extraida pra src/js/modules/bracket-mutators.js (issue #14.L)
function autoDetectWinner(){
  const numSets=tournament?.scoring?.sets||3;
  const pts=tournament?.scoring?.points||21;
  const needed=Math.ceil(numSets/2);
  let w1=0,w2=0;
  for(let s=1;s<=numSets;s++){
    const v1=parseInt(document.getElementById(`set-${s}-p1`)?.value);
    const v2=parseInt(document.getElementById(`set-${s}-p2`)?.value);
    if(isNaN(v1)||isNaN(v2)||v1===v2)continue;
    if(v1>=pts&&v1>v2)w1++;
    else if(v2>=pts&&v2>v1)w2++;
  }
  const sel=document.getElementById('score-winner');
  if(w1>=needed)sel.value='1';
  else if(w2>=needed)sel.value='2';
}

async function resetMatch(idx){
  const m=tournament.matches[idx];if(!m)return;
  if(!confirm(`Desfazer resultado do jogo #${m.num}?`))return;
  // Reverter avanço na draw antes de limpar o winner
  reverseResultInDraws(m);
  m.score='';m.status='Pendente';m.winner=undefined;m.court='';m.startedAt=undefined;m.finishedAt=undefined;m.liveScore='';m.liveSets=[];
  // Renderizar primeiro (UI responsiva), salvar depois
  renderMatches();renderFinishedMatches();showToast('Jogo resetado');
  await window.api.saveTournament(tournament);
  try{await window.api.supabaseRemoveFromCourt(tournament.id,m);}catch(e){console.warn('Supabase cleanup:',e);}
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
}

// reverseResultInDraws extraida pra src/js/modules/bracket-mutators.js (issue #14.L)
function validateBadmintonSet(p1,p2,target,max) {
  const hi=Math.max(p1,p2),lo=Math.min(p1,p2);
  if(p1<0||p2<0)return{valid:false,error:'Negativo'};
  if(hi===target&&hi-lo>=2)return{valid:true};
  if(hi>target&&hi<=max&&hi-lo===2)return{valid:true};
  if(hi===max&&lo>=target-1)return{valid:true};
  if(hi<target)return{valid:true};
  return{valid:false,error:`Placar ${p1}-${p2} invalido`};
}

// === SCHEDULE ===
// renderSchedule + renderScheduleMatch extraidos pra
// src/js/modules/schedule.js (issue #14.H).

function showDrawWizard() {
  if(!tournament)return;
  if(!players.length){showToast('Cadastre jogadores primeiro','warning');return;}
  wizHasProfile=!!tournament.gameProfileId&&!!gameProfiles.find(p=>p.id===tournament.gameProfileId);
  wizSteps=wizHasProfile?[0,2,3]:[0,1,2,3];
  wizardStep=0;
  document.getElementById('wiz-modality').value='SM';
  document.getElementById('wiz-category').value='Principal';
  document.getElementById('wiz-type').value='Eliminatoria';
  document.getElementById('wiz-seeds').value='0';
  document.getElementById('wiz-consolation').checked=false;
  wizGenerateName();wizUpdateStepIndicators();wizShowCurrentPage();
  openModal('modal-draw-wizard');
}

function wizGenerateName() {
  const mod=document.getElementById('wiz-modality').value,cat=document.getElementById('wiz-category').value;
  document.getElementById('wiz-name').value=`${mod} ${cat}`;
  const map={SM:'SM',SF:'SF',DM:'DM',DF:'DF',DX:'MX'};
  document.getElementById('wiz-event').value=map[mod]||mod;
  wizUpdateEventInfo();
}

function wizUpdateStepIndicators() {
  document.querySelectorAll('.wizard-step').forEach((s,i)=>{
    if(wizHasProfile&&i===1)s.style.display='none';else s.style.display='';
    const si=wizSteps.indexOf(parseInt(s.dataset.step));
    s.classList.toggle('active',si===wizardStep);s.classList.toggle('completed',si>=0&&si<wizardStep);
  });
}

function wizShowCurrentPage() {
  const cp=wizSteps[wizardStep];
  document.querySelectorAll('.wizard-page').forEach((p,i)=>p.classList.toggle('active',i===cp));
  document.getElementById('wiz-btn-back').style.display=wizardStep>0?'':'none';
  document.getElementById('wiz-btn-next').style.display=wizardStep<wizSteps.length-1?'':'none';
  document.getElementById('wiz-btn-finish').style.display=wizardStep===wizSteps.length-1?'':'none';
}

function wizNext() {
  try{
    const cp=wizSteps[wizardStep];
    if(cp===0){
      const code=document.getElementById('wiz-event').value;
      const mod=document.getElementById('wiz-modality').value;
      const cat=document.getElementById('wiz-category').value;
      // Contar inscritos nesta combinacao
      const key=`${mod} ${cat}`;
      const count=players.filter(p=>(p.inscriptions||[]).some(i=>i.key===key)).length;
      if(count<2){showToast(`Menos de 2 inscritos em ${key}. Adicione categorias nos jogadores.`,'warning');return;}
    }
    if(cp===0&&wizHasProfile){
      const mod=document.getElementById('wiz-modality').value,cat=document.getElementById('wiz-category').value;
      const key=`${mod} ${cat}`;
      const count=players.filter(p=>(p.inscriptions||[]).some(i=>i.key===key)).length;
      const autoType=getDrawTypeForCount(tournament,count);
      if(autoType)document.getElementById('wiz-type').value=autoType;
    }
    const np=wizSteps[wizardStep+1];
    if(np===2)wizUpdateConfig();
    if(np===3)wizUpdateSummary();
    if(wizardStep<wizSteps.length-1){wizardStep++;wizUpdateStepIndicators();wizShowCurrentPage();}
  }catch(e){console.error(e);showToast('Erro: '+e.message,'error');}
}

function wizBack(){if(wizardStep>0){wizardStep--;wizUpdateStepIndicators();wizShowCurrentPage();}}

function wizUpdateEventInfo() {
  const mod=document.getElementById('wiz-modality').value,cat=document.getElementById('wiz-category').value;
  const key=`${mod} ${cat}`;
  const count=players.filter(p=>(p.inscriptions||[]).some(i=>i.key===key)).length;
  let info=`<strong>${count}</strong> jogador(es) inscrito(s) em <strong>${key}</strong>`;
  if(wizHasProfile){
    const autoType=getDrawTypeForCount(tournament,count);
    const profile=gameProfiles.find(p=>p.id===tournament.gameProfileId);
    if(autoType&&profile)info+=`<br><br><div style="background:#D1FAE5;padding:10px;border-radius:6px;color:#065F46"><strong>&#10003; Sistema: ${esc(autoType)}</strong> (perfil: ${esc(profile.name)})</div>`;
  } else if(count>=2) {
    info+=`<br><br><div style="background:#FEF3C7;padding:10px;border-radius:6px;color:#92400E">&#9888; Sem sistema configurado. Escolha no proximo passo.</div>`;
  }
  document.getElementById('wiz-event-info').innerHTML=info;
}

function wizUpdateTypeInfo(){const t=document.getElementById('wiz-type').value;const i={'Eliminatoria':'Mata-mata','Todos contra Todos':'Round robin','Grupos + Eliminatoria':'Grupos + mata-mata'};document.getElementById('wiz-type-info').textContent=i[t]||'';}

function wizUpdateConfig() {
  const t=document.getElementById('wiz-type').value,mod=document.getElementById('wiz-modality').value,cat=document.getElementById('wiz-category').value;
  const key=`${mod} ${cat}`;
  const count=players.filter(p=>(p.inscriptions||[]).some(i=>i.key===key)).length;
  document.getElementById('wiz-config-elim').style.display=t==='Eliminatoria'?'':'none';
  document.getElementById('wiz-config-rr').style.display=t==='Todos contra Todos'?'':'none';
  document.getElementById('wiz-config-groups').style.display=t==='Grupos + Eliminatoria'?'':'none';
  const sizes=document.getElementById('wiz-draw-size');sizes.innerHTML='';
  [4,8,16,32,64].forEach(s=>{if(s>=count){const o=document.createElement('option');o.value=s;o.textContent=`${s} jogadores${s>count?` (${s-count} bye${s-count>1?'s':''})`:''}`;sizes.appendChild(o);}});
  if(!sizes.options.length){const o=document.createElement('option');o.value=count;o.textContent=`${count}`;sizes.appendChild(o);}
  document.getElementById('wiz-rr-info').textContent=`${count} jogadores = ${count*(count-1)/2} partidas`;
}

function wizUpdateSummary() {
  const name=document.getElementById('wiz-name').value,mod=document.getElementById('wiz-modality'),cat=document.getElementById('wiz-category');
  const type=document.getElementById('wiz-type').value,seeds=document.getElementById('wiz-seeds').value;
  let det='';
  if(type==='Eliminatoria')det=`Tamanho: ${document.getElementById('wiz-draw-size').value}`;
  else if(type==='Todos contra Todos'){const key=`${mod.value} ${cat.value}`;const c=players.filter(p=>(p.inscriptions||[]).some(i=>i.key===key)).length;det=`${c} jogadores, ${c*(c-1)/2} partidas`;}
  else det=`${document.getElementById('wiz-num-groups').value} grupos, ${document.getElementById('wiz-qualifiers').value} classificados/grupo`;
  const pi=wizHasProfile?'<br><span style="color:#10B981">&#10003; Sistema automatico</span>':'';
  document.getElementById('wiz-summary').innerHTML=`<strong>Nome:</strong> ${esc(name)}<br><strong>Tipo:</strong> ${esc(type)}${pi}<br><strong>Detalhes:</strong> ${det}<br><strong>Seeds:</strong> ${seeds}`;
}

async function wizFinish() {
  try{
    const name=gv('wiz-name'),mod=document.getElementById('wiz-modality').value,cat=document.getElementById('wiz-category').value;
    const type=document.getElementById('wiz-type').value;
    const key=`${mod} ${cat}`;
    const drawPlayers=players.filter(p=>(p.inscriptions||[]).some(i=>i.key===key)).map(p=>`${p.firstName} ${p.lastName}`);
    if(drawPlayers.length<2){showToast('Menos de 2 inscritos','warning');return;}
    if(!tournament.draws)tournament.draws=[];
    const drawObj={id:Date.now().toString(),name,event:mod,category:cat,type,players:drawPlayers,matches:[],seeds:parseInt(document.getElementById('wiz-seeds').value)||0};
    if(type==='Grupos + Eliminatoria'){
      drawObj.numGroups=parseInt(document.getElementById('wiz-num-groups').value)||2;
      drawObj.groupQualifiers=parseInt(document.getElementById('wiz-qualifiers').value)||2;
    }
    tournament.draws.push(drawObj);
    await window.api.saveTournament(tournament);
    closeModal('modal-draw-wizard');renderDraws();showToast('Chave criada!');
  }catch(e){console.error(e);showToast('Erro: '+e.message,'error');}
}

// === SETTINGS ===
function setSettingsTab(el, panelId) {
  document.querySelectorAll('#settings-tabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['settings-general','settings-game','settings-umpires','settings-categories','settings-rankings'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=id===panelId?'':'none';});
  if(panelId==='settings-game')renderGameProfiles();
  if(panelId==='settings-umpires')renderUmpires();
  if(panelId==='settings-categories')renderCategoriesInfo();
  if(panelId==='settings-rankings')renderScoringTables();
}
const APP_VERSION='4.88';

async function checkForUpdates(){
  const statusEl=document.getElementById('update-status');
  statusEl.textContent='Verificando...';statusEl.style.color='var(--fabd-gray-500)';
  try{
    const data=await window.api.checkUpdate();
    if(data.error)throw new Error(data.error);
    const latestVersion=(data.tag_name||'').replace('v','');
    if(latestVersion&&isNewerVersion(latestVersion,APP_VERSION)){
      const exeAsset=(data.assets||[]).find(a=>a.name.endsWith('.exe'));
      statusEl.innerHTML=`<span style="color:#F59E0B;font-weight:600">Nova versao disponivel: v${esc(latestVersion)}</span>`;
      if(exeAsset){
        statusEl.innerHTML+=` <button class="btn btn-sm btn-primary" style="margin-left:8px" data-action="api.openExternal" data-arg-1="${esc(exeAsset.browser_download_url)}">Baixar v${esc(latestVersion)}</button>`;
      }
    } else {
      statusEl.innerHTML=`<span style="color:#10B981;font-weight:600">&#10003; App atualizado (v${APP_VERSION})</span>`;
    }
  }catch(e){
    statusEl.innerHTML=`<span style="color:#DC2626">Erro ao verificar: ${esc(e.message)}</span>`;
  }
}

async function saveSettings(){
  if(!tournament) tournament={};
  if(!tournament.settings) tournament.settings={};
  tournament.settings.orgName=document.getElementById('cfg-org-name')?.value||'';
  tournament.settings.orgAbbr=document.getElementById('cfg-org-abbr')?.value||'';
  tournament.settings.city=document.getElementById('cfg-city')?.value||'';
  tournament.settings.state=document.getElementById('cfg-state')?.value||'';
  tournament.settings.email=document.getElementById('cfg-email')?.value||'';
  await window.api.saveTournament(tournament);
  showToast('Salvo!');
}

// === TOURNAMENT CONFIG ===
function showTournamentConfig(){
  if(!tournament)return;
  document.getElementById('tc-tournament-name').textContent=tournament.name;
  document.querySelectorAll('#tc-tabs .tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('tc-tab-system').style.display='';
  document.getElementById('tc-tab-scoring').style.display='none';
  document.getElementById('tc-tab-courts').style.display='none';
  document.getElementById('tc-tab-schedule').style.display='none';
  const rkPanel=document.getElementById('tc-tab-ranking');if(rkPanel)rkPanel.style.display='none';
  const cbPanel=document.getElementById('tc-tab-clubes');if(cbPanel)cbPanel.style.display='none';
  document.getElementById('tc-tab-pricing').style.display='none';
  const sel=document.getElementById('tc-profile-select');sel.innerHTML='<option value="">Nenhum</option>';
  gameProfiles.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;if(tournament.gameProfileId===p.id)o.selected=true;sel.appendChild(o);});
  updateTournamentConfigPreview();
  const sc=tournament.scoring||{};
  document.getElementById('tc-sets').value=sc.sets||3;document.getElementById('tc-points').value=sc.points||21;
  document.getElementById('tc-maxpoints').value=sc.maxPoints||30;document.getElementById('tc-interval').value=sc.interval!=null?sc.interval:1;
  document.getElementById('tc-deciding').value=sc.deciding||'normal';
  document.getElementById('tc-courts').value=tournament.courts||4;document.getElementById('tc-duration').value=tournament.matchDuration||30;
  document.getElementById('tc-rest-min').value=tournament.restMinBetweenGames!=null?tournament.restMinBetweenGames:20;
  document.getElementById('tc-rest-sets').value=tournament.restBetweenSets!=null?tournament.restBetweenSets:2;
  document.getElementById('tc-rest-mid').value=tournament.restMidSet!=null?tournament.restMidSet:1;
  openModal('modal-tournament-config');
}

function setTcTab(el,id){document.querySelectorAll('#tc-tabs .tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');['tc-tab-system','tc-tab-scoring','tc-tab-courts','tc-tab-schedule','tc-tab-ranking','tc-tab-clubes','tc-tab-pricing'].forEach(i=>{const e=document.getElementById(i);if(e)e.style.display=i===id?'':'none';});if(id==='tc-tab-courts')renderCourtNames();if(id==='tc-tab-schedule')renderDaySchedule();if(id==='tc-tab-pricing')renderPricingSummary();if(id==='tc-tab-ranking')renderTcRanking();if(id==='tc-tab-clubes')renderTcClubes();}

// === CLUBES ATIVOS ===
// Normaliza nome de clube: case-insensitive + colapsa espacos. Filtra valores invalidos.
function _normalizeClubKey(name){
  if(!name)return '';
  const s=String(name).trim().toLowerCase().replace(/\s+/g,' ');
  return s;
}
function _isInvalidClubName(name){
  const s=_normalizeClubKey(name);
  if(!s)return true;
  // Atletas com clube "S/C" ou variantes = sem clube (nao entram em "Clubes Ativos")
  return /^(s\/?c|sem\s+clube|n\/?a|none|null|-)$/i.test(s);
}

function getClubsFromPlayers(){
  // Agrupa por chave normalizada, escolhe o "display name" com mais ocorrencias
  const groups={}; // key -> { displayCounts: {name: n}, total }
  (players||[]).forEach(p=>{
    const raw=(p.club||'').trim();
    if(_isInvalidClubName(raw))return;
    const key=_normalizeClubKey(raw);
    if(!groups[key])groups[key]={displayCounts:{},total:0};
    groups[key].displayCounts[raw]=(groups[key].displayCounts[raw]||0)+1;
    groups[key].total++;
  });
  return Object.entries(groups).map(([key,g])=>{
    const sortedDisplays=Object.entries(g.displayCounts).sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length);
    return{key,name:sortedDisplays[0][0],count:g.total};
  }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

function getClubStatus(clubNameOrKey){
  if(!tournament)return 'sc';
  const map=tournament.clubStatuses||{};
  const key=_normalizeClubKey(clubNameOrKey);
  // Compat com schemas antigos que possam ter chave nao-normalizada
  return map[key]||map[clubNameOrKey]||'sc';
}

function setClubStatus(clubNameOrKey,status){
  if(!tournament)return;
  if(!tournament.clubStatuses)tournament.clubStatuses={};
  const key=_normalizeClubKey(clubNameOrKey);
  // Limpa eventual entrada com chave nao-normalizada (migracao silenciosa)
  if(tournament.clubStatuses[clubNameOrKey]&&clubNameOrKey!==key){
    delete tournament.clubStatuses[clubNameOrKey];
  }
  tournament.clubStatuses[key]=status;
  renderTcClubes();
}

function setAllClubStatus(status){
  if(!tournament)return;
  if(!tournament.clubStatuses)tournament.clubStatuses={};
  getClubsFromPlayers().forEach(c=>{tournament.clubStatuses[c.key]=status;});
  renderTcClubes();
}

function renderTcClubes(){
  const c=document.getElementById('tc-clubes-list');
  if(!c)return;
  const clubs=getClubsFromPlayers();
  if(!clubs.length){
    c.innerHTML='<p style="padding:24px;text-align:center;color:var(--fabd-gray-500)">Nenhum atleta com clube cadastrado neste torneio.</p>';
    return;
  }
  let h='<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc"><th style="padding:10px;text-align:left">Clube</th><th style="padding:10px;text-align:center;width:80px">Atletas</th><th style="padding:10px;text-align:center;width:280px">Status</th></tr></thead><tbody>';
  clubs.forEach(cl=>{
    const st=getClubStatus(cl.key);
    const safe=esc(cl.name);
    const safeKey=esc(cl.key);
    h+=`<tr style="border-top:1px solid #e5e7eb">
      <td style="padding:10px"><strong>${safe}</strong></td>
      <td style="padding:10px;text-align:center">${cl.count}</td>
      <td style="padding:10px;text-align:center">
        <div style="display:inline-flex;border:1px solid var(--fabd-gray-300);border-radius:6px;overflow:hidden;font-size:12px">
          <button data-club-key="${safeKey}" data-club-status="adimplente" style="border:none;padding:6px 10px;cursor:pointer;background:${st==='adimplente'?'#10B981':'#fff'};color:${st==='adimplente'?'#fff':'var(--fabd-gray-700)'};font-weight:${st==='adimplente'?'700':'400'}">Adimplente</button>
          <button data-club-key="${safeKey}" data-club-status="inadimplente" style="border:none;padding:6px 10px;cursor:pointer;border-left:1px solid var(--fabd-gray-300);border-right:1px solid var(--fabd-gray-300);background:${st==='inadimplente'?'#DC2626':'#fff'};color:${st==='inadimplente'?'#fff':'var(--fabd-gray-700)'};font-weight:${st==='inadimplente'?'700':'400'}">Inadimplente</button>
          <button data-club-key="${safeKey}" data-club-status="sc" style="border:none;padding:6px 10px;cursor:pointer;background:${st==='sc'?'#64748B':'#fff'};color:${st==='sc'?'#fff':'var(--fabd-gray-700)'};font-weight:${st==='sc'?'700':'400'}" title="Sem confirmação">S/C</button>
        </div>
      </td>
    </tr>`;
  });
  // Resumo
  const total=clubs.reduce((s,c)=>s+c.count,0);
  const adim=clubs.filter(c=>getClubStatus(c.key)==='adimplente').reduce((s,c)=>s+c.count,0);
  h+=`</tbody><tfoot><tr style="background:#f8fafc;border-top:2px solid var(--fabd-gray-300)"><td style="padding:10px;font-weight:700">${clubs.length} clubes</td><td style="padding:10px;text-align:center;font-weight:700">${total}</td><td style="padding:10px;text-align:center;font-size:12px;color:var(--fabd-gray-600)">${adim} atletas em clubes adimplentes</td></tr></tfoot></table>`;
  c.innerHTML=h;
  c.querySelectorAll('button[data-club-key]').forEach(btn=>{
    btn.addEventListener('click',()=>setClubStatus(btn.dataset.clubKey,btn.dataset.clubStatus));
  });
}

function renderTcRanking(){
  const sel=document.getElementById('tc-ranking-select');
  if(!sel)return;
  sel.innerHTML='';
  scoringTables.forEach(t=>{
    const o=document.createElement('option');
    o.value=t.id;
    o.textContent=t.name+(t.isDefault?' (padrão)':'');
    if((tournament?.scoringTableId||'default-bwf')===t.id)o.selected=true;
    sel.appendChild(o);
  });
  updateTcRankingPreview();
}

function updateTcRankingPreview(){
  const sel=document.getElementById('tc-ranking-select');
  const prev=document.getElementById('tc-ranking-preview');
  if(!sel||!prev)return;
  const t=scoringTables.find(x=>x.id===sel.value);
  if(!t){prev.innerHTML='';return;}
  let h='<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left">Colocação</th><th style="padding:8px;text-align:right">Pontos</th></tr></thead><tbody>';
  SCORING_BUCKETS.forEach(b=>{h+=`<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px">${esc(b.label)}</td><td style="padding:8px;text-align:right;font-weight:600">${(+t.points[b.key]||0).toLocaleString('pt-BR')}</td></tr>`;});
  h+='</tbody></table>';
  prev.innerHTML=h;
}

function renderPricingSummary(){
  const valor=tournament?.valorInscricao||30;
  document.getElementById('tc-valor-padrao').value=valor;
  const totalInscritos=players.filter(p=>(p.inscriptions||[]).length>0).length;
  const totalInscs=players.reduce((s,p)=>s+(p.inscriptions||[]).length,0);
  const totalPago=players.filter(p=>(p.pagamentoStatus||'pago')==='pago').reduce((s,p)=>s+(p.inscriptions||[]).length,0);
  const totalArrecadado=totalPago*valor;
  let h=`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">`;
  h+=`<div style="background:white;border-radius:8px;padding:12px;border:1px solid #E2E8F0"><div style="font-size:11px;color:var(--fabd-gray-500)">Jogadores inscritos</div><div style="font-size:24px;font-weight:800">${totalInscritos}</div></div>`;
  h+=`<div style="background:white;border-radius:8px;padding:12px;border:1px solid #E2E8F0"><div style="font-size:11px;color:var(--fabd-gray-500)">Total de inscricoes</div><div style="font-size:24px;font-weight:800">${totalInscs}</div></div>`;
  h+=`<div style="background:white;border-radius:8px;padding:12px;border:1px solid #E2E8F0"><div style="font-size:11px;color:var(--fabd-gray-500)">Valor por inscricao</div><div style="font-size:24px;font-weight:800;color:#1E3A8A">R$ ${valor.toFixed(2)}</div></div>`;
  h+=`<div style="background:white;border-radius:8px;padding:12px;border:1px solid #E2E8F0"><div style="font-size:11px;color:var(--fabd-gray-500)">Total arrecadado (pagos)</div><div style="font-size:24px;font-weight:800;color:#10B981">R$ ${totalArrecadado.toFixed(2)}</div></div>`;
  h+=`</div>`;
  document.getElementById('tc-pricing-summary').innerHTML=h;
}

async function applyPricingToAll(){
  const valor=parseInt(document.getElementById('tc-valor-padrao').value)||30;
  if(!confirm('Aplicar R$ '+valor.toFixed(2)+' por inscricao para todos os '+players.length+' jogadores?'))return;
  tournament.valorInscricao=valor;
  players.forEach(p=>{p.valorCategoria=valor;});
  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderPricingSummary();
  updateOverview();
  showToast('Valor atualizado para R$ '+valor.toFixed(2)+' por inscricao!');
}
function renderCourtNames(){const c=parseInt(document.getElementById('tc-courts').value)||4;const n=tournament?.courtNames||[];let h='';for(let i=0;i<c;i++)h+=`<div style="margin-bottom:4px"><input type="text" class="form-control tc-court-name" value="${esc(n[i]||'Quadra '+(i+1))}" style="padding:4px 8px;font-size:13px"></div>`;document.getElementById('tc-court-names').innerHTML=h;}

function getDaysBetween(startDate,endDate){
  const days=[];
  if(!startDate)return days;
  const end=endDate||startDate;
  let cur=new Date(startDate+'T00:00:00');
  const last=new Date(end+'T00:00:00');
  while(cur<=last){
    days.push(cur.toISOString().slice(0,10));
    cur.setDate(cur.getDate()+1);
  }
  return days;
}

// renderDaySchedule + collectDaySchedule + ensureDayScheduleDraws + getMatchDay
// extraidos pra src/js/modules/schedule.js (issue #14.H).

function updateTournamentConfigPreview(){const id=document.getElementById('tc-profile-select').value;const p=gameProfiles.find(x=>x.id===id);const el=document.getElementById('tc-profile-preview');if(!id||!p){el.innerHTML='<span style="color:var(--fabd-gray-500)">Sem perfil</span>';return;}let h=`<strong>${esc(p.name)}</strong><br>`;if(p.mode==='fixed')h+=`Fixo: ${esc(p.fixedType)}`;else{h+='<table style="width:100%;font-size:13px;margin-top:8px"><thead><tr><th>De</th><th>Ate</th><th>Sistema</th></tr></thead><tbody>';(p.ranges||[]).forEach(r=>h+=`<tr><td>${r.min}</td><td>${r.max}</td><td>${esc(r.type)}</td></tr>`);h+='</tbody></table>';}el.innerHTML=h;}

async function saveTournamentConfig(){
  try{
    tournament.gameProfileId=document.getElementById('tc-profile-select').value||'';
    tournament.scoring={sets:parseInt(document.getElementById('tc-sets').value)||3,points:parseInt(document.getElementById('tc-points').value)||21,maxPoints:parseInt(document.getElementById('tc-maxpoints').value)||30,interval:parseInt(document.getElementById('tc-interval').value)||1,deciding:document.getElementById('tc-deciding').value||'normal'};
    tournament.courts=parseInt(document.getElementById('tc-courts').value)||4;tournament.matchDuration=parseInt(document.getElementById('tc-duration').value)||30;
    tournament.restMinBetweenGames=parseInt(document.getElementById('tc-rest-min').value)||20;tournament.restBetweenSets=parseInt(document.getElementById('tc-rest-sets').value)||2;tournament.restMidSet=parseInt(document.getElementById('tc-rest-mid').value)||1;
    // Pegar horarios do primeiro dia da programacao (ou manter os existentes)
    const ds=collectDaySchedule();
    if(ds.length){tournament.startTime=ds[0].startTime;tournament.endTime=ds[0].endTime;tournament.breakStart=ds[0].breakStart;tournament.breakEnd=ds[0].breakEnd;}
    tournament.courtNames=Array.from(document.querySelectorAll('.tc-court-name')).map((inp,i)=>inp.value.trim()||`Quadra ${i+1}`);
    // Salvar programacao por dia
    tournament.daySchedule=collectDaySchedule();
    // Ranking selecionado pra este torneio
    const rkSel=document.getElementById('tc-ranking-select');
    if(rkSel)tournament.scoringTableId=rkSel.value||'default-bwf';
    // Re-sincronizar chaves com novo perfil/config
    syncEntriesFromPlayers();
    await window.api.saveTournament(tournament);prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);closeModal('modal-tournament-config');renderTournamentPage();showToast('Configuracao salva!');
  }catch(e){showToast('Erro: '+e.message,'error');}
}

// === GAME PROFILES ===
// loadGameProfiles + game profile helpers + getDrawTypeForCount/calcIdealGroupCount
// extraidos pra src/js/modules/scoring-profiles.js (issue #14.C).


// _newUmpireId + loadUmpires/saveUmpires + getUmpireById/getUmpireByName
// + renderUmpires + addUmpire/removeUmpire extraidos pra
// src/js/modules/umpires.js (issue #14.D).


// === IMPORT ===
let importedRows=[];
const IMPORT_TEMPLATE_HEADER='Nome;Sobrenome;Genero;DataNascimento;Clube;Estado;Ranking;Telefone;Email;Inscricoes;Dupla_DM;Dupla_DF;Dupla_DX';
const IMPORT_TEMPLATE_EXAMPLE=[
  'Joao;Silva;M;15/05/2000;Clube Maceio;AL;1;(82) 99999-0001;joao@email.com;SM Principal|DM Principal|DX Principal;Pedro Oliveira;;Maria Santos',
  'Maria;Santos;F;20/10/1998;AABB Alagoas;AL;2;(82) 99999-0002;maria@email.com;SF Principal|DF Principal|DX Principal;;Ana Costa;Joao Silva',
];
function downloadImportTemplate(){const c=IMPORT_TEMPLATE_HEADER+'\n'+IMPORT_TEMPLATE_EXAMPLE.join('\n')+'\n';if(window.api?.saveFile)window.api.saveFile([{name:'CSV',extensions:['csv']}],'\uFEFF'+c).then(s=>{if(s)showToast('Modelo salvo!');});else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+c],{type:'text/csv'}));a.download='modelo-importacao-FABD.csv';a.click();}}
function showImportModal(){importedRows=[];document.getElementById('import-step-1').style.display='';document.getElementById('import-step-2').style.display='none';document.getElementById('import-btn-confirm').style.display='none';openModal('modal-import');}
function importBackToStep1(){document.getElementById('import-step-1').style.display='';document.getElementById('import-step-2').style.display='none';document.getElementById('import-btn-confirm').style.display='none';}
async function selectImportFile(){
  try{
    // Tentar xlsx primeiro
    const xlsxResult = await window.api.xlsxImport();
    if(!xlsxResult) return;

    if(xlsxResult.type==='csv'){
      // Fallback CSV
      parseCSV(xlsxResult.content, xlsxResult.fileName);
      return;
    }

    // Processar dados do xlsx
    const xlsxRows = xlsxResult.rows||[];
    if(!xlsxRows.length){showToast('Planilha vazia','warning');return;}

    // Fase 1: Agrupar linhas por atleta (nome sem acento + data nascimento = mesma pessoa)
    // v3.50+: Alem disso, se a linha trouxer DOB+Clube do parceiro nas colunas estendidas,
    // criamos AUTOMATICAMENTE o atleta-parceiro (sem precisar de linha propria dele) e
    // ja pre-vinculamos a dupla. Dedup continua funcionando por nome+DOB.
    const atletaMap = {}; // chave: nome_normalizado|dob -> { dados, inscricoes, duplas }

    // Helper: cria/obtem atleta e registra uma dupla contra outro atleta
    const ensureAtleta = (nomeOriginal, gender, dob, club, phone, email) => {
      if (!nomeOriginal) return null;
      const nomeNorm = normalizeName(nomeOriginal);
      if (!nomeNorm) return null;
      const key = nomeNorm + '|' + (dob || '');
      if (!atletaMap[key]) {
        const parts = nomeOriginal.trim().split(/\s+/);
        atletaMap[key] = {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
          gender: gender || '',
          dob: dob || '',
          club: club || '',
          phone: phone || '',
          email: email || '',
          inscricoes: new Set(),
          duplas: {}, // "MOD Categoria" -> { name, dob, club } do parceiro
        };
      }
      // Completa campos vazios (quem chegar depois com mais dados preenche)
      const a = atletaMap[key];
      if (!a.gender && gender) a.gender = gender;
      if (!a.club && club) a.club = club;
      if (!a.phone && phone) a.phone = phone;
      if (!a.email && email) a.email = email;
      return a;
    };

    // R6: coletar DOBs que chegaram preenchidos mas nao foram reconhecidos (viram '').
    // Mostrados como warning no preview para o user corrigir a planilha.
    const invalidDOBs = [];
    const tryNormalizeDob = (raw, ownerName, field) => {
      const norm = normalizeDate(raw);
      if (!norm && raw != null && String(raw).trim() !== '') {
        invalidDOBs.push(`${ownerName || '(sem nome)'} (${field}): ${String(raw).slice(0, 20)}`);
      }
      return norm;
    };

    xlsxRows.forEach(r => {
      const nomeOriginal = (r.nome || '').trim();
      if (!nomeOriginal) return;

      const gender = normalizeGender(r.sexo || '');
      const dob = tryNormalizeDob(r.dob, nomeOriginal, 'DOB');
      const cat = (r.categoria || '').trim() || calculateCategory(dob) || 'Principal';

      const atleta = ensureAtleta(nomeOriginal, gender, dob, r.clube || '', r.telefone || '', r.email || '');
      if (!atleta) return;

      // Simples
      if (r.simples) {
        const mod = gender === 'M' ? 'SM' : 'SF';
        atleta.inscricoes.add(mod + ' ' + cat);
      }

      // Dupla (mesmo sexo) — v3.50: cria parceiro automaticamente se tiver DOB+Clube
      if (r.dupla && r.parceiroDupla) {
        const mod = gender === 'M' ? 'DM' : 'DF';
        const key = mod + ' ' + cat;
        atleta.inscricoes.add(key);
        const pName = (r.parceiroDupla || '').trim();
        const pDob = tryNormalizeDob(r.parceiroDuplaDOB, pName, 'Nasc. Dupla');
        const pClub = (r.parceiroDuplaClube || '').trim();
        atleta.duplas[key] = { name: pName, dob: pDob, club: pClub };

        // C7: cria parceiro no mapa MESMO sem DOB — o bind de fase 2 decide
        // se e inequivoco (1 match por nome) ou ambiguo (>1 homonimo).
        if (pName) {
          const partner = ensureAtleta(pName, gender, pDob, pClub, '', '');
          if (partner) {
            partner.inscricoes.add(key);
            if (!partner.duplas[key]) partner.duplas[key] = { name: nomeOriginal, dob: dob, club: atleta.club };
          }
        }
      }

      // Mista (sexo oposto)
      if (r.mista && r.parceiroMista) {
        const key = 'DX ' + cat;
        atleta.inscricoes.add(key);
        const pName = (r.parceiroMista || '').trim();
        const pDob = tryNormalizeDob(r.parceiroMistaDOB, pName, 'Nasc. Mista');
        const pClub = (r.parceiroMistaClube || '').trim();
        atleta.duplas[key] = { name: pName, dob: pDob, club: pClub };

        if (pName) {
          const partnerGender = gender === 'M' ? 'F' : gender === 'F' ? 'M' : '';
          const partner = ensureAtleta(pName, partnerGender, pDob, pClub, '', '');
          if (partner) {
            partner.inscricoes.add(key);
            if (!partner.duplas[key]) partner.duplas[key] = { name: nomeOriginal, dob: dob, club: atleta.club };
          }
        }
      }
    });

    // Fase 2: Converter pra formato que o confirmImport espera
    // v3.50+: duplaMap agora carrega objeto {name, dob, club} em vez de string.
    importedRows = [];
    // Track which athletes have their own row in the XLSX (for correct inscription count)
    const atletasComLinhaPropria = new Set();
    xlsxRows.forEach(r => {
      const nomeNorm = normalizeName(r.nome || '');
      const dob = r.dob || '';
      if (nomeNorm && dob) atletasComLinhaPropria.add(nomeNorm + '|' + dob);
    });
    Object.values(atletaMap).forEach(a => {
      const inscricoesRaw = [...a.inscricoes].join('|');
      const key = normalizeName(a.firstName + ' ' + a.lastName) + '|' + a.dob;
      const hasLinhaPropria = atletasComLinhaPropria.has(key);
      const totalInscricoes = hasLinhaPropria ? inscricoesRaw.split('|').filter(x=>x).length : 0;

      // Extrair parceiros por modalidade (primeiro encontrado como fallback + mapa completo por chave)
      let duplaDM = '', duplaDF = '', duplaDX = '';
      const duplaMap = {}; // "DM Sub 19" -> { name, dob, club }
      Object.entries(a.duplas).forEach(([key, parceiroObj]) => {
        duplaMap[key] = parceiroObj;
        const parceiroNome = (parceiroObj && parceiroObj.name) || '';
        if (key.startsWith('DM')) duplaDM = duplaDM || parceiroNome;
        if (key.startsWith('DF')) duplaDF = duplaDF || parceiroNome;
        if (key.startsWith('DX')) duplaDX = duplaDX || parceiroNome;
      });

      const row = {
        firstName: a.firstName, lastName: a.lastName, gender: a.gender, dob: a.dob,
        club: a.club, state: 'AL', ranking: '', phone: a.phone, email: a.email,
        inscricoesRaw, duplaDM, duplaDF, duplaDX, _duplaMap: duplaMap,
        _totalInscricoes: totalInscricoes,
        valid: true, error: ''
      };

      // Validacoes
      if (!row.firstName && !row.lastName) { row.valid = false; row.error = 'Nome vazio'; }
      if (row.gender !== 'M' && row.gender !== 'F') { row.valid = false; row.error = 'Genero invalido'; }
      if (!a.inscricoes.size) { row.valid = false; row.error = 'Sem modalidade (marque X)'; }
      row.category = calculateCategory(row.dob);
      importedRows.push(row);
    });

    // Fase 3: Mostrar preview com resumo
    const totalLinhas = xlsxRows.length;
    const totalAtletas = importedRows.length;
    // v3.60: contar inscricoes das LINHAS ORIGINAIS do XLSX (nao deduplicadas)
    // Cada linha com X em simples/dupla/mista = 1 inscricao
    // (parceiros automaticos nao tem linha propria, mas countamos a inscricao na linha principal)
    const totalInscs = xlsxRows.reduce((s, r) => {
      let n = 0;
      if (r.simples) n++;
      if (r.dupla) n++;
      if (r.mista) n++;
      return s + n;
    }, 0);
    const duplicatasRemovidas = totalLinhas - totalAtletas;

    document.getElementById('import-file-name').textContent = xlsxResult.fileName;
    document.getElementById('import-count').textContent = totalAtletas + ' atleta(s) de ' + totalLinhas + ' linha(s)' + (duplicatasRemovidas > 0 ? ' (' + duplicatasRemovidas + ' linhas extras agrupadas)' : '');
    const vc = importedRows.filter(r => r.valid).length, ic = importedRows.filter(r => !r.valid).length;
    document.getElementById('import-preview-head').innerHTML = '<tr><th>#</th><th>Nome</th><th>Sobrenome</th><th>Gen.</th><th>Nasc.</th><th>Cat. Base</th><th>Clube</th><th>Inscricoes</th><th>Status</th></tr>';
    let tb = '';
    importedRows.forEach((r, i) => {
      const inscs = (r.inscricoesRaw||'').split(/[;|]/).filter(x => x.trim()).map(x => '<span class="tag tag-blue" style="margin:1px;font-size:9px">' + esc(x.trim()) + '</span>').join(' ') || '-';
      tb += '<tr style="' + (r.valid ? '' : 'background:#FEE2E2') + '"><td>' + (i+1) + '</td><td>' + esc(r.firstName) + '</td><td>' + esc(r.lastName) + '</td><td>' + esc(r.gender) + '</td><td>' + esc(r.dob) + '</td><td>' + esc(r.category) + '</td><td>' + esc(r.club) + '</td><td>' + inscs + '</td><td>' + (r.valid ? '<span class="tag tag-green">OK</span>' : '<span class="tag tag-red">' + esc(r.error) + '</span>') + '</td></tr>';
    });
    document.getElementById('import-preview-body').innerHTML = tb;
    // R6: exibir DOBs nao-reconhecidos no summary (ate 5)
    let dobWarnHTML = '';
    if (invalidDOBs.length) {
      const sample = invalidDOBs.slice(0, 5).map(esc).join('<br>');
      const extra = invalidDOBs.length > 5 ? ('<br>...e mais ' + (invalidDOBs.length - 5)) : '';
      dobWarnHTML = '<br><span style="color:var(--fabd-red,#C41E2A)">' + invalidDOBs.length + ' data(s) de nascimento nao reconhecida(s):<br>' + sample + extra + '</span>';
    }
    document.getElementById('import-summary').innerHTML = '<strong>' + vc + '</strong> atleta(s) valido(s) | <strong>' + totalInscs + '</strong> inscricao(oes)' + (ic ? '<br><span style="color:var(--fabd-red)">' + ic + ' com erro</span>' : '') + dobWarnHTML;
    document.getElementById('import-step-1').style.display='none';
    document.getElementById('import-step-2').style.display='';
    document.getElementById('import-btn-confirm').style.display=vc?'':'none';
  }catch(e){showToast('Erro: '+e.message,'error');}
}
function parseCSV(content,filePath){const fl=content.split('\n')[0];const sep=(fl.match(/;/g)||[]).length>(fl.match(/,/g)||[]).length?';':',';document.getElementById('import-separator').textContent=sep===';'?'Ponto e virgula':'Virgula';const lines=content.split('\n').map(l=>l.trim()).filter(l=>l);if(lines.length<2){showToast('Arquivo precisa de cabecalho + dados','warning');return;}const headers=parseCSVLine(lines[0],sep);const colMap=mapColumns(headers);importedRows=[];for(let i=1;i<lines.length;i++){const cols=parseCSVLine(lines[i],sep);if(cols.length<2)continue;const row={firstName:cleanAthleteName(getCol(cols,colMap.firstName)),lastName:cleanAthleteName(getCol(cols,colMap.lastName)),gender:normalizeGender(getCol(cols,colMap.gender)),dob:normalizeDate(getCol(cols,colMap.dob)),club:getCol(cols,colMap.club),state:getCol(cols,colMap.state)||'AL',ranking:getCol(cols,colMap.ranking),phone:getCol(cols,colMap.phone),email:getCol(cols,colMap.email),inscricoesRaw:getCol(cols,colMap.inscricoes),duplaDM:getCol(cols,colMap.duplaDM),duplaDF:getCol(cols,colMap.duplaDF),duplaDX:getCol(cols,colMap.duplaDX),valid:true,error:''};if(!row.firstName&&!row.lastName){row.valid=false;row.error='Nome vazio';}if(row.gender!=='M'&&row.gender!=='F'){row.valid=false;row.error='Genero invalido';}row.category=calculateCategory(row.dob);importedRows.push(row);}document.getElementById('import-file-name').textContent=filePath.split(/[/\\]/).pop();document.getElementById('import-count').textContent=`${importedRows.length} linha(s)`;const vc=importedRows.filter(r=>r.valid).length,ic=importedRows.filter(r=>!r.valid).length;document.getElementById('import-preview-head').innerHTML='<tr><th>#</th><th>Nome</th><th>Sobrenome</th><th>Gen.</th><th>Nasc.</th><th>Cat.</th><th>Clube</th><th>Inscricoes</th><th>Status</th></tr>';let tb='';importedRows.forEach((r,i)=>{const inscs=(r.inscricoesRaw||'').split(/[;|]/).filter(x=>x.trim()).map(x=>`<span class="tag tag-blue" style="margin:1px;font-size:9px">${esc(x.trim())}</span>`).join(' ')||'-';tb+=`<tr style="${r.valid?'':'background:#FEE2E2'}"><td>${i+1}</td><td>${esc(r.firstName)}</td><td>${esc(r.lastName)}</td><td>${esc(r.gender)}</td><td>${esc(r.dob)}</td><td>${esc(r.category)}</td><td>${esc(r.club)}</td><td>${inscs}</td><td>${r.valid?'<span class="tag tag-green">OK</span>':`<span class="tag tag-red">${esc(r.error)}</span>`}</td></tr>`;});document.getElementById('import-preview-body').innerHTML=tb;document.getElementById('import-summary').innerHTML=`<strong>${vc}</strong> valido(s)${ic?`<br><span style="color:var(--fabd-red)">${ic} com erro</span>`:''}`;document.getElementById('import-step-1').style.display='none';document.getElementById('import-step-2').style.display='';document.getElementById('import-btn-confirm').style.display=vc?'':'none';}
// parseCSVLine, mapColumns, getCol, normalizeName, cleanAthleteName,
// normalizeGender, normalizeDate — extraidas pra src/js/modules/csv-parser.js
// (issue #14 sub-tarefa 14.A). Continuam disponiveis como globais.
async function confirmImport(){
  try{
    const vr=importedRows.filter(r=>r.valid);
    if(!vr.length)return;
    let added=0,updated=0;

    // Recarregar jogadores atuais para evitar duplicatas
    tournament=await window.api.getTournament();
    players=tournament?.players||[];

    // Primeira passada: criar/atualizar jogadores com inscricoes
    const importStatus=document.getElementById('import-summary');
    const totalVr=vr.length;
    for(let ri=0;ri<vr.length;ri++){
      const row=vr[ri];
      if(importStatus)importStatus.innerHTML=`<strong>Importando ${ri+1}/${totalVr}...</strong>`;
      const rowNameNorm=normalizeName(row.firstName+' '+row.lastName);
      const ex=players.find(p=>normalizeName(p.firstName+' '+p.lastName)===rowNameNorm&&normalizeDate(p.dob||'')===normalizeDate(row.dob||''));

      // Processar inscricoes do CSV
      const inscriptions=[];
      if(row.inscricoesRaw){
        row.inscricoesRaw.split(/[;|]/).forEach(raw=>{
          const key=raw.trim();
          if(!key)return;
          // Extrair mod e cat de "SM Principal" ou "DX Sub 13"
          const parts=key.split(' ');
          const mod=parts[0];
          const cat=parts.slice(1).join(' ');
          if(mod&&cat) inscriptions.push({key,mod,cat,partner:''});
        });
      }

      const p={
        firstName:row.firstName,lastName:row.lastName,gender:row.gender,
        dob:row.dob,club:row.club,state:row.state,category:row.category,
        ranking:row.ranking,phone:row.phone,email:row.email,
        inscriptions,
        _duplaDM:row.duplaDM||'',_duplaDF:row.duplaDF||'',_duplaDX:row.duplaDX||'',
        _duplaMap:row._duplaMap||{}
      };
      if(ex){p.id=ex.id;updated++;}else added++;
      const saved=await window.api.savePlayer(p);
      // Atualizar players em memoria para evitar duplicatas no proximo loop
      tournament=await window.api.getTournament();
      players=tournament?.players||[];
    }

    // Segunda passada: vincular duplas (por chave especifica: "DM Sub 19" -> parceiro)
    // v3.50+: duplaMap carrega {name,dob,club}. Match prioriza nome+DOB (anti-homonimo);
    // ambiguidades (>1 match por nome sem DOB) nao sao bindadas — warn mostrado ao final.
    const ambiguous = []; // lista de "Nome (mod cat)" onde bind foi ambiguo
    // cai de volta pra nome apenas se DOB nao foi fornecido.
    for(const p of players){
      let changed=false;
      const duplaMap=p._duplaMap||{};

      (p.inscriptions||[]).forEach(insc=>{
        if(insc.partner) return; // ja tem parceiro
        if(!['DM','DF','DX'].includes(insc.mod)) return;
        const key=insc.mod+' '+insc.cat;
        let parcObj=duplaMap[key];
        // Compat: se ainda vier string (planilha antiga), converte
        if (typeof parcObj === 'string') parcObj = { name: parcObj, dob: '', club: '' };

        let parcName = parcObj?.name || '';
        let parcDob  = parcObj?.dob  || '';

        if(!parcName){
          // Fallback: _duplaDM/_duplaDF/_duplaDX generico (sem DOB)
          parcName = insc.mod==='DM'?p._duplaDM:insc.mod==='DF'?p._duplaDF:insc.mod==='DX'?p._duplaDX:'';
          if(!parcName) return;
        }

        const dn = normalizeName(parcName);
        let partner = null;
        if (parcDob) {
          // Match preciso: nome+DOB (anti-homonimo)
          partner = players.find(x=>x.id!==p.id
            && normalizeName(x.firstName+' '+x.lastName)===dn
            && normalizeDate(x.dob||'')===normalizeDate(parcDob));
        }
        if (!partner) {
          // Fallback: match por nome apenas — MAS apenas se for inequivoco
          const nameMatches = players.filter(x=>x.id!==p.id && normalizeName(x.firstName+' '+x.lastName)===dn);
          if (nameMatches.length === 1) {
            partner = nameMatches[0];
          } else if (nameMatches.length > 1) {
            // C7: homonimo sem DOB para diferenciar — nao binda, sinaliza.
            ambiguous.push(`${p.firstName} ${p.lastName} (${insc.key}): ${nameMatches.length} "${parcName}" homonimos`);
          }
        }
        if(partner){
          insc.partner=partner.id;
          // C8: snapshot pra resistir a deletion/corrupcao do partner.id
          insc.partnerName=(partner.firstName+' '+partner.lastName).trim();
          insc.partnerDob=partner.dob||'';
          insc.partnerClub=partner.club||'';
          changed=true;
        } else if (parcName) {
          // sem bind — ainda salva nome/dob/club do dado crua pra export nao perder
          if (!insc.partnerName) { insc.partnerName=parcName; insc.partnerDob=parcDob||''; insc.partnerClub=parcObj?.club||''; changed=true; }
        }
      });

      // Limpar campos temporarios
      delete p._duplaDM;delete p._duplaDF;delete p._duplaDX;delete p._duplaMap;
      if(changed) await window.api.savePlayer(p);
    }

    // Verificar parceiros nao vinculados
    const unlinked=[];
    players.forEach(p=>{
      (p.inscriptions||[]).forEach(insc=>{
        if(['DM','DF','DX'].includes(insc.mod)&&!insc.partner){
          unlinked.push(`${p.firstName} ${p.lastName} (${insc.key})`);
        }
      });
    });

    tournament=await window.api.getTournament();
    players=tournament?.players||[];
    syncEntriesFromPlayers();
    autoGenerateDraws(); // GERAR DRAWS PARA TODAS AS MODALIDADES INCLUINDO DUPLAS
    prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    closeModal('modal-import');
    renderPlayers();
    renderDraws(); // Atualizar tela de chaves
    setTimeout(()=>document.getElementById('search-players')?.focus(),50);
    let msg=`${added} adicionado(s), ${updated} atualizado(s), inscricoes e duplas importadas!`;
    if(unlinked.length){msg+=`\n\nAtencao: ${unlinked.length} dupla(s) sem parceiro vinculado (nome nao encontrado):\n${unlinked.slice(0,5).join('\n')}${unlinked.length>5?'\n...e mais '+(unlinked.length-5):''}`;}
    if(ambiguous.length){msg+=`\n\nAtencao: ${ambiguous.length} dupla(s) com parceiro ambiguo (homonimos sem DOB):\n${ambiguous.slice(0,5).join('\n')}${ambiguous.length>5?'\n...e mais '+(ambiguous.length-5):''}\n\nAdicione coluna "Nasc. Dupla"/"Nasc. Mista" na planilha para diferenciar.`;}
    if(unlinked.length||ambiguous.length)showToast(msg,'warning');
    else{showToast(msg);}
  }catch(e){console.error(e);showToast('Erro: '+e.message,'error');}
}

// === ENTRY MODAL (Inscrever Jogador rapido) ===
function showAddEntryModal(){
  if(!tournament){showToast('Crie um torneio primeiro','warning');return;}
  if(!players.length){showToast('Adicione jogadores primeiro','warning');return;}
  // Preencher select de jogadores
  const sel=document.getElementById('entry-player');
  sel.innerHTML='<option value="">Selecione...</option>';
  players.forEach(p=>{
    sel.innerHTML+=`<option value="${p.id}">${esc(p.firstName)} ${esc(p.lastName)} ${p.club?'('+esc(p.club)+')':''}</option>`;
  });
  // Preencher checkboxes de eventos baseado nas categorias disponiveis
  const container=document.getElementById('entry-events-container');
  const items=[];
  CATEGORIES.forEach(cat=>{
    MODALITIES.forEach(mod=>{
      const key=`${mod.code} ${cat}`;
      items.push({mod,cat,key});
    });
  });
  let h='';
  items.forEach(({mod,cat,key})=>{
    h+=`<label><input type="checkbox" class="entry-event-check" value="${esc(key)}" data-mod="${mod.code}" data-cat="${esc(cat)}"> ${mod.code} ${esc(cat)}</label>`;
  });
  container.innerHTML=h;
  openModal('modal-entry');
}

async function addEntry(){
  const playerId=document.getElementById('entry-player').value;
  if(!playerId){showToast('Selecione um jogador','warning');return;}
  const p=players.find(x=>x.id===playerId);
  if(!p){showToast('Jogador nao encontrado','error');return;}
  const checks=document.querySelectorAll('.entry-event-check:checked');
  if(!checks.length){showToast('Selecione pelo menos um evento','warning');return;}
  // Validar genero
  let blocked=false;
  checks.forEach(cb=>{
    const mod=cb.dataset.mod;
    if((mod==='SM'||mod==='DM')&&p.gender==='F'){showToast(`${p.firstName} e feminino, nao pode jogar ${mod}`,'warning');blocked=true;}
    if((mod==='SF'||mod==='DF')&&p.gender==='M'){showToast(`${p.firstName} e masculino, nao pode jogar ${mod}`,'warning');blocked=true;}
  });
  if(blocked)return;
  // Adicionar inscricoes ao jogador
  if(!p.inscriptions)p.inscriptions=[];
  let added=0;
  checks.forEach(cb=>{
    const key=cb.value;
    const mod=cb.dataset.mod;
    const cat=cb.dataset.cat;
    if(!p.inscriptions.find(i=>i.key===key)){
      p.inscriptions.push({key,mod,cat,partner:''});
      added++;
    }
  });
  if(!added){showToast('Jogador ja inscrito nesses eventos','info');closeModal('modal-entry');return;}
  // Sincronizar entries e salvar
  syncEntriesFromPlayers();
  closeModal('modal-entry');
  renderRoster();
  showToast(`${p.firstName} ${p.lastName} inscrito em ${added} evento(s)!`);
}

// === BACKUP COMPLETO (Settings > Geral) ===
async function exportBackup(){
  try{
    // Incluir dados do localStorage (arbitros e perfis de jogo) no backup
    const localData={
      umpires:loadUmpires(),
      gameProfiles:gameProfiles
    };
    const result=await window.api.exportFullBackup(localData);
    if(result)showToast('Backup completo exportado! (inclui arbitros e perfis de jogo)');
  }catch(e){showToast('Erro: '+e.message,'error');}
}

async function importBackup(){
  if(!confirm('Importar backup ira substituir TODOS os dados atuais (torneio, configuracoes, arbitros, perfis de jogo).\n\nDeseja continuar?'))return;
  try{
    const result=await window.api.importFullBackup();
    if(!result)return;
    // Restaurar dados do localStorage se existirem no backup
    if(result.umpires){saveUmpires(result.umpires);}
    if(result.gameProfiles){gameProfiles=result.gameProfiles;saveGameProfiles();}
    showToast('Backup importado! Recarregando...');
    setTimeout(()=>location.reload(),500);
  }catch(e){showToast('Erro: '+e.message,'error');}
}

// === REPORTS ===
// printReport + reportEntries/reportDraws/reportResults/reportOOP/reportWinners/
// reportClassification/reportRankingFederados/reportAtletasPorClube/reportMedalhasPorClube/
// reportPlayers/reportBracketSVG/reportRoundRobinTable — extraidas pra
// src/js/modules/reports.js (issue #14 sub-tarefa 14.B). Continuam globais.

// updateEliminationMatchesInList extraida pra src/js/modules/bracket-mutators.js (issue #14.L)
function prepareRankingsForSync(){
  if(!tournament?.draws)return;
  tournament._rankings={};
  (tournament.draws||[]).forEach(d=>{
    const r=computeDrawRanking(d);
    if(r&&r.length)tournament._rankings[d.name]=r;
  });
}

function computeDrawRanking(d){
  if(!d.matches?.length)return null;
  if(d.type==='Eliminatoria')return computeEliminationRanking(d);
  if(d.type==='Grupos + Eliminatoria'&&d.groupsData?.eliminationMatches?.length){
    return computeEliminationRanking({matches:d.groupsData.eliminationMatches});
  }
  return computeRoundRobinRanking(d);
}

function computeEliminationRanking(d){
  const totalRounds=Math.max(...d.matches.map(m=>m.round));
  const finalMatch=d.matches.find(m=>m.round===totalRounds);
  if(!finalMatch||!finalMatch.winner)return null;
  const first=finalMatch.winner===1?finalMatch.player1:finalMatch.player2;
  const second=finalMatch.winner===1?finalMatch.player2:finalMatch.player1;
  const ranking=[{pos:1,name:first},{pos:2,name:second}];
  // 3rd place: losers of semifinals
  if(totalRounds>=2){
    const semis=d.matches.filter(m=>m.round===totalRounds-1);
    semis.forEach(sm=>{
      if(!sm.winner)return;
      const loser=sm.winner===1?sm.player2:sm.player1;
      if(loser&&loser!=='BYE'&&loser!==first&&loser!==second){
        ranking.push({pos:3,name:loser});
      }
    });
  }
  return ranking;
}

function computeRoundRobinRanking(d){
  if(!d.players?.length)return null;
  // Compute stats for each player
  const stats={};
  d.players.forEach(p=>{stats[p]={name:p,wins:0,losses:0,ptsFor:0,ptsAgainst:0,headToHead:{}};});
  (d.matches||[]).forEach(m=>{
    if(m.winner===undefined)return;
    const p1=m.player1,p2=m.player2;
    if(!stats[p1]||!stats[p2])return;
    // Parse scores for point difference
    let p1Pts=0,p2Pts=0;
    if(m.score1&&m.score2&&m.score1!=='W.O.'&&m.score2!=='W.O.'){
      const s1Parts=String(m.score1).split(' ').map(Number).filter(n=>!isNaN(n));
      const s2Parts=String(m.score2).split(' ').map(Number).filter(n=>!isNaN(n));
      s1Parts.forEach(v=>p1Pts+=v);
      s2Parts.forEach(v=>p2Pts+=v);
    }
    if(m.winner===1){
      stats[p1].wins++;stats[p2].losses++;
      stats[p1].headToHead[p2]=1;stats[p2].headToHead[p1]=0;
    } else if(m.winner===2){
      stats[p2].wins++;stats[p1].losses++;
      stats[p2].headToHead[p1]=1;stats[p1].headToHead[p2]=0;
    }
    stats[p1].ptsFor+=p1Pts;stats[p1].ptsAgainst+=p2Pts;
    stats[p2].ptsFor+=p2Pts;stats[p2].ptsAgainst+=p1Pts;
  });
  // Calcular ptsDiff
  Object.values(stats).forEach(s=>{s.ptsDiff=s.ptsFor-s.ptsAgainst;});
  // Ordenar: 1) mais vitorias, 2) diferenca de pontos, 3) mais pontos marcados, 4) confronto direto
  const arr=Object.values(stats);
  arr.sort((a,b)=>{
    // 1. Mais vitorias
    if(b.wins!==a.wins)return b.wins-a.wins;
    // 2. Diferenca de pontos
    if(b.ptsDiff!==a.ptsDiff)return b.ptsDiff-a.ptsDiff;
    // 3. Mais pontos marcados
    if(b.ptsFor!==a.ptsFor)return b.ptsFor-a.ptsFor;
    // 4. Confronto direto
    if(a.headToHead[b.name]!==undefined){
      if(a.headToHead[b.name]===1)return-1;
      if(a.headToHead[b.name]===0)return 1;
    }
    return 0;
  });
  // Assign positions
  const ranking=[];
  arr.forEach((s,i)=>{
    const pos=i+1;
    ranking.push({pos:Math.min(pos,3),name:s.name,wins:s.wins,losses:s.losses,ptsFor:s.ptsFor,ptsAgainst:s.ptsAgainst,ptsDiff:s.ptsFor-s.ptsAgainst});
  });
  return ranking;
}

// === TOAST ===
function showToast(msg,type='success'){document.querySelectorAll('.toast').forEach(t=>t.remove());const c={success:{bg:'#D1FAE5',b:'#10B981',c:'#065F46',i:'&#10003;'},error:{bg:'#FEE2E2',b:'#EF4444',c:'#991B1B',i:'&#10007;'},warning:{bg:'#FEF3C7',b:'#F59E0B',c:'#92400E',i:'&#9888;'},info:{bg:'#DBEAFE',b:'#3B82F6',c:'#1E3A8A',i:'&#8505;'}}[type]||{bg:'#D1FAE5',b:'#10B981',c:'#065F46',i:'&#10003;'};const t=document.createElement('div');t.className='toast';t.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:999;padding:12px 20px;border-radius:8px;background:${c.bg};border:1px solid ${c.b};color:${c.c};font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:400px;display:flex;align-items:center;gap:8px;`;t.innerHTML=`<span>${c.i}</span> ${esc(msg)}`;document.body.appendChild(t);setTimeout(()=>{if(t.parentNode)t.remove();},4000);}

// === HELPERS ===
function openModal(id){const el=document.getElementById(id);if(!el)return;el.classList.add('active');setTimeout(()=>{const f=el.querySelector('select,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([readonly])');if(f)f.focus();},50);}
function closeModal(id){document.getElementById(id)?.classList.remove('active');}
function gv(id){return(document.getElementById(id)?.value||'').trim();}
function gc(id){return document.getElementById(id)?.checked||false;}
function fmtDate(s){if(!s)return'-';try{return new Date(s+'T00:00:00').toLocaleDateString('pt-BR');}catch{return s;}}
function statusTag(t){if(!t?.startDate)return'<span class="tag tag-gray">Rascunho</span>';const n=new Date(),s=new Date(t.startDate+'T00:00:00'),e=new Date((t.endDate||t.startDate)+'T23:59:59');if(n<s)return'<span class="tag tag-blue">Agendado</span>';if(n<=e)return'<span class="tag tag-green">Em andamento</span>';return'<span class="tag tag-gray">Finalizado</span>';}
let _filterPlayersTimer=null;
function filterPlayers() {
  clearTimeout(_filterPlayersTimer);
  _filterPlayersTimer=setTimeout(()=>filterTable('search-players','players-table-body'),150);
}
// Sanitizacao HTML (OWASP): use em conteudo de tag (`<td>${esc(x)}</td>`) e
// em atributo entre aspas duplas (`<a href="${esc(url)}">`).
function esc(s){return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\//g,'&#x2F;'):'';}

// safeHTML: para casos onde a string pode conter HTML legitimo (formatacao,
// links). Usa DOMPurify (vendor/purify.min.js) com allowlist conservadora.
// Quando DOMPurify nao esta carregado (test, dev sem vendor), faz fallback
// pra esc() — degrada graceful.
//
// Uso correto: `el.innerHTML = safeHTML(userMarkup, { ALLOWED_TAGS: ['b','br'] })`
// NAO usar pra dados que ja passam por esc() em template — esc() e mais seguro
// e barato pra texto puro.
function safeHTML(html, opts) {
  if (!html) return '';
  if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    return window.DOMPurify.sanitize(String(html), opts || {
      ALLOWED_TAGS: ['b','i','strong','em','br','span','small','sub','sup'],
      ALLOWED_ATTR: ['class','style'],
      FORBID_TAGS: ['script','style','iframe','object','embed','svg','math'],
      FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur','formaction','href','src']
    });
  }
  // Fallback: escape total (texto sem HTML)
  return esc(html);
}

// =====================================================================
// EVENT DELEGATION — substitui inline handlers em template strings.
// Em vez de:   <button onclick="foo('${esc(id)}',${idx})">X</button>
// Usar:        <button data-action="foo" data-arg-1="${esc(id)}" data-arg-2="${idx}">X</button>
// E o delegate global chama window.foo(arg1, arg2) no click do botao.
//
// Args sao convertidos:
//   '$value'   -> el.value
//   '$el'      -> o proprio elemento
//   '$checked' -> el.checked
//   '$event'   -> o Event original
//   'true'/'false'/'null'/'undefined' -> bool/null/undefined
//   Number/Number.Decimal -> Number
//   resto -> string literal
//
// Atributos:
//   data-action          (obrigatorio; suporta namespace: "api.openExternal")
//   data-arg-1..N        (em ordem, preserva tipo coercido)
//   data-event           (default 'click'; outros: 'change', 'input' — pode listar
//                         multiplos separados por espaco: "change input")
//   data-prevent-default (se "true", e.preventDefault() antes de invocar)
// =====================================================================
function _resolveAction(name) {
  if (!name) return { fn: null, ctx: null };
  const parts = name.split('.');
  let ctx = window;
  for (let i = 0; i < parts.length; i++) {
    if (ctx == null) return { fn: null, ctx: null };
    if (i === parts.length - 1) {
      const fn = ctx[parts[i]];
      return typeof fn === 'function' ? { fn, ctx: parts.length > 1 ? ctx : null } : { fn: null, ctx: null };
    }
    ctx = ctx[parts[i]];
  }
  return { fn: null, ctx: null };
}
function _coerceArg(s, el, ev) {
  if (s === '$value') return el.value;
  if (s === '$el') return el;
  if (s === '$checked') return el.checked;
  if (s === '$event') return ev;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (s === 'undefined') return undefined;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}
function _collectArgs(el, ev) {
  // Usar getAttribute em vez de dataset: dataset converte hifen-letra pra camelCase
  // mas hifen-digito (`data-arg-1`) tem comportamento inconsistente entre browsers.
  // getAttribute le o atributo HTML literal, sempre confiavel.
  const args = [];
  for (let i = 1; ; i++) {
    const v = el.getAttribute('data-arg-' + i);
    if (v === null) break;
    args.push(_coerceArg(v, el, ev));
  }
  return args;
}
function _delegateHandler(eventType) {
  return function(e) {
    // e.target pode ser TextNode (clique em texto); closest() so existe em Element.
    // Usar nodeType===1 (ELEMENT_NODE) que e cross-realm safe — `instanceof Element`
    // falha quando _registerDelegate e usado em document de popup/iframe (cada
    // realm tem seu proprio Element constructor).
    const target = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
    if (!target || typeof target.closest !== 'function') return;
    const el = target.closest('[data-action]');
    if (!el) return;
    const expectedEvents = (el.dataset.event || 'click').split(/\s+/);
    if (!expectedEvents.includes(eventType)) return;
    const action = el.dataset.action;
    const { fn, ctx } = _resolveAction(action);
    if (!fn) { console.warn('[delegate] acao desconhecida:', action); return; }
    const args = _collectArgs(el, e);
    // data-prevent-default="true" -> e.preventDefault() (ex: <a href="#"> handlers)
    if (el.getAttribute('data-prevent-default') === 'true') e.preventDefault();
    try { fn.apply(ctx, args); } catch (err) { console.error('[delegate] erro em', action, err); }
  };
}
// Reutilizavel: registra delegate em qualquer document (principal ou popup).
function _registerDelegate(doc) {
  doc.addEventListener('click', _delegateHandler('click'));
  doc.addEventListener('change', _delegateHandler('change'));
  doc.addEventListener('input', _delegateHandler('input'));
}
_registerDelegate(document);

// Wrappers globais pra acoes compostas migradas do index.html (issue #11.B).
// Cada wrapper substitui um inline handler multi-statement / DOM-manipulation.
window.closeUpdateBar = function() {
  const bar = document.getElementById('update-bar');
  if (bar) bar.style.display = 'none';
};
window.quickActionNewTournament = function() {
  if (typeof navigateTo === 'function') navigateTo('tournaments');
  setTimeout(() => typeof showNewTournamentModal === 'function' && showNewTournamentModal(), 100);
};
window.quickActionNewPlayer = function() {
  if (typeof navigateTo === 'function') navigateTo('players');
  setTimeout(() => typeof showNewPlayerModal === 'function' && showNewPlayerModal(), 100);
};
window.clickLogoFileInput = function() {
  const inp = document.getElementById('logo-file-input');
  if (inp) inp.click();
};

// =====================================================================
// AUTO-UPDATER UI (issue #13)
// Mostra modal "nova atualizacao disponivel" quando main process detecta.
// Sim -> baixa em background + reinicia automaticamente em quitAndInstall.
// Nao -> popup fecha; volta no proximo open (main re-checa a cada startup).
// =====================================================================
let _updateInfo = null;
function setupAutoUpdaterUI() {
  if (!window.api?.onUpdateAvailable) return;
  window.api.onUpdateAvailable((info) => {
    _updateInfo = info;
    _showUpdateModal('available');
  });
  window.api.onUpdateProgress((p) => {
    const bar = document.getElementById('update-progress-bar');
    const pct = document.getElementById('update-progress-pct');
    if (bar) bar.style.width = p.percent + '%';
    if (pct) pct.textContent = p.percent + '%';
  });
  window.api.onUpdateDownloaded((info) => {
    _updateInfo = info;
    _showUpdateModal('ready');
  });
  window.api.onUpdateError((err) => {
    console.warn('[updater] erro:', err?.message);
    showToast('Falha no auto-update: ' + (err?.message || 'erro desconhecido'), 'error');
    _hideUpdateModal();
  });
}
function _showUpdateModal(state) {
  let modal = document.getElementById('update-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'update-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.7);z-index:99998;display:flex;align-items:center;justify-content:center';
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  const v = _updateInfo?.version || '?';
  if (state === 'available') {
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 12px;color:#1E3A8A">Nova atualizacao disponivel</h3>
        <p style="margin:0 0 8px;color:#475569;font-size:14px">Versao <strong>v${esc(String(v))}</strong> pronta pra baixar.</p>
        <p style="margin:0 0 20px;color:#94A3B8;font-size:12px">Atualizar agora baixa em background e reinicia o app automaticamente.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" data-action="updaterDecline">Mais tarde</button>
          <button class="btn btn-primary" data-action="updaterAccept">Atualizar agora</button>
        </div>
      </div>`;
  } else if (state === 'downloading') {
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 12px;color:#1E3A8A">Baixando v${esc(String(v))}...</h3>
        <div style="background:#E2E8F0;border-radius:6px;height:8px;overflow:hidden;margin-bottom:8px">
          <div id="update-progress-bar" style="background:#3B82F6;height:100%;width:0%;transition:width .2s"></div>
        </div>
        <p style="margin:0;color:#64748B;font-size:13px;text-align:center"><span id="update-progress-pct">0%</span></p>
      </div>`;
  } else if (state === 'ready') {
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 12px;color:#065F46">Atualizacao baixada!</h3>
        <p style="margin:0 0 20px;color:#475569;font-size:14px">v${esc(String(v))} pronta. App vai reiniciar pra aplicar.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" data-action="updaterDeclineInstall">Reiniciar depois</button>
          <button class="btn btn-primary" data-action="updaterInstallNow">Reiniciar agora</button>
        </div>
      </div>`;
  }
}
function _hideUpdateModal() {
  const modal = document.getElementById('update-modal');
  if (modal) modal.style.display = 'none';
}
window.updaterAccept = async function() {
  _showUpdateModal('downloading');
  try {
    const res = await window.api.updaterDownload();
    if (res && res.ok === false) {
      // Falha sincrona — UI fica presa em 'downloading' sem este fallback
      showToast('Falha ao baixar atualizacao: ' + (res.error || 'erro desconhecido'), 'error');
      _showUpdateModal('available');
    }
  } catch (e) {
    showToast('Falha ao baixar atualizacao: ' + (e?.message || String(e)), 'error');
    _showUpdateModal('available');
  }
};
window.updaterDecline = function() { _hideUpdateModal(); };
window.updaterInstallNow = function() { window.api.updaterInstall(); };
window.updaterDeclineInstall = function() { _hideUpdateModal(); };
