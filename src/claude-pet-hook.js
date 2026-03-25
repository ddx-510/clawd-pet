#!/usr/bin/env node

// Claude Code Hook -> Claude Pet state bridge

const fs = require('fs');

const STATE_FILE = '/tmp/claude-pet-state';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const writeState = (state, message) => {
  try {
    const data = { state, timestamp: Date.now() };
    if (message) data.message = message;
    fs.writeFileSync(STATE_FILE, JSON.stringify(data));
  } catch (_) {}
};

// Track active subagents for juggle vs conduct
let subagentCount = 0;
const SUBAGENT_FILE = '/tmp/claude-pet-subagents';
const getSubagentCount = () => {
  try { return JSON.parse(fs.readFileSync(SUBAGENT_FILE, 'utf8')).count || 0; } catch { return 0; }
};
const setSubagentCount = (n) => {
  try { fs.writeFileSync(SUBAGENT_FILE, JSON.stringify({ count: n })); } catch {}
};

// Track tool calls for typing vs building
const TOOL_COUNT_FILE = '/tmp/claude-pet-toolcount';
const getToolCount = () => {
  try { return JSON.parse(fs.readFileSync(TOOL_COUNT_FILE, 'utf8')).count || 0; } catch { return 0; }
};
const incToolCount = () => {
  const c = getToolCount() + 1;
  try { fs.writeFileSync(TOOL_COUNT_FILE, JSON.stringify({ count: c })); } catch {}
  return c;
};
const resetToolCount = () => {
  try { fs.writeFileSync(TOOL_COUNT_FILE, JSON.stringify({ count: 0 })); } catch {}
};

const mapToolToState = (toolName) => {
  if (!toolName) return 'thinking';
  const t = toolName.toLowerCase();
  if (t.includes('task') || t.includes('plan') || t.includes('todo')) return 'planning';
  if (t === 'agent' || t.includes('subagent')) return 'thinking';
  // Count tool calls - 3+ means building, otherwise typing
  const count = incToolCount();
  if (t === 'edit' || t === 'write' || t === 'bash' || t === 'notebookedit') {
    return count >= 3 ? 'building' : 'typing';
  }
  if (t === 'read' || t === 'grep' || t === 'glob' || t === 'websearch' || t === 'webfetch' || t === 'lsp') return 'thinking';
  return count >= 3 ? 'building' : 'typing';
};

const main = async () => {
  const raw = await readStdin();
  if (!raw) { process.exit(0); }

  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  const hook = input.hook_event_name || '';

  switch (hook) {
    case 'SessionStart':
      resetToolCount();
      setSubagentCount(0);
      break;

    case 'UserPromptSubmit':
      resetToolCount();
      writeState('thinking');
      break;

    case 'PreToolUse':
      writeState(mapToolToState(input.tool_name));
      break;

    case 'PostToolUse':
      writeState('thinking');
      break;

    case 'PostToolUseFailure':
      writeState('error');
      break;

    case 'SubagentStart': {
      const n = getSubagentCount() + 1;
      setSubagentCount(n);
      writeState(n >= 2 ? 'conducting' : 'juggling');
      break;
    }

    case 'SubagentStop': {
      const n = Math.max(0, getSubagentCount() - 1);
      setSubagentCount(n);
      if (n > 0) writeState(n >= 2 ? 'conducting' : 'juggling');
      else writeState('thinking');
      break;
    }

    case 'Stop': {
      if (input.stop_hook_active) { process.exit(0); }
      resetToolCount();
      setSubagentCount(0);
      writeState('done', input.last_assistant_message || '');
      break;
    }

    case 'PermissionRequest':
      writeState('alert');
      break;

    case 'Notification':
      writeState('alert');
      break;

    case 'PreCompact':
      writeState('sweeping');
      break;

    case 'PostCompact':
      writeState('done', 'Context compacted!');
      break;

    case 'WorktreeCreate':
      writeState('carrying');
      break;
  }

  process.exit(0);
};

main().catch(() => process.exit(0));
