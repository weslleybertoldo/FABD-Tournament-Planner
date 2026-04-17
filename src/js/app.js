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
    console.log('[INIT] Done!');
  } catch(e) {
    console.error('[INIT] ERROR:', e.message, e.stack);
    alert('Erro ao iniciar: ' + e.message);
  }
});

// === AUTH (login OTP por email) ===
let _authState = { email: '' };

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
      `<button class="btn btn-sm" style="background:#F3F4F6;color:#374151;margin-right:4px" onclick="toggleAccessOrganizer('${esc(o.email)}',${!o.active})">${o.active?'Desativar':'Ativar'}</button>
       <button class="btn btn-sm btn-danger" onclick="removeAccessOrganizer('${esc(o.email)}')">Remover</button>`;
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

// === CATEGORY BY AGE ===
function calculateCategory(dob) {
  if (!dob) return 'Principal';
  // Aceitar formatos DD/MM/YYYY e YYYY-MM-DD
  let birthYear;
  const brMatch = dob.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) { birthYear = parseInt(brMatch[3]); }
  else {
    const isoMatch = dob.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) { birthYear = parseInt(isoMatch[1]); }
    else { return 'Principal'; }
  }
  const age = new Date().getFullYear() - birthYear;

  // Regra: "ate X anos ESTE ANO" = ano_atual - ano_nascimento
  if (age <= 10) return 'Sub 11';
  if (age <= 12) return 'Sub 13';
  if (age <= 14) return 'Sub 15';
  if (age <= 16) return 'Sub 17';
  if (age <= 18) return 'Sub 19';
  if (age <= 22) return 'Sub 23';
  if (age >= 55) return 'Master II';
  if (age >= 45) return 'Master I';
  if (age >= 35) return 'Senior';
  return 'Principal';
}

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
    case 'players': renderPlayers(); break;
    case 'roster': showTournamentPages(); renderRoster(); break;
    case 'draws': showTournamentPages(); renderDraws(); break;
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
    <td><button class="btn btn-sm btn-primary" onclick="navigateTo('players')">Gerenciar</button></td></tr>
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
      <button class="btn btn-sm btn-secondary" onclick="showTournamentConfig()" title="Configuracao">&#9881;</button>
      <button class="btn btn-sm btn-secondary" onclick="exportTournamentBackup()" title="Backup">&#128230;</button>
      <button class="btn btn-sm btn-danger" onclick="closeTournament()">Fechar Torneio</button>
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
function renderPlayers() {
  const tb = document.getElementById('players-table-body');
  const em = document.getElementById('players-empty');
  if (!tournament) { tb.innerHTML=''; em.style.display='block'; em.querySelector('h3').textContent='Nenhum torneio ativo'; return; }
  if (!players.length) { tb.innerHTML=''; em.style.display='block'; return; }
  em.style.display = 'none';
  let h = '';
  players.forEach(p => {
    const autoCat = calculateCategory(p.dob);
    const inscriptions = (p.inscriptions||[]).length;
    const hasConflict = checkCategoryConflict(p.dob, p.inscriptions);
    const aloneKeys = checkAloneInCategory(p.inscriptions);
    const hasAlone = aloneKeys.length > 0;
    const nameStyle = hasConflict ? 'color:#DC2626' : hasAlone ? 'color:#D97706' : '';
    const conflictIcon = hasConflict ? '<span title="Atleta inscrito em categoria incompativel com a idade" style="color:#DC2626;cursor:help;margin-left:4px">&#9888;</span>' : '';
    const aloneIcon = hasAlone ? '<span title="Sozinho em: '+aloneKeys.join(', ')+' (precisa de mais inscritos)" style="color:#D97706;cursor:help;margin-left:4px">&#9888;</span>' : '';
    h += `<tr>
      <td><strong style="${nameStyle}">${esc(p.firstName)} ${esc(p.lastName)}${conflictIcon}${aloneIcon}</strong>${hasAlone?'<div style="font-size:10px;color:#D97706;margin-top:2px">Sozinho em: '+aloneKeys.map(k=>'<strong>'+esc(k)+'</strong>').join(', ')+'</div>':''}</td>
      <td>${p.gender==='M'?'Masc':p.gender==='F'?'Fem':'-'}</td>
      <td>${fmtDate(p.dob)}</td>
      <td><span class="tag tag-blue">${esc(autoCat)}</span></td>
      <td>${esc(p.club)||'-'}</td>
      <td>${esc(p.state)||'-'}</td>
      <td>${inscriptions > 0 ? `<span class="tag tag-green">${inscriptions} cat.</span>` : '<span class="tag tag-gray">0</span>'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editPlayer('${p.id}')">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="deletePlayer('${p.id}')">Excluir</button>
      </td></tr>`;
  });
  tb.innerHTML = h;
}

