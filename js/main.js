import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAnalytics} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,GoogleAuthProvider,signInWithPopup,signOut,updateProfile} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getDatabase,ref,set,get,update,onValue,onDisconnect,remove,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js?v=5";

const T = THREE, S = 3, $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig); try { getAnalytics(app); } catch (e) {}
const auth = getAuth(app), db = getDatabase(app);
let mySlot, user, code, room, isHost = false, G = null, loadedSeed = null, unsub = null, best = 0, renderer;
const K = {}, joy = {x: 0, y: 0, run: false};
if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('touch');
const show = id => ['auth', 'menu', 'lobby', 'game'].forEach(s => $(s).classList.toggle('d-none', s !== id));
const R = p => ref(db, `rooms/${code}${p ? '/' + p : ''}`);
const nm = () => (user.displayName || user.email?.split('@')[0] || 'Survivor').slice(0, 16);
const pl = () => ({name: nm(), x: 0, z: 0, ry: 0, hp: 3});

const CH = [
 {n: 'Admissions', fog: 0x000000, wall: '#3b3a35', mon: ['S'], intro: `St. Mercy Asylum closed in 1974. Tonight a child's lullaby crackled over every radio in town. You followed it inside. The doors just locked behind you. Something called the Warden walks these halls. Wind the music boxes to silence the lullaby and break the lock.`, notes: ['Admissions ledger: 212 patients admitted. 0 discharged. Dr. Voss signs every page.', `Voss: "Fear is a current. I mean to harness it." The Board refused him. The Board is no longer with us.`]},
 {n: 'The Patient Wards', fog: 0x020a04, wall: '#35403a', mon: ['S', 'C'], intro: 'Rows of cells, doors ripped from their hinges. Something small skitters inside the walls, and something tall keeps pace with you.', notes: ['Ward nurse: They stopped screaming on the third night. That was worse.', 'Patient 77 scratched one sentence into the plaster: "He is not keeping us. He is feeding on us."']},
 {n: 'The Flooded Basement', fog: 0x02060a, wall: '#2a3a45', mon: ['S', 'W'], intro: 'Black water to your ankles. Voss sealed his failures down here. Some of them still drift, the Choir, children Voss could not silence, and they do not need doors. Light drives them back.', notes: ['Maintenance log: pumps off by order of Dr. Voss. "Let the cold keep them quiet."', `A drowned girl's drawing: a tall man, a choir of children, and a heart in the dark.`]},
 {n: `The Children's Ward`, fog: 0x0a0204, wall: '#4a3a3a', mon: ['W', 'C', 'S'], intro: 'Tiny beds. Music boxes wind themselves. The lullaby is louder here, and it knows your names.', notes: ['The Lullaby Project: sixty children, one song, one purpose. Fear that never fades.', 'Voss to the children: "Sing, and you will never be alone." They sang. They still do.']},
 {n: 'The Surgery Theatre', fog: 0x040404, wall: '#3a4545', mon: ['S', 'W', 'C', 'C'], intro: 'The lamp above the table swings though no air moves. Whatever Voss learned, he learned here.', notes: ['Surgical notes: the fear can be extracted. It can be stored. It can be fed to something.', 'His last entry: "The Warden obeys me. The Choir obeys the Warden. The Heart obeys no one."']},
 {n: 'The Chapel Catacombs', fog: 0x050208, wall: '#3a3545', mon: ['S', 'S', 'W', 'W', 'C'], intro: 'Candles burn without wax. Bones are stacked in the shape of a heart. The lullaby has become a hymn.', notes: ['Voss buried himself alive here, willingly, to become the Heart.', 'Carved into the altar: "Burn the heart with light, and the children will sleep."']},
 {n: 'The Heart of Voss', fog: 0x0a0000, wall: '#4a2020', mon: ['B', 'S', 'W', 'C'], intro: 'The walls pulse. The Warden is no longer his servant. It is his body. The exit stays sealed until the Warden falls. Cut it down, then wind the last music box and run.', notes: ['A child\'s voice, very faint: "Please. Let us sleep."', 'The final page is blank except for one word in your own handwriting: "Stay."']}
];
const PROLOGUE = ['1974. St. Mercy Asylum. Dr. Elias Voss swore he could cure fear.', 'He built a machine from the screams of sixty children, and a lullaby to keep them singing.', 'The Board shut him down. Voss was never seen again. Neither were the children.', 'Tonight, every radio in town began to play that lullaby.', 'You came to find out why. You should not have come alone.'];
const EPI = ['The Warden falls. The Heart stops beating.', 'The lullaby fades into silence. For the first time since 1974, the children sleep.', 'You walk out into the dawn. Behind you, one window flickers once... and goes dark.'];
let prologueDone = false;
const EPILOGUE = 'The Heart goes dark. The lullaby fades into silence. For the first time since 1974, St. Mercy is quiet and the children rest. You walk out into the dawn. Behind you, one window flickers once... and goes dark.';

