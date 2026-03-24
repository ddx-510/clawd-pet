const { ipcRenderer } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ==========================================
// STATE: idle | working | dancing | sleeping
//
//  hooks fire  ->  working (shows thinking/composing/planning/subagents visual)
//  hooks stop  ->  idle  (after 3s debounce in main.js)
//  idle timer  ->  dancing (3-4s then back to idle)
//  idle timer  ->  sleeping (sinks down, click to wake -> idle)
//
// ==========================================

let state = 'idle';         // idle | working | dancing | sleeping | done
let workingVisual = 'thinking'; // which visual to show during working
let lastHookState = 'idle';    // track last hook state for drag return
let isDragging = false;

let danceTimer = null;
let danceStopTimer = null;
let sleepTimer = null;
let dropTimer = null;
let doneTimer = null;
let doneUntil = 0; // timestamp - ignore work hooks until this time

const petBody   = document.getElementById('pet-body');
const stateLabel = document.getElementById('state-label');
const eyeL      = document.getElementById('eye-left');
const eyeR      = document.getElementById('eye-right');
const legs      = document.querySelectorAll('.leg');
const thinkBub  = document.getElementById('think-bubbles');
const clipboard = document.getElementById('plan-clipboard');
const pencil    = document.getElementById('compose-pencil');
const sparkles  = document.getElementById('dance-sparkles');
const dragFx    = document.getElementById('drag-effects');
const dropFx    = document.getElementById('drop-effects');
const zzzFx     = document.getElementById('zzz-effects');
const doneFx    = document.getElementById('done-effects');
const subAgents = document.getElementById('sub-agents');
const bubbleWrap = document.getElementById('bubble-wrap');
const bubble     = document.getElementById('speech-bubble');
const bubbleClose = document.getElementById('bubble-close');

const L_EYE_X = 53, L_EYE_Y = 42;
const R_EYE_X = 81, R_EYE_Y = 42;

// ==========================================
// ENTER IDLE - start dance + sleep timers
// ==========================================
function enterIdle() {
  state = 'idle';
  applyVisual('idle');
  startIdleTimers();
}

function startIdleTimers() {
  clearTimeout(danceTimer);
  clearTimeout(sleepTimer);

  // Dance once after 25-45s
  danceTimer = setTimeout(() => {
    if (state === 'idle') enterDancing();
  }, 25000 + Math.random() * 20000);

  // Sleep after 40-60s (longer than dance so dance happens first)
  sleepTimer = setTimeout(() => {
    if (state === 'idle') enterSleeping();
  }, 40000 + Math.random() * 20000);
}

function clearIdleTimers() {
  clearTimeout(danceTimer);
  clearTimeout(danceStopTimer);
  clearTimeout(sleepTimer);
}

// ==========================================
// ENTER WORKING
// ==========================================
function enterWorking(visual) {
  clearIdleTimers();
  clearTimeout(doneTimer);
  state = 'working';
  workingVisual = visual;
  applyVisual(visual);
}

// ==========================================
// ENTER DONE - show response then idle
// ==========================================
let streamInterval = null;

function enterDone(message) {
  clearIdleTimers();
  clearTimeout(doneTimer);
  clearInterval(streamInterval);
  state = 'done';
  // Protect done state from being overwritten by hooks for 8s
  doneUntil = Date.now() + 8000;
  petBody.className.baseVal = 'idle';
  clearVisual();
  resetEyes();
  resetLegs();
  stateLabel.textContent = 'done!';
  doneFx.style.display = 'block';
  animateDoneStars();
  doJump();

  if (bubble && message && message.trim()) {
    showBubble();
    bubble.innerHTML = '<span class="cursor"></span>';
    streamMessage(message);
  } else {
    doneTimer = setTimeout(() => {
      if (state === 'done') {
        doneFx.style.display = 'none';
        enterIdle();
      }
    }, 3000);
  }
}

function showBubble() {
  if (bubbleWrap) { bubbleWrap.style.display = 'block'; bubbleWrap.className = 'visible'; }
}

function hideBubble() {
  if (bubbleWrap) { bubbleWrap.className = ''; bubbleWrap.style.display = 'none'; }
  if (bubble) bubble.innerHTML = '';
}

