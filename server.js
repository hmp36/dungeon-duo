const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public", { etag: true, maxAge: 0, setHeaders: (res, p) => { if (/\.(js|css|html)$/.test(p)) res.setHeader("Cache-Control", "no-cache"); } }));
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ leaderboard (best effort file) */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const BOARD_FILE = path.join(DATA_DIR, "leaderboard.json");
let board = [];
try { board = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8")); } catch (e) { board = []; }
function saveBoard() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(BOARD_FILE, JSON.stringify(board.slice(0, 500))); } catch (e) { /* ephemeral disk is fine */ } }
function topBoard(daily) {
  const today = dailyKey();
  return board.filter(b => daily ? b.daily === today : !b.daily).sort((a, b) => b.score - a.score).slice(0, 10)
    .map(b => ({ names: b.names, score: b.score, time: b.time, gold: b.gold }));
}
function dailyKey() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); }
app.get("/api/leaderboard", (req, res) => res.json({ daily: dailyKey(), top: topBoard(req.query.daily === "1") }));

/* anonymous run stats: counts only (no names, no codes) so we can see which rooms and monsters wipe teams */
const STATS_FILE = path.join(DATA_DIR, "stats.json");
let stats = { runsStarted: 0, wipes: {}, killers: {}, clears: 0, retries: 0 };
try { stats = Object.assign(stats, JSON.parse(fs.readFileSync(STATS_FILE, "utf8"))); } catch (e) { /* first run */ }
let statsDirty = false;
const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1; statsDirty = true; };
setInterval(() => { if (!statsDirty) return; statsDirty = false; try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATS_FILE, JSON.stringify(stats)); } catch (e) { /* ephemeral disk is fine */ } }, 30000).unref();
app.get("/api/stats", (req, res) => res.json(stats));

/* ------------------------------------------------------------------ constants */
const rooms = new Map();
const ROOM_W = 800, ROOM_H = 520;
const START_HP = 5, MAX_HP = 7;
const DIFFS = {                                // difficulty: start hearts, enemy health multiplier, score multiplier
  easy:   { start: 7, hp: 0.7,  score: 0.8,  label: "Easy" },
  normal: { start: 5, hp: 1,    score: 1,    label: "Normal" },
  hard:   { start: 4, hp: 1.35, score: 1.25, label: "Hard" }
};
const cleanDiff = d => (DIFFS[d] ? d : "normal");          // heroes start with 5; hearts can top you up to 7 (+ shop containers)
const REVIVE_TIME = 2.2;
const HIT_INVULN = 1100;
const DASH_MS = 170, DASH_COOLDOWN = 1100;
const NOTE_COOLDOWN = 4000, NOTE_STUN = 1100;
const SPECIAL_COOLDOWN = 12000;
const SHOP_ITEMS = {
  heal:  { cost: 40, max: 99 },
  hp:    { cost: 60, max: 2 },
  cd:    { cost: 60, max: 3 },
  speed: { cost: 50, max: 3 },
  dmg:   { cost: 120, max: 1 }
};
const SHOP_TIME = 45000;

const MOB = {
  slime:    { hp: 2,  speed: 34, range: 46,  windup: 520, cooldown: 1500, dmg: 1, stop: 34, gold: 3 },
  skeleton: { hp: 3,  speed: 46, range: 50,  windup: 480, cooldown: 1400, dmg: 1, stop: 36, gold: 5 },
  bat:      { hp: 1,  speed: 88, range: 40,  windup: 380, cooldown: 1700, dmg: 1, stop: 26, gold: 4 },
  brute:    { hp: 6,  speed: 30, range: 62,  windup: 650, cooldown: 1900, dmg: 2, stop: 46, gold: 12 },
  archer:   { hp: 2,  speed: 40, range: 0,   windup: 650, cooldown: 2300, dmg: 1, stop: 0,  gold: 6, ranged: true },
  hexer:    { hp: 3,  speed: 36, range: 0,   windup: 800, cooldown: 2800, dmg: 1, stop: 0,  gold: 8, ranged: true },     // casts a fan of slow orbs that bog heroes down
  bomber:   { hp: 2,  speed: 78, range: 62,  windup: 750, cooldown: 1000, dmg: 1, stop: 18, gold: 6 },     // runs in, lights its fuse, blows up (hurts monsters too)
  hotdog:   { hp: 3,  speed: 58, range: 215, windup: 520, cooldown: 1900, dmg: 1, stop: 120, gold: 7 },     // Hot Dog Person: squirts ketchup and mustard from mid range
  mimic:    { hp: 4,  speed: 78, range: 46,  windup: 300, cooldown: 1100, dmg: 1, stop: 28, gold: 15 },
  warden:   { hp: 20, speed: 34, range: 80, windup: 700, cooldown: 1700, dmg: 2, stop: 58, gold: 40 },   // mini-boss (drawn as a big gold brute)
  boss:     { hp: 56, speed: 36, range: 108, windup: 900, cooldown: 2300, dmg: 2, stop: 80, gold: 100 }
};
const defOf = e => (e.elite ? MOB.warden : MOB[e.kind]);
const roomLayouts = [
  { name: "Forgotten Entrance", mobs: ["slime", "slime", "slime"], hearts: [[330, 450]], chests: [[700, 100], [120, 470]] },
  { name: "The Crypt", mobs: ["skeleton", "skeleton", "bat", "bat"], keeper: 0, shield: [1], hearts: [[400, 450]], chests: [[100, 100], [700, 470], [400, 100]] },
  { name: "Archer Gallery", mobs: ["archer", "hexer", "skeleton", "bomber"], shield: [2], hearts: [[400, 440]], chests: [[90, 100], [710, 100], [90, 470], [710, 470]], mimics: 0.3 },
  { name: "Treasure Chamber", mobs: ["brute", "skeleton", "hexer", "hotdog", "bomber"], elite: 0, shield: [1], hearts: [[400, 440]], chests: [[60, 90], [140, 90], [660, 90], [740, 90], [60, 470], [740, 470]], mimics: 0.35 },
  { name: "Dragon of Debt", mobs: ["boss"], hearts: [[300, 460], [500, 460]], chests: [] }
];
const SPAWNS = [[90, 260], [145, 260]];
/* ---- story mode: Emberfall village (hub) and four regions that unlock in order ---- */
const HUB_LAYOUT = { name: "Emberfall Village", mobs: [], hearts: [], chests: [], theme: 5, track: 5 };
const HUB_SPAWNS = [[760, 940], [840, 940]];
const keepLayouts = roomLayouts.map((l, i) => Object.assign({}, l, { theme: i, track: i, tier: i }));
keepLayouts[4].name = "Dragon of Debt";
const REGIONS = {
  greenwood: { name: "Greenwood", gx: 240, req: [], layouts: [
    { name: "Mossy Path", mobs: ["slime", "slime", "slime", "bat"], hearts: [[330, 450]], chests: [[700, 100], [120, 470]], theme: 6, track: 0, tier: 0 },
    { name: "Hollow Oak", mobs: ["slime", "bat", "bat", "archer", "skeleton"], keeper: 4, hearts: [[400, 450]], chests: [[100, 100], [700, 470], [400, 100]], theme: 6, track: 0, tier: 1 },
    { name: "Thorn Warden's Grove", mobs: ["brute", "slime", "slime", "bat"], elite: 0, eliteName: "Thorn Warden", trait: "thorn", keeper: 1, hearts: [[400, 440]], chests: [[90, 100], [710, 100], [90, 470]], theme: 6, track: 0, tier: 1 }] },
  mire: { name: "Sunken Mire", gx: 560, req: ["greenwood"], layouts: [
    { name: "Bog Crossing", mobs: ["slime", "slime", "hexer", "bat"], hearts: [[330, 450]], chests: [[700, 100], [120, 470]], theme: 7, track: 1, tier: 1 },
    { name: "Mushroom Hollow", mobs: ["hexer", "bomber", "slime", "skeleton", "bat"], keeper: 3, shield: [3], hearts: [[400, 450]], chests: [[100, 100], [700, 470], [400, 100]], theme: 7, track: 1, tier: 1 },
    { name: "The Mire Mother's Pool", mobs: ["brute", "hexer", "hexer", "bomber"], elite: 0, eliteName: "Mire Mother", trait: "mire", keeper: 1, hearts: [[400, 440]], chests: [[90, 100], [710, 100], [90, 470]], theme: 7, track: 1, tier: 2 }] },
  coast: { name: "Shattered Coast", gx: 880, req: ["mire"], layouts: [
    { name: "Wreck Beach", mobs: ["skeleton", "skeleton", "archer", "bomber"], shield: [0], hearts: [[330, 450]], chests: [[700, 100], [120, 470]], theme: 8, track: 2, tier: 1 },
    { name: "Cliffside Battery", mobs: ["archer", "archer", "hexer", "skeleton", "bomber"], keeper: 3, shield: [3], hearts: [[400, 450]], chests: [[100, 100], [700, 470], [400, 100]], theme: 8, track: 2, tier: 2 },
    { name: "Tidebreaker's Cove", mobs: ["brute", "skeleton", "archer", "bomber", "hexer"], elite: 0, eliteName: "Tidebreaker", trait: "tide", keeper: 2, shield: [1], hearts: [[400, 440]], chests: [[60, 90], [740, 90], [60, 470], [740, 470]], theme: 8, track: 2, tier: 2 }] },
  frank: { name: "Frank's Fairground", gx: 1090, req: ["mire"], bonus: true, layouts: [
    { name: "The Midway", mobs: ["hotdog", "hotdog", "hotdog", "slime"], hearts: [[330, 450]], chests: [[700, 100], [120, 470]], theme: 9, track: 3, tier: 1 },
    { name: "Condiment Alley", mobs: ["hotdog", "hotdog", "bomber", "bat", "hotdog"], keeper: 4, hearts: [[400, 450]], chests: [[100, 100], [700, 470], [400, 100]], theme: 9, track: 3, tier: 2 },
    { name: "Big Frank's Stand", mobs: ["hotdog", "hotdog", "hotdog", "bomber"], elite: 0, eliteName: "Big Frank", trait: "noodle", keeper: 1, hearts: [[400, 440]], chests: [[90, 100], [710, 100], [90, 470], [710, 470]], theme: 9, track: 3, tier: 2 }] },
  keep: { name: "The Keep of Debt", gx: 1300, req: ["greenwood", "mire", "coast"], layouts: keepLayouts }
};
const REGION_IDS = Object.keys(REGIONS);
const QUESTS = { pests: { kind: "slime", n: 12, gold: 70 }, archers: { kind: "archer", n: 8, item: "beret" }, chests: { kind: "chest", n: 8, gold: 30, item: "charm" } };
const bumpQ = (room, kind) => { if (room.story) room.story.q[kind] = Math.min(999, (room.story.q[kind] || 0) + 1); };
const unlocked = (room, id) => REGIONS[id].req.every(r => room.story.done.has(r));
const LAY = room => (room.layouts || roomLayouts)[room.stage];
const lastOf = room => (room.layouts || roomLayouts).length - 1;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const HUB_W = 1600, HUB_H = 1040;
const wW = room => (room && room.scene === "hub" && room.story ? HUB_W : ROOM_W), wH = room => (room && room.scene === "hub" && room.story ? HUB_H : ROOM_H);
const clampX = (room, x) => clamp(x, 28, wW(room) - 28);
const clampY = (room, y) => clamp(y, 55, wH(room) - 28);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = room => room.rng ? room.rng() : Math.random();

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode() { let c = ""; for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; return c; }

