/**
 * SCAREE – 4-player co-op horror PWA
 * Visuals upgraded toward Granny / Slenderman-style atmosphere
 * Creepy low-poly characters, oppressive lighting, static, strong jumpscares
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
const S = 3;
const $ = (id) => document.getElementById(id);

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (_) {}
const auth = getAuth(app);
const db = getDatabase(app);

let mySlot, user, code, room, isHost = false, G = null;
let loadedSeed = null, unsub = null, best = 0, renderer;
let soloMode = false;
const K = {};
const joy = { x: 0, y: 0, run: false };

if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");

const show = (id) => ["auth", "menu", "lobby", "game"].forEach((s) =>
  $(s).classList.toggle("d-none", s !== id)
);
const R = (p) => ref(db, `rooms/${code}${p ? "/" + p : ""}`);
const nm = () => (user?.displayName || user?.email?.split("@")[0] || "Survivor").slice(0, 16);
const pl = () => ({ name: nm(), x: 0, z: 0, ry: 0, hp: 3 });

/* ---------- LORE ---------- */
const CH = [
  {
    n: "Admissions",
    fog: 0x000000,
    wall: "#2e2c28",
    mon: ["S"],
    intro: "St. Mercy Asylum closed in 1974. Tonight a child's lullaby crackled over every radio in town. You followed it inside. The doors locked behind you. Something called the Warden walks these halls. Wind the music boxes to silence the lullaby and break the lock.",
    notes: [
      "Admissions ledger: 212 patients admitted. 0 discharged. Dr. Voss signs every page.",
      'Voss: "Fear is a current. I mean to harness it." The Board refused him. The Board is no longer with us.'
    ]
  },
  {
    n: "The Patient Wards",
    fog: 0x010805,
    wall: "#2a322e",
    mon: ["S", "C"],
    intro: "Rows of cells, doors ripped from their hinges. Something small skitters inside the walls, and something tall keeps pace with you.",
    notes: [
      "Ward nurse: They stopped screaming on the third night. That was worse.",
      'Patient 77 scratched one sentence into the plaster: "He is not keeping us. He is feeding on us."'
    ]
  },
  {
    n: "The Flooded Basement",
    fog: 0x010408,
    wall: "#222e36",
    mon: ["S", "W"],
    intro: "Black water to your ankles. Voss sealed his failures down here. Some of them still drift — the Choir, children Voss could not silence — and they do not need doors. Light drives them back.",
    notes: [
      'Maintenance log: pumps off by order of Dr. Voss. "Let the cold keep them quiet."',
      "A drowned girl's drawing: a tall man, a choir of children, and a heart in the dark."
    ]
  },
  {
    n: "The Children's Ward",
    fog: 0x080104,
    wall: "#3a2e2e",
    mon: ["W", "C", "S"],
    intro: "Tiny beds. Music boxes wind themselves. The lullaby is louder here, and it knows your names.",
    notes: [
      "The Lullaby Project: sixty children, one song, one purpose. Fear that never fades.",
      'Voss to the children: "Sing, and you will never be alone." They sang. They still do.'
    ]
  },
  {
    n: "The Surgery Theatre",
    fog: 0x030303,
    wall: "#2e3636",
    mon: ["S", "W", "C", "C"],
    intro: "The lamp above the table swings though no air moves. Whatever Voss learned, he learned here.",
    notes: [
      "Surgical notes: the fear can be extracted. It can be stored. It can be fed to something.",
      'His last entry: "The Warden obeys me. The Choir obeys the Warden. The Heart obeys no one."'
    ]
  },
  {
    n: "The Chapel Catacombs",
    fog: 0x040106,
    wall: "#2e2a36",
    mon: ["S", "S", "W", "W", "C"],
    intro: "Candles burn without wax. Bones are stacked in the shape of a heart. The lullaby has become a hymn.",
    notes: [
      "Voss buried himself alive here, willingly, to become the Heart.",
      'Carved into the altar: "Burn the heart with light, and the children will sleep."'
    ]
  },
  {
    n: "The Heart of Voss",
    fog: 0x080000,
    wall: "#3a1818",
    mon: ["B", "S", "W", "C"],
    intro: "The walls pulse. The Warden is no longer his servant. It is his body. The exit stays sealed until the Warden falls. Cut it down, then wind the last music box and run.",
    notes: [
      'A child\'s voice, very faint: "Please. Let us sleep."',
      'The final page is blank except for one word in your own handwriting: "Stay."'
    ]
  }
];

const PROLOGUE = [
  "1974. St. Mercy Asylum. Dr. Elias Voss swore he could cure fear.",
  "He built a machine from the screams of sixty children, and a lullaby to keep them singing.",
  "The Board shut him down. Voss was never seen again. Neither were the children.",
  "Tonight, every radio in town began to play that lullaby.",
  "You came to find out why. You should not have come alone."
];
const EPI = [
  "The Warden falls. The Heart stops beating.",
  "The lullaby fades into silence. For the first time since 1974, the children sleep.",
  "You walk out into the dawn. Behind you, one window flickers once… and goes dark."
];
const EPILOGUE =
  "The Heart goes dark. The lullaby fades into silence. For the first time since 1974, St. Mercy is quiet and the children rest. You walk out into the dawn. Behind you, one window flickers once… and goes dark.";

let prologueDone = false;

/* ---------- CINEMATIC ---------- */
function cine(slides, done) {
  const o = $("cine"), tx = $("cineText");
  o.classList.remove("d-none");
  let i = 0, tm;
  const fin = () => {
    clearTimeout(tm);
    o.classList.add("d-none");
    done && done();
  };
  $("cineSkip").onclick = fin;
  const next = () => {
    if (i >= slides.length) return fin();
    const t = slides[i++];
    tx.style.opacity = 0;
    setTimeout(() => {
      tx.textContent = t;
      tx.style.opacity = 1;
      if (i % 2) sfx.box();
    }, 900);
    tm = setTimeout(next, 900 + 3200 + t.length * 42);
  };
  next();
}

/* ---------- AUTH ---------- */
const aerr = (m) => ($("authErr").textContent = m.replace("auth/", "").replace(/-/g, " "));
$("btnLogin").onclick = () =>
  signInWithEmailAndPassword(auth, $("email").value, $("pass").value).catch((e) => aerr(e.code));
$("btnReg").onclick = async () => {
  try {
    const c = await createUserWithEmailAndPassword(auth, $("email").value, $("pass").value);
    await updateProfile(c.user, { displayName: $("nick").value.trim() || "Survivor" });
    $("who").textContent = nm();
  } catch (e) {
    aerr(e.code);
  }
};
$("btnGoogle").onclick = () =>
  signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => aerr(e.code));
$("btnOut").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (u) => {
  user = u;
  if (!u) {
    leave();
    return show("auth");
  }
  show("menu");
  $("who").textContent = nm();
  try {
    const s = await get(ref(db, "users/" + u.uid));
    best = s.val()?.bestLevel || 0;
    $("best").textContent = best;
  } catch (_) {}
});

const save = (lvl) => {
  best = Math.max(best, lvl);
  $("best").textContent = best;
  if (user) update(ref(db, "users/" + user.uid), { name: nm(), bestLevel: best }).catch(() => {});
};

/* ---------- ROOMS ---------- */
const tmo = (p, ms = 9000) =>
  Promise.race([p, new Promise((_, j) => setTimeout(() => j({ code: "timeout" }), ms))]);
