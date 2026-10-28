# SCAREE – 4-player co-op horror (PWA)
Stack: HTML + JavaScript (ES modules) + Bootstrap 5 + Three.js, Firebase Auth + Realtime Database.

## Firebase setup (console.firebase.google.com > project scaree-57b06)
1. Build > Authentication > Sign-in method: enable **Email/Password** and **Google**.
2. Authentication > Settings > Authorized domains: add `<your-username>.github.io`.
3. Build > Realtime Database > Create database. If its URL is not `https://scaree-57b06-default-rtdb.firebaseio.com`, set `databaseURL` in `js/firebase-config.js`.
4. Realtime Database > Rules: paste `database.rules.json` and **Publish**.

## Deploy on GitHub Pages
Push all files to a repo root > Settings > Pages > Deploy from branch `main` / root. Open the https URL on your phone and use "Add to Home Screen / Install".

## Controls
Desktop: click to lock mouse, WASD, Shift sprint, F flashlight. Mobile: left joystick, drag right side to look, 🔦 and 🏃 buttons. Use headphones.
Local testing needs a server (e.g. `npx serve`), not file://.
