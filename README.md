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
5. Move with **WASD** or the **arrow keys**. Press **Space** to attack.
6. Defeat all monsters to open the route forward.
7. In **Room 2**, after clearing the monsters, find the glowing key near the right side of the room.
8. Carry the key into **Room 3**. Clear the monsters, then have every living player stand by the exit on the right.
9. You win when all surviving players escape. A player who is out does not need to reach the exit.

Each player starts with **3 hearts**. At zero hearts that player is out; there is **no revive mechanic**. The team loses if everyone is out.

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

## Version 1 scope

- Room-code creation and joining for up to two players (one player can also start alone to test).
- Server-mediated movement, combat, enemy AI, health, key pickup, and room progression.
- Three compact rooms, basic melee combat, three hearts per player.
- Key appears in Room 2 after its monsters are defeated; exit is in Room 3.
- On-screen controls, rules, team health, enemy count, room code, and win/loss overlays.

## Notes

This is a small V1 prototype, not a production-hardened game. It uses in-memory rooms and simple collision/AI. A player who disconnects leaves the current room; reconnect/rejoin recovery and persistent sessions are not included.