function dismissDone() {
  clearTimeout(doneTimer);
  clearInterval(streamInterval);
  hideBubble();
  doneFx.style.display = 'none';
  doneUntil = 0;
  enterIdle();
}

function streamMessage(text) {
  const { marked } = require('marked');
  marked.setOptions({ breaks: true, gfm: true });

  let charIndex = 0;
  const speed = 15; // ms per character

  streamInterval = setInterval(() => {
    if (state !== 'done' || charIndex >= text.length) {
      clearInterval(streamInterval);
      // Remove cursor, render final markdown
      if (bubble) {
        bubble.innerHTML = marked.parse(text);
        bubble.scrollTop = bubble.scrollHeight;
      }
      // Auto-dismiss after 8s (user can close earlier with X)
      doneTimer = setTimeout(() => {
        if (state === 'done') dismissDone();
      }, 8000);
      return;
    }

    charIndex += 2; // 2 chars at a time for speed
    const partial = text.slice(0, charIndex);
    if (bubble) {
      bubble.innerHTML = marked.parse(partial) + '<span class="cursor"></span>';
      bubble.scrollTop = bubble.scrollHeight;
    }
  }, speed);
}

// ==========================================
// ENTER DANCING - 3-4s then back to idle
// ==========================================
function enterDancing() {
  clearTimeout(danceTimer);
  clearTimeout(sleepTimer);
  state = 'dancing';

  petBody.className.baseVal = 'dancing';
  stateLabel.textContent = '~ dancing ~';
  clearVisual();
  sparkles.style.display = 'block';
  animateSparkles();
  animateDanceLegs();

  // Hard stop
  danceStopTimer = setTimeout(() => {
    if (state === 'dancing') enterIdle();
  }, 3000 + Math.random() * 1500);
}

// ==========================================
// ENTER SLEEPING
// ==========================================
function enterSleeping() {
  clearIdleTimers();
  state = 'sleeping';
  stateLabel.textContent = 'zzz';
  zzzFx.style.display = 'block';
  animateZzz();
  eyeL.setAttribute('height', 3);
  eyeR.setAttribute('height', 3);
  ipcRenderer.send('slide-down');
}

function wakeUp() {
  if (state !== 'sleeping') return;
  zzzFx.style.display = 'none';
  resetEyes();
  ipcRenderer.send('slide-up');
  // Jump after sliding up
  setTimeout(() => doJump(), 350);
  enterIdle();
}

// ==========================================
// VISUALS
// ==========================================
function applyVisual(visual) {
  petBody.className.baseVal = visual === 'idle' ? 'idle' : visual;
  petBody.style.transition = '';
  petBody.style.transform = '';
  clearVisual();
  resetEyes();
  resetLegs();

  switch (visual) {
    case 'idle':
      stateLabel.textContent = 'idle';
      break;
    case 'thinking':
      stateLabel.textContent = 'thinking...';
      thinkBub.style.display = 'block';
      animateThinkBubbles();
      eyeL.setAttribute('y', L_EYE_Y - 2);
      eyeR.setAttribute('y', R_EYE_Y - 2);
      break;
    case 'composing':
      stateLabel.textContent = 'composing';
      pencil.style.display = 'block';
      eyeL.setAttribute('x', L_EYE_X + 2);
      eyeR.setAttribute('x', R_EYE_X + 2);
      break;
    case 'planning':
      stateLabel.textContent = 'planning';
      clipboard.style.display = 'block';
      eyeL.setAttribute('x', L_EYE_X - 2);
      eyeR.setAttribute('x', R_EYE_X - 2);
      break;
    case 'subagents':
      stateLabel.textContent = 'friends!';
      spawnSubAgents();
      break;
  }
}

function clearVisual() {
  thinkBub.style.display = 'none';
  clipboard.style.display = 'none';
  pencil.style.display = 'none';
  sparkles.style.display = 'none';
  dragFx.style.display = 'none';
  dropFx.style.display = 'none';
  zzzFx.style.display = 'none';
  doneFx.style.display = 'none';
  hideBubble();
  clearInterval(streamInterval);
  subAgents.innerHTML = '';
}

function resetEyes() {
  eyeL.setAttribute('x', L_EYE_X);
  eyeL.setAttribute('y', L_EYE_Y);
  eyeL.setAttribute('height', 7);
  eyeR.setAttribute('x', R_EYE_X);
  eyeR.setAttribute('y', R_EYE_Y);
  eyeR.setAttribute('height', 7);
}

