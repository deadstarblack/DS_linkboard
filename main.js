const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable hardware acceleration to prevent GPU errors
app.disableHardwareAcceleration();

// Add command line switches to prevent GPU issues
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Keep a reference to the window object
let mainWindow;

// File to store window bounds
const boundsFile = path.join(app.getPath('userData'), 'window-bounds.json');

// Load saved window bounds
function loadBounds() {
  try {
    if (fs.existsSync(boundsFile)) {
      return JSON.parse(fs.readFileSync(boundsFile, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load window bounds:', e);
  }
  return { width: 1000, height: 700 };
}

// Save window bounds
function saveBounds() {
  try {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      fs.writeFileSync(boundsFile, JSON.stringify(bounds));
    }
  } catch (e) {
    console.error('Failed to save window bounds:', e);
  }
}

function createWindow() {
  // Load saved bounds
  const savedBounds = loadBounds();
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    ...savedBounds,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: false, // Borderless window
    transparent: true, // Allow transparency
    title: 'LinkBoard',
    icon: path.join(__dirname, 'icon.png'), // Custom hamburger menu icon
    alwaysOnTop: false,
    hasShadow: true,
    resizable: true, // Keep resizable even without borders
    minWidth: 400,
    minHeight: 300,
    show: false // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development (optional - comment out if you don't want it)
  // mainWindow.webContents.openDevTools();

  // Handle external links (open in default browser, not in Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Save window bounds on resize and move
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('close', () => {
    saveBounds();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// IPC handlers for window controls
ipcMain.on('toggle-always-on-top', (event, shouldBeOnTop) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(shouldBeOnTop);
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

ipcMain.on('opening-link', (event) => {
  // Immediately set always on top and show window to prevent disappearing
  if (mainWindow) {
    const wasAlwaysOnTop = mainWindow.isAlwaysOnTop();
    
    // Force window to be visible and on top
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.focus();
    
    // Return state after delay
    setTimeout(() => {
      if (mainWindow && !wasAlwaysOnTop) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 2000);
    
    // Also send response back to renderer
    event.returnValue = true;
  }
});

ipcMain.on('move-window-by', (event, { deltaX, deltaY }) => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + deltaX, y + deltaY);
  }
});

ipcMain.on('resize-window-by', (event, { deltaX, deltaY }) => {
  if (mainWindow) {
    const [currentX, currentY] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    const newWidth = Math.max(400, width + deltaX);
    const newHeight = Math.max(300, height + deltaY);
    
    // Set size without moving the window
    mainWindow.setBounds({
      x: currentX,
      y: currentY,
      width: Math.round(newWidth),
      height: Math.round(newHeight)
    });
  }
});

ipcMain.handle('pick-image-file', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    // Convert to file:// URL for cross-platform compatibility
    return 'file://' + result.filePaths[0].replace(/\\/g, '/');
  }
  return null;
});

ipcMain.handle('pick-folder-path', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// When Electron is ready, create the window
app.whenReady().then(createWindow);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});