function showNewPlayerModal() {
  if (!tournament) { showToast('Crie um torneio primeiro', 'warning'); return; }
  editingPlayerId = null;
  ['p-firstname','p-lastname','p-dob','p-club','p-phone','p-email','p-ranking'].forEach(id=>{ const e=document.getElementById(id); if(e){e.value='';e.classList.remove('error','valid');} });
  document.getElementById('p-gender').value = '';
  document.getElementById('p-state').value = 'AL';
  document.getElementById('p-autocat').textContent = '-';
  document.getElementById('modal-player-title').textContent = 'Novo Jogador';
  // Sempre abrir na aba Dados (categorias renderizadas sob demanda ao clicar na aba)
  document.querySelectorAll('#player-tabs .tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('p-tab-dados').style.display='';
  document.getElementById('p-tab-categorias').style.display='none';
  document.getElementById('p-tab-inscricao').style.display='none';
  document.getElementById('p-categories-list').innerHTML='';
  document.getElementById('p-valor-categoria').value=30;
  document.getElementById('p-pagamento-status').value='pago';
  openModal('modal-player');
  requestAnimationFrame(()=>document.getElementById('p-firstname')?.focus());
}

function editPlayer(id) {
  const p = players.find(x=>x.id===id);
  if (!p) return;
  editingPlayerId = p.id;
  document.getElementById('p-firstname').value = p.firstName||'';
  document.getElementById('p-lastname').value = p.lastName||'';
  document.getElementById('p-gender').value = p.gender||'';
  document.getElementById('p-dob').value = p.dob||'';
  document.getElementById('p-club').value = p.club||'';
  document.getElementById('p-state').value = p.state||'';
  document.getElementById('p-ranking').value = p.ranking||'';
  document.getElementById('p-phone').value = p.phone||'';
  document.getElementById('p-email').value = p.email||'';
  document.getElementById('p-autocat').textContent = calculateCategory(p.dob);
  document.getElementById('modal-player-title').textContent = 'Editar Jogador';
  // Sempre abrir na aba Dados e limpar categorias antigas
  document.querySelectorAll('#player-tabs .tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('p-tab-dados').style.display='';
  document.getElementById('p-tab-categorias').style.display='none';
  document.getElementById('p-tab-inscricao').style.display='none';
  document.getElementById('p-categories-list').innerHTML='';
  document.getElementById('p-valor-categoria').value=p.valorCategoria||30;
  document.getElementById('p-pagamento-status').value=p.pagamentoStatus||'pago';
  openModal('modal-player');
}

// Renderiza aba de categorias no modal do jogador
function renderPlayerCategories(player) {
  const container = document.getElementById('p-categories-list');
  if (!container) return;
  const inscriptions = player?.inscriptions || [];
  const gender = document.getElementById('p-gender')?.value || player?.gender || '';

  const buildPartnerOpts=(playerId,g,modCode,catKey,selected)=>{
    let opts='';
    players.forEach(p=>{
      if(p.id===playerId)return;
      if(modCode==='DM'&&p.gender!=='M')return;
      if(modCode==='DF'&&p.gender!=='F')return;
      const jaTemDupla=(p.inscriptions||[]).some(i=>i.key===catKey&&i.partner&&i.partner!==playerId);
      if(jaTemDupla)return;
      const name=`${p.firstName} ${p.lastName}`;
      const isSel=String(selected)===String(p.id);
      opts+=`<option value="${p.id}"${isSel?' selected':''}>${esc(name)}</option>`;
    });
    return opts;
  };

  const items=[];
  CATEGORIES.forEach(cat=>{
    MODALITIES.forEach(mod=>{
      if((mod.code==='SM'||mod.code==='DM')&&gender==='F')return;
      if((mod.code==='SF'||mod.code==='DF')&&gender==='M')return;
      items.push({mod,cat,key:`${mod.code} ${cat}`});
    });
  });

  let h='';
  items.forEach(({mod,cat,key})=>{
    const insc=inscriptions.find(i=>i.key===key);
    const checked=!!insc;
    h+=`<div class="cat-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--fabd-gray-200)">
      <input type="checkbox" class="p-cat-check" data-key="${esc(key)}" data-mod="${mod.code}" data-cat="${esc(cat)}" ${checked?'checked':''} onchange="onCatCheckChange(this)">
      <span style="flex:1;font-size:13px"><strong>${mod.code}</strong> ${esc(cat)}</span>
      <span class="tag tag-gray" style="font-size:10px">Inscrito</span>`;
    if(mod.isDupla&&checked){
      h+=`<select class="form-control p-partner-select" data-key="${esc(key)}" style="width:160px;padding:2px 4px;font-size:11px">
        <option value="">Selecionar dupla...</option>
        ${buildPartnerOpts(player?.id,gender,mod.code,key,insc?.partner||'')}
      </select>`;
    }
    h+='</div>';
  });
  container.innerHTML=h;
}

function onCatCheckChange(checkbox) {
  // Re-renderizar para mostrar/esconder campo de dupla
  // Coletar estado atual antes
  const currentInscriptions = collectInscriptions();
  const player = editingPlayerId ? players.find(p=>p.id===editingPlayerId) : null;
  const tempPlayer = player ? {...player, inscriptions: currentInscriptions} : {inscriptions: currentInscriptions, gender: document.getElementById('p-gender').value};
  renderPlayerCategories(tempPlayer);
}

function collectInscriptions() {
  const inscriptions = [];
  document.querySelectorAll('.p-cat-check:checked').forEach(cb => {
    const key = cb.dataset.key;
    const mod = cb.dataset.mod;
    const cat = cb.dataset.cat;
    let partner = '';
    const partnerSelect = document.querySelector(`.p-partner-select[data-key="${key}"]`);
    if (partnerSelect) partner = partnerSelect.value;
    inscriptions.push({ key, mod, cat, partner });
  });
  return inscriptions;
}

function setPlayerTab(el, panelId) {
  document.querySelectorAll('#player-tabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('p-tab-dados').style.display = panelId==='p-tab-dados' ? '' : 'none';
  document.getElementById('p-tab-categorias').style.display = panelId==='p-tab-categorias' ? '' : 'none';
  document.getElementById('p-tab-inscricao').style.display = panelId==='p-tab-inscricao' ? '' : 'none';
  if (panelId === 'p-tab-categorias') {
    const p = editingPlayerId ? players.find(x=>x.id===editingPlayerId) : null;
    const hasCheckboxes = document.querySelectorAll('.p-cat-check').length > 0;
    const currentInscs = hasCheckboxes ? collectInscriptions() : (p?.inscriptions || []);
    renderPlayerCategories(p ? {...p, inscriptions: currentInscs} : {inscriptions: currentInscs, gender: document.getElementById('p-gender').value, dob: document.getElementById('p-dob').value});
  }
  if (panelId === 'p-tab-inscricao') renderInscricaoTab();
}

function renderInscricaoTab(){
  const p=editingPlayerId?players.find(x=>x.id===editingPlayerId):null;
  const inscs=p?.inscriptions||[];
  const valorCat=p?.valorCategoria||30;
  const pagStatus=p?.pagamentoStatus||'pago';
  document.getElementById('p-valor-categoria').value=valorCat;
  document.getElementById('p-pagamento-status').value=pagStatus;
  const container=document.getElementById('p-inscricao-resumo');
  const catCount=inscs.length;
  const total=catCount*valorCat;
  let h=`<h4 style="margin-bottom:12px;color:var(--fabd-blue)">Resumo de Inscricao</h4>`;
  if(catCount){
    h+=`<table style="width:100%;border-collapse:collapse;font-size:13px">`;
    h+=`<thead><tr style="background:var(--fabd-gray-200)"><th style="padding:6px 10px;text-align:left">Categoria</th><th style="padding:6px 10px;text-align:right">Valor</th></tr></thead><tbody>`;
    inscs.forEach(i=>{h+=`<tr><td style="padding:6px 10px">${esc(i.key)}</td><td style="padding:6px 10px;text-align:right">R$ ${valorCat.toFixed(2)}</td></tr>`;});
    h+=`<tr style="background:var(--fabd-gray-200);font-weight:700"><td style="padding:8px 10px">Total (${catCount} categoria${catCount>1?'s':''})</td><td style="padding:8px 10px;text-align:right;color:var(--fabd-blue);font-size:16px">R$ ${total.toFixed(2)}</td></tr>`;
    h+=`</tbody></table>`;
  } else {
    h+=`<p style="color:var(--fabd-gray-500)">Nenhuma categoria inscrita.</p>`;
  }
  const stColors={pendente:'#F59E0B',pago:'#10B981',isento:'#6B7280'};
  const stLabels={pendente:'Pendente',pago:'Pago',isento:'Isento'};
  h+=`<div style="margin-top:12px;padding:10px;background:${stColors[pagStatus]}22;border-radius:8px;border-left:4px solid ${stColors[pagStatus]}"><span style="font-weight:700;color:${stColors[pagStatus]}">${stLabels[pagStatus]}</span></div>`;
  container.innerHTML=h;
}

function onGenderChange() {
  // Re-renderizar categorias quando muda genero
  const p = editingPlayerId ? players.find(x=>x.id===editingPlayerId) : null;
  renderPlayerCategories(p || {gender: document.getElementById('p-gender').value, inscriptions: []});
}

function onDobChange() {
  const dob = document.getElementById('p-dob').value;
  document.getElementById('p-autocat').textContent = calculateCategory(dob);
}

async function savePlayer() {
  try {
    if (!validateForm(['p-firstname','p-lastname','p-gender'])) return;
    // Se aba Categorias nunca foi aberta, preservar inscricoes originais
    const hasCheckboxes = document.querySelectorAll('.p-cat-check').length > 0;
    const inscriptions = hasCheckboxes ? collectInscriptions() : (editingPlayerId ? (players.find(x=>x.id===editingPlayerId)?.inscriptions || []) : []);

    const trimmedFirst = gv('p-firstname').trim();
    const trimmedLast = gv('p-lastname').trim();
    if (!trimmedFirst && !trimmedLast) { showToast('Nome e sobrenome nao podem estar ambos vazios', 'warning'); return; }

    const p = {
      firstName: trimmedFirst, lastName: trimmedLast, gender: gv('p-gender'),
      dob: gv('p-dob'), club: gv('p-club'), state: gv('p-state'),
      category: calculateCategory(gv('p-dob')),
      ranking: gv('p-ranking'), phone: gv('p-phone'), email: gv('p-email'),
      valorCategoria: parseInt(document.getElementById('p-valor-categoria')?.value)||30,
      pagamentoStatus: document.getElementById('p-pagamento-status')?.value||'pago',
      inscriptions
    };
    if (editingPlayerId) p.id = editingPlayerId;

    // Se editando, verificar se o nome mudou e propagar
    if (editingPlayerId) {
      const oldPlayer = players.find(x=>x.id===editingPlayerId);
      if (oldPlayer) {
        const oldName = `${oldPlayer.firstName} ${oldPlayer.lastName}`.trim();
        const newName = `${p.firstName} ${p.lastName}`.trim();
        if (oldName !== newName && oldName) {
          // Bloquear rename se jogador tem jogo Em Quadra
          const inCourt = (tournament.matches||[]).some(m =>
            m.status === 'Em Quadra' && (
              (m.player1 && m.player1.includes(oldName)) ||
              (m.player2 && m.player2.includes(oldName))
            )
          );
          if (inCourt) {
            showToast('Nao pode renomear jogador com jogo em quadra. Tire o jogo da quadra primeiro.');
            return;
          }
          // Atualizar em entries
          (tournament.entries||[]).forEach(e=>{
            if(e.playerName===oldName)e.playerName=newName;
          });
          // Atualizar em matches (player1, player2, player1Display, player2Display)
          (tournament.matches||[]).forEach(m=>{
            if(m.player1===oldName){m.player1=newName;m.player1Display=newName;}
            if(m.player2===oldName){m.player2=newName;m.player2Display=newName;}
            // Duplas: nome pode estar dentro de "Jogador A / Jogador B"
            if(m.player1&&m.player1.includes('/')&&m.player1.includes(oldName)){
              m.player1=m.player1.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              m.player1Display=m.player1;
            }
            if(m.player2&&m.player2.includes('/')&&m.player2.includes(oldName)){
              m.player2=m.player2.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              m.player2Display=m.player2;
            }
          });
          // Atualizar em draws (players array e matches)
          (tournament.draws||[]).forEach(d=>{
            if(d.players){d.players=d.players.map(n=>n===oldName?newName:n.includes('/')&&n.includes(oldName)?n.split('/').map(x=>x.trim()===oldName?newName:x.trim()).join(' / '):n);}
            (d.matches||[]).forEach(m=>{
              if(m.player1===oldName)m.player1=newName;
              if(m.player2===oldName)m.player2=newName;
              if(m.advancer===oldName)m.advancer=newName;
              if(m.player1&&m.player1.includes('/')&&m.player1.includes(oldName))m.player1=m.player1.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              if(m.player2&&m.player2.includes('/')&&m.player2.includes(oldName))m.player2=m.player2.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
              if(m.advancer&&m.advancer.includes('/')&&m.advancer.includes(oldName))m.advancer=m.advancer.split('/').map(n=>n.trim()===oldName?newName:n.trim()).join(' / ');
            });
          });
          await window.api.saveTournament(tournament);
        }
      }
    }

    const savedPlayer = await window.api.savePlayer(p);
    if (savedPlayer?.id) p.id = savedPlayer.id;

    // Sincronizar duplas bidirecional
    const myId = p.id || editingPlayerId;
    const duplaKeys = new Set(inscriptions.filter(i=>['DM','DF','DX'].includes(i.mod)).map(i=>i.key));

    for (const insc of inscriptions) {
      if (!['DM','DF','DX'].includes(insc.mod)) continue;
      if (insc.partner) {
        // A tem dupla B: marcar em B tambem
        const partner = players.find(x => x.id === insc.partner);
        if (partner) {
          if (!partner.inscriptions) partner.inscriptions = [];
          const existing = partner.inscriptions.find(i => i.key === insc.key);
          if (!existing) {
            partner.inscriptions.push({ key: insc.key, mod: insc.mod, cat: insc.cat, partner: myId });
          } else {
            existing.partner = myId;
          }
          await window.api.savePlayer(partner);
        }
      } else {
        // A nao tem dupla nesta categoria: limpar quem tinha A como partner
        for (const other of players) {
          if (other.id === myId) continue;
          const otherInsc = (other.inscriptions||[]).find(i => i.key === insc.key && i.partner === myId);
          if (otherInsc) {
            otherInsc.partner = '';
            await window.api.savePlayer(other);
          }
        }
      }
    }

    // Limpar parceiros de categorias de dupla que este jogador nao tem mais
    for (const other of players) {
      if (other.id === myId) continue;
      let changed = false;
      (other.inscriptions||[]).forEach(i => {
        if (i.partner === myId && !duplaKeys.has(i.key)) {
          i.partner = '';
          changed = true;
        }
      });
      if (changed) await window.api.savePlayer(other);
    }

    // Recarregar
    tournament = await window.api.getTournament();
    players = tournament?.players || [];
    editingPlayerId = null;
    closeModal('modal-player');
    renderPlayers();
    syncEntriesFromPlayers();
    prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    showToast('Jogador salvo!');
  } catch(e) { console.error(e); showToast('Erro: '+e.message, 'error'); }
}

async function deletePlayer(id) {
  if (!confirm('Excluir este jogador?')) return;
  await window.api.deletePlayer(id);
  tournament = await window.api.getTournament();
  players = tournament?.players || [];
  renderPlayers();
  syncEntriesFromPlayers();
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderDraws();
}

async function deleteAllPlayers() {
  if (!tournament) { showToast('Nenhum torneio ativo', 'warning'); return; }
  if (!players.length) { showToast('Nenhum jogador para excluir', 'warning'); return; }
  if (!confirm(`Excluir TODOS os ${players.length} jogadores?\n\nIsso tambem ira excluir inscritos, chaves e partidas.`)) return;
  if (!confirm('TEM CERTEZA? Esta acao nao pode ser desfeita.')) return;

  tournament.players = [];
  tournament.entries = [];
  tournament.draws = [];
  tournament.matches = [];
  players = [];
  selectedDrawIdx = -1;

  await window.api.saveTournament(tournament);
  prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
  renderPlayers();
  showToast('Todos os jogadores excluidos');
}

// Sincronizar inscritos automaticamente a partir das categorias dos jogadores
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

function filterPlayers() { filterTable('search-players','players-table-body'); }
function filterTournaments() { filterTable('search-tournaments','tournaments-table-body'); }
function filterRoster() { filterTable('search-roster','roster-table-body'); }

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
    const partnerName = e.partner ? (players.find(p=>p.id===e.partner)?.firstName + ' ' + players.find(p=>p.id===e.partner)?.lastName) : '';
    const st = { inscrito:'tag-gray', confirmado:'tag-green', presente:'tag-blue', ausente:'tag-red' };
    h += `<tr>
      <td>${count}</td>
      <td><strong>${esc(e.playerName)}</strong>${partnerName ? '<br><small style="color:var(--fabd-gray-500)">Dupla: '+esc(partnerName)+'</small>':''}</td>
      <td>${esc(e.club)||'-'}</td>
      <td><span class="tag tag-blue">${esc(e.key)}</span></td>
      <td><span class="tag ${st[e.status]||'tag-gray'}">${esc(e.status)}</span></td>
      <td><select class="form-control" style="width:110px;padding:2px 4px;font-size:11px" onchange="updateEntryStatus(${i},this.value)">
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

// === DRAWS (sorteio individual por chave) ===
function renderDraws() {
  if (!tournament) return;
  const listEl = document.getElementById('draws-list');
  const detailEl = document.getElementById('draws-detail');
  const draws = tournament.draws||[];
  const noT = document.getElementById('draws-no-tournament');
  const ct = document.getElementById('draws-content');
  if (!tournament) { noT.style.display='block'; ct.style.display='none'; return; }
  noT.style.display='none'; ct.style.display='block';

  if (!draws.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--fabd-gray-500);font-size:13px">Nenhuma chave criada</div>';
    detailEl.innerHTML = '<div class="empty-state"><div class="icon">&#127960;</div><h3>Crie uma chave</h3></div>';
    return;
  }

  let lh = '';
  draws.forEach((d,i) => {
    const has = d.matches?.length > 0;
    const realMatches=has?(d.matches||[]).filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE'):[];
    const allFinished=realMatches.length>0&&realMatches.every(m=>m.winner!==undefined&&m.winner!==null);
    const st = d.awarded ? '<span class="tag" style="background:#D1FAE5;color:#065F46;border:1px solid #10B981">&#127942; Premiado</span>' : allFinished ? '<span class="tag" style="background:#DBEAFE;color:#1E3A8A;border:1px solid #2563EB">JOGOS FINALIZADOS</span>' : has ? '<span class="tag tag-green">Sorteado</span>' : '<span class="tag tag-yellow">Pendente</span>';
    lh += `<div class="draws-list-item${i===selectedDrawIdx?' active':''}" onclick="selectDraw(${i})">
      <div class="draw-item-name">${esc(d.name)}</div>
      <div class="draw-item-info">${esc(d.type)} - ${d.players?.length||0} jogadores - ${has?(d.type==='Eliminatoria'?(d.players?.length||0)-1:((d.players?.length||0)*((d.players?.length||0)-1)/2)):0} jogos ${st}</div>
    </div>`;
  });
  listEl.innerHTML = lh;
  if (selectedDrawIdx < 0 || selectedDrawIdx >= draws.length) { selectDraw(0); return; }
  renderDrawDetail(selectedDrawIdx);
}

function selectDraw(idx) {
  selectedDrawIdx = idx;
  document.querySelectorAll('.draws-list-item').forEach((el,i)=>el.classList.toggle('active',i===idx));
  renderDrawDetail(idx);
}

function renderDrawDetail(idx) {
  const draws = tournament.draws||[];
  const detailEl = document.getElementById('draws-detail');
  if (idx<0||idx>=draws.length) { detailEl.innerHTML='<div class="empty-state"><h3>Selecione uma chave</h3></div>'; return; }
  const d = draws[idx];
  const has = d.matches?.length > 0;
  const evNames = {SM:'Simples Masculino',SF:'Simples Feminino',DM:'Duplas Masculinas',DF:'Duplas Femininas',DX:'Duplas Mistas'};

  let h = `<div class="card-header"><h3>${esc(d.name)}</h3><div>
    <button class="btn btn-sm btn-success" onclick="generateSingleDraw(${idx})">&#127922; Sortear esta chave</button>
    ${has?`<button class="btn btn-sm" style="background:#EFF6FF;color:#1E40AF;border:1px solid #3B82F6" onclick="regenerateDrawSchedule(${idx})">&#128260; Regenerar agenda</button>`:''}
    ${has?`<button class="btn btn-sm" style="background:${d.awarded?'#D1FAE5;color:#065F46;border:1px solid #10B981':'#FEF3C7;color:#92400E;border:1px solid #F59E0B'}" onclick="toggleAwarded(${idx})">${d.awarded?'&#10003; Premiado':'&#127942; Premiar'}</button>`:''}
    <button class="btn btn-sm btn-danger" onclick="deleteDraw(${idx})">Excluir</button>
  </div></div>
  <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <div><span style="font-size:12px;color:var(--fabd-gray-500)">Evento:</span> <span class="tag tag-blue">${esc(evNames[d.event]||d.event)}</span></div>
    <div><span style="font-size:12px;color:var(--fabd-gray-500)">Tipo:</span> <span class="tag tag-gray">${esc(d.type)}</span></div>
    <div><span style="font-size:12px;color:var(--fabd-gray-500)">Jogadores:</span> <strong>${d.players?.length||0}</strong></div>
    ${d.type==='Grupos + Eliminatoria'?`
      <div style="display:flex;gap:12px;align-items:center;padding:6px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--fabd-gray-600)" title="${has?'Re-sorteie a chave para aplicar mudancas':'Quantidade de grupos'}">
          <span>Grupos:</span>
          <input type="number" min="1" max="8" value="${d.numGroups||2}" ${has?'disabled':''} onchange="updateDrawNumGroups(${idx}, this.value)" style="width:54px;padding:4px 6px;border:1px solid #CBD5E1;border-radius:6px;text-align:center;font-weight:700;${has?'background:#F1F5F9;cursor:not-allowed':''}">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--fabd-gray-600)" title="${has?'Re-sorteie a chave para aplicar mudancas':'Quantos se classificam por grupo para a eliminatoria'}">
          <span>Classificados/grupo:</span>
          <input type="number" min="1" max="4" value="${d.groupQualifiers||2}" ${has?'disabled':''} onchange="updateDrawQualifiers(${idx}, this.value)" style="width:54px;padding:4px 6px;border:1px solid #CBD5E1;border-radius:6px;text-align:center;font-weight:700;${has?'background:#F1F5F9;cursor:not-allowed':''}">
        </label>
        ${has?'<span style="font-size:11px;color:#D97706">(re-sorteie para mudar)</span>':''}
      </div>
    `:''}
  </div>`;

  if (has && d.type==='Eliminatoria') h += renderBracket(d);
  else if (has && d.type==='Grupos + Eliminatoria') {
    // Try to propagate groups to elimination if ready
    if (d.groupsData && areGroupsFinished(d) && !d.groupsData.eliminationGenerated) {
      propagateGroupsToElimination(d);
      // Adicionar matches de eliminatoria diretamente na lista (sync, sem esperar async)
      const elimM = d.groupsData.eliminationMatches || [];
      let groupMatchCount = 0;
      (d.groupsData.groups||[]).forEach(g=>{g.matches.forEach(m=>{if(m.player1&&m.player2&&m.player1!=='BYE'&&m.player2!=='BYE')groupMatchCount++;});});
      const lastNum = Math.max(0,...(tournament.matches||[]).map(m=>m.num||0));
      const totalR = elimM.length ? Math.max(...elimM.map(x=>x.round)) : 1;
      elimM.forEach((em, emIdx) => {
        if (em.player2 === 'BYE' || em.player1 === 'BYE') return;
        const def = !!(em.player1 && em.player2);
        const rn = em.round === totalR ? 'Final' : em.round === totalR - 1 ? 'Semifinal' : 'Quartas';
        // Verificar se ja existe
        const exists = tournament.matches.find(m => m.drawName === d.name && m.phase === 'elimination' && m.drawMatchIdx === groupMatchCount + emIdx);
        if (exists) {
          // Atualizar jogadores se necessario
          if (em.player1 && !exists.player1) { exists.player1 = em.player1; exists.player1Display = em.player1; }
          if (em.player2 && !exists.player2) { exists.player2 = em.player2; exists.player2Display = em.player2; }
          if (exists.player1 && exists.player2 && exists.status === 'A definir') { exists.isDefinida = true; exists.status = 'Pendente'; }
          return;
        }
        tournament.matches.push({
          drawId: d.id, drawName: d.name, event: d.event, round: em.round, roundName: rn,
          drawMatchIdx: groupMatchCount + emIdx, player1: em.player1||'', player2: em.player2||'',
          player1Display: em.player1||'A definir', player2Display: em.player2||'A definir',
          isDefinida: def, score: '', court: '', time: '', umpire: '',
          status: def ? 'Pendente' : 'A definir', phase: 'elimination',
          id: String(lastNum+1+emIdx), num: lastNum+1+emIdx
        });
      });
      window.api.saveTournament(tournament);
      prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    }
    h += renderGroupsElimination(d);
  }
  else if (has) h += renderRoundRobin(d);
  else {
    // Lista de jogadores com opcao de definir cabecas de chave
    const seedList=d.seeds_list||[];
    const maxSeeds=Math.min(Math.floor((d.players||[]).length/2),8);
    h += `<div style="background:var(--fabd-gray-100);border-radius:8px;padding:24px">
      <h3 style="color:var(--fabd-gray-600);margin-bottom:16px">Definir Cabecas de Chave</h3>
      <p style="color:var(--fabd-gray-500);font-size:13px;margin-bottom:12px">Selecione os jogadores cabeca de chave na ordem (1o seed, 2o seed, etc). Eles serao posicionados estrategicamente no bracket.</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <h4 style="margin-bottom:8px;font-size:13px;color:var(--fabd-gray-600)">Cabecas de Chave</h4>
          <div id="seeds-container" style="margin-bottom:12px">`;
    for(let s=0;s<maxSeeds;s++){
      const current=seedList[s]||'';
      h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-weight:700;color:var(--fabd-blue);min-width:24px">${s+1}.</span>
        <select class="form-control" style="flex:1;padding:4px 8px;font-size:12px" onchange="updateSeed(${idx},${s},this.value)">
          <option value="">- Selecionar -</option>`;
      (d.players||[]).forEach(p=>{
        const used=seedList.includes(p)&&seedList[s]!==p;
        h+=`<option value="${esc(p)}"${current===p?' selected':''}${used?' disabled':''}>${esc(p)}</option>`;
      });
      h+=`</select></div>`;
    }
    h+=`</div></div>
        <div style="flex:1;min-width:200px">
          <h4 style="margin-bottom:8px;font-size:13px;color:var(--fabd-gray-600)">Jogadores (${(d.players||[]).length})</h4>
          <div style="font-size:13px;color:var(--fabd-gray-700)">`;
    (d.players||[]).forEach(p=>{
      const seedNum=seedList.indexOf(p);
      h+=`<div style="padding:4px 0;${seedNum>=0?'font-weight:700;color:var(--fabd-blue)':''}">${seedNum>=0?`[${seedNum+1}] `:''}${esc(p)}</div>`;
    });
    h+=`</div></div></div>
      <div style="margin-top:16px;text-align:center">
        <button class="btn btn-success" onclick="generateSingleDraw(${idx})">&#127922; Sortear Agora</button>
      </div>
    </div>`;
  }

  // Ranking section (shown only when ALL matches of this draw are finished)
  let allDrawMatchesFinished;
  if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
    // For groups+elim, all finished = elimination phase exists and is complete
    const elimM=d.groupsData.eliminationMatches||[];
    const realElim=elimM.filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE');
    allDrawMatchesFinished=has&&elimM.length>0&&realElim.every(m=>m.winner!==undefined&&m.winner!==null);
  } else {
    allDrawMatchesFinished=has&&d.matches.filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE').every(m=>m.winner!==undefined&&m.winner!==null);
  }
  if(has&&allDrawMatchesFinished){
    const ranking=computeDrawRanking(d);
    if(ranking&&ranking.length){
      h+=`<div style="margin-top:24px;background:linear-gradient(135deg,#FEF3C7 0%,#FFFBEB 100%);border-radius:12px;padding:20px;border:2px solid #F59E0B">
        <h3 style="color:#92400E;margin-bottom:16px;display:flex;align-items:center;gap:8px"><span style="font-size:20px">&#127942;</span> Ranking / Premiacao</h3>`;
      if(d.type==='Eliminatoria'||d.type==='Grupos + Eliminatoria'){
        ranking.forEach(r=>{
          const medal=r.pos===1?'\uD83E\uDD47':r.pos===2?'\uD83E\uDD48':'\uD83E\uDD49';
          const label=r.pos===1?'1o Lugar - Ouro':r.pos===2?'2o Lugar - Prata':'3o Lugar - Bronze';
          const bg=r.pos===1?'#FEF3C7':r.pos===2?'#F3F4F6':'#FED7AA';
          const color=r.pos===1?'#D97706':r.pos===2?'#6B7280':'#92400E';
          h+=`<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:${bg};border-radius:8px;margin-bottom:8px;border-left:4px solid ${color}">
            <span style="font-size:28px">${medal}</span>
            <div><div style="font-size:11px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
            <div style="font-size:16px;font-weight:700;color:#1a1a1a">${esc(r.name)}</div></div></div>`;
        });
      } else {
        h+='<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#1E3A8A"><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Pos.</th><th style="color:white;padding:6px 10px;text-align:left;font-size:11px">Jogador</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">V</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">D</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Pts+</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Pts-</th><th style="color:white;padding:6px 10px;text-align:center;font-size:11px">Diff</th></tr></thead><tbody>';
        ranking.forEach((r,i)=>{
          const medal=r.pos===1?'\uD83E\uDD47':r.pos===2?'\uD83E\uDD48':r.pos===3?'\uD83E\uDD49':'';
          const bg=i%2===0?'#fff':'#f8f9fa';
          const fw=r.pos<=3?'700':'400';
          const color=r.pos===1?'#D97706':r.pos===2?'#6B7280':r.pos===3?'#92400E':'#1a1a1a';
          h+=`<tr style="background:${bg}"><td style="text-align:center;padding:6px 10px;font-weight:${fw};color:${color}">${medal} ${i+1}o</td><td style="padding:6px 10px;font-weight:${fw}">${esc(r.name)}</td><td style="text-align:center;padding:6px 10px">${r.wins}</td><td style="text-align:center;padding:6px 10px">${r.losses}</td><td style="text-align:center;padding:6px 10px">${r.ptsFor}</td><td style="text-align:center;padding:6px 10px">${r.ptsAgainst}</td><td style="text-align:center;padding:6px 10px;font-weight:700;color:${r.ptsDiff>0?'#059669':r.ptsDiff<0?'#DC2626':'#666'}">${r.ptsDiff>0?'+':''}${r.ptsDiff}</td></tr>`;
        });
        h+='</tbody></table>';
      }
      h+='</div>';
    }
  }

  detailEl.innerHTML = h;
}

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
  if (d.matches?.length && !confirm('Esta chave ja foi sorteada. Deseja sortear novamente?')) return;
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
function generateEliminationBracket(playerList, seeds) {
  seeds=seeds||[];
  const allPlayers=[...seeds,...playerList];
  const n=allPlayers.length;
  if(n<2)return[];
  const bracketSize=Math.pow(2,Math.ceil(Math.log2(n)));
  const numByes=bracketSize-n;
  const r1Matches=bracketSize/2;
  const totalRounds=Math.log2(bracketSize);

  // Posicoes padrao dos seeds (indices no bracket de tamanho bracketSize)
  // Usa seeding padrao de torneio: seed 1 topo, seed 2 fundo, 3 e 4 em quartas opostas
  function getStandardSeedPositions(size){
    if(size<=1)return[0];
    if(size===2)return[0,1];
    // Gerar recursivamente as posicoes de seeding padrao
    let pos=[0,1];
    while(pos.length<size){
      const next=[];
      const len=pos.length;
      for(let i=0;i<pos.length;i++){
        next.push(pos[i]*2);
        next.push(len*2-1-pos[i]*2);
      }
      pos=next;
    }
    return pos.slice(0,size);
  }

  // Criar slots do bracket
  const slots=new Array(bracketSize).fill('BYE');
  const seedPos=getStandardSeedPositions(bracketSize);

  // Posicionar todos os jogadores: seeds primeiro nas posicoes de seeding, depois os demais
  // Seeds vao nas primeiras posicoes do seedPos, jogadores normais nas seguintes
  for(let i=0;i<allPlayers.length;i++){
    slots[seedPos[i]]=allPlayers[i];
  }

  // Montar pares da R1
  const matches=[];
  for(let i=0;i<r1Matches;i++){
    const s1=slots[i*2], s2=slots[i*2+1];
    const p1IsBye=s1==='BYE', p2IsBye=s2==='BYE';
    const doubleBye=p1IsBye&&p2IsBye;

    if(doubleBye){
      // Double BYE: ninguem joga, ninguem avanca
      matches.push({round:1,slotIdx:i,player1:'BYE',player2:'BYE',score1:'',score2:'',winner:0,isBye:true,advancer:''});
    } else if(p1IsBye||p2IsBye){
      // Single BYE: jogador real avanca
      const real=p1IsBye?s2:s1;
      matches.push({round:1,slotIdx:i,player1:real,player2:'',score1:'',score2:'',winner:1,isBye:true,advancer:real});
    } else {
      // Jogo real
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
      // Se um lado e double-bye, o outro avanca direto
      const m1Empty=m1?.winner===0;
      const m2Empty=m2?.winner===0;
      let advancer='';
      let isBye=false;
      let winner;
      if(m1Empty&&m2Empty){winner=0;isBye=true;advancer='';}
      else if(m1Empty&&p2){winner=2;isBye=true;advancer=p2;}
      else if(m2Empty&&p1){winner=1;isBye=true;advancer=p1;}
      else{winner=undefined;isBye=false;}
      matches.push({round,slotIdx:i,player1:m1Empty?'':p1,player2:m2Empty?'':p2,score1:'',score2:'',winner,isBye,advancer});
    }
  }

  return matches;
}

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

function generateRoundRobinSchedule(pls) {
  const list=[...pls]; if(list.length%2!==0)list.push('BYE');
  const total=list.length,rounds=total-1,mpr=total/2,matches=[];
  for(let r=0;r<rounds;r++){for(let m=0;m<mpr;m++){
    const home=m===0?0:(total-1-m+r)%(total-1)+1;
    const away=(m+r)%(total-1)+1;
    const p1=list[home<total?home:0],p2=list[away<total?away:0];
    if(p1==='BYE'||p2==='BYE')continue;
    // p1idx/p2idx devem ser indices no array ORIGINAL (d.players), nao no shuffled
    // Usar o indice na lista original passada (que sera d.players apos o sort)
    matches.push({round:r+1,player1:p1,player2:p2,p1idx:pls.indexOf(p1),p2idx:pls.indexOf(p2),score1:'',score2:''});
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

// Retorna o clube do atleta (usa tournament.players como fonte). Aceita nome simples OU dupla "A / B"
function _getPlayerClub(name) {
  if (!tournament?.players || !name) return '';
  const parts = name.split('/').map(s => s.trim()).filter(Boolean);
  const clubs = parts.map(n => {
    const p = tournament.players.find(pl => {
      const full = ((pl.firstName || '') + ' ' + (pl.lastName || '')).trim().toLowerCase();
      return full === n.toLowerCase();
    });
    return p?.club || '';
  }).filter(Boolean);
  return clubs.join('|');
}

// Distribui 1 jogador no grupo com menor numero de jogadores daquele clube.
// Em empate de contagem de clube, usa grupo com menos jogadores totais (balanceamento).
function _placePlayerWithClubProtection(groups, player) {
  const clubs = _getPlayerClub(player).split('|').filter(Boolean);
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
      const pc = _getPlayerClub(p).split('|').filter(Boolean);
      return acc + clubs.filter(c => pc.includes(c)).length;
    }, 0);
    const score = clubsInGroup * 1000 + g.players.length;
    if (score < bestScore) { bestScore = score; best = g; }
  });
  best.players.push(player);
}

