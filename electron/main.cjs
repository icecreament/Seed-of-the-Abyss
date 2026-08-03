const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    // width/height describe the game content area, not the OS frame.
    useContentSize: true,
    backgroundColor: '#07060d',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // No default Electron menu for a game shell.
  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // F11 / Alt+Enter toggle fullscreen (common PC game behavior).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // Report every transition so the renderer can persist the state.
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('seed:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('seed:fullscreen-changed', false);
  });

  // Debounced: report content size (dragged resizes too) for persistence.
  let resizeTimer = null;
  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isFullScreen()) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isFullScreen()) return;
      const [w, h] = mainWindow.getContentSize();
      mainWindow.webContents.send('seed:window-size-changed', w, h);
    }, 400);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('seed:set-fullscreen', (_e, flag) => {
  mainWindow?.setFullScreen(Boolean(flag));
});

ipcMain.handle('seed:is-fullscreen', () => mainWindow?.isFullScreen() ?? false);

ipcMain.handle('seed:set-window-size', (_e, w, h) => {
  if (!mainWindow) return;
  const width = Math.max(960, Math.floor(Number(w)) || 1280);
  const height = Math.max(540, Math.floor(Number(h)) || 720);
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  mainWindow.setContentSize(width, height);
  mainWindow.center();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
