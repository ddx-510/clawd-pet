#!/usr/bin/env node

// Clawd statusLine script
// Reads Claude Code session JSON from stdin, writes quota data to /tmp/claude-pet-food
// Configure in settings.json: "statusLine": { "type": "command", "command": "node /path/to/clawd-statusline.js" }

const fs = require('fs');

const FOOD_FILE = '/tmp/claude-pet-food';

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // Get rate limit data (real quota)
    const fiveHour = data.rate_limits?.five_hour?.used_percentage;
    const sevenDay = data.rate_limits?.seven_day?.used_percentage;

    // Context window data
    const contextPct = data.context_window?.used_percentage || 0;

    // Food = inverse of usage (100% used = 0 food, 0% used = 100 food)
    // Use 5-hour window as primary (most relevant for session work)
    let food = 100;
    if (fiveHour != null) {
      food = Math.max(0, Math.round(100 - fiveHour));
    }

    const foodData = {
      food,
      maxFood: 100,
      fiveHourPct: fiveHour != null ? Math.round(fiveHour) : null,
      sevenDayPct: sevenDay != null ? Math.round(sevenDay) : null,
      contextPct: Math.round(contextPct),
      session: data.session_id || '',
      timestamp: Date.now(),
    };

    fs.writeFileSync(FOOD_FILE, JSON.stringify(foodData));

    // Also output a minimal statusline for Claude Code itself
    const model = data.model?.display_name || '?';
    const foodBar = '█'.repeat(Math.round(food / 10)) + '░'.repeat(10 - Math.round(food / 10));
    const ctx = Math.round(contextPct);
    let out = `[${model}] ${foodBar} ${food}%`;
    if (fiveHour != null) out += ` | 5h: ${Math.round(fiveHour)}%`;
    out += ` | ctx: ${ctx}%`;
    console.log(out);
  } catch (_) {
    console.log('[Clawd]');
  }
});