const dbErr = (e, what) => {
  console.error(e);
  return e.code === "timeout"
    ? "Database not reachable. Check firebase-config.js databaseURL."
    : `Could not ${what}: ${e.code || e.message}`;
};
const menuErr = (m) => ($("menuErr").textContent = m);

$("btnCreate").onclick = async () => {
  soloMode = false;
  audio();
  code = Array.from({ length: 5 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.random() * 32 | 0]
  ).join("");
  menuErr("Creating room…");
  try {
    await tmo(
      set(R(), {
        host: user.uid,
        state: "lobby",
        level: 1,
        seed: 1,
        createdAt: serverTimestamp(),
        slots: { s0: user.uid },
        players: { [user.uid]: pl() }
      })
    );
    mySlot = "s0";
    enter();
  } catch (e) {
    menuErr(dbErr(e, "create room"));
  }
};

$("btnJoin").onclick = async () => {
  soloMode = false;
  audio();
  code = $("joinCode").value.toUpperCase().trim();
  menuErr("Joining…");
  try {
    const s = await tmo(get(R()));
    if (!s.exists()) return menuErr("Room not found");
    const v = s.val();
    if (v.state !== "lobby") return menuErr("Game already started");
    mySlot = null;
    for (const sl of ["s0", "s1", "s2", "s3"]) {
      try {
        await tmo(set(R("slots/" + sl), user.uid));
        mySlot = sl;
        break;
      } catch (e) {
        if (e.code === "timeout") throw e;
      }
    }
    if (!mySlot) return menuErr("Room is full (4/4)");
    await tmo(set(R("players/" + user.uid), pl()));
    enter();
  } catch (e) {
    menuErr(dbErr(e, "join room"));
  }
};

$("btnSolo").onclick = () => {
  soloMode = true;
  audio();
  code = "SOLO";
  isHost = true;
  mySlot = "s0";
  room = {
    host: user.uid,
    state: "lobby",
    level: 1,
    seed: Date.now() % 1e9,
    players: { [user.uid]: pl() }
  };
  $("lobCode").textContent = "SOLO";
  $("hudRoom").textContent = "SOLO";
  $("lobPlayers").innerHTML = `<li class="list-group-item bg-dark text-light">${nm()} 👑</li>`;
  $("btnStart").classList.remove("d-none");
  $("lobWait").classList.add("d-none");
  const sel = $("startLvl");
  const nU = Math.min(best + 1, 7);
  sel.classList.remove("d-none");
  sel.innerHTML = Array.from({ length: nU }, (_, i) =>
    `<option value="${i + 1}">Chapter ${i + 1}: ${CH[i].n}</option>`
  ).join("");
  show("lobby");
};

function enter() {
  menuErr("");
  onDisconnect(R()).update({
    ["players/" + user.uid]: null,
    ["slots/" + mySlot]: null
  }).catch(() => {});
  $("lobCode").textContent = code;
  $("hudRoom").textContent = code;
  unsub = onValue(R(), (s) => onRoom(s.val()));
  show("lobby");
}

async function leave(kicked) {
  if (unsub) {
    unsub();
    unsub = null;
  }
  if (G) stopGame();
  if (!soloMode && code && user) {
    try {
      isHost ? await remove(R()) : await update(R(), {
        ["players/" + user.uid]: null,
        ["slots/" + mySlot]: null
      });
    } catch (_) {}
  }
  code = null;
  room = null;
  loadedSeed = null;
  soloMode = false;
  $("endOverlay").classList.add("d-none");
  if (user) {
    show("menu");
    if (kicked) menuErr("The room was closed.");
  }
}

$("btnLeave").onclick = () => leave();
$("btnQuit").onclick = () => leave();

$("btnStart").onclick = () => {
  const lvl = +$("startLvl").value || 1;
  if (soloMode) {
    room.state = "playing";
    room.level = lvl;
    room.seed = Date.now() % 1e9;
    startLevel(lvl, room.seed);
    return;
  }
  update(R(), {
    state: "playing",
    level: lvl,
    seed: Date.now() % 1e9,
    keys: null,
    reached: null,
    enemies: null,
    acts: null
  });
};

$("btnBack").onclick = () => {
  if (soloMode) {
    room.state = "lobby";
    room.level = 1;
    loadedSeed = null;
    stopGame();
    show("lobby");
    $("endOverlay").classList.add("d-none");
    return;
  }
  update(R(), {
    state: "lobby",
    level: 1,
    keys: null,
    reached: null,
    enemies: null,
    acts: null
  });
};

function onRoom(v) {
  if (soloMode) return;
  if (!v) {
    code = null;
    isHost = false;
    return leave(true);
  }
  room = v;
  isHost = v.host === user.uid;
  const ids = Object.keys(v.players || {}).sort();
  $("lobPlayers").innerHTML = ids
    .map(
      (u) =>
        `<li class="list-group-item bg-dark text-light">${v.players[u].name.replace(/</g, "&lt;")}${
          u === v.host ? " 👑" : ""
        }</li>`
    )
    .join("");
  $("btnStart").classList.toggle("d-none", !isHost);
  const sel = $("startLvl");
  const nU = Math.min(best + 1, 7);
  sel.classList.toggle("d-none", !isHost);
  if (isHost && sel.options.length !== nU) {
    sel.innerHTML = Array.from({ length: nU }, (_, i) =>
      `<option value="${i + 1}">Chapter ${i + 1}: ${CH[i].n}</option>`
    ).join("");
  }
  $("lobWait").classList.toggle("d-none", isHost);

  if (v.state === "lobby") {
    if (G) stopGame();
    loadedSeed = null;
    prologueDone = false;
    $("endOverlay").classList.add("d-none");
    show("lobby");
    return;
  }
  if (v.state === "playing" && loadedSeed !== v.seed) startLevel(v.level, v.seed);
  if (v.state === "won" || v.state === "lost") return endGame(v.state);
  if (!G) return;

  ids.forEach((u, i) => {
    if (u === user.uid) return;
    const p = v.players[u];
    let r = G.remote[u];
    if (!r) {
      r = G.remote[u] = { m: mkPlayer(p, i), tx: p.x, tz: p.z, ry: 0, hp: 3 };
      r.m.position.set(p.x, 0, p.z);
      G.scene.add(r.m);
    }
    r.tx = p.x;
    r.tz = p.z;
    r.ry = p.ry;
    r.hp = p.hp;
    r.m.visible = p.hp > 0;
  });
  Object.keys(G.remote).forEach((u) => {
    if (!v.players[u]) {
      G.scene.remove(G.remote[u].m);
      delete G.remote[u];
    }
  });

  const kk = v.keys || {};
  G.keys.forEach((k, i) => {
    if (kk["k" + i] && !k.taken) {
      k.taken = true;
      k.m.visible = false;
      sfx.pick();
    }
  });
  hud();
  const boss = G.enemies.find((e) => e.t === "B");
  const sealed = boss && boss.hp > 0;
  const got = G.keys.filter((k) => k.taken).length;
  if (got === G.keys.length && sealed && !G.sealMsg) {
    G.sealMsg = 1;
    msg("The exit is sealed while the Heart still beats. Destroy the Warden!", 4500);
  }
  if (got === G.keys.length && !sealed && !G.open) {
    G.open = true;
    G.exitLight.color.set(0x22ff55);
    G.exitMesh.material.color.set(0x114422);
    msg("THE EXIT IS OPEN. RUN.", 3500);
    sfx.thump();
  }

  Object.entries(v.enemies || {}).forEach(([i, d]) => {
    const e = G.enemies[i];
    if (!e || !d) return;
    e.tx = d.x;
    e.tz = d.z;
    if (!isHost) {
      if (d.hp < e.hp) sfx.hit();
      e.hp = d.hp;
    }
  });
  Object.entries(v.acts || {}).forEach(([u, a]) => {
    if (G.seen[u] === a.n) return;
    G.seen[u] = a.n;
    if (a.k === "f") spawnFlare(a.x, a.z);
    if (isHost) applyAct(a);
  });

  if (isHost) {
    if (ids.every((u) => v.players[u].hp <= 0)) update(R(), { state: "lost" });
    if (v.reached && !G.adv) {
      G.adv = true;
      if (v.level >= 7) update(R(), { state: "won" });
      else
        update(R(), {
          level: v.level + 1,
          seed: Date.now() % 1e9,
          keys: null,
          reached: null,
          enemies: null,
          acts: null
        });
    }
  }
}