function cine(slides, done) {
  const o = $('cine'), tx = $('cineText'); o.classList.remove('d-none'); let i = 0, tm;
  const fin = () => { clearTimeout(tm); o.classList.add('d-none'); done && done(); };
  $('cineSkip').onclick = fin;
  const next = () => { if (i >= slides.length) return fin(); const t = slides[i++]; tx.style.opacity = 0;
    setTimeout(() => { tx.textContent = t; tx.style.opacity = 1; if (i % 2) sfx.box(); }, 900); tm = setTimeout(next, 900 + 3200 + t.length * 45); };
  next();
}
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
const tmo = (p, ms = 8000) => Promise.race([p, new Promise((_, j) => setTimeout(() => j({code: 'timeout'}), ms))]);
const dbErr = (e, what) => { console.error(e); return e.code === 'timeout' ? 'Database not reachable. Set the correct databaseURL in js/firebase-config.js (Firebase Console > Realtime Database).' : `Could not ${what}: ${e.code || e.message}`; };
const menuErr = m => $('menuErr').textContent = m;
$('btnCreate').onclick = async () => { audio();
  code = Array.from({length: 5}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  menuErr('Creating room…'); try { await tmo(set(R(), {host: user.uid, state: 'lobby', level: 1, seed: 1, createdAt: serverTimestamp(), slots: {s0: user.uid}, players: {[user.uid]: pl()}})); mySlot = 's0'; enter(); }
  catch (e) { menuErr(dbErr(e, 'create room')); } };
$('btnJoin').onclick = async () => { audio(); code = $('joinCode').value.toUpperCase().trim();
  menuErr('Joining…'); try { const s = await tmo(get(R())); if (!s.exists()) return menuErr('Room not found');
    const v = s.val(), n = Object.keys(v.players || {}).length;
    if (v.state !== 'lobby') return menuErr('Game already started');
    mySlot = null; for (const sl of ['s0', 's1', 's2', 's3']) { try { await tmo(set(R('slots/' + sl), user.uid)); mySlot = sl; break; } catch (e) { if (e.code === 'timeout') throw e; } }
    if (!mySlot) return menuErr('Room is full (4/4)');
    await tmo(set(R('players/' + user.uid), pl())); enter(); } catch (e) { menuErr(dbErr(e, 'join room')); } };
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
$('btnStart').onclick = () => update(R(), {state: 'playing', level: +$('startLvl').value || 1, seed: Date.now() % 1e9, keys: null, reached: null, enemies: null, acts: null});
$('btnBack').onclick = () => update(R(), {state: 'lobby', level: 1, keys: null, reached: null, enemies: null, acts: null});

function onRoom(v) {
  if (!v) { code = null; isHost = false; return leave(true); }
  room = v; isHost = v.host === user.uid;
  const ids = Object.keys(v.players || {}).sort();
  $('lobPlayers').innerHTML = ids.map(u => `<li class="list-group-item bg-dark text-light">${v.players[u].name.replace(/</g, '&lt;')}${u === v.host ? ' 👑' : ''}</li>`).join('');
  $('btnStart').classList.toggle('d-none', !isHost); const sel = $('startLvl'), nU = Math.min(best + 1, 7); sel.classList.toggle('d-none', !isHost);
  if (isHost && sel.options.length !== nU) sel.innerHTML = Array.from({length: nU}, (_, i) => `<option value="${i + 1}">Chapter ${i + 1}: ${CH[i].n}</option>`).join(''); $('lobWait').classList.toggle('d-none', isHost);
  if (v.state === 'lobby') { if (G) stopGame(); loadedSeed = null; prologueDone = false; $('endOverlay').classList.add('d-none'); show('lobby'); return; }
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
  const boss = G.enemies.find(e => e.t === 'B'), sealed = boss && boss.hp > 0;
  if (got === G.keys.length && sealed && !G.sealMsg) { G.sealMsg = 1; msg('The exit is sealed while the Heart still beats. Destroy the Warden!', 4500); }
  if (got === G.keys.length && !sealed && !G.open) { G.open = true; G.exitLight.color.set(0x22ff55); G.exitMesh.material.color.set(0x114422); msg('THE EXIT IS OPEN. RUN.', 3500); sfx.thump(); }
  Object.entries(v.enemies || {}).forEach(([i, d]) => { const e = G.enemies[i]; if (!e || !d) return; e.tx = d.x; e.tz = d.z; if (!isHost) { if (d.hp < e.hp) sfx.hit(); e.hp = d.hp; } });
  Object.entries(v.acts || {}).forEach(([u, a]) => { if (G.seen[u] === a.n) return; G.seen[u] = a.n; if (a.k === 'f') spawnFlare(a.x, a.z); if (isHost) applyAct(a); });
  if (isHost) {
    if (ids.every(u => v.players[u].hp <= 0)) update(R(), {state: 'lost'});
    if (v.reached && !G.adv) { G.adv = true;
      if (v.level >= 7) update(R(), {state: 'won'});
      else update(R(), {level: v.level + 1, seed: Date.now() % 1e9, keys: null, reached: null, enemies: null, acts: null}); }
  }
}
function endGame(s) {
  if (G) { if (s === 'won') save(7); stopGame(); } loadedSeed = null;
  $('endTitle').textContent = s === 'won' ? 'YOU ESCAPED' : 'YOU DIED';
  $('endText').textContent = s === 'won' ? EPILOGUE : 'It got all of you.';
  $('btnBack').classList.toggle('d-none', !isHost); $('endOverlay').classList.remove('d-none'); show('lobby');
  if (s === 'won') cine(EPI);
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
  pick() { tone(800, 1700, .25, .25, 'triangle'); },
  swing() { noise(.18, 900, 1, .4, 300); },
  hit() { tone(160, 60, .2, .8, 'square'); noise(.15, 300, 1, .6); },
  flare() { noise(.6, 3000, 1, .4, 800); },
  box() { [523, 659, 784, 659, 587, 698].forEach((f, i) => setTimeout(() => tone(f, f * .99, .9, .1, 'triangle'), i * 420)); }
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
  g.add(b, h, s); return g;
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
const hq = !matchMedia('(pointer:coarse)').matches;
const DEF = {S: {hp: 4, sp: 1.5, r: 1.2}, W: {hp: 3, sp: 1.2, r: 1.1, pass: 1}, C: {hp: 2, sp: 2.6, r: 1}, B: {hp: 14, sp: 1.7, r: 1.8}};
function mkItem(t) {
  const g = new T.Group(), em = (c, i = .9) => new T.MeshStandardMaterial({color: c, emissive: c, emissiveIntensity: i});
  if (t === 'bat') g.add(new T.Mesh(new T.CylinderGeometry(.08, .08, .3, 8), em(0x33ff66)));
  else if (t === 'flare') g.add(new T.Mesh(new T.CylinderGeometry(.05, .05, .4, 8), em(0xff3322)));
  else if (t === 'note') g.add(new T.Mesh(new T.PlaneGeometry(.32, .42), new T.MeshStandardMaterial({color: 0xeeeecc, emissive: 0xaaaa88, emissiveIntensity: .8, side: T.DoubleSide})));
  else { const h = new T.Mesh(new T.BoxGeometry(.06, .7, .06), new T.MeshStandardMaterial({color: 0x5a3a1a})), b = new T.Mesh(new T.BoxGeometry(.32, .2, .05), new T.MeshStandardMaterial({color: 0xaab4c0, metalness: .8, roughness: .3})); b.position.set(.12, .28, 0); g.add(h, b); }
  return g;
}
function mkEnemy(t) {
  const g = new T.Group();
  if (t === 'W') { // ghost
    const mt = new T.MeshBasicMaterial({color: 0x9fd8ff, transparent: true, opacity: .45, depthWrite: false});
    const b = new T.Mesh(new T.ConeGeometry(.5, 1.9, 14, 1, true), mt); b.position.y = 1.1;
    const h = new T.Mesh(new T.SphereGeometry(.22, 12, 10), mt); h.position.y = 2.2;
    const e = new T.MeshBasicMaterial({color: 0x000000}); [-.08, .08].forEach(x => { const q = new T.Mesh(new T.SphereGeometry(.05, 6, 6), e); q.position.set(x, 2.25, .19); g.add(q); });
    const l = new T.PointLight(0x66aaff, .7, 6); l.position.y = 1.8; g.add(b, h, l); return g;
  }
  if (t === 'C') { // crawler
    const m = new T.MeshStandardMaterial({color: 0x120808, roughness: 1}), b = new T.Mesh(new T.SphereGeometry(.35, 10, 8), m); b.scale.set(1, .5, 1.7); b.position.y = .35; g.add(b);
    for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, l = new T.Mesh(new T.CylinderGeometry(.025, .02, .7, 4), m); l.position.set(s * .4, .3, (i % 3 - 1) * .35); l.rotation.z = s * 1.1; g.add(l); }
    const em = new T.MeshBasicMaterial({color: 0xff2200}); [-.1, .1].forEach(x => { const e = new T.Mesh(new T.SphereGeometry(.04, 6, 6), em); e.position.set(x, .4, .55); g.add(e); }); return g;
  }
  const m = new T.MeshStandardMaterial({color: t === 'B' ? 0x1a0505 : 0x0a0a0a, roughness: 1});
  const body = new T.Mesh(new T.CylinderGeometry(.25, .35, 1.8, 8), m); body.position.y = 1.2;
  const head = new T.Mesh(new T.SphereGeometry(.22, 10, 10), new T.MeshStandardMaterial({color: 0xcfc8bd, roughness: .9})); head.scale.y = 1.5; head.position.y = 2.35;
  const em = new T.MeshBasicMaterial({color: 0xff1111}); [-.08, .08].forEach(x => { const e = new T.Mesh(new T.SphereGeometry(.035, 6, 6), em); e.position.set(x, 2.4, .18); g.add(e); });
  [-1, 1].forEach(s => { const a = new T.Mesh(new T.CylinderGeometry(.05, .04, 1.6, 5), m); a.position.set(s * .4, 1.2, .15); a.rotation.set(-.3, 0, s * .12); g.add(a); });
  const l = new T.PointLight(0xff0000, .8, 7); l.position.y = 2.4; g.add(body, head, l); if (t === 'B') g.scale.setScalar(1.9); return g;
}
function startLevel(level, seed) {
  stopGame(); loadedSeed = seed; audio();
  const c = CH[level - 1], r = rng(seed), N = Math.min(4 + level, 11), m = gen(N, r), W = m.length;
  if (!renderer) { renderer = new T.WebGLRenderer({canvas: $('cv'), antialias: hq}); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.shadowMap.type = T.PCFSoftShadowMap; }
  renderer.shadowMap.enabled = hq; renderer.setPixelRatio(Math.min(devicePixelRatio, hq ? 2 : 1.5));
  const scene = new T.Scene(); scene.background = new T.Color(c.fog); scene.fog = new T.FogExp2(c.fog, .08 + level * .004);
  const cam = new T.PerspectiveCamera(72, 1, .1, 60); cam.rotation.order = 'YXZ'; scene.add(cam);
  scene.add(new T.AmbientLight(0x2a2233, .45));
  const fl = new T.SpotLight(0xfff1d0, 3, 28, Math.PI / 5, .55, 1.3); fl.position.set(.2, -.2, 0); cam.add(fl, fl.target); fl.target.position.set(0, 0, -5);
  if (hq) { fl.castShadow = true; fl.shadow.mapSize.set(1024, 1024); fl.shadow.camera.near = .3; fl.shadow.camera.far = 28; fl.shadow.bias = -.0005; }
  cam.add(new T.PointLight(0x442222, .6, 6));
  const wt = tex(c.wall, 'rgba(80,0,0,.5)', 900), walls = []; m.forEach((row, y) => row.forEach((v, x) => v && walls.push([x, y])));
  const wm = new T.InstancedMesh(new T.BoxGeometry(S, 3.2, S), new T.MeshStandardMaterial({map: wt, bumpMap: wt, bumpScale: 1.2, roughness: .95}), walls.length);
  const dm = new T.Object3D(); walls.forEach(([x, y], i) => { dm.position.set((x + .5) * S, 1.6, (y + .5) * S); dm.updateMatrix(); wm.setMatrixAt(i, dm.matrix); }); wm.castShadow = wm.receiveShadow = hq; scene.add(wm);
  const ft = tex('#2a2623', 'rgba(60,0,0,.6)', 1200); ft.repeat.set(W, W);
  const fm = new T.Mesh(new T.PlaneGeometry(W * S, W * S), new T.MeshStandardMaterial({map: ft, bumpMap: ft, roughness: .8})); fm.rotation.x = -Math.PI / 2; fm.position.set(W * S / 2, 0, W * S / 2); fm.receiveShadow = hq; scene.add(fm);
  const ct = tex('#1c1b19', 'rgba(0,0,0,.6)', 300); ct.repeat.set(W, W);
  const cm = new T.Mesh(new T.PlaneGeometry(W * S, W * S), new T.MeshStandardMaterial({map: ct})); cm.rotation.x = Math.PI / 2; cm.position.set(W * S / 2, 3.2, W * S / 2); scene.add(cm);
  const all = []; for (let y = 1; y < W; y += 2) for (let x = 1; x < W; x += 2) if (!(x === 1 && y === 1) && !(x === 3 && y === 1) && !(x === W - 2 && (y === W - 2 || y === 1))) all.push([x, y]);
  all.sort(() => r() - .5); let ci = 0; const take = () => all[ci++ % all.length], cc = (x, y) => [(x + .5) * S, (y + .5) * S];
  for (let i = 0; i < Math.min(14, all.length); i++) { const [x, y] = cc(...all[i]), lm = new T.Mesh(new T.BoxGeometry(.9, .08, .3), new T.MeshBasicMaterial({color: i % 3 ? 0x6a5a3a : 0x221a10})); lm.position.set(x, 3.15, y); scene.add(lm); }
  const keys = Array.from({length: 3 + (level >> 1)}, () => { const [x, z] = cc(...take()), k = new T.Mesh(new T.BoxGeometry(.25, .5, .1), new T.MeshStandardMaterial({color: 0xffcc33, emissive: 0xffaa00, emissiveIntensity: 1.5}));
    k.position.set(x, 1.1, z); scene.add(k); return {m: k, x, z, taken: false}; });
  const items = [], addI = (t, x, z, text) => { const mm = mkItem(t); mm.position.set(x, .9, z); scene.add(mm); items.push({t, m: mm, x, z, y: .9, taken: false, text}); };
  addI('axe', ...cc(3, 1)); for (let i = 0; i < 4; i++) addI('bat', ...cc(...take())); for (let i = 0; i < 2; i++) addI('flare', ...cc(...take())); c.notes.forEach(tx => addI('note', ...cc(...take()), tx));
  const axe = mkItem('axe'); axe.scale.setScalar(1.1); axe.position.set(.38, -.45, -.75); axe.rotation.set(0, 0, .35); axe.visible = false; cam.add(axe);
  const ex = (W - 1.5) * S, ez = (W - 1.5) * S;
  const exitMesh = new T.Mesh(new T.BoxGeometry(2, 2.8, .3), new T.MeshStandardMaterial({color: 0x330000, emissive: 0x220000})); exitMesh.position.set(ex, 1.4, ez); scene.add(exitMesh);
  const exitLight = new T.PointLight(0xff2222, 2, 9); exitLight.position.set(ex, 2, ez); scene.add(exitLight);
  const far = all.filter(([x, y]) => x + y > W * .7), enemies = c.mon.map((t, i) => { const [x, z] = i ? cc(...far[(i * 3) % far.length]) : cc(W - 2, 1), mm = mkEnemy(t); mm.position.set(x, 0, z); scene.add(mm);
    return {m: mm, t, def: DEF[t], hp: DEF[t].hp, stun: 0, rc: 0, next: null, tx: x, tz: z}; });
  const fpool = Array.from({length: 3}, () => { const l = new T.PointLight(0xff4422, 0, 16); l.position.y = -20; scene.add(l); return {l, t: 0}; });
  cam.position.set(1.5 * S, 1.6, 1.5 * S);
  G = {scene, cam, fl, map: m, level, keys, items, enemies, axe, fpool, fi: 0, exitMesh, exitLight, ex, ez, remote: {}, seen: {}, open: false, adv: false, yaw: Math.PI, pitch: 0, bob: 0, stepT: 0, t: 0, sendT: 0, beatT: 0, hudT: 0,
    grace: 22, hp: 3, inv: 0, dead: false, cool: 0, shake: 0, flOn: true, flOff: 0, bat: 100, flares: 0, weapon: false, notes: 0, atk: 0, swing: 0, near: null, actN: 0,
    ev: 25 + r() * 10, clock: new T.Clock(), raf: 0, sent: false};
  show('game'); $('endOverlay').classList.add('d-none'); $('ghost').src = faceImg(); resize(); hud(); save(level);
  if (level === 1 && !prologueDone) { G.paused = true; cine(PROLOGUE, () => { prologueDone = true; if (G) { G.paused = false; story(c, level); } }); } else story(c, level);
  update(R('players/' + user.uid), {hp: 3, x: cam.position.x, z: cam.position.z});
  loop();
}
function stopGame() { if (G) { cancelAnimationFrame(G.raf); G = null; } }
function resize() { if (!G) return; renderer.setSize(innerWidth, innerHeight, false); G.cam.aspect = innerWidth / innerHeight; G.cam.updateProjectionMatrix(); }
addEventListener('resize', resize);

/* ---------- HUD / STORY / SCARES ---------- */
let msgT; const msg = (t, ms = 2500) => { const e = $('hudMsg'); e.textContent = t; e.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(() => e.classList.remove('on'), ms); };
function hud() { if (!G) return; const got = G.keys.filter(k => k.taken).length, h = Math.max(G.hp, 0);
  $('hudKeys').textContent = `🎵 ${got}/${G.keys.length}  📜 ${G.notes}/2`;
  $('hudHp').textContent = '❤'.repeat(h) + '🖤'.repeat(3 - h) + `  🔋${Math.round(G.bat)}%  🕯${G.flares}` + (G.weapon ? '  🪓' : ''); }
const hudKeys = () => hud(), hudHp = hud;
function story(c, level) { const s = $('story'); s.innerHTML = `<small>CHAPTER ${level} OF 7</small><h2>${c.n}</h2><p>${c.intro}</p><small>${document.body.classList.contains('touch') ? 'Stick: move · drag right: look · ⚔ attack · 🕯 flare · ✋ interact' : 'Click to look · WASD move · E interact · F light · R flare · Click/Space attack'}</small>`;
  s.classList.add('on'); setTimeout(() => s.classList.remove('on'), 11000); }
function readNote(t) { const n = $('note'); n.innerHTML = `<b>📜 Journal page</b><p>${t}</p><small>E / tap to close</small>`; n.classList.remove('d-none'); clearTimeout(readNote.h); readNote.h = setTimeout(() => n.classList.add('d-none'), 12000); }
$('note').onclick = () => $('note').classList.add('d-none');
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

/* ---------- ITEMS & COMBAT ---------- */
function collect(it) { if (!it || it.taken) return; it.taken = true; it.m.visible = false; sfx.pick();
  if (it.t === 'bat') { G.bat = Math.min(100, G.bat + 45); G.warned = 0; msg('Battery +45%', 1500); }
  else if (it.t === 'flare') { G.flares++; msg('Flare collected — press R to light it', 2200); }
  else if (it.t === 'axe') { G.weapon = true; G.axe.visible = true; msg('Fire Axe equipped. Click / Space / ⚔ to swing.', 3200); }
  else { G.notes++; readNote(it.text); }
  hud(); }
function use() { if (!G || G.dead) return; if (!$('note').classList.contains('d-none')) return $('note').classList.add('d-none'); collect(G.near); }
function act(k, i = 0) { const p = G.cam.position; update(R('acts/' + user.uid), {n: ++G.actN, k, i, x: +p.x.toFixed(2), z: +p.z.toFixed(2)}).catch(() => {}); }
function attack() { const g = G; if (!g || g.dead || !g.weapon || g.atk > 0) return; g.atk = .7; g.swing = .3; sfx.swing();
  const p = g.cam.position, fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw); let bi = -1, bd = 2.8;
  g.enemies.forEach((e, i) => { if (e.hp <= 0) return; const dx = e.m.position.x - p.x, dz = e.m.position.z - p.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > .45) { bd = d; bi = i; } });
  if (bi >= 0) { sfx.hit(); g.shake = .25; act('h', bi); } }
