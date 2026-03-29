const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// === SUPABASE ===
const SUPABASE_URL = 'https://zwjgjtrmsqtyyjtuotuo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3amdqdHJtc3F0eXlqdHVvdHVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NTYyNjIsImV4cCI6MjA5MDMzMjI2Mn0.c6kE4RMlUOr6-FNCY2X5aeedyEvcmVTUxNVn-kvjYWY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let realtimeChannel = null;

// === PATHS ===
const DB_PATH = path.join(app.getPath('userData'), 'fabd-data.json');
const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const LOG_PATH = path.join(app.getPath('userData'), 'fabd.log');

// === LOGGING ===
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
  console[level === 'ERROR' ? 'error' : 'log'](msg);
  try {
    fs.appendFileSync(LOG_PATH, msg + '\n');
    const stat = fs.statSync(LOG_PATH);
    if (stat.size > 5 * 1024 * 1024) {
      const content = fs.readFileSync(LOG_PATH, 'utf-8');
      fs.writeFileSync(LOG_PATH, content.slice(-1024 * 1024), 'utf-8');
    }
  } catch (e) { /* ok */ }
}

// === BACKUP ===
function createBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `fabd-data-${timestamp}.json`));
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('fabd-data-')).sort().reverse();
    backups.slice(20).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch(e){} });
  } catch (e) { log('ERROR', 'Backup erro:', e.message); }
}

// === DATABASE ===
// Estrutura: { tournament: {..., players: [...], ...}, settings: {...} }
// Agora so 1 torneio por vez, jogadores dentro do torneio
function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      if (!data.settings) data.settings = {};
      if (!data.settings.gameProfiles) data.settings.gameProfiles = null;
      if (!data.settings.umpires) data.settings.umpires = null;
      if (!data.tournament) data.tournament = null;
      log('INFO', 'Banco carregado');
      return data;
    }
  } catch (e) {
    log('ERROR', 'Erro ao carregar:', e.message);
    try {
      if (fs.existsSync(BACKUP_DIR)) {
        const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
        if (backups.length) return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, backups[0]), 'utf-8'));
      }
    } catch(e2) {}
  }
  return { tournament: null, settings: {} };
}

let saveTimeout = null;
function saveDatabase(data) {
  if (saveTimeout) clearTimeout(saveTimeout);
  createBackup();
  saveTimeout = setTimeout(() => {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8'); } catch(e) { log('ERROR', 'Erro salvar:', e.message); }
  }, 300);
}

function saveDatabaseSync(data) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8'); } catch(e) {}
}

let mainWindow;
let db = loadDatabase();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    title: 'FABD - Planejador de Torneios',
    icon: path.join(__dirname, 'assets', 'logo-fabd.jpg'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  // Alerta ao fechar com torneio aberto
  mainWindow.on('close', (e) => {
    if (db.tournament) {
      const { dialog: dlg } = require('electron');
      const choice = dlg.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Exportar Backup e Sair', 'Sair sem Backup', 'Cancelar'],
        defaultId: 2,
        cancelId: 2,
        title: 'Torneio Aberto',
        message: 'Voce tem um torneio aberto. Deseja exportar um backup antes de sair?'
      });
      if (choice === 2) { e.preventDefault(); return; }
      if (choice === 0) {
        // Exportar backup automatico
        try {
          const backupPath = path.join(app.getPath('desktop'), `backup-${db.tournament.name || 'torneio'}-${new Date().toISOString().slice(0,10)}.fabd`);
          fs.writeFileSync(backupPath, JSON.stringify({ _type: 'fabd-tournament-backup', tournament: db.tournament }, null, 2), 'utf-8');
          log('INFO', 'Backup exportado ao fechar:', backupPath);
        } catch(err) { log('ERROR', 'Erro backup ao fechar:', err.message); }
      }
      // Limpar Supabase ao fechar
      try {
        const tid = db.tournament.id;
        supabase.from('live_scores').delete().eq('tournament_id', tid).then(()=>{});
        supabase.from('live_matches').delete().eq('tournament_id', tid).then(()=>{});
        supabase.from('tournaments').delete().eq('id', tid).then(()=>{});
        log('INFO', 'Supabase cleanup ao fechar app');
      } catch(err) { log('ERROR', 'Erro cleanup Supabase:', err.message); }
      // Limpar torneio local
      db.tournament = null;
      saveDatabaseSync(db);
    }
  });

  log('INFO', 'App iniciado');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if(saveTimeout)clearTimeout(saveTimeout); saveDatabaseSync(db); if(process.platform!=='darwin')app.quit(); });