function endGame(s) {
  if (G) {
    if (s === "won") save(7);
    stopGame();
  }
  loadedSeed = null;
  $("endTitle").textContent = s === "won" ? "YOU ESCAPED" : "YOU DIED";
  $("endText").textContent = s === "won" ? EPILOGUE : "It got all of you.";
  $("btnBack").classList.toggle("d-none", !isHost && !soloMode);
  $("endOverlay").classList.remove("d-none");
  show("lobby");
  if (s === "won") cine(EPI);
}

/* ---------- AUDIO ---------- */
let AC, nb;
function audio() {
  if (AC) {
    AC.resume();
    return;
  }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  const a = AC.createOscillator(),
    b = AC.createOscillator(),
    g = AC.createGain(),
    f = AC.createBiquadFilter();
  a.type = "sawtooth";
  a.frequency.value = 42;
  b.frequency.value = 44.5;
  f.frequency.value = 110;
  g.gain.value = 0.05;
  a.connect(f);
  b.connect(f);
  f.connect(g);
  g.connect(AC.destination);
  a.start();
  b.start();
}

function noise(dur, fq, q, vol, sw) {
  if (!AC) return;
  const s = AC.createBufferSource(),
    f = AC.createBiquadFilter(),
    g = AC.createGain(),
    t = AC.currentTime;
  s.buffer = nb;
  f.type = "bandpass";
  f.frequency.setValueAtTime(fq, t);
  if (sw) f.frequency.exponentialRampToValueAtTime(sw, t + dur);
  f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(AC.destination);
  s.start();
  s.stop(t + dur);
}

function tone(f1, f2, dur, vol, type) {
  if (!AC) return;
  const o = AC.createOscillator(),
    g = AC.createGain(),
    t = AC.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(AC.destination);
  o.start();
  o.stop(t + dur);
}

const sfx = {
  scream() {
    tone(480, 2100, 1.0, 0.55, "sawtooth");
    tone(520, 1600, 1.0, 0.4, "square");
    noise(1.0, 1600, 1, 0.95, 3800);
  },
  thump() {
    tone(85, 28, 0.55, 0.95, "sine");
    noise(0.35, 180, 1, 0.55);
  },
  beat() {
    tone(65, 32, 0.16, 0.8, "sine");
  },
  step() {
    noise(0.07, 360, 2, 0.15);
  },
  whisper() {
    noise(2.4, 2400, 8, 0.32, 1000);
  },
  pick() {
    tone(820, 1750, 0.22, 0.28, "triangle");
  },
  swing() {
    noise(0.2, 850, 1, 0.42, 280);
  },
  hit() {
    tone(150, 55, 0.22, 0.85, "square");
    noise(0.16, 280, 1, 0.65);
  },
  flare() {
    noise(0.65, 3200, 1, 0.42, 750);
  },
  box() {
    [523, 659, 784, 659, 587, 698].forEach((f, i) =>
      setTimeout(() => tone(f, f * 0.99, 0.9, 0.1, "triangle"), i * 420)
    );
  },
  static() {
    noise(0.4, 4000, 0.5, 0.25, 8000);
  }
};

/* ---------- WORLD HELPERS ---------- */
const rng = (s) => () => {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function gen(N, r) {
  const W = 2 * N + 1;
  const m = Array.from({ length: W }, () => Array(W).fill(1));
  const st = [[1, 1]];
  m[1][1] = 0;
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const d = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2]
    ].filter(
      ([a, b]) =>
        x + a > 0 &&
        y + b > 0 &&
        x + a < W - 1 &&
        y + b < W - 1 &&
        m[y + b][x + a] === 1
    );
    if (!d.length) {
      st.pop();
      continue;
    }
    const [a, b] = d[(r() * d.length) | 0];
    m[y + b / 2][x + a / 2] = 0;
    m[y + b][x + a] = 0;
    st.push([x + a, y + b]);
  }
  for (let i = 0; i < N * 2; i++) {
    const x = 1 + ((r() * (W - 2)) | 0);
    const y = 1 + ((r() * (W - 2)) | 0);
    if (
      m[y][x] &&
      ((m[y][x - 1] === 0 && m[y][x + 1] === 0) ||
        (m[y - 1][x] === 0 && m[y + 1][x] === 0))
    )
      m[y][x] = 0;
  }
  return m;
}

function bfs(m, sx, sy, tx, ty) {
  const W = m.length;
  const prev = new Map([[sy * W + sx, -1]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) break;
    for (const [a, b] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = x + a,
        ny = y + b,
        k = ny * W + nx;
      if (m[ny]?.[nx] === 0 && !prev.has(k)) {
        prev.set(k, y * W + x);
        q.push([nx, ny]);
      }
    }
  }
  let p = ty * W + tx;
  if (!prev.has(p)) return null;
  const s0 = sy * W + sx;
  while (prev.get(p) !== s0 && prev.get(p) !== -1) p = prev.get(p);
  return [p % W, (p / W) | 0];
}

function tex(base, stain, n) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // heavy dirt / mold
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.35})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 2 + Math.random() * 10);
  }
  // blood / rust stains
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 256,
      y = Math.random() * 256;
    const gr = g.createRadialGradient(x, y, 1, x, y, 45 + Math.random() * 40);
    gr.addColorStop(0, stain);
    gr.addColorStop(1, "transparent");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  // cracks
  g.strokeStyle = "rgba(0,0,0,.55)";
  g.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    let x = Math.random() * 256,
      y = Math.random() * 256;
    g.moveTo(x, y);
    for (let j = 0; j < 8; j++) g.lineTo((x += Math.random() * 32 - 16), (y += Math.random() * 32));
    g.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.encoding = T.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}

/* Better player model – low-poly survivor */
function mkPlayer(p, i) {
  const g = new T.Group();
  const col = [0x3a7abf, 0x3a9a5a, 0xc9a63a, 0xb85a9a][i % 4];
  // body
  const body = new T.Mesh(
    new T.CylinderGeometry(0.28, 0.32, 1.15, 8),
    new T.MeshStandardMaterial({ color: col, roughness: 0.85 })
  );
  body.position.y = 0.9;
  // head
  const head = new T.Mesh(
    new T.SphereGeometry(0.2, 10, 8),
    new T.MeshStandardMaterial({ color: 0xc8b8a0, roughness: 0.7 })
  );
  head.position.y = 1.7;
  // arms
  [-1, 1].forEach((s) => {
    const arm = new T.Mesh(
      new T.CylinderGeometry(0.06, 0.05, 0.7, 5),
      new T.MeshStandardMaterial({ color: col, roughness: 0.85 })
    );
    arm.position.set(s * 0.38, 1.15, 0);
    arm.rotation.z = s * 0.15;
    g.add(arm);
  });
  // legs
  [-1, 1].forEach((s) => {
    const leg = new T.Mesh(
      new T.CylinderGeometry(0.08, 0.07, 0.7, 5),
      new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
    );
    leg.position.set(s * 0.14, 0.35, 0);
    g.add(leg);
  });
  const l = new T.PointLight(col, 0.7, 5);
  l.position.set(0, 1.4, -0.3);
  // name tag
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const x = c.getContext("2d");
  x.font = "bold 30px sans-serif";
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.fillText(p.name, 128, 42);
  const s = new T.Sprite(
    new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false })
  );
  s.scale.set(1.4, 0.35, 1);
  s.position.y = 2.15;
  g.add(body, head, l, s);
  return g;
}

