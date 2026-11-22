# Riff & Shield (formerly Dungeon Duo)

A browser-based, two-player co-op dungeon crawler built with Phaser-style canvas rendering, Node.js, Express, and Socket.IO. (The game renderer is deliberately lightweight vanilla Canvas so the project has no build step.)

## Live link

**Play it here: <https://dungeon-duo-ykqa.onrender.com>**

Hosted on Render's free tier, so the first visit after a quiet period can take up to a minute to wake up.

## How to play

1. Open the live link, pick a hero (**Troubadour** or **Knight**), and **Create a Room**. Share the six-character code, or tick **Daily Dungeon** for today's shared loot layout.
2. Your friend picks a hero and joins with the code. Monsters sleep until a teammate joins; **Play solo** starts alone.
3. **Move** WASD/arrows. **Attack** Space. **Ability** Q. **Special** R. **Dash** Shift. On phones use the on-screen buttons.
   - Troubadour: guitar smash (2 dmg), riff that stuns a cone of monsters, healing song.
   - Knight: wide sword slash, shield bash (knockback and stun), guard (brief immunity).
4. Red rings and "!" warn that a monster is about to hit. Archers show a dashed aim line.
5. Five rooms: Forgotten Entrance, The Crypt (the glowing Keeper carries the key), Archer Gallery, Treasure Chamber, and the **Dragon of Debt** boss (three phases).
6. Smash chests for gold or hearts (some are mimics). Spend gold at rest stops between rooms: heal, heart containers, faster ability recharge, boots, damage.
7. Each hero has 5 hearts (up to 7 with pickups). Stand next to a fallen hero for about 2 seconds to revive them.
8. Win by getting every living hero out of the final room. You get a score screen and a leaderboard entry.

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

- Server-authoritative Socket.IO game, vanilla Canvas client with no build step.
- Two classes, ranged and mimic enemies, a three-phase boss, shop, score screen, top-10 leaderboard (best effort file storage; resets if the host disk resets) and a Daily Dungeon seed.
- Torch lighting, particles, screen shake, WebAudio sound effects and chiptune music (mute button).
- Title screen with how-to modal; touch controls for phones.

## Notes

This is a small V1 prototype, not a production-hardened game. It uses in-memory rooms and simple collision/AI. A player who disconnects leaves the current room; reconnect/rejoin recovery and persistent sessions are not included.

## Gear and combat
- Chests, mimics and the boss drop gear (weapon, head, trinket; common, uncommon, rare). Press I (or GEAR) to equip.
- Attacks chain into a 3-hit combo with a heavy finisher; attacking right after a dash is a lunge. Gear can add crits.

## Visuals
- Renders at 2x resolution with rim lighting, soft outlines, contact shadows, light shafts, two-level bloom and film grain.
- Class select shows animated previews of each hero.

## Run options
- **Difficulty** (chosen by whoever creates the room): Easy (7 hearts, monsters about 30% softer, score x0.8), Normal, Hard (4 hearts, monsters about 35% tougher, score x1.25).
- **Pause**: press P (or the PAUSE button). Either hero can pause for both; timers are shifted on resume so nothing catches up.
- **Play again**: after a win or a defeat, both heroes press PLAY AGAIN to restart the same room with the same difficulty (solo restarts immediately).
- **Iron Warden**: a mini-boss in the Treasure Chamber with a shockwave ring every other swing. Drops gear for both heroes.
- **Share preview**: Open Graph and Twitter tags with `public/img/og.jpg` (1200x630).
- The connection banner explains the free-tier cold start ("Waking the dungeon...") and Create/Join stay disabled until the socket connects.
