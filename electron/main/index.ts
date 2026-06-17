import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile, spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';

const SHUTDOWN_GRACE_MS = 3000;

// DESKTOP-MODIFIED: Vite's dev server defaults to 5173 and frequently
// collides with other dev servers. Vite is configured with 5273 as the
// primary port (strictPort:false auto-increments on conflict) and writes
// the actual bound port to frontend/.dev-server-port. We read that file
// here to construct the dev URL dynamically.
const DEV_PORT_FALLBACK = 5273;
const DEV_PORT_FILE = 'frontend/.dev-server-port';

const isDev = !app.isPackaged;
let backendProcess: ChildProcess | null = null;
let backendUrl = '';
let backendStarting = false;

function getUserDataDir(): string {
  return app.getPath('userData');
}

function getDataDir(): string {
  return path.join(getUserDataDir(), 'data');
}

function getProjectRoot(): string {
  if (isDev) {
    return process.cwd();
  }
  return process.resourcesPath;
}

function getDevServerPort(): number {
  const portFile = path.join(getProjectRoot(), DEV_PORT_FILE);
  try {
    const raw = fs.readFileSync(portFile, 'utf8').trim();
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
    console.warn(`[electron] invalid dev server port in ${portFile}: ${raw}`);
  } catch {
    // File may not exist yet (Vite not started, or production build).
    // Fall through to the default — Electron's loadURL will then surface
    // a clear "site can't be reached" error if Vite really isn't running.
  }
  return DEV_PORT_FALLBACK;
}

function getPythonCommand(projectRoot: string): string {
  const candidates = [
    path.join(projectRoot, '.venv', 'bin', 'python'),
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Unable to determine free port'));
      }
    });
    server.on('error', reject);
  });
}

async function waitForBackend(healthUrl: string, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Backend not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Backend health check timed out: ${healthUrl}`);
}

async function startBackend(): Promise<string> {
  if (backendProcess && !backendProcess.killed) {
    return backendUrl;
  }
  if (backendStarting) {
    return await waitForBackendReady();
  }
  backendStarting = true;

  try {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });

    const port = await getFreePort();
    backendUrl = `http://127.0.0.1:${port}/api`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TISSUE_DESKTOP: '1',
      TISSUE_DESKTOP_DATA_DIR: dataDir,
      TISSUE_DESKTOP_PORT: String(port),
    };

    let command: string;
    let args: string[];
    let options: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'pipe' };

    if (isDev) {
      const projectRoot = getProjectRoot();
      command = getPythonCommand(projectRoot);
      args = [
        '-m', 'uvicorn', 'app.desktop_main:app',
        '--host', '127.0.0.1', '--port', String(port), '--log-level', 'info',
      ];
      env.PYTHONPATH = projectRoot;
      options = { cwd: projectRoot, env, stdio: 'pipe' };
    } else {
      const exeName = process.platform === 'win32' ? 'tissue-backend.exe' : 'tissue-backend';
      command = path.join(process.resourcesPath, 'backend', exeName);
      args = [];
      options = { cwd: process.resourcesPath, env, stdio: 'pipe' };
    }

    backendProcess = spawn(command, args, options);

    backendProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });
    backendProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[backend] ${data.toString().trim()}`);
    });
    backendProcess.on('error', (error) => {
      console.error('[backend] Failed to start backend:', error);
    });
    backendProcess.on('exit', (code, signal) => {
      console.log(`[backend] Process exited with code ${code} and signal ${signal}`);
      backendProcess = null;
    });

    const healthUrl = `${backendUrl}/common/health`;
    await waitForBackend(healthUrl);
    return backendUrl;
  } finally {
    backendStarting = false;
  }
}

async function waitForBackendReady(): Promise<string> {
  // Re-read backendUrl inside the loop: startBackend() sets
  // `backendStarting = true` *before* it assigns the new backendUrl, so a
  // concurrent caller entering this function would otherwise poll a stale or
  // empty URL until `backendStarting` flips back to false.
  while (backendStarting) {
    const currentUrl = backendUrl;
    if (currentUrl) {
      try {
        const response = await fetch(`${currentUrl}/common/health`);
        if (response.ok) {
          return currentUrl;
        }
      } catch {
        // Still starting.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return backendUrl;
}

function stopBackend(): void {
  if (!backendProcess || backendProcess.killed) {
    return;
  }
  const pid = backendProcess.pid;
  if (!pid) {
    return;
  }

  // Try a graceful shutdown first; on Windows, Node maps SIGTERM to a
  // TerminateProcess call so the backend never gets to run its atexit hooks.
  // Give it SHUTDOWN_GRACE_MS, then force-kill the process tree.
  try {
    backendProcess.kill('SIGTERM');
  } catch (error) {
    console.error('[backend] Failed to send SIGTERM:', error);
  }

  const forceKillTimeout = setTimeout(() => {
    if (!backendProcess || backendProcess.killed) {
      return;
    }
    if (process.platform === 'win32') {
      // taskkill /T walks the process tree so we also nuke any workers
      // Uvicorn may have spawned.
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], (error) => {
        if (error) {
          console.error('[backend] taskkill failed:', error);
        }
      });
    } else {
      try {
        backendProcess.kill('SIGKILL');
      } catch (error) {
        console.error('[backend] Failed to send SIGKILL:', error);
      }
    }
  }, SHUTDOWN_GRACE_MS);

  backendProcess.once('exit', () => clearTimeout(forceKillTimeout));
}

function registerIpcHandlers(): void {
  ipcMain.on('get-backend-url-sync', (event) => {
    event.returnValue = backendUrl;
  });
  ipcMain.handle('get-backend-url', () => backendUrl);
  ipcMain.handle('get-user-data-path', () => getUserDataDir());
  ipcMain.handle('open-directory', async (event) => {
    // Anchor the dialog to the requesting window on macOS so it sheets
    // correctly instead of floating detached. `dialog.showOpenDialog` has
    // two overloads (with/without BrowserWindow) and rejects undefined,
    // so we branch on the resolved owner.
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      properties: ['openDirectory'] as Array<'openDirectory'>,
      defaultPath: app.getPath('downloads'),
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    return result.filePaths[0];
  });
}

async function createWindow(): Promise<void> {
  const devServerUrl = isDev ? `http://localhost:${getDevServerPort()}` : '';

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // shell.openExternal returns a Promise; swallow rejection (e.g. no
    // default app for the scheme) so we don't trigger unhandled-rejection
    // warnings.
    shell.openExternal(url).catch((error) => {
      console.error(`[shell] failed to open external URL ${url}:`, error);
    });
    return { action: 'deny' };
  });

  // setWindowOpenHandler only intercepts window.open; the renderer can still
  // trigger top-level navigation via window.location or <a href>. Whitelist
  // the dev server / file:// origin and forward everything else to the OS
  // browser so a compromised renderer can't drag the user to a phishing page.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = isDev ? devServerUrl : 'file://';
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
      shell.openExternal(url).catch((error) => {
        console.error(`[shell] failed to open external URL ${url}:`, error);
      });
    }
  });

  // log render-process load failures (dev server down, missing dist, CSP
  // violation, etc.) so they don't manifest as a silent blank window.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  if (isDev) {
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }

  mainWindow.show();
}

app.whenReady().then(async () => {
  await startBackend();
  registerIpcHandlers();
  await createWindow();
}).catch((error) => {
  console.error('Failed to start Tissue Desktop:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error('Failed to recreate window:', error);
    });
  }
});

app.on('quit', () => {
  stopBackend();
});
