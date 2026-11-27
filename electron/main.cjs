const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
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

function getServerHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/health`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ ok: true });
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(600, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function requestStaleServerShutdown() {
  return new Promise((resolve) => {
    const req = http.request(
      `http://127.0.0.1:${SERVER_PORT}/api/internal-shutdown`,
      { method: 'POST', timeout: 5000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForServer(maxAttempts = 80) {
  for (let i = 0; i < maxAttempts; i++) {
    const health = await getServerHealth();
    if (health && health.ok) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function waitForPortFree(maxAttempts = 25) {
  for (let i = 0; i < maxAttempts; i++) {
    const health = await getServerHealth();
    if (!health) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

async function startBackendServer() {
  const expectedDistDir = app.isPackaged
    ? path.resolve(process.resourcesPath, 'dist')
    : path.resolve(ROOT_DIR, 'dist');

  const existing = await getServerHealth();
  if (existing && existing.ok) {
    const existingDist = existing.distDir ? path.resolve(String(existing.distDir)) : '';
    const sameBuild =
      !app.isPackaged ||
      (existingDist && existingDist.toLowerCase() === expectedDistDir.toLowerCase());
    if (sameBuild) {
      return;
    }
    // Existing port 3001 belongs to an older portable build — replace it cleanly!
    const askedGraceful = await requestStaleServerShutdown();
    let freed = askedGraceful ? await waitForPortFree(20) : false;
    if (!freed && existing.pid && process.platform === 'win32') {
      try {
        spawnSync('taskkill', ['/pid', String(existing.pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 3000,
        });
      } catch {
        // ignore
      }
      freed = await waitForPortFree(15);
    }
    if (!freed) {
      dialog.showErrorBox(
        'Chronicles — Servidor anterior ainda ativo',
        'Uma instância anterior do Chronicles ainda está ativa na porta 3001 e não pôde ser encerrada automaticamente. Feche todas as janelas anteriores do Chronicles e tente novamente.'
      );
      return false;
    }
  }

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
    try {
      fs.closeSync(logFd);
    } catch {
      // ignore
    }
    return;
  }

  // Development mode: prefer live tsx server so stale dist-server/server.cjs never runs by accident
  const tsxCli = path.join(ROOT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverEntry = path.join(ROOT_DIR, 'server', 'index.ts');
  if (fs.existsSync(tsxCli) && fs.existsSync(serverEntry)) {
    serverProc = spawn(process.execPath, [tsxCli, serverEntry], {
      cwd: ROOT_DIR,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(SERVER_PORT) },
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }

  const compiledServer = path.join(ROOT_DIR, 'dist-server', 'server.cjs');
  if (fs.existsSync(compiledServer)) {
    serverProc = spawn(process.execPath, [compiledServer], {
      cwd: ROOT_DIR,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(SERVER_PORT) },
      windowsHide: true,
      stdio: 'ignore',
    });
  }
}

function stopBackendServer() {
  if (!serverProc || !serverProc.pid) return;
  const pid = serverProc.pid;
  serverProc = null;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 3000,
      });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // ignore
  }
}

async function createDesktopWindow() {
  const started = await startBackendServer();
  if (started === false) {
    app.quit();
    return;
  }
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
    backgroundColor: '#08090d',
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

let isQuittingCleanly = false;

async function gracefulQuit() {
  if (isQuittingCleanly) return;
  isQuittingCleanly = true;
  if (serverProc) {
    try {
      const ok = await requestStaleServerShutdown();
      if (ok) {
        // Give the server up to ~1.2s to flush and close cleanly before force-killing
        await waitForPortFree(10);
      }
    } catch {
      // ignore
    }
    stopBackendServer();
  }
  app.quit();
}

if (gotLock) {
  app.whenReady().then(createDesktopWindow);

  app.on('window-all-closed', () => {
    void gracefulQuit();
  });

  app.on('before-quit', (e) => {
    if (!isQuittingCleanly) {
      e.preventDefault();
      void gracefulQuit();
    }
  });
}
