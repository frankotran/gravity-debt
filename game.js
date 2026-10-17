'use strict';
/* ============================================================
   ORBITAL — every flip costs.
   One-tap gravity flipper. Flips cost 1 energy. Grab orbs.
   Run dry and you're stuck. 100% client-side, $0 budget.
   ============================================================ */

// ---------- Config ----------
const CFG = {
  energyStart: 5,
  energyMax: 8,
  playerR: 14,
  gravity: 3000,      // px/s^2
  flipLaunch: 560,    // initial velocity on flip (px/s)
  baseSpeed: 340,
  speedRamp: 8,       // +px/s per second survived
  maxSpeed: 1000,
  orbScore: 5,
  nearScore: 15,
  hitShrink: 7,       // forgiving hitboxes
  nearDist: 30,       // near-miss threshold (px from forgiving hitbox)
};

// ---------- Utils ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = t => t * t * (3 - 2 * t);

// ---------- Safe storage (never let storage crash the game) ----------
const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};

// ---------- Challenge modes ----------
const MODES = {
  classic:  { label: 'CLASSIC',  energyMax: 5, accel: 9,  maxSpeed: 1000, orbScore: 5 },
  marathon: { label: 'MARATHON', energyMax: 4, accel: 14, maxSpeed: 1150, orbScore: 5 },
  greed:    { label: 'GREED',    energyMax: 6, accel: 9,  maxSpeed: 1000, orbScore: 10 },
  blitz:    { label: 'BLITZ',    energyMax: 6, accel: 12, maxSpeed: 1100, orbScore: 5 },
};
let mode = store.get('gd_mode') || 'classic';
if (!MODES[mode]) mode = 'classic';

// ---------- Unlockable themes (background + rails + player palette) ----------
const THEMES = [
  { id: 'neon',   name: 'NEON NIGHTS',  need: 0,  bg: ['#0b0b1a', '#07070f', '#0d0a18'], floor: '#00e5ff', ceil: '#ff2ec4', down: '#00e5ff', up: '#ff4dd2' },
  { id: 'sunset', name: 'SUNSET STRIP', need: 4,  bg: ['#1c0b16', '#100710', '#1c0d14'], floor: '#ff9d2e', ceil: '#ff4d6d', down: '#ffb84d', up: '#ff6b9d' },
  { id: 'abyss',  name: 'ABYSS',        need: 8,  bg: ['#02070f', '#010409', '#031018'], floor: '#2eff9d', ceil: '#2e9dff', down: '#2eff9d', up: '#2e9dff' },
  { id: 'ghost',  name: 'GHOST',        need: 12, bg: ['#101014', '#0a0a0c', '#15151b'], floor: '#e8e8f0', ceil: '#b0b0c0', down: '#ffffff', up: '#a8a8b8' },
];
let themeIdx = 0;
try { themeIdx = parseInt(store.get('gd_theme') || '0', 10) || 0; } catch (e) {}
if (themeIdx < 0 || themeIdx >= THEMES.length) themeIdx = 0;
function themeUnlocked(i) { return Object.keys(ach).length >= THEMES[i].need; }
function theme() { return themeUnlocked(themeIdx) ? THEMES[themeIdx] : THEMES[0]; }
function renderTheme() {
  const el = $('theme-name');
  if (!el) return;
  const th = THEMES[themeIdx];
  el.textContent = themeUnlocked(themeIdx) ? th.name : th.name + ' · ' + th.need + ' TROPHIES';
}
function cycleTheme(d) {
  themeIdx = (themeIdx + d + THEMES.length) % THEMES.length;
  if (themeUnlocked(themeIdx)) {
    store.set('gd_theme', String(themeIdx));
    SFX.click();
  } else {
    SFX.deny();
  }
  renderTheme();
}

// ---------- Player skins (trophy-unlocked ball styles) ----------
const SKINS = [
  { id: 'orb',     name: 'ORB',     need: 0 },
  { id: 'terra',   name: 'TERRA',   need: 3 },
  { id: 'comet',   name: 'COMET',   need: 5 },
  { id: 'lava',    name: 'LAVA',     need: 7 },
  { id: 'ring',    name: 'RINGED',  need: 9 },
  { id: 'frost',   name: 'FROST',    need: 11 },
  { id: 'eclipse', name: 'ECLIPSE',  need: 13 },
];
const SKIN_IDS = SKINS.map(s => s.id);
let skinId = 'orb';
try {
  const raw = store.get('gd_skin') || 'orb';
  if (/^\d+$/.test(raw)) {
    // migrate from the old index-based scheme
    skinId = ['orb', 'comet', 'ring', 'wisp'][parseInt(raw, 10)] || 'orb';
    if (skinId === 'wisp') skinId = 'orb';
  } else skinId = raw;
} catch (e) {}
if (!SKIN_IDS.includes(skinId)) skinId = 'orb';
function skinDef() { return SKINS.find(s => s.id === skinId) || SKINS[0]; }
function skinUnlockedId(id) {
  const s = SKINS.find(s => s.id === id) || SKINS[0];
  return Object.keys(ach).length >= s.need;
}
function skin() { return skinUnlockedId(skinId) ? skinDef() : SKINS[0]; }
function skinLocked() { return !skinUnlockedId(skinId); }
function renderSkin() {
  const el = $('skin-name'), lock = $('skin-lock'), sb = $('start-btn');
  const s = skinDef(), unlocked = skinUnlockedId(skinId);
  if (el) {
    el.textContent = unlocked ? s.name : '🔒 ' + s.name;
    el.classList.toggle('locked', !unlocked);
  }
  if (lock) {
    lock.style.display = unlocked ? 'none' : 'block';
    lock.textContent = unlocked ? '' : s.need + ' TROPHIES TO UNLOCK — GAME LOCKED';
  }
  if (sb) sb.classList.toggle('disabled', !unlocked);
}
function cycleSkin(d) {
  const i = SKINS.findIndex(s => s.id === skinId);
  skinId = SKINS[(i + d + SKINS.length) % SKINS.length].id;
  store.set('gd_skin', skinId);
  if (skinUnlockedId(skinId)) SFX.click(); else SFX.deny();
  renderSkin();
}


// ---------- Audio (procedural, no assets) ----------
let AC = null;
let muted = store.get('gd_mute') === '1';
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(freq, dur, type, vol, slideTo) {
  if (muted) return;
  const c = audio(); if (!c) return;
  try {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.03);
  } catch (e) { /* audio unavailable — game continues silently */ }
}
const SFX = {
  flip:  () => beep(280, 0.14, 'square', 0.07, 720),
  orb:   () => beep(880, 0.16, 'sine', 0.11, 1420),
  near:  () => beep(520, 0.10, 'sawtooth', 0.05, 980),
  death: () => beep(170, 0.45, 'sawtooth', 0.14, 38),
  deny:  () => beep(150, 0.16, 'square', 0.09, 85),
  click: () => beep(640, 0.06, 'sine', 0.07),
  boing: () => beep(430, 0.16, 'triangle', 0.12, 150),
  power: () => beep(700, 0.12, 'square', 0.07, 1500),
  explosion: () => { beep(90, 0.4, 'sawtooth', 0.14, 40); setTimeout(() => beep(60, 0.5, 'sawtooth', 0.12, 30), 60); },
  warn: () => { beep(300, 0.15, 'square', 0.09, 180); setTimeout(() => beep(300, 0.15, 'square', 0.09, 180), 200); },
  fanfare: () => {
    beep(523, 0.12, 'triangle', 0.10);
    setTimeout(() => beep(659, 0.12, 'triangle', 0.10), 110);
    setTimeout(() => beep(784, 0.22, 'triangle', 0.10), 220);
  },
};

// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
let floorY = 0, ceilY = 0, gapH = 0;

function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* desktop: no-op */ }
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ceilY = Math.round(H * 0.16);
  floorY = Math.round(H * 0.84);
  gapH = floorY - ceilY;
  // keep player inside the playfield if a resize happens mid-run
  if (state === 'playing' || state === 'dying') {
    py = clamp(py, ceilY + CFG.playerR, floorY - CFG.playerR);
    if (onSurface) py = grav === 1 ? floorY - CFG.playerR : ceilY + CFG.playerR;
  }
  buildStars();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// ---------- State ----------
let state = 'menu';           // menu | playing | dying | over
let paused = false;
let grav = 1;                 // +1 = pulled to floor, -1 = pulled to ceiling
let flipFrom = 1;             // gravity direction before the latest flip (bounce pads restore it)
let px = 0, py = 0, vy = 0;
let onSurface = true;
let energy = CFG.energyStart;
let score = 0, elapsed = 0, speed = CFG.baseSpeed;
let flips = 0, orbsGot = 0, nearCount = 0;
let best = 0, bestCurve = null;
function bestKey() { return 'gd_best' + (mode === 'classic' ? '' : '_' + mode); }
function curveKey() { return 'gd_bestcurve' + (mode === 'classic' ? '' : '_' + mode); }
function loadBest() {
  best = parseInt(store.get(bestKey()) || '0', 10) || 0;
  try { bestCurve = JSON.parse(store.get(curveKey()) || 'null'); } catch (e) { bestCurve = null; }
  if (!Array.isArray(bestCurve)) bestCurve = null;
  refreshBest();
}
let shake = 0, deathT = 0, denyFlash = 0;
let obstacles = [], orbs = [], pads = [], powerups = [], particles = [], floaters = [], trail = [], waves = [], meteors = [];
let spawnX = 0, consecCost = 0, railOff = 0;
let stars = [];
// retention systems: combo, ghost pace, achievements, juice
let combo = 0, comboT = 0, mult = 1;
let runCurve = [], lastCurveSample = 0, bouncesThisRun = 0;
let slowmoT = 0, freezeT = 0, flash = 0;
// powerups & surge events
let shield = false, magnetT = 0, surgeT = 0, invulnT = 0, chronoT = 0;
let eventSurgeT = 0, surgeWarnT = 0, nextSurgeAt = 45;
// career stats & streak (persistent)
let career = { flips: 0, time: 0, bestMult: 1, runs: 0, xp: 0 };
try { career = Object.assign(career, JSON.parse(store.get('gd_career') || '{}')); } catch (e) {}

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const hud = $('hud'), scoreEl = $('score'), pipsEl = $('energy-pips'),
      bestHud = $('best-hud'), menu = $('menu'), gameoverEl = $('gameover'),
      pausedEl = $('paused'), muteBtn = $('mute-btn'), timerEl = $('timer'),
      paceEl = $('pace'), comboEl = $('combo'), comboTxt = $('combo-txt'),
      comboBar = $('combo-bar'), fxEl = $('fx-status');

