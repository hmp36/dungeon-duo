const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const ROOM_W = 800, ROOM_H = 520;
const MAX_HP = 5;
const REVIVE_TIME = 2.2;       // seconds a teammate must stand next to a fallen hero
const HIT_INVULN = 1100;       // ms of protection after taking a hit
const NOTE_COOLDOWN = 4000, NOTE_STUN = 1100;
const DASH_MS = 170, DASH_COOLDOWN = 1100;

// Monster types. windup = warning time before a hit lands, cooldown = pause between attacks.
const MOB = {
  slime:    { hp: 2, speed: 34, range: 46, windup: 520, cooldown: 1500, dmg: 1, stop: 34 },
  skeleton: { hp: 3, speed: 46, range: 50, windup: 480, cooldown: 1400, dmg: 1, stop: 36 },
  bat:      { hp: 1, speed: 88, range: 40, windup: 380, cooldown: 1700, dmg: 1, stop: 26 },
  brute:    { hp: 6, speed: 30, range: 62, windup: 650, cooldown: 1900, dmg: 2, stop: 46 }
};
const roomLayouts = [
  { name: "Forgotten Entrance", mobs: ["slime", "slime", "slime"], spawns: [[100, 260], [160, 260]], hearts: [[330, 450]], chests: [[700, 100], [120, 470]] },
  { name: "The Crypt", mobs: ["skeleton", "skeleton", "bat", "bat"], keeper: 0, spawns: [[90, 260], [145, 260]], hearts: [[400, 450]], chests: [[100, 100], [700, 470], [400, 100]] },
  { name: "Treasure Chamber", mobs: ["brute", "skeleton", "bat"], spawns: [[90, 260], [145, 260]], hearts: [[400, 440]], chests: [[60, 90], [140, 90], [660, 90], [740, 90], [60, 470], [740, 470]] }
];
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clampX = x => clamp(x, 28, ROOM_W - 28);
const clampY = y => clamp(y, 55, ROOM_H - 28);

// Six characters, no 0/O/1/I/L so codes are easy to read and type on a phone.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode() {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return c;
}

function makeRoom(code) {
  return {
    code, players: {}, stage: 0, key: false, keyDrop: null, finished: false, gameOver: false,
    started: false, doorWas: false, enemies: [], pickups: [], chests: [], gold: 0
  };
}
function makeEnemies(stage, graceMs) {
  const layout = roomLayouts[stage], now = Date.now();
  return layout.mobs.map((kind, i) => ({
    id: `${stage}-${i}-${crypto.randomBytes(3).toString("hex")}`, kind,
    x: 430 + (i % 2) * 105, y: 115 + Math.floor(i / 2) * 155,
    hp: MOB[kind].hp, maxHp: MOB[kind].hp, alive: true, keeper: layout.keeper === i,
    activeAt: now + graceMs, windupUntil: 0, windupTarget: null, nextAttackAt: 0,
    retreatUntil: 0, stunUntil: 0, hitUntil: 0, phase: Math.random() * 6.28
  }));
}
function initStage(room) {
  room.enemies = makeEnemies(room.stage, 1600);
  room.pickups = roomLayouts[room.stage].hearts.map(([x, y], i) => ({ id: `h${room.stage}-${i}`, x, y }));
  room.chests = roomLayouts[room.stage].chests.map(([x, y], i) => ({ id: `c${room.stage}-${i}`, x, y, open: false }));
  room.keyDrop = null;
  room.doorWas = false;
  const spawns = roomLayouts[room.stage].spawns;
  Object.values(room.players).forEach(p => {
    const s = spawns[p.slot] || spawns[0];
    p.x = s[0]; p.y = s[1]; p.attackUntil = 0; p.dashUntil = 0;
    p.input = { up: false, down: false, left: false, right: false };
  });
}
function publicState(room) {
  const now = Date.now();
  const cleared = room.enemies.every(e => !e.alive);
  return {
    code: room.code, stage: room.stage, key: room.key, finished: room.finished,
    gameOver: room.gameOver, maxHp: MAX_HP, waiting: !room.started,
    keyDrop: room.keyDrop,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, slot: p.slot, x: p.x, y: p.y, hp: p.hp, alive: p.alive,
      facing: p.facing, attacking: now < p.attackUntil, dashing: now < p.dashUntil,
      noteCd: Math.max(0, Math.min(1, (p.lastNote + NOTE_COOLDOWN - now) / NOTE_COOLDOWN)), playing: now < (p.noteUntil || 0), hurt: now - p.lastHit < 450, invuln: now - p.lastHit < HIT_INVULN,
      revive: p.alive ? 0 : Math.min(1, p.reviveT / REVIVE_TIME)
    })),
    enemies: room.enemies.map(e => ({
      id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, alive: e.alive,
      keeper: e.keeper && !room.key && !room.keyDrop,
      hurt: now < e.hitUntil, stunned: now < e.stunUntil, winding: e.windupUntil > now, dormant: now < e.activeAt || !room.started
    })),
    pickups: room.pickups, chests: room.chests, gold: room.gold,
    enemyCount: room.enemies.filter(e => e.alive).length,
    doorOpen: cleared && (room.stage === 0 || room.key)
  };
}
function broadcast(room) { io.to(room.code).emit("state", publicState(room)); }
function fx(room, type, data = {}) { io.to(room.code).emit("fx", { type, ...data }); }
function notice(room, msg) { io.to(room.code).emit("notice", msg); }

