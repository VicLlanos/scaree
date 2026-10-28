/**
 * EMBER & ECHO — Firebase networking
 *
 * Uses path /ee_rooms/{CODE} so it does not conflict with the existing
 * SCAREE /rooms rules (5-char host/slots schema).
 *
 * Add the ee_rooms rules from README next to your current rules, then Publish.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, set, get, update, onValue, onDisconnect,
  push, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let uid = null, roomCode = null, role = null;
let authReady = null;

function R(path = '') {
  return ref(db, `ee_rooms/${roomCode}${path ? '/' + path : ''}`);
}

function code6() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[(Math.random() * c.length) | 0];
  return s;
}

/** Sign in anonymously — must complete before any DB write */
export function signIn() {
  if (authReady) return authReady;
  authReady = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(
      'Sign-in timed out. Firebase Console → Authentication → Sign-in method → enable Anonymous.'
    )), 15000);

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        clearTimeout(t);
        uid = user.uid;
        resolve(user);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (e) {
        clearTimeout(t);
        const code = e?.code || '';
        reject(new Error(
          'Sign-in failed' + (code ? ' (' + code + ')' : '') +
          '. Enable Anonymous under Authentication → Sign-in method.'
        ));
      }
    });
  });
  return authReady;
}

function permHelp(e) {
  const msg = String(e?.message || e);
  if (msg.includes('PERMISSION_DENIED') || e?.code === 'PERMISSION_DENIED') {
    return new Error(
      'Permission denied on /ee_rooms. Add the ee_rooms rules from README to your Realtime Database rules and Publish. (Your existing /rooms rules stay unchanged.)'
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

export const Net = {
  getUid: () => uid,
  getRoom: () => roomCode,
  getRole: () => role,
  signIn,

  async createRoom(name) {
    await signIn();
    roomCode = code6();
    role = 'ember';
    sessionStorage.setItem('ee_room', roomCode);
    try {
      await set(R(), {
        host: uid,
        createdAt: serverTimestamp(),
        meta: { zone: 'village' },
        players: {
          [uid]: {
            name: (name || 'Traveler').slice(0, 16),
            role: 'ember',
            x: 64, y: 400, vx: 0, vy: 0,
            zone: 'village',
            grounded: true,
            holding: null,
            lastSeen: serverTimestamp()
          }
        },
        objects: { crates: {}, plates: {}, levers: {}, doors: {} },
        puzzle: { twinRunes: false, bridge: false, splitVision: false, shrine: false },
        shards: { s0: null, s1: null, s2: null, s3: null },
        journal: {},
        chat: {}
      });
    } catch (e) {
      throw permHelp(e);
    }
    onDisconnect(R(`players/${uid}`)).remove();
    return roomCode;
  },

  async joinRoom(code, name) {
    await signIn();
    roomCode = code.toUpperCase();
    sessionStorage.setItem('ee_room', roomCode);
    let snap;
    try {
      snap = await get(R());
    } catch (e) {
      throw permHelp(e);
    }
    if (!snap.exists()) throw new Error('Room not found — check the code');
    const players = snap.val().players || {};
    if (Object.keys(players).length >= 2 && !players[uid]) {
      throw new Error('Room is full (2/2)');
    }
    const hasEmber = Object.values(players).some(p => p.role === 'ember');
    role = hasEmber ? 'echo' : 'ember';
    try {
      await set(R(`players/${uid}`), {
        name: (name || 'Traveler').slice(0, 16),
        role,
        x: 96, y: 400, vx: 0, vy: 0,
        zone: 'village',
        grounded: true,
        holding: null,
        lastSeen: serverTimestamp()
      });
    } catch (e) {
      throw permHelp(e);
    }
    onDisconnect(R(`players/${uid}`)).remove();
    return roomCode;
  },

  writePlayer(data) {
    if (!uid || !roomCode) return;
    update(R(`players/${uid}`), { ...data, lastSeen: serverTimestamp() }).catch(() => {});
  },

  writeCrate(id, data) {
    if (!roomCode) return;
    update(R(`objects/crates/${id}`), data).catch(() => {});
  },
  writePlate(id, pressed) {
    if (!roomCode) return;
    update(R(`objects/plates/${id}`), { pressed }).catch(() => {});
  },
  writeLever(id, on) {
    if (!roomCode) return;
    update(R(`objects/levers/${id}`), { on }).catch(() => {});
  },
  writeDoor(id, open) {
    if (!roomCode) return;
    update(R(`objects/doors/${id}`), { open }).catch(() => {});
  },

  setPuzzle(flag, val = true) {
    if (!roomCode) return;
    update(R('puzzle'), { [flag]: val }).catch(() => {});
  },

  async unlockShard(i, by) {
    if (!roomCode) return;
    const key = 's' + i;
    try {
      const s = await get(R(`shards/${key}`));
      if (s.val()) return;
      await update(R('shards'), { [key]: serverTimestamp() });
      await this.addJournal(`Shard ${i + 1} of the First Dawn restored.`, by);
    } catch (e) {
      console.warn(e);
    }
  },

  async addJournal(event, by, note = '') {
    if (!roomCode) return;
    await push(R('journal'), { event, by, note, ts: serverTimestamp() });
  },

  async sendChat(name, text) {
    if (!roomCode || !text.trim()) return;
    await push(R('chat'), { name, text: text.trim().slice(0, 120), ts: serverTimestamp() });
  },

  onPlayers(cb) { return onValue(R('players'), s => cb(s.val() || {})); },
  onObjects(cb) { return onValue(R('objects'), s => cb(s.val() || {})); },
  onPuzzle(cb) { return onValue(R('puzzle'), s => cb(s.val() || {})); },
  onShards(cb) { return onValue(R('shards'), s => cb(s.val() || {})); },
  onJournal(cb) {
    return onValue(R('journal'), s => {
      const v = s.val() || {};
      cb(Object.entries(v).map(([id, e]) => ({ id, ...e })).sort((a, b) => (a.ts || 0) - (b.ts || 0)));
    });
  },
  onChat(cb) {
    return onValue(R('chat'), s => {
      const v = s.val() || {};
      cb(Object.entries(v).map(([id, e]) => ({ id, ...e })).sort((a, b) => (a.ts || 0) - (b.ts || 0)));
    });
  },
  onConnected(cb) { return onValue(ref(db, '.info/connected'), s => cb(!!s.val())); },

  setZone(z) { if (roomCode) update(R('meta'), { zone: z }).catch(() => {}); }
};