function renderPips() {
  let html = '';
  for (let i = 0; i < CFG.energyMax; i++) {
    const on = i < energy ? ' on' : '';
    const danger = energy <= 2 ? ' danger' : '';
    html += '<div class="pip' + on + danger + '"></div>';
  }
  pipsEl.innerHTML = html;
}
function setScore(v) { scoreEl.textContent = Math.floor(v); }
function fmtTime(s) {
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function fxStatus() {
  const parts = [];
  if (shield) parts.push('SHIELD');
  if (magnetT > 0) parts.push('MAGNET ' + Math.ceil(magnetT) + 's');
  if (surgeT > 0) parts.push('OVERDRIVE ' + Math.ceil(surgeT) + 's');
  if (rushT > 0) parts.push('GOLD RUSH ' + Math.ceil(rushT) + 's');
  if (chronoT > 0) parts.push('BULLET TIME ' + Math.ceil(chronoT) + 's');
  if (eventSurgeT > 0) parts.push('SURGE ' + Math.ceil(eventSurgeT) + 's');
  else if (surgeWarnT > 0) parts.push('SURGE INCOMING');
  fxEl.textContent = parts.join(' · ');
  fxEl.style.display = parts.length ? 'block' : 'none';
}

let lastTimerShown = '';
function tickTimer() {
  const t = mode === 'blitz' ? fmtTime(Math.max(0, Math.ceil(blitzLeft))) : fmtTime(elapsed);
  if (t !== lastTimerShown) {
    lastTimerShown = t; timerEl.textContent = t;
    // ghost pace vs best run
    const bs = bestScoreAt(elapsed);
    if (bs !== null && elapsed > 2) {
      const d = Math.floor(score) - bs;
      paceEl.textContent = (d >= 0 ? '+' : '-') + Math.abs(d);
      paceEl.className = d >= 0 ? 'ahead' : 'behind';
      paceEl.style.display = 'block';
    } else {
      paceEl.style.display = 'none';
    }
    const fs = Math.floor(score);
    if (fs >= 500) unlockAch('score500');
    if (fs >= 1000) unlockAch('score1000');
    if (rival && !rivalBeaten && fs >= rival.score) {
      rivalBeaten = true;
      floater(W / 2, H * 0.3, 'RIVAL BEATEN!', '#ff9d2e');
      SFX.fanfare();
      buzz([30, 30, 30, 30, 60]);
    }
    fxStatus();
  }
  if (elapsed >= 30) unlockAch('survive30');
  if (elapsed >= 60) unlockAch('survive60');
}
function refreshBest() {
  bestHud.textContent = 'BEST ' + best;
  $('menu-best').textContent = 'BEST ' + best;
}
function floater(x, y, txt, color) {
  floaters.push({ x, y, txt, color: color || '#fff', life: 1 });
}

// ---------- Powerup & surge multipliers ----------
function speedMult() {
  let m = 1;
  if (surgeT > 0) m *= 1.25;      // overdrive pickup
  if (eventSurgeT > 0) m *= 1.2;  // timed surge event
  return m;
}
function scoreMult() {
  let m = 1;
  if (surgeT > 0) m *= 2;
  if (eventSurgeT > 0) m *= 2;
  if (rushT > 0) m *= 2;
  return m;
}

function collectPowerup(p) {
  p.taken = true;
  feedCombo();
  if (p.kind === 'shield') {
    shield = true;
    floater(px, py - 42, 'SHIELD UP', '#7df9ff');
  } else if (p.kind === 'magnet') {
    magnetT = 8;
    floater(px, py - 42, 'MAGNET 8s', '#ff5e7a');
  } else if (p.kind === 'chrono') {
    chronoT = 5;
    floater(px, py - 42, 'BULLET TIME 5s', '#b28dff');
  } else {
    surgeT = 10;
    floater(px, py - 42, 'OVERDRIVE x2', '#ff9d2e');
  }
  unlockAch('powerup');
  SFX.power();
  buzz([30, 30, 30]);
  fxStatus();
  waves.push({ x: p.x, y: p.y, r: 8, life: 0.8 });
}

function detonateOrb(o) {
  o.taken = true;
  detonate(o.x, o.y);
  unlockAch('volatile');
}

function detonate(x, y) {
  // volatile orb goes off: vaporize every obstacle in the blast radius
  const R = surgeT > 0 ? 200 : 150;
  let kills = 0;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    const cx = clamp(x, ob.x, ob.x + ob.w), cy = clamp(y, ob.y, ob.y + ob.h);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < R * R) {
      for (let k = 0; k < 10; k++) {
        particles.push({
          x: ob.x + ob.w / 2, y: ob.y + ob.h / 2,
          vx: rand(-300, 300), vy: rand(-300, 300),
          life: rand(0.3, 0.7), max: 0.7, size: rand(2, 6),
          color: ['#ff7a2e', '#ffd94d', '#ff4d2e'][k % 3],
        });
      }
      obstacles.splice(i, 1);
      kills++;
    }
  }
  waves.push({ x, y, r: 14, life: 1 });
  waves.push({ x, y, r: 6, life: 1 });
  for (let k = 0; k < 24; k++) {
    const a = Math.random() * 6.2832, sp = rand(120, 420);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.35, 0.8), max: 0.8, size: rand(2, 7),
      color: ['#ff7a2e', '#ffd94d', '#ffffff', '#ff4d2e'][k % 4],
    });
  }
  shake = Math.max(shake, 12);
  flash = Math.max(flash, 0.22);
  SFX.explosion();
  buzz([50, 30, 50]);
  feedCombo();
  if (kills > 0) {
    const pts = 25 * kills * scoreMult();
    score += pts;
    setScore(score);
    const label = kills === 1 ? 'DEMOLISHED +' + pts :
      kills === 2 ? 'DOUBLE KILL +' + pts :
      kills === 3 ? 'TRIPLE KILL +' + pts : 'RAMPAGE x' + kills + ' +' + pts;
    floater(x, y - 54, label, '#ff7a2e');
  } else {
    floater(x, y - 54, 'BOOM', '#ff7a2e');
  }
}

function smashShield(ob, i) {
  // shield absorbs a lethal hit: the obstacle shatters instead of you
  shield = false;
  invulnT = 1.2;
  obstacles.splice(i, 1);
  const pts = 25 * scoreMult();
  score += pts;
  setScore(score);
  floater(px, py - 42, 'SHIELD DOWN +' + pts, '#7df9ff');
  waves.push({ x: px, y: py, r: 12, life: 1 });
  for (let k = 0; k < 16; k++) {
    particles.push({
      x: ob.x + ob.w / 2, y: ob.y + ob.h / 2,
      vx: rand(-260, 260), vy: rand(-260, 260),
      life: rand(0.3, 0.6), max: 0.6, size: rand(2, 6), color: '#7df9ff',
    });
  }
  shake = Math.max(shake, 10);
  SFX.power();
  buzz([40, 40, 40]);
  fxStatus();
}

// ---------- Rival challenge (via shared link ?score=&mode=) ----------
let rival = null, rivalBeaten = false;
try {
  const qp = new URLSearchParams(location.search);
  const rs = parseInt(qp.get('score') || '0', 10) || 0;
  if (rs > 0) rival = { score: rs, mode: qp.get('mode') || 'classic' };
} catch (e) { /* ignore */ }
function renderRival() {
  const el = $('rival-banner');
  if (!el) return;
  if (rival) {
    const ml = rival.mode !== 'classic' && MODES[rival.mode] ? ' (' + MODES[rival.mode].label + ')' : '';
    el.textContent = 'RIVAL ' + rival.score + ml + ' — BEAT IT';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ---------- Death tips (contextual, by cause) ----------
const DEATH_TIPS = {
  spike:  'Spikes only bite their own rail — flip early, land late.',
  wall:   'Walls span the whole gap — be on the other rail before you arrive.',
  gate:   'Thread the amber window dead-center: it pays PERFECT.',
  drifter: 'Drifters swing widest at the extremes — time your pass there.',
  piston: 'Pistons shimmer red before they strike — flip the moment you see it.',
};
let deathCause = null;
let deathStats = {};
try { deathStats = JSON.parse(store.get('gd_deaths') || '{}') || {}; } catch (e) { deathStats = {}; }
function renderStats() {
  const k = $('stats-killer'), m = $('stats-modes');
  if (k) {
    const entries = Object.entries(deathStats).sort((a, b) => b[1] - a[1]);
    k.textContent = entries.length
      ? 'TOP KILLER: ' + entries[0][0].toUpperCase() + ' x' + entries[0][1]
      : 'TOP KILLER: —';
  }
  if (m) {
    const modes = ['classic', 'marathon', 'greed', 'blitz'];
    m.textContent = modes.map(md => {
      const key = 'gd_best' + (md === 'classic' ? '' : '_' + md);
      return MODES[md].label.slice(0, 2) + ' ' + (parseInt(store.get(key) || '0', 10) || 0);
    }).join(' · ');
  }
}

// ---------- Score milestones ----------
const MILESTONES = [100, 250, 500, 1000, 2000, 5000, 10000];
let nextMilestone = 0;

// ---------- BLITZ mode: 60-second score attack ----------
let blitzLeft = 60, endTitle = 'OUT OF MOVES';
function endBlitz() {
  if (state !== 'playing') return;
  endTitle = 'TIME UP';
  SFX.fanfare();
  showGameOver();
}

// ---------- Player titles (lifetime XP) ----------
const TITLES = [
  [0, 'ROOKIE'],
  [1000, 'FLIPPER'],
  [5000, 'DEBT DODGER'],
  [15000, 'GRAVITY GREMLIN'],
  [40000, 'ORBIT BREAKER'],
  [100000, 'DEBT GOD'],
];
function titleFor(xp) {
  let t = TITLES[0][1];
  for (const [need, name] of TITLES) if (xp >= need) t = name;
  return t;
}

// ---------- Gold rush (orb streak) ----------
let rushT = 0;
function startRush() {
  rushT = 10;
  floater(W / 2, H * 0.25, 'GOLD RUSH · 2X', '#ffd94d');
  SFX.fanfare();
  buzz([30, 30, 60]);
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: px + rand(-30, 30), y: py + rand(-30, 30),
      vx: rand(-200, 200), vy: rand(-200, 200),
      life: rand(0.4, 0.8), max: 0.8, size: rand(2, 5), color: '#ffd94d',
    });
  }
}

