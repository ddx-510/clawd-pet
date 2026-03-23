#!/usr/bin/env node

// Claude Code Hook -> Claude Pet state bridge
// Writes pet state + messages to /tmp/claude-pet-state
// Food/quota is handled by clawd-statusline.js via the statusLine feature

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

const mapToolToState = (toolName) => {
  if (!toolName) return 'thinking';
  const t = toolName.toLowerCase();
  if (t.includes('task') || t.includes('plan') || t.includes('todo')) return 'planning';
  if (t === 'agent' || t.includes('subagent')) return 'subagents';
  if (t === 'edit' || t === 'write' || t === 'bash' || t === 'notebookedit') return 'composing';
  if (t === 'read' || t === 'grep' || t === 'glob' || t === 'websearch' || t === 'webfetch' || t === 'lsp') return 'thinking';
  return 'composing';
};

const main = async () => {
  const raw = await readStdin();
  if (!raw) { process.exit(0); }

  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  const hook = input.hook_event_name || '';

  switch (hook) {
    case 'UserPromptSubmit':
      writeState('thinking');
      break;

    case 'PreToolUse':
      writeState(mapToolToState(input.tool_name));
      break;

    case 'PostToolUse':
    case 'PostToolUseFailure':
      writeState('thinking');
      break;

    case 'SubagentStart':
      writeState('subagents');
      break;

    case 'SubagentStop':
      writeState('thinking');
      break;

    case 'Stop': {
      if (input.stop_hook_active) { process.exit(0); }
      writeState('done', input.last_assistant_message || '');
      break;
    }

    case 'Notification':
      writeState('done', input.message || '');
      break;
  }

  process.exit(0);
};

main().catch(() => process.exit(0));
