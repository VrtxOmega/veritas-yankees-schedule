const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: '#0A0A0A',
    titleBarStyle: 'hiddenInset',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'build', 'icon.ico'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ─── IPC Handlers ───────────────────────────────────────────────────────────

// Proxy MLB API calls from renderer through main process (avoids CORS issues)
ipcMain.handle('fetch-mlb', async (event, url) => {
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Veritas-Yankees-Schedule/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse MLB API response')); }
      });
    }).on('error', reject);
  });
});

// Generic text fetch (for news RSS/JSON, zip geocoding, etc.) with redirect support.
ipcMain.handle('fetch-text', async (event, url) => {
  const https = require('https');
  const http = require('http');
  const headers = { 'User-Agent': 'Veritas-Yankees-Schedule/1.0', 'Accept': '*/*' };
  const MAX_REDIRECTS = 5;

  function get(target, redirectsLeft) {
    return new Promise((resolve, reject) => {
      const lib = target.startsWith('https:') ? https : http;
      lib.get(target, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          const next = new URL(res.headers.location, target).toString();
          res.resume();
          return resolve(get(next, redirectsLeft - 1));
        }
        if (res.statusCode >= 400) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${target}`));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  return get(url, MAX_REDIRECTS);
});

// Open external URL (for tickets, etc.)
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
});

// Generate calendar .ics file
ipcMain.handle('download-ics', async (event, icsContent) => {
  const fs = require('fs');
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'yankees-game.ics',
    filters: [{ name: 'iCalendar', extensions: ['ics'] }]
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, icsContent);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});