/* Creepy jumpscare face – Granny / old horror style */
function faceImg() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  // skin base
  const gr = g.createRadialGradient(256, 240, 30, 256, 240, 240);
  gr.addColorStop(0, "#d8cfc0");
  gr.addColorStop(0.6, "#8a7a68");
  gr.addColorStop(1, "#1a1510");
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(256, 256, 160, 210, 0, 0, 7);
  g.fill();
  // deep eye sockets
  g.fillStyle = "#0a0806";
  g.beginPath();
  g.ellipse(190, 210, 42, 55, 0.15, 0, 7);
  g.ellipse(322, 210, 42, 55, -0.15, 0, 7);
  g.fill();
  // glowing red eyes
  g.fillStyle = "#ff1111";
  g.beginPath();
  g.arc(190, 215, 12, 0, 7);
  g.arc(322, 215, 12, 0, 7);
  g.fill();
  g.fillStyle = "#ff6666";
  g.beginPath();
  g.arc(190, 215, 5, 0, 7);
  g.arc(322, 215, 5, 0, 7);
  g.fill();
  // wide screaming mouth
  g.fillStyle = "#0a0505";
  g.beginPath();
  g.ellipse(256, 360, 55, 85, 0, 0, 7);
  g.fill();
  // teeth
  g.fillStyle = "#ddd8c8";
  for (let i = 0; i < 8; i++) {
    const tx = 210 + i * 12;
    g.fillRect(tx, 320, 9, 18);
    g.fillRect(tx, 390, 9, 16);
  }
  // wrinkles / cracks
  g.strokeStyle = "rgba(40,20,10,0.6)";
  g.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo(140 + Math.random() * 230, 120 + Math.random() * 280);
    g.lineTo(140 + Math.random() * 230, 120 + Math.random() * 280);
    g.stroke();
  }
  return c.toDataURL();
}

/* ---------- ENEMY MODELS – Granny / Slenderman inspired ---------- */
const DEF = {
  S: { hp: 4, sp: 1.4, r: 1.3 },
  W: { hp: 3, sp: 1.1, r: 1.2, pass: 1 },
  C: { hp: 2, sp: 2.5, r: 1.1 },
  B: { hp: 18, sp: 1.55, r: 2.0 }
};

function mkItem(t) {
  const g = new T.Group();
  const em = (c, i = 0.9) =>
    new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
  if (t === "bat")
    g.add(new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.32, 8), em(0x33ff66)));
  else if (t === "flare")
    g.add(new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.42, 8), em(0xff3322)));
  else if (t === "note")
    g.add(
      new T.Mesh(
        new T.PlaneGeometry(0.32, 0.42),
        new T.MeshStandardMaterial({
          color: 0xeeeecc,
          emissive: 0xaaaa88,
          emissiveIntensity: 0.7,
          side: T.DoubleSide
        })
      )
    );
  else {
    const h = new T.Mesh(
      new T.BoxGeometry(0.06, 0.72, 0.06),
      new T.MeshStandardMaterial({ color: 0x4a2a0a })
    );
    const b = new T.Mesh(
      new T.BoxGeometry(0.36, 0.24, 0.05),
      new T.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.85, roughness: 0.25 })
    );
    b.position.set(0.14, 0.3, 0);
    g.add(h, b);
  }
  return g;
}

function mkEnemy(t) {
  const g = new T.Group();

  if (t === "W") {
    // Wraith – floating translucent child-like / choir spirit
    const mt = new T.MeshBasicMaterial({
      color: 0xa0d0ff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    });
    // elongated body
    const body = new T.Mesh(new T.ConeGeometry(0.45, 2.1, 12, 1, true), mt);
    body.position.y = 1.15;
    // small head
    const head = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), mt);
    head.position.y = 2.35;
    // black empty eyes
    const eyeMat = new T.MeshBasicMaterial({ color: 0x000000 });
    [-0.07, 0.07].forEach((x) => {
      const e = new T.Mesh(new T.SphereGeometry(0.045, 6, 6), eyeMat);
      e.position.set(x, 2.38, 0.16);
      g.add(e);
    });
    // soft blue light
    const l = new T.PointLight(0x66aaff, 0.55, 5);
    l.position.y = 1.9;
    g.add(body, head, l);
    return g;
  }

  if (t === "C") {
    // Crawler – low, fast, spider-like horror
    const m = new T.MeshStandardMaterial({ color: 0x100808, roughness: 1 });
    const body = new T.Mesh(new T.SphereGeometry(0.38, 10, 8), m);
    body.scale.set(1.1, 0.45, 1.6);
    body.position.y = 0.32;
    g.add(body);
    // 6 legs
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const leg = new T.Mesh(new T.CylinderGeometry(0.03, 0.02, 0.75, 4), m);
      leg.position.set(side * 0.42, 0.28, ((i % 3) - 1) * 0.38);
      leg.rotation.z = side * 1.15;
      leg.rotation.x = (i % 3 - 1) * 0.25;
      g.add(leg);
    }
    // glowing red eyes
    const em = new T.MeshBasicMaterial({ color: 0xff2200 });
    [-0.1, 0.1].forEach((x) => {
      const e = new T.Mesh(new T.SphereGeometry(0.045, 6, 6), em);
      e.position.set(x, 0.38, 0.55);
      g.add(e);
    });
    return g;
  }

  // Stalker (S) and Boss Warden (B) – tall, thin, Slenderman / Granny hybrid
  const isBoss = t === "B";
  const scale = isBoss ? 2.15 : 1.55;
  const skin = isBoss ? 0x1a0a0a : 0x2a2218;
  const suit = isBoss ? 0x0a0505 : 0x111111;

  // extremely tall thin body
  const bodyMat = new T.MeshStandardMaterial({ color: suit, roughness: 0.95 });
  const body = new T.Mesh(new T.CylinderGeometry(0.18, 0.22, 2.4, 7), bodyMat);
  body.position.y = 1.4;

  // elongated head (faceless / almost featureless)
  const headMat = new T.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const head = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), headMat);
  head.scale.set(0.85, 1.35, 0.9);
  head.position.y = 2.85;

  // sunken red eyes (only light source on face)
  const eyeMat = new T.MeshBasicMaterial({ color: 0xff0000 });
  [-0.07, 0.07].forEach((x) => {
    const e = new T.Mesh(new T.SphereGeometry(0.04, 6, 6), eyeMat);
    e.position.set(x, 2.9, 0.16);
    g.add(e);
  });

  // long thin arms
  [-1, 1].forEach((s) => {
    const arm = new T.Mesh(
      new T.CylinderGeometry(0.04, 0.03, 1.9, 5),
      bodyMat
    );
    arm.position.set(s * 0.32, 1.5, 0.08);
    arm.rotation.set(-0.4, 0, s * 0.18);
    g.add(arm);
    // claw-like hands
    const hand = new T.Mesh(
      new T.SphereGeometry(0.06, 5, 5),
      new T.MeshStandardMaterial({ color: skin, roughness: 0.8 })
    );
    hand.position.set(s * 0.55, 0.55, 0.35);
    g.add(hand);
  });

  // thin legs
  [-1, 1].forEach((s) => {
    const leg = new T.Mesh(
      new T.CylinderGeometry(0.07, 0.05, 1.3, 5),
      bodyMat
    );
    leg.position.set(s * 0.12, 0.55, 0);
    g.add(leg);
  });

  // ominous red point light on head
  const l = new T.PointLight(0xff0000, isBoss ? 1.1 : 0.7, isBoss ? 9 : 6);
  l.position.y = 2.9;

  g.add(body, head, l);
  g.scale.setScalar(scale);
  return g;
}

