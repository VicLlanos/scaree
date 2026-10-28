/**
 * EMBER & ECHO — main loop, input, camera, puzzles, render
 */
import { TILE, JUMP_V } from './physics.js';
import { isSolid, isHazard, loadZone } from './world.js';
import { Player } from './entities.js';
import { Net } from './net.js';

const $ = id => document.getElementById(id);
const cv = $('cv');
const ctx = cv.getContext('2d');

const state = {
  zone: null,
  me: null,
  remote: null,       // interpolated partner
  remoteTarget: null,
  input: { left: false, right: false, jumpPressed: false, usePressed: false },
  keys: {},
  shards: [false, false, false, false],
  puzzle: {},
  cam: { x: 0, y: 0 },
  dialogue: null,
  glyphBuf: [],
  rings: [],
  name: 'Traveler',
  role: 'ember',
  phase: 'play',
  endT: 0,
  lastNet: 0,
  solidFn: (t, ow) => isSolid(t, ow)
};

let AC = null;
function chime() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659].forEach((f, i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = 0.1;
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.45);
      o.connect(g); g.connect(AC.destination);
      o.start(AC.currentTime + i * 0.1);
      o.stop(AC.currentTime + 0.45 + i * 0.1);
    });
  } catch (_) {}
}

/* ─── Input ───────────────────────────────────────── */
function bindInput() {
  addEventListener('keydown', e => {
    state.keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' || e.code === 'Enter') {
      if (state.dialogue) advanceDlg();
      else state.input.jumpPressed = true;
    }
    if (e.code === 'KeyE') state.input.usePressed = true;
  });
  addEventListener('keyup', e => { state.keys[e.code] = false; });

  const setPad = (d, v) => {
    if (d === 'left') state.input.left = v;
    if (d === 'right') state.input.right = v;
  };
  document.querySelectorAll('#dpad .pad').forEach(b => {
    const d = b.dataset.d;
    b.addEventListener('touchstart', e => { e.preventDefault(); setPad(d, true); }, { passive: false });
    b.addEventListener('touchend', () => setPad(d, false));
    b.addEventListener('mousedown', () => setPad(d, true));
    b.addEventListener('mouseup', () => setPad(d, false));
    b.addEventListener('mouseleave', () => setPad(d, false));
  });
  $('btnJump').addEventListener('touchstart', e => { e.preventDefault(); state.input.jumpPressed = true; }, { passive: false });
  $('btnUse').addEventListener('touchstart', e => { e.preventDefault(); state.input.usePressed = true; }, { passive: false });
  $('dialogue').onclick = advanceDlg;

  $('btnJ').onclick = () => { $('journal').classList.toggle('hidden'); $('chat').classList.add('hidden'); };
  $('btnC').onclick = () => { $('chat').classList.toggle('hidden'); $('journal').classList.add('hidden'); };
  $('btnJX').onclick = () => $('journal').classList.add('hidden');
  $('btnCX').onclick = () => $('chat').classList.add('hidden');
  $('btnJAdd').onclick = async () => {
    const n = $('jNote').value.trim(); if (!n) return;
    await Net.addJournal('Note', state.name, n); $('jNote').value = '';
  };
  $('btnCSend').onclick = sendChat;
  $('cInput').addEventListener('keydown', e => { if (e.code === 'Enter') sendChat(); });
  $('btnGlyphX').onclick = () => { $('glyphPanel').classList.add('hidden'); state.glyphBuf = []; };
  $('btnGlyphOk').onclick = submitGlyph;
  $('btnAgain').onclick = () => location.reload();
}

function sendChat() {
  const t = $('cInput').value.trim(); if (!t) return;
  Net.sendChat(state.name, t); $('cInput').value = '';
}

function pollKeys() {
  state.input.left = !!(state.keys['KeyA'] || state.keys['ArrowLeft'] || state.input.left);
  state.input.right = !!(state.keys['KeyD'] || state.keys['ArrowRight'] || state.input.right);
  // jumpPressed / usePressed are edge-triggered and cleared after use
}