app.on('activate', () => { if(!BrowserWindow.getAllWindows().length) createWindow(); });
process.on('uncaughtException', (e) => { log('ERROR', 'Uncaught:', e.message); });
process.on('unhandledRejection', (e) => { log('ERROR', 'Unhandled:', String(e)); });

// === IPC: TORNEIO (só 1 por vez) ===
ipcMain.handle('db:getTournament', () => db.tournament);

ipcMain.handle('db:saveTournament', (_, tournament) => {
  db.tournament = tournament;
  saveDatabase(db);
  return tournament;
});

ipcMain.handle('db:newTournament', (_, tournament) => {
  tournament.id = Date.now().toString();
  tournament.createdAt = new Date().toISOString();
  tournament.players = [];
  tournament.entries = [];
  tournament.draws = [];
  tournament.matches = [];
  db.tournament = tournament;
  saveDatabase(db);
  return tournament;
});

ipcMain.handle('db:closeTournament', async () => {
  // Limpar dados do Supabase antes de fechar
  if (db.tournament?.id) {
    try {
      const tid = db.tournament.id;
      await supabase.from('live_scores').delete().eq('tournament_id', tid);
      await supabase.from('live_matches').delete().eq('tournament_id', tid);
      await supabase.from('tournaments').delete().eq('id', tid);
      log('INFO', 'Supabase cleanup ao fechar torneio', tid);
    } catch (e) { log('ERROR', 'Erro cleanup Supabase:', e.message); }
  }
  db.tournament = null;
  saveDatabase(db);
  return true;
});

// === IPC: JOGADORES (dentro do torneio) ===
ipcMain.handle('db:getPlayers', () => {
  return db.tournament?.players || [];
});

ipcMain.handle('db:savePlayer', (_, player) => {
  if (!db.tournament) return null;
  if (!db.tournament.players) db.tournament.players = [];
  const idx = db.tournament.players.findIndex(p => p.id === player.id);
  if (idx >= 0) { db.tournament.players[idx] = player; }
  else { player.id = Date.now().toString() + Math.random().toString(36).slice(2,6); db.tournament.players.push(player); }
  saveDatabase(db);
  return player;
});

ipcMain.handle('db:deletePlayer', (_, id) => {
  if (!db.tournament) return;
  db.tournament.players = (db.tournament.players||[]).filter(p => p.id !== id);
  saveDatabase(db);
  return true;
});