/* ------------------------------------------------------------------ rooms */
const cleanQ = q => { const o = {}; if (q && typeof q === "object") for (const k of ["slime", "archer", "chest"]) o[k] = Math.max(0, Math.min(999, Math.floor(Number(q[k]) || 0))); return o; };
function makeRoom(code, daily, diff, story) {
  const seed = daily ? parseInt(dailyKey().replace(/-/g, ""), 10) : 0;
  return {
    code, players: {}, stage: 0, key: false, keyDrop: null, finished: false, gameOver: false,
    started: false, doorWas: false, enemies: [], pickups: [], chests: [], shots: [], gold: 0,
    shop: null, daily: daily ? dailyKey() : null, rng: daily ? mulberry(seed) : null,
    runStart: 0, runEnd: 0, result: null, lockedNoticed: false,
    story: story || null, scene: story ? "hub" : "dungeon", region: null, layouts: story ? [HUB_LAYOUT] : null, gate: null, lockMsgAt: 0,
    diff: "normal", paused: false, pausedAt: 0, pausedBy: "", rematch: new Set(), retry: new Set(), retries: 0, cpGold: 0
  };
}
let eid = 0;
function newEnemy(room, kind, x, y, extra = {}) {
  const base = extra.elite ? MOB.warden.hp : MOB[kind].hp;
  const hp = Math.max(1, Math.round(base * (room ? DIFFS[room.diff].hp : 1)));
  return Object.assign({
    id: `e${++eid}`, kind, x, y, hp, maxHp: hp, alive: true, keeper: false,
    activeAt: Date.now() + 500, windupUntil: 0, windupTarget: null, nextAttackAt: 0, retreatUntil: 0,
    stunUntil: 0, hitUntil: 0, phase: Math.random() * 6.28, castUntil: 0, nextSpecialAt: Date.now() + 4000, phaseN: 1
  }, extra);
}
function makeEnemies(stage, graceMs, room) {
  const layout = (room.layouts || roomLayouts)[stage], now = Date.now();
  if (layout.mobs[0] === "boss") return [newEnemy(room, "boss", 600, 240, { activeAt: now + graceMs + 800 })];
  return layout.mobs.map((kind, i) => newEnemy(room, kind, 430 + (i % 2) * 105, 115 + Math.floor(i / 2) * 155,
    { keeper: layout.keeper === i, elite: layout.elite === i, trait: layout.elite === i ? layout.trait : undefined, shield: !!(layout.shield && layout.shield.includes(i)), activeAt: now + graceMs }));
}
function initStage(room) {
  room.enemies = makeEnemies(room.stage, 1600, room);
  room.shots = [];
  const layout = LAY(room);
  room.pickups = layout.hearts.map(([x, y], i) => ({ id: `h${room.stage}-${i}`, x, y }));
  room.chests = layout.chests.map(([x, y], i) => ({ id: `c${room.stage}-${i}`, x, y, open: false, mimic: !!layout.mimics && rand(room) < layout.mimics }));
  room.keyDrop = null; room.doorWas = false; room.lockedNoticed = false;
  Object.values(room.players).forEach(p => {
    const s = (room.scene === "hub" ? HUB_SPAWNS : SPAWNS)[p.slot] || SPAWNS[0];
    p.x = s[0]; p.y = s[1]; p.attackUntil = 0; p.dashUntil = 0; p.noteUntil = 0;
    p.input = { up: false, down: false, left: false, right: false };
  });
}
function startRun(room, grace) {
  bump(stats, "runsStarted"); room.started = true; room.runStart = Date.now();
  room.enemies.forEach(e => { e.activeAt = Date.now() + grace; });
}
/* ---- equipment ---- */
const ITEMS = {
  cleaver: { name: "Rusty Cleaver",   slot: "weapon",  rarity: 0, st: { dmg: 1, crit: 5 } },
  storm:   { name: "Stormcaller",     slot: "weapon",  rarity: 2, st: { dmg: 1, reach: 20, crit: 10 } },
  helm:    { name: "Iron Helm",       slot: "head",    rarity: 1, st: { hp: 2 } },
  beret:   { name: "Bard's Beret",    slot: "head",    rarity: 1, st: { speed: 0.04, cd: 0.08 } },
  ember:   { name: "Ember Ring",      slot: "trinket", rarity: 1, st: { dmg: 1, crit: 5 } },
  clover:  { name: "Four-Leaf Clover", slot: "trinket", rarity: 2, st: { crit: 20, speed: 0.05 } },
  oak:     { name: "Oak Grip",        slot: "weapon",  rarity: 0, st: { dmg: 1 } },
  edge:    { name: "Steel Edge",      slot: "weapon",  rarity: 1, st: { dmg: 1, reach: 14 } },
  tooth:   { name: "Dragon Tooth",    slot: "weapon",  rarity: 2, st: { dmg: 2, crit: 15 } },
  cap:     { name: "Leather Cap",     slot: "head",    rarity: 0, st: { hp: 1 } },
  plume:   { name: "Plumed Hat",      slot: "head",    rarity: 1, st: { speed: 0.06, hp: 1 } },
  crown:   { name: "Crown of Echoes", slot: "head",    rarity: 2, st: { cd: 0.15, stun: 400 } },
  coin:    { name: "Lucky Coin",      slot: "trinket", rarity: 0, st: { crit: 10 } },
  charm:   { name: "Swift Charm",     slot: "trinket", rarity: 1, st: { speed: 0.1 } },
  metro:   { name: "Metronome",       slot: "trinket", rarity: 1, st: { cd: 0.12, stun: 200 } },
  locket:  { name: "Heart Locket",    slot: "trinket", rarity: 2, st: { hp: 2, dmg: 1 } }
};
const ITEM_IDS = Object.keys(ITEMS);
function gearStats(p) {
  const t = { dmg: 0, speed: 0, cd: 0, hp: 0, stun: 0, reach: 0, crit: 0 };
  for (const slot of ["weapon", "head", "trinket"]) { const it = ITEMS[p.equip && p.equip[slot]]; if (it) for (const k in it.st) t[k] += it.st[k]; }
  return t;
}
function rollItem(room, minRarity = 0) {
  const tier = LAY(room).tier !== undefined ? LAY(room).tier : room.stage;
  const w = tier >= 3 ? [2, 4, 4] : tier >= 1 ? [5, 4, 1] : [7, 3, 0.4];
  let pool = ITEM_IDS.filter(id => ITEMS[id].rarity >= minRarity);
  const weights = pool.map(id => w[ITEMS[id].rarity]); const tot = weights.reduce((a, b) => a + b, 0);
  let r = rand(room) * tot; for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
function giveItem(room, p, id, at) {
  if (!p || !ITEMS[id]) return;
  p.inv.push(id);
  if (!p.equip[ITEMS[id].slot]) { p.inv.splice(p.inv.indexOf(id), 1); p.equip[ITEMS[id].slot] = id; }
  fx(room, "loot", { x: at ? at.x : p.x, y: at ? at.y : p.y, name: ITEMS[id].name, rarity: ITEMS[id].rarity, pid: p.id });
}
const cap = p => MAX_HP + (p.up.hp || 0) + gearStats(p).hp;
const cdm = p => Math.max(0.35, 1 - 0.2 * (p.up.cd || 0) - gearStats(p).cd);
function newStats() { return { kills: 0, chests: 0, revives: 0, downs: 0, hearts: 0 }; }

function publicState(room) {
  const now = Date.now();
  const cleared = room.enemies.every(e => !e.alive);
  const alive = e => e.alive;
  return {
    code: room.code, stage: room.stage, key: room.key, finished: room.finished, gameOver: room.gameOver,
    waiting: !room.started, daily: room.daily, diff: room.diff, paused: room.paused, pausedBy: room.pausedBy,
    retry: [...room.retry].filter(id => room.players[id] && !room.players[id].isBot).length, canRetry: room.gameOver && !room.finished && (room.stage > 0 || !!room.story) && room.scene !== "hub", rematch: [...room.rematch].filter(id => room.players[id] && !room.players[id].isBot).length, needRematch: humansOf(room).length, lastStage: lastOf(room), stageTotal: lastOf(room) + 1, roomName: LAY(room).name,
    scene: room.scene, ww: wW(room), wh: wH(room), region: room.region, theme: LAY(room).theme !== undefined ? LAY(room).theme : room.stage, track: LAY(room).track !== undefined ? LAY(room).track : room.stage,
    story: room.story ? { done: [...room.story.done], q: room.story.q, claimed: [...room.story.claimed] } : null, gate: room.gate, eliteName: LAY(room).eliteName || null,
    keyDrop: room.keyDrop,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, slot: p.slot, cls: p.cls, x: p.x, y: p.y, hp: p.hp, cap: cap(p), alive: p.alive,
      slowed: now < (p.slowUntil || 0), facing: p.facing, attacking: now < p.attackUntil, dashing: now < p.dashUntil,
      noteCd: Math.max(0, Math.min(1, (p.lastNote + NOTE_COOLDOWN * cdm(p) - now) / (NOTE_COOLDOWN * cdm(p)))),
      specialCd: Math.max(0, Math.min(1, (p.lastSpecial + SPECIAL_COOLDOWN * cdm(p) - now) / (SPECIAL_COOLDOWN * cdm(p)))),
      playing: now < (p.noteUntil || 0), guard: now < (p.guardUntil || 0), up: p.up, inv: p.inv, equip: p.equip, atkKind: p.atkKind, st: gearStats(p),
      hurt: now - p.lastHit < 450, invuln: now - p.lastHit < HIT_INVULN,
      revive: p.alive ? 0 : Math.min(1, p.reviveT / REVIVE_TIME), bot: !!p.isBot
    })),
    enemies: room.enemies.filter(alive).map(e => ({
      id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, alive: true,
      keeper: e.keeper && !room.key && !room.keyDrop, hurt: now < e.hitUntil, stunned: now < e.stunUntil,
      winding: e.windupUntil > now || e.castUntil > now, dormant: now < e.activeAt || !room.started,
      phase: e.phaseN, elite: !!e.elite, tr: e.trait || null, shield: !!e.shield
    })),
    shots: room.shots.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), a: Math.atan2(s.vy, s.vx), k: s.kind })),
    pickups: room.pickups, chests: room.chests.map(c => ({ id: c.id, x: c.x, y: c.y, open: c.open })), gold: room.gold,
    enemyCount: room.enemies.filter(alive).length,
    doorOpen: room.scene !== "hub" && cleared && (room.stage === 0 || room.key),
    shop: room.shop ? { ready: [...room.shop.ready], left: Math.max(0, Math.ceil((room.shop.until - now) / 1000)) } : null,
    result: room.result
  };
}
function broadcast(room) { io.to(room.code).emit("state", publicState(room)); }
function fx(room, type, data = {}) { io.to(room.code).emit("fx", { type, ...data }); }
function notice(room, msg) { io.to(room.code).emit("notice", msg); }

