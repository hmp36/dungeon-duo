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
const roomLayouts = [
  { name: "Forgotten Entrance", enemies: 3, spawns: [[100,260],[160,260]], exits: [[740,260]] },
  { name: "The Crypt", enemies: 4, spawns: [[90,260],[145,260]], exits: [[740,260]] },
  { name: "Treasure Chamber", enemies: 3, spawns: [[90,260],[145,260]], exits: [[740,260]] }
];

// Six characters, no 0/O/1/I/L so codes are easy to read and type on a phone.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode() {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return c;
}

function makeRoom(code) {
  return {
    code, players: {}, stage: 0, key: false, finished: false, gameOver: false,
    enemies: [], lastTick: Date.now()
  };
}
function makeEnemies(stage) {
  const count = roomLayouts[stage].enemies;
  return Array.from({length: count}, (_, i) => ({
    id: `${stage}-${i}-${crypto.randomBytes(3).toString("hex")}`,
    x: 430 + (i % 2) * 105, y: 115 + Math.floor(i / 2) * 155,
    hp: stage === 2 ? 3 : 2, maxHp: stage === 2 ? 3 : 2,
    speed: 42 + stage * 7, attackAt: 0, alive: true
  }));
}
function initStage(room) {
  room.enemies = makeEnemies(room.stage);
  const spawns = roomLayouts[room.stage].spawns;
  Object.values(room.players).forEach((p, i) => {
    p.x = spawns[i][0]; p.y = spawns[i][1]; p.attackUntil = 0;
  });
}
function publicState(room) {
  return {
    code: room.code, stage: room.stage, key: room.key,
    finished: room.finished, gameOver: room.gameOver,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp,
      alive: p.alive, facing: p.facing, attackUntil: p.attackUntil
    })),
    enemies: room.enemies.map(e => ({...e})),
    enemyCount: room.enemies.filter(e => e.alive).length,
    doorOpen: room.enemies.every(e => !e.alive) && (room.stage === 0 || room.key)
  };
}
function broadcast(room) { io.to(room.code).emit("state", publicState(room)); }
function resetRoom(room) {
  room.stage = 0; room.key = false; room.keyAvailable = false; room.finished = false; room.gameOver = false;
  Object.values(room.players).forEach(p => { p.hp = 3; p.alive = true; });
  initStage(room);
}

io.on("connection", socket => {
  socket.on("createRoom", ({name} = {}, cb = () => {}) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = makeRoom(code);
    rooms.set(code, room);
    joinRoom(socket, room, name, cb);
  });

  socket.on("joinRoom", ({code, name} = {}, cb = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb({ok:false, error:"Room not found. Check the code or create a new room."});
    if (Object.keys(room.players).length >= 2) return cb({ok:false, error:"That room already has two players."});
    if (room.finished || room.gameOver) resetRoom(room);
    joinRoom(socket, room, name, cb);
  });

  function joinRoom(sock, room, name, cb) {
    if (Object.keys(room.players).length >= 2) return cb({ok:false, error:"That room is full."});
    const index = Object.keys(room.players).length;
    const player = {
      id: sock.id, name: String(name || `Player ${index+1}`).slice(0,18),
      x: 100 + index*55, y: 260, hp: 3, alive: true, facing: "right",
      input: {up:false,down:false,left:false,right:false}, attackUntil: 0,
      lastAttack: 0, lastHit: 0
    };
    room.players[sock.id] = player;
    sock.join(room.code);
    sock.data.roomCode = room.code;
    if (Object.keys(room.players).length === 1) initStage(room);
    cb({ok:true, code:room.code, playerId:sock.id, playerNumber:index+1});
    io.to(room.code).emit("notice", `${player.name} joined (${index+1}/2).`);
    broadcast(room);
  }

  socket.on("input", data => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver) return;
    const keys = data || {};
    for (const k of ["up","down","left","right"]) p.input[k] = !!keys[k];
    if (keys.facing) p.facing = keys.facing;
  });

  socket.on("attack", () => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver) return;
    const now = Date.now();
    if (now - p.lastAttack < 430) return;
    p.lastAttack = now; p.attackUntil = now + 190;
    const vectors = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
    const [dx,dy] = vectors[p.facing] || [1,0];
    room.enemies.forEach(e => {
      if (!e.alive) return;
      const vx = e.x - p.x, vy = e.y - p.y;
      const along = vx*dx + vy*dy, side = Math.abs(vx*dy - vy*dx);
      if (along >= 0 && along < 78 && side < 42) {
        e.hp -= 1;
        if (e.hp <= 0) e.alive = false;
      }
    });
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    delete room.players[socket.id];
    io.to(code).emit("notice", "A player disconnected. The room is waiting for them to reconnect or for a new game.");
    if (Object.keys(room.players).length === 0) rooms.delete(code);
    else broadcast(room);
  });
});

