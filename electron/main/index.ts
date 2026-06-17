import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';

const isDev = !app.isPackaged;

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
  return path.join(process.resourcesPath, 'app');
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

async function waitForBackend(backendUrl: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${backendUrl}/common/health`;

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

let backendProcess: ChildProcess | null = null;
let backendUrl = '';

async function startBackend(): Promise<string> {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const projectRoot = getProjectRoot();
  const port = await getFreePort();
  const python = getPythonCommand(projectRoot);

  backendUrl = `http://127.0.0.1:${port}/api`;

  const env = {
    ...process.env,
    TISSUE_DESKTOP: '1',
    TISSUE_DESKTOP_DATA_DIR: dataDir,
    TISSUE_DESKTOP_PORT: String(port),
    PYTHONPATH: projectRoot,
  };

  backendProcess = spawn(
    python,
    ['-m', 'uvicorn', 'app.desktop_main:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'info'],
    {
      cwd: projectRoot,
      env,
      stdio: 'pipe',
    }
  );

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

  await waitForBackend(backendUrl);
  return backendUrl;
}

function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    if (process.platform === 'win32') {
      backendProcess.kill('SIGTERM');
    } else {
      backendProcess.kill('SIGTERM');
    }
  }
}

async function createWindow(): Promise<void> {
  await startBackend();

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

app.whenReady().then(createWindow).catch((error) => {
  console.error('Failed to start Tissue Desktop:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
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