function shiftTimers(room, d) {
  if (d <= 0) return;
  ["activeAt", "windupUntil", "nextAttackAt", "retreatUntil", "stunUntil", "hitUntil", "castUntil", "nextSpecialAt", "traitAt", "traitFire"].forEach(k => room.enemies.forEach(e => { if (e[k]) e[k] += d; }));
  ["attackUntil", "dashUntil", "lastHit", "lastNote", "lastSpecial", "lastDash", "noteUntil", "guardUntil", "nextAttackAt", "comboAt"].forEach(k => Object.values(room.players).forEach(p => { if (p[k]) p[k] += d; }));
  if (room.runStart) room.runStart += d;
}
function resetRoom(room) {
  if (room.story) return toHub(room);
  room.stage = 0; room.gold = 0; room.key = false; room.keyDrop = null; room.finished = false; room.gameOver = false;
  room.shop = null; room.result = null; room.runStart = Date.now(); room.runEnd = 0; room.paused = false; room.rematch.clear(); room.retry.clear(); room.retries = 0; room.cpGold = 0;
  if (room.daily) room.rng = mulberry(parseInt(room.daily.replace(/-/g, ""), 10));
  Object.values(room.players).forEach(p => {
    p.hp = DIFFS[room.diff].start; p.alive = true; p.reviveT = 0; p.lastHit = 0; p.up = {}; p.stats = newStats(); p.inv = []; p.equip = { weapon: null, head: null, trinket: null };
  });
  initStage(room);
}

/* ---- story mode: hub, regions, ending ---- */
function toHub(room, clearedId) {
  room.scene = "hub"; room.region = null; room.layouts = [HUB_LAYOUT]; room.stage = 0; room.key = false; room.keyDrop = null; room.shop = null;
  room.finished = false; room.gameOver = false; room.result = null; room.paused = false; room.rematch.clear(); room.retry.clear(); room.gate = null;
  Object.values(room.players).forEach(p => { p.hp = cap(p); p.alive = true; p.reviveT = 0; p.lastHit = 0; p.gateT = 0; });
  initStage(room);
  if (clearedId) fx(room, "regionclear", { id: clearedId });
  fx(room, "stage", { stage: 0 });
  notice(room, clearedId ? `${REGIONS[clearedId].name} cleared! Back in Emberfall. Hearts restored.` : "Back in Emberfall. Hearts restored. Walk into a gate to travel.");
}
function enterRegion(room, id) {
  room.scene = "dungeon"; room.region = id; room.layouts = REGIONS[id].layouts; room.stage = 0; room.key = false; room.keyDrop = null; room.gate = null;
  Object.values(room.players).forEach(p => { p.gateT = 0; });
  initStage(room); room.cpGold = room.gold; room.regionStart = Date.now(); room.enemies.forEach(e => { e.activeAt = Date.now() + 1800; });
  bump(stats, "storyTrips");
  fx(room, "stage", { stage: 0 });
  notice(room, `${REGIONS[id].name}: ${LAY(room).name}`);
}
function finishStory(room) {
  room.finished = true; room.runEnd = Date.now(); bump(stats, "storyClears");
  const ps = Object.values(room.players), time = Math.round((room.runEnd - (room.regionStart || room.runEnd)) / 1000);
  room.result = { story: true, time, score: 0, gold: room.gold, kills: ps.reduce((a, p) => a + p.stats.kills, 0), downs: ps.reduce((a, p) => a + p.stats.downs, 0),
    diff: DIFFS[room.diff].label, retries: room.retries, players: ps.map(p => ({ name: p.name, cls: p.cls, ...p.stats })), top: [] };
  fx(room, "win"); notice(room, "The Dragon of Debt is no more. Emberfall is free!");
}
function hubTick(room, all, alive, now, dt) {
  // every living hero must stand in the same gate for a moment to travel
  let gid = null;
  for (const id of REGION_IDS) { const g = REGIONS[id]; if (alive.every(p => Math.abs(p.x - g.gx) < 56 && p.y < 112)) { gid = id; break; } }
  alive.forEach(p => { p.gateT = gid ? (p.gateT || 0) + dt : 0; });
  if (!gid) { room.gate = null; return; }
  const t = Math.min(...alive.map(p => p.gateT || 0));
  if (!unlocked(room, gid)) {
    room.gate = { id: gid, p: 0, locked: true };
    if (now - room.lockMsgAt > 3500) { room.lockMsgAt = now; const need = REGIONS[gid].req.filter(r => !room.story.done.has(r)).map(r => REGIONS[r].name); notice(room, `${REGIONS[gid].name} is sealed. Clear ${need.join(" and ")} first.`); }
    return;
  }
  room.gate = { id: gid, p: Math.min(1, t / 1.1), locked: false };
  if (t >= 1.1) enterRegion(room, gid);
}