function resetLegs() {
  legs.forEach(l => { l.style.transform = ''; });
}

// ==========================================
// HOOK STATE CHANGES (from main.js watcher)
// ==========================================
ipcRenderer.on('state-change', (_, hookState, args) => {
  // Always track last hook state (for drag return)
  lastHookState = hookState;

  if (isDragging) return;

  if (hookState === 'done') {
    enterDone(args);
    return;
  }

  // While done is showing, ignore work hooks
  if (Date.now() < doneUntil) return;

  if (hookState === 'idle') {
    if (state === 'working') enterIdle();
    return;
  }

  // Work state: thinking, composing, planning, subagents
  if (state === 'dancing') clearTimeout(danceStopTimer);
  if (state === 'sleeping') {
    zzzFx.style.display = 'none';
    resetEyes();
    ipcRenderer.send('slide-up');
  }
  enterWorking(hookState);
});

// ==========================================
// CLICK - jump or wake up
// ==========================================
document.getElementById('pet-container').addEventListener('click', (e) => {
  if (isDragging) return;
  if (state === 'sleeping') { wakeUp(); return; }
  doJump();
});

function doJump() {
  const prev = petBody.className.baseVal;
  petBody.className.baseVal = '';
  petBody.style.transition = 'transform 0.15s ease-out';
  petBody.style.transform = 'translateY(-14px)';
  setTimeout(() => {
    petBody.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
    petBody.style.transform = 'translateY(0)';
    setTimeout(() => {
      petBody.style.transition = '';
      petBody.style.transform = '';
      petBody.className.baseVal = prev;
    }, 250);
  }, 150);
}

// ==========================================
// EYE TRACKING
// ==========================================
ipcRenderer.on('mouse-position', (_, pos) => {
  if (isDragging || state !== 'idle') return;
  const dx = pos.x - 150, dy = pos.y - 200;
  const ox = dx > 40 ? 2 : dx < -40 ? -2 : 0;
  const oy = dy > 40 ? 2 : dy < -40 ? -2 : 0;
  eyeL.setAttribute('x', L_EYE_X + ox);
  eyeL.setAttribute('y', L_EYE_Y + oy);
  eyeR.setAttribute('x', R_EYE_X + ox);
  eyeR.setAttribute('y', R_EYE_Y + oy);
});

// ==========================================
// DRAG / DROP
// ==========================================
ipcRenderer.on('drag-start', (_, grabPos) => {
  if (isDragging) return;
  isDragging = true;
  clearIdleTimers();
  clearTimeout(dropTimer);
  if (state === 'sleeping') { zzzFx.style.display = 'none'; ipcRenderer.send('slide-up'); }
  if (state === 'dancing') clearTimeout(danceStopTimer);

  clearVisual();
  stateLabel.textContent = 'wheee!';
  resetLegs();

  // Convert window coords (300x360) to SVG viewBox coords (0-140)
  // SVG element is 140px wide, centered in 300px window, at the bottom
  const svgEl = document.getElementById('pet-svg');
  const svgRect = svgEl.getBoundingClientRect();
  const mx = grabPos?.x || 150;
  const my = grabPos?.y || 250;
  // Map to SVG viewBox (0-140)
  const svgX = Math.max(0, Math.min(140, ((mx - svgRect.left) / svgRect.width) * 140));
  const svgY = Math.max(0, Math.min(140, ((my - svgRect.top) / svgRect.height) * 140));

  // Set transform-origin in SVG viewBox units
  petBody.setAttribute('transform-origin', `${svgX} ${svgY}`);
  petBody.style.transformOrigin = `${svgX}px ${svgY}px`;

  dragFx.style.display = 'block';

  // Eyes look toward grab point
  const dx = svgX - 70;
  const dy = svgY - 50;
  const eyeOx = dx > 10 ? 2 : dx < -10 ? -2 : 0;
  const eyeOy = dy > 10 ? 2 : dy < -10 ? -2 : -2;
  eyeL.setAttribute('x', L_EYE_X + eyeOx);
  eyeL.setAttribute('y', L_EYE_Y + eyeOy);
  eyeR.setAttribute('x', R_EYE_X + eyeOx);
  eyeR.setAttribute('y', R_EYE_Y + eyeOy);

  // Carried sway pivoting from grab point
  petBody.style.transition = '';
  petBody.style.transform = '';
  petBody.className.baseVal = 'dragging';
});

