/**
 * DEAD STREETS – 4-player co-op zombie survival PWA
 * Town exploration · proper zombie models · guns · safe zones · 5 progressive maps
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, get, update, onValue, onDisconnect,
  remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const T = THREE;
const CELL = 8; // large open blocks for town feel
const $ = id => document.getElementById(id);

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (_) {}
const auth = getAuth(app);
const db = getDatabase(app);

let mySlot, user, code, room, isHost = false, G = null;
let loadedSeed = null, unsub = null, best = 0, renderer;
let soloMode = false;
const K = {};
const joy = { x: 0, y: 0, run: false };

if (matchMedia("(pointer:coarse)").matches) document.body.classList.add("touch");

const show = id => ["auth","menu","lobby","game"].forEach(s => $(s).classList.toggle("d-none", s !== id));
const R = p => ref(db, `rooms/${code}${p ? "/" + p : ""}`);
const nm = () => (user?.displayName || user?.email?.split("@")[0] || "Survivor").slice(0, 16);
const pl = () => ({ name: nm(), x: 0, z: 0, ry: 0, hp: 5 });

/* ---------- 5 MAPS + STORY ---------- */
const MAPS = [
  {
    n: "Outskirts",
    fog: 0x0a0c08,
    ground: "#2a2e22",
    intro: "Radio chatter died an hour ago. The highway is blocked with abandoned cars. Somewhere past the treeline the town of Millfield is still crawling. Find weapons. Reach the residential sector.",
    notes: [
      "Militia note: Roadblocks failed by 02:00. Infected moved faster than expected. Fall back to the houses.",
      "Dashboard photo: family smiling in front of a blue house on Elm Street. The blue house is still standing."
    ],
    zCount: 14,
    safeCount: 1,
    goal: "Reach the green extraction flare"
  },
  {
    n: "Residential",
    fog: 0x0c0a08,
    ground: "#2c2820",
    intro: "Quiet streets. Curtains still drawn. Something is feeding in the back yards. Clear a path through the neighborhood and push toward downtown.",
    notes: [
      "Kid's diary: Mom said the people outside are sick. Dad boarded the windows. Then Dad started coughing.",
      "Police radio: All units fall back to the precinct. Do not engage large groups."
    ],
    zCount: 20,
    safeCount: 2,
    goal: "Reach the green extraction flare"
  },
  {
    n: "Downtown",
    fog: 0x0a080c,
    ground: "#262228",
    intro: "Main Street is a graveyard of cars and broken glass. The infected are thicker here. Use the safe houses. Keep moving toward the hospital.",
    notes: [
      "Store log: Last customer paid with a bloody twenty. We locked the doors. It didn't help.",
      "Evac flyer: Hospital rooftop designated secondary extraction. Primary site compromised."
    ],
    zCount: 26,
    safeCount: 2,
    goal: "Reach the green extraction flare"
  },
  {
    n: "Hospital District",
    fog: 0x0c0608,
    ground: "#2a2224",
    intro: "Ambulances still flash in the dark. The hospital was the first to fall. Whatever started here is still spreading. Push through to the extraction point.",
    notes: [
      "Doctor's log: Patient zero arrived 48 hours ago. By morning half the ward was symptomatic.",
      "Final broadcast: If you can hear this, the military is establishing a perimeter north of town. Get there."
    ],
    zCount: 32,
    safeCount: 2,
    goal: "Reach the green extraction flare"
  },
  {
    n: "Extraction Point",
    fog: 0x080a0c,
    ground: "#22262a",
    intro: "The last open road out of Millfield. Helicopters were supposed to be waiting. Clear the landing zone and hold until extraction arrives. This is the end of the line.",
    notes: [
      "Pilot message: LZ is hot. Multiple contacts. We need a green flare and a clear window.",
      "Final order: No one left behind. Clear the zone. Get on the bird."
    ],
    zCount: 38,
    safeCount: 2,
    goal: "Hold the extraction zone and escape"
  }
];

const PROLOGUE = [
  "Millfield went dark three nights ago.",
  "The last transmission was a single sentence: \"They're not sick. They're hungry.\"",
  "Military cordon is 40 klicks out and not coming closer.",
  "You and whoever is left are the only ones still answering the radio.",
  "Clear the town sector by sector. Reach the extraction. Don't become one of them."
];
const EPI = [
  "The rotors cut through the smoke.",
  "You climb aboard. Below you the streets of Millfield keep moving.",
  "Someone on the radio asks how many made it.",
  "You look at the empty seats and don't answer."
];
const EPILOGUE = "The helicopter climbs. Millfield shrinks into a dark stain on the map. You survived. The town did not. Somewhere below, the dead keep walking.";

let prologueDone = false;

/* ---------- CINEMATIC ---------- */
function cine(slides, done) {
  const o = $("cine"), tx = $("cineText");
  o.classList.remove("d-none");
  let i = 0, tm;
  const fin = () => { clearTimeout(tm); o.classList.add("d-none"); done && done(); };
  $("cineSkip").onclick = fin;
  const next = () => {
    if (i >= slides.length) return fin();
    const t = slides[i++];
    tx.style.opacity = 0;
    setTimeout(() => { tx.textContent = t; tx.style.opacity = 1; if (i % 2) sfx.radio(); }, 800);
    tm = setTimeout(next, 800 + 3000 + t.length * 40);
  };
  next();
}

/* ---------- AUTH ---------- */
const aerr = m => $("authErr").textContent = m.replace("auth/", "").replace(/-/g, " ");
$("btnLogin").onclick = () => signInWithEmailAndPassword(auth, $("email").value, $("pass").value).catch(e => aerr(e.code));
$("btnReg").onclick = async () => {
  try {
    const c = await createUserWithEmailAndPassword(auth, $("email").value, $("pass").value);
    await updateProfile(c.user, { displayName: $("nick").value.trim() || "Survivor" });
    $("who").textContent = nm();
  } catch (e) { aerr(e.code); }
};
$("btnGoogle").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => aerr(e.code));
$("btnOut").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  user = u;
  if (!u) { leave(); return show("auth"); }
  show("menu");
  $("who").textContent = nm();
  try {
    const s = await get(ref(db, "users/" + u.uid));
    best = s.val()?.bestLevel || 0;
    $("best").textContent = best;
  } catch (_) {}
});

const save = lvl => {
  best = Math.max(best, lvl);
  $("best").textContent = best;
  if (user) update(ref(db, "users/" + user.uid), { name: nm(), bestLevel: best }).catch(() => {});
};

/* ---------- ROOMS ---------- */
const tmo = (p, ms = 9000) => Promise.race([p, new Promise((_, j) => setTimeout(() => j({ code: "timeout" }), ms))]);
const dbErr = (e, what) => {
  console.error(e);
  return e.code === "timeout" ? "Database not reachable." : `Could not ${what}: ${e.code || e.message}`;
};
const menuErr = m => $("menuErr").textContent = m;

