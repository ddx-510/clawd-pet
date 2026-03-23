#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const PKG = require(path.join(__dirname, '..', 'package.json'));
const HOOK_SCRIPT = path.join(__dirname, '..', 'src', 'claude-pet-hook.js');
const STATUSLINE_SCRIPT = path.join(__dirname, '..', 'src', 'clawd-statusline.js');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const CONFIG_PATH = path.join(os.homedir(), '.clawd-config.json');
const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'Notification',
];

// --- Config ---
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// --- Hooks ---
function installHooks() {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  if (!settings.hooks) settings.hooks = {};

  const hookCmd = `node ${HOOK_SCRIPT}`;
  let changed = false;

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) settings.hooks[event] = [];

    const alreadyInstalled = settings.hooks[event].some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('claude-pet-hook'))
    );

    if (!alreadyInstalled) {
      settings.hooks[event].push({
        hooks: [{
          type: 'command',
          command: hookCmd,
          timeout: 5,
        }],
      });
      changed = true;
    }
  }

  // Install statusLine for real quota tracking
  const statusLineCmd = `node ${STATUSLINE_SCRIPT}`;
  if (!settings.statusLine || !settings.statusLine.command || !settings.statusLine.command.includes('clawd-statusline')) {
    settings.statusLine = { type: 'command', command: statusLineCmd };
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    console.log('  Hooks + statusLine installed in ~/.claude/settings.json');
  }
}

function removeHooks() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    if (!settings.hooks) return;

    let changed = false;
    for (const event of HOOK_EVENTS) {
      if (!settings.hooks[event]) continue;
      const before = settings.hooks[event].length;
      settings.hooks[event] = settings.hooks[event].filter(entry =>
        !(entry.hooks && entry.hooks.some(h => h.command && h.command.includes('claude-pet-hook')))
      );
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
      if (settings.hooks[event]?.length !== before) changed = true;
    }

    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

    // Remove statusLine if it's ours
    if (settings.statusLine && settings.statusLine.command && settings.statusLine.command.includes('clawd-statusline')) {
      delete settings.statusLine;
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
      console.log('  Hooks + statusLine removed from ~/.claude/settings.json');
    }
  } catch {}
}

// --- Update check ---
function checkForUpdate() {
  return new Promise((resolve) => {
    const req = https.get('https://registry.npmjs.org/clawd-pet/latest', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const latest = JSON.parse(data).version;
          if (latest && latest !== PKG.version) {
            console.log(`\n  Update available: ${PKG.version} -> ${latest}`);
            console.log('  Run: npm install -g clawd-pet\n');
          }
        } catch {}
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
  });
}

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`clawd v${PKG.version}`);
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  clawd v${PKG.version} - Claude Code desktop pet

  Usage:
    clawd                  Launch the pet
    clawd name <name>      Name your pet
    clawd name             Show current name
    clawd uninstall        Remove hooks
    clawd -v, --version    Show version
    clawd -h, --help       Show this help

  When idle, Clawd tracks your mouse, dances, and sleeps.
  Click to wake, drag to move, right-click for menu.
  Toggle: Ctrl+Shift+P
`);
    process.exit(0);
  }

  if (args[0] === 'uninstall') {
    removeHooks();
    console.log('  Clawd uninstalled!');
    process.exit(0);
  }

  if (args[0] === 'name') {
    const cfg = loadConfig();
    if (args[1]) {
      cfg.name = args.slice(1).join(' ');
      saveConfig(cfg);
      console.log(`  Named your pet: ${cfg.name}`);
    } else {
      console.log(`  Pet name: ${cfg.name || 'Clawd (default)'}`);
    }
    process.exit(0);
  }

  // Launch
  const cfg = loadConfig();
  const name = cfg.name || 'Clawd';
  console.log(`  Starting ${name}...`);

  installHooks();
  await checkForUpdate();

  const electronPath = require('electron');
  const appPath = path.join(__dirname, '..');

  const child = spawn(electronPath, [appPath], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();

  setTimeout(() => process.exit(0), 500);
}

main();
