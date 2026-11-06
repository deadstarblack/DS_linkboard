const { app, BrowserWindow, shell, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable hardware acceleration to prevent GPU errors with the transparent window
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const DEFAULT_BOUNDS = { width: 1000, height: 700 };

// Data lives in %APPDATA%\DS Linkstack (same folder for dev runs and the built exe).
// The app used to be called LinkBoard; on first launch after the rename, copy the
// saved cards/settings from the old folder so nothing is lost. The old folder is
// left untouched as a backup and can be deleted once the new one is confirmed working.
const APP_NAME = 'DS Linkstack';
const OLD_APP_NAME = 'linkboard';
app.setName(APP_NAME);
const userDataDir = path.join(app.getPath('appData'), APP_NAME);
app.setPath('userData', userDataDir);
migrateOldUserData();

function migrateOldUserData() {
  try {
    const oldDir = path.join(app.getPath('appData'), OLD_APP_NAME);
    const newStorage = path.join(userDataDir, 'Local Storage');
    const oldStorage = path.join(oldDir, 'Local Storage');
    if (fs.existsSync(newStorage) || !fs.existsSync(oldStorage)) return;

    fs.mkdirSync(userDataDir, { recursive: true });
    fs.cpSync(oldStorage, newStorage, { recursive: true });
    for (const file of ['window-bounds.json']) {
      const src = path.join(oldDir, file);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(userDataDir, file));
    }
    console.log(`Migrated saved data from ${oldDir} to ${userDataDir}`);
  } catch (e) {
    console.error('Failed to migrate old user data:', e);
  }
}

// Keep a reference to the window object
let mainWindow;

// File to store window bounds
const boundsFile = path.join(app.getPath('userData'), 'window-bounds.json');

// Load saved window bounds, falling back to defaults if the saved position
// is no longer on any connected display (e.g. a monitor was unplugged).
function loadBounds() {
  try {
    if (fs.existsSync(boundsFile)) {
      const saved = JSON.parse(fs.readFileSync(boundsFile, 'utf8'));
      if (
        Number.isFinite(saved.width) && Number.isFinite(saved.height) &&
        Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ) {
        const bounds = {
          x: Math.round(saved.x),
          y: Math.round(saved.y),
          width: Math.max(MIN_WIDTH, Math.round(saved.width)),
          height: Math.max(MIN_HEIGHT, Math.round(saved.height))
        };
        const display = screen.getDisplayMatching(bounds);
        const area = display.workArea;
        const visible =
          bounds.x + bounds.width > area.x + 40 &&
          bounds.x < area.x + area.width - 40 &&
          bounds.y >= area.y - 10 &&
          bounds.y < area.y + area.height - 40;
        if (visible) return bounds;
        return { width: bounds.width, height: bounds.height };
      }
    }
  } catch (e) {
    console.error('Failed to load window bounds:', e);
  }
  return { ...DEFAULT_BOUNDS };
}

// Save window bounds (debounced: resize/move fire many times per second)
let saveBoundsTimer = null;
function saveBoundsNow() {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      fs.writeFileSync(boundsFile, JSON.stringify(mainWindow.getBounds()));
    }
  } catch (e) {
    console.error('Failed to save window bounds:', e);
  }
}
function saveBoundsDebounced() {
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(saveBoundsNow, 300);
}

function createWindow() {
  const savedBounds = loadBounds();

  mainWindow = new BrowserWindow({
    ...savedBounds,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false
    },
    frame: false, // Borderless window
    transparent: true, // Allow transparency
    backgroundColor: '#00000000', // Fully transparent background to prevent grey flash
    title: 'DS Linkstack',
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    alwaysOnTop: false,
    hasShadow: true,
    resizable: true, // Keep resizable even without borders
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development (optional)
  // mainWindow.webContents.openDevTools();

  // Handle external links (open in default browser, not in Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('resize', saveBoundsDebounced);
  mainWindow.on('move', saveBoundsDebounced);

  mainWindow.on('close', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsNow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers for window controls
ipcMain.on('toggle-always-on-top', (event, shouldBeOnTop) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(Boolean(shouldBeOnTop));
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// When a link/folder is opened the window briefly forces itself on top so the
// frameless transparent window doesn't vanish behind the newly opened app.
let openingLinkTimer = null;
let onTopBeforeOpening = null;
ipcMain.on('opening-link', (event) => {
  if (mainWindow) {
    // Only capture the "real" state on the first of a burst of clicks
    if (openingLinkTimer === null) {
      onTopBeforeOpening = mainWindow.isAlwaysOnTop();
    }
    clearTimeout(openingLinkTimer);

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.focus();

    openingLinkTimer = setTimeout(() => {
      openingLinkTimer = null;
      if (mainWindow && !onTopBeforeOpening) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 2000);
  }
  event.returnValue = true;
});

ipcMain.on('resize-window-by', (event, { deltaX, deltaY }) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: Math.max(MIN_WIDTH, Math.round(bounds.width + deltaX)),
      height: Math.max(MIN_HEIGHT, Math.round(bounds.height + deltaY))
    });
  }
});

ipcMain.handle('pick-image-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return require('url').pathToFileURL(result.filePaths[0]).href;
  }
  return null;
});

ipcMain.handle('pick-folder-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

app.whenReady().then(createWindow);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});