$("btnCreate").onclick = async () => {
  soloMode = false; audio();
  code = Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.random() * 32 | 0]).join("");
  menuErr("Creating squad…");
  try {
    await tmo(set(R(), {
      host: user.uid, state: "lobby", level: 1, seed: 1,
      createdAt: serverTimestamp(), slots: { s0: user.uid },
      players: { [user.uid]: pl() }
    }));
    mySlot = "s0"; enter();
  } catch (e) { menuErr(dbErr(e, "create squad")); }
};

$("btnJoin").onclick = async () => {
  soloMode = false; audio();
  code = $("joinCode").value.toUpperCase().trim();
  menuErr("Joining…");
  try {
    const s = await tmo(get(R()));
    if (!s.exists()) return menuErr("Squad not found");
    const v = s.val();
    if (v.state !== "lobby") return menuErr("Already deployed");
    mySlot = null;
    for (const sl of ["s0","s1","s2","s3"]) {
      try { await tmo(set(R("slots/" + sl), user.uid)); mySlot = sl; break; }
      catch (e) { if (e.code === "timeout") throw e; }
    }
    if (!mySlot) return menuErr("Squad full (4/4)");
    await tmo(set(R("players/" + user.uid), pl()));
    enter();
  } catch (e) { menuErr(dbErr(e, "join squad")); }
};

$("btnSolo").onclick = () => {
  soloMode = true; audio();
  code = "SOLO"; isHost = true; mySlot = "s0";
  room = { host: user.uid, state: "lobby", level: 1, seed: Date.now() % 1e9, players: { [user.uid]: pl() } };
  $("lobCode").textContent = "SOLO"; $("hudRoom").textContent = "SOLO";
  $("lobPlayers").innerHTML = `<li class="list-group-item bg-dark text-light">${nm()} 👑</li>`;
  $("btnStart").classList.remove("d-none"); $("lobWait").classList.add("d-none");
  const sel = $("startLvl");
  const nU = Math.min(best + 1, 5);
  sel.classList.remove("d-none");
  sel.innerHTML = Array.from({ length: nU }, (_, i) => `<option value="${i + 1}">Sector ${i + 1}: ${MAPS[i].n}</option>`).join("");
  show("lobby");
};

function enter() {
  menuErr("");
  onDisconnect(R()).update({ ["players/" + user.uid]: null, ["slots/" + mySlot]: null }).catch(() => {});
  $("lobCode").textContent = code; $("hudRoom").textContent = code;
  unsub = onValue(R(), s => onRoom(s.val()));
  show("lobby");
}

async function leave(kicked) {
  if (unsub) { unsub(); unsub = null; }
  if (G) stopGame();
  if (!soloMode && code && user) {
    try { isHost ? await remove(R()) : await update(R(), { ["players/" + user.uid]: null, ["slots/" + mySlot]: null }); } catch (_) {}
  }
  code = null; room = null; loadedSeed = null; soloMode = false;
  $("endOverlay").classList.add("d-none");
  if (user) { show("menu"); if (kicked) menuErr("Squad disbanded."); }
}
$("btnLeave").onclick = () => leave();
$("btnQuit").onclick = () => leave();

$("btnStart").onclick = () => {
  const lvl = +$("startLvl").value || 1;
  if (soloMode) {
    room.state = "playing"; room.level = lvl; room.seed = Date.now() % 1e9;
    startLevel(lvl, room.seed); return;
  }
  update(R(), { state: "playing", level: lvl, seed: Date.now() % 1e9, keys: null, reached: null, enemies: null, acts: null });
};

$("btnBack").onclick = () => {
  if (soloMode) {
    room.state = "lobby"; room.level = 1; loadedSeed = null; stopGame();
    show("lobby"); $("endOverlay").classList.add("d-none"); return;
  }
  update(R(), { state: "lobby", level: 1, keys: null, reached: null, enemies: null, acts: null });
};

function onRoom(v) {
  if (soloMode) return;
  if (!v) { code = null; isHost = false; return leave(true); }
  room = v; isHost = v.host === user.uid;
  const ids = Object.keys(v.players || {}).sort();
  $("lobPlayers").innerHTML = ids.map(u =>
    `<li class="list-group-item bg-dark text-light">${v.players[u].name.replace(/</g,"&lt;")}${u === v.host ? " 👑" : ""}</li>`
  ).join("");
  $("btnStart").classList.toggle("d-none", !isHost);
  const sel = $("startLvl");
  const nU = Math.min(best + 1, 5);
  sel.classList.toggle("d-none", !isHost);
  if (isHost && sel.options.length !== nU)
    sel.innerHTML = Array.from({ length: nU }, (_, i) => `<option value="${i + 1}">Sector ${i + 1}: ${MAPS[i].n}</option>`).join("");
  $("lobWait").classList.toggle("d-none", isHost);

  if (v.state === "lobby") {
    if (G) stopGame(); loadedSeed = null; prologueDone = false;
    $("endOverlay").classList.add("d-none"); show("lobby"); return;
  }
  if (v.state === "playing" && loadedSeed !== v.seed) startLevel(v.level, v.seed);
  if (v.state === "won" || v.state === "lost") return endGame(v.state);
  if (!G) return;

  // remote players
  ids.forEach((u, i) => {
    if (u === user.uid) return;
    const p = v.players[u];
    let r = G.remote[u];
    if (!r) {
      r = G.remote[u] = { m: mkPlayer(p, i), tx: p.x, tz: p.z, ry: 0, hp: 5 };
      r.m.position.set(p.x, 0, p.z); G.scene.add(r.m);
    }
    r.tx = p.x; r.tz = p.z; r.ry = p.ry; r.hp = p.hp; r.m.visible = p.hp > 0;
  });
  Object.keys(G.remote).forEach(u => {
    if (!v.players[u]) { G.scene.remove(G.remote[u].m); delete G.remote[u]; }
  });

  Object.entries(v.enemies || {}).forEach(([i, d]) => {
    const e = G.enemies[i]; if (!e || !d) return;
    e.tx = d.x; e.tz = d.z;
    if (!isHost) { if (d.hp < e.hp) sfx.hit(); e.hp = d.hp; }
  });
  Object.entries(v.acts || {}).forEach(([u, a]) => {
    if (G.seen[u] === a.n) return;
    G.seen[u] = a.n;
    if (isHost) applyAct(a);
  });

  if (isHost) {
    if (ids.every(u => v.players[u].hp <= 0)) update(R(), { state: "lost" });
    if (v.reached && !G.adv) {
      G.adv = true;
      if (v.level >= 5) update(R(), { state: "won" });
      else update(R(), { level: v.level + 1, seed: Date.now() % 1e9, keys: null, reached: null, enemies: null, acts: null });
    }
  }
}

function endGame(s) {
  if (G) { if (s === "won") save(5); stopGame(); }
  loadedSeed = null;
  $("endTitle").textContent = s === "won" ? "EXTRACTED" : "OVERRUN";
  $("endText").textContent = s === "won" ? EPILOGUE : "The dead took the town. And you.";
  $("btnBack").classList.toggle("d-none", !isHost && !soloMode);
  $("endOverlay").classList.remove("d-none"); show("lobby");
  if (s === "won") cine(EPI);
}