/* ---------- LEVEL ---------- */
const hq = !matchMedia("(pointer: coarse)").matches;

function startLevel(level, seed) {
  stopGame();
  loadedSeed = seed;
  audio();
  const c = CH[level - 1];
  const r = rng(seed);
  const N = Math.min(4 + level, 11);
  const m = gen(N, r);
  const W = m.length;

  if (!renderer) {
    renderer = new T.WebGLRenderer({ canvas: $("cv"), antialias: hq });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
  }
  renderer.shadowMap.enabled = hq;
  renderer.setPixelRatio(Math.min(devicePixelRatio, hq ? 2 : 1.35));

  const scene = new T.Scene();
  scene.background = new T.Color(c.fog);
  scene.fog = new T.FogExp2(c.fog, 0.08 + level * 0.005);

  const cam = new T.PerspectiveCamera(70, 1, 0.1, 50);
  cam.rotation.order = "YXZ";
  scene.add(cam);

  scene.add(new T.AmbientLight(0x1a1520, 0.32));

  // Flashlight – tighter, more realistic
  const fl = new T.SpotLight(0xffe8c0, 2.8, 22, Math.PI / 5.5, 0.6, 1.5);
  fl.position.set(0.18, -0.15, 0);
  cam.add(fl, fl.target);
  fl.target.position.set(0, 0, -4.5);
  if (hq) {
    fl.castShadow = true;
    fl.shadow.mapSize.set(1024, 1024);
    fl.shadow.camera.near = 0.25;
    fl.shadow.camera.far = 22;
    fl.shadow.bias = -0.0006;
  }
  cam.add(new T.PointLight(0x331818, 0.4, 4.5));

  // Walls – dirtier
  const wt = tex(c.wall, "rgba(90,10,10,.55)", 1100);
  const walls = [];
  m.forEach((row, y) => row.forEach((v, x) => v && walls.push([x, y])));
  const wm = new T.InstancedMesh(
    new T.BoxGeometry(S, 3.4, S),
    new T.MeshStandardMaterial({ map: wt, bumpMap: wt, bumpScale: 1.4, roughness: 0.97 }),
    walls.length
  );
  const dm = new T.Object3D();
  walls.forEach(([x, y], i) => {
    dm.position.set((x + 0.5) * S, 1.7, (y + 0.5) * S);
    dm.updateMatrix();
    wm.setMatrixAt(i, dm.matrix);
  });
  wm.castShadow = wm.receiveShadow = hq;
  scene.add(wm);

  // Floor
  const ft = tex("#1e1a18", "rgba(70,10,10,.6)", 1400);
  ft.repeat.set(W, W);
  const fm = new T.Mesh(
    new T.PlaneGeometry(W * S, W * S),
    new T.MeshStandardMaterial({ map: ft, bumpMap: ft, roughness: 0.9 })
  );
  fm.rotation.x = -Math.PI / 2;
  fm.position.set((W * S) / 2, 0, (W * S) / 2);
  fm.receiveShadow = hq;
  scene.add(fm);

  // Ceiling
  const ct = tex("#141210", "rgba(0,0,0,.7)", 400);
  ct.repeat.set(W, W);
  const cm = new T.Mesh(
    new T.PlaneGeometry(W * S, W * S),
    new T.MeshStandardMaterial({ map: ct })
  );
  cm.rotation.x = Math.PI / 2;
  cm.position.set((W * S) / 2, 3.4, (W * S) / 2);
  scene.add(cm);

  // Dead ceiling fixtures
  const all = [];
  for (let y = 1; y < W; y += 2)
    for (let x = 1; x < W; x += 2)
      if (!(x === 1 && y === 1) && !(x === 3 && y === 1) && !(x === W - 2 && (y === W - 2 || y === 1)))
        all.push([x, y]);
  all.sort(() => r() - 0.5);
  let ci = 0;
  const take = () => all[ci++ % all.length];
  const cc = (x, y) => [(x + 0.5) * S, (y + 0.5) * S];

  for (let i = 0; i < Math.min(12, all.length); i++) {
    const [x, y] = cc(...all[i]);
    const lm = new T.Mesh(
      new T.BoxGeometry(0.85, 0.07, 0.28),
      new T.MeshBasicMaterial({ color: i % 4 ? 0x4a3a28 : 0x181210 })
    );
    lm.position.set(x, 3.32, y);
    scene.add(lm);
  }

  // Music boxes (keys)
  const keys = Array.from({ length: 3 + (level >> 1) }, () => {
    const [x, z] = cc(...take());
    const k = new T.Mesh(
      new T.BoxGeometry(0.28, 0.48, 0.12),
      new T.MeshStandardMaterial({
        color: 0xe8b830,
        emissive: 0xcc8800,
        emissiveIntensity: 1.3
      })
    );
    k.position.set(x, 1.05, z);
    scene.add(k);
    return { m: k, x, z, taken: false };
  });

  // Items
  const items = [];
  const addI = (t, x, z, text) => {
    const mm = mkItem(t);
    mm.position.set(x, 0.85, z);
    scene.add(mm);
    items.push({ t, m: mm, x, z, y: 0.85, taken: false, text });
  };
  addI("axe", ...cc(3, 1));
  for (let i = 0; i < 4; i++) addI("bat", ...cc(...take()));
  for (let i = 0; i < 2; i++) addI("flare", ...cc(...take()));
  c.notes.forEach((tx) => addI("note", ...cc(...take()), tx));

  // Held axe
  const axe = mkItem("axe");
  axe.scale.setScalar(1.05);
  axe.position.set(0.36, -0.42, -0.7);
  axe.rotation.set(0, 0, 0.32);
  axe.visible = false;
  cam.add(axe);

  // Exit
  const ex = (W - 1.5) * S,
    ez = (W - 1.5) * S;
  const exitMesh = new T.Mesh(
    new T.BoxGeometry(2.1, 2.9, 0.28),
    new T.MeshStandardMaterial({ color: 0x2a0000, emissive: 0x180000 })
  );
  exitMesh.position.set(ex, 1.45, ez);
  scene.add(exitMesh);
  const exitLight = new T.PointLight(0xff1818, 1.8, 8);
  exitLight.position.set(ex, 2.1, ez);
  scene.add(exitLight);

  // Enemies
  const far = all.filter(([x, y]) => x + y > W * 0.7);
  const enemies = c.mon.map((t, i) => {
    const [x, z] = i ? cc(...far[(i * 3) % far.length]) : cc(W - 2, 1);
    const mm = mkEnemy(t);
    mm.position.set(x, 0, z);
    scene.add(mm);
    return {
      m: mm,
      t,
      def: DEF[t],
      hp: DEF[t].hp,
      stun: 0,
      rc: 0,
      next: null,
      tx: x,
      tz: z
    };
  });

  // Flare pool
  const fpool = Array.from({ length: 3 }, () => {
    const l = new T.PointLight(0xff4422, 0, 14);
    l.position.y = -20;
    scene.add(l);
    return { l, t: 0 };
  });

  // Dust motes
  const dustGeo = new T.BufferGeometry();
  const dustCount = hq ? 220 : 100;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = Math.random() * W * S;
    dustPos[i * 3 + 1] = 0.25 + Math.random() * 2.8;
    dustPos[i * 3 + 2] = Math.random() * W * S;
  }
  dustGeo.setAttribute("position", new T.BufferAttribute(dustPos, 3));
  const dust = new T.Points(
    dustGeo,
    new T.PointsMaterial({
      color: 0x776655,
      size: 0.032,
      transparent: true,
      opacity: 0.32,
      depthWrite: false
    })
  );
  scene.add(dust);

  cam.position.set(1.5 * S, 1.6, 1.5 * S);

  G = {
    scene,
    cam,
    fl,
    map: m,
    level,
    keys,
    items,
    enemies,
    axe,
    fpool,
    fi: 0,
    exitMesh,
    exitLight,
    ex,
    ez,
    dust,
    remote: {},
    seen: {},
    open: false,
    adv: false,
    sealMsg: 0,
    yaw: Math.PI,
    pitch: 0,
    bob: 0,
    stepT: 0,
    t: 0,
    sendT: 0,
    beatT: 0,
    hudT: 0,
    grace: 18,
    hp: 3,
    inv: 0,
    dead: false,
    cool: 0,
    shake: 0,
    flOn: true,
    flOff: 0,
    flicker: 0,
    bat: 100,
    flares: 0,
    weapon: false,
    notes: 0,
    atk: 0,
    swing: 0,
    near: null,
    actN: 0,
    ev: 18 + r() * 14,
    clock: new T.Clock(),
    raf: 0,
    sent: false,
    paused: false
  };

  show("game");
  $("endOverlay").classList.add("d-none");
  $("ghost").src = faceImg();
  resize();
  hud();
  save(level);

  if (level === 1 && !prologueDone) {
    G.paused = true;
    cine(PROLOGUE, () => {
      prologueDone = true;
      if (G) {
        G.paused = false;
        story(c, level);
      }
    });
  } else {
    story(c, level);
  }

  if (!soloMode) {
    update(R("players/" + user.uid), {
      hp: 3,
      x: cam.position.x,
      z: cam.position.z
    });
  }
  loop();
}

