#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOK_SCRIPT = path.join(__dirname, '..', 'src', 'claude-pet-hook.js');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'Notification',
];

function installHooks() {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    // Create .claude dir if needed
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  if (!settings.hooks) settings.hooks = {};

  const hookCmd = `node ${HOOK_SCRIPT}`;
  let changed = false;

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) settings.hooks[event] = [];

    // Check if our hook is already installed
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

  if (changed) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    console.log('Clawd hooks installed in ~/.claude/settings.json');
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

    if (changed) {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
      console.log('Clawd hooks removed from ~/.claude/settings.json');
    }
  } catch {}
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--uninstall') || args.includes('uninstall')) {
  removeHooks();
  console.log('Clawd uninstalled. Bye!');
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  clawd - Claude Code desktop pet

  Usage:
    clawd              Launch the pet (installs hooks automatically)
    clawd uninstall    Remove hooks from ~/.claude/settings.json
    clawd --help       Show this help

  The pet reacts to your Claude Code session:
    thinking, composing, planning, sub-agents

  When idle it tracks your mouse, dances occasionally, and sleeps.
  Click to wake, drag to move, right-click for menu.
  Toggle visibility: Ctrl+Shift+P
`);
  process.exit(0);
}

// Install hooks and launch
console.log('Starting Clawd...');
installHooks();

const electronPath = require('electron');
const appPath = path.join(__dirname, '..');

const child = spawn(electronPath, [appPath], {
  stdio: 'ignore',
  detached: true,
});
child.unref();

// Give it a moment to start then exit CLI
setTimeout(() => process.exit(0), 500);