/* ---------- AUDIO ---------- */
let AC, nb;
function audio() {
  if (AC) { AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const a = AC.createOscillator(), b = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  a.type = "sawtooth"; a.frequency.value = 38; b.frequency.value = 40.5;
  f.frequency.value = 90; g.gain.value = 0.04;
  a.connect(f); b.connect(f); f.connect(g); g.connect(AC.destination); a.start(); b.start();
}
function noise(dur, fq, q, vol, sw) {
  if (!AC) return;
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime;
  s.buffer = nb; f.type = "bandpass"; f.frequency.setValueAtTime(fq, t);
  if (sw) f.frequency.exponentialRampToValueAtTime(sw, t + dur);
  f.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(AC.destination); s.start(); s.stop(t + dur);
}
function tone(f1, f2, dur, vol, type) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(); o.stop(t + dur);
}
const sfx = {
  gun() { tone(180, 60, 0.08, 0.7, "square"); noise(0.12, 1200, 1, 0.5, 400); },
  shotgun() { tone(120, 40, 0.15, 0.85, "square"); noise(0.2, 800, 1, 0.7, 200); },
  reload() { tone(400, 280, 0.15, 0.25, "triangle"); setTimeout(() => tone(320, 400, 0.12, 0.2, "triangle"), 180); },
  hit() { tone(140, 50, 0.15, 0.6, "square"); noise(0.12, 250, 1, 0.5); },
  groan() { noise(1.4, 180, 3, 0.35, 80); tone(90, 60, 1.2, 0.2, "sawtooth"); },
  scream() { tone(500, 1800, 0.7, 0.4, "sawtooth"); noise(0.7, 1400, 1, 0.6, 3000); },
  step() { noise(0.06, 320, 2, 0.12); },
  pick() { tone(700, 1400, 0.2, 0.22, "triangle"); },
  radio() { [440, 520, 480].forEach((f, i) => setTimeout(() => tone(f, f * 0.98, 0.15, 0.08, "square"), i * 120)); },
  thump() { tone(70, 30, 0.4, 0.7, "sine"); noise(0.25, 150, 1, 0.4); },
  empty() { tone(200, 150, 0.08, 0.3, "square"); }
};

/* ---------- WORLD HELPERS ---------- */
const rng = s => () => {
  s |= 0; s = s + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// Town-style map: open streets + building blocks
function genTown(size, r) {
  // size = number of blocks on each side
  const W = size * 2 + 1; // odd so center is open
  const m = Array.from({ length: W }, () => Array(W).fill(0)); // 0 = walkable street
  // Place buildings on a grid
  for (let by = 0; by < size; by++) {
    for (let bx = 0; bx < size; bx++) {
      if (r() < 0.18) continue; // some empty lots
      const ox = bx * 2 + 1, oy = by * 2 + 1;
      // building footprint 1 cell, but we'll make them larger in 3D
      if (ox > 0 && oy > 0 && ox < W && oy < W) m[oy][ox] = 1;
    }
  }
  // Keep spawn area clear
  m[1][1] = 0; m[1][2] = 0; m[2][1] = 0;
  // Keep a path toward the far corner (extraction)
  for (let i = 1; i < W - 1; i++) {
    if (r() < 0.7) m[i][Math.min(i, W - 2)] = 0;
  }
  return m;
}

function tex(base, stain, n) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.3})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 12, 3 + Math.random() * 12);
  }
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const gr = g.createRadialGradient(x, y, 2, x, y, 50);
    gr.addColorStop(0, stain); gr.addColorStop(1, "transparent");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 4;
  return t;
}

/* ---------- PLAYER MODEL ---------- */
function mkPlayer(p, i) {
  const g = new T.Group();
  const col = [0x3a7abf, 0x3a9a5a, 0xc9a63a, 0xb85a9a][i % 4];
  const body = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 1.1, 8), new T.MeshStandardMaterial({ color: col, roughness: 0.85 }));
  body.position.y = 0.9;
  const head = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), new T.MeshStandardMaterial({ color: 0xc8b8a0, roughness: 0.7 }));
  head.position.y = 1.65;
  [-1, 1].forEach(s => {
    const arm = new T.Mesh(new T.CylinderGeometry(0.06, 0.05, 0.65, 5), new T.MeshStandardMaterial({ color: col, roughness: 0.85 }));
    arm.position.set(s * 0.36, 1.1, 0); arm.rotation.z = s * 0.12; g.add(arm);
  });
  [-1, 1].forEach(s => {
    const leg = new T.Mesh(new T.CylinderGeometry(0.08, 0.07, 0.65, 5), new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
    leg.position.set(s * 0.13, 0.32, 0); g.add(leg);
  });
  const l = new T.PointLight(col, 0.6, 4.5); l.position.set(0, 1.3, -0.25);
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const x = c.getContext("2d"); x.font = "bold 28px sans-serif"; x.fillStyle = "#fff"; x.textAlign = "center"; x.fillText(p.name, 128, 42);
  const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false }));
  s.scale.set(1.3, 0.32, 1); s.position.y = 2.05;
  g.add(body, head, l, s);
  return g;
}

