# EMBER & ECHO

A two-player **online** co-op side-scrolling platformer. Inspired by Fireboy & Watergirl — with story, open zones, and real-time Firebase co-op.

Two souls — **Ember** (orange) and **Echo** (teal) — wake in the Hollowlands. Each carries half a broken lantern. Alone the fog swallows them. Together the world remembers. Find the **Four Shards of the First Dawn**.

## Setup

### Firebase (project: scaree-57b06)

Your existing SCAREE rules for `/rooms` stay as they are. Ember & Echo uses a **separate** path: `/ee_rooms`.

**1. Enable Anonymous Auth**
- Authentication → Sign-in method → **Anonymous** → Enable → Save

**2. Add these rules** (keep your current `/users` and `/rooms` blocks)

In Realtime Database → Rules, merge so the file looks like:

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        ".validate": "newData.hasChildren(['name'])",
        "name": { ".validate": "newData.isString() && newData.val().length <= 20" },
        "bestLevel": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 3" },
        "wins": { ".validate": "newData.isNumber() && newData.val() >= 0" },
        "$other": { ".validate": false }
      }
    },

    "rooms": {
      "$room": {
        ".read": "auth != null",
        ".validate": "$room.matches(/^[A-Z0-9]{5}$/)",
        ".write": "auth != null && ((!data.exists() && newData.child('host').val() === auth.uid) || (data.child('host').val() === auth.uid && !newData.exists()))",
        "host": { ".validate": "newData.isString()" },
        "createdAt": { ".validate": "newData.isNumber()" },
        "state": {
          ".write": "auth != null && data.parent().child('host').val() === auth.uid",
          ".validate": "newData.isString() && newData.val().matches(/^(lobby|playing|won|lost)$/)"
        },
        "level": {
          ".write": "auth != null && data.parent().child('host').val() === auth.uid",
          ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 3"
        },
        "seed": {
          ".write": "auth != null && data.parent().child('host').val() === auth.uid",
          ".validate": "newData.isNumber()"
        },
        "enemy": {
          ".write": "auth != null && data.parent().child('host').val() === auth.uid",
          "x": { ".validate": "newData.isNumber()" },
          "z": { ".validate": "newData.isNumber()" },
          "$other": { ".validate": false }
        },
        "slots": {
          "$s": {
            ".write": "auth != null && ((!data.exists() && newData.val() === auth.uid) || (data.val() === auth.uid && !newData.exists()))",
            ".validate": "$s.matches(/^s[0-3]$/) && newData.isString()"
          }
        },
        "players": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid && (data.parent().parent().child('slots').child('s0').val() === auth.uid || data.parent().parent().child('slots').child('s1').val() === auth.uid || data.parent().parent().child('slots').child('s2').val() === auth.uid || data.parent().parent().child('slots').child('s3').val() === auth.uid)",
            ".validate": "newData.hasChildren(['name','hp'])",
            "name": { ".validate": "newData.isString() && newData.val().length <= 20" },
            "x": { ".validate": "newData.isNumber()" },
            "z": { ".validate": "newData.isNumber()" },
            "ry": { ".validate": "newData.isNumber()" },
            "hp": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 3" },
            "$other": { ".validate": false }
          }
        },
        "keys": {
          ".write": "auth != null && (data.parent().child('players').child(auth.uid).exists() || data.parent().child('host').val() === auth.uid)",
          "$k": { ".validate": "$k.matches(/^k[0-9]$/) && newData.val() === true" }
        },
        "reached": {
          ".write": "auth != null && (data.parent().child('players').child(auth.uid).exists() || data.parent().child('host').val() === auth.uid)",
          "$u": { ".validate": "newData.val() === true" }
        },
        "$other": { ".validate": false }
      }
    },

    "ee_rooms": {
      "$room": {
        ".read": "auth != null",
        ".write": "auth != null",
        ".validate": "$room.matches(/^[A-Z0-9]{6}$/)"
      }
    }
  }
}
```

**3. Publish** the rules, wait ~10 seconds, hard-refresh the game.

The title screen signs you in (Anonymous) automatically. Then Create / Join Room works under `/ee_rooms` without touching SCAREE data.

## Progressive Web App (PWA)

This game is a full PWA — installable on phones and tablets:

1. Open the site in **Chrome** (Android) or **Safari** (iOS).
2. Android: tap the install banner, or menu → **Install app** / **Add to Home screen**.
3. iOS Safari: Share → **Add to Home Screen**.
4. Launch from the home screen for fullscreen landscape play with offline caching of assets.

Service worker caches all game files. Firebase still needs a network connection for multiplayer.

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | A/D or ←/→ | D-pad |
| Jump | W / ↑ / Space | Jump button |
| Interact / Pick up | E | Interact button |
| Drop crate | E again | Interact |

## Database schema

```
/rooms/{ROOM}/
  meta: { createdAt, zone, startedAt, endedAt }
  players/{uid}/: { name, role, x, y, vx, vy, zone, grounded, holding, lastSeen }
  objects/
    crates/{id}:  { x, y, heldBy }
    plates/{id}:  { pressed }
    levers/{id}:  { on }
    doors/{id}:   { open }
  puzzle/: { twinRunes, bridge, splitVision, shrine }
  shards/: { s0, s1, s2, s3 }
  journal/{id}: { event, by, ts, note }
  chat/{id}: { name, text, ts }
```

## How to playtest

1. Open **two browser tabs** (or desktop + phone).
2. Tab 1 → **Create Room** → copy code → enter game.
3. Tab 2 → **Join Room** → paste code.
4. Both should see each other move and jump.
5. Village: pick up the crate, place on the plate → door opens for both.
6. Mistwood: stand on both runes at the same time → Shard 0 unlocks on both screens.
7. Continue through Salt Flats, Library, First Dawn.
8. Check journal entries and shard icons update in both tabs.

## Zones

1. **Cinder Village** — tutorial (crate + plate + door), NPC
2. **Mistwood** — Twin Runes puzzle → Shard 0
3. **Salt Flats** — Bridge / lever / crate puzzle → Shard 1
4. **Obsidian Library** — Split Vision glyphs → Shard 2
5. **First Dawn** — Shared shrine finale → Shard 3 + ending