// ---------- Interactive tutorial (first run only) ----------
let tutorial = false, tutStage = 0, tutStageT = 0, tutOrbSpawned = false, tutSpikeSpawned = false;
const TUT_TEXT = [
  'TAP TO FLIP — every flip costs 1',
  'GRAB GOLD ORBS TO RECHARGE',
  'FLIP TO DODGE THE SPIKE!',
  'SURVIVE!',
];
function renderTut() {
  const el = $('tut-banner');
  if (!el) return;
  if (!tutorial || state !== 'playing') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.textContent = TUT_TEXT[Math.min(tutStage, 3)];
}
function tutAdvance(dt) {
  tutStageT += dt;
  if (tutStage === 0 && flips >= 1) { tutStage = 1; tutStageT = 0; }
  else if (tutStage === 1 && orbsGot >= 1) { tutStage = 2; tutStageT = 0; }
  else if (tutStage === 2 && tutStageT > 6) { tutStage = 3; tutStageT = 0; }
  else if (tutStage === 3 && tutStageT > 4) {
    tutorial = false;
    store.set('gd_tutorial', '1');
  } else return;
  renderTut();
}

// ---------- Achievements (persistent) ----------
const ACHS = [
  { id: 'firstflip',  label: 'First flip' },
  { id: 'firstgate',  label: 'Thread the gate' },
  { id: 'combo3',     label: 'Combo x3' },
  { id: 'combo5',     label: 'Combo x5' },
  { id: 'survive30',  label: 'Survive 30s' },
  { id: 'survive60',  label: 'Survive 60s' },
  { id: 'bounce5',    label: '5 bounces, one run' },
  { id: 'orb10',      label: '10 orbs, one run' },
  { id: 'score500',   label: 'Score 500' },
  { id: 'score1000',  label: 'Score 1000' },
  { id: 'powerup',    label: 'Grab a powerup' },
  { id: 'volatile',   label: 'Detonate a volatile orb' },
  { id: 'mystery',    label: 'Open a mystery orb' },
];
let ach = {};
try { ach = JSON.parse(store.get('gd_ach') || '{}') || {}; } catch (e) { ach = {}; }
function updateAchLine() {
  const el = $('ach-line');
  if (el) el.textContent = 'TROPHIES ' + Object.keys(ach).length + '/' + ACHS.length;
}
function unlockAch(id) {
  if (ach[id]) return;
  ach[id] = true;
  store.set('gd_ach', JSON.stringify(ach));
  const def = ACHS.find(a => a.id === id);
  floater(W / 2, H * 0.36, 'TROPHY: ' + (def ? def.label : id), '#ffd94d');
  SFX.fanfare();
  updateAchLine();
}

// ---------- Combo multiplier ----------
function feedCombo() {
  combo++;
  comboT = 4.0;
  const nm = 1 + Math.min(4, Math.floor(combo / 3));
  if (nm > mult) {
    mult = nm;
    career.bestMult = Math.max(career.bestMult, mult);
    floater(px, py - 66, 'COMBO x' + mult, '#ff9d2e');
    SFX.power();
    buzz([15, 40, 15]);
    if (mult === 3) unlockAch('combo3');
    if (mult === 5) unlockAch('combo5');
  }
  renderCombo();
}
function renderCombo() {
  if (mult > 1 && comboT > 0) {
    comboEl.style.display = 'block';
    comboTxt.textContent = 'COMBO x' + mult;
    comboBar.style.width = Math.max(0, comboT / 4 * 100) + '%';
  } else {
    comboEl.style.display = 'none';
  }
}

// ---------- PERFECT precision bonuses ----------
function perfectBonus(label) {
  feedCombo();
  const pts = 25 * mult * scoreMult();
  score += pts;
  setScore(score);
  floater(px, py - 70, 'PERFECT ' + label + ' +' + pts, '#ffd94d');
  SFX.power();
  buzz([20, 20, 20]);
}

// ---------- Ghost pace: live ahead/behind vs your best run ----------
function bestScoreAt(t) {
  if (!bestCurve || !bestCurve.length) return null;
  let s = 0;
  for (let i = 0; i < bestCurve.length; i++) {
    if (bestCurve[i][0] <= t) s = bestCurve[i][1];
    else break;
  }
  return s;
}

// ---------- Input ----------
function onPress(e) {
  if (e && e.cancelable) e.preventDefault();
  audio(); // unlock audio on first gesture
  if (paused) return;
  if (state === 'menu') { startGame(); return; }
  if (state === 'playing') { doFlip(); return; }
  // 'dying' / 'over' handled by overlay buttons
}
canvas.addEventListener('pointerdown', onPress);
menu.addEventListener('pointerdown', e => {
  // tap-anywhere to start, but let the buttons handle their own taps
  if (e.target.closest && e.target.closest('button')) return;
  e.preventDefault(); SFX.click(); startGame();
});
$('start-btn').addEventListener('click', e => { e.stopPropagation(); startGame(); });
document.querySelectorAll('#mode-row .sel-btn').forEach(b => {
  b.addEventListener('click', e => { e.stopPropagation(); setMode(b.dataset.mode); });
});
$('theme-prev').addEventListener('click', e => { e.stopPropagation(); cycleTheme(-1); });
function toMenu() {
  SFX.click();
  state = 'menu';
  paused = false;
  $('pause-btn').classList.add('hidden');
  gameoverEl.classList.add('hidden');
  hud.classList.add('hidden');
  menu.classList.remove('hidden');
  loadBest();
  renderRival();
  updateAchLine();
  renderStats();
  renderSkin();
}
$('menu-btn').addEventListener('click', e => { e.stopPropagation(); toMenu(); });
$('skin-prev').addEventListener('click', e => { e.stopPropagation(); cycleSkin(-1); });
$('skin-next').addEventListener('click', e => { e.stopPropagation(); cycleSkin(1); });
$('help-btn').addEventListener('click', e => { e.stopPropagation(); SFX.click(); $('help').classList.remove('hidden'); });
$('help-btn2').addEventListener('click', e => { e.stopPropagation(); SFX.click(); $('help').classList.remove('hidden'); });
$('help-close').addEventListener('click', e => { e.stopPropagation(); SFX.click(); $('help').classList.add('hidden'); });
function setMode(m) {
  if (!MODES[m]) return;
  if (m !== mode) {
    mode = m;
    store.set('gd_mode', m);
    SFX.click();
  }
  loadBest();
  document.querySelectorAll('#mode-row .sel-btn').forEach(b => b.classList.toggle('sel', b.dataset.mode === mode));
}
gameoverEl.addEventListener('pointerdown', e => {
  // tap-anywhere to retry, but let the buttons handle their own taps —
  // otherwise SHARE would restart the game before its click fires
  if (e.target.closest && e.target.closest('button')) return;
  e.preventDefault();
  startGame();
});
$('retry-btn').addEventListener('click', e => { e.stopPropagation(); startGame(); });
$('share-btn').addEventListener('click', e => { e.stopPropagation(); shareScore(); });
$('resume-btn').addEventListener('click', () => togglePause(false));
$('restart-btn').addEventListener('click', () => { togglePause(false); startGame(); });
$('quit-btn').addEventListener('click', () => { togglePause(false); toMenu(); });
$('pause-btn').addEventListener('click', () => togglePause());
muteBtn.addEventListener('click', e => { e.stopPropagation(); toggleMute(); });
document.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { onPress(e); }
  else if (e.code === 'KeyM') toggleMute();
  else if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'playing') togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing' && !paused) togglePause(true);
});

function toggleMute() {
  muted = !muted;
  store.set('gd_mute', muted ? '1' : '0');
  muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  muteBtn.classList.toggle('off', muted);
  if (muted) Music.stop();
  else if (state === 'playing' && !paused) Music.start();
  if (!muted) SFX.click();
}
function togglePause(force) {
  paused = typeof force === 'boolean' ? force : !paused;
  pausedEl.classList.toggle('hidden', !paused);
  if (paused) { if (AC) AC.suspend(); }  // freezes AC clock: music resumes seamlessly
  else { audio(); lastT = performance.now(); } // avoid dt jump
}

// ---------- Spawner: patterns ----------
// Every pattern spawns ahead of the player. The spawner tracks energy and
// NEVER emits an unavoidable pattern when the player couldn't afford the
// flips to survive it. That's the fairness contract of the game.
function surfY(s) { return s === 'floor' ? floorY : ceilY; }
function playerSurf() { return grav === 1 ? 'floor' : 'ceil'; }
function oppSurf() { return grav === 1 ? 'ceil' : 'floor'; }

function addSpike(x, s, tag) {
  const w = 36, h = 54;
  obstacles.push({
    kind: 'spike', x, y: s === 'floor' ? floorY - h : ceilY,
    w, h, minClear: Infinity, counted: false, tag: tag || null,
  });
}
function addWall(x, s) { // tall block hugging a surface — must be on the other one
  const w = 58, h = Math.round(gapH * 0.62);
  obstacles.push({
    kind: 'wall', x, y: s === 'floor' ? floorY - h : ceilY,
    w, h, minClear: Infinity, counted: false,
  });
}
function addOrb(x, y) {
  orbs.push({ x, y, r: 11, taken: false, ph: Math.random() * 6.28, mystery: Math.random() < 0.07 });
}
function addGate(x) {
  // Two amber walls leaving a generous middle window — flip THROUGH it
  // mid-air. Window sized so the pass is always possible: the mid-gap
  // flight window (~0.22s) must exceed the gate crossing time.
  const wh = Math.round(gapH * 0.22), w = 48;
  obstacles.push({ kind: 'gate', x, y: floorY - wh, w, h: wh, minClear: Infinity, counted: false, gateTop: true });
  obstacles.push({ kind: 'gate', x, y: ceilY, w, h: wh, minClear: Infinity, counted: false });
}
function addDrifter(x) {
  // a spiked mine hovering mid-gap, oscillating vertically — time your pass
  const s = 46;
  obstacles.push({
    kind: 'drifter', x, y: (floorY + ceilY) / 2 - s / 2, w: s, h: s,
    ph: Math.random() * 6.28, minClear: Infinity, counted: false,
  });
}
function addPad(x, y) {
  // friendly mid-air platform: touch it mid-flip and bounce back home
  pads.push({ x: x - 48, y: y - 7, w: 96, h: 14, ph: Math.random() * 6.28 });
}
function gapAfter() { return speed * rand(0.50, 0.80); } // time-based spacing