/* ---------- PROPER ZOMBIE MODELS ---------- */
function mkZombie(type) {
  // type: 'walker' | 'runner' | 'brute'
  const g = new T.Group();
  const isRunner = type === "runner";
  const isBrute = type === "brute";

  const skinCol = isBrute ? 0x3a2a1a : (isRunner ? 0x4a3a2a : 0x5a4a3a);
  const clothCol = isBrute ? 0x1a1510 : 0x2a2520;
  const skin = new T.MeshStandardMaterial({ color: skinCol, roughness: 0.95 });
  const cloth = new T.MeshStandardMaterial({ color: clothCol, roughness: 0.9 });
  const dark = new T.MeshStandardMaterial({ color: 0x1a1008, roughness: 1 });

  // Torso – slightly hunched
  const torso = new T.Mesh(new T.CylinderGeometry(isBrute ? 0.38 : 0.28, isBrute ? 0.42 : 0.32, isBrute ? 1.1 : 0.95, 8), cloth);
  torso.position.y = isBrute ? 1.15 : 1.05;
  torso.rotation.x = 0.15;

  // Head – decayed, tilted
  const head = new T.Mesh(new T.SphereGeometry(isBrute ? 0.26 : 0.2, 9, 7), skin);
  head.position.y = isBrute ? 1.9 : 1.7;
  head.rotation.z = (Math.random() - 0.5) * 0.3;
  head.rotation.x = 0.1;

  // Sunken eyes (dark sockets)
  const socketM = new T.MeshBasicMaterial({ color: 0x0a0500 });
  [-0.07, 0.07].forEach(x => {
    const sock = new T.Mesh(new T.SphereGeometry(0.045, 5, 5), socketM);
    sock.position.set(x * (isBrute ? 1.2 : 1), head.position.y + 0.02, 0.14 * (isBrute ? 1.15 : 1));
    g.add(sock);
  });
  // Faint red/yellow pupil glow
  const eyeM = new T.MeshBasicMaterial({ color: isRunner ? 0xff2200 : 0xaa8800 });
  [-0.07, 0.07].forEach(x => {
    const eye = new T.Mesh(new T.SphereGeometry(0.02, 4, 4), eyeM);
    eye.position.set(x * (isBrute ? 1.2 : 1), head.position.y + 0.02, 0.17 * (isBrute ? 1.15 : 1));
    g.add(eye);
  });

  // Open mouth / jaw
  const jaw = new T.Mesh(new T.BoxGeometry(0.12, 0.06, 0.08), dark);
  jaw.position.set(0, head.position.y - 0.1, 0.12);
  g.add(jaw);

  // Arms – one often raised or dangling
  [-1, 1].forEach((s, idx) => {
    const upper = new T.Mesh(new T.CylinderGeometry(0.06, 0.05, 0.55, 5), skin);
    upper.position.set(s * 0.38, 1.25, 0.05);
    upper.rotation.z = s * (isRunner ? 0.4 : 0.6);
    upper.rotation.x = idx === 0 ? -0.8 : -0.3;
    g.add(upper);
    const lower = new T.Mesh(new T.CylinderGeometry(0.05, 0.04, 0.5, 5), skin);
    lower.position.set(s * 0.55, 0.9, 0.25);
    lower.rotation.z = s * 0.3;
    lower.rotation.x = -0.5;
    g.add(lower);
    // Hand
    const hand = new T.Mesh(new T.SphereGeometry(0.055, 5, 5), skin);
    hand.position.set(s * 0.62, 0.65, 0.4);
    g.add(hand);
  });

  // Legs – shambling stance
  [-1, 1].forEach((s, idx) => {
    const thigh = new T.Mesh(new T.CylinderGeometry(0.09, 0.07, 0.55, 5), cloth);
    thigh.position.set(s * 0.14, 0.55, idx === 0 ? 0.08 : -0.05);
    thigh.rotation.x = idx === 0 ? 0.2 : -0.15;
    g.add(thigh);
    const shin = new T.Mesh(new T.CylinderGeometry(0.07, 0.055, 0.5, 5), cloth);
    shin.position.set(s * 0.14, 0.15, idx === 0 ? 0.12 : -0.02);
    g.add(shin);
    const foot = new T.Mesh(new T.BoxGeometry(0.1, 0.06, 0.22), dark);
    foot.position.set(s * 0.14, -0.08, 0.08);
    g.add(foot);
  });

  // Torn clothing detail on torso
  const rag = new T.Mesh(new T.BoxGeometry(0.5, 0.15, 0.15), dark);
  rag.position.set(0.1, 1.3, 0.2);
  rag.rotation.z = 0.3;
  g.add(rag);

  g.add(torso, head);

  // Scale
  if (isBrute) g.scale.setScalar(1.35);
  else if (isRunner) g.scale.setScalar(0.95);
  else g.scale.setScalar(1.05);

  // Weak point light (optional, subtle)
  if (isRunner) {
    const l = new T.PointLight(0xff2200, 0.25, 3);
    l.position.y = 1.6;
    g.add(l);
  }
  return g;
}

/* ---------- WEAPONS & ITEMS ---------- */
function mkGun(type) {
  const g = new T.Group();
  const metal = new T.MeshStandardMaterial({ color: 0x333338, roughness: 0.35, metalness: 0.8 });
  const dark = new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  const wood = new T.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.85 });

  if (type === "shotgun") {
    const barrel = new T.Mesh(new T.CylinderGeometry(0.035, 0.04, 0.7, 8), metal);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.25, 0.05, 0);
    const pump = new T.Mesh(new T.BoxGeometry(0.25, 0.08, 0.07), dark);
    pump.position.set(0.05, 0.02, 0);
    const stock = new T.Mesh(new T.BoxGeometry(0.35, 0.1, 0.06), wood);
    stock.position.set(-0.25, 0, 0);
    const grip = new T.Mesh(new T.BoxGeometry(0.08, 0.18, 0.05), dark);
    grip.position.set(-0.05, -0.1, 0);
    g.add(barrel, pump, stock, grip);
  } else {
    // Pistol
    const slide = new T.Mesh(new T.BoxGeometry(0.28, 0.08, 0.05), metal);
    slide.position.set(0.08, 0.04, 0);
    const grip = new T.Mesh(new T.BoxGeometry(0.08, 0.18, 0.05), dark);
    grip.position.set(-0.02, -0.08, 0);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.12, 6), metal);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.22, 0.04, 0);
    g.add(slide, grip, barrel);
  }
  return g;
}

function mkItem(t) {
  const g = new T.Group();
  if (t === "ammo") {
    const box = new T.Mesh(new T.BoxGeometry(0.2, 0.12, 0.14), new T.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.7 }));
    box.position.y = 0.06;
    g.add(box);
  } else if (t === "med") {
    const pack = new T.Mesh(new T.BoxGeometry(0.22, 0.1, 0.16), new T.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.6 }));
    pack.position.y = 0.05;
    const cross = new T.Mesh(new T.BoxGeometry(0.1, 0.02, 0.04), new T.MeshStandardMaterial({ color: 0xffffff }));
    cross.position.y = 0.11;
    g.add(pack, cross);
  } else if (t === "note") {
    const page = new T.Mesh(new T.PlaneGeometry(0.35, 0.45), new T.MeshStandardMaterial({
      color: 0xe8e0c0, emissive: 0x887766, emissiveIntensity: 0.5, side: T.DoubleSide, roughness: 0.9
    }));
    page.rotation.x = -0.25;
    g.add(page);
  } else if (t === "pistol" || t === "shotgun") {
    const gun = mkGun(t);
    gun.scale.setScalar(1.4);
    gun.position.y = 0.15;
    g.add(gun);
  }
  return g;
}

/* ---------- LEVEL BUILD ---------- */
const hq = !matchMedia("(pointer:coarse)").matches;