// Retry from the start of the current room: hearts refilled, gold back to what it was on entry, gear kept. Retried runs are not ranked.
function retryRoom(room) {
  bump(stats, "retries");
  room.gameOver = false; room.key = false; room.keyDrop = null; room.shop = null; room.gold = room.cpGold; room.retries++; room.retry.clear(); room.rematch.clear();
  Object.values(room.players).forEach(p => { p.hp = DIFFS[room.diff].start; p.alive = true; p.reviveT = 0; p.lastHit = 0; });
  initStage(room); room.enemies.forEach(e => { e.activeAt = Date.now() + 1800; });
}

function finishRun(room) {
  room.finished = true; room.runEnd = Date.now(); bump(stats, "clears");
  const time = Math.round((room.runEnd - room.runStart) / 1000);
  const ps = Object.values(room.players);
  const kills = ps.reduce((a, p) => a + p.stats.kills, 0), downs = ps.reduce((a, p) => a + p.stats.downs, 0);
  const score = Math.round(Math.max(0, 3000 + Math.max(0, 3000 - time * 4) + room.gold * 10 + kills * 25 - downs * 150) * DIFFS[room.diff].score);
  const names = ps.map(p => p.name).join(" & ");
  if (!room.retries) { board.push({ names, score, time, gold: room.gold, daily: room.daily, diff: room.diff, ts: Date.now() }); saveBoard(); }
  room.result = {
    time, score, gold: room.gold, kills, downs, daily: room.daily, diff: DIFFS[room.diff].label, retries: room.retries,
    players: ps.map(p => ({ name: p.name, cls: p.cls, ...p.stats })),
    top: topBoard(!!room.daily)
  };
  fx(room, "win");
  notice(room, "The team escaped the dungeon!");
}

function newPlayer(room, id, name, cls, slot) {
  return {
    id, name: String(name).slice(0, 18), slot, cls: cls === "knight" ? "knight" : "bard",
    x: 100 + slot * 55, y: 260, hp: DIFFS[room.diff].start, alive: true, facing: "right",
    input: { up: false, down: false, left: false, right: false }, attackUntil: 0,
    lastAttack: 0, lastNote: 0, lastSpecial: 0, lastHit: 0, lastDash: 0, dashUntil: 0, dashDir: [1, 0], reviveT: 0,
    noteUntil: 0, guardUntil: 0, up: {}, stats: newStats(), inv: [], equip: { weapon: null, head: null, trinket: null }, combo: 0, comboAt: 0, nextAttackAt: 0, atkKind: 0
  };
}
/* ------------------------------------------------------------------ sockets */
io.on("connection", socket => {
  const cleanCls = c => (c === "knight" ? "knight" : "bard");
  socket.on("createRoom", ({ name, cls, daily, diff, story, world } = {}, cb = () => {}) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const wantStory = !!story && !daily;
    const room = makeRoom(code, !!daily, null, wantStory ? { done: new Set((Array.isArray(world && world.done) ? world.done : []).filter(id => REGIONS[id] && id !== "keep")), q: cleanQ(world && world.q), claimed: new Set((Array.isArray(world && world.claimed) ? world.claimed : []).filter(id => QUESTS[id])) } : null);
    room.diff = cleanDiff(diff);
    rooms.set(code, room);
    joinRoom(socket, room, name, cls, cb);
  });

  socket.on("joinRoom", ({ code, name, cls } = {}, cb = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: "Room not found. Check the code or create a new room." });
    if (humansOf(room).length >= 2) return cb({ ok: false, error: "That room already has two players." });
    if (room.finished || room.gameOver) resetRoom(room);
    joinRoom(socket, room, name, cls, cb);
  });

  function joinRoom(sock, room, name, cls, cb) {
    if (humansOf(room).length >= 2) return cb({ ok: false, error: "That room is full." });
    removeBots(room);                                   // a real friend takes the CPU partner's seat
    const used = Object.values(room.players).map(p => p.slot);
    const slot = used.includes(0) ? 1 : 0;
    const index = Object.keys(room.players).length;
    const player = newPlayer(room, sock.id, name || `Player ${index + 1}`, cls, slot);
    room.players[sock.id] = player;
    sock.join(room.code);
    sock.data.roomCode = room.code;
    if (Object.keys(room.players).length === 1) initStage(room);
    else if (!room.started) startRun(room, 2200);
    cb({ ok: true, code: room.code, playerId: sock.id, playerNumber: index + 1, daily: room.daily });
    notice(room, `${player.name} joined (${index + 1}/2).`);
    broadcast(room);
  }

  socket.on("startSolo", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.started) return;
    startRun(room, 2200);
    const bot = addBot(room);
    notice(room, bot ? `${bot.name} is fighting at your side. If a friend joins, they take over the seat.` : "Solo run started. Good luck!");
    broadcast(room);
  });

  const ctx = () => {
    const room = rooms.get(socket.data.roomCode); const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver || room.shop || room.paused) return null;
    return { room, p, now: Date.now() };
  };

  socket.on("input", data => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.finished || room.gameOver || room.paused) return;
    const keys = data || {};
    for (const k of ["up", "down", "left", "right"]) p.input[k] = !!keys[k];
    if (keys.facing && DIRS[keys.facing]) p.facing = keys.facing;
  });

  // Primary attack: guitar smash (bard) or wide sword slash (knight).
  socket.on("attack", () => { const c = ctx(); if (c) doAttack(c.room, c.p, c.now); });

  // Secondary: bard riff (stun cone) or knight shield bash (short stun + knockback).
  socket.on("note", () => { const c = ctx(); if (c) doNote(c.room, c.p, c.now); });

  // Special: bard healing song (heals nearby heroes) or knight guard (brief immunity).
  socket.on("special", () => { const c = ctx(); if (c) doSpecial(c.room, c.p, c.now); });

  socket.on("dash", () => { const c = ctx(); if (c) doDash(c.room, c.p, c.now); });

  socket.on("equip", id => {
    const room = rooms.get(socket.data.roomCode); const p = room?.players[socket.id]; const it = ITEMS[id];
    if (!room || !p || !it || !p.inv.includes(id)) return;
    p.inv.splice(p.inv.indexOf(id), 1);
    const old = p.equip[it.slot]; if (old) p.inv.push(old);
    p.equip[it.slot] = id; p.hp = Math.min(p.hp, cap(p));
    fx(room, "equipped", { id: p.id }); broadcast(room);
  });
  socket.on("unequip", slot => {
    const room = rooms.get(socket.data.roomCode); const p = room?.players[socket.id];
    if (!room || !p || !p.equip || !p.equip[slot]) return;
    p.inv.push(p.equip[slot]); p.equip[slot] = null; p.hp = Math.min(p.hp, cap(p));
    broadcast(room);
  });

  socket.on("claim", id => {
    const room = rooms.get(socket.data.roomCode); const p = room?.players[socket.id]; const q = QUESTS[id];
    if (!room || !p || !room.story || room.scene !== "hub" || !q || room.story.claimed.has(id) || (room.story.q[q.kind] || 0) < q.n) return;
    room.story.claimed.add(id); if (q.gold) room.gold += q.gold; if (q.item) giveItem(room, p, q.item);
    bump(stats, "questsDone"); notice(room, `Quest complete!${q.gold ? ` +${q.gold} gold.` : ""}${q.item ? ` ${ITEMS[q.item].name} for ${p.name}.` : ""}`); broadcast(room);
  });
  // Shop between rooms.
  socket.on("buy", item => {
    const room = rooms.get(socket.data.roomCode); const p = room?.players[socket.id];
    const def = SHOP_ITEMS[item];
    if (!room || !p || !(room.shop || room.scene === "hub") || !def) return;
    if (item !== "heal" && (p.up[item] || 0) >= def.max) return;
    if (room.gold < def.cost) return;
    room.gold -= def.cost;
    if (item === "heal") Object.values(room.players).forEach(t => { t.hp = cap(t); t.alive = true; });
    else { p.up[item] = (p.up[item] || 0) + 1; if (item === "hp") p.hp = Math.min(cap(p), p.hp + 1); }
    fx(room, "buy", { id: p.id });
    broadcast(room);
  });
  // Pause: either hero can freeze the run for both. Timers are shifted on resume so nothing "catches up".
  socket.on("pause", () => {
    const room = rooms.get(socket.data.roomCode); const me = room?.players[socket.id];
    if (!room || !me || !room.started || room.finished || room.gameOver || room.shop) return;
    const now = Date.now();
    if (!room.paused) { room.paused = true; room.pausedAt = now; room.pausedBy = me.name; Object.values(room.players).forEach(p => { p.input = { up: false, down: false, left: false, right: false }; }); notice(room, `${me.name} paused the game.`); }
    else { shiftTimers(room, now - room.pausedAt); room.paused = false; room.pausedBy = ""; notice(room, "Back in the fight!"); }
    broadcast(room);
  });
  // Rematch: when every hero in the room asks, restart the run with the same team and difficulty.
  socket.on("retry", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.players[socket.id] || !room.gameOver || room.finished || (room.stage < 1 && !room.story)) return;
    room.retry.add(socket.id); botsAgree(room, room.retry);
    if (Object.keys(room.players).every(id => room.retry.has(id))) { retryRoom(room); fx(room, "stage", { stage: room.stage }); notice(room, "Retrying this room. This run will no longer be ranked."); }
    else notice(room, "Waiting for your teammate to press RETRY ROOM.");
    broadcast(room);
  });
  // Quick team signals on keys 1-4: help, over here, nice, watch out.
  socket.on("emote", k => {
    const c = ctx(); if (!c) return; const { room, p, now } = c;
    k = Number(k) | 0; if (k < 0 || k > 3 || now - (p.lastEmote || 0) < 900) return; p.lastEmote = now;
    fx(room, "emote", { id: p.id, k, x: p.x, y: p.y });
  });
  socket.on("rematch", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.players[socket.id] || !(room.finished || room.gameOver)) return;
    room.rematch.add(socket.id); botsAgree(room, room.rematch);
    if (room.story && Object.keys(room.players).every(id => room.rematch.has(id))) { toHub(room); return broadcast(room); }
    if (Object.keys(room.players).every(id => room.rematch.has(id))) {
      resetRoom(room); startRun(room, 2200);
      fx(room, "stage", { stage: 0 });
      notice(room, "New run! Good luck.");
    } else notice(room, "Waiting for your teammate to press PLAY AGAIN.");
    broadcast(room);
  });
  socket.on("ready", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.shop || !room.players[socket.id]) return;
    room.shop.ready.add(socket.id);
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    delete room.players[socket.id];
    if (room.shop) room.shop.ready.delete(socket.id);
    if (humansOf(room).length === 0) { removeBots(room); }
    notice(room, "A player disconnected. The room is waiting for them to reconnect or for a new game.");
    if (Object.keys(room.players).length === 0) rooms.delete(code);
    else broadcast(room);
  });
});

