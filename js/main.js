import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAnalytics} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,GoogleAuthProvider,signInWithPopup,signOut,updateProfile} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getDatabase,ref,set,get,update,onValue,onDisconnect,remove,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";

const T = THREE, S = 3, $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig); try { getAnalytics(app); } catch (e) {}
const auth = getAuth(app), db = getDatabase(app);
let mySlot, user, code, room, isHost = false, G = null, loadedSeed = null, unsub = null, best = 0, renderer;
const K = {}, joy = {x: 0, y: 0, run: false};
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
const show = id => ['auth', 'menu', 'lobby', 'game'].forEach(s => $(s).classList.toggle('d-none', s !== id));
const R = p => ref(db, `rooms/${code}${p ? '/' + p : ''}`);
const nm = () => (user.displayName || user.email?.split('@')[0] || 'Survivor').slice(0, 16);
const pl = () => ({name: nm(), x: 0, z: 0, ry: 0, hp: 3});

/* ---------- AUTH ---------- */
const aerr = m => $('authErr').textContent = m.replace('auth/', '').replace(/-/g, ' ');
$('btnLogin').onclick = () => signInWithEmailAndPassword(auth, $('email').value, $('pass').value).catch(e => aerr(e.code));
$('btnReg').onclick = async () => { try { const c = await createUserWithEmailAndPassword(auth, $('email').value, $('pass').value);
  await updateProfile(c.user, {displayName: $('nick').value.trim() || 'Survivor'}); $('who').textContent = nm(); } catch (e) { aerr(e.code); } };
$('btnGoogle').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => aerr(e.code));
$('btnOut').onclick = () => signOut(auth);
onAuthStateChanged(auth, async u => {
  user = u; if (!u) { leave(); return show('auth'); }
  show('menu'); $('who').textContent = nm();
  try { const s = await get(ref(db, 'users/' + u.uid)); best = s.val()?.bestLevel || 0; $('best').textContent = best; } catch (e) {}
});
const save = (lvl, win) => { best = Math.max(best, lvl); $('best').textContent = best;
  update(ref(db, 'users/' + user.uid), {name: nm(), bestLevel: best}).catch(() => {}); };