ipcRenderer.on('drag-end', () => {
  if (!isDragging) return;
  isDragging = false;
  petBody.style.transformOrigin = '';
  petBody.setAttribute('transform-origin', '');
  dragFx.style.display = 'none';
  dropFx.style.display = 'block';
  petBody.className.baseVal = 'dropped';
  stateLabel.textContent = 'plop!';
  resetLegs();
  dropTimer = setTimeout(() => {
    dropFx.style.display = 'none';
    // Return to last known hook state
    if (lastHookState === 'idle' || lastHookState === 'done') {
      enterIdle();
    } else {
      enterWorking(lastHookState);
    }
  }, 600);
});

// ==========================================
// CLOSE BUBBLE BUTTON
// ==========================================
if (bubbleClose) {
  bubbleClose.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissDone();
  });
}

// ==========================================
// RIGHT-CLICK MENU
// ==========================================
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  ipcRenderer.send('show-context-menu');
});



// ==========================================
// ANIMATIONS
// ==========================================
function animateDanceLegs() {
  if (state !== 'dancing') return;
  legs.forEach((leg, i) => {
    leg.style.transform = `translateY(${Math.sin((Date.now() / 120) + i * 1.3) * 3}px)`;
  });
  requestAnimationFrame(animateDanceLegs);
}

function animateSparkles() {
  if (state !== 'dancing') return;
  sparkles.querySelectorAll('.sparkle').forEach((g, i) => {
    const t = Date.now() / 350 + i * 1.1;
    g.setAttribute('transform', `translate(${Math.cos(t * 0.7) * 4}, ${Math.sin(t) * 5})`);
    g.setAttribute('opacity', Math.max(0, 0.4 + Math.sin(t * 1.4) * 0.5));
  });
  requestAnimationFrame(animateSparkles);
}

function animateThinkBubbles() {
  if (workingVisual !== 'thinking' || state !== 'working') return;
  const t = Date.now() / 500;
  const rects = thinkBub.querySelectorAll('rect');
  rects[0].setAttribute('opacity', 0.3 + Math.sin(t) * 0.25);
  rects[1].setAttribute('opacity', 0.4 + Math.sin(t + 1) * 0.25);
  requestAnimationFrame(animateThinkBubbles);
}

function animateZzz() {
  if (state !== 'sleeping') return;
  zzzFx.querySelectorAll('.zzz-letter').forEach((z, i) => {
    const t = Date.now() / 800 + i * 0.8;
    z.setAttribute('dy', Math.sin(t) * 3);
    z.setAttribute('opacity', 0.25 + Math.sin(t * 0.7 + i) * 0.25);
  });
  requestAnimationFrame(animateZzz);
}

function animateDoneStars() {
  if (state !== 'done') return;
  doneFx.querySelectorAll('.done-star').forEach((g, i) => {
    const t = Date.now() / 400 + i * 1.2;
    g.setAttribute('transform', `translate(${Math.cos(t * 0.8) * 3}, ${Math.sin(t) * 4})`);
    g.setAttribute('opacity', Math.max(0.2, 0.5 + Math.sin(t * 1.3) * 0.4));
  });
  requestAnimationFrame(animateDoneStars);
}

