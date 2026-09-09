const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3847;
let mainWindow = null;
let serverProcess = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setName('Plasma');

function getPlasmaDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function getProjectRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..');
}

function startServer() {
  const root = getProjectRoot();
  const dataDir = getPlasmaDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    PLASMA_DATA_DIR: dataDir,
    PORT: String(PORT),
    PLASMA_HOST: '127.0.0.1',
    ELECTRON_RUN_AS_NODE: '1',
  };

  const serverEntry = path.join(root, 'server', 'index.js');
  serverProcess = spawn(process.execPath, [serverEntry], {
    env,
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[plasma-server] ${chunk}`);
  });
  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[plasma-server] ${chunk}`);
  });
  serverProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[plasma-server] exited (code=${code}, signal=${signal})`);
    }
    serverProcess = null;
  });

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
  if (!serverProcess) return;
  serverProcess.kill('SIGTERM');
  serverProcess = null;
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