function generateGroupsPhase(playerList, numGroups, seeds) {
  seeds = seeds || [];
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

function propagateGroupsToElimination(d) {
  if (!areGroupsFinished(d)) return false;
  if (d.groupsData.eliminationGenerated) return false;
  const qualifiers = d.groupQualifiers || 2;
  const qualified = [];

  // Collect top N from each group
  d.groupsData.groups.forEach(g => {
    const standings = computeGroupStandings(g.players, g.matches);
    const top = standings.slice(0, qualifiers);
    top.forEach((s, i) => { qualified.push({ name: s.name, group: g.name, seed: i }); });
  });

  if (qualified.length < 2) return false;

  // Cruzamento oficial: 1o de cada grupo vs 2o de outro grupo (nunca do mesmo)
  const numGroups = d.groupsData.groups.length;
  const byGroup = {};
  qualified.forEach(q => {
    const gName = q.group;
    if (!byGroup[gName]) byGroup[gName] = [];
    byGroup[gName].push(q.name);
  });
  const groupKeys = Object.keys(byGroup);

  // Criar matches de eliminatoria DIRETAMENTE com cruzamento correto
  // (sem usar generateEliminationBracket que reordena com seed positions)
  const elimMatches = [];

  // Gerar semifinais: parear grupos em duplas (A,B), (C,D), etc.
  const semis = [];
  for (let g = 0; g < groupKeys.length; g += 2) {
    const gA = byGroup[groupKeys[g]] || [];
    const gB = byGroup[groupKeys[g + 1] || groupKeys[(g + 1) % groupKeys.length]] || [];
    // A1 vs B2
    if (gA[0] && gB[1]) semis.push({ player1: gA[0], player2: gB[1] });
    else if (gA[0]) semis.push({ player1: gA[0], player2: '' });
    // B1 vs A2
    if (gB[0] && gA[1]) semis.push({ player1: gB[0], player2: gA[1] });
    else if (gB[0]) semis.push({ player1: gB[0], player2: '' });
  }

  // R1: semifinais
  semis.forEach((s, i) => {
    elimMatches.push({
      round: 1, slotIdx: i, player1: s.player1, player2: s.player2,
      score1: '', score2: '', winner: undefined, isBye: false, advancer: '',
      phase: 'elimination'
    });
  });

  // Gerar rodadas seguintes (quartas, semi, final)
  let prevCount = semis.length;
  let round = 2;
  while (prevCount > 1) {
    const numMatches = Math.floor(prevCount / 2);
    for (let i = 0; i < numMatches; i++) {
      elimMatches.push({
        round, slotIdx: i, player1: '', player2: '',
        score1: '', score2: '', winner: undefined, isBye: false, advancer: '',
        phase: 'elimination'
      });
    }
    prevCount = numMatches;
    round++;
  }

  d.groupsData.eliminationMatches = elimMatches;
  d.groupsData.eliminationGenerated = true;

  // Add elimination matches to d.matches
  elimMatches.forEach(m => d.matches.push(m));

  return true;
}

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
    h += `<div class="tab${i === 0 ? ' active' : ''}" onclick="setGeTab(${i})">${esc(g.name)}</div>`;
  });
  h += `<div class="tab" onclick="setGeTab(${groups.length})">Eliminatorias</div>`;
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
  const dist = distributeMatches(allM.filter(m => m.isDefinida));
  const adefs = allM.filter(m => !m.isDefinida);
  // Atribuir horarios aos definidos
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

function distributeMatches(matches) {
  if (matches.length <= 1) return matches;
  const numCourts = tournament?.courts || 4;

  // Agrupar por categoria (drawName) para distribuir justamente dentro de cada categoria
  const byCategory = {};
  matches.forEach(m => {
    if (!byCategory[m.drawName]) byCategory[m.drawName] = [];
    byCategory[m.drawName].push(m);
  });

  // Dentro de cada categoria, ordenar por rodada
  Object.values(byCategory).forEach(arr => arr.sort((a, b) => a.round - b.round));

  // Distribuir intercalando categorias para variar quadras
  // E garantir que jogadores da mesma categoria tenham gaps iguais
  const result = [];
  const lastPlayed = {}; // jogador -> posicao do ultimo jogo
  const queues = Object.values(byCategory).map(arr => [...arr]);

  while (queues.some(q => q.length > 0)) {
    let bestMatch = null;
    let bestQueueIdx = -1;
    let bestScore = -Infinity;

    for (let qi = 0; qi < queues.length; qi++) {
      if (!queues[qi].length) continue;

      // Pegar o proximo jogo da categoria (respeitar rodada)
      const m = queues[qi][0];
      const pos = result.length;

      // Calcular gap minimo dos jogadores (quanto descansaram)
      const gap1 = lastPlayed[m.player1] != null ? pos - lastPlayed[m.player1] : 999;
      const gap2 = lastPlayed[m.player2] != null ? pos - lastPlayed[m.player2] : 999;
      const minGap = Math.min(gap1, gap2);

      // Prioridade: maior descanso + rodada menor + variar categorias
      const catLastPos = queues[qi]._lastPos || -999;
      const catGap = pos - catLastPos;
      const score = minGap * 100 + catGap * 10 - m.round;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
        bestQueueIdx = qi;
      }
    }

    if (!bestMatch) break;

    queues[bestQueueIdx].shift();
    queues[bestQueueIdx]._lastPos = result.length;
    lastPlayed[bestMatch.player1] = result.length;
    lastPlayed[bestMatch.player2] = result.length;
    result.push(bestMatch);
  }

  return result;
}

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
      if (!p1 && !p2) return;
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

async function regenerateDrawSchedule(drawIdx, skipConfirm) {
  const draws = tournament.draws || [];
  if (drawIdx < 0 || drawIdx >= draws.length) { showToast('Chave invalida', 'warning'); return; }
  const d = draws[drawIdx];
  const drawName = d.name;

  if (!skipConfirm && !confirm(`Regenerar agenda apenas da chave "${drawName}"?\n\nJogos de outras categorias NAO serao alterados.\nJogos finalizados e em quadra desta chave serao preservados.`)) return;

  // 1. Separar matches desta chave vs outras
  const drawMatches = (tournament.matches || []).filter(m => m.drawName === drawName);
  const otherMatches = (tournament.matches || []).filter(m => m.drawName !== drawName);

  if (!drawMatches.length && !d.matches?.length) { showToast('Sem partidas nesta chave', 'warning'); return; }

  // 2. Sincronizar matches desta chave com o draw (pegar novos jogos apos re-sorteio)
  const shouldExist = [];
  if (d.type === 'Grupos + Eliminatoria' && d.groupsData) {
    const tempArr = [];
    rebuildGroupsElimMatches(d, tempArr);
    tempArr.forEach(m => shouldExist.push({ drawName: d.name, drawId: d.id, drawMatchIdx: m.drawMatchIdx, player1: m.player1, player2: m.player2, player1Display: m.player1Display, player2Display: m.player2Display, round: m.round, roundName: m.roundName, event: d.event, group: m.group, phase: m.phase }));
  } else {
    let mNum = 1; const mNums = new Map();
    (d.matches || []).forEach((m, i) => { if ((m.player1 && m.player2 && m.player2 !== 'BYE' && m.player1 !== 'BYE') || m.round > 1) { mNums.set(i, mNum); mNum++; } });
    const matchesByRound = {};
    (d.matches || []).forEach((m, i) => { if (!matchesByRound[m.round]) matchesByRound[m.round] = []; matchesByRound[m.round].push({ match: m, idx: i }); });
    let futIdx = 0;
    (d.matches || []).forEach((m, i) => {
      if (m.player2 === 'BYE' || m.player1 === 'BYE') return;
      if (m.round === 1 && ((m.player1 && !m.player2) || (!m.player1 && m.player2))) return;
      const p1 = m.player1 || '', p2 = m.player2 || '';
      if (!p1 && !p2) return;
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
  }

  // 3. Mapear slots existentes desta chave (preservar horarios de jogos que continuam)
  const existingSlots = new Map(); // drawMatchIdx -> { time, status, score, winner, ... }
  drawMatches.forEach(m => {
    if (m.drawMatchIdx != null) {
      existingSlots.set(m.drawMatchIdx, { time: m.time, court: m.court, umpire: m.umpire, status: m.status, score: m.score, winner: m.winner, startedAt: m.startedAt, finishedAt: m.finishedAt });
    }
  });

  // 4. Construir novos matches desta chave, reutilizando slots quando possivel
  const newDrawMatches = [];
  const preservedStatuses = ['Finalizada', 'WO', 'Em Quadra', 'Desistencia', 'Desqualificacao'];

  shouldExist.forEach(s => {
    const existing = existingSlots.get(s.drawMatchIdx);
    const def = !!(s.player1 && s.player2);
    let rn = s.roundName || '';
    if (!rn) {
      const totalR = Math.max(...(d.matches || []).map(x => x.round) || [1]);
      rn = s.round === totalR ? 'Final' : s.round === totalR - 1 ? 'Semifinal' : `R${s.round}`;
    }

    const match = {
      drawId: s.drawId, drawName: s.drawName, drawMatchIdx: s.drawMatchIdx, event: s.event,
      round: s.round, roundName: rn,
      player1: s.player1, player2: s.player2,
      player1Display: s.player1Display || s.player1 || 'A definir',
      player2Display: s.player2Display || s.player2 || 'A definir',
      isDefinida: def, score: '', court: '', time: '', umpire: '',
      status: def ? 'Pendente' : 'A definir', phase: s.phase || '', group: s.group || ''
    };

    // Preservar dados de jogos finalizados/em quadra
    if (existing && preservedStatuses.includes(existing.status)) {
      match.time = existing.time;
      match.court = existing.court;
      match.umpire = existing.umpire;
      match.status = existing.status;
      match.score = existing.score;
      match.winner = existing.winner;
      match.startedAt = existing.startedAt;
      match.finishedAt = existing.finishedAt;
    }
    // Reutilizar horario do slot antigo se existia (mesmo numero de jogos = mesmo horario)
    else if (existing && existing.time) {
      match.time = existing.time;
      match.court = existing.court || '';
      match.umpire = existing.umpire || '';
    }

    newDrawMatches.push(match);
  });

  // 5. Encontrar slots vazios e encaixar novos jogos (respeitando daySchedule)
  const _dur = tournament.matchDuration || 30, _rest = tournament.restMinBetweenGames || 20;
  const _slotDur = _dur + _rest, _courts = tournament.courts || 4;

  // Determinar qual dia esta chave pertence
  ensureDayScheduleDraws();
  let _dayConfig = null;
  if (tournament.daySchedule?.length) {
    _dayConfig = tournament.daySchedule.find(day => (day.draws || []).includes(drawName));
  }
  const _start = timeToMin(_dayConfig?.startTime || tournament.startTime || '08:00');
  const _end = timeToMin(_dayConfig?.endTime || tournament.endTime || '18:00');
  const _bS = timeToMin(_dayConfig?.breakStart || tournament.breakStart || '12:00');
  const _bE = timeToMin(_dayConfig?.breakEnd || tournament.breakEnd || '13:30');

  // Gerar slots de horario do DIA desta chave
  const _slots = [];
  let _cur = _start;
  while (_cur + _dur <= _end) {
    if (_cur >= _bS && _cur < _bE) { _cur = _bE; continue; }
    if (_cur + _dur > _bS && _cur < _bS) { _cur = _bE; continue; }
    _slots.push(_cur);
    _cur += _slotDur;
  }

  // Filtrar otherMatches: contar apenas os do MESMO DIA (para ocupacao correta dos slots)
  let _sameDayDraws = null;
  if (_dayConfig) {
    _sameDayDraws = new Set(_dayConfig.draws || []);
  }

  const _slotCount = new Array(_slots.length).fill(0);
  const _playerLastSlot = {};
  function _getP(name) { if (!name) return []; return name.includes('/') ? name.split('/').map(n => n.trim()).filter(Boolean) : [name.trim()]; }
  function _regP(name, si) { _getP(name).forEach(p => { _playerLastSlot[p] = si; }); }
  function _pOk(name, si) { return _getP(name).every(p => { const last = _playerLastSlot[p]; return last == null || si > last; }); }

  // Registrar matches de outras categorias DO MESMO DIA (slots ocupados que NAO mexemos)
  otherMatches.forEach(m => {
    if (!m.time) return;
    // Filtrar: so contar matches do mesmo dia
    if (_sameDayDraws && !_sameDayDraws.has(m.drawName)) return;
    const si = _slots.indexOf(timeToMin(m.time));
    if (si >= 0) { _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si); }
  });

  // Registrar matches DESTA chave que ja tem horario (preservados: finalizados, em quadra)
  newDrawMatches.forEach(m => {
    if (!m.time) return;
    const si = _slots.indexOf(timeToMin(m.time));
    if (si >= 0) { _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si); }
  });

  // Encaixar jogos sem horario nos slots vazios (respeitando conflito de atleta)
  newDrawMatches.forEach(m => {
    if (m.time || !m.isDefinida || m.status === 'A definir') return;
    for (let si = 0; si < _slots.length; si++) {
      if (_slotCount[si] >= _courts) continue;
      if (_pOk(m.player1, si) && _pOk(m.player2, si)) {
        m.time = minToTime(_slots[si]);
        _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si);
        return;
      }
    }
    // Fallback: qualquer slot com vaga
    for (let si = 0; si < _slots.length; si++) {
      if (_slotCount[si] < _courts) {
        m.time = minToTime(_slots[si]);
        _slotCount[si]++; _regP(m.player1, si); _regP(m.player2, si);
        return;
      }
    }
  });

  // Encaixar jogos "A definir" apos ultimo jogo definido da mesma chave (respeitando quadras)
  newDrawMatches.forEach(m => {
    if (m.time || m.status !== 'A definir') return;
    const sameDrawTimes = newDrawMatches.filter(x => x.drawName === m.drawName && x.time).map(x => timeToMin(x.time));
    if (!sameDrawTimes.length) return;
    const lastMin = Math.max(...sameDrawTimes);
    for (let si = 0; si < _slots.length; si++) {
      if (_slots[si] <= lastMin) continue;
      if (_slotCount[si] < _courts) {
        m.time = minToTime(_slots[si]);
        _slotCount[si]++;
        break;
      }
    }
  });

  // 6. Remontar tournament.matches: outras + novas desta chave, ordenados por dia e horario
  const allMatches = [...otherMatches, ...newDrawMatches];

  // Ordenar por dia (daySchedule) e depois por horario
  ensureDayScheduleDraws();
  const _dayDrawSets = (tournament.daySchedule || []).map(day => new Set(day.draws || []));
  allMatches.sort((a, b) => {
    // Primeiro: ordenar por dia
    let dayA = _dayDrawSets.length, dayB = _dayDrawSets.length;
    _dayDrawSets.forEach((s, i) => { if (s.has(a.drawName)) dayA = i; if (s.has(b.drawName)) dayB = i; });
    if (dayA !== dayB) return dayA - dayB;
    // Depois: ordenar por horario
    const ta = a.time ? timeToMin(a.time) : 9999;
    const tb = b.time ? timeToMin(b.time) : 9999;
    if (ta !== tb) return ta - tb;
    return (a.num || 0) - (b.num || 0);
  });

  tournament.matches = allMatches;

  // 7. Renumerar
  tournament.matches.forEach((m, i) => { m.id = (i + 1).toString(); m.num = i + 1; });

  // 9. Salvar e sincronizar
  await window.api.saveTournament(tournament);
  prepareRankingsForSync(); window.api.supabaseUpsertTournament(tournament.id, tournament.name, tournament);
  renderMatches();
  renderDraws();

  if (!skipConfirm) {
    const total = newDrawMatches.length;
    showToast(`Chave "${drawName}" regenerada: ${total} jogo(s). Outras categorias inalteradas.`, 'info');
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
function repropagateAllResults(){
  if(!tournament?.draws?.length||!tournament?.matches?.length)return;
  let changed=false;

  // Passo 0: Atribuir drawMatchIdx e remover matches de BYE implicito
  (tournament.draws||[]).forEach(d=>{
    if(!d.matches?.length)return;
    d.matches.forEach((dm,i)=>{
      if(dm.player1==='BYE'||dm.player2==='BYE')return;
      // Verificar se ja existe um tournament.match com este drawMatchIdx
      const hasIdx=tournament.matches.some(m=>m.drawName===d.name&&m.drawMatchIdx===i);
      if(hasIdx)return;
      // Buscar tournament.match sem drawMatchIdx que corresponda
      const tm=tournament.matches.find(m=>m.drawName===d.name&&m.drawMatchIdx==null&&m.round===dm.round&&
        ((m.player1===dm.player1&&m.player2===dm.player2)||(m.player1===dm.player1&&!dm.player2)||(m.player2===dm.player2&&!dm.player1)||
         (!m.player1&&!m.player2&&m.status==='A definir')));
      if(tm){tm.drawMatchIdx=i;changed=true;}
    });
  });
  // Remover tournament.matches que sao BYE implicito (um player vazio e draw ja tem advancer)
  const beforeLen=tournament.matches.length;
  tournament.matches=tournament.matches.filter(m=>{
    if(m.status!=='A definir')return true;
    if(!m.drawName||m.drawMatchIdx==null)return true;
    const d=tournament.draws.find(x=>x.name===m.drawName);
    if(!d||!d.matches)return true;
    const dm=d.matches[m.drawMatchIdx];
    if(!dm)return true;
    // Se o draw match tem player1 mas nao player2 (ou vice-versa) e ja tem advancer = BYE implicito
    if(dm.advancer&&((dm.player1&&!dm.player2)||(dm.player2&&!dm.player1)))return false;
    return true;
  });
  if(tournament.matches.length!==beforeLen){
    // Renumerar
    tournament.matches.forEach((m,i)=>{m.id=(i+1).toString();m.num=i+1;});
    changed=true;
  }

  (tournament.draws||[]).forEach(d=>{
    if(!d.matches?.length)return;

    // Grupos + Eliminatoria: sincronizar grupo e propagar eliminatoria
    if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
      // Sync group matches
      d.groupsData.groups.forEach(g=>{
        g.matches.forEach(dm=>{
          const dmInDraw=d.matches.find(m=>m.phase==='group'&&m.group===dm.group&&m.player1===dm.player1&&m.player2===dm.player2);
          const tm=(tournament.matches||[]).find(m=>m.drawName===d.name&&m.phase==='group'&&m.player1===dm.player1&&m.player2===dm.player2);
          if(!dm.winner){
            if(dmInDraw&&dmInDraw.winner){dm.winner=dmInDraw.winner;dm.score1=dmInDraw.score1;dm.score2=dmInDraw.score2;changed=true;}
            if(tm&&tm.winner&&tm.score&&tm.score!==''){
              dm.winner=tm.winner;dm.score1=tm.score1||dm.score1;dm.score2=tm.score2||dm.score2;
              if(dmInDraw){dmInDraw.winner=tm.winner;dmInDraw.score1=tm.score1;dmInDraw.score2=tm.score2;}
              changed=true;
            }
          }
          // Sync inverso: draw→tournament.match
          if(dm.winner&&tm&&(!tm.winner||tm.status==='Pendente')){
            const s1=dm.score1||'',s2=dm.score2||'';
            if(s1||s2){
              const s1P=String(s1).split(' ').filter(x=>x);
              const s2P=String(s2).split(' ').filter(x=>x);
              if(s1P.length&&s2P.length){
                tm.score=s1P.map((v,idx)=>v+'-'+(s2P[idx]||'0')).join(' / ');
                tm.winner=dm.winner;tm.status='Finalizada';tm.finishedAt=tm.finishedAt||new Date().toISOString();
                changed=true;
              }
            }
          }
        });
      });
      // Check if groups finished and propagate to elimination
      if(areGroupsFinished(d)&&!d.groupsData.eliminationGenerated){
        if(propagateGroupsToElimination(d)){
          updateEliminationMatchesInList();
          changed=true;
        }
      }
      // Handle elimination phase propagation
      if(d.groupsData.eliminationMatches?.length){
        const elimMatches=d.groupsData.eliminationMatches;
        const byRound={};
        elimMatches.forEach((m,i)=>{if(!byRound[m.round])byRound[m.round]=[];byRound[m.round].push({match:m,globalIdx:i});});
        const totalRounds=Math.max(...elimMatches.map(m=>m.round));
        for(let r=1;r<=totalRounds;r++){
          (byRound[r]||[]).forEach((entry,posInRound)=>{
            const dm=entry.match;
            if(dm.player2==='BYE'&&dm.player1&&!dm.advancer){dm.winner=1;dm.advancer=dm.player1;changed=true;}
            if(dm.player1==='BYE'&&dm.player2&&!dm.advancer){dm.winner=2;dm.advancer=dm.player2;changed=true;}
            if(!dm.winner){
              const tm=(tournament.matches||[]).find(m=>m.drawName===d.name&&m.phase==='elimination'&&m.player1===dm.player1&&m.player2===dm.player2);
              if(tm&&tm.winner){dm.winner=tm.winner;dm.advancer=tm.winner===1?tm.player1:tm.player2;changed=true;}
            }
            if(dm.advancer&&r<totalRounds){
              const nextRMatches=byRound[r+1]||[];
              const nextPos=Math.floor(posInRound/2);
              if(nextPos<nextRMatches.length){
                const nm=nextRMatches[nextPos].match;
                const slot=posInRound%2;
                if(slot===0&&nm.player1!==dm.advancer){nm.player1=dm.advancer;changed=true;}
                if(slot===1&&nm.player2!==dm.advancer){nm.player2=dm.advancer;changed=true;}
                // Update tournament.match
                const ntm=(tournament.matches||[]).find(m=>m.drawName===d.name&&m.phase==='elimination'&&m.round===nm.round&&(!m.player1||!m.player2||m.status==='A definir'));
                if(ntm){
                  if(slot===0&&ntm.player1!==dm.advancer){ntm.player1=dm.advancer;ntm.player1Display=dm.advancer;changed=true;}
                  if(slot===1&&ntm.player2!==dm.advancer){ntm.player2=dm.advancer;ntm.player2Display=dm.advancer;changed=true;}
                  if(ntm.player1&&ntm.player2&&ntm.status==='A definir'){ntm.isDefinida=true;ntm.status='Pendente';changed=true;}
                }
              }
            }
          });
        }
      }
      return;
    }

    const isElim=d.type==='Eliminatoria';
    const byRound={};
    d.matches.forEach((m,i)=>{if(!byRound[m.round])byRound[m.round]=[];byRound[m.round].push({match:m,globalIdx:i});});
    const totalRounds=Math.max(...d.matches.map(m=>m.round));

    // Round Robin: sincronizar resultados bidirecionalmente
    if(!isElim){
      (d.matches||[]).forEach((dm,i)=>{
        const tm=findTournamentMatch(d.name,i,dm);
        if(!tm)return;
        if(!dm.winner&&tm.winner&&tm.score&&tm.score!==''){
          // tournament.match → draw
          dm.winner=tm.winner;changed=true;
        } else if(dm.winner&&(!tm.winner||tm.status==='Pendente')){
          // draw → tournament.match (draw tem resultado mas tournament nao)
          const s1=dm.score1||'',s2=dm.score2||'';
          if(s1||s2){
            // Converter scores da draw para formato de placar
            const s1Parts=String(s1).split(' ').filter(x=>x);
            const s2Parts=String(s2).split(' ').filter(x=>x);
            if(s1Parts.length&&s2Parts.length){
              const score=s1Parts.map((v,idx)=>v+'-'+(s2Parts[idx]||'0')).join(' / ');
              tm.score=score;
              tm.winner=dm.winner;
              tm.status='Finalizada';
              tm.finishedAt=tm.finishedAt||new Date().toISOString();
              changed=true;
            }
          } else if(dm.score1==='W.O.'||dm.score2==='W.O.'){
            tm.score='W.O.';tm.winner=dm.winner;tm.status='WO';changed=true;
          }
        }
      });
      return;
    }

    // Eliminatoria: processar round por round
    for(let r=1;r<=totalRounds;r++){
      const rMatches=byRound[r]||[];
      rMatches.forEach((entry,posInRound)=>{
        const dm=entry.match;

        // BYE: avançar automaticamente
        if(dm.player2==='BYE'&&dm.player1&&!dm.advancer){dm.winner=1;dm.advancer=dm.player1;changed=true;}
        if(dm.player1==='BYE'&&dm.player2&&!dm.advancer){dm.winner=2;dm.advancer=dm.player2;changed=true;}

        // Buscar resultado em tournament.matches se draw nao tem
        if(!dm.winner){
          const tm=findTournamentMatch(d.name,entry.globalIdx,dm);
          if(tm&&tm.winner){
            dm.winner=tm.winner;
            dm.advancer=tm.winner===1?tm.player1:tm.player2;
            changed=true;
          }
        }

        // Propagar advancer para proximo round (SOMENTE eliminatoria)
        if(dm.advancer&&r<totalRounds){
          const nextRMatches=byRound[r+1]||[];
          const nextPosInRound=Math.floor(posInRound/2);
          if(nextPosInRound<nextRMatches.length){
            const nm=nextRMatches[nextPosInRound].match;
            const slot=posInRound%2;
            // Atualizar draw match
            if(slot===0&&nm.player1!==dm.advancer){nm.player1=dm.advancer;changed=true;}
            if(slot===1&&nm.player2!==dm.advancer){nm.player2=dm.advancer;changed=true;}
            // Atualizar tournament.match usando drawMatchIdx
            const nextTm=findTournamentMatch(d.name,nextRMatches[nextPosInRound].globalIdx,nm);
            if(nextTm){
              if(slot===0&&nextTm.player1!==dm.advancer){nextTm.player1=dm.advancer;nextTm.player1Display=dm.advancer;changed=true;}
              if(slot===1&&nextTm.player2!==dm.advancer){nextTm.player2=dm.advancer;nextTm.player2Display=dm.advancer;changed=true;}
              if(nextTm.player1&&nextTm.player2&&nextTm.status==='A definir'){nextTm.isDefinida=true;nextTm.status='Pendente';changed=true;}
            } else {
              console.warn('repropagateAllResults: nao encontrou tournament.match para',d.name,'drawMatchIdx=',nextRMatches[nextPosInRound].globalIdx,'round=',nm.round,'p1=',nm.player1,'p2=',nm.player2);
            }
          }
        }
      });
    }
  });
  if(changed){
    // Atualizar matches de eliminatoria na lista
    updateEliminationMatchesInList();

    // Atribuir horarios a matches que ficaram sem
    const all=tournament.matches;
    if(all.some(m=>!m.time)){
      const defs=all.filter(m=>m.isDefinida!==false&&m.status!=='A definir');
      const adefs=all.filter(m=>m.isDefinida===false||m.status==='A definir');
      assignAutoTimes([...defs,...adefs]);
    }
    window.api.saveTournament(tournament);
  }
}

