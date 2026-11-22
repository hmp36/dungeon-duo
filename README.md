# Dungeon Duo — Version 1

A browser-based, two-player co-op dungeon crawler built with Phaser-style canvas rendering, Node.js, Express, and Socket.IO. (The game renderer is deliberately lightweight vanilla Canvas so the project has no build step.)

## Live link

**Play it here: <https://dungeon-duo-ykqa.onrender.com>**

Hosted on Render's free tier, so the first visit after a quiet period can take up to a minute to wake up.

## How to play

1. Open the live link in two separate browsers or devices.
2. Player 1 enters a hero name and selects **Create a Room**.
3. Share the six-character room code with Player 2.
4. Player 2 enters the same code and selects **Join Room**.
5. Move with **WASD** or the **arrow keys**. **Space** smashes your guitar over enemies' heads (2 damage, big arc). **Q** plays a riff: music notes stun every monster in front of you for about 2 seconds (4 second cooldown). **Shift** dashes: a quick burst with brief invulnerability.
6. Red rings and a "!" mean a monster is winding up a hit. Step back or dash out.
7. Defeat all monsters to open the route forward. Monsters sleep until a teammate joins; use **Play solo** to test alone.
8. In **Room 2 (The Crypt)** the glowing **Keeper** skeleton carries the dungeon key. Defeat him, then grab the key from the floor.
9. Carry the key into **Room 3**. Clear the monsters, then have every living player stand by the exit on the right.
10. You win when all surviving players escape.

Each player has **5 hearts**. Walk over hearts to pick them up: one is placed in every room and monsters often drop more. At zero hearts a hero falls, but a teammate can **revive** them by standing next to them for about 2 seconds. The team loses if everyone is down.

Monsters: slimes, skeletons, fast erratic bats, and a heavy-hitting brute. Sound effects are built in (toggle with the Sound button).

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Open <http://localhost:3000> in two browser windows/devices on the same network. For another device on your Wi-Fi, use the host computer's local IP address, e.g. `http://192.168.1.20:3000`.

## Deploy to Render

1. Push this project to a GitHub repository.
2. In Render, choose **New > Web Service** and connect the repository.
3. Set **Build Command** to `npm install`.
4. Set **Start Command** to `npm start`.
5. Deploy. Render will provide an HTTPS public URL.
6. Replace the Live link above with that URL.

The server serves the browser client and Socket.IO from the same origin, so no separate frontend hosting or CORS setup is needed. The room state is held in server memory; rooms reset when the server restarts, which is appropriate for this first version.

## Features

- Room-code creation and joining for up to two players, plus solo mode.
- Server-authoritative movement, combat, enemy AI, health, revive, key and room progression.
- Three themed rooms with torch lighting, animated sprites, particles, screen shake and WebAudio sound.
- Attack telegraphs, knockback, hit invulnerability, dash and heart pickups.
- On-screen touch controls (d-pad, attack, dash), team health, enemy count and win/loss overlays.

## Notes

This is a small V1 prototype, not a production-hardened game. It uses in-memory rooms and simple collision/AI. A player who disconnects leaves the current room; reconnect/rejoin recovery and persistent sessions are not included.
