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

  log: (l, m) => ipcRenderer.send('log', l, m),
});
