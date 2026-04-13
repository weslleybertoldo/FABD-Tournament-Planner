const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Torneio (1 por vez)
  getTournament: () => ipcRenderer.invoke('db:getTournament'),
  saveTournament: (t) => ipcRenderer.invoke('db:saveTournament', t),
  newTournament: (t) => ipcRenderer.invoke('db:newTournament', t),
  closeTournament: () => ipcRenderer.invoke('db:closeTournament'),

  // Jogadores (dentro do torneio)
  getPlayers: () => ipcRenderer.invoke('db:getPlayers'),
  savePlayer: (p) => ipcRenderer.invoke('db:savePlayer', p),
  deletePlayer: (id) => ipcRenderer.invoke('db:deletePlayer', id),

  // Arquivos
  selectFile: (f) => ipcRenderer.invoke('dialog:selectFile', f),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  saveFile: (f, c) => ipcRenderer.invoke('dialog:saveFile', f, c),

  // Backup
  exportTournament: () => ipcRenderer.invoke('db:exportTournament'),
  importTournament: () => ipcRenderer.invoke('db:importTournament'),

  // Backup completo
  exportFullBackup: (localData) => ipcRenderer.invoke('db:exportFullBackup', localData),
  importFullBackup: () => ipcRenderer.invoke('db:importFullBackup'),

  // Settings
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (s) => ipcRenderer.invoke('db:saveSettings', s),

  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  log: (l, m) => ipcRenderer.send('log', l, m),

  // Excel (XLSX)
  xlsxExport: (data) => ipcRenderer.invoke('xlsx:export', data),
  xlsxImport: () => ipcRenderer.invoke('xlsx:import'),

  // Supabase Realtime
  supabaseUpsertTournament: (tid, name, tournamentData) => ipcRenderer.invoke('supabase:upsertTournament', tid, name, tournamentData),
  supabaseUpsertMatch: (tid, m) => ipcRenderer.invoke('supabase:upsertMatch', tid, m),
  supabaseRemoveFromCourt: (tid, matchData) => ipcRenderer.invoke('supabase:removeFromCourt', tid, matchData),
  supabaseCleanup: (tid) => ipcRenderer.invoke('supabase:cleanup', tid),
  supabaseIsOrganizer: () => ipcRenderer.invoke('supabase:isOrganizer'),

  // Auth (login OTP por email)
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSendOtp: (email) => ipcRenderer.invoke('auth:sendOtp', email),
  authVerifyOtp: (email, token) => ipcRenderer.invoke('auth:verifyOtp', email, token),
  authSignOut: () => ipcRenderer.invoke('auth:signOut'),

  // Federacoes / Organizadores (gerenciar acessos)
  federationsList: () => ipcRenderer.invoke('federations:list'),
  organizersList: (fid) => ipcRenderer.invoke('organizers:list', fid),
  organizersAdd: (payload) => ipcRenderer.invoke('organizers:add', payload),
  organizersUpdate: (email, patch) => ipcRenderer.invoke('organizers:update', email, patch),
  organizersRemove: (email) => ipcRenderer.invoke('organizers:remove', email),
  supabaseSubscribe: (tid) => ipcRenderer.invoke('supabase:subscribe', tid),
  supabaseUnsubscribe: () => ipcRenderer.invoke('supabase:unsubscribe'),
  onScoreUpdate: (cb) => { ipcRenderer.removeAllListeners('supabase:scoreUpdate'); ipcRenderer.on('supabase:scoreUpdate', (_, data) => cb(data)); },
  supabaseGetReferees: () => ipcRenderer.invoke('supabase:getReferees'),
  supabaseUpdateRefereeStatus: (id, status) => ipcRenderer.invoke('supabase:updateRefereeStatus', id, status),
  supabaseGetRefereeName: (id) => ipcRenderer.invoke('supabase:getRefereeByName', id),
});
