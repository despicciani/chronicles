const { app, BrowserWindow, shell } = require('electron');
const { spawn, exec } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const SERVER_PORT = 3001;
const ROOT_DIR = path.resolve(__dirname, '..');

let mainWindow = null;
let serverProc = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await checkServerReady();
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function startBackendServer() {
  const alreadyRunning = await checkServerReady();
  if (alreadyRunning) return;

  const tsxCli = path.join(ROOT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverEntry = path.join(ROOT_DIR, 'server', 'index.ts');

  serverProc = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: ROOT_DIR,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(SERVER_PORT) },
    windowsHide: true,
    stdio: 'ignore',
  });
}

function stopBackendServer() {
  if (!serverProc || !serverProc.pid) return;
  try {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${serverProc.pid} /T /F`);
    } else {
      serverProc.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
  serverProc = null;
}

async function createDesktopWindow() {
  await startBackendServer();
  await waitForServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: true,
    title: 'CHRONICLE — Mesa Virtual de RPG',
    backgroundColor: '#06070c',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  mainWindow.show();
  mainWindow.focus();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (gotLock) {
  app.whenReady().then(createDesktopWindow);

  app.on('window-all-closed', () => {
    stopBackendServer();
    app.quit();
  });

  app.on('before-quit', () => {
    stopBackendServer();
  });
}