function resetRoom(room) {
  room.stage = 0; room.gold = 0; room.key = false; room.keyDrop = null; room.finished = false; room.gameOver = false;
  Object.values(room.players).forEach(p => {
    p.hp = MAX_HP; p.alive = true; p.reviveT = 0; p.lastHit = 0;
  });
  initStage(room);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}, cb = () => {}) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = makeRoom(code);
    rooms.set(code, room);
    joinRoom(socket, room, name, cb);
  });

  socket.on("joinRoom", ({ code, name } = {}, cb = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: "Room not found. Check the code or create a new room." });
    if (Object.keys(room.players).length >= 2) return cb({ ok: false, error: "That room already has two players." });
    if (room.finished || room.gameOver) resetRoom(room);
    joinRoom(socket, room, name, cb);
  });

  function joinRoom(sock, room, name, cb) {
    if (Object.keys(room.players).length >= 2) return cb({ ok: false, error: "That room is full." });
    const used = Object.values(room.players).map(p => p.slot);
    const slot = used.includes(0) ? 1 : 0;
    const index = Object.keys(room.players).length;
    const player = {
      id: sock.id, name: String(name || `Player ${index + 1}`).slice(0, 18), slot,
      x: 100 + slot * 55, y: 260, hp: MAX_HP, alive: true, facing: "right",
      input: { up: false, down: false, left: false, right: false }, attackUntil: 0,
      lastAttack: 0, lastNote: 0, lastHit: 0, lastDash: 0, dashUntil: 0, dashDir: [1, 0], reviveT: 0
    };
    room.players[sock.id] = player;
    sock.join(room.code);
    sock.data.roomCode = room.code;
    if (Object.keys(room.players).length === 1) initStage(room);
    else if (!room.started) {
      // Teammate arrived: wake the monsters, with a short grace period.
      room.started = true;
      room.enemies.forEach(e => { e.activeAt = Date.now() + 2200; });
    }
    cb({ ok: true, code: room.code, playerId: sock.id, playerNumber: index + 1 });
    notice(room, `${player.name} joined (${index + 1}/2).`);
    broadcast(room);
  }

  // Solo test mode: start without waiting for a teammate.
  socket.on("startSolo", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.started) return;
    room.started = true;
    room.enemies.forEach(e => { e.activeAt = Date.now() + 2200; });
    notice(room, "Solo run started. Good luck!");
    broadcast(room);
  });

  socket.on("input", data => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver) return;
    const keys = data || {};
    for (const k of ["up", "down", "left", "right"]) p.input[k] = !!keys[k];
    if (keys.facing && DIRS[keys.facing]) p.facing = keys.facing;
  });

  socket.on("attack", () => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver) return;
    const now = Date.now();
    if (now - p.lastAttack < 480) return;
    p.lastAttack = now; p.attackUntil = now + 260;
    fx(room, "swing", { id: p.id });
    const [dx, dy] = DIRS[p.facing] || [1, 0];
    room.enemies.forEach(e => {
      if (!e.alive) return;
      const vx = e.x - p.x, vy = e.y - p.y;
      const along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      if (along >= -8 && along < 96 && side < 48) {
        e.hp -= 2; e.hitUntil = now + 200; e.stunUntil = Math.max(e.stunUntil, now + 300);
        e.windupUntil = 0;                       // a hit interrupts the monster's attack
        e.x = clampX(e.x + dx * 40); e.y = clampY(e.y + dy * 40);
        if (e.hp <= 0) killEnemy(room, e);
        else fx(room, "hit", { x: e.x, y: e.y });
      }
    });
    room.chests.forEach(c => {
      if (c.open) return;
      const vx = c.x - p.x, vy = c.y - p.y, along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      if (along >= -20 && along < 100 && side < 50) openChest(room, c);
    });
    broadcast(room);
  });

  // Guitar riff: a wave of music notes that stuns every monster in front of you.
  socket.on("note", () => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver) return;
    const now = Date.now();
    if (now - p.lastNote < NOTE_COOLDOWN) return;
    p.lastNote = now; p.noteUntil = now + 600;
    const [dx, dy] = DIRS[p.facing] || [1, 0];
    fx(room, "notes", { id: p.id, x: p.x, y: p.y, facing: p.facing });
    room.enemies.forEach(e => {
      if (!e.alive) return;
      const vx = e.x - p.x, vy = e.y - p.y, along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      if (along > -20 && along < 230 && side < 40 + Math.max(0, along) * 0.45) {
        e.stunUntil = now + NOTE_STUN; e.windupUntil = 0; e.hitUntil = now + 120;
        fx(room, "stun", { x: e.x, y: e.y });
      }
    });
    broadcast(room);
  });

  socket.on("dash", () => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver) return;
    const now = Date.now();
    if (now - p.lastDash < DASH_COOLDOWN) return;
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    if (!dx && !dy) [dx, dy] = DIRS[p.facing] || [1, 0];
    p.dashDir = [dx, dy]; p.lastDash = now; p.dashUntil = now + DASH_MS;
    fx(room, "dash", { id: p.id, x: p.x, y: p.y });
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    delete room.players[socket.id];
    notice(room, "A player disconnected. The room is waiting for them to reconnect or for a new game.");
    if (Object.keys(room.players).length === 0) rooms.delete(code);
    else broadcast(room);
  });
});