/* ------------------------------------------------------------------ game logic */
// Hero actions live here (not inside the socket closure) so the CPU partner can use exactly the same code as a human.
function doAttack(room, p, now) {
    const knight = p.cls === "knight", gs = gearStats(p);
    if (now < p.nextAttackAt) return;
    // 4-hit chain: slash, backslash, whirlwind spin, overhead ground pound (kinds 0,1,4,2). A dash-attack is a lunge thrust (kind 3).
    const chain = now - p.comboAt < 900 ? (p.combo + 1) % 4 : 0;
    p.combo = chain; p.comboAt = now;
    const lunge = now - p.lastDash < 380;
    const spin = chain === 2 && !lunge, pound = chain === 3 && !lunge, finisher = pound;
    p.nextAttackAt = now + (pound ? 700 : spin ? 430 : knight ? 400 : 360);
    p.attackUntil = now + (pound ? 420 : spin ? 340 : 260); p.atkKind = lunge ? 3 : pound ? 2 : spin ? 4 : chain;
    fx(room, "swing", { id: p.id, kind: p.atkKind, cls: p.cls });
    const [dx, dy] = DIRS[p.facing] || [1, 0];
    const crit = rand(room) * 100 < gs.crit;
    const reach = (knight ? 116 : 96) + gs.reach + (pound ? 26 : 0) + (lunge ? 34 : 0), width = (knight ? 64 : 48) + (pound ? 18 : 0);
    const dmg = Math.max(1, 2 + (p.up.dmg || 0) + gs.dmg + (pound ? 2 : 0) + (lunge ? 1 : 0) + (crit ? 2 : 0) - (p.isBot ? 1 : 0));
    const kb = pound ? 70 : 40;
    if (p.cls) { /* movement burst on swing */ const step = lunge ? 0 : spin ? 0 : pound ? 6 : 14; p.x = clampX(room, p.x + dx * step); p.y = clampY(room, p.y + dy * step); }
    const hitSet = new Set();
    const strike = (e, dm, stunMs, kx, ky) => {
      const big = e.kind === "boss" ? 1 : 0; hitSet.add(e.id);
      if (e.shield && !spin && !pound && now >= e.stunUntil) {            // steel shields turn plain slashes: spin, pound or a stun breaks the guard
        e.hp -= 1; e.hitUntil = now + 120; e.x = clampX(room, e.x + dx * 8); e.y = clampY(room, e.y + dy * 8);
        fx(room, "blocked", { x: e.x, y: e.y }); if (e.hp <= 0) killEnemy(room, e, p); return;
      }
      e.hp -= dm; e.hitUntil = now + 200; if (!big) e.windupUntil = 0;
      if (!big) { e.stunUntil = Math.max(e.stunUntil, now + stunMs); e.x = clampX(room, e.x + kx); e.y = clampY(room, e.y + ky); }
      if (e.hp <= 0) killEnemy(room, e, p); else fx(room, "hit", { x: e.x, y: e.y, crit, big: pound });
    };
    room.enemies.forEach(e => {
      if (!e.alive) return;
      const big = e.kind === "boss" ? 1 : 0, vx = e.x - p.x, vy = e.y - p.y;
      if (spin) {                                              // whirlwind: hits everything around the hero
        const dist = Math.hypot(vx, vy) || 1;
        if (dist < 90 + gs.reach * 0.5 + big * 44) strike(e, dmg, 340, (vx / dist) * 46, (vy / dist) * 46);
        return;
      }
      const along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      if (along >= -8 && along < reach + big * 40 && side < width + big * 34) strike(e, dmg, pound ? 520 : 300, dx * kb, dy * kb);
    });
    if (pound) {                                               // ground shockwave where the weapon lands
      const ix = clampX(room, p.x + dx * 78), iy = clampY(room, p.y + dy * 78), R = 108;
      fx(room, "pound", { x: ix, y: iy, cls: p.cls });
      room.enemies.forEach(e => {
        if (!e.alive || hitSet.has(e.id)) return;
        const vx = e.x - ix, vy = e.y - iy, dist = Math.hypot(vx, vy) || 1;
        if (dist < R + (e.kind === "boss" ? 40 : 0)) strike(e, 1 + (p.up.dmg || 0) + (gs.dmg > 0 ? 1 : 0), 750, (vx / dist) * 34, (vy / dist) * 34);
      });
    }
    room.chests.forEach(ch => {
      if (ch.open) return;
      const vx = ch.x - p.x, vy = ch.y - p.y, along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      if (along >= -20 && along < 100 && side < 50) openChest(room, ch, p);
    });
    broadcast(room);
}

function doNote(room, p, now) {
    const cd = NOTE_COOLDOWN * cdm(p) * (p.cls === "knight" ? 0.85 : 1);
    if (now - p.lastNote < cd) return;
    p.lastNote = now; p.noteUntil = now + 600;
    const [dx, dy] = DIRS[p.facing] || [1, 0];
    const knight = p.cls === "knight";
    fx(room, knight ? "bash" : "notes", { id: p.id, x: p.x, y: p.y, facing: p.facing });
    room.enemies.forEach(e => {
      if (!e.alive) return;
      const vx = e.x - p.x, vy = e.y - p.y, along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      const inCone = knight ? (along > -20 && along < 96 && side < 56) : (along > -20 && along < 230 && side < 40 + Math.max(0, along) * 0.45);
      if (!inCone) return;
      const boss = e.kind === "boss";
      e.stunUntil = now + (boss ? 450 : (knight ? 1400 : NOTE_STUN) + gearStats(p).stun); e.windupUntil = boss ? e.windupUntil : 0; e.castUntil = boss ? e.castUntil : 0; e.hitUntil = now + 120;
      if (knight) {
        e.hp -= 1; if (!boss) { e.x = clampX(room, e.x + dx * 70); e.y = clampY(room, e.y + dy * 70); }
        if (e.hp <= 0) killEnemy(room, e, p);
      }
      fx(room, "stun", { x: e.x, y: e.y });
    });
    broadcast(room);
}

function doSpecial(room, p, now) {
    if (now - p.lastSpecial < SPECIAL_COOLDOWN * cdm(p)) return;
    p.lastSpecial = now;
    if (p.cls === "knight") {
      p.guardUntil = now + 2000;
      fx(room, "guard", { id: p.id, x: p.x, y: p.y });
    } else {
      fx(room, "song", { id: p.id, x: p.x, y: p.y });
      Object.values(room.players).forEach(t => {
        if (t.alive && Math.hypot(t.x - p.x, t.y - p.y) < 190 && t.hp < cap(t)) { t.hp++; p.stats.hearts++; fx(room, "heal", { x: t.x, y: t.y - 10 }); }
      });
    }
    broadcast(room);
}