// pattern fns: each takes x, emits entities, returns footprint width
function patMustSpike(x) {
  const s = playerSurf();
  addSpike(x, s);
  if (mode === 'greed' && Math.random() < 0.6) addSpike(x + 130, s); // greed: denser
  consecCost++; return 120;
}
function patFreeSpike(x) {
  const s = oppSurf();
  addSpike(x, s);
  if (mode === 'greed' && Math.random() < 0.6) addSpike(x + 130, s); // greed: denser
  consecCost = 0; return 120;
}
function patWall(x)        { addWall(x, playerSurf()); consecCost++; return 150; }
function patDouble(x)      { addSpike(x, 'floor'); addSpike(x, 'ceil'); consecCost++; return 140; }
function patGate(x)        { addGate(x); consecCost++; return 170; }
function patStairs(x) {
  // Two spikes, one per surface: dodge the first, and the second sits
  // exactly where you land — a forced double-flip rhythm test (costs 2).
  // Landing time after a flip: 1500t^2 + 560t = gapH.
  const s1 = playerSurf(), s2 = oppSurf();
  addSpike(x, s1, 'stairs');
  const tLand = (-CFG.flipLaunch + Math.sqrt(CFG.flipLaunch * CFG.flipLaunch + 2 * CFG.gravity * gapH)) / CFG.gravity;
  addSpike(x + speed * tLand + 130, s2, 'stairs');
  consecCost += 2; return 340;
}
function patDrifter(x)     { addDrifter(x); consecCost++; return 150; }
function patHop(x) {
  // spike on your rail with a bounce pad floating above it:
  // flip, kiss the pad, and land back home — hop OVER the spike
  // without ever visiting the other side
  const sx = x + 130;
  addSpike(sx, playerSurf());
  addPad(sx, (floorY + ceilY) / 2);
  consecCost++; return 300;
}
function patPowerup(x) {
  // rare floating pickup: shield / magnet / overdrive / chrono — always optional
  const kinds = ['shield', 'magnet', 'overdrive', 'chrono'];
  const kind = kinds[(Math.random() * kinds.length) | 0];
  powerups.push({
    x: x + 110, y: (floorY + ceilY) / 2 + rand(-70, 70),
    r: 20, kind, taken: false, ph: Math.random() * 6.28,
  });
  return 230;
}
function patVolatile(x) {
  // a gate with a volatile orb floating in its window: thread the gate,
  // grab the orb, and vaporize the whole thing — or just thread it normal
  addGate(x);
  orbs.push({
    x: x + 60, y: (floorY + ceilY) / 2, r: 13,
    taken: false, ph: Math.random() * 6.28, volatile: true,
  });
  consecCost++; return 290;
}
function addPiston(x, rail) {
  obstacles.push({ kind: 'piston', x, w: 34, rail, ext: 0, h: 0, y: 0, minClear: Infinity, counted: false, tag: 'must' });
}
function patPiston(x) {
  // piston spikes slide out of your rail with a warning shimmer — read it and flip
  const s = playerSurf();
  addPiston(x + 90, s);
  if (Math.random() < 0.5) addPiston(x + 260, s);
  consecCost++; return 320;
}
function patOrbArc(x) {
  const from = playerSurf(), y0 = surfY(from), y1 = surfY(oppSurf());
  const dir0 = from === 'floor' ? -1 : 1, dir1 = -dir0;
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    addOrb(x + t * 200, lerp(y0 + dir0 * 36, y1 + dir1 * 36, smooth(t)));
  }
  consecCost = 0; return 260;
}
function patOrbLine(x) {
  const s = playerSurf(), y = surfY(s) + (s === 'floor' ? -36 : 36);
  for (let i = 0; i < 3; i++) addOrb(x + i * 52, y);
  consecCost = 0; return 210;
}
function patRest() { consecCost = 0; return 0; }

function choosePattern(x) {
  if (tutorial) {
    // scripted teaching beats: orb line, then a spike to dodge, calm otherwise
    if (tutStage === 1 && !tutOrbSpawned) { tutOrbSpawned = true; return patOrbLine(x); }
    if (tutStage === 2 && !tutSpikeSpawned) { tutSpikeSpawned = true; return patMustSpike(x); }
    return patRest();
  }
  const r = Math.random();
  const canAfford = energy > 1 && consecCost < 2;
  if (!canAfford) {
    // Mercy rule: only patterns survivable with zero flips.
    if (r < 0.42) return patFreeSpike(x);
    if (r < 0.78) return patOrbLine(x);
    return patRest();
  }
  if (r < 0.18) return patMustSpike(x);
  if (r < 0.31) return patFreeSpike(x);
  if (r < 0.39) return patWall(x);
  if (r < 0.46 && elapsed > 15) return patDouble(x);
  if (r < 0.55 && elapsed > 20) return patGate(x);
  if (r < 0.63 && elapsed > 30) return patStairs(x);
  if (r < 0.70 && elapsed > 40) return patDrifter(x);
  if (r < 0.78 && elapsed > 15) return patHop(x);
  if (r < 0.84 && elapsed > 25) return patPowerup(x);
  if (r < 0.89 && elapsed > 35) return patVolatile(x);
  if (r < 0.95 && elapsed > 50) return patPiston(x);
  if (r < 0.99) return patOrbArc(x);
  return patRest();
}

// ---------- Game flow ----------
function startGame() {
  if (skinLocked()) {
    // locked skin selected — the game stays locked until it's earned
    SFX.deny();
    buzz([60, 40, 60]);
    renderSkin();
    return;
  }
  SFX.click();
  // apply the selected challenge mode
  const M = MODES[mode];
  CFG.energyMax = M.energyMax; CFG.accel = M.accel;
  CFG.maxSpeed = M.maxSpeed; CFG.orbScore = M.orbScore;
  blitzLeft = 60; endTitle = 'OUT OF MOVES'; rushT = 0;
  lastTimerShown = '';
  grav = 1; px = Math.max(90, W * 0.30); py = floorY - CFG.playerR; vy = 0;
  onSurface = true;
  energy = Math.min(CFG.energyStart, CFG.energyMax);
  score = 0; elapsed = 0; speed = CFG.baseSpeed;
  flips = 0; orbsGot = 0; nearCount = 0;
  shake = 0; denyFlash = 0;
  obstacles = []; orbs = []; pads = []; powerups = []; particles = []; floaters = []; trail = []; waves = []; meteors = [];
  spawnX = W + 420; consecCost = 0;
  state = 'playing'; paused = false;
  menu.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  hud.classList.remove('hidden');
  $('pause-btn').classList.remove('hidden');
  $('share-note').classList.add('hidden');
  renderPips(); setScore(0); refreshBest();
  lastTimerShown = ''; timerEl.textContent = '0:00';
  paceEl.style.display = 'none';
  combo = 0; comboT = 0; mult = 1; renderCombo();
  fxEl.style.display = 'none';
  runCurve = []; lastCurveSample = 0; bouncesThisRun = 0;
  nextMilestone = 0; rivalBeaten = false; deathCause = null;
  tutorial = !store.get('gd_tutorial') && mode !== 'blitz';
  tutStage = 0; tutStageT = 0; tutOrbSpawned = false; tutSpikeSpawned = false;
  renderTut();
  slowmoT = 0; freezeT = 0; flash = 0;
  shield = false; magnetT = 0; surgeT = 0; invulnT = 0; chronoT = 0;
  eventSurgeT = 0; surgeWarnT = 0; nextSurgeAt = 45;
  career.runs++;
  lastT = performance.now();
  Music.start();
}

function doFlip() {
  if (energy <= 0) {
    denyFlash = 0.6; shake = Math.max(shake, 5);
    SFX.deny();
    floater(px, py - 44, 'NO FLIPS', '#ff5e7a');
    return;
  }
  energy--;
  flipFrom = grav; // remember where we came from — a bounce pad sends us back
  grav *= -1;
  vy = grav * CFG.flipLaunch; // launch toward the new surface
  onSurface = false;
  flips++;
  career.flips++;
  unlockAch('firstflip');
  shake = Math.max(shake, 3);
  waves.push({ x: px, y: py, r: CFG.playerR, life: 1 });
  for (let i = 0; i < 10; i++) {
    particles.push({
      x: px + rand(-10, 10), y: py + rand(-10, 10),
      vx: rand(-160, 60), vy: rand(-160, 160),
      life: rand(0.25, 0.55), max: 0.55, size: rand(2, 5),
      color: grav === 1 ? '#00e5ff' : '#ff4dd2',
    });
  }
  SFX.flip();
  buzz(12);
  renderPips();
}

function mysteryOrb(o) {
  o.taken = true;
  orbsGot++;
  feedCombo();
  unlockAch('mystery');
  const r = Math.random();
  waves.push({ x: o.x, y: o.y, r: 6, life: 0.7 });
  if (r < 0.35) {
    const pts = 50 * mult * scoreMult();
    score += pts; setScore(score);
    floater(o.x, o.y - 18, 'MYSTERY +' + pts, '#c77dff');
  } else if (r < 0.60) {
    energy = CFG.energyMax; renderPips();
    floater(o.x, o.y - 18, 'MYSTERY: ENERGY FULL', '#c77dff');
  } else if (r < 0.85) {
    const k = ['shield', 'magnet', 'overdrive'][Math.floor(Math.random() * 3)];
    if (k === 'shield') { shield = true; floater(o.x, o.y - 18, 'MYSTERY: SHIELD!', '#c77dff'); }
    else if (k === 'magnet') { magnetT = 8; floater(o.x, o.y - 18, 'MYSTERY: MAGNET!', '#c77dff'); }
    else { surgeT = 10; floater(o.x, o.y - 18, 'MYSTERY: OVERDRIVE!', '#c77dff'); }
    fxStatus();
  } else {
    const pts = 150 * mult * scoreMult();
    score += pts; setScore(score);
    floater(o.x, o.y - 18, 'JACKPOT +' + pts, '#ffd94d');
  }
  SFX.power();
  buzz([20, 40, 20]);
  renderPips();
}
function collectOrb(o) {
  o.taken = true;
  energy = Math.min(CFG.energyMax, energy + 1);
  orbsGot++;
  feedCombo();
  const pts = CFG.orbScore * mult * scoreMult();
  score += pts;
  setScore(score);
  floater(o.x, o.y - 18, '+' + pts, '#ffd94d');
  waves.push({ x: o.x, y: o.y, r: 6, life: 0.7 }); // collect pulse
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: o.x, y: o.y, vx: rand(-140, 140), vy: rand(-140, 140),
      life: rand(0.2, 0.45), max: 0.45, size: rand(2, 4), color: '#ffd94d',
    });
  }
  if (orbsGot >= 10) unlockAch('orb10');
  if (orbsGot % 8 === 0) startRush(); // every 8 orbs: gold rush
  SFX.orb();
  renderPips();
  fxStatus();
}

