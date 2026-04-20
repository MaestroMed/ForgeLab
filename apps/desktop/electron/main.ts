import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let engineProcess: ChildProcess | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const ENGINE_PORT = 8420;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    // Fully custom titlebar rendered in React (see src/components/layout/TitleBar.tsx).
    // We deliberately do NOT set titleBarOverlay because that would draw the native
    // Windows window controls over our custom buttons.
    backgroundColor: '#0A0A0F',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Fullscreen change events - notify renderer
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', false);
  });

  // Maximize state change events - notify renderer so titlebar icon stays in sync
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('maximize-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('maximize-changed', false);
  });
}

async function checkEngineHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`http://localhost:${ENGINE_PORT}/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function startEngine() {
  // Check if engine is already running (try multiple times)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await checkEngineHealth()) {
      console.log('Engine already running on port', ENGINE_PORT);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Starting FORGE Engine...');

  const enginePath = isDev
    ? path.join(__dirname, '../../forge-engine')
    : path.join(process.resourcesPath, 'forge-engine');

  // Python path - use bundled Python in production, venv in dev
  let pythonPath: string;
  let enhancedPath = process.env.PATH || '';
  
  if (isDev) {
    // Development: use venv
    pythonPath = process.platform === 'win32'
      ? path.join(enginePath, '.venv', 'Scripts', 'python.exe')
      : path.join(enginePath, '.venv', 'bin', 'python3');
    
    // Add CUDA/cuDNN DLLs for Whisper GPU acceleration
    const venvPath = path.join(enginePath, '.venv');
    const cudnnBin = path.join(venvPath, 'Lib', 'site-packages', 'nvidia', 'cudnn', 'bin');
    const cublasBin = path.join(venvPath, 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin');
    enhancedPath = `${cudnnBin};${cublasBin};${enhancedPath}`;
  } else {
    // Production: use bundled Python + FFmpeg
    const isWin = process.platform === 'win32';
    const pythonExe = isWin ? 'python.exe' : 'python3';
    const pathSep = isWin ? ';' : ':';
    const bundledPython = path.join(process.resourcesPath, 'python', pythonExe);
    const bundledFFmpeg = path.join(process.resourcesPath, 'ffmpeg');
    pythonPath = bundledPython;

    // Add bundled FFmpeg and Python to PATH
    enhancedPath = `${bundledFFmpeg}${pathSep}${path.dirname(bundledPython)}${pathSep}${enhancedPath}`;

    // Add CUDA DLLs from bundled Python (Windows only)
    if (isWin) {
      const cudnnBin = path.join(process.resourcesPath, 'python', 'Lib', 'site-packages', 'nvidia', 'cudnn', 'bin');
      const cublasBin = path.join(process.resourcesPath, 'python', 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin');
      enhancedPath = `${cudnnBin};${cublasBin};${enhancedPath}`;
    }
  }

  // Set PYTHONPATH correctly for the module structure
  const pythonSrcPath = path.join(enginePath, 'src');
  
  console.log('Engine config:', {
    pythonPath,
    enginePath,
    pythonSrcPath,
    cwd: enginePath,
  });

  engineProcess = spawn(pythonPath, ['-m', 'uvicorn', 'forge_engine.main:app', '--host', '0.0.0.0', '--port', ENGINE_PORT.toString()], {
    cwd: pythonSrcPath,  // Run from src directory
    env: {
      ...process.env,
      PYTHONPATH: pythonSrcPath,
      PATH: enhancedPath,
    },
  });

  engineProcess.stdout?.on('data', (data) => {
    console.log(`[Engine] ${data}`);
  });

  engineProcess.stderr?.on('data', (data) => {
    console.error(`[Engine] ${data}`);
  });

  engineProcess.on('error', (error) => {
    console.error('Failed to start engine:', error);
  });

  // Wait for engine to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const response = await fetch(`http://localhost:${ENGINE_PORT}/health`);
      if (response.ok) {
        console.log('Engine started successfully');
        return true;
      }
    } catch {
      // Keep waiting
    }
  }

  console.error('Engine failed to start within timeout');
  return false;
}

function stopEngine() {
  if (engineProcess) {
    console.log('Stopping FORGE Engine...');
    engineProcess.kill();
    engineProcess = null;
  }
}

// IPC Handlers
ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:get-library-path', () => {
  return path.join(app.getPath('home'), 'FORGE_LIBRARY');
});

ipcMain.handle('file:open', async () => {
  if (!mainWindow) return null;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('file:select-directory', async () => {
  if (!mainWindow) return null;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('shell:open-path', async (_, path: string) => {
  return shell.openPath(path);
});

ipcMain.handle('shell:show-item', async (_, path: string) => {
  shell.showItemInFolder(path);
});

ipcMain.handle('engine:status', async () => {
  try {
    const response = await fetch(`http://localhost:${ENGINE_PORT}/health`);
    if (response.ok) {
      return { running: true, port: ENGINE_PORT };
    }
  } catch {
    // Engine not running
  }
  return { running: false, port: ENGINE_PORT };
});

ipcMain.handle('engine:start', async () => {
  return startEngine();
});

ipcMain.handle('engine:stop', async () => {
  stopEngine();
  return true;
});

// Window controls
ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const isFullScreen = mainWindow.isFullScreen();
  mainWindow.setFullScreen(!isFullScreen);
  return !isFullScreen;
});

ipcMain.handle('window:is-fullscreen', () => {
  return mainWindow?.isFullScreen() || false;
});

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:getState', () => {
  return mainWindow?.isMaximized() || false;
});

// App lifecycle
app.whenReady().then(async () => {
  await startEngine();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopEngine();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopEngine();
});