function doDash(room, p, now) {
    if (now - p.lastDash < DASH_COOLDOWN * cdm(p)) return;
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    if (!dx && !dy) [dx, dy] = DIRS[p.facing] || [1, 0];
    p.dashDir = [dx, dy]; p.lastDash = now; p.dashUntil = now + DASH_MS;
    fx(room, "dash", { id: p.id, x: p.x, y: p.y });
}

function openChest(room, c, p) {
  c.open = true;
  if (p) p.stats.chests++;
  if (c.mimic) {
    room.enemies.push(newEnemy(room, "mimic", c.x, clamp(c.y + 10, 80, ROOM_H - 50), { activeAt: Date.now() + 350 }));
    fx(room, "mimic", { x: c.x, y: c.y });
    notice(room, "It was a MIMIC!");
    return;
  }
  bumpQ(room, "chest");
  const roll = rand(room);
  if (roll < 0.3 && p) { const id = rollItem(room); giveItem(room, p, id, c); fx(room, "chest", { x: c.x, y: c.y, loot: "item" }); return; }
  const heart = roll < 0.6 && room.pickups.length < 4;
  if (heart) room.pickups.push({ id: `c${crypto.randomBytes(3).toString("hex")}`, x: c.x, y: clamp(c.y + 38, 80, ROOM_H - 50) });
  else room.gold += 25;
  fx(room, "chest", { x: c.x, y: c.y, loot: heart ? "heart" : "gold" });
}

function killEnemy(room, e, p) {
  e.alive = false; if (p && !e.elite) bumpQ(room, e.kind);
  if (p) p.stats.kills++;
  room.gold += defOf(e).gold;
  fx(room, "kill", { x: e.x, y: e.y, kind: e.kind });
  if (e.kind === "mimic" && p) giveItem(room, p, rollItem(room, 1), e);
  if (e.elite) { Object.values(room.players).forEach(pl => giveItem(room, pl, rollItem(room, 1), e)); shake(room); notice(room, `The ${LAY(room).eliteName || "Iron Warden"} falls! Gear for everyone.`); }
  if (e.kind === "boss") { Object.values(room.players).forEach(pl => giveItem(room, pl, rollItem(room, 2), e)); shake(room); room.shots = []; room.enemies.forEach(m => { if (m.alive) { m.alive = false; fx(room, "kill", { x: m.x, y: m.y, kind: m.kind }); } }); notice(room, "The Dragon of Debt is defeated! Reach the exit!"); return; }
  if (e.keeper && !room.key) {
    room.keyDrop = { x: clamp(e.x, 60, ROOM_W - 90), y: clamp(e.y, 80, ROOM_H - 60) };
    fx(room, "keydrop", room.keyDrop);
    notice(room, "The Keeper dropped the dungeon key! Grab it.");
  } else if (rand(room) < 0.6 && room.pickups.length < 3) {
    room.pickups.push({ id: `d${crypto.randomBytes(3).toString("hex")}`, x: clamp(e.x, 50, ROOM_W - 50), y: clamp(e.y, 80, ROOM_H - 50) });
  }
}
function shake(room) { fx(room, "bigshake"); }

function hurtPlayer(room, p, dmg, from, now) {
  if (now < (p.guardUntil || 0)) { fx(room, "blocked", { x: p.x, y: p.y }); return; }
  p.hp = Math.max(0, p.hp - dmg); p.lastHit = now; room.lastHitBy = from.elite ? "warden" : from.kind || "unknown";
  const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1;
  p.x = clampX(room, p.x + dx / d * 46); p.y = clampY(room, p.y + dy / d * 46);
  fx(room, "hurt", { id: p.id, x: p.x, y: p.y, dmg });
  if (p.hp === 0) {
    p.alive = false; p.reviveT = 0; p.stats.downs++;
    p.input = { up: false, down: false, left: false, right: false };
    fx(room, "down", { x: p.x, y: p.y });
    notice(room, `${p.name} is down! Stand next to them for ${REVIVE_TIME.toFixed(0)} seconds to revive.`);
  }
}

function fireShot(room, x, y, ang, speed = 230, dmg = 1, kind = "arrow") {
  room.shots.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 3200, dmg, kind });
}

function fireTrait(room, e, target) {
  if (e.trait === "thorn") { const b = Math.atan2(target.y - e.y, target.x - e.x); for (let i = -3; i <= 3; i++) fireShot(room, e.x, e.y, b + i * 0.2, 190, 1, "arrow"); }
  else if (e.trait === "mire") { if (room.enemies.filter(m => m.alive).length < 8) { room.enemies.push(newEnemy(room, "slime", clampX(room, e.x - 46), clampY(room, e.y + 30)), newEnemy(room, "slime", clampX(room, e.x - 46), clampY(room, e.y - 30))); notice(room, "The Mire Mother births slimes!"); } }
  else if (e.trait === "noodle") { const b = Math.atan2(target.y - e.y, target.x - e.x); for (let i = 0; i < 10; i++) fireShot(room, e.x, e.y, b + i * Math.PI / 5, 150, 1, i % 2 ? "ketchup" : "mustard"); e.noodleN = (e.noodleN || 0) + 1; if (e.noodleN % 2 === 0 && room.enemies.filter(m => m.alive).length < 8) { room.enemies.push(newEnemy(room, "hotdog", clampX(room, e.x - 50), clampY(room, e.y + 36))); notice(room, "Big Frank calls for backup!"); } }
  else if (e.trait === "tide") { for (let i = 0; i < 12; i++) fireShot(room, e.x, e.y, i * Math.PI / 6 + 0.1, 135, 1, "hex"); }
  fx(room, "bossfire", { x: e.x, y: e.y });
}

/* ------------------------------------------------------------------ CPU partner
   One-player runs get a computer hero on your side, so the game is always played with two characters.
   It plays the opposite class and uses the very same attack, riff, special and dash code as a human. */
const BOT_NAMES = { bard: "Wren (CPU)", knight: "Brin (CPU)" };
const humansOf = room => Object.values(room.players).filter(p => !p.isBot);
function addBot(room) {
  if (Object.values(room.players).some(p => p.isBot)) return null;
  const human = humansOf(room)[0]; if (!human) return null;
  const cls = human.cls === "knight" ? "bard" : "knight", slot = human.slot === 0 ? 1 : 0;
  const bot = newPlayer(room, "cpu-" + room.code, BOT_NAMES[cls], cls, slot);
  bot.isBot = true; bot.x = clampX(room, human.x + (slot ? 55 : -55)); bot.y = human.y;
  room.players[bot.id] = bot;
  return bot;
}
function removeBots(room) { for (const id of Object.keys(room.players)) if (room.players[id].isBot) delete room.players[id]; }
function botsAgree(room, set) { for (const p of Object.values(room.players)) if (p.isBot) set.add(p.id); }