function stopGame() {
  if (G) {
    cancelAnimationFrame(G.raf);
    G = null;
  }
  $("static").classList.remove("on");
}

function resize() {
  if (!G || !renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  G.cam.aspect = innerWidth / innerHeight;
  G.cam.updateProjectionMatrix();
}
addEventListener("resize", resize);

/* ---------- HUD / STORY / SCARES ---------- */
let msgT;
const msg = (t, ms = 2500) => {
  const e = $("hudMsg");
  e.textContent = t;
  e.classList.add("on");
  clearTimeout(msgT);
  msgT = setTimeout(() => e.classList.remove("on"), ms);
};

function hud() {
  if (!G) return;
  const got = G.keys.filter((k) => k.taken).length;
  const h = Math.max(G.hp, 0);
  $("hudKeys").textContent = `🎵 ${got}/${G.keys.length}  📜 ${G.notes}/2`;
  $("hudHp").textContent =
    "❤".repeat(h) +
    "🖤".repeat(3 - h) +
    `  🔋${Math.round(G.bat)}%  🕯${G.flares}` +
    (G.weapon ? "  🪓" : "");
}

function story(c, level) {
  const s = $("story");
  s.innerHTML = `<small>CHAPTER ${level} OF 7</small><h2>${c.n}</h2><p>${c.intro}</p><small>${
    document.body.classList.contains("touch")
      ? "Stick: move · drag right: look · ⚔ attack · 🕯 flare · ✋ interact"
      : "Click to look · WASD move · E interact · F light · R flare · Click/Space attack"
  }</small>`;
  s.classList.add("on");
  setTimeout(() => s.classList.remove("on"), 11000);
}

function readNote(t) {
  const n = $("note");
  n.innerHTML = `<b>📜 Journal page</b><p>${t}</p><small>E / tap to close</small>`;
  n.classList.remove("d-none");
  clearTimeout(readNote.h);
  readNote.h = setTimeout(() => n.classList.add("d-none"), 14000);
}
$("note").onclick = () => $("note").classList.add("d-none");

function jump(kind) {
  if (!G) return;
  if (kind !== "catch" && G.cool > 0) return;
  G.cool = 9;
  G.shake = 1.0;
  const gh = $("ghost"),
    fl = $("flash");
  gh.classList.add("on");
  fl.classList.remove("on");
  void fl.offsetWidth;
  fl.classList.add("on");
  sfx.scream();
  sfx.static();
  navigator.vibrate?.([160, 80, 400]);
  setTimeout(() => gh.classList.remove("on"), kind === "catch" ? 800 : 480);
}

function ambient() {
  const x = Math.random();
  if (x < 0.26) {
    G.flOff = 3.5;
    sfx.whisper();
    setTimeout(() => G && jump("ghost"), 2600);
  } else if (x < 0.5) {
    sfx.thump();
    msg("Something slammed nearby…", 2000);
  } else if (x < 0.76) {
    sfx.whisper();
    G.flicker = 4;
  } else {
    jump("ghost");
  }
  G.ev = 12 + Math.random() * 18;
}

/* ---------- ITEMS & COMBAT ---------- */
function collect(it) {
  if (!it || it.taken) return;
  it.taken = true;
  it.m.visible = false;
  sfx.pick();
  if (it.t === "bat") {
    G.bat = Math.min(100, G.bat + 48);
    msg("Battery +48%", 1500);
  } else if (it.t === "flare") {
    G.flares++;
    msg("Flare collected — press R / 🕯 to light it", 2300);
  } else if (it.t === "axe") {
    G.weapon = true;
    G.axe.visible = true;
    msg("Fire Axe equipped. Click / Space / ⚔ to swing.", 3200);
  } else {
    G.notes++;
    readNote(it.text);
  }
  hud();
}

function use() {
  if (!G || G.dead) return;
  if (!$("note").classList.contains("d-none")) return $("note").classList.add("d-none");
  collect(G.near);
}

function act(k, i = 0) {
  if (soloMode) {
    if (k === "h") {
      const e = G.enemies[i];
      if (e && e.hp > 0) {
        e.hp--;
        e.stun = 1.4;
        if (e.hp <= 0) killE(e);
      }
    } else if (k === "f") {
      const p = G.cam.position;
      spawnFlare(p.x, p.z);
      G.enemies.forEach((e) => {
        if (e.hp > 0 && Math.hypot(e.m.position.x - p.x, e.m.position.z - p.z) < 10) {
          e.stun = e.t === "B" ? 3.2 : 6.5;
          if (e.t === "W" && --e.hp <= 0) killE(e);
        }
      });
    }
    return;
  }
  const p = G.cam.position;
  update(R("acts/" + user.uid), {
    n: ++G.actN,
    k,
    i,
    x: +p.x.toFixed(2),
    z: +p.z.toFixed(2)
  }).catch(() => {});
}

function attack() {
  const g = G;
  if (!g || g.dead || !g.weapon || g.atk > 0) return;
  g.atk = 0.7;
  g.swing = 0.3;
  sfx.swing();
  const p = g.cam.position;
  const fx = -Math.sin(g.yaw),
    fz = -Math.cos(g.yaw);
  let bi = -1,
    bd = 2.9;
  g.enemies.forEach((e, i) => {
    if (e.hp <= 0) return;
    const dx = e.m.position.x - p.x,
      dz = e.m.position.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.4) {
      bd = d;
      bi = i;
    }
  });
  if (bi >= 0) {
    sfx.hit();
    g.shake = 0.3;
    act("h", bi);
  }
}

