# SCAREE – Co-op Horror PWA

Polished version with **Granny / Slenderman-inspired visuals**.

Tall thin stalkers with glowing red eyes, floating translucent wraiths, low crawling horrors, dirty blood-stained asylum walls, heavy fog, dust motes, proximity static (Slenderman style), and strong jumpscares with a detailed screaming face.

## Features

- Up to 4-player co-op via Firebase
- Full Solo mode
- 7 chapters
- Music boxes, Fire Axe, batteries, flares, journal notes
- Enemies: Stalker, Wraith (light-weak), Crawler, final Warden boss
- Offline support after first load
- Mobile + desktop controls

## Controls

**Desktop:** Click canvas to lock mouse · WASD · Shift sprint · F flashlight · E interact · R flare · Click/Space attack  

**Mobile:** Left stick · drag right side to look · 🔦 🏃 ⚔ ✋ 🕯  

Use headphones.

## Firebase setup

1. Enable Email/Password + Google sign-in
2. Add your domain to Authorized domains
3. Publish the rules from `database.rules.json`

## Run locally

```bash
npx serve .
```

Then open the URL and install as PWA if desired.