/* ─── Zone ────────────────────────────────────────── */
function goZone(id, sx, sy) {
  state.zone = loadZone(id);
  if (state.me) {
    state.me.x = sx ?? state.zone.spawn.x;
    state.me.y = sy ?? state.zone.spawn.y;
    state.me.vx = 0; state.me.vy = 0;
    state.me.checkpoint = { x: state.me.x, y: state.me.y };
    state.me.holding = null;
  }
  Net.setZone(id);
  $('zoneHud').textContent = state.zone.name;
  // Restore collected shards visually
  state.zone.objects.shards.forEach(s => { if (state.shards[s.index]) s.collected = true; });
  // Apply door states from puzzle
  applyPuzzleState();
}

function applyPuzzleState() {
  const z = state.zone; if (!z) return;
  const p = state.puzzle;
  // Open doors linked to solved puzzles
  z.objects.doors.forEach(d => {
    if (p.twinRunes && z.puzzle?.type === 'twinRunes') d.open = true;
    if (p.bridge && z.puzzle?.type === 'bridge') d.open = true;
    if (p.splitVision && z.puzzle?.type === 'splitVision') d.open = true;
  });
  // Hide shards already collected
  z.objects.shards.forEach(s => { if (state.shards[s.index]) s.collected = true; });
}

/* ─── Dialogue ────────────────────────────────────── */
function tryInteract() {
  const z = state.zone, me = state.me;
  if (!z || !me) return;

  // NPC
  for (const n of z.objects.npcs) {
    if (Math.hypot(me.x - n.x, me.y - n.y) < 40) {
      state.dialogue = { name: n.name, lines: n.lines, i: 0 };
      showDlg(); return;
    }
  }
  // Lever
  for (const l of z.objects.levers) {
    if (Math.hypot(me.x - l.x, me.y - l.y) < 40) {
      const on = l.toggle();
      Net.writeLever(l.id, on);
      // Open linked door
      if (l.linksDoor) {
        const d = z.objects.doors.find(d => d.id === l.linksDoor || d.id === 'd0');
        if (d) { d.open = on; Net.writeDoor(d.id, on); }
      }
      return;
    }
  }
  // Crate pickup / drop
  if (me.holding) {
    // Drop
    const c = z.objects.crates.find(c => c.id === me.holding);
    if (c) { c.heldBy = null; Net.writeCrate(c.id, { x: c.x, y: c.y, heldBy: null }); }
    me.holding = null;
    return;
  }
  for (const c of z.objects.crates) {
    if (Math.hypot(me.x - c.x, me.y - c.y) < 40 && !c.heldBy) {
      me.holding = c.id;
      c.heldBy = Net.getUid();
      Net.writeCrate(c.id, { x: c.x, y: c.y, heldBy: Net.getUid() });
      return;
    }
  }
  // Split vision terminal
  if (z.puzzle?.type === 'splitVision') {
    const t = z.puzzle.terminal;
    if (Math.hypot(me.x - t.x, me.y - t.y) < 50) openGlyph();
  }
}

function showDlg() {
  const d = state.dialogue;
  if (!d) { $('dialogue').classList.add('hidden'); return; }
  $('dlgName').textContent = d.name;
  $('dlgText').textContent = d.lines[d.i];
  $('dialogue').classList.remove('hidden');
}
function advanceDlg() {
  if (!state.dialogue) return;
  state.dialogue.i++;
  if (state.dialogue.i >= state.dialogue.lines.length) {
    state.dialogue = null; $('dialogue').classList.add('hidden');
  } else showDlg();
}

function openGlyph() {
  if (state.shards[2]) return;
  const p = state.zone.puzzle;
  const vis = state.role === 'ember' ? p.visibleEmber : p.visibleEcho;
  const keys = $('glyphKeys'); keys.innerHTML = '';
  const all = ['◇', '◎', '△', '○', '□'];
  const show = new Set(vis.map(i => p.code[i]));
  all.forEach(g => {
    if (show.has(g) || Math.random() < 0.35) {
      const b = document.createElement('button');
      b.textContent = g;
      b.onclick = () => {
        if (state.glyphBuf.length >= 3) return;
        state.glyphBuf.push(g);
        $('glyphEntry').textContent = state.glyphBuf.join(' ');
      };
      keys.appendChild(b);
    }
  });
  state.glyphBuf = [];
  $('glyphEntry').textContent = '';
  $('glyphPanel').classList.remove('hidden');
}

