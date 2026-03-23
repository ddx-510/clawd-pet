# Clawd

A pixel art desktop pet that reacts to your Claude Code sessions.

Clawd sits on your screen, watches your mouse, and responds to what Claude Code is doing - thinking, composing, planning, or coordinating sub-agents. When idle, Clawd dances occasionally and eventually falls asleep until you click to wake it up.

## Install

```bash
npm install -g clawd-pet
```

## Usage

```bash
clawd          # Launch (auto-installs Claude Code hooks)
clawd uninstall  # Remove hooks
clawd --help
```

## What it does

Clawd hooks into your Claude Code session via hooks in `~/.claude/settings.json`:

| Claude Code state | Clawd reaction |
|---|---|
| User sends prompt | Thinking (head bob + thought bubbles) |
| Reading/searching files | Thinking |
| Editing/writing code | Composing (nodding + pencil) |
| Creating tasks/plans | Planning (looking side to side + clipboard) |
| Spawning sub-agents | Friends! (mini Clawds appear) |
| Idle | Eyes track mouse, occasional dance, eventually sleeps |

## Interactions

- **Click** - Jump! (or wake up if sleeping)
- **Drag** - Move Clawd around (wheee!)
- **Right-click** - Menu (hide/quit)
- **Ctrl+Shift+P** - Toggle visibility

## How it works

1. `clawd` installs hooks in `~/.claude/settings.json` that write state to `/tmp/claude-pet-state`
2. The Electron app polls this file and updates the pet animation
3. Idle timers handle dance (25-45s) and sleep (40-60s) behaviors

## Development

```bash
git clone https://github.com/user/clawd-pet
cd clawd-pet
npm install
npm start
```

## Uninstall

```bash
clawd uninstall    # Remove hooks
npm uninstall -g clawd-pet
```

## License

MIT
