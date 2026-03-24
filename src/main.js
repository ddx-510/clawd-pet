const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.clawd-config.json');

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

  // Detect drag by polling window position
  let lastX = 0, lastY = 0;
  let stableCount = 0;
  let isSliding = false; // true during programmatic slide animations

  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isSliding) return; // ignore position changes from slide animation

    const [x, y] = mainWindow.getPosition();
    const moved = (x !== lastX || y !== lastY);
    lastX = x;
    lastY = y;

    if (moved) {
      stableCount = 0;
      if (!isDragging) {
        isDragging = true;
        const point = screen.getCursorScreenPoint();
        const bounds = mainWindow.getBounds();
        mainWindow.webContents.send('drag-start', {
          x: point.x - bounds.x,
          y: point.y - bounds.y,
        });
      }
    } else if (isDragging) {
      stableCount++;
      if (stableCount >= 6) {
        isDragging = false;
        mainWindow.webContents.send('drag-end');
      }
    }
  }, 100);

  ipcMain.on('set-pet-state', (_, state) => {
    mainWindow.webContents.send('state-change', state);
  });

  // Slide window down/up for peek/hide behavior
  ipcMain.on('slide-down', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    isSliding = true;
    const bounds = mainWindow.getBounds();
    const { height } = screen.getPrimaryDisplay().workAreaSize;
    const targetY = height - 300;
    animateWindowY(bounds.y, targetY, 400, () => {
      isSliding = false;
      lastX = mainWindow.getPosition()[0];
      lastY = mainWindow.getPosition()[1];
    });
  });

  ipcMain.on('slide-up', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    isSliding = true;
    const bounds = mainWindow.getBounds();
    const { height } = screen.getPrimaryDisplay().workAreaSize;
    const targetY = height - 380;
    animateWindowY(bounds.y, targetY, 300, () => {
      isSliding = false;
      lastX = mainWindow.getPosition()[0];
      lastY = mainWindow.getPosition()[1];
    });
  });

  // Right-click context menu
  ipcMain.on('show-context-menu', () => {
    let currentName = 'Clawd';
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (cfg.name) currentName = cfg.name;
    } catch (_) {}

    const petMenu = Menu.buildFromTemplate([
      { label: currentName, enabled: false },
      { type: 'separator' },
      {
        label: 'Rename...',
        click: () => mainWindow.webContents.send('show-rename'),
      },
      { label: 'Hide', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow.hide() },
      { label: 'Quit', click: () => app.quit() },
    ]);
    petMenu.popup({ window: mainWindow });
  });

  // Save name from renderer
  ipcMain.on('save-name', (_, name) => {
    try {
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) {}
      cfg.name = name;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } catch (_) {}
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
function animateWindowY(fromY, toY, duration, onDone) {
  if (!mainWindow || mainWindow.isDestroyed()) { if (onDone) onDone(); return; }
  const startTime = Date.now();
  const diff = toY - fromY;
  if (Math.abs(diff) < 2) { if (onDone) onDone(); return; }

  function step() {
    if (!mainWindow || mainWindow.isDestroyed()) { if (onDone) onDone(); return; }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x, y: Math.round(fromY + diff * ease), width: bounds.width, height: bounds.height });
    if (t < 1) { setTimeout(step, 16); } else { if (onDone) onDone(); }
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