function nearMiss(ob) {
  nearCount++;
  feedCombo();
  const pts = CFG.nearScore * mult * scoreMult();
  score += pts;
  setScore(score);
  floater(px + 10, py - 40, 'CLOSE +' + pts, '#7dff9a');
  SFX.near();
  if (slowmoT < 0.15) slowmoT = 0.35; // brief slow-mo on close calls
}

function bouncePad(pd) {
  // trampoline: cancel the flip, fling back toward the side we came from
  grav = flipFrom;
  vy = flipFrom * CFG.flipLaunch;
  onSurface = false;
  feedCombo();
  const isPerfect = Math.abs(px - (pd.x + pd.w / 2)) < 16;
  const pts = (isPerfect ? 25 : 5) * mult * scoreMult();
  score += pts;
  setScore(score);
  floater(px, py - 42, (isPerfect ? 'PERFECT BOUNCE +' : 'BOUNCE +') + pts, isPerfect ? '#ffd94d' : '#7dff9a');
  if (isPerfect) { SFX.power(); buzz([20, 20, 20]); }
  bouncesThisRun++;
  if (bouncesThisRun >= 5) unlockAch('bounce5');
  waves.push({ x: px, y: py, r: CFG.playerR, life: 1 });
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: px + rand(-8, 8), y: pd.y + pd.h / 2,
      vx: rand(-220, 220), vy: rand(-180, 180),
      life: rand(0.25, 0.5), max: 0.5, size: rand(2, 5),
      color: ['#7df9ff', '#ffffff'][i % 2],
    });
  }
  shake = Math.max(shake, 4);
  SFX.boing();
}

function checkPadCollision() {
  const pr = CFG.playerR - 3;
  for (const pd of pads) {
    if (px + pr > pd.x && px - pr < pd.x + pd.w && py + pr > pd.y && py - pr < pd.y + pd.h) {
      bouncePad(pd);
      break;
    }
  }
}

function die(cause) {
  if (state !== 'playing') return;
  deathCause = cause || null;
  if (cause) {
    deathStats[cause] = (deathStats[cause] || 0) + 1;
    try { store.set('gd_deaths', JSON.stringify(deathStats)); } catch (e) {}
  }
  renderTut(); // hide tutorial banner
  state = 'dying'; deathT = 0;
  shake = 22;
  freezeT = 0.12;  // freeze-frame beat before the explosion settles
  flash = 0.55;    // white flash
  SFX.death();
  buzz([60, 40, 80]);
  for (let i = 0; i < 70; i++) {
    particles.push({
      x: px, y: py, vx: rand(-380, 380), vy: rand(-380, 380),
      life: rand(0.4, 1.0), max: 1.0, size: rand(2, 8),
      color: ['#00e5ff', '#ff4dd2', '#ffffff', '#ffd94d'][i % 4],
    });
  }
  waves.push({ x: px, y: py, r: 10, life: 1 });
  waves.push({ x: px, y: py, r: 4, life: 1 });
}

function showGameOver() {
  state = 'over';
  $('pause-btn').classList.add('hidden');
  const fs = Math.floor(score);
  const gt = $('go-title');
  if (gt) gt.textContent = endTitle;
  const isBest = fs > best;
  if (isBest) {
    best = fs;
    store.set(bestKey(), String(best));
    bestCurve = runCurve.slice(); // ghost for future runs to chase
    store.set(curveKey(), JSON.stringify(bestCurve));
  }
  career.time += elapsed;
  const oldTitle = titleFor(career.xp || 0);
  career.xp = (career.xp || 0) + fs;
  const newTitle = titleFor(career.xp);
  store.set('gd_career', JSON.stringify(career));
  if (newTitle !== oldTitle) {
    floater(W / 2, H * 0.42, 'NEW TITLE: ' + newTitle, '#c77dff');
    SFX.fanfare();
  }
  // run history: last 5 runs, newest first
  let runs = [];
  try { runs = JSON.parse(store.get('gd_runs') || '[]'); } catch (e) { runs = []; }
  if (!Array.isArray(runs)) runs = [];
  runs.unshift({ s: fs, t: Math.floor(elapsed), m: mode });
  runs = runs.slice(0, 5);
  store.set('gd_runs', JSON.stringify(runs));
  const rh = $('run-history');
  if (rh) {
    rh.innerHTML = '<div class="rh-title">RECENT RUNS</div>' + runs.map((r, i) =>
      '<div class="rh-row' + (i === 0 ? ' rh-new' : '') + '"><span>' + r.s +
      '</span><span>' + (MODES[r.m] ? MODES[r.m].label : 'CLASSIC') + ' · ' + fmtDur(r.t) + '</span></div>').join('');
  }
  if (isBest) {
    // new best? confetti eruption.
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: rand(0, W), y: rand(-40, H * 0.3),
        vx: rand(-60, 60), vy: rand(40, 220),
        life: rand(1.2, 2.4), max: 2.4, size: rand(4, 8),
        color: ['#00e5ff', '#ff4dd2', '#ffd94d', '#7dff9a', '#ff9d2e'][i % 5],
        confetti: true,
      });
    }
    SFX.fanfare();
  }
  $('final-score').textContent = fs;
  $('newbest').classList.toggle('hidden', !isBest);
  $('st-time').textContent = Math.floor(elapsed) + 's';
  $('st-flips').textContent = flips;
  $('st-orbs').textContent = orbsGot;
  $('st-near').textContent = nearCount;
  const dtip = $('death-tip');
  if (dtip) dtip.textContent = DEATH_TIPS[deathCause] || 'Grab gold orbs to keep your flip energy up.';
  refreshBest();
  hud.classList.add('hidden');
  gameoverEl.classList.remove('hidden');
}

function shareScore() {
  const fs = Math.floor(score);
  const url = location.origin + location.pathname + '?score=' + fs + '&mode=' + mode;
  const txt = 'I scored ' + fs + ' in ORBITAL (' + MODES[mode].label + ') — every flip costs. Beat me: ' + url;
  const done = () => {
    const n = $('share-note');
    n.classList.remove('hidden');
    setTimeout(() => n.classList.add('hidden'), 2200);
  };
  if (navigator.share) {
    navigator.share({ title: 'ORBITAL', text: txt, url }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(done);
  } else { done(); }
  SFX.click();
}

// ---------- Collision helpers ----------
function shrunkRect(ob) {
  const s = CFG.hitShrink;
  return { x: ob.x + s, y: ob.y + s, w: Math.max(4, ob.w - s * 2), h: Math.max(4, ob.h - s * 2) };
}
function circleRectDist(cx, cy, r) {
  const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w));
  const dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
  return Math.hypot(dx, dy);
}

// ---------- Background ----------
function buildStars() {
  stars = [];
  const n = Math.round(clamp(W * H / 9000, 60, 160));
  for (let i = 0; i < n; i++) {
    const layer = Math.random();
    stars.push({
      x: Math.random() * W, y: Math.random() * H,
      par: layer < 0.4 ? 0.12 : layer < 0.75 ? 0.3 : 0.55,
      size: layer < 0.4 ? 1 : layer < 0.75 ? 1.6 : 2.4,
      tw: Math.random() * 6.28,
    });
  }
}

// ---------- Update ----------
function updateFx(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.confetti ? 260 : 500) * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) { f.y -= 46 * dt; f.life -= dt * 1.4; }
  floaters = floaters.filter(f => f.life > 0);
  for (const wv of waves) { wv.r += 420 * dt; wv.life -= dt * 2.4; }
  waves = waves.filter(w => w.life > 0);
  for (const m of meteors) { m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt; }
  meteors = meteors.filter(m => m.life > 0 && m.x > -200 && m.y < H + 200);
}

