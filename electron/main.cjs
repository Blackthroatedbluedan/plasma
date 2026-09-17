const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT) || 3847;
let mainWindow = null;
/** @type {{ stop: () => Promise<void> } | null} */
let serverHandle = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setName('Plasma');

function getPlasmaDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

async function startServer() {
  const dataDir = getPlasmaDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  process.env.PLASMA_DATA_DIR = dataDir;
  process.env.PORT = String(PORT);
  process.env.PLASMA_HOST = '127.0.0.1';

  // Load the Express app in-process. Spawning process.execPath with
  // ELECTRON_RUN_AS_NODE fails on some packaged Windows installs (ENOENT on
  // Plasma.exe) and child_process.spawn cannot run scripts inside asar.
  const serverEntry = path.join(app.getAppPath(), 'server', 'index.js');
  const { startPlasmaServer } = await import(pathToFileURL(serverEntry).href);
  serverHandle = startPlasmaServer({ port: PORT, host: '127.0.0.1' });

  return waitForServer(PORT, 60_000);
}

function waitForServer(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/config`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else schedule();
      });
      req.on('error', schedule);
      req.setTimeout(1500, () => {
        req.destroy();
        schedule();
      });
    };
    const schedule = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Plasma server did not start on port ${port}`));
        return;
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Plasma',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopServer() {
  if (!serverHandle) return;
  serverHandle.stop().catch((err) => {
    console.error('[plasma-server] shutdown error:', err);
  });
  serverHandle = null;
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('Failed to start Plasma:', err);
    stopServer();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('before-quit', () => {
  stopServer();
});