// Buscar tournament.match correspondente a um draw match
function findTournamentMatch(drawName,drawMatchIdx,dm){
  const ms=tournament.matches.filter(x=>x.drawName===drawName);
  // 1) Por drawMatchIdx (link direto)
  let tm=ms.find(x=>x.drawMatchIdx===drawMatchIdx);
  if(tm)return tm;
  // 2) Por round+players exatos
  tm=ms.find(x=>x.round===dm.round&&x.player1===dm.player1&&x.player2===dm.player2);
  if(tm)return tm;
  // 3) Por round + player1 match
  if(dm.player1)tm=ms.find(x=>x.round===dm.round&&x.player1===dm.player1);
  if(tm)return tm;
  // 4) Por round + player2 match
  if(dm.player2)tm=ms.find(x=>x.round===dm.round&&x.player2===dm.player2);
  if(tm)return tm;
  // 5) Por round + A definir (primeiro disponivel)
  tm=ms.find(x=>x.round===dm.round&&x.status==='A definir');
  if(tm)return tm;
  // 6) Por round + qualquer status sem player completo
  tm=ms.find(x=>x.round===dm.round&&(!x.player1||!x.player2));
  return tm||null;
}

// === MATCHES ===
function renderMatches() {
  if(!tournament){document.getElementById('matches-no-tournament').style.display='block';document.getElementById('matches-content').style.display='none';return;}
  document.getElementById('matches-no-tournament').style.display='none';document.getElementById('matches-content').style.display='block';
  repropagateAllResults();
  renderCourtsPanel();
  // Populate day filter
  const dayFilter=document.getElementById('match-day-filter');
  if(dayFilter){
    const prevVal=dayFilter.value;
    dayFilter.innerHTML='<option value="">Todos os dias</option>';
    if(tournament.daySchedule?.length){
      tournament.daySchedule.forEach((day,idx)=>{
        const d=new Date(day.date+'T00:00:00');
        const label=`Dia ${idx+1} - ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
        dayFilter.innerHTML+=`<option value="${esc(day.date)}">${esc(label)}</option>`;
      });
    }
    dayFilter.value=prevVal||'';
  }
  const tb=document.getElementById('matches-table-body'),countEl=document.getElementById('matches-count');
  const matches=tournament.matches||[];
  const doneMatches=matches.filter(m=>m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao');
  const pendingMatches=matches.filter(m=>m.status!=='Finalizada'&&m.status!=='WO'&&m.status!=='Desistencia'&&m.status!=='Desqualificacao');
  if(countEl){
    let info=`${doneMatches.length}/${matches.length} finalizadas`;
    // Tempo medio de jogo
    const withDuration=doneMatches.filter(m=>m.startedAt&&m.finishedAt);
    if(withDuration.length){
      const totalSec=withDuration.reduce((s,m)=>s+Math.floor((new Date(m.finishedAt)-new Date(m.startedAt))/1000),0);
      const avgSec=Math.floor(totalSec/withDuration.length);
      const avgMin=Math.floor(avgSec/60),avgS=avgSec%60;
      info+=` | Tempo medio: ${avgMin}min${avgS?` ${String(avgS).padStart(2,'0')}s`:''}`;
      // Previsao de finalizacao
      const remaining=pendingMatches.filter(m=>m.status!=='A definir').length;
      const courts=tournament.courts||4;
      const slotsNeeded=Math.ceil(remaining/courts);
      const totalRemainingSec=slotsNeeded*avgSec;
      const now=new Date();
      const endEstimate=new Date(now.getTime()+totalRemainingSec*1000);
      const endH=String(endEstimate.getHours()).padStart(2,'0'),endM=String(endEstimate.getMinutes()).padStart(2,'0');
      const remMin=Math.floor(totalRemainingSec/60);
      info+=` | Restante: ~${remMin}min | Previsao: ${endH}:${endM}`;
    }
    countEl.textContent=info;
  }
  if(!pendingMatches.length){tb.innerHTML=`<tr><td colspan="11" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Todas as partidas foram finalizadas.</td></tr>`;return;}
  if(!matches.length){tb.innerHTML=`<tr><td colspan="11" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas.</td></tr>`;return;}

  // Coletar TODOS os nomes individuais dos atletas em quadra (separar duplas por "/")
  const inCourt=new Set();
  matches.forEach(m=>{
    if(m.status==='Em Quadra'){
      if(m.player1)(m.player1).split('/').forEach(n=>inCourt.add(n.trim()));
      if(m.player2)(m.player2).split('/').forEach(n=>inCourt.add(n.trim()));
    }
  });
  // Coletar nomes dos atletas ausentes
  const absentPlayers=new Set();
  (tournament.entries||[]).forEach(e=>{
    if(e.status==='ausente')absentPlayers.add(e.playerName);
  });

  // Pre-calcular filtro de dia para evitar flash ao renderizar
  const _dayVal=document.getElementById('match-day-filter')?.value||'';
  let _dayDraws=null;
  if(_dayVal&&tournament?.daySchedule){
    const _day=tournament.daySchedule.find(d=>d.date===_dayVal);
    if(_day)_dayDraws=new Set(_day.draws||[]);
  }

  const _nc = tournament.courts || 4;
  const _cn = tournament.courtNames || [];
  let _lastMatchTime = '';
  let _matchesAtTime = 0;
  let _lastMatchDraw = '';

  let h='';
  pendingMatches.forEach(m=>{
    const i=matches.indexOf(m);

    // Detectar mudanca de horario e mostrar quadras livres do horario anterior
    if (m.time && m.time !== _lastMatchTime) {
      if (_lastMatchTime && _matchesAtTime < _nc) {
        const _livres = _nc - _matchesAtTime;
        for (let _q = 0; _q < _livres; _q++) {
          const _courtName = _cn[_matchesAtTime + _q] || `Quadra ${_matchesAtTime + _q + 1}`;
          h += `<tr class="court-free-row" data-time="${esc(_lastMatchTime)}" data-draw="${esc(_lastMatchDraw)}" style="background:#F8FAFC"><td></td><td style="font-size:11px;color:#94A3B8">${esc(_lastMatchTime)}</td><td colspan="10" style="font-size:11px;color:#94A3B8;font-style:italic">${esc(_courtName)} - livre</td></tr>`;
        }
      }
      _lastMatchTime = m.time;
      _matchesAtTime = 0;
    }
    _matchesAtTime++;
    _lastMatchDraw = m.drawName || '';

    const stMap={'Finalizada':'tag-green','WO':'tag-red','Desqualificacao':'tag-red','Desistencia':'tag-yellow','Em Quadra':'tag-blue','A definir':'tag-gray','Pendente':'tag-gray'};
    const st=stMap[m.status]||'tag-gray';
    const isDef=m.status==='A definir';
    const isEQ=m.status==='Em Quadra';
    let rs=isDef?'opacity:0.6;font-style:italic':isEQ?'background:#FFF3E0':'';
    // Verificar se algum nome individual do jogador/dupla esta em quadra
    const checkInCourt=(name)=>{
      if(!name)return false;
      return name.split('/').some(n=>inCourt.has(n.trim()));
    };
    const p1=esc(m.player1Display||m.player1||'A definir'),p2=esc(m.player2Display||m.player2||'A definir');
    const alertIcon='<span title="Atleta em quadra" style="color:#F59E0B;font-weight:700;cursor:help;margin-left:4px">&#9888;</span>';
    const absentIcon='<span title="Ausente" style="color:#DC2626;font-weight:700;cursor:help;margin-left:4px">&#10071;</span>';
    const highlightPlayer=(nameStr,rawName)=>{
      if(!rawName)return`<span>${nameStr}</span>`;
      const parts=rawName.split('/');
      if(parts.length<=1){
        const trimmed=rawName.trim();
        if(!isEQ&&inCourt.has(trimmed))return`<span style="background:#FEF3C7;padding:2px 6px;border-radius:4px">${nameStr}${alertIcon}</span>`;
        if(absentPlayers.has(trimmed))return`<span style="background:#FEE2E2;padding:2px 6px;border-radius:4px">${nameStr}${absentIcon}</span>`;
        return`<span>${nameStr}</span>`;
      }
      const escapedParts=(m.player1Display||m.player1||'A definir')===rawName?p1.split('/'):p2.split('/');
      const highlighted=parts.map((p,idx)=>{
        const trimmed=p.trim();
        const display=(escapedParts[idx]||esc(trimmed)).trim();
        if(!isEQ&&inCourt.has(trimmed))return`<span style="background:#FEF3C7;padding:2px 6px;border-radius:4px">${display}${alertIcon}</span>`;
        if(absentPlayers.has(trimmed))return`<span style="background:#FEE2E2;padding:2px 6px;border-radius:4px">${display}${absentIcon}</span>`;
        return display;
      });
      return highlighted.join(' / ');
    };
    const w1=n=>highlightPlayer(n,m.player1);
    const w2=n=>highlightPlayer(n,m.player2);

    let pHtml;
    if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
      const sets=m.score.split('/').map(s=>s.trim());let s1=[],s2=[];
      sets.forEach(s=>{const p=s.split('-');if(p.length===2){s1.push(p[0].trim());s2.push(p[1].trim());}});
      pHtml=`<td><strong style="${m.winner===1?'color:#10B981':''}">${w1(p1)}</strong></td><td style="text-align:center;font-weight:700;font-size:13px;white-space:nowrap"><span style="color:${m.winner===1?'#10B981':'var(--fabd-gray-700)'}">${s1.join(' ')}</span><span style="color:var(--fabd-gray-400);margin:0 4px">x</span><span style="color:${m.winner===2?'#10B981':'var(--fabd-gray-700)'}">${s2.join(' ')}</span></td><td><strong style="${m.winner===2?'color:#10B981':''}">${w2(p2)}</strong></td>`;
    } else if(m.score==='W.O.'||m.score==='DSQ'||m.score==='RET'){
      pHtml=`<td><strong>${w1(p1)}</strong></td><td style="text-align:center;font-weight:700;color:var(--fabd-red)">${esc(m.score)}</td><td><strong>${w2(p2)}</strong></td>`;
    } else {
      pHtml=`<td><strong>${w1(p1)}</strong></td><td style="text-align:center;color:var(--fabd-gray-400)">x</td><td><strong>${w2(p2)}</strong></td>`;
    }

    const isFinished=m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao';
    const resetBtn=isFinished?`<button class="btn btn-sm" style="background:#FEE2E2;color:#DC2626;border:1px solid #FECACA;margin-left:4px;padding:2px 6px;font-size:11px" onclick="resetMatch(${i})" title="Desfazer resultado">&#8635;</button>`:'';
    const matchDay=getMatchDay(m);
    const dayLabel=matchDay?((d)=>{const o=new Date(d+'T00:00:00');return`${String(o.getDate()).padStart(2,'0')}/${String(o.getMonth()+1).padStart(2,'0')}`;})(matchDay.date):'-';
    const _hideRow=_dayDraws&&!_dayDraws.has(m.drawName||'')?'display:none;':'';
    h+=`<tr data-status="${m.status}" data-draw="${esc(m.drawName||'')}" style="${_hideRow}${rs}"><td style="font-size:12px">${dayLabel}</td><td>${esc(m.time)||'-'}</td><td style="font-size:12px">${esc(m.drawName)}</td><td>${esc(m.roundName||'R'+m.round)}</td><td>${m.num}</td>${pHtml}<td>${isDef?'-':`<select class="form-control" style="width:100px;padding:2px 4px;font-size:11px" onchange="assignCourt(${i},this.value)"><option value="">-</option>${getCourtOptions(m.court)}</select>`}</td><td>${isDef?'-':`<select class="form-control" style="width:120px;padding:2px 4px;font-size:11px" onchange="updateMatchField(${i},'umpire',this.value)"><option value="">-</option>${getUmpireOptions(m.umpire)}</select>`}</td><td><span class="tag ${st}">${esc(m.status)}</span></td><td>${isDef?'':`<button class="btn btn-sm btn-primary" onclick="showScoreModal(${i})">Placar</button>${resetBtn}`}</td></tr>`;
  });
  // Quadras livres do ultimo horario
  if (_lastMatchTime && _matchesAtTime < _nc) {
    const _livres = _nc - _matchesAtTime;
    for (let _q = 0; _q < _livres; _q++) {
      const _courtName = _cn[_matchesAtTime + _q] || `Quadra ${_matchesAtTime + _q + 1}`;
      h += `<tr class="court-free-row" data-time="${esc(_lastMatchTime)}" data-draw="${esc(_lastMatchDraw)}" style="background:#F8FAFC"><td></td><td style="font-size:11px;color:#94A3B8">${esc(_lastMatchTime)}</td><td colspan="10" style="font-size:11px;color:#94A3B8;font-style:italic">${esc(_courtName)} - livre</td></tr>`;
    }
  }
  tb.innerHTML=h;
  // Reaplicar filtros apos re-renderizar
  setTimeout(()=>filterMatches(),0);
}

let _filterMatchesTimer = null;
function filterMatches() {
  if (_filterMatchesTimer) clearTimeout(_filterMatchesTimer);
  _filterMatchesTimer = setTimeout(() => {
    const q=(document.getElementById('search-matches')?.value||'').toLowerCase();
    const st=document.getElementById('match-status-filter')?.value||'';
    const dayVal=document.getElementById('match-day-filter')?.value||'';
    // Build set of draw names for selected day
    let dayDraws=null;
    if(dayVal&&tournament?.daySchedule){
      const day=tournament.daySchedule.find(d=>d.date===dayVal);
      if(day)dayDraws=new Set(day.draws||[]);
    }
    // Primeiro: filtrar jogos normais
    const visibleTimes = new Set();
    document.querySelectorAll('#matches-table-body tr:not(.court-free-row)').forEach(r=>{
      const matchQ=r.textContent.toLowerCase().includes(q);
      const matchSt=!st||(r.dataset.status||'')===st;
      const matchDay=!dayDraws||(dayDraws.has(r.dataset.draw||''));
      const visible = matchQ&&matchSt&&matchDay;
      r.style.display=visible?'':'none';
      // Rastrear horarios visiveis para mostrar/esconder quadras livres
      if (visible) {
        const timeTd = r.querySelectorAll('td')[1];
        if (timeTd) visibleTimes.add(timeTd.textContent.trim());
      }
    });
    // Segundo: mostrar/esconder quadras livres baseado no filtro de dia
    document.querySelectorAll('#matches-table-body tr.court-free-row').forEach(r=>{
      const matchDay = !dayDraws || (dayDraws.has(r.dataset.draw||''));
      r.style.display = matchDay ? '' : 'none';
    });
  }, 150);
}

let _filterFinishedTimer=null;
function filterFinished(){
  if(_filterFinishedTimer)clearTimeout(_filterFinishedTimer);
  _filterFinishedTimer=setTimeout(()=>{
    const q=(document.getElementById('search-finished')?.value||'').toLowerCase();
    document.querySelectorAll('#finished-table-body tr').forEach(r=>{
      r.style.display=r.textContent.toLowerCase().includes(q)?'':'none';
    });
  },150);
}

function setMatchesTab(tab){
  document.querySelectorAll('#matches-tabs .tab').forEach((t,i)=>{
    t.classList.toggle('active',(tab==='all'&&i===0)||(tab==='finished'&&i===1)||(tab==='umpires'&&i===2));
  });
  document.getElementById('matches-tab-all').style.display=tab==='all'?'':'none';
  document.getElementById('matches-tab-finished').style.display=tab==='finished'?'':'none';
  document.getElementById('matches-tab-umpires').style.display=tab==='umpires'?'':'none';
  if(tab==='finished')renderFinishedMatches();
  if(tab==='umpires')renderUmpireStats();
}

function renderFinishedMatches(){
  const tb=document.getElementById('finished-table-body');
  if(!tournament?.matches?.length){tb.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas finalizadas.</td></tr>';return;}
  const finished=tournament.matches.filter(m=>m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao');
  if(!finished.length){tb.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas finalizadas.</td></tr>';return;}
  let h='';
  finished.forEach(m=>{
    const i=tournament.matches.indexOf(m);
    const stMap={'Finalizada':'tag-green','WO':'tag-red','Desqualificacao':'tag-red','Desistencia':'tag-yellow'};
    const st=stMap[m.status]||'tag-gray';
    const p1Style=m.winner===1?'color:#10B981;font-weight:700':'';
    const p2Style=m.winner===2?'color:#10B981;font-weight:700':'';
    // Formatar horarios
    const fmtTime=(iso)=>{if(!iso)return'-';const d=new Date(iso);return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
    const startTime=fmtTime(m.startedAt);
    const endTime=fmtTime(m.finishedAt);
    // Calcular duracao
    let duration='-';
    if(m.startedAt&&m.finishedAt){
      const diff=Math.floor((new Date(m.finishedAt)-new Date(m.startedAt))/1000);
      const mins=Math.floor(diff/60),secs=diff%60;
      duration=`${mins}min ${String(secs).padStart(2,'0')}s`;
    }
    // Placar formatado
    let scoreHtml;
    if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
      const sets=m.score.split('/').map(s=>s.trim());let s1=[],s2=[];
      sets.forEach(s=>{const p=s.split('-');if(p.length===2){s1.push(p[0].trim());s2.push(p[1].trim());}});
      scoreHtml=`<span style="color:${m.winner===1?'#10B981':'var(--fabd-gray-700)'}">${s1.join(' ')}</span><span style="color:var(--fabd-gray-400);margin:0 4px">x</span><span style="color:${m.winner===2?'#10B981':'var(--fabd-gray-700)'}">${s2.join(' ')}</span>`;
    } else {
      scoreHtml=`<span style="color:var(--fabd-red);font-weight:700">${esc(m.score||'-')}</span>`;
    }
    const resetBtn=`<button class="btn btn-sm" style="background:#FEE2E2;color:#DC2626;border:1px solid #FECACA;padding:2px 6px;font-size:11px" onclick="resetMatch(${i})" title="Desfazer resultado">&#8635;</button>`;
    h+=`<tr><td>${m.num}</td><td style="font-size:12px">${esc(m.drawName)}</td><td>${esc(m.roundName||'R'+m.round)}</td><td style="${p1Style}">${esc(m.player1||'')}</td><td style="text-align:center;font-weight:700;font-size:13px;white-space:nowrap">${scoreHtml}</td><td style="${p2Style}">${esc(m.player2||'')}</td><td>${esc(m.court||'-')}</td><td>${esc(m.umpire||'-')}</td><td>${startTime}</td><td>${endTime}</td><td>${duration}</td><td><span class="tag ${st}">${esc(m.status)}</span></td><td>${resetBtn}</td></tr>`;
  });
  tb.innerHTML=h;
}

function renderUmpireStats(){
  const tb=document.getElementById('umpires-stats-body');
  if(!tournament?.matches?.length){tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Sem partidas.</td></tr>';return;}
  // Contar jogos por arbitro
  const stats={};
  tournament.matches.forEach(m=>{
    if(!m.umpire)return;
    if(!stats[m.umpire])stats[m.umpire]={total:0,matches:[]};
    stats[m.umpire].total++;
    stats[m.umpire].matches.push(`#${m.num} ${m.player1||'?'} vs ${m.player2||'?'}`);
  });
  const entries=Object.entries(stats).sort((a,b)=>b[1].total-a[1].total);
  if(!entries.length){tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--fabd-gray-500);padding:40px">Nenhum arbitro atribuido.</td></tr>';return;}
  let h='';
  entries.forEach(([name,data])=>{
    h+=`<tr><td style="font-weight:700">${esc(name)}</td><td style="text-align:center"><span class="tag tag-blue">${data.total}</span></td><td style="font-size:11px;color:var(--fabd-gray-600)">${data.matches.map(x=>esc(x)).join(', ')}</td></tr>`;
  });
  tb.innerHTML=h;
}

function renderCourtsPanel() {
  const panel=document.getElementById('courts-panel');
  if(!panel||!tournament)return;
  const nc=tournament.courts||4,cn=tournament.courtNames||[],matches=tournament.matches||[];
  panel.style.gridTemplateColumns=`repeat(${Math.min(nc,5)},1fr)`;
  let h='';
  for(let c=0;c<nc;c++){
    const name=cn[c]||`Quadra ${c+1}`;
    // Mostrar SOMENTE o jogo que esta "Em Quadra" nesta quadra (1 por quadra)
    const emQuadra=matches.find(m=>m.court===name&&m.status==='Em Quadra');
    const headerClass=emQuadra?'active':'';

    h+=`<div class="court-card"><div class="court-card-header ${headerClass}"><span>${esc(name)}${emQuadra?' <span style="font-weight:400;font-size:11px;opacity:0.8">'+esc(emQuadra.drawName)+' - '+esc(emQuadra.roundName||'')+'</span>':''}</span><span class="court-status">${emQuadra?'Em jogo':'Livre'}</span></div><div class="court-card-body${emQuadra?'':' empty'}">`;
    if(!emQuadra){
      h+='Quadra livre';
    } else {
      const live=emQuadra.liveScore||'';
      // Parsear live score: "15 - 12 (Set 2)"
      let liveP1='0',liveP2='0',liveSet='1';
      if(live&&typeof live==='string'){
        const m=live.match(/(\d+)\s*-\s*(\d+)\s*\(Set\s*(\d+)\)/);
        if(m){liveP1=m[1];liveP2=m[2];liveSet=m[3];}
      }
      // Sets anteriores
      let setsHtml='';
      if(emQuadra.liveSets){
        emQuadra.liveSets.forEach((s,i)=>{setsHtml+=`<span style="font-size:11px;color:var(--fabd-gray-500);margin:0 2px">${s}</span>`;});
      }
      h+=`<div style="padding:8px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="flex:1;text-align:left;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(emQuadra.player1)}</div>
          <div style="min-width:60px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:${live?'#F59E0B':'var(--fabd-gray-700)'}">${live?liveP1+' - '+liveP2:(emQuadra.score||'x')}</div>
            ${live?`<div style="font-size:10px;color:var(--fabd-gray-500)">Set ${liveSet}</div>`:''}
            ${setsHtml?`<div style="margin-top:2px">${setsHtml}</div>`:''}
          </div>
          <div style="flex:1;text-align:right;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(emQuadra.player2)}</div>
        </div>
        ${emQuadra.umpire?`<div style="text-align:center;font-size:11px;color:var(--fabd-gray-500);margin-top:4px">Árbitro - ${esc(emQuadra.umpire)}</div>`:''}
      </div>`;
    }
    h+='</div></div>';
  }
  panel.innerHTML=h;
}

// Receber atualizacao de placar em tempo real do Supabase
async function handleRealtimeScoreUpdate(data){
  try {
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
    // Se o jogo nao esta em quadra, ignorar
    if(m.status!=='Em Quadra')return;

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

    renderCourtsPanel();
    renderMatches();
  } catch(e) { console.error('[RealtimeScoreUpdate] Error:', e.message); }
}

function getCourtOptions(sel) {
  const nc=tournament?.courts||4,cn=tournament?.courtNames||[];let h='';
  for(let i=0;i<nc;i++){const n=cn[i]||`Quadra ${i+1}`;h+=`<option value="${esc(n)}"${sel===n?' selected':''}>${esc(n)}</option>`;}
  return h;
}

function getUmpireOptions(sel) {
  let h='';const umps=loadUmpires();
  umps.forEach(u=>{h+=`<option value="${esc(u.name)}"${sel===u.name?' selected':''}>${esc(u.name)}</option>`;});
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
      const ok=await window.api.supabaseUpsertMatch(tournament.id,m);
      if(!ok)showToast('Aviso: sincronizacao online falhou. O jogo pode nao aparecer no painel publico.','warning');
    }
    else if(!value){window.api.supabaseRemoveFromCourt(tournament.id,m);prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
      // Desativar Realtime se nao tem mais jogos em quadra
      const emQuadraCount = tournament.matches.filter(x => x.status === 'Em Quadra').length;
      if (emQuadraCount === 0) {
        window.api.supabaseUnsubscribe();
        console.log('Realtime desativado (nenhum jogo em quadra)');
      }
    }
  }catch(e){console.warn('Supabase sync:',e);showToast('Aviso: sincronizacao online falhou','warning');}
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
    h+=`<div class="score-row"><div class="score-cell"><input type="number" id="set-${s}-p1" min="0" max="30" value="" placeholder="0" onchange="autoDetectWinner()" oninput="autoDetectWinner()"></div><div class="score-cell-label">SET ${s}</div><div class="score-cell"><input type="number" id="set-${s}-p2" min="0" max="30" value="" placeholder="0" onchange="autoDetectWinner()" oninput="autoDetectWinner()"></div></div>`;
  }
  c.innerHTML=h;openModal('modal-score');
}

async function saveScore() {
  try{
    const m=tournament.matches[scoringMatchIdx];if(!m)return;
    const status=document.getElementById('score-status').value,winner=document.getElementById('score-winner').value;
    if(status==='WO'||status==='Desqualificacao'){if(!winner){alert('Selecione vencedor');return;}m.score=status==='WO'?'W.O.':'DSQ';m.status=status;m.winner=parseInt(winner);m.finishedAt=new Date().toISOString();propagateResultToDraws(m);await window.api.saveTournament(tournament);prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);if(!(tournament.matches||[]).some(x=>x.status==='Em Quadra')){window.api.supabaseUnsubscribe();console.log('Realtime desativado');}closeModal('modal-score');renderMatches();showToast('Resultado registrado');return;}
    if(!winner){alert('Selecione vencedor');return;}
    const numSets=tournament?.scoring?.sets||3,pts=tournament?.scoring?.points||21,maxP=tournament?.scoring?.maxPoints||30;
    let scores=[];
    for(let s=1;s<=numSets;s++){const p1=parseInt(document.getElementById(`set-${s}-p1`)?.value),p2=parseInt(document.getElementById(`set-${s}-p2`)?.value);if(isNaN(p1)||isNaN(p2))continue;const v=validateBadmintonSet(p1,p2,pts,maxP);if(!v.valid){alert(`Set ${s}: ${v.error}`);return;}scores.push(`${p1}-${p2}`);}
    if(!scores.length&&status!=='Desistencia'){alert('Insira placar');return;}
    m.score=scores.join(' / ')||(status==='Desistencia'?'RET':'');m.status=status;m.winner=parseInt(winner);m.finishedAt=new Date().toISOString();
    propagateResultToDraws(m);
    await window.api.saveTournament(tournament);prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);
    // Desativar Realtime se nao tem mais jogos em quadra
    if(!(tournament.matches||[]).some(x=>x.status==='Em Quadra')){window.api.supabaseUnsubscribe();console.log('Realtime desativado (nenhum jogo em quadra)');}
    closeModal('modal-score');renderMatches();showToast('Placar salvo!');
  }catch(e){console.error(e);showToast('Erro: '+e.message,'error');}
}

function propagateResultToDraws(matchData){
  try{
    if(!tournament?.draws?.length||!matchData.drawName)return;
    const d=tournament.draws.find(x=>x.name===matchData.drawName||x.id===matchData.drawId);
    if(!d||!d.matches?.length)return;

    // Encontrar o match na draw
    let dmIdx=matchData.drawMatchIdx;
    let dm=dmIdx!=null?d.matches[dmIdx]:null;
    if(!dm){
      dm=d.matches.find(m=>m.round===matchData.round&&m.player1===matchData.player1&&m.player2===matchData.player2);
      if(!dm)dm=d.matches.find(m=>m.round===matchData.round&&(m.player1===matchData.player1||m.player2===matchData.player2));
      if(!dm)return;
      dmIdx=d.matches.indexOf(dm);
    }

    // Atualizar resultado na draw
    const winnerName=matchData.winner===1?matchData.player1:matchData.player2;
    dm.winner=matchData.winner;
    // Advancer so faz sentido em eliminatoria
    if(d.type==='Eliminatoria')dm.advancer=winnerName;
    if(matchData.score&&matchData.score!=='W.O.'&&matchData.score!=='DSQ'&&matchData.score!=='RET'){
      const sets=matchData.score.split('/').map(s=>s.trim());
      let s1=[],s2=[];
      sets.forEach(s=>{const p=s.split('-');if(p.length===2){s1.push(p[0].trim());s2.push(p[1].trim());}});
      dm.score1=s1.join(' ');dm.score2=s2.join(' ');
    } else {
      dm.score1=matchData.score||'';dm.score2='';
    }
    // Groups+Elimination: also update groupsData (after score is set on dm)
    if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
      if(matchData.phase==='group'||dm.phase==='group'){
        const groupLabel=matchData.group||dm.group;
        if(groupLabel){
          const g=d.groupsData.groups.find(x=>x.name==='Grupo '+groupLabel);
          if(g){
            const gm=g.matches.find(m=>(m.player1===matchData.player1&&m.player2===matchData.player2)||(m.player1===matchData.player2&&m.player2===matchData.player1));
            if(gm){gm.winner=matchData.winner;gm.score1=dm.score1;gm.score2=dm.score2;}
          }
        }
      }
      if(matchData.phase==='elimination'||dm.phase==='elimination'){
        const em=d.groupsData.eliminationMatches?.find(m=>m.player1===matchData.player1&&m.player2===matchData.player2);
        if(em){em.winner=matchData.winner;em.advancer=winnerName;}
      }
    }

    // repropagateAllResults vai cuidar de avançar o vencedor

    // Atualizar matches de eliminatoria na lista de partidas (quando grupos terminam)
    updateEliminationMatchesInList();
  }catch(e){console.error('propagateResultToDraws error:',e);}
}

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

