# Clawd

<p align="center">
  <img src="assets/clawd-banner.svg" alt="Clawd - A pixel art desktop pet for Claude Code" width="700" />
</p>

A pixel art desktop pet that reacts to your Claude Code sessions in real-time.

Clawd sits on your screen, watches your mouse, and responds to what Claude Code is doing. When idle, it dances occasionally and eventually falls asleep. When Claude finishes, a speech bubble streams the response with markdown rendering.

## Install

```bash
npm install -g clawd-pet
```

## Usage

```bash
clawd                    # Launch (auto-installs hooks + statusLine)
clawd name <name>        # Name your pet
clawd name               # Show current name
clawd debug              # Cycle through all animations (for testing)
clawd upgrade, -u        # Upgrade to latest version
clawd uninstall          # Remove hooks and statusLine
clawd -v, --version      # Show version
clawd -h, --help         # Show help
```

## States & Animations

| Claude Code Event | Pet State | Animation |
|---|---|---|
| User sends prompt | thinking | Head bob + thought bubbles |
| Tool use (few calls) | typing | Nodding + floating keycaps |
| Tool use (3+ calls) | building | Shaking + hammer + pixel blocks |
| Task/plan tools | planning | Looking side to side + clipboard |
| Tool use failure | error | Shaking + smoke + "ERROR" text |
| Sub-agent (1) | juggling | Swaying + orbiting orbs |
| Sub-agents (2+) | conducting | Waving + baton + mini friends |
| Permission/notification | alert | Jumping + exclamation mark |
| Context compaction | sweeping | Swaying + broom + dust |
| Worktree create | carrying | Walking + "GIT" box |
| Claude finishes | done | Jump + sparkles + speech bubble |
| Idle ~25-40s | dancing | Bouncing + sparkles + music notes |
| Idle ~50s | sleeping | Sinks down with floating z's |

## Interactions

- **Click** - Jump! (or wake up if sleeping)
- **Drag** - Pick up and carry Clawd around (pivots from grab point)
- **Right-click** - Menu (rename, hide, quit)
- **Ctrl+Shift+P** - Toggle visibility

## Speech Bubble

When Claude finishes responding, a speech bubble streams the response character by character with full markdown support (code blocks, bold, lists, links). Click the X to dismiss early, or let it auto-hide after 8 seconds.

## Food Bar

The food bar shows your real Claude 5-hour rate limit remaining via `statusLine` integration. Green when plenty left, yellow when getting low, red when critical.

## How it works

1. `clawd` installs hooks in `~/.claude/settings.json` for 12+ session events
2. Hooks write state to `/tmp/claude-pet-state`, the Electron app polls it
3. A `statusLine` script reads real rate limit data for the food bar
4. The Stop hook captures `last_assistant_message` for the speech bubble
5. Idle timers handle dance and sleep behaviors

## Development

```bash
git clone https://github.com/ddx-510/clawd-pet
cd clawd-pet
npm install
npm start

# Test all animations
node bin/clawd.js debug
```

## Uninstall

```bash
clawd uninstall          # Remove hooks + statusLine from settings
npm uninstall -g clawd-pet
```

## License

MIT