function startLevel(level, seed) {
  stopGame();
  loadedSeed = seed;
  audio();
  const mapData = MAPS[level - 1];
  const r = rng(seed);
  const blocks = 5 + level; // wider towns
  const m = genTown(blocks, r);
  const W = m.length;

  if (!renderer) {
    renderer = new T.WebGLRenderer({ canvas: $("cv"), antialias: hq });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
  }
  renderer.shadowMap.enabled = hq;
  renderer.setPixelRatio(Math.min(devicePixelRatio, hq ? 1.8 : 1.3));

  const scene = new T.Scene();
  scene.background = new T.Color(mapData.fog);
  scene.fog = new T.FogExp2(mapData.fog, 0.022 + level * 0.002);

  const cam = new T.PerspectiveCamera(70, 1, 0.1, 120);
  cam.rotation.order = "YXZ";
  scene.add(cam);

  scene.add(new T.AmbientLight(0x303028, 0.45));
  // Moon / distant light
  const moon = new T.DirectionalLight(0x8899aa, 0.35);
  moon.position.set(30, 50, 20);
  scene.add(moon);

  // Flashlight
  const fl = new T.SpotLight(0xffe8c0, 2.4, 28, Math.PI / 5.5, 0.55, 1.4);
  fl.position.set(0.15, -0.12, 0);
  cam.add(fl, fl.target);
  fl.target.position.set(0, 0, -5);
  if (hq) {
    fl.castShadow = true;
    fl.shadow.mapSize.set(1024, 1024);
    fl.shadow.camera.near = 0.3;
    fl.shadow.camera.far = 28;
  }
  cam.add(new T.PointLight(0x332818, 0.35, 5));

  // Ground
  const gt = tex(mapData.ground, "rgba(40,20,10,.4)", 900);
  gt.repeat.set(W * 1.5, W * 1.5);
  const ground = new T.Mesh(
    new T.PlaneGeometry(W * CELL, W * CELL),
    new T.MeshStandardMaterial({ map: gt, roughness: 0.92 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W * CELL / 2, 0, W * CELL / 2);
  ground.receiveShadow = hq;
  scene.add(ground);

  // Buildings
  const bt = tex("#2a2620", "rgba(20,10,5,.5)", 700);
  const buildings = [];
  m.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    const h = 3.5 + r() * 4.5;
    const w = CELL * (0.7 + r() * 0.25);
    const d = CELL * (0.7 + r() * 0.25);
    const mat = new T.MeshStandardMaterial({ map: bt, roughness: 0.9 });
    const b = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    b.position.set((x + 0.5) * CELL, h / 2, (y + 0.5) * CELL);
    b.castShadow = b.receiveShadow = hq;
    scene.add(b);
    buildings.push({ x: b.position.x, z: b.position.z, hw: w / 2, hd: d / 2 });
    // Simple roof
    const roof = new T.Mesh(new T.BoxGeometry(w + 0.3, 0.25, d + 0.3), new T.MeshStandardMaterial({ color: 0x1a1814, roughness: 1 }));
    roof.position.set(b.position.x, h + 0.1, b.position.z);
    scene.add(roof);
  }));

  // Street lights (some broken)
  const openCells = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m[y][x] === 0) openCells.push([x, y]);
  openCells.sort(() => r() - 0.5);

  for (let i = 0; i < Math.min(18, openCells.length); i++) {
    const [cx, cy] = openCells[i];
    const px = (cx + 0.5) * CELL + (r() - 0.5) * 2;
    const pz = (cy + 0.5) * CELL + (r() - 0.5) * 2;
    const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 4.2, 6), new T.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(px, 2.1, pz);
    scene.add(pole);
    if (r() > 0.45) {
      const light = new T.PointLight(0xffaa66, 0.9, 14);
      light.position.set(px, 4.0, pz);
      scene.add(light);
      const bulb = new T.Mesh(new T.SphereGeometry(0.12, 6, 6), new T.MeshBasicMaterial({ color: 0xffcc88 }));
      bulb.position.set(px, 4.0, pz);
      scene.add(bulb);
    }
  }

  // Safe zones
  const safes = [];
  for (let i = 0; i < mapData.safeCount; i++) {
    const [cx, cy] = openCells[10 + i * 7] || openCells[i];
    const sx = (cx + 0.5) * CELL, sz = (cy + 0.5) * CELL;
    // Safe zone marker (green glow circle)
    const ring = new T.Mesh(
      new T.RingGeometry(2.8, 3.2, 24),
      new T.MeshBasicMaterial({ color: 0x22aa44, transparent: true, opacity: 0.35, side: T.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(sx, 0.05, sz);
    scene.add(ring);
    const safeLight = new T.PointLight(0x44ff66, 1.4, 12);
    safeLight.position.set(sx, 3.5, sz);
    scene.add(safeLight);
    // Weapon crate
    const crate = new T.Mesh(new T.BoxGeometry(1.2, 0.7, 0.9), new T.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.8 }));
    crate.position.set(sx + 1.5, 0.35, sz);
    scene.add(crate);
    safes.push({ x: sx, z: sz, r: 3.5 });
  }

  // Extraction flare (goal)
  const ex = (W - 1.5) * CELL, ez = (W - 1.5) * CELL;
  const exitLight = new T.PointLight(0x22ff55, 2.5, 18);
  exitLight.position.set(ex, 4, ez);
  scene.add(exitLight);
  const flarePole = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 3.5, 6), new T.MeshStandardMaterial({ color: 0x444444 }));
  flarePole.position.set(ex, 1.75, ez);
  scene.add(flarePole);
  const flareOrb = new T.Mesh(new T.SphereGeometry(0.35, 10, 10), new T.MeshBasicMaterial({ color: 0x44ff66 }));
  flareOrb.position.set(ex, 3.7, ez);
  scene.add(flareOrb);

  // Items: guns, ammo, meds, notes
  const items = [];
  const addItem = (t, x, z, extra) => {
    const mm = mkItem(t);
    mm.position.set(x, 0.4, z);
    scene.add(mm);
    items.push({ t, m: mm, x, z, y: 0.4, taken: false, ...extra });
  };
  // Guaranteed pistol near spawn
  addItem("pistol", 1.5 * CELL + 2, 1.5 * CELL + 1);
  // Shotguns and ammo near safe zones + scattered
  safes.forEach((s, i) => {
    addItem(i === 0 ? "shotgun" : "pistol", s.x - 1.2, s.z + 0.8);
    addItem("ammo", s.x + 0.5, s.z - 1.0);
    addItem("med", s.x - 0.8, s.z - 0.5);
  });
  for (let i = 0; i < 5; i++) {
    const [cx, cy] = openCells[20 + i * 3] || openCells[i];
    addItem("ammo", (cx + 0.5) * CELL + (r() - 0.5) * 3, (cy + 0.5) * CELL + (r() - 0.5) * 3);
  }
  for (let i = 0; i < 3; i++) {
    const [cx, cy] = openCells[40 + i * 4] || openCells[i + 5];
    addItem("med", (cx + 0.5) * CELL, (cy + 0.5) * CELL);
  }
  mapData.notes.forEach((tx, i) => {
    const [cx, cy] = openCells[30 + i * 5] || openCells[i + 2];
    addItem("note", (cx + 0.5) * CELL, (cy + 0.5) * CELL, { text: tx });
  });

  // Held weapon (view model)
  const heldPistol = mkGun("pistol");
  heldPistol.scale.setScalar(0.9);
  heldPistol.position.set(0.28, -0.28, -0.55);
  heldPistol.rotation.set(0.1, 0.3, 0.15);
  heldPistol.visible = false;
  cam.add(heldPistol);
  const heldShotgun = mkGun("shotgun");
  heldShotgun.scale.setScalar(0.85);
  heldShotgun.position.set(0.25, -0.25, -0.6);
  heldShotgun.rotation.set(0.05, 0.25, 0.1);
  heldShotgun.visible = false;
  cam.add(heldShotgun);

  // Zombies
  const enemies = [];
  const farCells = openCells.filter(([x, y]) => x + y > W * 0.5);
  for (let i = 0; i < mapData.zCount; i++) {
    const [cx, cy] = farCells[i % farCells.length] || openCells[i];
    const type = r() < 0.15 ? "brute" : (r() < 0.35 ? "runner" : "walker");
    const zx = (cx + 0.5) * CELL + (r() - 0.5) * 4;
    const zz = (cy + 0.5) * CELL + (r() - 0.5) * 4;
    const mm = mkZombie(type);
    mm.position.set(zx, 0, zz);
    scene.add(mm);
    const def = type === "brute"
      ? { hp: 8, sp: 1.3, r: 1.5, dmg: 2 }
      : type === "runner"
        ? { hp: 3, sp: 3.4, r: 1.2, dmg: 1 }
        : { hp: 4, sp: 1.7, r: 1.25, dmg: 1 };
    enemies.push({
      m: mm, t: type, def, hp: def.hp, stun: 0, rc: 0, next: null,
      tx: zx, tz: zz, groanT: 2 + r() * 6
    });
  }

  // Dust
  const dustGeo = new T.BufferGeometry();
  const dustCount = hq ? 160 : 70;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = Math.random() * W * CELL;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 3;
    dustPos[i * 3 + 2] = Math.random() * W * CELL;
  }
  dustGeo.setAttribute("position", new T.BufferAttribute(dustPos, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ color: 0x776655, size: 0.04, transparent: true, opacity: 0.28, depthWrite: false }));
  scene.add(dust);

  cam.position.set(1.5 * CELL, 1.6, 1.5 * CELL);

  G = {
    scene, cam, fl, map: m, buildings, level, items, enemies, safes,
    heldPistol, heldShotgun, exitLight, flareOrb, ex, ez, dust,
    remote: {}, seen: {}, open: true, adv: false,
    yaw: Math.PI, pitch: 0, bob: 0, stepT: 0, t: 0, sendT: 0, beatT: 0, hudT: 0,
    grace: 12, hp: 5, inv: 0, dead: false, cool: 0, shake: 0,
    flOn: true, flOff: 0, flicker: 0,
    weapon: null, // 'pistol' | 'shotgun'
    ammo: 0, reserve: 0, magSize: 0, reloading: 0,
    near: null, actN: 0, inSafe: false,
    ev: 15 + r() * 10, clock: new T.Clock(), raf: 0, sent: false, paused: false
  };

  show("game");
  $("endOverlay").classList.add("d-none");
  $("ghost").src = ""; // no face jumpscare for this style
  resize(); hud();
  save(level);

  if (level === 1 && !prologueDone) {
    G.paused = true;
    cine(PROLOGUE, () => { prologueDone = true; if (G) { G.paused = false; story(mapData, level); } });
  } else story(mapData, level);

  if (!soloMode) update(R("players/" + user.uid), { hp: 5, x: cam.position.x, z: cam.position.z });
  loop();
}