function flare() { const g = G; if (!g || g.dead || g.flares <= 0) return; g.flares--; act('f'); hud(); }
function spawnFlare(x, z) { const f = G.fpool[G.fi++ % G.fpool.length]; f.t = 14; f.l.position.set(x, 1.2, z); sfx.flare(); }
function killE(e) { e.hp = 0; e.m.visible = false; sfx.thump(); }
function applyAct(a) { // host only
  if (a.k === 'h') { const e = G.enemies[a.i]; if (e && e.hp > 0) { e.hp--; e.stun = 1.3; if (e.hp <= 0) killE(e); } }
  else if (a.k === 'f') G.enemies.forEach(e => { if (e.hp > 0 && Math.hypot(e.m.position.x - a.x, e.m.position.z - a.z) < 10) { e.stun = e.t === 'B' ? 3 : 6; if (e.t === 'W' && --e.hp <= 0) killE(e); } }); }

/* ---------- GAME LOOP ---------- */
const solid = (x, z) => G.map[Math.floor(z / S)]?.[Math.floor(x / S)] !== 0;
function tryMove(dx, dz) { const p = G.cam.position, r = .35, ok = (x, z) => !(solid(x + r, z + r) || solid(x - r, z + r) || solid(x + r, z - r) || solid(x - r, z - r));
  if (ok(p.x + dx, p.z)) p.x += dx; if (ok(p.x, p.z + dz)) p.z += dz; }