// === IPC: ARQUIVOS ===
ipcMain.handle('dialog:selectFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar arquivo',
    filters: filters || [{ name: 'CSV', extensions: ['csv'] }, { name: 'Todos', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('file:read', async (_, filePath) => {
  const allowed = ['.csv', '.txt', '.json', '.fabd'];
  if (!allowed.includes(path.extname(filePath).toLowerCase())) throw new Error('Tipo nao permitido');
  const stat = fs.statSync(filePath);
  if (stat.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande');
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('dialog:saveFile', async (_, filters, content) => {
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Salvar', filters: filters || [{ name: 'CSV', extensions: ['csv'] }] });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return true;
});

// === IPC: BACKUP DO TORNEIO ===
ipcMain.handle('db:exportTournament', async () => {
  if (!db.tournament) throw new Error('Nenhum torneio ativo');
  const backupData = { _type: 'fabd-tournament-backup', _version: '3.0', _exportedAt: new Date().toISOString(), tournament: db.tournament };
  const safeName = (db.tournament.name||'torneio').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar Backup do Torneio',
    defaultPath: `${safeName}_${new Date().toISOString().slice(0,10)}.fabd`,
    filters: [{ name: 'Backup FABD', extensions: ['fabd'] }, { name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify(backupData, null, 2), 'utf-8');
  log('INFO', 'Backup exportado:', result.filePath);
  return true;
});

ipcMain.handle('db:importTournament', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir Backup',
    filters: [{ name: 'Backup FABD', extensions: ['fabd', 'json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    if (!data.tournament && !data._type) throw new Error('Arquivo invalido');
    createBackup();
    const tournament = data.tournament || data;
    if (!tournament.players) tournament.players = [];
    db.tournament = tournament;
    saveDatabaseSync(db);
    log('INFO', 'Backup importado:', tournament.name);
    return { name: tournament.name };
  } catch(e) { throw new Error('Erro: ' + e.message); }
});

// === IPC: BACKUP COMPLETO (todo o banco) ===
ipcMain.handle('db:exportFullBackup', async (_, localData) => {
  const backupData = { _type: 'fabd-full-backup', _version: '3.0', _exportedAt: new Date().toISOString(), ...db, umpires: localData?.umpires || [], gameProfiles: localData?.gameProfiles || [] };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar Backup Completo',
    defaultPath: `fabd-backup-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify(backupData, null, 2), 'utf-8');
  log('INFO', 'Backup completo exportado:', result.filePath);
  return true;
});

ipcMain.handle('db:importFullBackup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar Backup Completo',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    createBackup();
    // Aceitar tanto backup completo quanto backup de torneio
    const importResult = { umpires: null, gameProfiles: null };
    if (data._type === 'fabd-full-backup') {
      db.tournament = data.tournament || null;
      db.settings = data.settings || {};
      if (data.umpires) importResult.umpires = data.umpires;
      if (data.gameProfiles) importResult.gameProfiles = data.gameProfiles;
    } else if (data._type === 'fabd-tournament-backup') {
      db.tournament = data.tournament || null;
    } else if (data.tournament) {
      db.tournament = data.tournament;
      if (data.settings) db.settings = data.settings;
    } else {
      throw new Error('Formato de backup nao reconhecido');
    }
    saveDatabaseSync(db);
    log('INFO', 'Backup completo importado');
    return importResult;
  } catch(e) { throw new Error('Erro: ' + e.message); }
});

ipcMain.handle('db:getSettings', () => db.settings);
ipcMain.handle('db:saveSettings', (_, settings) => { db.settings = settings; saveDatabase(db); return settings; });
ipcMain.on('log', (_, level, msg) => { log(level, '[renderer]', msg); });

// === IPC: SUPABASE REALTIME ===
ipcMain.handle('supabase:upsertTournament', async (_, tournamentId, name) => {
  try {
    const { error } = await supabase.from('tournaments').upsert({ id: tournamentId, name, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch(e) { log('ERROR', 'Supabase upsertTournament:', e.message); return false; }
});

// Gerar ID estavel para match (nao depende de numeracao)
function stableMatchId(tournamentId, matchData) {
  const draw = (matchData.drawName || '').replace(/[^a-zA-Z0-9]/g, '');
  const p1 = (matchData.player1 || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  const p2 = (matchData.player2 || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  return `${tournamentId}_${draw}_${p1}_${p2}`;
}

ipcMain.handle('supabase:upsertMatch', async (_, tournamentId, matchData) => {
  try {
    const id = stableMatchId(tournamentId, matchData);
    const row = {
      id, tournament_id: tournamentId, match_num: matchData.num,
      draw_name: matchData.drawName || '', round: matchData.round || 1,
      round_name: matchData.roundName || '', player1: matchData.player1 || '',
      player2: matchData.player2 || '', court: matchData.court || '',
      umpire: matchData.umpire || '', status: matchData.status || 'Em Quadra',
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('live_matches').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const { error: scoreError } = await supabase.from('live_scores').upsert({ match_id: id, tournament_id: tournamentId }, { onConflict: 'match_id' });
    if (scoreError) { log('ERROR', 'Supabase score upsert:', scoreError.message); return false; }
    log('INFO', 'Supabase match upserted:', id);
    return true;
  } catch(e) { log('ERROR', 'Supabase upsertMatch:', e.message); return false; }
});

ipcMain.handle('supabase:removeFromCourt', async (_, tournamentId, matchData) => {
  try {
    const id = typeof matchData === 'object' ? stableMatchId(tournamentId, matchData) : `${tournamentId}_${matchData}`;
    await supabase.from('live_scores').delete().eq('match_id', id);
    await supabase.from('live_matches').delete().eq('id', id);
    log('INFO', 'Supabase match removed:', id);
    return true;
  } catch(e) { log('ERROR', 'Supabase removeFromCourt:', e.message); return false; }
});

let pollingInterval = null;
let lastPollData = {};
let realtimeRetryInterval = null;

ipcMain.handle('supabase:subscribe', async (_, tournamentId) => {
  try {
    // Parar polling e retry anteriores
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    if (realtimeRetryInterval) { clearInterval(realtimeRetryInterval); realtimeRetryInterval = null; }
    lastPollData = {};

    // Tentar Realtime primeiro
    if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
    realtimeChannel = supabase.channel(`scores_${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_scores', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          log('INFO', 'Realtime score update:', JSON.stringify(payload.new?.match_id));
          if (mainWindow && !mainWindow.isDestroyed() && payload && payload.new) {
            mainWindow.webContents.send('supabase:scoreUpdate', payload.new);
          }
        })
      .subscribe((status) => {
        log('INFO', 'Realtime status:', status);
        if (status === 'SUBSCRIBED') {
          // Realtime funcionou, parar polling se estiver rodando
          if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; log('INFO', 'Polling parado (Realtime ativo)'); }
        }
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          // Fallback: usar polling a cada 3 segundos
          if (!pollingInterval) {
            log('INFO', 'Realtime indisponivel, usando polling (3s)');
            pollingInterval = setInterval(async () => {
              try {
                const { data } = await supabase.from('live_scores').select('*').eq('tournament_id', tournamentId);
                if (data) {
                  data.forEach(row => {
                    const key = row.match_id;
                    const prev = lastPollData[key];
                    if (!prev || prev.updated_at !== row.updated_at || prev.score_p1 !== row.score_p1 || prev.score_p2 !== row.score_p2 || prev.winner !== row.winner) {
                      lastPollData[key] = row;
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('supabase:scoreUpdate', row);
                      }
                    }
                  });
                }
              } catch(e) { /* silencioso */ }
            }, 3000);
          }
          // Tentar reconectar realtime a cada 30s
          if (!realtimeRetryInterval) {
            realtimeRetryInterval = setInterval(() => {
              log('INFO', 'Tentando reconectar Realtime...');
              if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
              realtimeChannel = supabase.channel(`scores_retry_${tournamentId}_${Date.now()}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'live_scores', filter: `tournament_id=eq.${tournamentId}` },
                  (payload) => {
                    log('INFO', 'Realtime score update:', JSON.stringify(payload.new?.match_id));
                    if (mainWindow && !mainWindow.isDestroyed() && payload && payload.new) {
                      mainWindow.webContents.send('supabase:scoreUpdate', payload.new);
                    }
                  })
                .subscribe((retryStatus) => {
                  log('INFO', 'Realtime retry status:', retryStatus);
                  if (retryStatus === 'SUBSCRIBED') {
                    log('INFO', 'Realtime reconectado! Parando polling.');
                    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
                    if (realtimeRetryInterval) { clearInterval(realtimeRetryInterval); realtimeRetryInterval = null; }
                  }
                });
            }, 30000);
          }
        }
      });
    return true;
  } catch(e) { log('ERROR', 'Supabase subscribe:', e.message); return false; }
});

ipcMain.handle('supabase:unsubscribe', async () => {
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  if (realtimeRetryInterval) { clearInterval(realtimeRetryInterval); realtimeRetryInterval = null; }
  return true;
});

ipcMain.handle('supabase:getReferees', async () => {
  try {
    const { data, error } = await supabase.from('referees').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch(e) { log('ERROR', 'getReferees:', e.message); return []; }
});

ipcMain.handle('supabase:updateRefereeStatus', async (_, id, status) => {
  try {
    const { error } = await supabase.from('referees').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return true;
  } catch(e) { log('ERROR', 'updateRefereeStatus:', e.message); return false; }
});

ipcMain.handle('supabase:getRefereeByName', async (_, id) => {
  try {
    const { data } = await supabase.from('referees').select('name').eq('id', id).single();
    return data?.name || null;
  } catch(e) { return null; }
});