function stopGame() {
  if (G) { cancelAnimationFrame(G.raf); G = null; }
  $("static").classList.remove("on");
  $("safeBadge").classList.remove("on");
}

function resize() {
  if (!G || !renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  G.cam.aspect = innerWidth / innerHeight;
  G.cam.updateProjectionMatrix();
}
addEventListener("resize", resize);

/* ---------- HUD / STORY ---------- */
let msgT;
const msg = (t, ms = 2500) => {
  const e = $("hudMsg"); e.textContent = t; e.classList.add("on");
  clearTimeout(msgT); msgT = setTimeout(() => e.classList.remove("on"), ms);
};
function hud() {
  if (!G) return;
  const h = Math.max(G.hp, 0);
  let weap = "Unarmed";
  if (G.weapon === "pistol") weap = `Pistol ${G.ammo}/${G.reserve}`;
  if (G.weapon === "shotgun") weap = `Shotgun ${G.ammo}/${G.reserve}`;
  if (G.reloading > 0) weap += " [RELOADING]";
  $("hudKeys").textContent = weap;
  $("hudHp").textContent = "❤".repeat(h) + "🖤".repeat(5 - h) + (G.inSafe ? "  🟢 SAFE" : "");
}
function story(c, level) {
  const s = $("story");
  s.innerHTML = `<small>SECTOR ${level} OF 5</small><h2>${c.n}</h2><p>${c.intro}</p><small>${
    document.body.classList.contains("touch")
      ? "Stick: move · drag right: look · 🔫 fire · 🔄 reload · ✋ interact"
      : "Click to look · WASD move · LMB / Space fire · R reload · E interact · F light"
  }</small>`;
  s.classList.add("on");
  setTimeout(() => s.classList.remove("on"), 10000);
}
function readNote(t) {
  const n = $("note");
  n.innerHTML = `<b>📄 Found note</b><p>${t}</p><small>E / tap to close</small>`;
  n.classList.remove("d-none");
  clearTimeout(readNote.h);
  readNote.h = setTimeout(() => n.classList.add("d-none"), 12000);
}
$("note").onclick = () => $("note").classList.add("d-none");

/* ---------- COMBAT & ITEMS ---------- */
function equip(type) {
  G.weapon = type;
  G.heldPistol.visible = type === "pistol";
  G.heldShotgun.visible = type === "shotgun";
  if (type === "pistol") { G.magSize = 12; G.ammo = 12; G.reserve = 36; }
  if (type === "shotgun") { G.magSize = 6; G.ammo = 6; G.reserve = 18; }
  msg(type === "shotgun" ? "Shotgun equipped" : "Pistol equipped", 1800);
  hud();
}

function collect(it) {
  if (!it || it.taken) return;
  it.taken = true; it.m.visible = false; sfx.pick();
  if (it.t === "pistol" || it.t === "shotgun") equip(it.t);
  else if (it.t === "ammo") {
    G.reserve += G.weapon === "shotgun" ? 8 : 18;
    msg("Ammo +", 1200);
  } else if (it.t === "med") {
    G.hp = Math.min(5, G.hp + 2);
    msg("Medkit used. +2 HP", 1500);
  } else if (it.t === "note") {
    readNote(it.text);
  }
  hud();
}

function use() {
  if (!G || G.dead) return;
  if (!$("note").classList.contains("d-none")) return $("note").classList.add("d-none");
  collect(G.near);
}

function reload() {
  if (!G || !G.weapon || G.reloading > 0 || G.ammo >= G.magSize || G.reserve <= 0) return;
  G.reloading = G.weapon === "shotgun" ? 1.8 : 1.2;
  sfx.reload();
  msg("Reloading…", 1000);
}

function fire() {
  const g = G;
  if (!g || g.dead || !g.weapon || g.reloading > 0 || g.atk > 0) return;
  if (g.ammo <= 0) { sfx.empty(); msg("Empty – reload (R)", 1200); return; }
  g.ammo--;
  g.atk = g.weapon === "shotgun" ? 0.55 : 0.18;
  g.shake = g.weapon === "shotgun" ? 0.35 : 0.12;
  if (g.weapon === "shotgun") sfx.shotgun(); else sfx.gun();
  // Muzzle flash overlay
  const mz = $("muzzle"); mz.classList.remove("on"); void mz.offsetWidth; mz.classList.add("on");

  // Hitscan
  const p = g.cam.position;
  const fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw);
  const range = g.weapon === "shotgun" ? 14 : 28;
  const spread = g.weapon === "shotgun" ? 0.12 : 0.02;
  let hits = 0;
  g.enemies.forEach((e, i) => {
    if (e.hp <= 0) return;
    const dx = e.m.position.x - p.x, dz = e.m.position.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.88 - spread) return;
    // Hit
    const dmg = g.weapon === "shotgun" ? (d < 6 ? 4 : 2) : 2;
    e.hp -= dmg;
    e.stun = 0.4;
    hits++;
    sfx.hit();
    if (e.hp <= 0) {
      e.m.visible = false;
      sfx.thump();
    }
    if (!soloMode) act("h", i);
  });
  if (hits === 0 && Math.random() < 0.3) sfx.thump(); // ricochet / miss feel
  hud();
}