// ==========================================
// SUB-AGENTS
// ==========================================
function spawnSubAgents() {
  [
    { name: 'Scout',  color: '#7EB8DA', dark: '#5A8FAF', x: -32, y: 30, delay: 0 },
    { name: 'Coder',  color: '#A8D5A2', dark: '#7BAF75', x: 120, y: 35, delay: 0.2 },
    { name: 'Review', color: '#DDA0DD', dark: '#B87DB8', x: 5,   y: 105, delay: 0.35 },
  ].forEach(a => {
    const el = document.createElement('div');
    el.className = 'sub-agent';
    el.style.left = a.x + 'px';
    el.style.top = a.y + 'px';
    el.style.animation = `float-in 0.5s cubic-bezier(0.34,1.56,0.64,1) ${a.delay}s both`;
    el.innerHTML = `
      <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
        <style>@keyframes mb{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}</style>
        <g style="animation:mb 1.8s ease-in-out infinite">
          <rect x="7" y="5" width="16" height="3" fill="${a.color}"/>
          <rect x="4" y="8" width="22" height="3" fill="${a.color}"/>
          <rect x="4" y="11" width="22" height="3" fill="${a.color}"/>
          <rect x="4" y="14" width="22" height="3" fill="${a.color}"/>
          <rect x="7" y="17" width="16" height="3" fill="${a.color}"/>
          <rect x="1" y="10" width="3" height="5" fill="${a.color}"/>
          <rect x="26" y="10" width="3" height="5" fill="${a.color}"/>
          <rect x="10" y="12" width="3" height="3" fill="#2D1B14"/>
          <rect x="17" y="12" width="3" height="3" fill="#2D1B14"/>
          <rect x="8" y="20" width="3" height="6" fill="${a.dark}"/>
          <rect x="14" y="20" width="3" height="7" fill="${a.dark}"/>
          <rect x="20" y="20" width="3" height="6" fill="${a.dark}"/>
        </g>
        <text x="15" y="34" text-anchor="middle" font-family="'Courier New'" font-size="5" fill="${a.dark}" font-weight="bold">${a.name}</text>
      </svg>`;
    subAgents.appendChild(el);
  });
}

// ==========================================
// BLINK
// ==========================================
function blink() {
  if (isDragging || state === 'sleeping') { setTimeout(blink, 1000); return; }
  eyeL.setAttribute('height', 2);
  eyeR.setAttribute('height', 2);
  setTimeout(() => {
    if (state !== 'sleeping') { eyeL.setAttribute('height', 7); eyeR.setAttribute('height', 7); }
  }, 100);
  setTimeout(blink, 2500 + Math.random() * 4000);
}
setTimeout(blink, 1500);

// ==========================================
// PET NAME
// ==========================================
const petNameEl = document.getElementById('pet-name');
function loadPetName() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clawd-config.json'), 'utf8'));
    if (cfg.name && petNameEl) petNameEl.textContent = cfg.name;
  } catch (_) {}
}

// ==========================================
// RENAME
// ==========================================
const renameOverlay = document.getElementById('rename-overlay');
const renameInput = document.getElementById('rename-input');

ipcRenderer.on('show-rename', () => {
  if (renameOverlay) {
    renameOverlay.className = 'visible';
    renameInput.value = petNameEl ? petNameEl.textContent : '';
    renameInput.focus();
    renameInput.select();
  }
});

if (renameInput) {
  renameInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const name = renameInput.value.trim() || 'Clawd';
      if (petNameEl) petNameEl.textContent = name;
      ipcRenderer.send('save-name', name);
      renameOverlay.className = '';
    }
    if (e.key === 'Escape') {
      renameOverlay.className = '';
    }
  });
}

// ==========================================
// FOOD BAR
// ==========================================
const FOOD_FILE = '/tmp/claude-pet-food';
const FOOD_PIPS = 10;
const foodBar = document.getElementById('food-bar');

function initFoodBar() {
  if (!foodBar) return;
  foodBar.innerHTML = '';
  for (let i = 0; i < FOOD_PIPS; i++) {
    const pip = document.createElement('div');
    pip.className = 'food-pip';
    foodBar.appendChild(pip);
  }
}

function updateFoodBar() {
  if (!foodBar) return;
  try {
    const data = JSON.parse(fs.readFileSync(FOOD_FILE, 'utf8'));
    const pct = Math.max(0, Math.min(100, data.food)) / 100;
    const filled = Math.round(pct * FOOD_PIPS);
    const pips = foodBar.querySelectorAll('.food-pip');
    pips.forEach((pip, i) => {
      if (i < filled) {
        pip.className = 'food-pip';
        if (pct <= 0.2) pip.classList.add('critical');
        else if (pct <= 0.4) pip.classList.add('low');
      } else {
        pip.className = 'food-pip empty';
      }
    });
  } catch (_) {}
}

// Poll food file
initFoodBar();
setInterval(updateFoodBar, 1000);

// ==========================================
// INIT
// ==========================================
loadPetName();
enterIdle();