function botThink(room, b, now) {
  if (now < (b.thinkAt || 0) && b.alive) return;                 // a slow, human-ish reaction time: decide about every 0.3 to 0.6s, keep the last move in between
  b.thinkAt = now + 280 + Math.random() * 280;
  const inp = { up: false, down: false, left: false, right: false };
  b.input = inp;
  if (!b.alive || room.paused || room.finished || room.gameOver || room.shop) return;
  const mates = humansOf(room), mate = mates.find(m => m.alive) || mates[0];
  const knight = b.cls === "knight", D = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const move = (tx, ty, tol = 12) => {
    const dx = tx - b.x, dy = ty - b.y;
    if (Math.abs(dx) > tol) inp[dx > 0 ? "right" : "left"] = true;
    if (Math.abs(dy) > tol) inp[dy > 0 ? "down" : "up"] = true;
    return Math.hypot(dx, dy);
  };
  const away = (fx0, fy0) => {                                   // step directly away from a point
    const dx = b.x - fx0, dy = b.y - fy0;
    if (Math.abs(dx) > 6 || Math.abs(dy) < 6) inp[dx >= 0 ? "right" : "left"] = true;
    if (Math.abs(dy) > 6 || Math.abs(dx) < 6) inp[dy >= 0 ? "down" : "up"] = true;
  };
  const dashReady = now - b.lastDash >= DASH_COOLDOWN * cdm(b), noteReady = now - b.lastNote >= NOTE_COOLDOWN * cdm(b) * (knight ? 0.85 : 1), specReady = now - b.lastSpecial >= SPECIAL_COOLDOWN * cdm(b);

  // wear the best gear we carry
  for (const id of b.inv.slice()) {
    const it = ITEMS[id], cur = ITEMS[b.equip[it.slot]];
    if (!cur || it.rarity > cur.rarity) { b.inv.splice(b.inv.indexOf(id), 1); if (cur) b.inv.push(b.equip[it.slot]); b.equip[it.slot] = id; fx(room, "equipped", { id: b.id }); }
  }

  // Village: shadow the player, and stand in the same gate when they do
  if (room.scene === "hub") {
    if (!mate) return;
    const gate = REGION_IDS.map(id => REGIONS[id]).find(g => Math.abs(mate.x - g.gx) < 56 && mate.y < 112);
    if (gate) move(gate.gx, 80, 8); else move(mate.x + (b.slot ? 44 : -44), mate.y + 18, 40);
    if (mate && D(b.x, b.y, mate.x, mate.y) > 420 && dashReady) doDash(room, b, now);
    return;
  }

  const awake = room.enemies.filter(e => e.alive && now >= e.activeAt);
  const foes = mate ? awake.filter(e => D(e.x, e.y, mate.x, mate.y) < 300 || D(e.x, e.y, b.x, b.y) < 130) : awake;   // leash: the partner helps with what is near you, it does not clear the room alone
  // 1. get out of the way of telegraphed hits and incoming shots
  const threat = foes.find(e => e.windupUntil > now && e.windupTarget === b.id && D(e.x, e.y, b.x, b.y) < (e.kind === "boss" ? 150 : 95) && !defOf(e).ranged);
  if (threat && now - b.lastHit > 300) { away(threat.x, threat.y); if (dashReady && D(threat.x, threat.y, b.x, b.y) < 80) doDash(room, b, now); return; }
  for (const sh of room.shots) {
    const rx = b.x - sh.x, ry = b.y - sh.y, dist = Math.hypot(rx, ry);
    if (dist > 120 || rx * sh.vx + ry * sh.vy <= 0) continue;
    const cross = rx * sh.vy - ry * sh.vx, nx = -sh.vy, ny = sh.vx, n = Math.hypot(nx, ny) || 1, sgn = cross >= 0 ? -1 : 1;
    const ux = nx / n * sgn, uy = ny / n * sgn;
    if (Math.abs(ux) > 0.3) inp[ux > 0 ? "right" : "left"] = true;
    if (Math.abs(uy) > 0.3) inp[uy > 0 ? "down" : "up"] = true;
    if (dist < 55 && dashReady) doDash(room, b, now);
    return;
  }

  // 2. pick up a fallen friend
  if (mate && !mate.alive) { if (move(mate.x, mate.y, 16) < 40) return; return; }

  // 3. support: healing song / guard
  if (!knight && specReady && mate && D(b.x, b.y, mate.x, mate.y) < 170 && (mate.hp <= cap(mate) - 2 || b.hp <= cap(b) - 2) && (foes.length || mate.hp < cap(mate))) { doSpecial(room, b, now); }
  if (knight && specReady && foes.some(e => D(e.x, e.y, b.x, b.y) < 90) && b.hp <= 3) { doSpecial(room, b, now); }

  // 4. fight
  const reach = (knight ? 116 : 96) + gearStats(b).reach, width = knight ? 64 : 48;
  if (foes.length) {
    const score = e => D(e.x, e.y, b.x, b.y) * 0.4 + (mate ? D(e.x, e.y, mate.x, mate.y) : 0);
    const t = foes.reduce((a, e) => (score(e) < score(a) ? e : a), foes[0]);
    const vx = t.x - b.x, vy = t.y - b.y, horiz = Math.abs(vx) >= Math.abs(vy);
    const dir = horiz ? (vx > 0 ? "right" : "left") : (vy > 0 ? "down" : "up");
    const along = horiz ? Math.abs(vx) : Math.abs(vy), side = horiz ? Math.abs(vy) : Math.abs(vx), big = t.kind === "boss" ? 40 : 0;
    // line up across, then close the gap
    if (side > width * 0.3) inp[horiz ? (vy > 0 ? "down" : "up") : (vx > 0 ? "right" : "left")] = true;
    if (along > reach * 0.55) inp[horiz ? (vx > 0 ? "right" : "left") : (vy > 0 ? "down" : "up")] = true;
    else if (along < reach * 0.3) inp[horiz ? (vx > 0 ? "left" : "right") : (vy > 0 ? "up" : "down")] = true;
    b.facing = dir;
    const inCone = along < reach * 0.9 + big && side < width * 0.6 + big;
    const close = foes.filter(e => D(e.x, e.y, b.x, b.y) < 110);
    if (now < (b.swingAt || 0)) return;                      // takes a breath between swings
    if (inCone && noteReady && Math.random() < 0.35 && (close.length >= 2 || t.windupUntil > now || t.kind === "boss" || t.elite)) { b.swingAt = now + 700; doNote(room, b, now); }
    else if (inCone) { b.swingAt = now + 650 + Math.random() * 450; doAttack(room, b, now); }
    return;
  }

  // 5. nothing to fight: the loot is yours. It only grabs a heart when hurt and one is close, then heads for the exit with you.
  const needHeart = b.hp < cap(b) && (!mate || b.hp <= mate.hp || !mate.alive);
  const heart = needHeart && room.pickups.reduce((a, p) => (!a || D(p.x, p.y, b.x, b.y) < D(a.x, a.y, b.x, b.y) ? p : a), null);
  if (heart && D(heart.x, heart.y, b.x, b.y) < 120) { move(heart.x, heart.y, 10); return; }
  const open = room.enemies.every(e => !e.alive) && (room.stage === 0 || room.key);
  if (open && (!mate || mate.x > 520 || !mate.alive)) { move(745, 245 + (b.slot ? 28 : -28), 10); return; }
  if (mate) move(mate.x + (b.slot ? 50 : -50), mate.y + 20, 55);
}