/* ---------- ROOMS ---------- */
const menuErr = m => $('menuErr').textContent = m;
$('btnCreate').onclick = async () => { audio();
  code = Array.from({length: 5}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  try { await set(R(), {host: user.uid, state: 'lobby', level: 1, seed: 1, createdAt: serverTimestamp(), slots: {s0: user.uid}, players: {[user.uid]: pl()}}); mySlot = 's0'; enter(); }
  catch (e) { menuErr('Could not create room (check database rules).'); } };
$('btnJoin').onclick = async () => { audio(); code = $('joinCode').value.toUpperCase().trim();
  try { const s = await get(R()); if (!s.exists()) return menuErr('Room not found');
    const v = s.val(), n = Object.keys(v.players || {}).length;
    if (v.state !== 'lobby') return menuErr('Game already started');
    mySlot = null; for (const sl of ['s0', 's1', 's2', 's3']) { try { await set(R('slots/' + sl), user.uid); mySlot = sl; break; } catch (e) {} }
    if (!mySlot) return menuErr('Room is full (4/4)');
    await set(R('players/' + user.uid), pl()); enter(); } catch (e) { menuErr('Could not join room.'); } };
function enter() { menuErr(''); onDisconnect(R()).update({['players/' + user.uid]: null, ['slots/' + mySlot]: null}).catch(() => {}); $('lobCode').textContent = code; $('hudRoom').textContent = code;
  unsub = onValue(R(), s => onRoom(s.val())); show('lobby'); }
async function leave(kicked) {
  if (unsub) { unsub(); unsub = null; }
  if (G) stopGame();
  if (code && user) { try { isHost ? await remove(R()) : await update(R(), {['players/' + user.uid]: null, ['slots/' + mySlot]: null}); } catch (e) {} }
  code = null; room = null; loadedSeed = null; $('endOverlay').classList.add('d-none');
  if (user) { show('menu'); if (kicked) menuErr('The room was closed.'); }
}
$('btnLeave').onclick = () => leave(); $('btnQuit').onclick = () => leave();
$('btnStart').onclick = () => update(R(), {state: 'playing', level: 1, seed: Date.now() % 1e9, keys: null, reached: null, enemy: null});
$('btnBack').onclick = () => update(R(), {state: 'lobby', level: 1, keys: null, reached: null, enemy: null});

function onRoom(v) {
  if (!v) { code = null; isHost = false; return leave(true); }
  room = v; isHost = v.host === user.uid;
  const ids = Object.keys(v.players || {}).sort();
  $('lobPlayers').innerHTML = ids.map(u => `<li class="list-group-item bg-dark text-light">${v.players[u].name.replace(/</g, '&lt;')}${u === v.host ? ' 👑' : ''}</li>`).join('');
  $('btnStart').classList.toggle('d-none', !isHost); $('lobWait').classList.toggle('d-none', isHost);
  if (v.state === 'lobby') { if (G) stopGame(); loadedSeed = null; $('endOverlay').classList.add('d-none'); show('lobby'); return; }
  if (v.state === 'playing' && loadedSeed !== v.seed) startLevel(v.level, v.seed);
  if (v.state === 'won' || v.state === 'lost') return endGame(v.state);
  if (!G) return;
  // remote players
  ids.forEach((u, i) => { if (u === user.uid) return; const p = v.players[u];
    let r = G.remote[u]; if (!r) { r = G.remote[u] = {m: mkPlayer(p, i), tx: p.x, tz: p.z, ry: 0, hp: 3}; r.m.position.set(p.x, 0, p.z); G.scene.add(r.m); }
    r.tx = p.x; r.tz = p.z; r.ry = p.ry; r.hp = p.hp; r.m.visible = p.hp > 0; });
  Object.keys(G.remote).forEach(u => { if (!v.players[u]) { G.scene.remove(G.remote[u].m); delete G.remote[u]; } });
  // keys
  const kk = v.keys || {};
  G.keys.forEach((k, i) => { if (kk['k' + i] && !k.taken) { k.taken = true; k.m.visible = false; sfx.pick(); } });
  const got = G.keys.filter(k => k.taken).length; hudKeys(got);
  if (got === G.keys.length && !G.open) { G.open = true; G.exitLight.color.set(0x22ff55); G.exitMesh.material.color.set(0x114422); msg('THE EXIT IS OPEN. RUN.', 3500); sfx.thump(); }
  if (!isHost && v.enemy) { G.en.tx = v.enemy.x; G.en.tz = v.enemy.z; }
  if (isHost) {
    if (ids.every(u => v.players[u].hp <= 0)) update(R(), {state: 'lost'});
    if (v.reached && !G.adv) { G.adv = true;
      if (v.level >= 3) update(R(), {state: 'won'});
      else update(R(), {level: v.level + 1, seed: Date.now() % 1e9, keys: null, reached: null, enemy: null}); }
  }
}
function endGame(s) {
  if (G) { if (s === 'won') save(3); stopGame(); } loadedSeed = null;
  $('endTitle').textContent = s === 'won' ? 'YOU ESCAPED' : 'YOU DIED';
  $('endText').textContent = s === 'won' ? 'All three levels survived. Or did you?' : 'It got all of you.';
  $('btnBack').classList.toggle('d-none', !isHost); $('endOverlay').classList.remove('d-none'); show('lobby');
}

/* ---------- AUDIO ---------- */
let AC, nb;
function audio() {
  if (AC) { AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const a = AC.createOscillator(), b = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  a.type = 'sawtooth'; a.frequency.value = 48; b.frequency.value = 50.5; f.frequency.value = 140; g.gain.value = .06;
  a.connect(f); b.connect(f); f.connect(g); g.connect(AC.destination); a.start(); b.start();
}
function noise(dur, fq, q, vol, sw) { if (!AC) return; const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime;
  s.buffer = nb; f.type = 'bandpass'; f.frequency.setValueAtTime(fq, t); if (sw) f.frequency.exponentialRampToValueAtTime(sw, t + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(AC.destination); s.start(); s.stop(t + dur); }
function tone(f1, f2, dur, vol, type) { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(AC.destination); o.start(); o.stop(t + dur); }
const sfx = {
  scream() { tone(500, 1900, .9, .5, 'sawtooth'); tone(530, 1500, .9, .35, 'square'); noise(.9, 1500, 1, .9, 3500); },
  thump() { tone(90, 30, .5, .9, 'sine'); noise(.3, 200, 1, .5); },
  beat() { tone(70, 35, .18, .8, 'sine'); },
  step() { noise(.08, 400, 2, .18); },
  whisper() { noise(2.2, 2600, 7, .3, 1100); },
  pick() { tone(800, 1700, .25, .25, 'triangle'); }
};

/* ---------- WORLD HELPERS ---------- */
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function gen(N, r) {
  const W = 2 * N + 1, m = Array.from({length: W}, () => Array(W).fill(1)), st = [[1, 1]]; m[1][1] = 0;
  while (st.length) { const [x, y] = st[st.length - 1];
    const d = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([a, b]) => x + a > 0 && y + b > 0 && x + a < W - 1 && y + b < W - 1 && m[y + b][x + a] === 1);
    if (!d.length) { st.pop(); continue; } const [a, b] = d[r() * d.length | 0]; m[y + b / 2][x + a / 2] = 0; m[y + b][x + a] = 0; st.push([x + a, y + b]); }
  for (let i = 0; i < N * 2; i++) { const x = 1 + (r() * (W - 2) | 0), y = 1 + (r() * (W - 2) | 0);
    if (m[y][x] && ((m[y][x - 1] === 0 && m[y][x + 1] === 0) || (m[y - 1][x] === 0 && m[y + 1][x] === 0))) m[y][x] = 0; }
  return m;
}
function bfs(m, sx, sy, tx, ty) {
  const W = m.length, prev = new Map([[sy * W + sx, -1]]), q = [[sx, sy]];
  while (q.length) { const [x, y] = q.shift(); if (x === tx && y === ty) break;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b, k = ny * W + nx; if (m[ny]?.[nx] === 0 && !prev.has(k)) { prev.set(k, y * W + x); q.push([nx, ny]); } } }
  let p = ty * W + tx; if (!prev.has(p)) return null; const s0 = sy * W + sx;
  while (prev.get(p) !== s0 && prev.get(p) !== -1) p = prev.get(p); return [p % W, p / W | 0];
}
function tex(base, stain, n) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .3})`; g.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 7, Math.random() * 7); }
  for (let i = 0; i < 7; i++) { const x = Math.random() * 256, y = Math.random() * 256, gr = g.createRadialGradient(x, y, 2, x, y, 55); gr.addColorStop(0, stain); gr.addColorStop(1, 'transparent'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  g.strokeStyle = 'rgba(0,0,0,.5)'; for (let i = 0; i < 5; i++) { g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let j = 0; j < 6; j++) g.lineTo(x += Math.random() * 30 - 15, y += Math.random() * 30); g.stroke(); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
}
function mkPlayer(p, i) {
  const g = new T.Group(), col = [0x4da3ff, 0x6bff8a, 0xffd24d, 0xff7ad9][i % 4];
  const b = new T.Mesh(new T.CylinderGeometry(.3, .3, 1.3, 10), new T.MeshStandardMaterial({color: col, roughness: .8})); b.position.y = .75;
  const h = new T.Mesh(new T.SphereGeometry(.22, 12, 10), new T.MeshStandardMaterial({color: 0xddc7b0})); h.position.y = 1.65;
  const l = new T.PointLight(col, .9, 6); l.position.set(0, 1.5, -.4);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = 'bold 34px sans-serif'; x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText(p.name, 128, 44);
  const s = new T.Sprite(new T.SpriteMaterial({map: new T.CanvasTexture(c), depthTest: false})); s.scale.set(1.6, .4, 1); s.position.y = 2.2;
  g.add(b, h, l, s); return g;
}
function mkEnemy() {
  const g = new T.Group(), m = new T.MeshStandardMaterial({color: 0x0a0a0a, roughness: 1});
  const body = new T.Mesh(new T.CylinderGeometry(.25, .35, 1.8, 8), m); body.position.y = 1.2;
  const head = new T.Mesh(new T.SphereGeometry(.22, 10, 10), new T.MeshStandardMaterial({color: 0xcfc8bd, roughness: .9})); head.scale.y = 1.5; head.position.y = 2.35;
  const em = new T.MeshBasicMaterial({color: 0xff1111});
  [-.08, .08].forEach(x => { const e = new T.Mesh(new T.SphereGeometry(.035, 6, 6), em); e.position.set(x, 2.4, .18); g.add(e); });
  [-1, 1].forEach(s => { const a = new T.Mesh(new T.CylinderGeometry(.05, .04, 1.6, 5), m); a.position.set(s * .4, 1.2, .15); a.rotation.set(-.3, 0, s * .12); g.add(a); });
  const l = new T.PointLight(0xff0000, .8, 7); l.position.y = 2.4; g.add(body, head, l); return g;
}
function faceImg() {
  const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d');
  const gr = g.createRadialGradient(200, 190, 20, 200, 190, 190); gr.addColorStop(0, '#e8e2d6'); gr.addColorStop(1, '#3a3630');
  g.fillStyle = gr; g.beginPath(); g.ellipse(200, 200, 120, 170, 0, 0, 7); g.fill();
  g.fillStyle = '#000'; g.beginPath(); g.ellipse(150, 170, 28, 42, .2, 0, 7); g.ellipse(250, 170, 28, 42, -.2, 0, 7); g.fill();
  g.beginPath(); g.ellipse(200, 290, 38, 72, 0, 0, 7); g.fill();
  g.fillStyle = '#c00'; g.beginPath(); g.arc(150, 175, 6, 0, 7); g.arc(250, 175, 6, 0, 7); g.fill(); return c.toDataURL();
}

/* ---------- LEVEL ---------- */
function startLevel(level, seed) {
  stopGame(); loadedSeed = seed; audio();
  const r = rng(seed), N = 4 + level * 2, m = gen(N, r), W = m.length;
  if (!renderer) { renderer = new T.WebGLRenderer({canvas: $('cv'), antialias: true}); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene(); scene.background = new T.Color(0); scene.fog = new T.FogExp2(0x000000, .09);
  const cam = new T.PerspectiveCamera(72, 1, .1, 60); cam.rotation.order = 'YXZ'; scene.add(cam);
  scene.add(new T.AmbientLight(0x221122, .35));
  const fl = new T.SpotLight(0xfff1d0, 3, 26, Math.PI / 5, .6, 1.4); fl.position.set(.2, -.2, 0); cam.add(fl, fl.target); fl.target.position.set(0, 0, -5);
  const glow = new T.PointLight(0x442222, .6, 6); cam.add(glow);
  const wt = tex('#3b3a35', 'rgba(80,0,0,.5)', 900); wt.repeat.set(1, 1);
  const walls = []; m.forEach((row, y) => row.forEach((c, x) => c && walls.push([x, y])));
  const wm = new T.InstancedMesh(new T.BoxGeometry(S, 3.2, S), new T.MeshStandardMaterial({map: wt, bumpMap: wt, bumpScale: 1.2, roughness: .95}), walls.length);
  const dm = new T.Object3D(); walls.forEach(([x, y], i) => { dm.position.set((x + .5) * S, 1.6, (y + .5) * S); dm.updateMatrix(); wm.setMatrixAt(i, dm.matrix); }); scene.add(wm);
  const ft = tex('#2a2623', 'rgba(60,0,0,.6)', 1200); ft.repeat.set(W, W);
  const fm = new T.Mesh(new T.PlaneGeometry(W * S, W * S), new T.MeshStandardMaterial({map: ft, bumpMap: ft, roughness: .8})); fm.rotation.x = -Math.PI / 2; fm.position.set(W * S / 2, 0, W * S / 2); scene.add(fm);
  const ct = tex('#1c1b19', 'rgba(0,0,0,.6)', 300); ct.repeat.set(W, W);
  const cm = new T.Mesh(new T.PlaneGeometry(W * S, W * S), new T.MeshStandardMaterial({map: ct})); cm.rotation.x = Math.PI / 2; cm.position.set(W * S / 2, 3.2, W * S / 2); scene.add(cm);
  // keys
  const cells = []; for (let y = 1; y < W; y += 2) for (let x = 1; x < W; x += 2) if (!(x === 1 && y === 1) && !(x === W - 2 && (y === W - 2 || y === 1))) cells.push([x, y]);
  cells.sort(() => r() - .5);
  const keys = cells.slice(0, 2 + level).map(([x, y]) => { const k = new T.Mesh(new T.BoxGeometry(.25, .5, .1), new T.MeshStandardMaterial({color: 0xffcc33, emissive: 0xffaa00, emissiveIntensity: 1.2}));
    k.position.set((x + .5) * S, 1.1, (y + .5) * S); k.add(new T.PointLight(0xffaa33, 1.5, 7)); scene.add(k); return {m: k, x: k.position.x, z: k.position.z, taken: false}; });
  const ex = (W - 1.5) * S, ez = (W - 1.5) * S;
  const exitMesh = new T.Mesh(new T.BoxGeometry(2, 2.8, .3), new T.MeshStandardMaterial({color: 0x330000, emissive: 0x220000})); exitMesh.position.set(ex, 1.4, ez); scene.add(exitMesh);
  const exitLight = new T.PointLight(0xff2222, 2, 9); exitLight.position.set(ex, 2, ez); scene.add(exitLight);
  const enemy = mkEnemy(); enemy.position.set((W - 1.5) * S, 0, 1.5 * S); scene.add(enemy);
  cam.position.set(1.5 * S, 1.6, 1.5 * S);
  G = {scene, cam, fl, map: m, level, keys, exitMesh, exitLight, ex, ez, remote: {}, open: false, adv: false, yaw: Math.PI, pitch: 0, bob: 0, stepT: 0, t: 0, sendT: 0, beatT: 0,
    en: {m: enemy, tx: enemy.position.x, tz: enemy.position.z, stun: 0, rc: 0, next: null, t: 0}, grace: 22, hp: 3, inv: 0, dead: false, cool: 0, shake: 0, flOn: true, flOff: 0,
    ev: 25 + r() * 10, clock: new T.Clock(), raf: 0, sent: false};
  $('ghost').src = faceImg(); show('game'); $('endOverlay').classList.add('d-none'); resize(); hudKeys(0); hudHp();
  msg(`LEVEL ${level}` + (level === 1 ? ' — find the keys. Stay together.' : ' — it hunts faster now.'), 4000); save(level);
  update(R('players/' + user.uid), {hp: 3, x: cam.position.x, z: cam.position.z});
  loop();
}
function stopGame() { if (G) { cancelAnimationFrame(G.raf); G = null; } }
function resize() { if (!G) return; renderer.setSize(innerWidth, innerHeight, false); G.cam.aspect = innerWidth / innerHeight; G.cam.updateProjectionMatrix(); }
addEventListener('resize', resize);

/* ---------- HUD / SCARES ---------- */
let msgT; const msg = (t, ms = 2500) => { const e = $('hudMsg'); e.textContent = t; e.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(() => e.classList.remove('on'), ms); };
const hudKeys = n => $('hudKeys').textContent = G ? `🗝 ${n}/${G.keys.length}` : '';
const hudHp = () => $('hudHp').textContent = G ? '❤'.repeat(Math.max(G.hp, 0)) + '🖤'.repeat(3 - Math.max(G.hp, 0)) : '';
function jump(kind) {
  if (!G) return; if (kind !== 'catch' && G.cool > 0) return; G.cool = 9; G.shake = .8;
  const gh = $('ghost'), fl = $('flash'); gh.classList.add('on'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  sfx.scream(); navigator.vibrate?.([150, 80, 350]); setTimeout(() => gh.classList.remove('on'), kind === 'catch' ? 750 : 420);
}
function ambient() {
  const x = Math.random();
  if (x < .3) { G.flOff = 3; sfx.whisper(); setTimeout(() => G && jump('ghost'), 3000); }
  else if (x < .55) { sfx.thump(); msg('Something slammed nearby…', 2000); }
  else if (x < .8) { sfx.whisper(); G.flicker = 3; }
  else jump('ghost');
  G.ev = 14 + Math.random() * 22;
}

/* ---------- GAME LOOP ---------- */
const solid = (x, z) => G.map[Math.floor(z / S)]?.[Math.floor(x / S)] !== 0;
function tryMove(dx, dz) { const p = G.cam.position, r = .35, ok = (x, z) => !(solid(x + r, z + r) || solid(x - r, z + r) || solid(x + r, z - r) || solid(x - r, z - r));
  if (ok(p.x + dx, p.z)) p.x += dx; if (ok(p.x, p.z + dz)) p.z += dz; }
const targets = () => { const a = []; if (!G.dead) a.push({x: G.cam.position.x, z: G.cam.position.z});
  Object.values(G.remote).forEach(r => r.hp > 0 && a.push({x: r.m.position.x, z: r.m.position.z})); return a; };
function enemyAI(dt) {
  const e = G.en, p = e.m.position; e.t += dt; if (e.t < G.grace) return; if (e.stun > 0) { e.stun -= dt; return; }
  let best = null, bd = 1e9; targets().forEach(t => { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd) { bd = d; best = t; } });
  if (!best) return; if (bd < 1.2) { e.stun = 3.5; return; }
  e.rc -= dt; if (e.rc <= 0) { e.rc = .35; e.next = bfs(G.map, p.x / S | 0, p.z / S | 0, best.x / S | 0, best.z / S | 0); }
  if (e.next) { const nx = (e.next[0] + .5) * S, nz = (e.next[1] + .5) * S, dx = nx - p.x, dz = nz - p.z, dd = Math.hypot(dx, dz) || 1;
    const sp = Math.min((1.5 + .35 * G.level) * (bd < 9 ? 1.4 : 1) * dt, dd); p.x += dx / dd * sp; p.z += dz / dd * sp; e.m.rotation.y = Math.atan2(dx, dz); }
}
function tick(dt) {
  const g = G, p = g.cam.position; g.t += dt; g.cool -= dt; g.inv -= dt;
  if (!g.dead) {
    const fy = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - joy.y, fx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + joy.x;
    const len = Math.hypot(fx, fy), run = K.ShiftLeft || joy.run, sp = (run ? 4.6 : 2.8) * dt;
    if (len > .05) { const n = Math.min(len, 1) / len, sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
      tryMove((-sy * fy + cy * fx) * n * sp, (-cy * fy - sy * fx) * n * sp); g.bob += dt * (run ? 11 : 7); g.stepT -= dt; if (g.stepT <= 0) { g.stepT = run ? .3 : .48; sfx.step(); } }
    p.y = 1.6 + (len > .05 ? Math.sin(g.bob) * .035 : 0);
    g.keys.forEach((k, i) => { if (!k.taken && Math.hypot(p.x - k.x, p.z - k.z) < 1.4) { k.taken = true; k.m.visible = false; sfx.pick(); update(R('keys'), {['k' + i]: true}); } });
    if (Math.hypot(p.x - g.ex, p.z - g.ez) < 1.8) { if (g.open && !g.sent) { g.sent = true; update(R('reached'), {[user.uid]: true}); msg('You made it out…', 3000); } else if (!g.open) msg('Locked. Find all the keys.', 1500); }
  }
  // enemy
  const e = g.en; if (!isHost) { e.m.position.x += (e.tx - e.m.position.x) * Math.min(1, 10 * dt); e.m.position.z += (e.tz - e.m.position.z) * Math.min(1, 10 * dt);
    e.m.rotation.y = Math.atan2(e.tx - e.m.position.x, e.tz - e.m.position.z) || e.m.rotation.y; } else enemyAI(dt);
  const d = Math.hypot(p.x - e.m.position.x, p.z - e.m.position.z);
  if (!g.dead) {
    if (d < 6 && g.cool <= 0 && g.t > g.grace) jump('enemy');
    if (d < 1.2 && g.inv <= 0 && !g.dead && g.t > g.grace) { g.hp--; g.inv = 4; hudHp(); jump('catch'); update(R('players/' + user.uid), {hp: g.hp});
      if (g.hp <= 0) { g.dead = true; msg('YOU ARE DEAD. Spectating…', 6000); } }
  }
  if (d < 14) { g.beatT -= dt; if (g.beatT <= 0) { g.beatT = Math.max(.4, d / 10); sfx.beat(); setTimeout(sfx.beat, 170); } }
  // flashlight
  g.flOff -= dt; g.flicker = (g.flicker || 0) - dt;
  g.fl.intensity = g.flOn && g.flOff <= 0 && !g.dead ? 3 * (d < 9 || g.flicker > 0 ? (Math.random() < .25 ? .1 : .9) : 1) : 0;
  e.m.children.forEach(c => c.isLight && (c.intensity = .5 + Math.random() * .6));
  // ambient scares
  g.ev -= dt; if (g.ev <= 0 && !g.dead && g.t > 20) ambient();
  g.shake = Math.max(0, g.shake - dt); const sh = g.shake * .05;
  g.cam.rotation.set(g.pitch + (Math.random() - .5) * sh, g.yaw + (Math.random() - .5) * sh, (Math.random() - .5) * sh);
  // remote lerp
  Object.values(g.remote).forEach(r => { const q = r.m.position; q.x += (r.tx - q.x) * Math.min(1, 10 * dt); q.z += (r.tz - q.z) * Math.min(1, 10 * dt); r.m.rotation.y = r.ry; });
  // network
  g.sendT -= dt; if (g.sendT <= 0) { g.sendT = .1;
    update(R('players/' + user.uid), {x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +g.yaw.toFixed(2)}).catch(() => {});
    if (isHost) update(R('enemy'), {x: +e.m.position.x.toFixed(2), z: +e.m.position.z.toFixed(2)}).catch(() => {}); }
}
function loop() { if (!G) return; G.raf = requestAnimationFrame(loop); tick(Math.min(G.clock.getDelta(), .05)); renderer.render(G.scene, G.cam); }

/* ---------- INPUT ---------- */
addEventListener('keydown', e => { K[e.code] = 1; if (e.code === 'KeyF' && G) G.flOn = !G.flOn; });
addEventListener('keyup', e => K[e.code] = 0);
$('cv').addEventListener('click', () => { audio(); if (!document.body.classList.contains('touch')) $('cv').requestPointerLock?.(); });
addEventListener('mousemove', e => { if (G && document.pointerLockElement === $('cv')) { G.yaw -= e.movementX * .0022; G.pitch = Math.max(-1.2, Math.min(1.2, G.pitch - e.movementY * .0022)); } });
$('btnLight').addEventListener('touchstart', e => { e.preventDefault(); if (G) G.flOn = !G.flOn; });
$('btnRun').addEventListener('touchstart', e => { e.preventDefault(); joy.run = !joy.run; $('btnRun').style.background = joy.run ? '#600' : ''; });
let jid = null, lid = null, lx = 0, ly = 0;
$('joy').addEventListener('touchstart', e => { e.preventDefault(); jid = e.changedTouches[0].identifier; });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === jid) { const r = $('joy').getBoundingClientRect(), dx = t.clientX - r.left - 60, dy = t.clientY - r.top - 60, l = Math.min(Math.hypot(dx, dy), 50), a = Math.atan2(dy, dx);
      joy.x = Math.cos(a) * l / 50; joy.y = Math.sin(a) * l / 50; $('knob').style.transform = `translate(${Math.cos(a) * l}px,${Math.sin(a) * l}px)`; }
    else if (t.identifier === lid && G) { G.yaw -= (t.clientX - lx) * .006; G.pitch = Math.max(-1.2, Math.min(1.2, G.pitch - (t.clientY - ly) * .006)); lx = t.clientX; ly = t.clientY; }
  } }, {passive: false});
$('cv').addEventListener('touchstart', e => { audio(); for (const t of e.changedTouches) if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; } });
addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === jid) { jid = null; joy.x = joy.y = 0; $('knob').style.transform = ''; } if (t.identifier === lid) lid = null; } });