function openChest(room, c) {
  c.open = true;
  const heart = Math.random() < 0.4 && room.pickups.length < 4;
  if (heart) room.pickups.push({ id: `c${crypto.randomBytes(3).toString("hex")}`, x: c.x, y: clamp(c.y + 38, 80, ROOM_H - 50) });
  else room.gold += 25;
  fx(room, "chest", { x: c.x, y: c.y, loot: heart ? "heart" : "gold" });
}

function killEnemy(room, e) {
  e.alive = false;
  fx(room, "kill", { x: e.x, y: e.y, kind: e.kind });
  if (e.keeper && !room.key) {
    room.keyDrop = { x: clamp(e.x, 60, ROOM_W - 90), y: clamp(e.y, 80, ROOM_H - 60) };
    fx(room, "keydrop", room.keyDrop);
    notice(room, "The Keeper dropped the dungeon key! Grab it.");
  } else if (Math.random() < 0.6 && room.pickups.length < 3) {
    room.pickups.push({ id: `d${crypto.randomBytes(3).toString("hex")}`, x: clamp(e.x, 50, ROOM_W - 50), y: clamp(e.y, 80, ROOM_H - 50) });
  }
}

function hurtPlayer(room, p, dmg, from, now) {
  p.hp = Math.max(0, p.hp - dmg); p.lastHit = now;
  const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1;
  p.x = clampX(p.x + dx / d * 46); p.y = clampY(p.y + dy / d * 46);   // knockback
  fx(room, "hurt", { id: p.id, x: p.x, y: p.y, dmg });
  if (p.hp === 0) {
    p.alive = false; p.reviveT = 0;
    p.input = { up: false, down: false, left: false, right: false };
    fx(room, "down", { x: p.x, y: p.y });
    notice(room, `${p.name} is down! Stand next to them for ${REVIVE_TIME.toFixed(0)} seconds to revive.`);
  }
}

