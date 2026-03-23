#!/usr/bin/env node

// Claude Code Hook -> Claude Pet state bridge
// Writes pet state to /tmp/claude-pet-state as a simple text file

const fs = require('fs');
const path = require('path');

const STATE_FILE = '/tmp/claude-pet-state';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const writeState = (state) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      state,
      timestamp: Date.now(),
    }));
  } catch (_) {}
};

const mapToolToState = (toolName) => {
  if (!toolName) return 'thinking';

  const t = toolName.toLowerCase();

  // Planning tools
  if (t.includes('task') || t.includes('plan') || t.includes('todo')) return 'planning';

  // Sub-agent tools
  if (t === 'agent' || t.includes('subagent')) return 'subagents';

  // Writing/editing tools -> composing
  if (t === 'edit' || t === 'write' || t === 'bash' || t === 'notebookedit') return 'composing';

  // Reading/searching tools -> thinking
  if (t === 'read' || t === 'grep' || t === 'glob' || t === 'websearch' || t === 'webfetch' || t === 'lsp') return 'thinking';

  return 'composing';
};

const main = async () => {
  const raw = await readStdin();
  if (!raw) { process.exit(0); }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

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

    case 'Stop':
      writeState('idle');
      break;

    case 'Notification':
      writeState('dancing');
      break;
  }

  process.exit(0);
};

main().catch(() => process.exit(0));