async function submitGlyph() {
  const p = state.zone?.puzzle;
  if (!p || p.type !== 'splitVision') return;
  if (state.glyphBuf.join('') === p.code.join('')) {
    Net.setPuzzle('splitVision', true);
    await Net.unlockShard(2, state.name);
    chime();
    spawnRing(state.me.x, state.me.y);
    $('glyphPanel').classList.add('hidden');
  } else {
    $('glyphEntry').textContent = 'Wrong';
    state.glyphBuf = [];
  }
}

/* ─── Puzzles ─────────────────────────────────────── */
function tickPuzzles() {
  const z = state.zone; if (!z?.puzzle) return;
  const p = z.puzzle;
  const me = state.me;

  // Twin runes
  if (p.type === 'twinRunes' && !state.shards[0] && !state.puzzle.twinRunes) {
    const runes = z.objects.runes;
    if (runes.length >= 2) {
      let a = false, b = false;
      const check = (pl) => {
        if (runes[0].check(pl)) a = true;
        if (runes[1].check(pl)) b = true;
      };
      check(me);
      if (state.remote && state.remote.zone === z.id) {
        // Approximate remote as player-like
        const rp = { x: state.remote.x, y: state.remote.y, w: 24, h: 32, grounded: true };
        check(rp);
      }
      runes[0].active = a; runes[1].active = b;
      if (a && b) {
        Net.setPuzzle('twinRunes', true);
        Net.unlockShard(0, state.name);
        chime();
        z.objects.doors.forEach(d => { d.open = true; Net.writeDoor(d.id, true); });
        spawnRing(runes[0].x, runes[0].y);
      }
    }
  }

  // Bridge / plate
  if (p.type === 'bridge' || z.objects.plates.length) {
    const bodies = [me, ...z.objects.crates];
    if (state.remote) bodies.push({ x: state.remote.x, y: state.remote.y, w: 24, h: 32 });
    z.objects.plates.forEach(pl => {
      if (pl.check(bodies)) {
        Net.writePlate(pl.id, pl.pressed);
        if (pl.pressed && pl.linksDoor) {
          const d = z.objects.doors.find(d => d.id === pl.linksDoor || d.id === 'd0');
          if (d) { d.open = true; Net.writeDoor(d.id, true); }
        }
      }
    });
  }

  // Shrine finale
  if (p.type === 'shrine' && state.shards[0] && state.shards[1] && state.shards[2] && !state.shards[3]) {
    const near = (x, y) => Math.hypot(x - p.x, y - p.y) < p.radius;
    const meN = near(me.x, me.y);
    let otN = false;
    if (state.remote && state.remote.zone === z.id) otN = near(state.remote.x, state.remote.y);
    if (meN && (otN || !state.remote)) {
      Net.setPuzzle('shrine', true);
      Net.unlockShard(3, state.name);
      chime();
      spawnRing(p.x, p.y);
      setTimeout(() => startEnding(), 800);
    }
  }

  // Shard pickup
  z.objects.shards.forEach(s => {
    if (s.collected) return;
    // Only allow pickup if puzzle solved (or no puzzle gate for that shard)
    if (s.index === 0 && !state.puzzle.twinRunes && z.puzzle?.type === 'twinRunes') return;
    if (s.index === 1 && !state.puzzle.bridge && z.puzzle?.type === 'bridge') {
      // Allow if door open via plate
      if (!z.objects.doors.some(d => d.open)) return;
    }
    if (s.index === 2 && !state.puzzle.splitVision && z.puzzle?.type === 'splitVision') return;
    if (Math.hypot(me.x - s.x, me.y - s.y) < 28) {
      s.collected = true;
      Net.unlockShard(s.index, state.name);
      chime();
      spawnRing(s.x, s.y);
      me.checkpoint = { x: s.x, y: s.y };
    }
  });
}

function spawnRing(x, y) { state.rings.push({ x, y, r: 4, life: 1 }); }