const targets = () => { const a = []; if (!G.dead) a.push({x: G.cam.position.x, z: G.cam.position.z});
  Object.values(G.remote).forEach(r => r.hp > 0 && a.push({x: r.m.position.x, z: r.m.position.z})); return a; };
function enemyAI(e, dt) {
  const p = e.m.position; if (G.t < G.grace) return; if (e.stun > 0) { e.stun -= dt; return; }
  let best = null, bd = 1e9; targets().forEach(t => { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd) { bd = d; best = t; } });
  if (!best) return; if (bd < e.def.r) { e.stun = 3.5; return; }
  const sp0 = e.def.sp * (1 + .05 * G.level) * (bd < 9 ? 1.35 : 1) * dt;
  if (e.def.pass) { const sp = Math.min(sp0, bd); p.x += (best.x - p.x) / bd * sp; p.z += (best.z - p.z) / bd * sp; e.m.rotation.y = Math.atan2(best.x - p.x, best.z - p.z); return; }
  e.rc -= dt; if (e.rc <= 0) { e.rc = .35; e.next = bfs(G.map, p.x / S | 0, p.z / S | 0, best.x / S | 0, best.z / S | 0); }
  if (e.next) { const nx = (e.next[0] + .5) * S, nz = (e.next[1] + .5) * S, dx = nx - p.x, dz = nz - p.z, dd = Math.hypot(dx, dz) || 1, sp = Math.min(sp0, dd);
    p.x += dx / dd * sp; p.z += dz / dd * sp; e.m.rotation.y = Math.atan2(dx, dz); }
}
function tick(dt) {
  const g = G, p = g.cam.position; g.t += dt; g.cool -= dt; g.inv -= dt; g.atk -= dt; g.hudT -= dt;
  if (!g.dead) {
    g.yaw += ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * 2 * dt;
    const fy = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - joy.y, fx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + joy.x;
    const len = Math.hypot(fx, fy), run = K.ShiftLeft || joy.run, sp = (run ? 4.6 : 2.8) * dt;
    if (len > .05) { const n = Math.min(len, 1) / len, sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
      tryMove((-sy * fy + cy * fx) * n * sp, (-cy * fy - sy * fx) * n * sp); g.bob += dt * (run ? 11 : 7); g.stepT -= dt; if (g.stepT <= 0) { g.stepT = run ? .3 : .48; sfx.step(); } }
    p.y = 1.6 + (len > .05 ? Math.sin(g.bob) * .035 : 0);
    g.keys.forEach((k, i) => { if (!k.taken && Math.hypot(p.x - k.x, p.z - k.z) < 1.4) { k.taken = true; k.m.visible = false; sfx.pick(); msg('Music box wound. The lullaby weakens.', 2200); update(R('keys'), {['k' + i]: true}); } });
    if (Math.hypot(p.x - g.ex, p.z - g.ez) < 1.8) { if (g.open && !g.sent) { g.sent = true; update(R('reached'), {[user.uid]: true}); msg('You made it out…', 3000); } else if (!g.open) msg('Locked. Find all the keys.', 1500); }
    let nr = null, nd = 1.7;
    g.items.forEach(it => { if (it.taken) return; const d = Math.hypot(p.x - it.x, p.z - it.z); it.m.rotation.y += dt; it.m.position.y = it.y + Math.sin(g.t * 2 + it.x) * .05;
      if (d < 1.2 && (it.t === 'bat' || it.t === 'flare')) collect(it); else if (d < nd) { nd = d; nr = it; } });
    g.near = nr; $('prompt').textContent = nr ? (nr.t === 'axe' ? 'Pick up Fire Axe' : 'Read journal page') + ' — E / ✋' : '';
  } else $('prompt').textContent = '';
  let dmin = 99;
  g.enemies.forEach((e, i) => {
    const q = e.m.position; if (e.hp <= 0) { e.m.visible = false; return; }
    if (isHost) enemyAI(e, dt); else { const k = Math.min(1, 10 * dt); q.x += (e.tx - q.x) * k; q.z += (e.tz - q.z) * k; e.m.rotation.y = Math.atan2(e.tx - q.x, e.tz - q.z) || e.m.rotation.y; }
    if (e.t === 'W') { q.y = .3 + Math.sin(g.t * 2 + i) * .15; e.m.children[0].material.opacity = .3 + Math.random() * .25; }
    const d = Math.hypot(p.x - q.x, p.z - q.z); dmin = Math.min(dmin, d);
    if (!g.dead && g.t > g.grace && d < e.def.r && g.inv <= 0) { g.hp--; g.inv = 4; hud(); jump('catch'); update(R('players/' + user.uid), {hp: g.hp});
      if (g.hp <= 0) { g.dead = true; msg('YOU ARE DEAD. Spectating…', 6000); } }
  });
  if (dmin < 6 && g.cool <= 0 && g.t > g.grace) jump('enemy');
  if (dmin < 14) { g.beatT -= dt; if (g.beatT <= 0) { g.beatT = Math.max(.4, dmin / 10); sfx.beat(); setTimeout(sfx.beat, 170); } }
  g.flOff -= dt; g.flicker = (g.flicker || 0) - dt; if (g.flOn && !g.dead) g.bat = Math.max(0, g.bat - dt * .9);
  if (g.bat <= 0 && !g.warned) { g.warned = 1; msg('Flashlight dead. Find batteries!', 3000); }
  const bk = g.bat > 15 ? 1 : g.bat / 15;
  g.fl.intensity = g.flOn && g.flOff <= 0 && !g.dead && g.bat > 0 ? 3 * bk * (dmin < 9 || g.flicker > 0 ? (Math.random() < .25 ? .1 : .9) : 1) : 0;
  g.fpool.forEach(f => { if (f.t > 0) { f.t -= dt; f.l.intensity = f.t > 0 ? 2.5 * (.8 + Math.random() * .4) : 0; if (f.t <= 0) f.l.position.y = -20; } });
  if (g.swing > 0) { g.swing -= dt; g.axe.rotation.x = -Math.sin(g.swing / .3 * Math.PI) * 1.3; } else g.axe.rotation.x = 0;
  if (g.hudT <= 0) { g.hudT = .5; hud(); }
  g.ev -= dt; if (g.ev <= 0 && !g.dead && g.t > 20) ambient();
  g.shake = Math.max(0, g.shake - dt); const sh = g.shake * .05;
  g.cam.rotation.set(g.pitch + (Math.random() - .5) * sh, g.yaw + (Math.random() - .5) * sh, (Math.random() - .5) * sh);
  Object.values(g.remote).forEach(r => { const q = r.m.position; q.x += (r.tx - q.x) * Math.min(1, 10 * dt); q.z += (r.tz - q.z) * Math.min(1, 10 * dt); r.m.rotation.y = r.ry; });
  g.sendT -= dt; if (g.sendT <= 0) { g.sendT = .1;
    update(R('players/' + user.uid), {x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +g.yaw.toFixed(2)}).catch(() => {});
    if (isHost) { const o = {}; g.enemies.forEach((e, i) => { o[i + '/x'] = +e.m.position.x.toFixed(2); o[i + '/z'] = +e.m.position.z.toFixed(2); o[i + '/hp'] = e.hp; }); update(R('enemies'), o).catch(() => {}); } }
}
function loop() { if (!G) return; G.raf = requestAnimationFrame(loop); const dt = Math.min(G.clock.getDelta(), .05); if (!G.paused) tick(dt); renderer.render(G.scene, G.cam); }

