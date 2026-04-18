var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
var mainWindow = null;
var engineProcess = null;
var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
var ENGINE_PORT = 8420;
function createWindow() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            mainWindow = new BrowserWindow({
                width: 1400,
                height: 900,
                minWidth: 1200,
                minHeight: 700,
                frame: false,
                titleBarStyle: 'hidden',
                titleBarOverlay: {
                    color: '#FAFAF8',
                    symbolColor: '#1A1A1A',
                    height: 40,
                },
                backgroundColor: '#FAFAF8',
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
            }
            else {
                mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
            }
            mainWindow.on('closed', function () {
                mainWindow = null;
            });
            // Fullscreen change events - notify renderer
            mainWindow.on('enter-full-screen', function () {
                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('fullscreen-changed', true);
            });
            mainWindow.on('leave-full-screen', function () {
                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('fullscreen-changed', false);
            });
            return [2 /*return*/];
        });
    });
}
function checkEngineHealth() {
    return __awaiter(this, void 0, void 0, function () {
        var controller_1, timeout, response, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    controller_1 = new AbortController();
                    timeout = setTimeout(function () { return controller_1.abort(); }, 2000);
                    return [4 /*yield*/, fetch("http://localhost:".concat(ENGINE_PORT, "/health"), {
                            signal: controller_1.signal
                        })];
                case 1:
                    response = _b.sent();
                    clearTimeout(timeout);
                    return [2 /*return*/, response.ok];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function startEngine() {
    return __awaiter(this, void 0, void 0, function () {
        var attempt, enginePath, pythonPath, enhancedPath, venvPath, cudnnBin, cublasBin, bundledPython, bundledFFmpeg, cudnnBin, cublasBin, pythonSrcPath, i, response, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    attempt = 0;
                    _d.label = 1;
                case 1:
                    if (!(attempt < 3)) return [3 /*break*/, 5];
                    return [4 /*yield*/, checkEngineHealth()];
                case 2:
                    if (_d.sent()) {
                        console.log('Engine already running on port', ENGINE_PORT);
                        return [2 /*return*/, true];
                    }
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                case 3:
                    _d.sent();
                    _d.label = 4;
                case 4:
                    attempt++;
                    return [3 /*break*/, 1];
                case 5:
                    console.log('Starting FORGE Engine...');
                    enginePath = isDev
                        ? path.join(__dirname, '../../forge-engine')
                        : path.join(process.resourcesPath, 'forge-engine');
                    enhancedPath = process.env.PATH || '';
                    if (isDev) {
                        // Development: use venv
                        pythonPath = process.platform === 'win32'
                            ? path.join(enginePath, '.venv', 'Scripts', 'python.exe')
                            : path.join(enginePath, '.venv', 'bin', 'python3');
                        venvPath = path.join(enginePath, '.venv');
                        cudnnBin = path.join(venvPath, 'Lib', 'site-packages', 'nvidia', 'cudnn', 'bin');
                        cublasBin = path.join(venvPath, 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin');
                        enhancedPath = "".concat(cudnnBin, ";").concat(cublasBin, ";").concat(enhancedPath);
                    }
                    else {
                        bundledPython = path.join(process.resourcesPath, 'python', 'python.exe');
                        bundledFFmpeg = path.join(process.resourcesPath, 'ffmpeg');
                        pythonPath = bundledPython;
                        // Add bundled FFmpeg and Python to PATH
                        enhancedPath = "".concat(bundledFFmpeg, ";").concat(path.dirname(bundledPython), ";").concat(enhancedPath);
                        cudnnBin = path.join(process.resourcesPath, 'python', 'Lib', 'site-packages', 'nvidia', 'cudnn', 'bin');
                        cublasBin = path.join(process.resourcesPath, 'python', 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin');
                        enhancedPath = "".concat(cudnnBin, ";").concat(cublasBin, ";").concat(enhancedPath);
                    }
                    pythonSrcPath = path.join(enginePath, 'src');
                    console.log('Engine config:', {
                        pythonPath: pythonPath,
                        enginePath: enginePath,
                        pythonSrcPath: pythonSrcPath,
                        cwd: enginePath,
                    });
                    engineProcess = spawn(pythonPath, ['-m', 'uvicorn', 'forge_engine.main:app', '--host', '0.0.0.0', '--port', ENGINE_PORT.toString()], {
                        cwd: pythonSrcPath, // Run from src directory
                        env: __assign(__assign({}, process.env), { PYTHONPATH: pythonSrcPath, PATH: enhancedPath }),
                    });
                    (_b = engineProcess.stdout) === null || _b === void 0 ? void 0 : _b.on('data', function (data) {
                        console.log("[Engine] ".concat(data));
                    });
                    (_c = engineProcess.stderr) === null || _c === void 0 ? void 0 : _c.on('data', function (data) {
                        console.error("[Engine] ".concat(data));
                    });
                    engineProcess.on('error', function (error) {
                        console.error('Failed to start engine:', error);
                    });
                    i = 0;
                    _d.label = 6;
                case 6:
                    if (!(i < 30)) return [3 /*break*/, 12];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 7:
                    _d.sent();
                    _d.label = 8;
                case 8:
                    _d.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, fetch("http://localhost:".concat(ENGINE_PORT, "/health"))];
                case 9:
                    response = _d.sent();
                    if (response.ok) {
                        console.log('Engine started successfully');
                        return [2 /*return*/, true];
                    }
                    return [3 /*break*/, 11];
                case 10:
                    _a = _d.sent();
                    return [3 /*break*/, 11];
                case 11:
                    i++;
                    return [3 /*break*/, 6];
                case 12:
                    console.error('Engine failed to start within timeout');
                    return [2 /*return*/, false];
            }
        });
    });
}
function stopEngine() {
    if (engineProcess) {
        console.log('Stopping FORGE Engine...');
        engineProcess.kill();
        engineProcess = null;
    }
}
// IPC Handlers
ipcMain.handle('app:get-version', function () { return app.getVersion(); });
ipcMain.handle('app:get-library-path', function () {
    return path.join(app.getPath('home'), 'FORGE_LIBRARY');
});
ipcMain.handle('file:open', function () { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!mainWindow)
                    return [2 /*return*/, null];
                return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                        properties: ['openFile'],
                        filters: [
                            { name: 'Video Files', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm'] },
                            { name: 'All Files', extensions: ['*'] },
                        ],
                    })];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result.canceled ? null : result.filePaths[0]];
        }
    });
}); });
ipcMain.handle('file:select-directory', function () { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!mainWindow)
                    return [2 /*return*/, null];
                return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                        properties: ['openDirectory'],
                    })];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result.canceled ? null : result.filePaths[0]];
        }
    });
}); });
ipcMain.handle('shell:open-path', function (_, path) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, shell.openPath(path)];
    });
}); });
ipcMain.handle('shell:show-item', function (_, path) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        shell.showItemInFolder(path);
        return [2 /*return*/];
    });
}); });
ipcMain.handle('engine:status', function () { return __awaiter(void 0, void 0, void 0, function () {
    var response, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4 /*yield*/, fetch("http://localhost:".concat(ENGINE_PORT, "/health"))];
            case 1:
                response = _b.sent();
                if (response.ok) {
                    return [2 /*return*/, { running: true, port: ENGINE_PORT }];
                }
                return [3 /*break*/, 3];
            case 2:
                _a = _b.sent();
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/, { running: false, port: ENGINE_PORT }];
        }
    });
}); });
ipcMain.handle('engine:start', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, startEngine()];
    });
}); });
ipcMain.handle('engine:stop', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        stopEngine();
        return [2 /*return*/, true];
    });
}); });
// Window controls
ipcMain.handle('window:toggle-fullscreen', function () {
    if (!mainWindow)
        return false;
    var isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
    return !isFullScreen;
});
ipcMain.handle('window:is-fullscreen', function () {
    return (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isFullScreen()) || false;
});
ipcMain.handle('window:minimize', function () {
    mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.minimize();
});
ipcMain.handle('window:maximize', function () {
    if (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    }
    else {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.maximize();
    }
});
ipcMain.handle('window:close', function () {
    mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.close();
});
// App lifecycle
app.whenReady().then(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, startEngine()];
            case 1:
                _a.sent();
                return [4 /*yield*/, createWindow()];
            case 2:
                _a.sent();
                app.on('activate', function () {
                    if (BrowserWindow.getAllWindows().length === 0) {
                        createWindow();
                    }
                });
                return [2 /*return*/];
        }
    });
}); });
app.on('window-all-closed', function () {
    stopEngine();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', function () {
    stopEngine();
});