function tick() {
  const now = Date.now(), dt = 0.05;
  for (const room of rooms.values()) {
    if (room.finished || room.gameOver || Object.keys(room.players).length < 1) continue;
    const all = Object.values(room.players);
    if (room.paused) { broadcast(room); continue; }

    // Shop phase: nothing moves; wait for ready or timeout.
    if (room.shop) {
      all.forEach(p => { if (p.isBot) room.shop.ready.add(p.id); });
      const everyone = all.every(p => room.shop.ready.has(p.id));
      if (everyone || now > room.shop.until) {
        room.shop = null; room.stage++; initStage(room); room.cpGold = room.gold;
        fx(room, "stage", { stage: room.stage });
        notice(room, `Room ${room.stage + 1}: ${LAY(room).name}` + (LAY(room).elite !== undefined ? `. The ${LAY(room).eliteName || "Iron Warden"} guards this room!` : ""));
        room.enemies.forEach(e => { e.activeAt = Date.now() + 1800; });
      }
      broadcast(room); continue;
    }

    let alive = all.filter(p => p.alive);
    if (alive.length === 0) { room.gameOver = true; bump(stats.wipes, LAY(room).name); if (room.lastHitBy) bump(stats.killers, room.lastHitBy); fx(room, "gameover"); broadcast(room); continue; }

    for (const p of alive) if (p.isBot) botThink(room, p, now);
    for (const p of alive) {
      const dashing = now < p.dashUntil;
      let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
      if (dashing) [dx, dy] = p.dashDir;
      const mag = Math.hypot(dx, dy) || 1;
      const speed = dashing ? 520 : 175 * (1 + 0.08 * (p.up.speed || 0) + gearStats(p).speed) * (now < (p.slowUntil || 0) ? 0.55 : 1);
      p.x = clampX(room, p.x + dx / mag * speed * dt);
      p.y = clampY(room, p.y + dy / mag * speed * dt);
      if (!dashing && (dx || dy)) p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    }

    if (room.started) {
      for (const e of room.enemies.slice()) {
        if (!e.alive || now < e.activeAt || now < e.stunUntil) continue;
        const def = defOf(e);
        const target = alive.reduce((b, p) => Math.hypot(p.x - e.x, p.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? p : b, alive[0]);
        const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
        const boss = e.kind === "boss";
        let speedMul = 1, cdMul = 1;
        if (e.elite && e.trait) {                         // each region Warden has a signature attack, telegraphed by a ring
          if (!e.traitAt) e.traitAt = now + 5000;
          if (e.traitFire && now >= e.traitFire) { e.traitFire = 0; fireTrait(room, e, target); }
          else if (!e.traitFire && now >= e.traitAt) { e.traitFire = now + 700; e.traitAt = now + 8500; fx(room, "traitcue", { x: e.x, y: e.y, trait: e.trait }); }
        }

        if (boss) {
          const frac = e.hp / e.maxHp, ph = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
          if (ph > e.phaseN) {
            e.phaseN = ph; fx(room, "bossphase", { phase: ph, x: e.x, y: e.y });
            if (ph === 2) { room.enemies.push(newEnemy(room, "slime", 640, 130), newEnemy(room, "slime", 640, 400)); notice(room, "The Dragon summons slimes!"); }
            if (ph === 3) { room.enemies.push(newEnemy(room, "bat", 640, 120), newEnemy(room, "bat", 640, 410)); notice(room, "The Dragon is enraged!"); }
            e.nextSpecialAt = now + 1500;
          }
          speedMul = 1 + 0.3 * (ph - 1); cdMul = 1 - 0.18 * (ph - 1);
          if (e.castUntil) {
            if (now >= e.castUntil) {
              e.castUntil = 0; e.nextSpecialAt = now + (ph === 3 ? 3600 : 5200);
              const base = Math.atan2(dy, dx);
              if (ph === 2) for (let i = -2; i <= 2; i++) fireShot(room, e.x, e.y, base + i * 0.28, 210, 1, "fire");
              else for (let i = 0; i < 10; i++) fireShot(room, e.x, e.y, base + i * (Math.PI * 2 / 10), 200, 1, "fire");
              fx(room, "bossfire", { x: e.x, y: e.y });
            }
            continue;
          }
          if (ph >= 2 && now >= e.nextSpecialAt && !e.windupUntil) { e.castUntil = now + 800; continue; }
        }

        if (e.windupUntil) {
          if (now >= e.windupUntil) {
            e.windupUntil = 0; e.nextAttackAt = now + def.cooldown * cdMul; e.retreatUntil = boss ? 0 : now + 650;
            if (def.ranged) {
              const v = room.players[e.windupTarget];
              if (v && e.kind === "hexer") { const ba = Math.atan2(v.y - e.y, v.x - e.x); for (const o of [-0.3, 0, 0.3]) fireShot(room, e.x, e.y, ba + o, 140, def.dmg, "hex"); fx(room, "hexcast", { x: e.x, y: e.y }); }
              else if (v) fireShot(room, e.x, e.y, Math.atan2(v.y - e.y, v.x - e.x), 260, def.dmg, "arrow");
            } else if (e.kind === "hotdog" && !e.elite) {          // two condiment squirts in a narrow fan
              const v = room.players[e.windupTarget];
              if (v) { const ba = Math.atan2(v.y - e.y, v.x - e.x); fireShot(room, e.x, e.y, ba - 0.12, 200, def.dmg, "ketchup"); fireShot(room, e.x, e.y, ba + 0.12, 200, def.dmg, "mustard"); fx(room, "squirt", { x: e.x, y: e.y }); }
            } else if (e.kind === "bomber") {                  // BOOM: hurts heroes and any monsters caught in the blast
              const BR = 84; e.alive = false; fx(room, "boom", { x: e.x, y: e.y });
              alive.forEach(v => { if (v.alive && Math.hypot(v.x - e.x, v.y - e.y) < BR && now >= v.dashUntil && now - v.lastHit > HIT_INVULN) hurtPlayer(room, v, def.dmg, e, now); });
              room.enemies.forEach(m => { if (m.alive && m !== e && Math.hypot(m.x - e.x, m.y - e.y) < BR) { m.hp -= 3; m.hitUntil = now + 200; if (m.hp <= 0) killEnemy(room, m, null); else { m.stunUntil = Math.max(m.stunUntil, now + 500); } } });
            } else {
              const victim = room.players[e.windupTarget];
              if (victim && victim.alive && Math.hypot(victim.x - e.x, victim.y - e.y) < def.range + 14 &&
                  now >= victim.dashUntil && now - victim.lastHit > HIT_INVULN) {
                hurtPlayer(room, victim, def.dmg, e, now);
              }
              if (boss) fx(room, "slam", { x: e.x, y: e.y });
              if (e.elite) {                       // the Warden's every-other-swing shockwave ring
                fx(room, "slam", { x: e.x, y: e.y }); e.slams = (e.slams || 0) + 1;
                if (e.slams % 2 === 0) { for (let i = 0; i < 8; i++) fireShot(room, e.x, e.y, i * Math.PI / 4 + 0.2, 175, 1, "fire"); fx(room, "bossfire", { x: e.x, y: e.y }); }
              }
              // The slam hits the other hero too if they're in range.
              if (boss) alive.forEach(v => {
                if (v.id !== e.windupTarget && v.alive && Math.hypot(v.x - e.x, v.y - e.y) < def.range + 14 && now >= v.dashUntil && now - v.lastHit > HIT_INVULN) hurtPlayer(room, v, def.dmg, e, now);
              });
            }
          }
          continue;
        }
        if (now < e.retreatUntil) {
          e.x = clampX(room, e.x - dx / d * def.speed * 0.8 * dt);
          e.y = clampY(room, e.y - dy / d * def.speed * 0.8 * dt);
          continue;
        }
        let mx = dx / d, my = dy / d;
        if (e.kind === "bat") {
          const w = Math.sin(now / 170 + e.phase) * 0.9;
          mx += -dy / d * w; my += dx / d * w;
          const m = Math.hypot(mx, my) || 1; mx /= m; my /= m;
        }
        if (def.ranged) {                          // archers keep their distance
          if (d < 170) { e.x = clampX(room, e.x - mx * def.speed * 1.2 * dt); e.y = clampY(room, e.y - my * def.speed * 1.2 * dt); }
          else if (d > 300) { e.x = clampX(room, e.x + mx * def.speed * dt); e.y = clampY(room, e.y + my * def.speed * dt); }
          if (now >= e.nextAttackAt && d < 420) { e.windupUntil = now + def.windup; e.windupTarget = target.id; }
          continue;
        }
        if (d > def.stop) { e.x = clampX(room, e.x + mx * def.speed * speedMul * dt); e.y = clampY(room, e.y + my * def.speed * speedMul * dt); }
        if (d < def.range && now >= e.nextAttackAt) { e.windupUntil = now + def.windup; e.windupTarget = target.id; }
      }
    }

    // Projectiles.
    room.shots = room.shots.filter(s => {
      s.life -= 50; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0 || s.x < 18 || s.x > ROOM_W - 18 || s.y < 54 || s.y > ROOM_H - 18) return false;
      const hit = alive.find(p => Math.hypot(p.x - s.x, p.y - s.y) < 20 && now >= p.dashUntil && now - p.lastHit > HIT_INVULN);
      if (hit) { hurtPlayer(room, hit, s.dmg, s, now); if (s.kind === "hex") { hit.slowUntil = now + 2400; fx(room, "slowed", { x: hit.x, y: hit.y }); } return false; }
      return true;
    });

    // Revive.
    for (const p of all) {
      if (p.alive) continue;
      const helper = alive.find(a => Math.hypot(a.x - p.x, a.y - p.y) < 50);
      p.reviveT = helper ? p.reviveT + dt : Math.max(0, p.reviveT - dt * 2);
      if (p.reviveT >= REVIVE_TIME) {
        p.alive = true; p.hp = 2; p.reviveT = 0; p.lastHit = now;
        if (helper) helper.stats.revives++;
        fx(room, "revive", { x: p.x, y: p.y });
        notice(room, `${p.name} is back on their feet!`);
      }
    }
    alive = all.filter(p => p.alive);
    if (alive.length === 0) { room.gameOver = true; bump(stats.wipes, LAY(room).name); if (room.lastHitBy) bump(stats.killers, room.lastHitBy); fx(room, "gameover"); broadcast(room); continue; }

    if (room.scene === "hub") { hubTick(room, all, alive, now, dt); broadcast(room); continue; }

    room.pickups = room.pickups.filter(pk => {
      const taker = alive.find(p => p.hp < cap(p) && Math.hypot(p.x - pk.x, p.y - pk.y) < 40);
      if (!taker) return true;
      taker.hp++; taker.stats.hearts++;
      fx(room, "heal", { x: pk.x, y: pk.y });
      return false;
    });

    if (room.keyDrop && alive.some(p => Math.hypot(p.x - room.keyDrop.x, p.y - room.keyDrop.y) < 38)) {
      fx(room, "key", room.keyDrop);
      room.key = true; room.keyDrop = null;
      notice(room, "Dungeon key collected! Now clear the room and head for the exit.");
    }

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
        if (room.stage < lastOf(room)) {
          // Open the shop. Fallen heroes get back up with 2 hearts.
          all.forEach(p => { if (!p.alive) { p.alive = true; p.hp = 2; p.reviveT = 0; } p.input = { up: false, down: false, left: false, right: false }; });
          room.shop = { ready: new Set(), until: now + SHOP_TIME };
          fx(room, "shopopen");
          notice(room, "Rest stop! Spend your gold, then press READY.");
        } else if (room.story) { const first = !room.story.done.has(room.region); room.story.done.add(room.region); if (room.region === "keep") finishStory(room); else { const rid = room.region; toHub(room, rid); if (rid === "frank" && first) { room.gold += 100; Object.values(room.players).forEach(p => giveItem(room, p, "crown")); notice(room, "Prize from Big Frank: 100 gold and a Crown of Echoes for everyone!"); } } }
        else finishRun(room);
      }
    }
    broadcast(room);
  }
}
setInterval(tick, 50);

if (require.main === module) {
  server.listen(PORT, () => console.log(`Riff & Shield listening on ${PORT}`));
} else {
  module.exports = { makeRoom, addBot, newPlayer, tick, retryRoom, server, io, rooms, MOB, MAX_HP, roomLayouts, REGIONS, QUESTS, toHub, enterRegion, initStage, startRun, ITEMS, giveItem, killEnemy, resetRoom, DIFFS };   // for automated tests
}
