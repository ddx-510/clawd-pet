const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const STATE_FILE = '/tmp/claude-pet-state';

let mainWindow;
let tray;
let isDragging = false;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 300,
    height: 360,
    x: width - 320,
    y: height - 380,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Detect drag via window move events
  let moveTimer = null;
  mainWindow.on('will-move', () => {
    clearTimeout(moveTimer);
    if (!isDragging) {
      isDragging = true;
      mainWindow.webContents.send('drag-start');
    }
    moveTimer = setTimeout(() => {
      if (isDragging) {
        isDragging = false;
        mainWindow.webContents.send('drag-end');
      }
    }, 200);
  });

  mainWindow.on('moved', () => {
    clearTimeout(moveTimer);
    if (isDragging) {
      isDragging = false;
      mainWindow.webContents.send('drag-end');
    }
  });

  ipcMain.on('set-pet-state', (_, state) => {
    mainWindow.webContents.send('state-change', state);
  });

  // Slide window down/up for peek/hide behavior
  ipcMain.on('slide-down', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    const { height } = screen.getPrimaryDisplay().workAreaSize;
    // Slide down so top ~210px hidden, pet eyes peek at bottom
    const targetY = height - 230;
    animateWindowY(bounds.y, targetY, 400);
  });

  ipcMain.on('slide-up', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    const { height } = screen.getPrimaryDisplay().workAreaSize;
    const targetY = height - 380;
    animateWindowY(bounds.y, targetY, 300);
  });

  // Right-click context menu
  ipcMain.on('show-context-menu', () => {
    const petMenu = Menu.buildFromTemplate([
      { label: 'Clawd', enabled: false },
      { type: 'separator' },
      { label: 'Hide', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow.hide() },
      { label: 'Quit', click: () => app.quit() },
    ]);
    petMenu.popup({ window: mainWindow });
  });

  // Mouse position for eye tracking
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const point = screen.getCursorScreenPoint();
      const bounds = mainWindow.getBounds();
      mainWindow.webContents.send('mouse-position', {
        x: point.x - bounds.x,
        y: point.y - bounds.y,
      });
    }
  }, 50);
}

// Smooth window slide animation
function animateWindowY(fromY, toY, duration) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const startTime = Date.now();
  const diff = toY - fromY;
  if (Math.abs(diff) < 2) return;

  function step() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - t, 3);
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x, y: Math.round(fromY + diff * ease), width: bounds.width, height: bounds.height });
    if (t < 1) setTimeout(step, 16);
  }
  step();
}

// Watch the state file written by Claude Code hooks
// Debounce idle: only send 'idle' after 3s of no other state changes.
// Work states (thinking/composing/etc) are sent immediately.
function watchStateFile() {
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ state: 'idle', timestamp: Date.now() }));
  }

  let lastSentState = '';
  let lastTimestamp = 0;
  let idleDebounceTimer = null;

  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (!data.state || data.timestamp <= lastTimestamp) return;
      lastTimestamp = data.timestamp;

      if (data.state === 'idle') {
        if (lastSentState !== 'idle') {
          clearTimeout(idleDebounceTimer);
          idleDebounceTimer = setTimeout(() => {
            lastSentState = 'idle';
            mainWindow.webContents.send('state-change', 'idle');
          }, 3000);
        }
      } else if (data.state === 'done') {
        // Done with message: send immediately, always
        clearTimeout(idleDebounceTimer);
        lastSentState = 'done';
        mainWindow.webContents.send('state-change', 'done', data.message || '');
      } else {
        clearTimeout(idleDebounceTimer);
        if (data.state !== lastSentState) {
          lastSentState = data.state;
          mainWindow.webContents.send('state-change', data.state);
        }
      }
    } catch (_) {}
  }, 300);
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'tray-icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Clawd', enabled: false },
    { type: 'separator' },
    { label: 'Show', click: () => mainWindow.show() },
    { label: 'Hide', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('Clawd');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  watchStateFile();

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
