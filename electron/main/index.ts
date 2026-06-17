import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile, spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';

const SHUTDOWN_GRACE_MS = 3000;

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
  ipcMain.handle('open-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.filePaths[0];
  });
}

async function createWindow(): Promise<void> {
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
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
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
