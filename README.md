# EMBER & ECHO

A two-player **online** co-op side-scrolling platformer. Inspired by Fireboy & Watergirl — with story, open zones, and real-time Firebase co-op.

Two souls — **Ember** (orange) and **Echo** (teal) — wake in the Hollowlands. Each carries half a broken lantern. Alone the fog swallows them. Together the world remembers. Find the **Four Shards of the First Dawn**.

## Setup

### Firebase (project: scaree-57b06)

1. [Firebase Console](https://console.firebase.google.com) → project **scaree-57b06**
2. **Authentication** → Sign-in method → enable **Anonymous**
3. **Realtime Database** → ensure database exists
4. `firebase-config.js` is already filled for this project
5. **Realtime Database → Rules** → paste below → Publish:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "rooms": {
      "$room": {
        ".validate": "$room.matches(/^[A-Z0-9]{6}$/)",
        "players": {
          "$uid": {
            ".write": "auth.uid === $uid"
          }
        }
      }
    }
  }
}
```

> Tighten rules for production (field validation, room TTL, etc.).

### GitHub Pages

Push all files to repo root → Settings → Pages → Deploy from `main` / root.

### Local

```bash
npx serve .
```

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