function update(dt) {
  elapsed += dt;
  speed = Math.min(CFG.maxSpeed, CFG.baseSpeed + elapsed * CFG.speedRamp);
  railOff -= speed * dt;
  shake = Math.max(0, shake - dt * 34);
  denyFlash = Math.max(0, denyFlash - dt);

  // --- player physics ---
  vy += grav * CFG.gravity * dt;
  py += vy * dt;
  if (grav === 1 && py >= floorY - CFG.playerR) {
    py = floorY - CFG.playerR; vy = 0; onSurface = true;
  } else if (grav === -1 && py <= ceilY + CFG.playerR) {
    py = ceilY + CFG.playerR; vy = 0; onSurface = true;
  } else if ((grav === 1 && py < floorY - CFG.playerR - 2) || (grav === -1 && py > ceilY + CFG.playerR + 2)) {
    onSurface = false;
  }

  // trail — each skin leaves its own signature
  const skId = skin().id;
  const th = theme();
  const pcol = grav === 1 ? th.down : th.up;
  if (skId === 'comet') {
    trail.push({ x: px + rand(-6, 6), y: py + rand(-6, 6), life: 1, k: 'dot', c: Math.random() < 0.5 ? '#ffb02e' : '#ff5a2e' });
    trail.push({ x: px + rand(-6, 6), y: py + rand(-6, 6), life: 1, k: 'dot', c: '#ffe08a' });
  } else if (skId === 'lava') {
    trail.push({ x: px + rand(-8, 8), y: py + rand(-8, 8), life: 1, k: 'ember', c: '#ff7a2e', vx: rand(-30, 30), vy: rand(-70, -20) });
  } else if (skId === 'frost') {
    trail.push({ x: px + rand(-6, 6), y: py + rand(-6, 6), life: 1, k: 'spark', c: '#d8f6ff' });
  } else if (skId === 'eclipse') {
    trail.push({ x: px + rand(-7, 7), y: py + rand(-7, 7), life: 1, k: 'wisp', c: '#b28dff' });
  } else if (skId === 'terra') {
    trail.push({ x: px + rand(-6, 6), y: py + rand(-6, 6), life: 1, k: 'dot', c: Math.random() < 0.5 ? '#2e9bff' : '#3ddc78' });
  } else if (skId === 'ring') {
    trail.push({ x: px + rand(-6, 6), y: py + rand(-6, 6), life: 1, k: 'ring', c: pcol });
  } else {
    trail.push({ x: px, y: py, life: 1, k: 'dot', c: pcol });
  }
  const trailCap = skId === 'comet' ? 46 : 30;
  if (trail.length > trailCap) trail.shift();
  for (const t of trail) {
    t.life -= dt * 3.2;
    if (t.vx) { t.x += t.vx * dt; t.y += t.vy * dt; }
  }

  // --- spawner (warmup: nothing for the first 3 seconds) ---
  if (elapsed > 3) {
    // The spawn cursor lives in world space, so it must drift left
    // with everything else — otherwise the pipeline runs dry after
    // the first burst and the screen goes empty forever.
    spawnX -= speed * dt;
    while (spawnX < W + 1300) {
      const w = choosePattern(spawnX);
      spawnX += w + gapAfter();
    }
  }

  // --- move world left ---
  const dx = speed * speedMult() * dt;
  const midY = (floorY + ceilY) / 2;
  for (const ob of obstacles) {
    ob.x -= dx;
    if (ob.kind === 'drifter') {
      // hover mid-gap, oscillating wide — at extremes it grazes the rails,
      // so you must read its swing and time your pass (or flip away)
      ob.y = midY - ob.h / 2 + Math.sin(elapsed * 3.1 + ob.ph) * gapH * 0.44;
    }
    if (ob.kind === 'piston') {
      // slide out of the rail as you approach, retract once passed
      const target = (ob.x + ob.w > px - 20 && ob.x - px < 320) ? 1 : 0;
      ob.ext += (target - ob.ext) * Math.min(1, dt * 7);
      if (target === 0 && ob.ext < 0.02) ob.ext = 0;
      ob.h = 54 * ob.ext;
      ob.y = ob.rail === 'floor' ? floorY - ob.h : ceilY;
      ob.warn = target === 1 && ob.ext < 0.9;
    }
    // near-miss tracking: closest approach of the forgiving hitbox
    if (!ob.counted && px > ob.x - 90 && px < ob.x + ob.w + 90) {
      const d = circleRectDist(px, py, shrunkRect(ob));
      if (d < ob.minClear) ob.minClear = d;
    }
    if (!ob.counted && ob.x + ob.w < px - CFG.playerR * 2) {
      ob.counted = true;
      if (ob.kind === 'gate') {
        unlockAch('firstgate');
        if (ob.gateTop && Math.abs(py - midY) < 14) perfectBonus('GATE');
      }
      if (ob.minClear < CFG.nearDist) nearMiss(ob);
    }
  }
  for (const o of orbs) {
    o.x -= dx; o.ph += dt * 5;
    if (!o.taken) {
      const d = Math.hypot(px - o.x, py - o.y);
      if (d < CFG.playerR + o.r + 6) {
        if (o.mystery) mysteryOrb(o);
        else if (o.volatile) detonateOrb(o);
        else collectOrb(o);
      }
    }
  }
  obstacles = obstacles.filter(o => o.x + o.w > -120 && !(o.counted && o.x + o.w < -40));
  orbs = orbs.filter(o => o.x > -60 && !o.taken);
  for (const pd of pads) pd.x -= dx;
  pads = pads.filter(pd => pd.x + pd.w > -100);
  for (const p of powerups) { p.x -= dx; p.ph += dt * 3; }
  powerups = powerups.filter(p => p.x > -80 && !p.taken);

  // --- powerup timers ---
  if (magnetT > 0) {
    magnetT -= dt;
    for (const o of orbs) {
      if (o.taken) continue;
      const mx = px - o.x, my = py - o.y;
      const d = Math.hypot(mx, my);
      if (d < 300 && d > 1) {
        const pull = 900 * dt;
        o.x += mx / d * pull;
        o.y += my / d * pull;
      }
    }
  }
  if (surgeT > 0) surgeT -= dt;
  if (invulnT > 0) invulnT -= dt;
  if (rushT > 0) rushT -= dt;
  if (chronoT > 0) { chronoT -= dt; slowmoT = Math.max(slowmoT, 0.25); }

  // --- timed surge events: warning, then 10s of 2x chaos ---
  if (eventSurgeT <= 0 && surgeWarnT <= 0 && elapsed >= nextSurgeAt) {
    surgeWarnT = 3;
    floater(W / 2, H * 0.3, 'SURGE INCOMING', '#ff4d6d');
    SFX.warn();
  }
  if (surgeWarnT > 0) {
    surgeWarnT -= dt;
    if (surgeWarnT <= 0) {
      eventSurgeT = 10;
      floater(W / 2, H * 0.3, 'SURGE x2', '#ff4d6d');
      SFX.power();
      buzz([25, 25, 25]);
    }
  }
  if (eventSurgeT > 0) {
    eventSurgeT -= dt;
    if (eventSurgeT <= 0) nextSurgeAt = elapsed + 45;
    // meteor shower while the surge rages
    if (meteors.length < 12 && Math.random() < dt * 5) {
      meteors.push({
        x: rand(W * 0.3, W + 200), y: rand(-40, H * 0.35),
        vx: rand(-950, -650), vy: rand(280, 480), life: 1.6,
      });
    }
  }

  // --- bounce pads: mid-air contact sends you back to your side ---
  if (state === 'playing' && !onSurface) checkPadCollision();

  // --- powerup collection ---
  for (const p of powerups) {
    if (p.taken) continue;
    const dxp = p.x - px, dyp = p.y - py;
    if (dxp * dxp + dyp * dyp < (p.r + 17) * (p.r + 17)) collectPowerup(p);
  }

  // --- collisions (forgiving hitboxes; shield & brief invulnerability can save you) ---
  if (invulnT <= 0) {
    const pr = CFG.playerR - 3;
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      const r = shrunkRect(ob);
      if (px + pr > r.x && px - pr < r.x + r.w && py + pr > r.y && py - pr < r.y + r.h) {
        if (shield) { smashShield(ob, i); i--; }
        else { die(ob.kind); return; }
      }
    }
  }

  // --- fx ---
  updateFx(dt);

  // --- combo decay ---
  if (comboT > 0) {
    comboT -= dt;
    if (comboT <= 0) { combo = 0; mult = 1; }
    renderCombo();
  }

  // --- ghost curve sampling (for future pace comparisons) ---
  if (elapsed - lastCurveSample >= 0.5) {
    lastCurveSample = elapsed;
    if (runCurve.length < 1200) runCurve.push([Math.round(elapsed * 10) / 10, Math.floor(score)]);
  }

  // --- score: survive = points ---
  score += speed * dt * 0.02 * scoreMult();
  setScore(score);
  if (tutorial) tutAdvance(dt);
  // blitz: 60-second score attack, real-time countdown
  if (mode === 'blitz') {
    blitzLeft -= dt;
    if (blitzLeft <= 0) { blitzLeft = 0; endBlitz(); return; }
  }
  // milestones
  if (nextMilestone < MILESTONES.length && score >= MILESTONES[nextMilestone]) {
    floater(W / 2, H * 0.28, MILESTONES[nextMilestone] + '!', '#ffd94d');
    SFX.power();
    buzz([20, 20, 20]);
    nextMilestone++;
  }
  tickTimer();
}

function updateDying(dt) {
  deathT += dt;
  shake = Math.max(0, shake - dt * 22);
  updateFx(dt);
  if (deathT > 0.85) showGameOver();
}