function act(k, i = 0) {
  if (soloMode) return;
  const p = G.cam.position;
  update(R("acts/" + user.uid), { n: ++G.actN, k, i, x: +p.x.toFixed(2), z: +p.z.toFixed(2) }).catch(() => {});
}
function applyAct(a) {
  if (a.k === "h") {
    const e = G.enemies[a.i];
    if (e && e.hp > 0) { e.hp -= 2; e.stun = 0.4; if (e.hp <= 0) e.m.visible = false; }
  }
}

/* ---------- MOVEMENT & AI ---------- */
function solidBuilding(x, z) {
  for (const b of G.buildings) {
    if (Math.abs(x - b.x) < b.hw + 0.4 && Math.abs(z - b.z) < b.hd + 0.4) return true;
  }
  return false;
}
function tryMove(dx, dz) {
  const p = G.cam.position;
  if (!solidBuilding(p.x + dx, p.z)) p.x += dx;
  if (!solidBuilding(p.x, p.z + dz)) p.z += dz;
  // Clamp to map
  const max = G.map.length * CELL - 1;
  p.x = Math.max(1, Math.min(max, p.x));
  p.z = Math.max(1, Math.min(max, p.z));
}

const targets = () => {
  const a = [];
  if (!G.dead) a.push({ x: G.cam.position.x, z: G.cam.position.z });
  Object.values(G.remote).forEach(r => r.hp > 0 && a.push({ x: r.m.position.x, z: r.m.position.z }));
  return a;
};

function zombieAI(e, dt) {
  const p = e.m.position;
  if (G.t < G.grace) return;
  if (e.stun > 0) { e.stun -= dt; return; }

  // Groan occasionally
  e.groanT -= dt;
  if (e.groanT <= 0) {
    e.groanT = 4 + Math.random() * 8;
    if (Math.hypot(p.x - G.cam.position.x, p.z - G.cam.position.z) < 22) sfx.groan();
  }

  let best = null, bd = 1e9;
  targets().forEach(t => {
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < bd) { bd = d; best = t; }
  });
  if (!best) return;

  // Attack range
  if (bd < e.def.r) {
    e.stun = 1.1;
    // Damage is handled in player collision check
    return;
  }

  // Chase – simple steering with light obstacle avoidance
  const sp = e.def.sp * (1 + 0.03 * G.level) * dt;
  const dx = best.x - p.x, dz = best.z - p.z;
  const len = Math.hypot(dx, dz) || 1;
  let mx = (dx / len) * sp, mz = (dz / len) * sp;

  // Simple building avoidance
  if (solidBuilding(p.x + mx * 3, p.z)) mx = 0;
  if (solidBuilding(p.x, p.z + mz * 3)) mz = 0;

  p.x += mx; p.z += mz;
  e.m.rotation.y = Math.atan2(dx, dz);

  // Bob / limp animation
  e.m.position.y = Math.abs(Math.sin(G.t * (e.t === "runner" ? 8 : 4) + e.m.id)) * 0.06;
}