function flare() {
  const g = G;
  if (!g || g.dead || g.flares <= 0) return;
  g.flares--;
  act("f");
  hud();
}

function spawnFlare(x, z) {
  const f = G.fpool[G.fi++ % G.fpool.length];
  f.t = 14;
  f.l.position.set(x, 1.15, z);
  sfx.flare();
}

function killE(e) {
  e.hp = 0;
  e.m.visible = false;
  sfx.thump();
}

function applyAct(a) {
  if (a.k === "h") {
    const e = G.enemies[a.i];
    if (e && e.hp > 0) {
      e.hp--;
      e.stun = 1.4;
      if (e.hp <= 0) killE(e);
    }
  } else if (a.k === "f") {
    G.enemies.forEach((e) => {
      if (e.hp > 0 && Math.hypot(e.m.position.x - a.x, e.m.position.z - a.z) < 10) {
        e.stun = e.t === "B" ? 3.2 : 6.5;
        if (e.t === "W" && --e.hp <= 0) killE(e);
      }
    });
  }
}

/* ---------- GAME LOOP ---------- */
const solid = (x, z) => G.map[Math.floor(z / S)]?.[Math.floor(x / S)] !== 0;

function tryMove(dx, dz) {
  const p = G.cam.position;
  const r = 0.36;
  const ok = (x, z) =>
    !(
      solid(x + r, z + r) ||
      solid(x - r, z + r) ||
      solid(x + r, z - r) ||
      solid(x - r, z - r)
    );
  if (ok(p.x + dx, p.z)) p.x += dx;
  if (ok(p.x, p.z + dz)) p.z += dz;
}

const targets = () => {
  const a = [];
  if (!G.dead) a.push({ x: G.cam.position.x, z: G.cam.position.z });
  Object.values(G.remote).forEach((r) => r.hp > 0 && a.push({ x: r.m.position.x, z: r.m.position.z }));
  return a;
};

function enemyAI(e, dt) {
  const p = e.m.position;
  if (G.t < G.grace) return;
  if (e.stun > 0) {
    e.stun -= dt;
    return;
  }
  let best = null,
    bd = 1e9;
  targets().forEach((t) => {
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < bd) {
      bd = d;
      best = t;
    }
  });
  if (!best) return;
  if (bd < e.def.r) {
    e.stun = 3.6;
    return;
  }
  const sp0 = e.def.sp * (1 + 0.05 * G.level) * (bd < 10 ? 1.4 : 1) * dt;
  if (e.def.pass) {
    const sp = Math.min(sp0, bd);
    p.x += ((best.x - p.x) / bd) * sp;
    p.z += ((best.z - p.z) / bd) * sp;
    e.m.rotation.y = Math.atan2(best.x - p.x, best.z - p.z);
    return;
  }
  e.rc -= dt;
  if (e.rc <= 0) {
    e.rc = 0.32;
    e.next = bfs(
      G.map,
      (p.x / S) | 0,
      (p.z / S) | 0,
      (best.x / S) | 0,
      (best.z / S) | 0
    );
  }
  if (e.next) {
    const nx = (e.next[0] + 0.5) * S,
      nz = (e.next[1] + 0.5) * S;
    const dx = nx - p.x,
      dz = nz - p.z;
    const dd = Math.hypot(dx, dz) || 1;
    const sp = Math.min(sp0, dd);
    p.x += (dx / dd) * sp;
    p.z += (dz / dd) * sp;
    e.m.rotation.y = Math.atan2(dx, dz);
  }
}