// ---------- Render ----------
function drawBackground(t) {
  const th = theme();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.bg[0]);
  g.addColorStop(0.5, th.bg[1]);
  g.addColorStop(1, th.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // nebula blobs
  const blobs = [
    { x: W * 0.22, y: H * 0.3, r: Math.min(W, H) * 0.42, c: 'rgba(123,47,247,0.10)' },
    { x: W * 0.8, y: H * 0.72, r: Math.min(W, H) * 0.5, c: 'rgba(0,229,255,0.07)' },
    { x: W * 0.55, y: H * 0.1, r: Math.min(W, H) * 0.34, c: 'rgba(255,45,150,0.06)' },
  ];
  for (const b of blobs) {
    const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    rg.addColorStop(0, b.c); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }

  // stars (parallax drift)
  for (const s of stars) {
    const sx = (((s.x - elapsed * speed * s.par * 0.4) % W) + W) % W;
    const a = 0.35 + 0.3 * Math.sin(t * 2 + s.tw);
    ctx.globalAlpha = Math.max(0.08, a);
    ctx.fillStyle = '#cfe9ff';
    ctx.fillRect(sx, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
  // meteors streak by while a surge rages
  for (const m of meteors) {
    const a = Math.min(1, m.life);
    ctx.save();
    ctx.globalAlpha = 0.7 * a;
    ctx.strokeStyle = '#cfe9ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x - m.vx * 0.12, m.y - m.vy * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#9fdcff';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(m.x, m.y, 2.5, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawRails() {
  const drawRail = (y, color) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    // moving ticks for speed sensation
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    const tickGap = 46;
    let off = railOff % tickGap;
    ctx.beginPath();
    for (let x = off - tickGap; x < W + tickGap; x += tickGap) {
      ctx.moveTo(x, y - 7); ctx.lineTo(x + 14, y - 7);
    }
    ctx.stroke();
    ctx.restore();
  };
  drawRail(floorY, theme().floor);
  drawRail(ceilY, theme().ceil);
}

function drawOrbs(t) {
  for (const o of orbs) {
    const pulse = 1 + 0.16 * Math.sin(o.ph);
    ctx.save();
    if (o.mystery) {
      // mystery: violet ? orb — a little slot machine
      ctx.shadowColor = '#c77dff';
      ctx.shadowBlur = 22;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * pulse);
      g.addColorStop(0, '#f3e8ff');
      g.addColorStop(0.55, '#c77dff');
      g.addColorStop(1, 'rgba(199,125,255,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * pulse, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a0a4a';
      ctx.font = 'bold ' + Math.round(o.r * 1.3) + 'px Orbitron, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', o.x, o.y + 1);
    } else if (o.volatile) {
      // volatile: angry red-gold with a warning ring
      ctx.shadowColor = '#ff4d2e';
      ctx.shadowBlur = 22;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * pulse);
      g.addColorStop(0, '#fff0d8');
      g.addColorStop(0.55, '#ff7a2e');
      g.addColorStop(1, 'rgba(255,77,46,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * pulse, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,77,46,' + (0.5 + 0.4 * Math.sin(o.ph * 2)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * pulse + 7, 0, 6.2832); ctx.stroke();
    } else {
      ctx.shadowColor = '#ffd94d';
      ctx.shadowBlur = 18;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * pulse);
      g.addColorStop(0, '#fff6d8');
      g.addColorStop(0.55, '#ffd94d');
      g.addColorStop(1, 'rgba(255,157,46,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * pulse, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
}

function drawObstacles(t) {
  for (const ob of obstacles) {
    if (ob.kind === 'drifter') {
      // rotating spiked mine, ember-orange glow
      const cx = ob.x + ob.w / 2, cy = ob.y + ob.h / 2, R = ob.w / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 3.2 + ob.ph);
      ctx.shadowColor = '#ff7a2e';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#331104';
      ctx.strokeStyle = '#ff7a2e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const teeth = 8;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * 6.2832;
        const a2 = ((i + 0.5) / teeth) * 6.2832;
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.lineTo(Math.cos(a2) * R * 0.62, Math.sin(a2) * R * 0.62);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.34, 0, 6.2832); ctx.fill();
      ctx.restore();
      continue;
    }
    if (ob.kind === 'gate') {
      // amber gate wall — chevrons point at the safe middle window
      ctx.save();
      ctx.shadowColor = '#ffb02e';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(64,32,4,0.9)';
      ctx.strokeStyle = '#ffb02e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(ob.x, ob.y, ob.w, ob.h, 8);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,176,46,' + (0.55 + 0.3 * Math.sin(t * 6)).toFixed(3) + ')';
      const top = ob.y < H / 2; // ceiling gate points down, floor gate points up
      const ay = top ? ob.y + ob.h - 16 : ob.y + 16;
      const dir = top ? 1 : -1;
      for (let i = 0; i < 2; i++) {
        const yy = ay - dir * i * 14;
        ctx.beginPath();
        ctx.moveTo(ob.x + ob.w / 2 - 9, yy - dir * 6);
        ctx.lineTo(ob.x + ob.w / 2, yy + dir * 6);
        ctx.lineTo(ob.x + ob.w / 2 + 9, yy - dir * 6);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      continue;
    }
    if (ob.kind === 'piston') {
      const onFloor = ob.rail === 'floor';
      // warning shimmer at the rail while extending
      if (ob.warn) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 14);
        ctx.fillStyle = '#ff2e6d';
        ctx.shadowColor = '#ff2e6d'; ctx.shadowBlur = 16;
        if (onFloor) ctx.fillRect(ob.x - 8, floorY - 10, ob.w + 16, 10);
        else ctx.fillRect(ob.x - 8, ceilY, ob.w + 16, 10);
        ctx.restore();
      }
      if (ob.ext > 0.02) {
        // spike triangle growing out of the rail
        ctx.save();
        ctx.shadowColor = '#ff2e6d';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#2a0a14';
        ctx.strokeStyle = '#ff2e6d';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (onFloor) {
          ctx.moveTo(ob.x, ob.y + ob.h);
          ctx.lineTo(ob.x + ob.w / 2, ob.y);
          ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
        } else {
          ctx.moveTo(ob.x, ob.y);
          ctx.lineTo(ob.x + ob.w / 2, ob.y + ob.h);
          ctx.lineTo(ob.x + ob.w, ob.y);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      continue;
    }
    if (ob.kind === 'spike') {
      const onFloor = ob.y > H / 2;
      ctx.save();
      ctx.shadowColor = '#ff2e6d';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#2a0a14';
      ctx.strokeStyle = '#ff2e6d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (onFloor) {
        ctx.moveTo(ob.x, ob.y + ob.h);
        ctx.lineTo(ob.x + ob.w / 2, ob.y);
        ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
      } else {
        ctx.moveTo(ob.x, ob.y);
        ctx.lineTo(ob.x + ob.w / 2, ob.y + ob.h);
        ctx.lineTo(ob.x + ob.w, ob.y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else { // wall
      ctx.save();
      ctx.shadowColor = '#b14dff';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(60,16,96,0.9)';
      ctx.strokeStyle = '#b14dff';
      ctx.lineWidth = 2.5;
      const r = 8;
      ctx.beginPath();
      ctx.roundRect(ob.x, ob.y, ob.w, ob.h, r);
      ctx.fill(); ctx.stroke();
      // hazard stripes
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(177,77,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = ob.y + 14; y < ob.y + ob.h - 6; y += 18) {
        ctx.moveTo(ob.x + 6, y); ctx.lineTo(ob.x + ob.w - 6, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawPlayer(t) {
  if (state === 'menu') return; // player not placed yet
  const th = theme();
  const color = grav === 1 ? th.down : th.up;
  // trail
  for (const tr of trail) {
    if (tr.life <= 0) continue;
    const ta = Math.max(0, tr.life);
    if (tr.k === 'ember') {
      // lava: rising flickering embers
      ctx.globalAlpha = ta * (0.5 + 0.5 * Math.abs(Math.sin(t * 22 + tr.x)));
      ctx.fillStyle = tr.c || '#ff7a2e';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 3.5 * ta + 1, 0, 6.2832); ctx.fill();
    } else if (tr.k === 'spark') {
      // frost: tiny ice crystals
      ctx.globalAlpha = ta * 0.8;
      ctx.fillStyle = tr.c || '#d8f6ff';
      const ss = 4 * ta + 1;
      ctx.beginPath();
      ctx.moveTo(tr.x, tr.y - ss); ctx.lineTo(tr.x + ss * 0.35, tr.y);
      ctx.lineTo(tr.x, tr.y + ss); ctx.lineTo(tr.x - ss * 0.35, tr.y);
      ctx.closePath(); ctx.fill();
    } else if (tr.k === 'ring') {
      // ringed: fading mini saturn rings
      ctx.globalAlpha = ta * 0.5;
      ctx.strokeStyle = tr.c || color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(tr.x, tr.y, 6 * ta + 2, 3 * ta + 1, -0.5, 0, 6.2832); ctx.stroke();
    } else if (tr.k === 'wisp') {
      // eclipse: violet afterglow
      ctx.globalAlpha = ta * 0.4;
      ctx.fillStyle = tr.c || '#b28dff';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 6 * ta + 2, 0, 6.2832); ctx.fill();
    } else {
      // orb / terra / comet: fading dots
      ctx.globalAlpha = ta * 0.35;
      ctx.fillStyle = tr.c || color;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, CFG.playerR * ta * 0.9, 0, 6.2832); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (state === 'dying') return; // exploded
  const sk = skin().id;
  const pr = CFG.playerR;
  // invulnerability blink after a shield save
  if (invulnT > 0 && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.save();
  if (sk === 'eclipse') {
    // black hole with a violet corona
    ctx.shadowColor = '#b28dff'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#05050a';
    ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(178,141,255,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, pr + 4 + Math.sin(t * 5) * 2, 0, 6.2832); ctx.stroke();
  } else if (sk === 'terra') {
    // blue marble with drifting continents and an ice cap
    ctx.shadowColor = '#2e9bff'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#2e9bff';
    ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#3ddc78';
    const a1 = t * 0.8;
    ctx.beginPath(); ctx.ellipse(px + Math.cos(a1) * pr * 0.45, py + Math.sin(a1) * pr * 0.3, pr * 0.42, pr * 0.28, a1, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px - Math.cos(a1) * pr * 0.5, py - Math.sin(a1) * pr * 0.35, pr * 0.3, pr * 0.22, -a1, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(px, py - pr * 0.72, pr * 0.5, pr * 0.22, 0, 0, 6.2832); ctx.fill();
  } else if (sk === 'lava') {
    // molten core, pulsing
    ctx.shadowColor = '#ff5a2e'; ctx.shadowBlur = 26 + 10 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, '#ffe08a');
    g.addColorStop(0.5, '#ff5a2e');
    g.addColorStop(1, '#7a1a08');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
  } else if (sk === 'frost') {
    // ice world with twinkling sparkles
    ctx.shadowColor = '#bfefff'; ctx.shadowBlur = 24;
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#bfefff');
    g.addColorStop(1, '#5aa8d8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      const sa = t * 2 + i * 2.094;
      const sx = px + Math.cos(sa) * (pr + 6), sy = py + Math.sin(sa) * (pr + 6);
      const ss = 2.5 + 1.5 * Math.sin(t * 8 + i);
      ctx.beginPath();
      ctx.moveTo(sx, sy - ss); ctx.lineTo(sx + ss * 0.4, sy);
      ctx.lineTo(sx, sy + ss); ctx.lineTo(sx - ss * 0.4, sy);
      ctx.closePath(); ctx.fill();
    }
  } else {
    // ORB / COMET: classic glow core
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
  }
  // orbiting spark
  const a = t * 6;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(px + Math.cos(a) * (CFG.playerR + 7), py + Math.sin(a) * (CFG.playerR + 7), 3, 0, 6.2832);
  ctx.fill();
  // ringed skin: saturn ring
  if (sk === 'ring') {
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px, py, CFG.playerR + 10, CFG.playerR * 0.45, -0.5, 0, 6.2832); ctx.stroke();
  }
  // shield ring
  if (shield) {
    ctx.shadowColor = '#7df9ff';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(125,249,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, CFG.playerR + 12, 0, 6.2832); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPowerups(t) {
  const colors = { shield: '#7df9ff', magnet: '#ff5e7a', overdrive: '#ff9d2e', chrono: '#b28dff' };
  for (const p of powerups) {
    const bob = Math.sin(t * 3 + p.ph) * 6;
    const y = p.y + bob;
    const c = colors[p.kind] || '#fff';
    ctx.save();
    ctx.shadowColor = c;
    ctx.shadowBlur = 18;
    // halo
    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, y, p.r, 0, 6.2832); ctx.stroke();
    // icon
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
    if (p.kind === 'shield') {
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, y, p.r * 0.55, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, y, 3.5, 0, 6.2832); ctx.fill();
    } else if (p.kind === 'magnet') {
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(p.x, y - 2, 8, Math.PI * 0.1, Math.PI * 0.9, false); ctx.stroke();
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(p.x - 8, y - 2); ctx.lineTo(p.x - 8, y + 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x + 8, y - 2); ctx.lineTo(p.x + 8, y + 7); ctx.stroke();
    } else if (p.kind === 'chrono') {
      // clock face
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, y, p.r * 0.55, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x, y - p.r * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.r * 0.3, y + p.r * 0.15); ctx.stroke();
    } else { // overdrive: lightning bolt
      ctx.beginPath();
      ctx.moveTo(p.x + 3, y - 11);
      ctx.lineTo(p.x - 6, y + 2);
      ctx.lineTo(p.x - 1, y + 2);
      ctx.lineTo(p.x - 3, y + 11);
      ctx.lineTo(p.x + 6, y - 2);
      ctx.lineTo(p.x + 1, y - 2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

function drawPads(t) {
  for (const pd of pads) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 5 + pd.ph);
    ctx.save();
    // glowing bar
    ctx.shadowColor = '#7df9ff';
    ctx.shadowBlur = 16 * pulse;
    const g = ctx.createLinearGradient(pd.x, 0, pd.x + pd.w, 0);
    g.addColorStop(0, 'rgba(125,249,255,0.25)');
    g.addColorStop(0.5, '#eaffff');
    g.addColorStop(1, 'rgba(125,249,255,0.25)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(pd.x, pd.y, pd.w, pd.h, 7);
    ctx.fill();
    // chevrons above/below pointing away — it bounces you back
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(125,249,255,' + (0.5 + 0.35 * pulse).toFixed(3) + ')';
    const cx = pd.x + pd.w / 2;
    for (const s of [-1, 1]) {
      const yy = s === -1 ? pd.y - 10 : pd.y + pd.h + 10;
      ctx.beginPath();
      ctx.moveTo(cx - 8, yy + s * 5);
      ctx.lineTo(cx, yy - s * 5);
      ctx.lineTo(cx + 8, yy + s * 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

function drawFx() {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.max);
    if (p.confetti) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.max - p.life) * 7 + p.x);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
  for (const wv of waves) {
    ctx.globalAlpha = Math.max(0, wv.life) * 0.7;
    ctx.strokeStyle = grav === 1 ? '#ff4dd2' : '#00e5ff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(wv.x, wv.y, wv.r, 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = "700 17px Orbitron, monospace";
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color; ctx.shadowBlur = 10;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawVignette(t) {
  if (energy <= 2 && state === 'playing') {
    const a = 0.22 + 0.14 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.36, W/2, H/2, Math.max(W,H)*0.72);
    g.addColorStop(0, 'rgba(255,30,60,0)');
    g.addColorStop(1, 'rgba(255,30,60,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (denyFlash > 0) {
    ctx.fillStyle = 'rgba(255,46,109,' + (denyFlash * 0.25).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawHint(t) {
  if (state === 'playing' && flips === 0 && elapsed < 7) {
    ctx.save();
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 5);
    ctx.font = "700 20px Orbitron, monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 16;
    ctx.fillText('TAP TO FLIP', W / 2, H / 2 - 40);
    ctx.font = "500 13px 'Space Grotesk', sans-serif";
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8a8aa3';
    ctx.fillText('each flip costs 1 — grab orbs', W / 2, H / 2 - 12);
    ctx.restore();
  }
}

function drawSpeedLines() {
  if (speed < 620 || state === 'menu') return;
  const n = Math.min(14, Math.floor((speed - 620) / 28));
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#9fdcff';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const y = Math.random() * H;
    const x = Math.random() * W;
    const len = 60 + Math.random() * 120;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
  }
  ctx.restore();
}

function render(t) {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.6, rand(-shake, shake) * 0.6);
  drawBackground(t);
  drawSpeedLines();
  drawRails();
  drawOrbs(t);
  drawPowerups(t);
  drawObstacles(t);
  drawPads(t);
  drawFx();
  drawPlayer(t);
  drawHint(t);
  drawVignette(t);
  if (rushT > 0) {
    // gold rush: golden glow washing in from the edges
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(255,217,77,0)');
    g.addColorStop(1, 'rgba(255,180,40,' + (0.28 + 0.1 * Math.sin(t * 6)).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + flash.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------- Main loop ----------
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.05) dt = 0.05;   // clamp tab-switch jumps
  if (dt < 0) dt = 0;
  const rawDt = dt;
  if (paused) { render(now / 1000); return; }
  if (freezeT > 0) { freezeT -= rawDt; render(now / 1000); return; } // freeze-frame
  if (slowmoT > 0) { slowmoT -= rawDt; dt *= 0.45; }                 // slow-mo juice
  flash = Math.max(0, flash - rawDt * 2.4);
  if (state === 'playing') update(dt);
  else if (state === 'dying') updateDying(dt);
  else if (state === 'over') updateFx(dt); // confetti keeps falling on the game-over screen
  render(now / 1000);
}

// Read-only debug handle for automated QA (no gameplay effect).
window.__gd = {
  get state() { return state; },
  get elapsed() { return elapsed; },
  get energy() { return energy; },
  get grav() { return grav; },
  get onSurface() { return onSurface; },
  get px() { return px; },
  get speed() { return speed; },
  get mult() { return mult; },
  get combo() { return combo; },
  get slowmo() { return slowmoT; },
  get shield() { return shield; },
  get magnetT() { return magnetT; },
  get surgeT() { return surgeT; },
  get eventSurgeT() { return eventSurgeT; },
  get surgeWarnT() { return surgeWarnT; },
  get rivalBeaten() { return rivalBeaten; },
  get obstacles() {
    return obstacles.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, kind: o.kind, tag: o.tag || null }));
  },
  get orbs() {
    return orbs.map(o => ({ x: o.x, y: o.y, r: o.r, mystery: !!o.mystery, volatile: !!o.volatile }));
  },
};

// ---------- Career stats & play streak (persistent) ----------
function fmtDur(s) {
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function renderCareer() {
  const el = $('career-line');
  if (el) el.textContent = career.runs + ' RUNS · ' + career.flips + ' FLIPS · ' +
    fmtDur(career.time) + ' AIR TIME · BEST x' + career.bestMult;
  const tl = $('title-line');
  if (tl) tl.textContent = titleFor(career.xp || 0);
}
function bumpStreak() {
  const today = new Date().toDateString();
  let st = { count: 0, last: '' };
  try { st = Object.assign(st, JSON.parse(store.get('gd_streak') || '{}')); } catch (e) {}
  if (st.last !== today) {
    const yest = new Date(Date.now() - 864e5).toDateString();
    st.count = (st.last === yest) ? st.count + 1 : 1;
    st.last = today;
    store.set('gd_streak', JSON.stringify(st));
  }
  const el = $('streak-line');
  if (el) el.textContent = 'STREAK ' + st.count + (st.count === 1 ? ' DAY' : ' DAYS');
  return st.count;
}

// ---------- Boot ----------
muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
muteBtn.classList.toggle('off', muted);
resize();
renderPips();
loadBest();
updateAchLine();
renderCareer();
bumpStreak();
renderTheme();
renderSkin();
document.querySelectorAll('#mode-row .sel-btn').forEach(b => b.classList.toggle('sel', b.dataset.mode === mode));
renderRival();
renderStats();
setScore(0);
requestAnimationFrame(loop);

// ---------- Generative space music (procedural, zero assets) ----------
// Slow evolving pad (Am – F – C – G) + sparse pentatonic plucks through
// a feedback echo. Scheduled with a lookahead timer; pausing suspends
// the AudioContext, which freezes its clock, so music resumes seamlessly.
const Music = (() => {
  const CHORD_LEN = 8; // seconds per chord
  const CHORDS = [
    [110.00, 164.81, 220.00, 261.63, 246.94], // Am(add9)
    [ 87.31, 130.81, 174.61, 220.00, 329.63], // Fmaj7
    [130.81, 196.00, 261.63, 329.63, 293.66], // C(add9)
    [ 98.00, 146.83, 196.00, 246.94, 220.00], // G(add9)
  ];
  const PENTA = [440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
  let timer = null, padBus = null, delaySend = null, master = null;
  let nextChord = 0, nextArp = 0, chordIdx = 0, arpIdx = 2;

  function ensureGraph() {
    const c = audio(); if (!c) return false;
    if (master) return true;
    master = c.createGain(); master.gain.value = 0.5; master.connect(c.destination);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1050; lp.Q.value = 0.4;
    padBus = c.createGain(); padBus.gain.value = 0.5;
    padBus.connect(lp); lp.connect(master);
    const dly = c.createDelay(1.5); dly.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const wet = c.createGain(); wet.gain.value = 0.45;
    delaySend = c.createGain();
    delaySend.connect(dly); dly.connect(fb); fb.connect(dly);
    dly.connect(wet); wet.connect(master);
    return true;
  }

  function padChord(notes, t) {
    const c = AC;
    for (const f of notes) {
      for (const det of [-5, 5]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 2.5);
        g.gain.setValueAtTime(0.045, t + CHORD_LEN - 2);
        g.gain.linearRampToValueAtTime(0.0001, t + CHORD_LEN + 1.5);
        o.connect(g); g.connect(padBus);
        o.start(t); o.stop(t + CHORD_LEN + 2);
      }
    }
    const o = c.createOscillator(), g = c.createGain(); // sub root
    o.type = 'sine'; o.frequency.value = notes[0] / 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08, t + 2);
    g.gain.linearRampToValueAtTime(0.0001, t + CHORD_LEN + 1);
    o.connect(g); g.connect(padBus);
    o.start(t); o.stop(t + CHORD_LEN + 1.5);
  }

  function pluck(t) {
    const c = AC;
    arpIdx += (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.25 ? 2 : 1);
    arpIdx = clamp(arpIdx, 0, PENTA.length - 1);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = PENTA[arpIdx];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g); g.connect(master); g.connect(delaySend);
    o.start(t); o.stop(t + 1.6);
  }

  function schedule() {
    if (!AC || muted) return;
    const now = AC.currentTime;
    while (nextChord < now + 1.2) {
      padChord(CHORDS[chordIdx % CHORDS.length], Math.max(nextChord, now + 0.05));
      nextChord += CHORD_LEN;
      chordIdx++;
    }
    while (nextArp < now + 0.8) {
      if (Math.random() < 0.55) pluck(Math.max(nextArp, now + 0.05));
      nextArp += 0.45;
    }
  }

  return {
    start() {
      if (timer || muted) return;
      if (!ensureGraph()) return;
      const now = AC.currentTime;
      nextChord = now + 0.1; nextArp = now + 1.2; chordIdx = 0;
      schedule();
      timer = setInterval(schedule, 250);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
})();
