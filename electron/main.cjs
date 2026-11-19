const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn, exec } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const SERVER_PORT = 3001;
const ROOT_DIR = path.resolve(__dirname, '..');

let mainWindow = null;
let serverProc = null;

app.setName('Chronicles');

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
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(maxAttempts = 80) {
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

  if (app.isPackaged) {
    const serverBundle = path.join(process.resourcesPath, 'server', 'server.cjs');
    const distDir = path.join(process.resourcesPath, 'dist');
    const userDataDir = app.getPath('userData');
    const dataDir = path.join(userDataDir, 'data');
    const bundledCloudflared = path.join(process.resourcesPath, 'bin', 'cloudflared.exe');
    const cloudflaredPath = fs.existsSync(bundledCloudflared)
      ? bundledCloudflared
      : path.join(userDataDir, 'bin', 'cloudflared.exe');

    fs.mkdirSync(dataDir, { recursive: true });
    const logPath = path.join(userDataDir, 'chronicles-server.log');
    const logFd = fs.openSync(logPath, 'w');

    serverProc = spawn(process.execPath, [serverBundle], {
      cwd: userDataDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(SERVER_PORT),
        CHRONICLES_DATA_DIR: dataDir,
        CHRONICLES_DIST_DIR: distDir,
        CLOUDFLARED_BIN: cloudflaredPath,
      },
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
    });
    return;
  }

  // Development mode: prefer compiled bundle if available, fallback to tsx
  const compiledServer = path.join(ROOT_DIR, 'dist-server', 'server.cjs');
  if (fs.existsSync(compiledServer)) {
    serverProc = spawn(process.execPath, [compiledServer], {
      cwd: ROOT_DIR,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(SERVER_PORT) },
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }

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
  const ready = await waitForServer();

  if (!ready) {
    dialog.showErrorBox(
      'Chronicles — Erro ao iniciar servidor local',
      'Não foi possível iniciar o servidor interno na porta 3001. Verifique se nenhum firewall ou outro programa está bloqueando a porta 3001 e tente novamente.'
    );
    stopBackendServer();
    app.quit();
    return;
  }

  const iconCandidate = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(ROOT_DIR, 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: true,
    title: 'Chronicles — Mesa Virtual de RPG',
    backgroundColor: '#06070c',
    autoHideMenuBar: true,
    ...(fs.existsSync(iconCandidate) ? { icon: iconCandidate } : {}),
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