function reverseResultInDraws(matchData){
  try{
    if(!tournament?.draws?.length||!matchData.drawName)return;
    const d=tournament.draws.find(x=>x.name===matchData.drawName||x.id===matchData.drawId);
    if(!d||!d.matches?.length)return;

    // Encontrar match na draw
    let dm=matchData.drawMatchIdx!=null?d.matches[matchData.drawMatchIdx]:null;
    if(!dm)dm=d.matches.find(m=>m.round===matchData.round&&m.player1===matchData.player1&&m.player2===matchData.player2);
    if(!dm)dm=d.matches.find(m=>m.round===matchData.round&&(m.player1===matchData.player1||m.player2===matchData.player2));
    if(!dm)return;

    const byRound={};
    d.matches.forEach((m,i)=>{if(!byRound[m.round])byRound[m.round]=[];byRound[m.round].push({match:m,globalIdx:i});});
    const totalRounds=Math.max(...d.matches.map(m=>m.round));

    const oldWinner=dm.advancer||null;
    dm.winner=undefined;dm.advancer=undefined;dm.score1='';dm.score2='';

    if(dm.round<totalRounds&&oldWinner){
      const rMatches=byRound[dm.round]||[];
      const posInRound=rMatches.findIndex(x=>x.match===dm);
      if(posInRound<0)return;
      const nextRMatches=byRound[dm.round+1]||[];
      const nextPos=Math.floor(posInRound/2);
      if(nextPos>=nextRMatches.length)return;
      const nm=nextRMatches[nextPos].match;
      const slot=posInRound%2;

      // Verificar se o próximo jogo já foi finalizado
      const nextTm=findTournamentMatch(d.name,nextRMatches[nextPos].globalIdx,nm);
      if(nextTm&&(nextTm.status==='Finalizada'||nextTm.status==='WO'||nextTm.status==='Desistencia')){
        showToast('Nao pode desfazer: jogo seguinte ja foi finalizado','warning');
        dm.winner=matchData.winner;dm.advancer=oldWinner;
        return;
      }

      if(slot===0)nm.player1=''; else nm.player2='';
      if(nextTm){
        if(slot===0){nextTm.player1='';nextTm.player1Display='A definir';}
        else{nextTm.player2='';nextTm.player2Display='A definir';}
        nextTm.isDefinida=false;nextTm.status='A definir';
      }
    }
  }catch(e){console.error('reverseResultInDraws error:',e);}
}

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
function renderSchedule() {
  if(!tournament){document.getElementById('schedule-no-tournament').style.display='block';document.getElementById('schedule-content').style.display='none';return;}
  document.getElementById('schedule-no-tournament').style.display='none';document.getElementById('schedule-content').style.display='block';
  const container=document.getElementById('schedule-grid-container'),infoEl=document.getElementById('schedule-info');
  const nc=tournament.courts||4,cn=tournament.courtNames||[],matches=tournament.matches||[];
  if(!matches.length){container.innerHTML='<div class="empty-state"><div class="icon">&#128197;</div><h3>Sem partidas agendadas</h3></div>';return;}
  const startT=tournament.startTime||'08:00',endT=tournament.endTime||'18:00',dur=tournament.matchDuration||30,rest=tournament.restMinBetweenGames||20;
  const bS=tournament.breakStart||'12:00',bE=tournament.breakEnd||'13:30',slot=dur+rest;
  const slots=[];let cur=timeToMin(startT);const end=timeToMin(endT),bs=timeToMin(bS),be=timeToMin(bE);
  while(cur<end){
    if(cur>=bs&&cur<be){cur=be;continue;}
    if(cur+dur>bs&&cur<bs){cur=be;continue;}
    slots.push(cur);cur+=slot;
  }
  if(infoEl){const done=matches.filter(m=>m.status==='Finalizada'||m.status==='WO').length;infoEl.textContent=`${matches.length} jogos | ${done} finalizados`;}

  // Garantir que daySchedule tem draws preenchidos
  ensureDayScheduleDraws();
  // Agrupar por dia se daySchedule existe
  const hasDaySchedule=tournament.daySchedule?.length>0;
  let h='';

  if(hasDaySchedule){
    // Agrupar matches por dia
    tournament.daySchedule.forEach((day,dayIdx)=>{
      const dayMatches=matches.filter(m=>day.draws?.includes(m.drawName));
      if(!dayMatches.length)return;
      const dObj=new Date(day.date+'T00:00:00');
      const dayLabel=`Dia ${dayIdx+1} - ${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}/${dObj.getFullYear()}`;
      h+=`<div style="background:#1E3A8A;color:white;padding:12px 16px;border-radius:8px;margin-bottom:8px;font-weight:700;font-size:16px">${dayLabel} <span style="font-size:12px;font-weight:400;opacity:0.8">${day.startTime||'08:00'} - ${day.endTime||'18:00'}</span></div>`;
      const dayBs=timeToMin(day.breakStart||bS);const dayBe=timeToMin(day.breakEnd||bE);
      const sorted=[...dayMatches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
      let pausaRendered=false;
      // Agrupar por horario para detectar quadras livres
      let lastTime='';
      let matchesAtTime=0;
      sorted.forEach((m,si)=>{
        const mTime=m.time?timeToMin(m.time):0;
        if(!pausaRendered&&m.time&&mTime>=dayBs){
          pausaRendered=true;
          h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${day.breakStart||bS} - ${day.breakEnd||bE})</div>`;
        }
        // Contar jogos por horario e mostrar quadras livres quando muda o horario
        if(m.time&&m.time!==lastTime){
          // Antes de mudar de horario, verificar quadras livres do horario anterior
          if(lastTime&&matchesAtTime<nc){
            const livres=nc-matchesAtTime;
            for(let q=0;q<livres;q++){
              const courtName=cn[matchesAtTime+q]||`Quadra ${matchesAtTime+q+1}`;
              h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${lastTime}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
            }
          }
          lastTime=m.time;
          matchesAtTime=0;
        }
        matchesAtTime++;
        h+=renderScheduleMatch(m);
        // Ultimo jogo do dia: verificar quadras livres
        if(si===sorted.length-1&&m.time&&matchesAtTime<nc){
          const livres=nc-matchesAtTime;
          for(let q=0;q<livres;q++){
            const courtName=cn[matchesAtTime+q]||`Quadra ${matchesAtTime+q+1}`;
            h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${m.time}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
          }
        }
      });
      if(!pausaRendered&&dayBs<end)h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${day.breakStart||bS} - ${day.breakEnd||bE})</div>`;
    });
    // Matches sem dia atribuido
    const assignedDraws=new Set();tournament.daySchedule.forEach(d=>(d.draws||[]).forEach(n=>assignedDraws.add(n)));
    const unassigned=matches.filter(m=>!assignedDraws.has(m.drawName));
    if(unassigned.length){
      h+=`<div style="background:#334155;color:white;padding:12px 16px;border-radius:8px;margin:16px 0 8px;font-weight:700">Sem dia definido</div>`;
      unassigned.sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;}).forEach(m=>{h+=renderScheduleMatch(m);});
    }
  } else {
    // Sem daySchedule: layout original
    const sorted=[...matches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
    let pausaRendered=false;
    let lastTimeSingle='';let matchesAtTimeSingle=0;
    sorted.forEach((m,si)=>{
      const mTime=m.time?timeToMin(m.time):0;
      if(!pausaRendered&&m.time&&mTime>=bs){
        pausaRendered=true;
        h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${bS} - ${bE})</div>`;
      }
      if(m.time&&m.time!==lastTimeSingle){
        if(lastTimeSingle&&matchesAtTimeSingle<nc){
          const livres=nc-matchesAtTimeSingle;
          for(let q=0;q<livres;q++){
            const courtName=cn[matchesAtTimeSingle+q]||`Quadra ${matchesAtTimeSingle+q+1}`;
            h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${lastTimeSingle}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
          }
        }
        lastTimeSingle=m.time;matchesAtTimeSingle=0;
      }
      matchesAtTimeSingle++;
      h+=renderScheduleMatch(m);
      if(si===sorted.length-1&&m.time&&matchesAtTimeSingle<nc){
        const livres=nc-matchesAtTimeSingle;
        for(let q=0;q<livres;q++){
          const courtName=cn[matchesAtTimeSingle+q]||`Quadra ${matchesAtTimeSingle+q+1}`;
          h+=`<div style="background:#F1F5F9;padding:8px 16px;border-radius:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;border:1px dashed #CBD5E1"><span style="font-size:12px;color:#94A3B8;min-width:50px">${m.time}</span><span style="color:#94A3B8;font-size:12px;font-style:italic">${esc(courtName)} - livre</span></div>`;
        }
      }
    });
    if(!pausaRendered&&sorted.length&&bs<end)h+=`<div style="background:#FEE2E2;padding:12px 16px;border-radius:8px;text-align:center;font-weight:700;color:#991B1B;margin-bottom:8px">PAUSA (${bS} - ${bE})</div>`;
  }
  container.innerHTML=h;
}

function renderScheduleMatch(m){
  const done=m.status==='Finalizada'||m.status==='WO',eq=m.status==='Em Quadra',adef=m.status==='A definir';
  let bg='#fff';if(eq)bg='#FFF3E0';if(done)bg='#D1FAE5';if(adef)bg='#F9FAFB';
  const border=done?'#10B981':eq?'#F59E0B':adef?'var(--fabd-gray-300)':'var(--fabd-blue)';
  const p1=esc(m.player1Display||m.player1||'A definir'),p2=esc(m.player2Display||m.player2||'A definir');
  const p1Style=m.winner===1?'color:#10B981;font-weight:700':'font-weight:600';
  const p2Style=m.winner===2?'color:#10B981;font-weight:700':'font-weight:600';
  let scoreHtml='';
  if(m.score&&m.score!=='-'&&m.score!=='W.O.'&&m.score!=='DSQ'&&m.score!=='RET'){
    const sets=m.score.split('/').map(s=>s.trim());let s1=[],s2=[];
    sets.forEach(s=>{const p=s.split('-');if(p.length===2){s1.push(p[0].trim());s2.push(p[1].trim());}});
    scoreHtml=`<span style="color:${m.winner===1?'#10B981':'var(--fabd-gray-700)'}; font-weight:700">${s1.join(' ')}</span><span style="color:var(--fabd-gray-400);margin:0 6px">x</span><span style="color:${m.winner===2?'#10B981':'var(--fabd-gray-700)'}; font-weight:700">${s2.join(' ')}</span>`;
  } else if(m.score==='W.O.'||m.score==='DSQ'||m.score==='RET'){
    scoreHtml=`<span style="color:var(--fabd-red);font-weight:700">${esc(m.score)}</span>`;
  } else {
    scoreHtml='<span style="color:var(--fabd-gray-400);font-weight:700">x</span>';
  }
  let r='';
  r+=`<div style="background:${bg};border-left:4px solid ${border};border-radius:8px;padding:12px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">`;
  r+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">`;
  r+=`<div style="display:flex;align-items:center;gap:12px">`;
  r+=`<span style="font-weight:700;color:var(--fabd-blue);font-size:14px">Jogo ${m.num}</span>`;
  r+=`<span style="font-size:12px;color:var(--fabd-gray-500)">${esc(m.time||'-')}</span>`;
  r+=`<span style="font-size:12px;color:var(--fabd-gray-500)">${esc(m.drawName)}</span>`;
  r+=`<span style="font-size:11px;color:var(--fabd-gray-500)">${esc(m.roundName||'R'+m.round)}</span>`;
  r+=`</div>`;
  r+=`<div style="display:flex;align-items:center;gap:8px">`;
  if(m.court)r+=`<span style="font-size:11px;background:var(--fabd-blue);color:white;padding:2px 8px;border-radius:4px">${esc(m.court)}</span>`;
  if(m.umpire)r+=`<span style="font-size:11px;background:var(--fabd-gray-200);color:var(--fabd-gray-700);padding:2px 8px;border-radius:4px">${esc(m.umpire)}</span>`;
  r+=`</div></div>`;
  r+=`<div style="display:flex;align-items:center;justify-content:center;gap:16px;font-size:15px">`;
  r+=`<span style="${p1Style}">${p1}</span>`;
  r+=`<span style="font-size:14px">${scoreHtml}</span>`;
  r+=`<span style="${p2Style}">${p2}</span>`;
  r+=`</div></div>`;
  return r;
}

// === DRAW WIZARD ===
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
  ['settings-general','settings-game','settings-umpires'].forEach(id=>{document.getElementById(id).style.display=id===panelId?'':'none';});
  if(panelId==='settings-game')renderGameProfiles();
  if(panelId==='settings-umpires')renderUmpires();
}
const APP_VERSION='3.68';

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
        statusEl.innerHTML+=` <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="window.api.openExternal('${exeAsset.browser_download_url}')">Baixar v${esc(latestVersion)}</button>`;
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

function setTcTab(el,id){document.querySelectorAll('#tc-tabs .tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');['tc-tab-system','tc-tab-scoring','tc-tab-courts','tc-tab-schedule','tc-tab-pricing'].forEach(i=>document.getElementById(i).style.display=i===id?'':'none');if(id==='tc-tab-courts')renderCourtNames();if(id==='tc-tab-schedule')renderDaySchedule();if(id==='tc-tab-pricing')renderPricingSummary();}

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

function renderDaySchedule(){
  if(!tournament)return;
  const container=document.getElementById('tc-day-schedule-container');
  const days=getDaysBetween(tournament.startDate,tournament.endDate);
  if(!days.length){container.innerHTML='<div style="color:var(--fabd-gray-500);text-align:center;padding:24px">Defina as datas do torneio para configurar a programacao por dia.</div>';return;}
  const existing=tournament.daySchedule||[];
  const drawNames=(tournament.draws||[]).map(d=>d.name);
  // Separar simples e duplas
  const simples=drawNames.filter(n=>n.startsWith('SM ')||n.startsWith('SF '));
  const duplas=drawNames.filter(n=>n.startsWith('DM ')||n.startsWith('DF ')||n.startsWith('DX '));
  let h='';
  days.forEach((date,idx)=>{
    const saved=existing.find(d=>d.date===date)||{};
    const dObj=new Date(date+'T00:00:00');
    const label=`Dia ${idx+1} - ${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}/${dObj.getFullYear()}`;
    const st=saved.startTime||tournament.startTime||'08:00';
    const et=saved.endTime||tournament.endTime||'18:00';
    const bs=saved.breakStart||tournament.breakStart||'12:00';
    const be=saved.breakEnd||tournament.breakEnd||'13:30';
    const mode=saved.mode||'todas';
    h+=`<div style="background:var(--fabd-gray-100);border-radius:8px;padding:16px;margin-bottom:12px" data-day-date="${date}">`;
    h+=`<h4 style="margin-bottom:12px;color:var(--fabd-blue)">${label}</h4>`;
    h+=`<div class="form-row">`;
    h+=`<div class="form-group"><label>Inicio</label><input type="time" class="form-control ds-start" value="${st}"></div>`;
    h+=`<div class="form-group"><label>Termino</label><input type="time" class="form-control ds-end" value="${et}"></div>`;
    h+=`<div class="form-group"><label>Pausa inicio</label><input type="time" class="form-control ds-break-start" value="${bs}"></div>`;
    h+=`<div class="form-group"><label>Pausa fim</label><input type="time" class="form-control ds-break-end" value="${be}"></div>`;
    h+=`</div>`;
    h+=`<div style="margin-top:12px"><label style="font-weight:600;font-size:13px;margin-bottom:8px;display:block">Modalidades neste dia:</label>`;
    h+=`<div style="display:flex;gap:12px;flex-wrap:wrap">`;
    h+=`<label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;background:${mode==='todas'?'#2563EB':'#fff'};color:${mode==='todas'?'#fff':'#333'};border-radius:8px;border:2px solid ${mode==='todas'?'#2563EB':'#cbd5e1'}"><input type="radio" name="ds-mode-${idx}" class="ds-mode" value="todas" ${mode==='todas'?'checked':''} style="display:none"> Todas as categorias</label>`;
    h+=`<label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;background:${mode==='simples'?'#2563EB':'#fff'};color:${mode==='simples'?'#fff':'#333'};border-radius:8px;border:2px solid ${mode==='simples'?'#2563EB':'#cbd5e1'}"><input type="radio" name="ds-mode-${idx}" class="ds-mode" value="simples" ${mode==='simples'?'checked':''} style="display:none"> Simples (SM/SF)</label>`;
    h+=`<label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;background:${mode==='duplas'?'#2563EB':'#fff'};color:${mode==='duplas'?'#fff':'#333'};border-radius:8px;border:2px solid ${mode==='duplas'?'#2563EB':'#cbd5e1'}"><input type="radio" name="ds-mode-${idx}" class="ds-mode" value="duplas" ${mode==='duplas'?'checked':''} style="display:none"> Duplas (DM/DF/DX)</label>`;
    h+=`</div>`;
    // Mostrar quais categorias ficam neste dia
    const modeDraws=mode==='simples'?simples:mode==='duplas'?duplas:drawNames;
    if(modeDraws.length)h+=`<div style="margin-top:8px;font-size:12px;color:var(--fabd-gray-500)">Categorias: ${modeDraws.join(', ')}</div>`;
    h+=`</div></div>`;
  });
  container.innerHTML=h;
  // Listener: ao trocar radio, salvar estado atual e re-renderizar
  container.querySelectorAll('.ds-mode').forEach(r=>{
    r.addEventListener('change',()=>{
      // Salvar estado temporario antes de re-renderizar
      tournament.daySchedule=collectDaySchedule();
      renderDaySchedule();
    });
  });
}

function collectDaySchedule(){
  const panels=document.querySelectorAll('#tc-day-schedule-container [data-day-date]');
  const drawNames=(tournament?.draws||[]).map(d=>d.name);
  const simples=drawNames.filter(n=>n.startsWith('SM ')||n.startsWith('SF '));
  const duplas=drawNames.filter(n=>n.startsWith('DM ')||n.startsWith('DF ')||n.startsWith('DX '));
  const schedule=[];
  panels.forEach(panel=>{
    const date=panel.dataset.dayDate;
    const startTime=panel.querySelector('.ds-start')?.value||'08:00';
    const endTime=panel.querySelector('.ds-end')?.value||'18:00';
    const breakStart=panel.querySelector('.ds-break-start')?.value||'12:00';
    const breakEnd=panel.querySelector('.ds-break-end')?.value||'13:30';
    const modeEl=panel.querySelector('.ds-mode:checked');
    const mode=modeEl?.value||'todas';
    const draws=mode==='simples'?simples:mode==='duplas'?duplas:drawNames;
    schedule.push({date,startTime,endTime,breakStart,breakEnd,mode,draws});
  });
  return schedule;
}

// Recalcular draws de cada dia baseado no mode (corrige draws vazios)
function ensureDayScheduleDraws() {
  if (!tournament?.daySchedule?.length || !tournament?.draws?.length) return;
  const drawNames = tournament.draws.map(d => d.name);
  const simples = drawNames.filter(n => n.startsWith('SM ') || n.startsWith('SF '));
  const duplas = drawNames.filter(n => n.startsWith('DM ') || n.startsWith('DF ') || n.startsWith('DX '));
  tournament.daySchedule.forEach(day => {
    const mode = day.mode || 'todas';
    // Recalcular draws se estao vazios ou se o numero de chaves mudou
    if (!day.draws?.length || day.draws.length === 0) {
      day.draws = mode === 'simples' ? [...simples] : mode === 'duplas' ? [...duplas] : [...drawNames];
    }
  });
}

function getMatchDay(match){
  if(!tournament?.daySchedule?.length)return null;
  const dn=match.drawName||'';
  const isSimples=dn.startsWith('SM ')||dn.startsWith('SF ');
  const isDupla=dn.startsWith('DM ')||dn.startsWith('DF ')||dn.startsWith('DX ');
  for(const day of tournament.daySchedule){
    const mode=day.mode||'todas';
    if(mode==='todas')return day;
    if(mode==='simples'&&isSimples)return day;
    if(mode==='duplas'&&isDupla)return day;
  }
  return null;
}

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
    // Re-sincronizar chaves com novo perfil/config
    syncEntriesFromPlayers();
    await window.api.saveTournament(tournament);prepareRankingsForSync();window.api.supabaseUpsertTournament(tournament.id,tournament.name,tournament);closeModal('modal-tournament-config');renderTournamentPage();showToast('Configuracao salva!');
  }catch(e){showToast('Erro: '+e.message,'error');}
}

// === GAME PROFILES ===
async function loadGameProfiles(){
  try{
    const settings=await window.api.getSettings();
    if(settings?.gameProfiles?.length){gameProfiles=settings.gameProfiles;}
    else{
      // Fallback: tentar localStorage (migracao)
      try{gameProfiles=JSON.parse(localStorage.getItem('fabd-game-profiles')||'[]');}catch{gameProfiles=[];}
    }
  }catch{gameProfiles=[];}
  if(!gameProfiles.length){
    gameProfiles=[
      {id:'default-1',name:'Padrao FABD',mode:'custom',fixedType:'Eliminatoria',ranges:[{min:2,max:4,type:'Todos contra Todos'},{min:5,max:7,type:'Grupos + Eliminatoria'},{min:8,max:99,type:'Eliminatoria'}]},
      {id:'default-2',name:'Somente Mata-Mata',mode:'fixed',fixedType:'Eliminatoria',ranges:[]},
      {id:'default-3',name:'Somente Round Robin',mode:'fixed',fixedType:'Todos contra Todos',ranges:[]}
    ];
    saveGameProfiles();
  }
}
async function saveGameProfiles(){
  localStorage.setItem('fabd-game-profiles',JSON.stringify(gameProfiles));
  try{const s=await window.api.getSettings()||{};s.gameProfiles=gameProfiles;await window.api.saveSettings(s);}catch(e){console.warn('Erro ao sincronizar perfis:', e);}
}
function renderGameProfiles(){const c=document.getElementById('game-profiles-list');if(!gameProfiles.length){c.innerHTML='<p style="text-align:center;color:var(--fabd-gray-500)">Sem perfis</p>';return;}let h='<table><thead><tr><th>Nome</th><th>Modo</th><th>Detalhes</th><th>Acoes</th></tr></thead><tbody>';gameProfiles.forEach(p=>{h+=`<tr><td><strong>${esc(p.name)}</strong></td><td>${p.mode==='fixed'?'Fixo':'Personalizado'}</td><td style="font-size:12px">${p.mode==='fixed'?esc(p.fixedType):(p.ranges||[]).map(r=>`${r.min}-${r.max}: ${r.type}`).join(' | ')}</td><td><button class="btn btn-sm btn-secondary" onclick="editGameProfile('${p.id}')">Editar</button> <button class="btn btn-sm btn-danger" onclick="deleteGameProfile('${p.id}')">Excluir</button></td></tr>`;});c.innerHTML=h+'</tbody></table>';}
function addGameProfile(){document.getElementById('profile-editor-title').textContent='Novo Perfil';document.getElementById('gp-name').value='';document.getElementById('gp-mode').value='custom';onGameModeChange();setRanges([{min:2,max:4,type:'Todos contra Todos'},{min:5,max:7,type:'Grupos + Eliminatoria'},{min:8,max:99,type:'Eliminatoria'}]);document.getElementById('game-profile-editor').style.display='';}
function editGameProfile(id){const p=gameProfiles.find(x=>x.id===id);if(!p)return;document.getElementById('profile-editor-title').textContent='Editar';document.getElementById('gp-name').value=p.name;document.getElementById('gp-mode').value=p.mode;document.getElementById('gp-fixed-type').value=p.fixedType||'Eliminatoria';onGameModeChange();if(p.mode==='custom')setRanges(p.ranges||[]);document.getElementById('game-profile-editor').style.display='';editingProfileId=p.id;}
let editingProfileId=null;
function deleteGameProfile(id){if(!confirm('Excluir?'))return;gameProfiles=gameProfiles.filter(x=>x.id!==id);saveGameProfiles();renderGameProfiles();}
function cancelProfileEditor(){document.getElementById('game-profile-editor').style.display='none';editingProfileId=null;}
function onGameModeChange(){const m=document.getElementById('gp-mode').value;document.getElementById('gp-fixed-config').style.display=m==='fixed'?'':'none';document.getElementById('gp-custom-config').style.display=m==='custom'?'':'none';}
function setRanges(ranges){
  const c = document.getElementById('gp-ranges-container');
  let h = '';
  ranges.forEach((r, i) => {
    h += `<div class="form-row" style="margin-bottom:12px;align-items:stretch;background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:12px 14px;gap:12px">
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:12px;font-weight:600;color:#64748B">Se tiver de</span>
        <input type="number" class="form-control range-min" value="${r.min}" min="1" max="999" style="width:72px;text-align:center;font-weight:700">
        <span style="font-size:12px;font-weight:600;color:#64748B">a</span>
        <input type="number" class="form-control range-max" value="${r.max}" min="1" max="999" style="width:72px;text-align:center;font-weight:700">
        <span style="font-size:12px;font-weight:600;color:#64748B">atletas</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex:1">
        <span style="font-size:12px;font-weight:600;color:#64748B">&rarr;</span>
        <select class="form-control range-type" style="font-weight:600">
          <option value="Todos contra Todos"${r.type==='Todos contra Todos'?' selected':''}>Todos contra Todos</option>
          <option value="Grupos + Eliminatoria"${r.type==='Grupos + Eliminatoria'?' selected':''}>Grupos + Eliminatoria</option>
          <option value="Eliminatoria"${r.type==='Eliminatoria'?' selected':''}>Eliminatoria (mata-mata)</option>
        </select>
      </div>
      <div style="display:flex;align-items:center"><button class="btn btn-sm btn-danger" onclick="removeRange(${i})" title="Remover faixa">&times;</button></div>
    </div>`;
  });
  c.innerHTML = h;
}
function addRange(){const r=collectRanges();const l=r.length?r[r.length-1].max+1:2;r.push({min:l,max:l+10,type:'Eliminatoria'});setRanges(r);}
function removeRange(i){const r=collectRanges();if(r.length<=1)return;r.splice(i,1);setRanges(r);}
function collectRanges(){
  // Perfis definem apenas faixa (min, max) e tipo de disputa.
  // numGroups e classificados/grupo saem do calculo BTP (calcIdealGroupCount)
  // e podem ser editados manualmente por chave no detalhe.
  const r = [];
  document.querySelectorAll('#gp-ranges-container .form-row').forEach(row => {
    r.push({
      min: parseInt(row.querySelector('.range-min').value) || 1,
      max: parseInt(row.querySelector('.range-max').value) || 99,
      type: row.querySelector('.range-type').value
    });
  });
  return r;
}
function saveGameProfile(){const name=gv('gp-name');if(!name){alert('Nome');return;}const mode=document.getElementById('gp-mode').value;const p={id:editingProfileId||Date.now().toString(),name,mode,fixedType:document.getElementById('gp-fixed-type').value,ranges:mode==='custom'?collectRanges():[]};if(editingProfileId){const i=gameProfiles.findIndex(x=>x.id===editingProfileId);if(i>=0)gameProfiles[i]=p;}else gameProfiles.push(p);saveGameProfiles();cancelProfileEditor();renderGameProfiles();showToast('Perfil salvo!');}
function getDrawTypeForCount(t,count){if(!t.gameProfileId)return null;const p=gameProfiles.find(x=>x.id===t.gameProfileId);if(!p)return null;if(p.mode==='fixed')return p.fixedType;for(const r of(p.ranges||[]))if(count>=r.min&&count<=r.max)return r.type;if(p.ranges?.length)return p.ranges[p.ranges.length-1].type;return null;}

// Calculo BTP/BWF ideal de numero de grupos por contagem de atletas.
// Alvo: grupos de 3-4 atletas.
// 1-5: 1 grupo (round-robin puro)
// 6-8: 2 | 9-12: 3 | 13-16: 4 | 17-24: 6 | 25+: 8
function calcIdealGroupCount(n) {
  if (n <= 5) return 1;
  if (n <= 8) return 2;
  if (n <= 12) return 3;
  if (n <= 16) return 4;
  if (n <= 24) return 6;
  return 8;
}

// === UMPIRES ===
function loadUmpires(){
  try{return JSON.parse(localStorage.getItem('fabd-umpires')||'[]');}catch{return[];}
}
function saveUmpires(l){
  localStorage.setItem('fabd-umpires',JSON.stringify(l));
  // Salvar no banco tambem para persistir
  window.api.getSettings().then(s=>{s=s||{};s.umpires=l;window.api.saveSettings(s);}).catch(()=>{});
}
function renderUmpires(){
  const u=loadUmpires(),tb=document.getElementById('umpires-table-body');
  let h='';
  // Arbitros locais
  if(u.length){
    u.forEach((x,i)=>{h+=`<tr><td>${i+1}</td><td><strong>${esc(x.name)}</strong></td><td><span class="tag tag-blue">${esc(x.level)}</span></td><td><button class="btn btn-sm btn-danger" onclick="removeUmpire(${i})">Remover</button></td></tr>`;});
  }
  tb.innerHTML=h||'<tr><td colspan="4" style="text-align:center;color:var(--fabd-gray-500);padding:24px">Nenhum arbitro local</td></tr>';
  // Carregar arbitros online do Supabase
  loadOnlineReferees();
}

async function loadOnlineReferees(){
  let container=document.getElementById('online-referees-container');
  if(!container){
    const parent=document.getElementById('umpires-table-body')?.closest('.card');
    if(!parent)return;
    const div=document.createElement('div');
    div.id='online-referees-container';
    div.style.cssText='margin-top:24px;padding-top:16px;border-top:1px solid var(--fabd-gray-200)';
    parent.appendChild(div);
    container=div;
  }
  try{
    const referees=await window.api.supabaseGetReferees();
    if(!referees?.length){container.innerHTML='<h4 style="color:var(--fabd-gray-600);margin-bottom:8px">Arbitros Online</h4><p style="color:var(--fabd-gray-500);font-size:13px">Nenhum arbitro conectado.</p>';return;}
    let h='<h4 style="color:var(--fabd-gray-600);margin-bottom:12px">Arbitros Online (via App)</h4>';
    h+='<table><thead><tr><th>Nome</th><th>Email</th><th>Status</th><th>Acoes</th></tr></thead><tbody>';
    referees.forEach(r=>{
      const stClass=r.status==='autorizado'?'tag-green':r.status==='bloqueado'?'tag-red':'tag-yellow';
      const stText=r.status==='autorizado'?'Autorizado':r.status==='bloqueado'?'Bloqueado':'Pendente';
      h+=`<tr>
        <td><strong>${esc(r.name)}</strong></td>
        <td style="font-size:12px;color:var(--fabd-gray-500)">${esc(r.email||'')}</td>
        <td><span class="tag ${stClass}">${stText}</span></td>
        <td>`;
      if(r.status!=='autorizado')h+=`<button class="btn btn-sm btn-success" onclick="authorizeReferee('${esc(r.id)}','autorizado')">Liberar</button> `;
      if(r.status!=='bloqueado')h+=`<button class="btn btn-sm btn-danger" onclick="authorizeReferee('${esc(r.id)}','bloqueado')">Bloquear</button>`;
      if(r.status==='autorizado')h+=`<button class="btn btn-sm btn-secondary" onclick="authorizeReferee('${esc(r.id)}','pendente')" style="margin-left:4px">Revogar</button>`;
      h+=`</td></tr>`;
    });
    h+='</tbody></table>';
    container.innerHTML=h;
  }catch(e){container.innerHTML='<p style="color:var(--fabd-gray-500);font-size:12px">Erro ao carregar arbitros online</p>';}
}

async function authorizeReferee(id,status){
  try{
    await window.api.supabaseUpdateRefereeStatus(id,status);
    if(status==='autorizado'){
      const name=await window.api.supabaseGetRefereeName(id);
      if(name){
        const umps=loadUmpires();
        if(!umps.some(u=>u.name===name)){umps.push({name,level:'Online'});saveUmpires(umps);}
      }
    }
    showToast(status==='autorizado'?'Arbitro autorizado!':status==='bloqueado'?'Arbitro bloqueado':'Acesso revogado');
    renderUmpires();
  }catch(e){showToast('Erro: '+e.message,'error');}
}
function addUmpire(){const n=gv('umpire-name');if(!n){alert('Nome');return;}const l=document.getElementById('umpire-level').value;const u=loadUmpires();if(u.some(x=>x.name.toLowerCase()===n.toLowerCase())){alert('Ja existe');return;}u.push({name:n,level:l});saveUmpires(u);document.getElementById('umpire-name').value='';renderUmpires();showToast('Arbitro adicionado!');}
function removeUmpire(i){if(!confirm('Remover?'))return;const u=loadUmpires();u.splice(i,1);saveUmpires(u);renderUmpires();showToast('Removido');}

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
function parseCSV(content,filePath){const fl=content.split('\n')[0];const sep=(fl.match(/;/g)||[]).length>(fl.match(/,/g)||[]).length?';':',';document.getElementById('import-separator').textContent=sep===';'?'Ponto e virgula':'Virgula';const lines=content.split('\n').map(l=>l.trim()).filter(l=>l);if(lines.length<2){showToast('Arquivo precisa de cabecalho + dados','warning');return;}const headers=parseCSVLine(lines[0],sep);const colMap=mapColumns(headers);importedRows=[];for(let i=1;i<lines.length;i++){const cols=parseCSVLine(lines[i],sep);if(cols.length<2)continue;const row={firstName:getCol(cols,colMap.firstName),lastName:getCol(cols,colMap.lastName),gender:normalizeGender(getCol(cols,colMap.gender)),dob:normalizeDate(getCol(cols,colMap.dob)),club:getCol(cols,colMap.club),state:getCol(cols,colMap.state)||'AL',ranking:getCol(cols,colMap.ranking),phone:getCol(cols,colMap.phone),email:getCol(cols,colMap.email),inscricoesRaw:getCol(cols,colMap.inscricoes),duplaDM:getCol(cols,colMap.duplaDM),duplaDF:getCol(cols,colMap.duplaDF),duplaDX:getCol(cols,colMap.duplaDX),valid:true,error:''};if(!row.firstName&&!row.lastName){row.valid=false;row.error='Nome vazio';}if(row.gender!=='M'&&row.gender!=='F'){row.valid=false;row.error='Genero invalido';}row.category=calculateCategory(row.dob);importedRows.push(row);}document.getElementById('import-file-name').textContent=filePath.split(/[/\\]/).pop();document.getElementById('import-count').textContent=`${importedRows.length} linha(s)`;const vc=importedRows.filter(r=>r.valid).length,ic=importedRows.filter(r=>!r.valid).length;document.getElementById('import-preview-head').innerHTML='<tr><th>#</th><th>Nome</th><th>Sobrenome</th><th>Gen.</th><th>Nasc.</th><th>Cat.</th><th>Clube</th><th>Inscricoes</th><th>Status</th></tr>';let tb='';importedRows.forEach((r,i)=>{const inscs=(r.inscricoesRaw||'').split(/[;|]/).filter(x=>x.trim()).map(x=>`<span class="tag tag-blue" style="margin:1px;font-size:9px">${esc(x.trim())}</span>`).join(' ')||'-';tb+=`<tr style="${r.valid?'':'background:#FEE2E2'}"><td>${i+1}</td><td>${esc(r.firstName)}</td><td>${esc(r.lastName)}</td><td>${esc(r.gender)}</td><td>${esc(r.dob)}</td><td>${esc(r.category)}</td><td>${esc(r.club)}</td><td>${inscs}</td><td>${r.valid?'<span class="tag tag-green">OK</span>':`<span class="tag tag-red">${esc(r.error)}</span>`}</td></tr>`;});document.getElementById('import-preview-body').innerHTML=tb;document.getElementById('import-summary').innerHTML=`<strong>${vc}</strong> valido(s)${ic?`<br><span style="color:var(--fabd-red)">${ic} com erro</span>`:''}`;document.getElementById('import-step-1').style.display='none';document.getElementById('import-step-2').style.display='';document.getElementById('import-btn-confirm').style.display=vc?'':'none';}
function parseCSVLine(line,sep){const r=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===sep&&!q){r.push(c.trim());c='';}else c+=ch;}r.push(c.trim());return r;}
function mapColumns(h){const m={firstName:-1,lastName:-1,gender:-1,dob:-1,club:-1,state:-1,ranking:-1,phone:-1,email:-1,inscricoes:-1,duplaDM:-1,duplaDF:-1,duplaDX:-1};const a={firstName:['nome','firstname','first name'],lastName:['sobrenome','lastname','last name'],gender:['genero','gender','sexo'],dob:['data nascimento','datanascimento','dob','date of birth','data nasc','dt nascimento'],club:['clube','club'],state:['estado','state','uf'],ranking:['ranking','classificacao','rank'],phone:['telefone','phone','tel','celular','mobile'],email:['email','e-mail','mail'],inscricoes:['inscricoes','inscricao','categories','categorias'],duplaDM:['dupla_dm','dupladm','parceiro_dm'],duplaDF:['dupla_df','dupladf','parceira_df'],duplaDX:['dupla_dx','duladx','parceiro_dx','parceira_dx']};h.forEach((x,i)=>{if(x==null)return;const l=String(x).toLowerCase().replace(/[^a-z0-9_ ]/g,'').trim();Object.keys(a).forEach(k=>{if(a[k].some(al=>l===al||l.includes(al))&&m[k]===-1)m[k]=i;});});if(m.firstName===-1)m.firstName=0;if(m.lastName===-1)m.lastName=1;if(m.gender===-1)m.gender=2;if(m.dob===-1)m.dob=3;if(m.club===-1)m.club=4;if(m.state===-1)m.state=5;if(m.ranking===-1)m.ranking=6;if(m.phone===-1)m.phone=7;if(m.email===-1)m.email=8;if(m.inscricoes===-1)m.inscricoes=9;if(m.duplaDM===-1)m.duplaDM=10;if(m.duplaDF===-1)m.duplaDF=11;if(m.duplaDX===-1)m.duplaDX=12;return m;}
function getCol(c,i){return i>=0&&i<c.length&&c[i]!=null?String(c[i]).replace(/^["']|["']$/g,'').trim():'';}
function normalizeName(s){return(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
// C6: normalizeGender — so retorna 'M' ou 'F' (ou '' se invalido/vazio).
// Antes retornava valor nao-reconhecido como-estava, quebrando modalidade DM/DF/DX.
function normalizeGender(g){
  if(!g)return'';
  const v=String(g).toUpperCase().trim();
  if(['M','MASCULINO','MASC','MALE','H','HOMEM'].includes(v))return'M';
  if(['F','FEMININO','FEM','FEMALE','MULHER'].includes(v))return'F';
  return ''; // invalido -> vazio (validacao posterior marca linha invalida)
}
// R5+R6: normalizeDate aceita Date object, serial Excel (numero/string numerica),
// strings DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, ISO YYYY-MM-DD. Retorna '' para invalido
// (nao mais o valor original). Caller deve checar '' para detectar DOBs nao-reconhecidos.
function normalizeDate(d){
  if(d==null||d==='')return'';
  // Date object
  if(d instanceof Date){
    if(isNaN(d.getTime()))return'';
    const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
    return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  // Serial Excel (numero) — dias desde 1899-12-30 (epoch Excel).
  // Faixa razoavel: 1 (1900-01-01) a 73000 (~2099).
  if(typeof d==='number'&&d>0&&d<100000){
    const dt=new Date(Date.UTC(1899,11,30)+d*86400000);
    if(!isNaN(dt.getTime())){
      const y=dt.getUTCFullYear(),m=dt.getUTCMonth()+1,day=dt.getUTCDate();
      return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
    return'';
  }
  const s=String(d).trim();
  if(!s)return'';
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  let m=s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // ISO YYYY-MM-DD (com ou sem tempo)
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // String puramente numerica (serial Excel que veio como string)
  if(/^\d+(\.\d+)?$/.test(s))return normalizeDate(parseFloat(s));
  return ''; // nao reconhecido
}
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
function printReport(type){
  if(!tournament){showToast('Nenhum torneio ativo','warning');return;}
  const tName=esc(tournament.name);
  const tDate=fmtDate(tournament.startDate)+(tournament.endDate&&tournament.endDate!==tournament.startDate?' a '+fmtDate(tournament.endDate):'');
  const tLocation=esc(tournament.location||'')+' - '+esc(tournament.city||'');

  const reportStyles=`
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',Tahoma,sans-serif;font-size:13px;color:#1a1a1a;padding:20px 30px;}
      .report-header{text-align:center;margin-bottom:24px;border-bottom:3px solid #1E3A8A;padding-bottom:16px;}
      .report-header h1{font-size:20px;color:#1E3A8A;margin-bottom:4px;}
      .report-header h2{font-size:15px;color:#333;font-weight:600;margin-bottom:4px;}
      .report-header p{font-size:12px;color:#666;}
      .report-header .fabd-name{font-size:14px;color:#C41E2A;font-weight:700;letter-spacing:1px;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#1E3A8A;color:white;padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;}
      td{padding:5px 10px;border-bottom:1px solid #ddd;font-size:12px;}
      tr:nth-child(even){background:#f8f9fa;}
      .cat-title{background:#f0f4ff;padding:8px 12px;font-weight:700;color:#1E3A8A;font-size:14px;margin:16px 0 8px;border-left:4px solid #1E3A8A;}
      .medal-gold{color:#D97706;font-weight:700;}
      .medal-silver{color:#6B7280;font-weight:700;}
      .medal-bronze{color:#92400E;font-weight:700;}
      .winner{color:#059669;font-weight:700;}
      .no-print{margin:20px 0;}
      .bracket-svg{overflow-x:auto;margin:10px 0;}
      .rr-table th,.rr-table td{text-align:center;padding:4px 6px;font-size:11px;}
      .rr-table td:nth-child(2){text-align:left;}
      .page-break{page-break-before:always;}
      @media print{.no-print{display:none !important;}}
    </style>`;
  const reportHeader=`<div class="report-header">
    <div class="fabd-name">FEDERACAO ALAGOANA DE BADMINTON</div>
    <h1>${tName}</h1>
    <p>${tDate} | ${tLocation}</p>
  </div>`;
  const printBtn='<div class="no-print" style="text-align:center"><button onclick="window.print()" style="padding:10px 24px;font-size:14px;background:#1E3A8A;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Imprimir</button> <button onclick="window.close()" style="padding:10px 24px;font-size:14px;background:#6B7280;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;margin-left:8px">Fechar</button></div>';

  let body='';
  switch(type){
    case 'entries': body=reportEntries(); break;
    case 'draws': body=reportDraws(); break;
    case 'results': body=reportResults(); break;
    case 'oop': body=reportOOP(); break;
    case 'winners': body=reportWinners(); break;
    case 'classification': body=reportClassification(); break;
    case 'players': body=reportPlayers(); break;
    default: body='<p>Relatorio nao encontrado.</p>';
  }

  const w=window.open('','_blank','width=900,height=700');
  if(!w){showToast('Popup bloqueado. Permita popups para imprimir.','warning');return;}
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(tName)} - Relatorio</title>${reportStyles}</head><body>${esc(reportHeader)}${printBtn}${esc(body)}${printBtn}</body></html>`);
  w.document.close();
}

function reportEntries(){
  const entries=tournament.entries||[];
  if(!entries.length)return'<p>Nenhum inscrito.</p>';
  const groups={};
  entries.forEach(e=>{if(!groups[e.key])groups[e.key]=[];groups[e.key].push(e);});
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Lista de Inscritos</h2>';
  Object.keys(groups).sort().forEach(key=>{
    const list=groups[key];
    h+=`<div class="cat-title">${esc(key)} (${list.length} inscritos)</div>`;
    h+='<table><thead><tr><th>#</th><th>Jogador</th><th>Clube</th><th>Dupla</th><th>Status</th></tr></thead><tbody>';
    list.forEach((e,i)=>{
      const partnerName=e.partner?players.find(p=>p.id===e.partner):null;
      const pn=partnerName?`${partnerName.firstName} ${partnerName.lastName}`:'';
      h+=`<tr><td>${i+1}</td><td>${esc(e.playerName)}</td><td>${esc(e.club||'-')}</td><td>${esc(pn)||'-'}</td><td>${esc(e.status)}</td></tr>`;
    });
    h+='</tbody></table>';
  });
  return h;
}

function reportDraws(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Chaves / Brackets</h2>';
  draws.forEach((d,di)=>{
    if(di>0)h+='<div class="page-break"></div>';
    h+=`<div class="cat-title">${esc(d.name)} - ${esc(d.type)} (${d.players?.length||0} jogadores)</div>`;
    if(!d.matches?.length){
      h+='<p style="padding:8px;color:#666">Chave ainda nao sorteada.</p>';
      h+='<table><thead><tr><th>#</th><th>Jogador</th></tr></thead><tbody>';
      (d.players||[]).forEach((p,i)=>{h+=`<tr><td>${i+1}</td><td>${esc(p)}</td></tr>`;});
      h+='</tbody></table>';
      return;
    }
    if(d.type==='Eliminatoria'){
      h+=reportBracketSVG(d);
    } else {
      h+=reportRoundRobinTable(d);
    }
  });
  return h;
}

function reportBracketSVG(d){
  // Reuse the renderBracket logic but return the SVG HTML
  return renderBracket(d);
}

function reportRoundRobinTable(d){
  if(!d.players?.length)return'';
  let h='<table class="rr-table"><thead><tr><th>#</th><th>Jogador</th>';
  d.players.forEach((_,i)=>h+=`<th>${i+1}</th>`);
  h+='<th>V</th><th>D</th><th>Pts</th></tr></thead><tbody>';
  d.players.forEach((p,i)=>{
    h+=`<tr><td>${i+1}</td><td style="text-align:left"><strong>${esc(p)}</strong></td>`;
    d.players.forEach((q,j)=>{
      if(i===j){h+='<td style="background:#e5e7eb">-</td>';return;}
      const m=(d.matches||[]).find(x=>(x.player1===p&&x.player2===q)||(x.player1===q&&x.player2===p));
      if(!m||m.winner===undefined){h+='<td>-</td>';return;}
      const isP1=m.player1===p;
      if(m.score1==='W.O.'||m.score2==='W.O.'){
        const iWon=(isP1&&m.winner===1)||(!isP1&&m.winner===2);
        h+=`<td style="color:${iWon?'#10B981':'#DC2626'};font-weight:700">${iWon?'W':'L'}</td>`;
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
  h+='</tbody></table>';
  return h;
}

function reportResults(){
  const matches=tournament.matches||[];
  const finished=matches.filter(m=>m.status==='Finalizada'||m.status==='WO'||m.status==='Desistencia'||m.status==='Desqualificacao');
  if(!finished.length)return'<p>Nenhum resultado registrado.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Resultados</h2>';
  const groups={};
  finished.forEach(m=>{const k=m.drawName||'Sem chave';if(!groups[k])groups[k]=[];groups[k].push(m);});
  Object.keys(groups).sort().forEach(key=>{
    const list=groups[key];
    h+=`<div class="cat-title">${esc(key)}</div>`;
    h+='<table><thead><tr><th>Jogo</th><th>Rodada</th><th>Jogador 1</th><th>Placar</th><th>Jogador 2</th><th>Quadra</th><th>Arbitro</th></tr></thead><tbody>';
    list.forEach(m=>{
      const p1Style=m.winner===1?'class="winner"':'';
      const p2Style=m.winner===2?'class="winner"':'';
      let scoreStr=m.score||'-';
      h+=`<tr><td>${m.num}</td><td>${esc(m.roundName||'R'+m.round)}</td><td ${p1Style}>${esc(m.player1||'-')}</td><td style="text-align:center;font-weight:700">${esc(scoreStr)}</td><td ${p2Style}>${esc(m.player2||'-')}</td><td>${esc(m.court||'-')}</td><td>${esc(m.umpire||'-')}</td></tr>`;
    });
    h+='</tbody></table>';
  });
  return h;
}

function reportOOP(){
  const matches=tournament.matches||[];
  if(!matches.length)return'<p>Sem partidas agendadas.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Ordem de Jogo</h2>';

  const renderMatchTable=(list)=>{
    let t='<table><thead><tr><th>Hora</th><th>Jogo</th><th>Chave</th><th>Rodada</th><th>Jogador 1</th><th>x</th><th>Jogador 2</th><th>Quadra</th><th>Status</th></tr></thead><tbody>';
    list.forEach(m=>{
      const done=m.status==='Finalizada'||m.status==='WO';
      const p1Style=m.winner===1?'class="winner"':'';
      const p2Style=m.winner===2?'class="winner"':'';
      t+=`<tr${done?' style="color:#888"':''}>
        <td>${esc(m.time||'-')}</td><td>${m.num}</td><td>${esc(m.drawName||'-')}</td><td>${esc(m.roundName||'R'+m.round)}</td>
        <td ${p1Style}>${esc(m.player1Display||m.player1||'A definir')}</td><td style="text-align:center">x</td>
        <td ${p2Style}>${esc(m.player2Display||m.player2||'A definir')}</td><td>${esc(m.court||'-')}</td><td>${esc(m.status)}</td></tr>`;
    });
    t+='</tbody></table>';
    return t;
  };

  if(tournament.daySchedule?.length){
    // Agrupar por dia
    const modeLabels={'todas':'Todas as categorias','simples':'Simples (SM/SF)','duplas':'Duplas (DM/DF/DX)'};
    tournament.daySchedule.forEach((day,idx)=>{
      const dObj=new Date(day.date+'T00:00:00');
      const dayLabel=`Dia ${idx+1} - ${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}/${dObj.getFullYear()}`;
      const modLabel=modeLabels[day.mode||'todas']||'Todas';
      // Filtrar matches deste dia pelo mode
      const mode=day.mode||'todas';
      const dayMatches=matches.filter(m=>{
        const dn=m.drawName||'';
        if(mode==='todas')return true;
        if(mode==='simples')return dn.startsWith('SM ')||dn.startsWith('SF ');
        if(mode==='duplas')return dn.startsWith('DM ')||dn.startsWith('DF ')||dn.startsWith('DX ');
        return false;
      });
      if(!dayMatches.length)return;
      const sorted=[...dayMatches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
      h+=`<div class="cat-title" style="margin-top:${idx?'24':'0'}px">${dayLabel} - ${modLabel}</div>`;
      h+=renderMatchTable(sorted);
    });
    // Matches sem dia
    const assignedModes=tournament.daySchedule.map(d=>d.mode||'todas');
    if(!assignedModes.includes('todas')){
      const unassigned=matches.filter(m=>{
        const dn=m.drawName||'';
        const isSimples=dn.startsWith('SM ')||dn.startsWith('SF ');
        const isDupla=dn.startsWith('DM ')||dn.startsWith('DF ')||dn.startsWith('DX ');
        return !(assignedModes.includes('simples')&&isSimples)&&!(assignedModes.includes('duplas')&&isDupla);
      });
      if(unassigned.length){
        const sorted=[...unassigned].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
        h+=`<div class="cat-title" style="margin-top:24px">Sem dia definido</div>`;
        h+=renderMatchTable(sorted);
      }
    }
  } else {
    // Sem programacao: lista unica
    const sorted=[...matches].sort((a,b)=>{const ta=a.time?timeToMin(a.time):9999;const tb2=b.time?timeToMin(b.time):9999;return ta-tb2||a.num-b.num;});
    h+=renderMatchTable(sorted);
  }
  return h;
}

function reportWinners(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Premiacao</h2>';
  let count=0;
  draws.forEach(d=>{
    // So mostrar categorias com TODOS os jogos finalizados
    const realMatches=(d.matches||[]).filter(m=>!m.isBye&&m.player1&&m.player2&&m.player2!=='BYE'&&m.player1!=='BYE');
    const allFinished=realMatches.length>0&&realMatches.every(m=>m.winner!==undefined&&m.winner!==null);
    if(!allFinished)return;
    const ranking=computeDrawRanking(d);
    if(!ranking||!ranking.length)return;
    count++;
    h+=`<div class="cat-title">${esc(d.name)}</div>`;
    h+='<table><thead><tr><th>Pos.</th><th>Medalha</th><th>Jogador</th></tr></thead><tbody>';
    ranking.forEach(r=>{
      const medalClass=r.pos===1?'medal-gold':r.pos===2?'medal-silver':'medal-bronze';
      const medalLabel=r.pos===1?'Ouro':r.pos===2?'Prata':'Bronze';
      const medalIcon=r.pos===1?'\uD83E\uDD47':r.pos===2?'\uD83E\uDD48':'\uD83E\uDD49';
      h+=`<tr><td class="${medalClass}">${r.pos}o</td><td class="${medalClass}">${medalIcon} ${medalLabel}</td><td class="${medalClass}">${esc(r.name)}</td></tr>`;
    });
    h+='</tbody></table>';
  });
  if(!count)h+='<p>Nenhuma categoria finalizada.</p>';
  return h;
}

function computeFullClassification(d){
  if(!d.players?.length)return[];

  if(d.type==='Eliminatoria'){
    // Classificar pela rodada em que foi eliminado (mais longe = melhor posicao)
    const totalR=Math.max(...(d.matches||[]).map(m=>m.round)||[1]);
    const playerRound={}; // jogador -> rodada mais alta que jogou
    d.players.forEach(p=>{playerRound[p]=0;});
    (d.matches||[]).forEach(m=>{
      if(m.isBye)return;
      if(m.player1&&playerRound[m.player1]!==undefined)playerRound[m.player1]=Math.max(playerRound[m.player1],m.round);
      if(m.player2&&m.player2!=='BYE'&&playerRound[m.player2]!==undefined)playerRound[m.player2]=Math.max(playerRound[m.player2],m.round);
    });
    // Campeao e vice
    const finalM=(d.matches||[]).find(m=>m.round===totalR);
    const champion=finalM?.winner===1?finalM.player1:finalM?.winner===2?finalM.player2:null;
    const vice=finalM?.winner===1?finalM.player2:finalM?.winner===2?finalM.player1:null;

    // Ordenar: campeao (1), vice (2), depois por rodada mais alta (desc)
    const sorted=[...d.players].sort((a,b)=>{
      if(a===champion)return-1;if(b===champion)return 1;
      if(a===vice)return-1;if(b===vice)return 1;
      return(playerRound[b]||0)-(playerRound[a]||0);
    });

    // Atribuir posicoes (empatados na mesma rodada = mesma posicao)
    // R10: shape consistente — todos pushes incluem wins/losses (null em eliminatoria).
    const result=[];
    let pos=1;
    for(let i=0;i<sorted.length;i++){
      const p=sorted[i];
      if(p===champion){result.push({pos:1,name:p,round:totalR,note:'Campeao',wins:null,losses:null});pos=2;continue;}
      if(p===vice){result.push({pos:2,name:p,round:totalR,note:'Vice',wins:null,losses:null});pos=3;continue;}
      // Mesmo round = mesma posicao
      if(i>0&&sorted[i-1]!==champion&&sorted[i-1]!==vice&&playerRound[p]===playerRound[sorted[i-1]]){
        result.push({pos:result[result.length-1].pos,name:p,round:playerRound[p]||0,note:'',wins:null,losses:null});
      } else {
        result.push({pos:i+1,name:p,round:playerRound[p]||0,note:'',wins:null,losses:null});
      }
    }
    return result;
  }

  if(d.type==='Grupos + Eliminatoria'&&d.groupsData){
    const classification=[];
    // Fase de eliminatoria: top posicoes
    const elimM=d.groupsData.eliminationMatches||[];
    const hasFinalWinner=elimM.length&&elimM.find(m=>m.round===Math.max(...elimM.map(x=>x.round)))?.winner;
    if(!hasFinalWinner){
      // Eliminatoria nao concluida — nao mostrar classificacao parcial
      return[{pos:0,name:'Chave em andamento',note:'Aguardando finalizacao',wins:null,losses:null}];
    }
    if(elimM.length){
      const totalR=Math.max(...elimM.map(m=>m.round));
      const finalM=elimM.find(m=>m.round===totalR);
      if(finalM?.winner){
        const champ=finalM.winner===1?finalM.player1:finalM.player2;
        const vice=finalM.winner===1?finalM.player2:finalM.player1;
        classification.push({pos:1,name:champ,note:'Campeao',wins:null,losses:null});
        classification.push({pos:2,name:vice,note:'Vice',wins:null,losses:null});
        // Perdedores das semis = 3o
        if(totalR>=2){
          elimM.filter(m=>m.round===totalR-1).forEach(sm=>{
            if(!sm.winner)return;
            const loser=sm.winner===1?sm.player2:sm.player1;
            if(loser&&loser!==champ&&loser!==vice&&!classification.find(c=>c.name===loser)){
              classification.push({pos:3,name:loser,note:'3o colocado',wins:null,losses:null});
            }
          });
        }
        // Perdedores de rodadas anteriores
        for(let r=totalR-2;r>=1;r--){
          const roundLosers=elimM.filter(m=>m.round===r&&m.winner).map(m=>m.winner===1?m.player2:m.player1).filter(n=>n&&!classification.find(c=>c.name===n));
          const nextPos=classification.length+1;
          roundLosers.forEach(loser=>{classification.push({pos:nextPos,name:loser,note:'',wins:null,losses:null});});
        }
      }
    }
    // Fase de grupos: quem nao classificou
    // Agrupar por colocacao no grupo (3o de todos os grupos = mesma posicao)
    const classified=new Set(classification.map(c=>c.name));
    const qualifiers=d.groupQualifiers||2;
    const numGroups=(d.groupsData.groups||[]).length;
    const maxPlayers=Math.max(...(d.groupsData.groups||[]).map(g=>g.players?.length||0));

    for(let posInGroup=qualifiers;posInGroup<maxPlayers;posInGroup++){
      const basePos=classification.length+1;
      (d.groupsData.groups||[]).forEach(g=>{
        const standings=computeGroupStandings(g.players,g.matches);
        const s=standings[posInGroup];
        if(!s||classified.has(s.name))return;
        classified.add(s.name);
        classification.push({pos:basePos,name:s.name,note:`${posInGroup+1}o ${g.name}`,wins:s.wins,losses:s.losses});
      });
    }
    return classification;
  }

  // Todos contra Todos
  if(d.type==='Todos contra Todos'){
    const stats={};
    d.players.forEach(p=>{stats[p]={name:p,wins:0,losses:0,ptsFor:0,ptsAgainst:0};});
    (d.matches||[]).forEach(m=>{
      if(!m.winner)return;
      if(stats[m.player1]&&stats[m.player2]){
        if(m.winner===1){stats[m.player1].wins++;stats[m.player2].losses++;}
        else{stats[m.player2].wins++;stats[m.player1].losses++;}
        if(m.score1&&m.score2){
          const s1=String(m.score1).split(' ').map(Number).filter(n=>!isNaN(n));
          const s2=String(m.score2).split(' ').map(Number).filter(n=>!isNaN(n));
          s1.forEach(v=>{stats[m.player1].ptsFor+=v;});
          s2.forEach(v=>{stats[m.player2].ptsFor+=v;stats[m.player1].ptsAgainst+=v;});
          s1.forEach(v=>{stats[m.player2].ptsAgainst+=v;});
        }
      }
    });
    return Object.values(stats).sort((a,b)=>b.wins-a.wins||(b.ptsFor-b.ptsAgainst)-(a.ptsFor-a.ptsAgainst)||b.ptsFor-a.ptsFor).map((s,i)=>({pos:i+1,name:s.name,wins:s.wins,losses:s.losses,note:''}));
  }

  return[];
}

function reportClassification(){
  const draws=tournament.draws||[];
  if(!draws.length)return'<p>Nenhuma chave criada.</p>';

  // Ordem das categorias (crescente)
  const catOrder=['Sub 11','Sub 13','Sub 15','Sub 17','Sub 19','Sub 23','Principal','Senior','Master I','Master II'];
  function getCatSort(name){
    for(let i=0;i<catOrder.length;i++){if(name.includes(catOrder[i]))return i;}
    return 99;
  }

  // Ordem modalidades: SM antes SF, DM antes DF antes DX
  const modOrder={'SM':0,'SF':1,'DM':0,'DF':1,'DX':2};

  // Separar simples e duplas, ordenar por categoria crescente + modalidade
  const simples=draws.filter(d=>d.event==='SM'||d.event==='SF').sort((a,b)=>getCatSort(a.name)-getCatSort(b.name)||(modOrder[a.event]||0)-(modOrder[b.event]||0));
  const duplas=draws.filter(d=>d.event==='DM'||d.event==='DF'||d.event==='DX').sort((a,b)=>getCatSort(a.name)-getCatSort(b.name)||(modOrder[a.event]||0)-(modOrder[b.event]||0));

  function renderSection(drawList){
    let h='',count=0;
    drawList.forEach(d=>{
      const classification=computeFullClassification(d);
      if(!classification.length)return;
      count++;
      h+=`<div class="cat-title">${esc(d.name)} <span style="font-size:11px;color:#666;font-weight:400">(${d.type} - ${d.players?.length||0} atletas)</span></div>`;
      h+='<table><thead><tr><th style="width:50px">Pos.</th><th>Jogador</th><th style="width:60px">V</th><th style="width:60px">D</th><th>Obs.</th></tr></thead><tbody>';
      classification.forEach(c=>{
        const posStyle=c.pos===1?'color:#D4AF37;font-weight:800':c.pos===2?'color:#AAA;font-weight:700':c.pos===3?'color:#CD7F32;font-weight:700':'';
        const medal=c.pos===1?'\uD83E\uDD47 ':c.pos===2?'\uD83E\uDD48 ':c.pos===3?'\uD83E\uDD49 ':'';
        h+=`<tr><td style="${posStyle}">${medal}${c.pos}o</td><td>${esc(c.name)}</td><td style="text-align:center">${c.wins!=null?c.wins:'-'}</td><td style="text-align:center">${c.losses!=null?c.losses:'-'}</td><td style="font-size:11px;color:#666">${esc(c.note||'')}</td></tr>`;
      });
      h+='</tbody></table>';
    });
    return{html:h,count};
  }

  let h='<h2 style="color:#1E3A8A;margin-bottom:16px">Classificacao Geral</h2>';

  // Simples
  if(simples.length){
    h+='<h3 style="color:#1E3A8A;margin:20px 0 12px;border-bottom:2px solid #1E3A8A;padding-bottom:6px">Classificacao Simples</h3>';
    const s=renderSection(simples);
    h+=s.html;
  }

  // Duplas
  if(duplas.length){
    h+='<h3 style="color:#1E3A8A;margin:30px 0 12px;border-bottom:2px solid #1E3A8A;padding-bottom:6px">Classificacao das Duplas</h3>';
    const d=renderSection(duplas);
    h+=d.html;
  }

  if(!simples.length&&!duplas.length)h+='<p>Nenhuma categoria com resultados.</p>';
  return h;
}

function reportPlayers(){
  if(!players.length)return'<p>Nenhum jogador cadastrado.</p>';
  let h='<h2 style="color:#1E3A8A;margin-bottom:12px">Lista de Jogadores</h2>';
  h+='<table><thead><tr><th>#</th><th>Nome</th><th>Genero</th><th>Data Nasc.</th><th>Categoria</th><th>Clube</th><th>Estado</th><th>Inscricoes</th></tr></thead><tbody>';
  players.forEach((p,i)=>{
    const cat=calculateCategory(p.dob);
    const inscs=(p.inscriptions||[]).map(x=>x.key).join(', ');
    h+=`<tr><td>${i+1}</td><td>${esc(p.firstName)} ${esc(p.lastName)}</td><td>${p.gender==='M'?'Masc':'Fem'}</td><td>${fmtDate(p.dob)}</td><td>${esc(cat)}</td><td>${esc(p.club||'-')}</td><td>${esc(p.state||'-')}</td><td style="font-size:11px">${esc(inscs)||'-'}</td></tr>`;
  });
  h+='</tbody></table>';
  return h;
}

// === RANKING / PREMIACAO ===
// Atualizar matches de eliminatoria na lista de partidas quando jogadores ficam disponiveis
function updateEliminationMatchesInList(){
  if(!tournament?.draws?.length||!tournament?.matches?.length)return;
  let changed=false;
  (tournament.draws||[]).forEach(d=>{
    if(d.type!=='Grupos + Eliminatoria'||!d.groupsData)return;
    const elimMatches=d.groupsData.eliminationMatches||[];
    if(!elimMatches.length)return;

    // Contar grupo matches pra calcular drawMatchIdx base
    let groupMatchCount=0;
    (d.groupsData.groups||[]).forEach(g=>{g.matches.forEach(m=>{if(m.player1&&m.player2&&m.player1!=='BYE'&&m.player2!=='BYE')groupMatchCount++;});});

    // Pra cada match de eliminatoria
    elimMatches.forEach((em,emIdx)=>{
      const expectedIdx=groupMatchCount+emIdx;
      // Encontrar o match na lista por drawMatchIdx exato
      const existing=tournament.matches.find(m=>
        m.drawName===d.name&&m.phase==='elimination'&&m.drawMatchIdx===expectedIdx
      );
      if(!existing)return;

      // Atualizar player1
      if(em.player1&&existing.player1!==em.player1){
        existing.player1=em.player1;
        existing.player1Display=em.player1;
        changed=true;
      }
      // Atualizar player2
      if(em.player2&&existing.player2!==em.player2){
        existing.player2=em.player2;
        existing.player2Display=em.player2;
        changed=true;
      }
      // Atualizar status
      if(existing.player1&&existing.player2&&existing.status==='A definir'){
        existing.isDefinida=true;
        existing.status='Pendente';
        changed=true;
      }
      // Propagar resultado se ja tem (semi finalizada)
      if(em.winner&&!existing.winner){
        existing.winner=em.winner;
        existing.score=em.score1&&em.score2?em.score1.split(' ').map((v,i)=>v+'-'+(em.score2.split(' ')[i]||0)).join(' / '):'';
        existing.status='Finalizada';
        changed=true;
      }
    });
  });
  return changed;
}

// Preparar rankings de todas as draws pra enviar ao Supabase
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
function filterTable(sId,tId){const q=(document.getElementById(sId)?.value||'').toLowerCase();document.querySelectorAll(`#${tId} tr`).forEach(r=>{r.style.display=r.textContent.toLowerCase().includes(q)?'':'none';});}
function esc(s){return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';}