function tick(dt) {
  const g = G;
  const p = g.cam.position;
  g.t += dt;
  g.cool -= dt;
  g.inv -= dt;
  g.atk -= dt;
  g.hudT -= dt;
  g.flOff = Math.max(0, g.flOff - dt);
  g.flicker = Math.max(0, g.flicker - dt);

  if (!g.dead) {
    g.yaw += ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * 2.1 * dt;
    const fy =
      (K.KeyW || K.ArrowUp ? 1 : 0) -
      (K.KeyS || K.ArrowDown ? 1 : 0) -
      joy.y;
    const fx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + joy.x;
    const len = Math.hypot(fx, fy);
    const run = K.ShiftLeft || joy.run;
    const sp = (run ? 4.5 : 2.7) * dt;
    if (len > 0.05) {
      const n = Math.min(len, 1) / len;
      const sy = Math.sin(g.yaw),
        cy = Math.cos(g.yaw);
      tryMove((-sy * fy + cy * fx) * n * sp, (-cy * fy - sy * fx) * n * sp);
      g.bob += dt * (run ? 11 : 7);
      g.stepT -= dt;
      if (g.stepT <= 0) {
        g.stepT = run ? 0.28 : 0.46;
        sfx.step();
      }
    }
    p.y = 1.6 + (len > 0.05 ? Math.sin(g.bob) * 0.032 : 0);

    g.keys.forEach((k, i) => {
      if (!k.taken && Math.hypot(p.x - k.x, p.z - k.z) < 1.4) {
        k.taken = true;
        k.m.visible = false;
        sfx.pick();
        msg("Music box wound. The lullaby weakens.", 2200);
        if (!soloMode) update(R("keys"), { ["k" + i]: true });
      }
    });

    if (Math.hypot(p.x - g.ex, p.z - g.ez) < 1.8) {
      if (g.open && !g.sent) {
        g.sent = true;
        if (soloMode) {
          if (g.level >= 7) endGame("won");
          else {
            msg("You made it out…", 2500);
            setTimeout(() => {
              if (G) startLevel(g.level + 1, Date.now() % 1e9);
            }, 2200);
          }
        } else {
          update(R("reached"), { [user.uid]: true });
          msg("You made it out…", 3000);
        }
      } else if (!g.open) msg("Locked. Find all the music boxes.", 1500);
    }

    let nr = null,
      nd = 1.7;
    g.items.forEach((it) => {
      if (it.taken) return;
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      it.m.rotation.y += dt;
      it.m.position.y = it.y + Math.sin(g.t * 2 + it.x) * 0.05;
      if (d < 1.2 && (it.t === "bat" || it.t === "flare")) collect(it);
      else if (d < nd) {
        nd = d;
        nr = it;
      }
    });
    g.near = nr;
    $("prompt").textContent = nr
      ? (nr.t === "axe" ? "Pick up Fire Axe" : "Read journal page") + " — E / ✋"
      : "";
  } else {
    $("prompt").textContent = "";
  }

  // Enemies + proximity
  let dmin = 99;
  g.enemies.forEach((e, i) => {
    const q = e.m.position;
    if (e.hp <= 0) {
      e.m.visible = false;
      return;
    }
    if (isHost || soloMode) enemyAI(e, dt);
    else {
      const k = Math.min(1, 10 * dt);
      q.x += (e.tx - q.x) * k;
      q.z += (e.tz - q.z) * k;
      e.m.rotation.y = Math.atan2(e.tx - q.x, e.tz - q.z) || e.m.rotation.y;
    }
    if (e.t === "W") {
      q.y = 0.25 + Math.sin(g.t * 1.8 + i) * 0.18;
      if (e.m.children[0]?.material) e.m.children[0].material.opacity = 0.25 + Math.random() * 0.3;
    }
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    dmin = Math.min(dmin, d);
    if (!g.dead && g.t > g.grace && d < e.def.r && g.inv <= 0) {
      g.hp--;
      g.inv = 4.2;
      hud();
      jump("catch");
      if (!soloMode) update(R("players/" + user.uid), { hp: g.hp });
      if (g.hp <= 0) {
        g.dead = true;
        msg("YOU ARE DEAD. Spectating…", 6000);
        if (soloMode) setTimeout(() => endGame("lost"), 3500);
      }
    }
  });

  // Static overlay intensity based on nearest enemy (Slenderman style)
  const st = $("static");
  if (dmin < 14 && !g.dead) {
    st.classList.add("on");
    st.style.opacity = Math.max(0.08, 0.45 - dmin * 0.03).toFixed(2);
  } else {
    st.classList.remove("on");
    st.style.opacity = "0";
  }

  // Heartbeat
  if (dmin < 12 && !g.dead) {
    g.beatT -= dt;
    if (g.beatT <= 0) {
      g.beatT = 0.32 + dmin * 0.055;
      sfx.beat();
    }
  }

  // Battery & flashlight
  if (g.flOn && g.flOff <= 0) {
    g.bat = Math.max(0, g.bat - dt * 1.2);
    if (g.bat <= 0) g.flOn = false;
  }
  const bk = g.bat / 100;
  const intensity =
    g.flOn && g.flOff <= 0
      ? 2.8 *
        bk *
        (dmin < 9 || g.flicker > 0 ? (Math.random() < 0.2 ? 0.1 : 0.9) : 1)
      : 0;
  g.fl.intensity = intensity;

  // Flares
  g.fpool.forEach((f) => {
    if (f.t > 0) {
      f.t -= dt;
      f.l.intensity = f.t > 0 ? 2.5 * (0.7 + Math.random() * 0.5) : 0;
      if (f.t <= 0) f.l.position.y = -20;
    }
  });

  // Axe swing
  if (g.swing > 0) {
    g.swing -= dt;
    g.axe.rotation.x = -Math.sin((g.swing / 0.3) * Math.PI) * 1.4;
  } else g.axe.rotation.x = 0;

  // Dust
  if (g.dust) {
    const pos = g.dust.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] += Math.sin(g.t * 0.35 + i) * 0.0014;
      if (pos[i + 1] > 3.1) pos[i + 1] = 0.2;
    }
    g.dust.geometry.attributes.position.needsUpdate = true;
  }

  // Solo open check
  if (soloMode) {
    const got = g.keys.filter((k) => k.taken).length;
    const boss = g.enemies.find((e) => e.t === "B");
    const sealed = boss && boss.hp > 0;
    if (got === g.keys.length && sealed && !g.sealMsg) {
      g.sealMsg = 1;
      msg("The exit is sealed while the Heart still beats. Destroy the Warden!", 4500);
    }
    if (got === g.keys.length && !sealed && !g.open) {
      g.open = true;
      g.exitLight.color.set(0x22ff55);
      g.exitMesh.material.color.set(0x114422);
      msg("THE EXIT IS OPEN. RUN.", 3500);
      sfx.thump();
    }
  }

  if (g.hudT <= 0) {
    g.hudT = 0.4;
    hud();
  }
  g.ev -= dt;
  if (g.ev <= 0 && !g.dead && g.t > 16) ambient();

  // Camera
  g.shake = Math.max(0, g.shake - dt);
  const sh = g.shake * 0.055;
  g.cam.rotation.set(
    g.pitch + (Math.random() - 0.5) * sh,
    g.yaw + (Math.random() - 0.5) * sh,
    (Math.random() - 0.5) * sh * 0.55
  );

  // Remote players
  Object.values(g.remote).forEach((r) => {
    const q = r.m.position;
    q.x += (r.tx - q.x) * Math.min(1, 10 * dt);
    q.z += (r.tz - q.z) * Math.min(1, 10 * dt);
    r.m.rotation.y = r.ry;
  });

  // Network
  g.sendT -= dt;
  if (g.sendT <= 0 && !soloMode) {
    g.sendT = 0.1;
    update(R("players/" + user.uid), {
      x: +p.x.toFixed(2),
      z: +p.z.toFixed(2),
      ry: +g.yaw.toFixed(2)
    }).catch(() => {});
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

addEventListener("keydown", (e) => {
  if (!G) return;
  K[e.code] = 1;
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.code === "KeyF") G.flOn = !G.flOn;
  if (e.code === "KeyE") use();
  if (e.code === "KeyR") flare();
  if (e.code === "Space") attack();
});
addEventListener("keyup", (e) => (K[e.code] = 0));

cv.addEventListener("mousedown", (e) => {
  audio();
  if (!locked()) {
    if (matchMedia("(pointer: fine)").matches) cv.requestPointerLock?.();
  } else if (e.button === 0) attack();
});
addEventListener("mousemove", (e) => {
  if (G && (locked() || e.buttons & 1)) {
    G.yaw -= e.movementX * 0.0022;
    G.pitch = Math.max(-1.2, Math.min(1.2, G.pitch - e.movementY * 0.0022));
  }
});

const tap = (id, f) =>
  $(id).addEventListener("touchstart", (e) => {
    e.preventDefault();
    f();
  });
tap("btnLight", () => G && (G.flOn = !G.flOn));
tap("btnAtk", attack);
tap("btnUse", use);
tap("btnFlare", flare);
tap("btnRun", () => {
  joy.run = !joy.run;
  $("btnRun").style.background = joy.run ? "#600" : "";
});

let jid = null,
  lid = null,
  lx = 0,
  ly = 0;
$("joy").addEventListener("touchstart", (e) => {
  e.preventDefault();
  jid = e.changedTouches[0].identifier;
});
addEventListener(
  "touchmove",
  (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === jid) {
        const r = $("joy").getBoundingClientRect();
        const dx = t.clientX - r.left - 65;
        const dy = t.clientY - r.top - 65;
        const l = Math.min(Math.hypot(dx, dy), 52);
        const a = Math.atan2(dy, dx);
        joy.x = Math.cos(a) * (l / 52);
        joy.y = Math.sin(a) * (l / 52);
        $("knob").style.transform = `translate(${Math.cos(a) * l}px,${Math.sin(a) * l}px)`;
      } else if (t.identifier === lid && G) {
        G.yaw -= (t.clientX - lx) * 0.006;
        G.pitch = Math.max(-1.2, Math.min(1.2, G.pitch - (t.clientY - ly) * 0.006));
        lx = t.clientX;
        ly = t.clientY;
      }
    }
  },
  { passive: false }
);
cv.addEventListener("touchstart", (e) => {
  audio();
  for (const t of e.changedTouches)
    if (lid === null) {
      lid = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    }
});
addEventListener("touchend", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === jid) {
      jid = null;
      joy.x = joy.y = 0;
      $("knob").style.transform = "";
    }
    if (t.identifier === lid) lid = null;
  }
});

/* ---------- PWA INSTALL ---------- */
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBanner").classList.add("show");
});
$("btnInstall").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBanner").classList.remove("show");
};
$("btnInstallDismiss").onclick = () => $("installBanner").classList.remove("show");