function tick(dt) {
  const g = G, p = g.cam.position;
  g.t += dt; g.cool -= dt; g.inv -= dt; g.atk -= dt; g.hudT -= dt;
  g.flOff = Math.max(0, g.flOff - dt);
  if (g.reloading > 0) {
    g.reloading -= dt;
    if (g.reloading <= 0) {
      const need = g.magSize - g.ammo;
      const take = Math.min(need, g.reserve);
      g.ammo += take; g.reserve -= take;
      hud();
    }
  }

  if (!g.dead) {
    g.yaw += ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * 2.0 * dt;
    const fy = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - joy.y;
    const fx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + joy.x;
    const len = Math.hypot(fx, fy);
    const run = K.ShiftLeft || joy.run;
    const sp = (run ? 5.2 : 3.1) * dt;
    if (len > 0.05) {
      const n = Math.min(len, 1) / len;
      const sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
      tryMove((-sy * fy + cy * fx) * n * sp, (-cy * fy - sy * fx) * n * sp);
      g.bob += dt * (run ? 12 : 7);
      g.stepT -= dt;
      if (g.stepT <= 0) { g.stepT = run ? 0.28 : 0.42; sfx.step(); }
    }
    p.y = 1.6 + (len > 0.05 ? Math.sin(g.bob) * 0.03 : 0);

    // Extraction
    if (Math.hypot(p.x - g.ex, p.z - g.ez) < 3.5) {
      if (!g.sent) {
        g.sent = true;
        if (soloMode) {
          if (g.level >= 5) endGame("won");
          else {
            msg("Sector clear. Advancing…", 2200);
            setTimeout(() => { if (G) startLevel(g.level + 1, Date.now() % 1e9); }, 2000);
          }
        } else {
          update(R("reached"), { [user.uid]: true });
          msg("Extraction secured…", 2500);
        }
      }
    }

    // Safe zone check
    g.inSafe = g.safes.some(s => Math.hypot(p.x - s.x, p.z - s.z) < s.r);
    $("safeBadge").classList.toggle("on", g.inSafe);

    // Items
    let nr = null, nd = 2.0;
    g.items.forEach(it => {
      if (it.taken) return;
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      it.m.rotation.y += dt * 0.8;
      it.m.position.y = it.y + Math.sin(g.t * 2 + it.x) * 0.04;
      if (d < 1.5 && (it.t === "ammo" || it.t === "med")) collect(it);
      else if (d < nd) { nd = d; nr = it; }
    });
    g.near = nr;
    $("prompt").textContent = nr
      ? ((nr.t === "pistol" || nr.t === "shotgun") ? "Pick up weapon" : nr.t === "note" ? "Read note" : "Take") + " — E / ✋"
      : "";
  } else $("prompt").textContent = "";

  // Zombies
  let dmin = 99;
  g.enemies.forEach((e, i) => {
    if (e.hp <= 0) { e.m.visible = false; return; }
    if (isHost || soloMode) zombieAI(e, dt);
    else {
      const k = Math.min(1, 8 * dt);
      e.m.position.x += (e.tx - e.m.position.x) * k;
      e.m.position.z += (e.tz - e.m.position.z) * k;
    }
    const d = Math.hypot(p.x - e.m.position.x, p.z - e.m.position.z);
    dmin = Math.min(dmin, d);
    // Contact damage
    if (!g.dead && !g.inSafe && g.t > g.grace && d < e.def.r && g.inv <= 0) {
      g.hp -= e.def.dmg;
      g.inv = 1.4;
      g.shake = 0.4;
      hud();
      sfx.hit();
      if (!soloMode) update(R("players/" + user.uid), { hp: Math.max(0, g.hp) });
      if (g.hp <= 0) {
        g.dead = true;
        msg("YOU WERE OVERRUN", 5000);
        if (soloMode) setTimeout(() => endGame("lost"), 3000);
      }
    }
  });

  // Tension audio when close
  if (dmin < 16 && !g.dead && !g.inSafe) {
    g.beatT -= dt;
    if (g.beatT <= 0) { g.beatT = 0.4 + dmin * 0.05; sfx.step(); }
    $("static").classList.add("on");
    $("static").style.opacity = Math.max(0.05, 0.3 - dmin * 0.018).toFixed(2);
  } else {
    $("static").classList.remove("on");
  }

  // Flashlight
  if (g.flOn) g.fl.intensity = 2.4 * (g.flicker > 0 ? (Math.random() < 0.2 ? 0.15 : 0.9) : 1);
  else g.fl.intensity = 0;
  g.flicker = Math.max(0, g.flicker - dt);

  // Dust
  if (g.dust) {
    const pos = g.dust.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] += Math.sin(g.t * 0.3 + i) * 0.0012;
      if (pos[i + 1] > 3.5) pos[i + 1] = 0.2;
    }
    g.dust.geometry.attributes.position.needsUpdate = true;
  }

  // Extraction orb pulse
  if (g.flareOrb) g.flareOrb.scale.setScalar(1 + Math.sin(g.t * 3) * 0.15);

  if (g.hudT <= 0) { g.hudT = 0.35; hud(); }

  // Camera
  g.shake = Math.max(0, g.shake - dt * 1.5);
  const sh = g.shake * 0.04;
  g.cam.rotation.set(
    g.pitch + (Math.random() - 0.5) * sh,
    g.yaw + (Math.random() - 0.5) * sh,
    (Math.random() - 0.5) * sh * 0.5
  );

  // Remote lerp
  Object.values(g.remote).forEach(r => {
    const q = r.m.position;
    q.x += (r.tx - q.x) * Math.min(1, 9 * dt);
    q.z += (r.tz - q.z) * Math.min(1, 9 * dt);
    r.m.rotation.y = r.ry;
  });

  // Network
  g.sendT -= dt;
  if (g.sendT <= 0 && !soloMode) {
    g.sendT = 0.1;
    update(R("players/" + user.uid), { x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +g.yaw.toFixed(2) }).catch(() => {});
    if (isHost) {
      const o = {};
      g.enemies.forEach((e, i) => {
        o[i + "/x"] = +e.m.position.x.toFixed(2);
        o[i + "/z"] = +e.m.position.z.toFixed(2);
        o[i + "/hp"] = e.hp;
      });
      update(R("enemies"), o).catch(() => {});
    }
  }
}

function loop() {
  if (!G) return;
  G.raf = requestAnimationFrame(loop);
  const dt = Math.min(G.clock.getDelta(), 0.05);
  if (!G.paused) tick(dt);
  renderer.render(G.scene, G.cam);
}

/* ---------- INPUT ---------- */
const cv = $("cv");
const locked = () => document.pointerLockElement === cv;

addEventListener("keydown", e => {
  if (!G) return;
  K[e.code] = 1;
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.code === "KeyF") G.flOn = !G.flOn;
  if (e.code === "KeyE") use();
  if (e.code === "KeyR") reload();
  if (e.code === "Space") fire();
});
addEventListener("keyup", e => K[e.code] = 0);

cv.addEventListener("mousedown", e => {
  audio();
  if (!locked()) {
    if (matchMedia("(pointer:fine)").matches) cv.requestPointerLock?.();
  } else if (e.button === 0) fire();
});
addEventListener("mousemove", e => {
  if (G && (locked() || e.buttons & 1)) {
    G.yaw -= e.movementX * 0.0021;
    G.pitch = Math.max(-1.15, Math.min(1.15, G.pitch - e.movementY * 0.0021));
  }
});

const tap = (id, f) => $(id).addEventListener("touchstart", e => { e.preventDefault(); f(); });
tap("btnLight", () => G && (G.flOn = !G.flOn));
tap("btnAtk", fire);
tap("btnUse", use);
tap("btnReload", reload);
tap("btnRun", () => { joy.run = !joy.run; $("btnRun").style.background = joy.run ? "#604010" : ""; });

let jid = null, lid = null, lx = 0, ly = 0;
$("joy").addEventListener("touchstart", e => { e.preventDefault(); jid = e.changedTouches[0].identifier; });
addEventListener("touchmove", e => {
  for (const t of e.changedTouches) {
    if (t.identifier === jid) {
      const r = $("joy").getBoundingClientRect();
      const dx = t.clientX - r.left - 65, dy = t.clientY - r.top - 65;
      const l = Math.min(Math.hypot(dx, dy), 52), a = Math.atan2(dy, dx);
      joy.x = Math.cos(a) * (l / 52); joy.y = Math.sin(a) * (l / 52);
      $("knob").style.transform = `translate(${Math.cos(a) * l}px,${Math.sin(a) * l}px)`;
    } else if (t.identifier === lid && G) {
      G.yaw -= (t.clientX - lx) * 0.0055;
      G.pitch = Math.max(-1.15, Math.min(1.15, G.pitch - (t.clientY - ly) * 0.0055));
      lx = t.clientX; ly = t.clientY;
    }
  }
}, { passive: false });
cv.addEventListener("touchstart", e => {
  audio();
  for (const t of e.changedTouches) if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
});
addEventListener("touchend", e => {
  for (const t of e.changedTouches) {
    if (t.identifier === jid) { jid = null; joy.x = joy.y = 0; $("knob").style.transform = ""; }
    if (t.identifier === lid) lid = null;
  }
});

/* ---------- PWA INSTALL ---------- */
let deferredPrompt;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredPrompt = e;
  $("installBanner").classList.add("show");
});
$("btnInstall").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; $("installBanner").classList.remove("show");
};
$("btnInstallDismiss").onclick = () => $("installBanner").classList.remove("show");