/* ---------- INPUT ---------- */
const cv = $('cv'), locked = () => document.pointerLockElement === cv;
addEventListener('keydown', e => { if (!G) return; K[e.code] = 1; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyF') G.flOn = !G.flOn; if (e.code === 'KeyE') use(); if (e.code === 'KeyR') flare(); if (e.code === 'Space') attack(); });
addEventListener('keyup', e => K[e.code] = 0);
cv.addEventListener('mousedown', e => { audio(); if (!locked()) { if (matchMedia('(pointer:fine)').matches) cv.requestPointerLock?.(); } else if (e.button === 0) attack(); });
addEventListener('mousemove', e => { if (G && (locked() || e.buttons & 1)) { G.yaw -= e.movementX * .0022; G.pitch = Math.max(-1.2, Math.min(1.2, G.pitch - e.movementY * .0022)); } });
const tap = (id, f) => $(id).addEventListener('touchstart', e => { e.preventDefault(); f(); });
tap('btnLight', () => G && (G.flOn = !G.flOn)); tap('btnAtk', attack); tap('btnUse', use); tap('btnFlare', flare);
tap('btnRun', () => { joy.run = !joy.run; $('btnRun').style.background = joy.run ? '#600' : ''; });
let jid = null, lid = null, lx = 0, ly = 0;
$('joy').addEventListener('touchstart', e => { e.preventDefault(); jid = e.changedTouches[0].identifier; });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === jid) { const r = $('joy').getBoundingClientRect(), dx = t.clientX - r.left - 60, dy = t.clientY - r.top - 60, l = Math.min(Math.hypot(dx, dy), 50), a = Math.atan2(dy, dx);
      joy.x = Math.cos(a) * l / 50; joy.y = Math.sin(a) * l / 50; $('knob').style.transform = `translate(${Math.cos(a) * l}px,${Math.sin(a) * l}px)`; }
    else if (t.identifier === lid && G) { G.yaw -= (t.clientX - lx) * .006; G.pitch = Math.max(-1.2, Math.min(1.2, G.pitch - (t.clientY - ly) * .006)); lx = t.clientX; ly = t.clientY; }
  } }, {passive: false});
cv.addEventListener('touchstart', e => { audio(); for (const t of e.changedTouches) if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; } });
addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === jid) { jid = null; joy.x = joy.y = 0; $('knob').style.transform = ''; } if (t.identifier === lid) lid = null; } });