function tick() {
  const now = Date.now(), dt = 0.05;
  for (const room of rooms.values()) {
    if (room.finished || room.gameOver || Object.keys(room.players).length < 1) continue;
    const all = Object.values(room.players);
    let alive = all.filter(p => p.alive);
    if (alive.length === 0) { room.gameOver = true; fx(room, "gameover"); broadcast(room); continue; }

    // Player movement (dash overrides input for a moment).
    for (const p of alive) {
      const dashing = now < p.dashUntil;
      let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
      if (dashing) [dx, dy] = p.dashDir;
      const mag = Math.hypot(dx, dy) || 1;
      const speed = dashing ? 520 : 175;
      p.x = clampX(p.x + dx / mag * speed * dt);
      p.y = clampY(p.y + dy / mag * speed * dt);
      if (!dashing && (dx || dy)) p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    }

    // Monsters (asleep until a teammate arrives or solo is chosen).
    if (room.started) {
      for (const e of room.enemies) {
        if (!e.alive || now < e.activeAt || now < e.stunUntil) continue;
        const def = MOB[e.kind];
        const target = alive.reduce((b, p) => Math.hypot(p.x - e.x, p.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? p : b, alive[0]);
        const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;

        if (e.windupUntil) {                       // winding up: stand still, then strike
          if (now >= e.windupUntil) {
            e.windupUntil = 0; e.nextAttackAt = now + def.cooldown; e.retreatUntil = now + 650;
            const victim = room.players[e.windupTarget];
            if (victim && victim.alive && Math.hypot(victim.x - e.x, victim.y - e.y) < def.range + 14 &&
                now >= victim.dashUntil && now - victim.lastHit > HIT_INVULN) {
              hurtPlayer(room, victim, def.dmg, e, now);
            }
          }
          continue;
        }
        if (now < e.retreatUntil) {                // back off after attacking
          e.x = clampX(e.x - dx / d * def.speed * 0.8 * dt);
          e.y = clampY(e.y - dy / d * def.speed * 0.8 * dt);
          continue;
        }
        let mx = dx / d, my = dy / d;
        if (e.kind === "bat") {                    // erratic flutter
          const w = Math.sin(now / 170 + e.phase) * 0.9;
          mx += -dy / d * w; my += dx / d * w;
          const m = Math.hypot(mx, my) || 1; mx /= m; my /= m;
        }
        if (d > def.stop) { e.x = clampX(e.x + mx * def.speed * dt); e.y = clampY(e.y + my * def.speed * dt); }
        if (d < def.range && now >= e.nextAttackAt) { e.windupUntil = now + def.windup; e.windupTarget = target.id; }
      }
    }

    // Revive: stand next to a fallen teammate.
    for (const p of all) {
      if (p.alive) continue;
      const helper = alive.some(a => Math.hypot(a.x - p.x, a.y - p.y) < 50);
      p.reviveT = helper ? p.reviveT + dt : Math.max(0, p.reviveT - dt * 2);
      if (p.reviveT >= REVIVE_TIME) {
        p.alive = true; p.hp = 2; p.reviveT = 0; p.lastHit = now;
        fx(room, "revive", { x: p.x, y: p.y });
        notice(room, `${p.name} is back on their feet!`);
      }
    }
    alive = all.filter(p => p.alive);
    if (alive.length === 0) { room.gameOver = true; fx(room, "gameover"); broadcast(room); continue; }

    // Heart pickups heal anyone who isn't full.
    room.pickups = room.pickups.filter(pk => {
      const taker = alive.find(p => p.hp < MAX_HP && Math.hypot(p.x - pk.x, p.y - pk.y) < 40);
      if (!taker) return true;
      taker.hp++;
      fx(room, "heal", { x: pk.x, y: pk.y });
      return false;
    });

    // The dungeon key.
    if (room.keyDrop && alive.some(p => Math.hypot(p.x - room.keyDrop.x, p.y - room.keyDrop.y) < 38)) {
      fx(room, "key", room.keyDrop);
      room.key = true; room.keyDrop = null;
      notice(room, "Dungeon key collected! Now clear the room and head for the exit.");
    }

    // Door and room progression.
    const cleared = room.enemies.every(e => !e.alive);
    const doorOpen = cleared && (room.stage === 0 || room.key);
    if (doorOpen && !room.doorWas) {
      fx(room, "door");
      notice(room, "The exit is open! Every hero still standing must reach it.");
    } else if (cleared && !room.key && room.stage > 0 && !room.doorWas && !room.lockedNoticed) {
      room.lockedNoticed = true;
      notice(room, "The exit is locked. The key must be somewhere in this room.");
    }
    room.doorWas = doorOpen;
    if (doorOpen) {
      const nearExit = alive.every(p => p.x > 700 && Math.abs(p.y - 260) < 90);
      if (nearExit) {
        if (room.stage < 2) {
          room.stage++; room.lockedNoticed = false;
          initStage(room);
          fx(room, "stage", { stage: room.stage });
          notice(room, `Room ${room.stage + 1}: ${roomLayouts[room.stage].name}`);
        } else {
          room.finished = true;
          fx(room, "win");
          notice(room, "The team escaped the dungeon!");
        }
      }
    }
    broadcast(room);
  }
}
setInterval(tick, 50);

if (require.main === module) {
  server.listen(PORT, () => console.log(`Dungeon Duo listening on ${PORT}`));
} else {
  module.exports = { server, io, rooms, MOB, MAX_HP };   // for automated tests
}