function tick() {
  const now = Date.now(), dt = 0.05;
  for (const room of rooms.values()) {
    if (room.finished || room.gameOver || Object.keys(room.players).length < 1) continue;
    const alivePlayers = Object.values(room.players).filter(p => p.alive);
    if (alivePlayers.length === 0) {
      room.gameOver = true; broadcast(room); continue;
    }
    for (const p of alivePlayers) {
      const dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      const dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
      const mag = Math.hypot(dx,dy) || 1;
      p.x = Math.max(28, Math.min(ROOM_W-28, p.x + dx/mag*175*dt));
      p.y = Math.max(55, Math.min(ROOM_H-28, p.y + dy/mag*175*dt));
      if (Math.abs(dx)+Math.abs(dy)) p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right":"left") : (dy > 0 ? "down":"up");
    }
    for (const e of room.enemies.filter(e => e.alive)) {
      const target = alivePlayers.reduce((best,p) => Math.hypot(p.x-e.x,p.y-e.y) < Math.hypot(best.x-e.x,best.y-e.y) ? p : best, alivePlayers[0]);
      const dx = target.x-e.x, dy = target.y-e.y, d = Math.hypot(dx,dy) || 1;
      if (d > 29) { e.x += dx/d*e.speed*dt; e.y += dy/d*e.speed*dt; }
      if (d < 36 && now-e.attackAt > 900 && now-target.lastHit > 900) {
        target.hp = Math.max(0,target.hp-1); target.lastHit = now; e.attackAt = now;
        if (target.hp === 0) target.alive = false;
      }
    }
    if (Object.values(room.players).every(p => !p.alive)) room.gameOver = true;

    const enemiesLeft = room.enemies.some(e => e.alive);
    if (!enemiesLeft) {
      if (room.stage === 1 && !room.key) {
        // The key appears in Room 2 only after its enemies are defeated.
        room.keyAvailable = true;
      }
    }
    broadcast(room);
  }
}
setInterval(tick, 50);

// Progression is proximity-based and checked on the server.
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.finished || room.gameOver || Object.keys(room.players).length < 1) continue;
    // Players who are OUT never block progress; only living players count.
    const players = Object.values(room.players).filter(p => p.alive);
    if (players.length === 0) continue;
    const cleared = room.enemies.every(e => !e.alive);
    if (room.stage === 1 && room.keyAvailable && !room.key) {
      // Key pickup at the center of Room 2.
      if (players.some(p => Math.hypot(p.x-650,p.y-260) < 38)) {
        room.key = true; room.keyAvailable = false;
        io.to(room.code).emit("notice", "Dungeon key collected! Carry it to the exit in Room 3.");
      }
    }
    if (!cleared) continue;
    const nearExit = players.every(p => p.x > 700 && Math.abs(p.y-260) < 90);
    if (room.stage < 2 && nearExit) {
      if (room.stage === 1 && !room.key) continue;
      room.stage++;
      initStage(room);
      io.to(room.code).emit("notice", `Room ${room.stage+1}: ${roomLayouts[room.stage].name}`);
    } else if (room.stage === 2 && room.key && nearExit) {
      room.finished = true;
      io.to(room.code).emit("notice", "The team escaped the dungeon!");
    }
    broadcast(room);
  }
}, 100);

server.listen(PORT, () => console.log(`Dungeon Duo listening on ${PORT}`));