/* ─── Portals ─────────────────────────────────────── */
function checkPortal() {
  const z = state.zone, me = state.me;
  for (const p of z.objects.portals) {
    if (me.x + me.w > p.x && me.x < p.x + p.w && me.y + me.h > p.y && me.y < p.y + p.h) {
      // Prefer both nearby; allow solo if no partner
      let partnerNear = !state.remote;
      if (state.remote && state.remote.zone === z.id) {
        partnerNear = Math.hypot(state.remote.x - p.x, state.remote.y - p.y) < 120;
      }
      if (partnerNear) {
        $('waitMsg').classList.add('hidden');
        goZone(p.toZone, p.tx, p.ty);
      } else {
        $('waitMsg').classList.remove('hidden');
      }
      return;
    }
  }
  $('waitMsg').classList.add('hidden');
}

/* ─── Update ──────────────────────────────────────── */
function update(dt) {
  if (state.phase === 'end') { state.endT += dt; updateEnding(); return; }
  if (state.dialogue) return;

  pollKeys();
  const z = state.zone, me = state.me;
  const plats = z.objects.platforms;
  plats.forEach(p => p.update());

  // Solid function that respects open doors
  const solidFn = (t, ow) => {
    if (isSolid(t, ow)) return true;
    return false;
  };
  // Treat closed doors as solid via extra check after collide
  me.update(state.input, z.tiles, solidFn, plats);

  // Door collision (closed doors block)
  z.objects.doors.forEach(d => {
    if (d.open) return;
    if (me.x < d.x + d.w && me.x + me.w > d.x && me.y < d.y + d.h && me.y + me.h > d.y) {
      if (me.vx > 0) me.x = d.x - me.w;
      else if (me.vx < 0) me.x = d.x + d.w;
      me.vx = 0;
    }
  });

  // Hazards
  const tx = Math.floor((me.x + me.w / 2) / TILE);
  const ty = Math.floor((me.y + me.h / 2) / TILE);
  if (ty >= 0 && tx >= 0 && ty < z.h && tx < z.w && isHazard(z.tiles[ty][tx])) {
    me.respawn();
  }

  // Crates
  const holder = me.holding ? me : null;
  z.objects.crates.forEach(c => {
    if (c.heldBy === Net.getUid()) {
      c.update(z.tiles, solidFn, me);
    } else if (!c.heldBy) {
      c.update(z.tiles, solidFn, null);
    }
    // net write if we hold it
    if (c.heldBy === Net.getUid()) {
      Net.writeCrate(c.id, { x: c.x, y: c.y, heldBy: Net.getUid() });
    }
  });

  z.objects.shards.forEach(s => s.update());

  // Clear edge inputs
  state.input.jumpPressed = false;
  if (state.input.usePressed) { tryInteract(); state.input.usePressed = false; }
  // Also allow keyboard E each frame edge — already handled

  tickPuzzles();
  checkPortal();

  // Camera — follow midpoint of both players
  let focusX = me.x, focusY = me.y;
  if (state.remote && state.remote.zone === z.id) {
    focusX = (me.x + state.remote.x) / 2;
    focusY = (me.y + state.remote.y) / 2;
  }
  const txCam = focusX - cv.width / 2;
  const tyCam = focusY - cv.height / 2;
  const maxX = Math.max(0, z.pixelW - cv.width);
  const maxY = Math.max(0, z.pixelH - cv.height);
  state.cam.x += (Math.max(0, Math.min(maxX, txCam)) - state.cam.x) * Math.min(1, 5 * dt);
  state.cam.y += (Math.max(0, Math.min(maxY, tyCam)) - state.cam.y) * Math.min(1, 5 * dt);

  // Net write
  state.lastNet += dt * 1000;
  if (state.lastNet >= 80) {
    state.lastNet = 0;
    Net.writePlayer({
      x: +me.x.toFixed(1), y: +me.y.toFixed(1),
      vx: +me.vx.toFixed(1), vy: +me.vy.toFixed(1),
      zone: z.id, grounded: me.grounded, holding: me.holding
    });
  }

  // Interpolate remote
  if (state.remote && state.remoteTarget) {
    state.remote.x += (state.remoteTarget.x - state.remote.x) * Math.min(1, 12 * dt);
    state.remote.y += (state.remoteTarget.y - state.remote.y) * Math.min(1, 12 * dt);
  }

  // Rings
  state.rings.forEach(r => { r.r += dt * 80; r.life -= dt; });
  state.rings = state.rings.filter(r => r.life > 0);

  // Reset pad left/right each frame if not held via keyboard
  if (!state.keys['KeyA'] && !state.keys['ArrowLeft']) state.input.left = false;
  if (!state.keys['KeyD'] && !state.keys['ArrowRight']) state.input.right = false;
}

