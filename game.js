'use strict';
/* ============================================================
   GRAVITY DEBT — every flip costs.
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
  speedRamp: 7,       // +px/s per second survived
  maxSpeed: 950,
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
};

// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
let floorY = 0, ceilY = 0, gapH = 0;

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
let px = 0, py = 0, vy = 0;
let onSurface = true;
let energy = CFG.energyStart;
let score = 0, elapsed = 0, speed = CFG.baseSpeed;
let flips = 0, orbsGot = 0, nearCount = 0;
let best = parseInt(store.get('gd_best') || '0', 10) || 0;
let shake = 0, deathT = 0, denyFlash = 0;
let obstacles = [], orbs = [], particles = [], floaters = [], trail = [], waves = [];
let spawnX = 0, consecCost = 0, railOff = 0;
let stars = [];

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const hud = $('hud'), scoreEl = $('score'), pipsEl = $('energy-pips'),
      bestHud = $('best-hud'), menu = $('menu'), gameoverEl = $('gameover'),
      pausedEl = $('paused'), muteBtn = $('mute-btn');

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
function refreshBest() {
  bestHud.textContent = 'BEST ' + best;
  $('menu-best').textContent = 'BEST ' + best;
}
function floater(x, y, txt, color) {
  floaters.push({ x, y, txt, color: color || '#fff', life: 1 });
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
menu.addEventListener('pointerdown', e => { e.preventDefault(); SFX.click(); startGame(); });
$('start-btn').addEventListener('click', e => e.stopPropagation());
gameoverEl.addEventListener('pointerdown', e => { e.preventDefault(); startGame(); });
$('retry-btn').addEventListener('click', e => e.stopPropagation());
$('share-btn').addEventListener('click', e => { e.stopPropagation(); shareScore(); });
$('resume-btn').addEventListener('click', () => togglePause(false));
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
  if (!muted) SFX.click();
}
function togglePause(force) {
  paused = typeof force === 'boolean' ? force : !paused;
  pausedEl.classList.toggle('hidden', !paused);
  if (!paused) lastT = performance.now(); // avoid dt jump
}

// ---------- Spawner: patterns ----------
// Every pattern spawns ahead of the player. The spawner tracks energy and
// NEVER emits an unavoidable pattern when the player couldn't afford the
// flips to survive it. That's the fairness contract of Gravity Debt.
function surfY(s) { return s === 'floor' ? floorY : ceilY; }
function playerSurf() { return grav === 1 ? 'floor' : 'ceil'; }
function oppSurf() { return grav === 1 ? 'ceil' : 'floor'; }

function addSpike(x, s) {
  const w = 36, h = 54;
  obstacles.push({
    kind: 'spike', x, y: s === 'floor' ? floorY - h : ceilY,
    w, h, minClear: Infinity, counted: false,
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
  orbs.push({ x, y, r: 11, taken: false, ph: Math.random() * 6.28 });
}
function gapAfter() { return speed * rand(0.55, 0.85); } // time-based spacing

// pattern fns: each takes x, emits entities, returns footprint width
function patMustSpike(x)   { addSpike(x, playerSurf()); consecCost++; return 120; }
function patFreeSpike(x)   { addSpike(x, oppSurf()); consecCost = 0; return 120; }
function patWall(x)        { addWall(x, playerSurf()); consecCost++; return 150; }
function patDouble(x)      { addSpike(x, 'floor'); addSpike(x, 'ceil'); consecCost++; return 140; }
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
  const r = Math.random();
  const canAfford = energy > 1 && consecCost < 2;
  if (!canAfford) {
    // Mercy rule: only patterns survivable with zero flips.
    if (r < 0.42) return patFreeSpike(x);
    if (r < 0.78) return patOrbLine(x);
    return patRest();
  }
  if (r < 0.28) return patMustSpike(x);
  if (r < 0.46) return patFreeSpike(x);
  if (r < 0.58) return patWall(x);
  if (r < 0.68 && elapsed > 25) return patDouble(x);
  if (r < 0.86) return patOrbArc(x);
  return patRest();
}

// ---------- Game flow ----------
function startGame() {
  SFX.click();
  grav = 1; px = Math.max(90, W * 0.30); py = floorY - CFG.playerR; vy = 0;
  onSurface = true;
  energy = CFG.energyStart;
  score = 0; elapsed = 0; speed = CFG.baseSpeed;
  flips = 0; orbsGot = 0; nearCount = 0;
  shake = 0; denyFlash = 0;
  obstacles = []; orbs = []; particles = []; floaters = []; trail = []; waves = [];
  spawnX = W + 420; consecCost = 0;
  state = 'playing'; paused = false;
  menu.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  hud.classList.remove('hidden');
  $('share-note').classList.add('hidden');
  renderPips(); setScore(0); refreshBest();
  lastT = performance.now();
}

function doFlip() {
  if (energy <= 0) {
    denyFlash = 0.6; shake = Math.max(shake, 5);
    SFX.deny();
    floater(px, py - 44, 'NO FLIPS', '#ff5e7a');
    return;
  }
  energy--;
  grav *= -1;
  vy = grav * CFG.flipLaunch; // launch toward the new surface
  onSurface = false;
  flips++;
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
  renderPips();
}

function collectOrb(o) {
  o.taken = true;
  energy = Math.min(CFG.energyMax, energy + 1);
  orbsGot++;
  score += CFG.orbScore;
  setScore(score);
  floater(o.x, o.y - 18, '+' + CFG.orbScore, '#ffd94d');
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: o.x, y: o.y, vx: rand(-140, 140), vy: rand(-140, 140),
      life: rand(0.2, 0.45), max: 0.45, size: rand(2, 4), color: '#ffd94d',
    });
  }
  SFX.orb();
  renderPips();
}

function nearMiss(ob) {
  nearCount++;
  score += CFG.nearScore;
  setScore(score);
  floater(px + 10, py - 40, 'CLOSE +' + CFG.nearScore, '#7dff9a');
  SFX.near();
}

function die() {
  if (state !== 'playing') return;
  state = 'dying'; deathT = 0;
  shake = 16;
  SFX.death();
  for (let i = 0; i < 42; i++) {
    particles.push({
      x: px, y: py, vx: rand(-340, 340), vy: rand(-340, 340),
      life: rand(0.4, 0.9), max: 0.9, size: rand(2, 7),
      color: ['#00e5ff', '#ff4dd2', '#ffffff'][i % 3],
    });
  }
}

function showGameOver() {
  state = 'over';
  const fs = Math.floor(score);
  const isBest = fs > best;
  if (isBest) { best = fs; store.set('gd_best', String(best)); }
  $('final-score').textContent = fs;
  $('newbest').classList.toggle('hidden', !isBest);
  $('st-time').textContent = Math.floor(elapsed) + 's';
  $('st-flips').textContent = flips;
  $('st-orbs').textContent = orbsGot;
  $('st-near').textContent = nearCount;
  refreshBest();
  hud.classList.add('hidden');
  gameoverEl.classList.remove('hidden');
}

function shareScore() {
  const txt = 'I scored ' + Math.floor(score) + ' in GRAVITY DEBT — every flip costs. Beat me: ' + location.href;
  const done = () => {
    const n = $('share-note');
    n.classList.remove('hidden');
    setTimeout(() => n.classList.add('hidden'), 2200);
  };
  if (navigator.share) {
    navigator.share({ title: 'GRAVITY DEBT', text: txt, url: location.href }).catch(() => {});
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

  // trail
  trail.push({ x: px, y: py, life: 1 });
  if (trail.length > 26) trail.shift();
  for (const t of trail) t.life -= dt * 3.2;

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
  const dx = speed * dt;
  for (const ob of obstacles) {
    ob.x -= dx;
    // near-miss tracking: closest approach of the forgiving hitbox
    if (!ob.counted && px > ob.x - 90 && px < ob.x + ob.w + 90) {
      const d = circleRectDist(px, py, shrunkRect(ob));
      if (d < ob.minClear) ob.minClear = d;
    }
    if (!ob.counted && ob.x + ob.w < px - CFG.playerR * 2) {
      ob.counted = true;
      if (ob.minClear < CFG.nearDist) nearMiss(ob);
    }
  }
  for (const o of orbs) {
    o.x -= dx; o.ph += dt * 5;
    if (!o.taken) {
      const d = Math.hypot(px - o.x, py - o.y);
      if (d < CFG.playerR + o.r + 6) collectOrb(o);
    }
  }
  obstacles = obstacles.filter(o => o.x + o.w > -120 && !(o.counted && o.x + o.w < -40));
  orbs = orbs.filter(o => o.x > -60 && !o.taken);

  // --- collisions (forgiving hitboxes) ---
  const pr = CFG.playerR - 3;
  for (const ob of obstacles) {
    const r = shrunkRect(ob);
    if (px + pr > r.x && px - pr < r.x + r.w && py + pr > r.y && py - pr < r.y + r.h) {
      die();
      break;
    }
  }

  // --- fx ---
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) { f.y -= 46 * dt; f.life -= dt * 1.4; }
  floaters = floaters.filter(f => f.life > 0);
  for (const wv of waves) { wv.r += 420 * dt; wv.life -= dt * 2.4; }
  waves = waves.filter(w => w.life > 0);

  // --- score: survive = points ---
  score += speed * dt * 0.02;
  setScore(score);
}

function updateDying(dt) {
  deathT += dt;
  shake = Math.max(0, shake - dt * 22);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const wv of waves) { wv.r += 420 * dt; wv.life -= dt * 2.4; }
  waves = waves.filter(w => w.life > 0);
  if (deathT > 0.85) showGameOver();
}

// ---------- Render ----------
function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0b1a');
  g.addColorStop(0.5, '#07070f');
  g.addColorStop(1, '#0d0a18');
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
  drawRail(floorY, '#00e5ff');
  drawRail(ceilY, '#ff2ec4');
}

function drawOrbs(t) {
  for (const o of orbs) {
    const pulse = 1 + 0.16 * Math.sin(o.ph);
    ctx.save();
    ctx.shadowColor = '#ffd94d';
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * pulse);
    g.addColorStop(0, '#fff6d8');
    g.addColorStop(0.55, '#ffd94d');
    g.addColorStop(1, 'rgba(255,157,46,0.15)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * pulse, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
}

function drawObstacles() {
  for (const ob of obstacles) {
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
  const color = grav === 1 ? '#00e5ff' : '#ff4dd2';
  // trail
  for (const tr of trail) {
    if (tr.life <= 0) continue;
    ctx.globalAlpha = Math.max(0, tr.life) * 0.35;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(tr.x, tr.y, CFG.playerR * tr.life * 0.9, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (state === 'dying') return; // exploded
  // glow core
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  const g = ctx.createRadialGradient(px, py, 0, px, py, CFG.playerR);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(px, py, CFG.playerR, 0, 6.2832); ctx.fill();
  // orbiting spark
  const a = t * 6;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(px + Math.cos(a) * (CFG.playerR + 7), py + Math.sin(a) * (CFG.playerR + 7), 3, 0, 6.2832);
  ctx.fill();
  ctx.restore();
}

function drawFx() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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

function render(t) {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.6, rand(-shake, shake) * 0.6);
  drawBackground(t);
  drawRails();
  drawOrbs(t);
  drawObstacles();
  drawFx();
  drawPlayer(t);
  drawHint(t);
  drawVignette(t);
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
  if (paused) { render(now / 1000); return; }
  if (state === 'playing') update(dt);
  else if (state === 'dying') updateDying(dt);
  render(now / 1000);
}

// ---------- Boot ----------
muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
muteBtn.classList.toggle('off', muted);
resize();
renderPips();
refreshBest();
setScore(0);
requestAnimationFrame(loop);