/* ─── Render ──────────────────────────────────────── */
function render() {
  const z = state.zone; if (!z) return;
  const camX = state.cam.x, camY = state.cam.y;

  // BG
  ctx.fillStyle = z.bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  // Parallax
  ctx.fillStyle = z.parallax;
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 8; i++) {
    const px = ((i * 140 - camX * 0.3) % (cv.width + 100)) - 50;
    ctx.beginPath();
    ctx.ellipse(px, 80 + (i % 3) * 30, 60, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Tiles
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const x1 = Math.min(z.w, Math.ceil((camX + cv.width) / TILE) + 1);
  const y1 = Math.min(z.h, Math.ceil((camY + cv.height) / TILE) + 1);

  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const t = z.tiles[ty][tx];
      if (t === '.') continue;
      const px = tx * TILE - camX, py = ty * TILE - camY;
      if (t === '#') {
        ctx.fillStyle = '#3a4558';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#4a5568';
        ctx.fillRect(px, py, TILE, 3);
      } else if (t === '=') {
        ctx.fillStyle = '#6a5a40';
        ctx.fillRect(px, py, TILE, 8);
      } else if (t === '~') {
        ctx.fillStyle = '#2a5a6a';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#3a7a8a';
        ctx.fillRect(px + 4, py + 8 + Math.sin(Date.now() / 300 + tx) * 2, 12, 3);
      } else if (t === 'F') {
        ctx.fillStyle = '#8a3a10';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = `rgb(255,${120 + Math.sin(Date.now() / 100 + tx) * 40 | 0},20)`;
        ctx.fillRect(px + 6, py + 4, 20, 24);
      }
    }
  }

  // Objects
  const o = z.objects;
  o.platforms.forEach(p => p.draw(ctx, camX, camY));
  o.plates.forEach(p => p.draw(ctx, camX, camY));
  o.doors.forEach(d => d.draw(ctx, camX, camY));
  o.levers.forEach(l => l.draw(ctx, camX, camY));
  o.runes.forEach(r => r.draw(ctx, camX, camY));
  o.crates.forEach(c => c.draw(ctx, camX, camY));
  o.shards.forEach(s => s.draw(ctx, camX, camY));
  o.npcs.forEach(n => n.draw(ctx, camX, camY));
  o.portals.forEach(p => p.draw(ctx, camX, camY));

  // Shrine marker
  if (z.puzzle?.type === 'shrine') {
    const sx = z.puzzle.x - camX, sy = z.puzzle.y - camY;
    ctx.fillStyle = 'rgba(240,232,160,0.3)';
    ctx.beginPath(); ctx.arc(sx, sy, z.puzzle.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0e8a0';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 16); ctx.lineTo(sx + 14, sy); ctx.lineTo(sx, sy + 16); ctx.lineTo(sx - 14, sy);
    ctx.closePath(); ctx.fill();
  }

  // Remote player
  if (state.remote && state.remote.zone === z.id) {
    const rp = state.remote;
    const col = rp.role === 'echo' ? '#3fb8a8' : '#e8a33d';
    // Simple draw
    const px = rp.x - camX, py = rp.y - camY;
    const g = ctx.createRadialGradient(px + 12, py + 16, 2, px + 12, py + 16, 24);
    g.addColorStop(0, rp.role === 'echo' ? 'rgba(63,184,168,0.3)' : 'rgba(232,163,61,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px + 12, py + 16, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.fillRect(px, py, 24, 32);
    ctx.fillStyle = '#1a2438';
    ctx.fillRect(px + 5, py + 8, 4, 4);
    ctx.fillRect(px + 14, py + 8, 4, 4);
    ctx.fillStyle = '#f6e9d5';
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(rp.name || rp.role, px + 12, py - 4);
  }

  // Me
  state.me.draw(ctx, camX, camY);
  ctx.fillStyle = '#f6e9d5';
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('You', state.me.x - camX + 12, state.me.y - camY - 6);

  // Rings
  state.rings.forEach(r => {
    ctx.strokeStyle = `rgba(232,163,61,${r.life})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r.x - camX, r.y - camY, r.r, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/* ─── Ending ──────────────────────────────────────── */
const END_LINES = [
  'The shards fuse. The broken lantern becomes whole.',
  'Light spills across the Hollowlands.',
  'Spring, summer, autumn, winter — all at once.',
  'Fog lifts. The seasons breathe again.',
  'You look at each other.',
  'The world remembers.',
  '',
  'The End — for now.'
];
function startEnding() {
  if (state.phase === 'end') return;
  state.phase = 'end'; state.endT = 0;
  $('ending').classList.remove('hidden');
  $('endText').textContent = '';
  $('btnAgain').classList.add('hidden');
  chime();
}
function updateEnding() {
  const idx = Math.min(END_LINES.length - 1, Math.floor(state.endT / 2.3));
  $('endText').textContent = END_LINES.slice(0, idx + 1).join('\n');
  if (state.endT > END_LINES.length * 2.3 + 1) $('btnAgain').classList.remove('hidden');
}

/* ─── Loop ────────────────────────────────────────── */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  if (state.phase === 'play') render();
  requestAnimationFrame(frame);
}

/* ─── Boot ────────────────────────────────────────── */
export function startGame(roomCode, name) {
  state.name = name;
  state.role = Net.getRole() || 'ember';
  $('gameWrap').classList.remove('hidden');
  $('codeHud').textContent = roomCode;
  $('roleLab').textContent = `You: ${state.role === 'echo' ? 'Echo' : 'Ember'}`;

  goZone('village');
  state.me = new Player(state.zone.spawn.x, state.zone.spawn.y, state.role);

  bindInput();

  Net.onConnected(ok => { $('dot').className = 'dot ' + (ok ? 'green' : 'red'); });

  Net.onPlayers(players => {
    const myUid = Net.getUid();
    Object.entries(players).forEach(([id, p]) => {
      if (id === myUid) return;
      if (!state.remote) state.remote = { x: p.x, y: p.y, role: p.role, name: p.name, zone: p.zone };
      state.remoteTarget = { x: p.x, y: p.y };
      state.remote.role = p.role;
      state.remote.name = p.name;
      state.remote.zone = p.zone;
    });
  });

  Net.onObjects(objs => {
    if (!state.zone) return;
    const crates = objs.crates || {};
    state.zone.objects.crates.forEach(c => {
      const n = crates[c.id];
      if (!n) return;
      if (n.heldBy && n.heldBy !== Net.getUid()) {
        c.x = n.x; c.y = n.y; c.heldBy = n.heldBy;
      } else if (!n.heldBy && c.heldBy && c.heldBy !== Net.getUid()) {
        c.heldBy = null; c.x = n.x; c.y = n.y;
      }
    });
    const plates = objs.plates || {};
    state.zone.objects.plates.forEach(p => {
      if (plates[p.id]) p.pressed = !!plates[p.id].pressed;
    });
    const levers = objs.levers || {};
    state.zone.objects.levers.forEach(l => {
      if (levers[l.id]) l.on = !!levers[l.id].on;
    });
    const doors = objs.doors || {};
    state.zone.objects.doors.forEach(d => {
      if (doors[d.id]) d.open = !!doors[d.id].open;
    });
  });

  Net.onPuzzle(p => { state.puzzle = p || {}; applyPuzzleState(); });

  Net.onShards(s => {
    state.shards = [!!s.s0, !!s.s1, !!s.s2, !!s.s3];
    document.querySelectorAll('.sh').forEach((el, i) => el.classList.toggle('lit', state.shards[i]));
    if (state.zone) state.zone.objects.shards.forEach(sh => { if (state.shards[sh.index]) sh.collected = true; });
  });

  Net.onJournal(list => {
    $('jList').innerHTML = list.map(e =>
      `<div><b>${e.event}</b> <span style="color:#889">— ${e.by}</span>${e.note ? '<br><i>' + e.note + '</i>' : ''}</div>`
    ).join('') || '<div style="color:#667">No entries yet.</div>';
  });

  Net.onChat(list => {
    $('cList').innerHTML = list.slice(-30).map(m =>
      `<div><b>${m.name}</b>: ${m.text}</div>`
    ).join('');
    $('cList').scrollTop = $('cList').scrollHeight;
  });

  requestAnimationFrame(frame);
}
