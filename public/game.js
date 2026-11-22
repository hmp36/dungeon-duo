const socket = io();
const $ = id => document.getElementById(id);
const lobby = $("lobby"), game = $("game"), canvas = $("gameCanvas"), ctx = canvas.getContext("2d");
const W = 800, H = 520;
let myId = null, roomCode = "", state = null, keys = {};
const roomNames = ["Forgotten Entrance", "The Crypt", "Treasure Chamber"];
const RANGE = { slime: 46, skeleton: 50, bat: 40, brute: 62 };
const ANG = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const rnd = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ sound */
let actx = null, muted = false;
try { muted = localStorage.getItem("dd_muted") === "1"; } catch (e) {}
function audio() {
  if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
function tone(freq, dur, type = "square", vol = 0.07, slideTo = null, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol = 0.08, freq = 1500, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  const t = a.currentTime + delay, len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(a.destination); s.start(t);
}
const sfx = {
  notes() { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.18, "triangle", 0.08, null, i * 0.07)); noise(0.1, 0.03, 3000); },
  swing() { noise(0.12, 0.07, 1900); tone(320, 0.1, "sawtooth", 0.035, 120); },
  hit() { tone(190, 0.1, "square", 0.08, 70); noise(0.08, 0.06, 900); },
  kill() { tone(240, 0.28, "sawtooth", 0.07, 50); noise(0.22, 0.08, 500); },
  hurt() { tone(150, 0.3, "sawtooth", 0.09, 55); noise(0.12, 0.06, 400); },
  heal() { tone(660, 0.1, "sine", 0.08); tone(880, 0.16, "sine", 0.08, null, 0.09); },
  key() { [660, 830, 990, 1320].forEach((f, i) => tone(f, 0.15, "triangle", 0.09, null, i * 0.08)); },
  keydrop() { tone(520, 0.12, "triangle", 0.08); tone(780, 0.2, "triangle", 0.08, null, 0.1); },
  door() { tone(110, 0.5, "sawtooth", 0.06, 230); tone(330, 0.35, "triangle", 0.06, null, 0.2); },
  dash() { noise(0.15, 0.06, 2600); },
  down() { tone(300, 0.6, "sawtooth", 0.09, 60); },
  revive() { [440, 554, 660, 880].forEach((f, i) => tone(f, 0.16, "sine", 0.08, null, i * 0.07)); },
  stage() { tone(220, 0.15, "square", 0.06); tone(330, 0.15, "square", 0.06, null, 0.12); tone(440, 0.25, "square", 0.06, null, 0.24); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, "square", 0.07, null, i * 0.14)); },
  gameover() { [330, 277, 233, 175].forEach((f, i) => tone(f, 0.3, "sawtooth", 0.07, null, i * 0.22)); },
  windup() { tone(540, 0.07, "square", 0.035); }
};
const muteBtn = $("muteBtn");
function paintMute() { muteBtn.textContent = muted ? "SOUND: OFF" : "SOUND: ON"; }
muteBtn.onclick = () => { muted = !muted; try { localStorage.setItem("dd_muted", muted ? "1" : "0"); } catch (e) {} paintMute(); if (!muted) sfx.heal(); };
paintMute();

/* ------------------------------------------------------------------ lobby / network */
function showError(msg) { $("lobbyError").textContent = msg || ""; }
function enterRoom(result) {
  if (!result.ok) { showError(result.error); return; }
  myId = result.playerId; roomCode = result.code;
  $("codeLabel").textContent = roomCode; $("roomLabel").textContent = "1 / 3";
  lobby.classList.add("hidden"); game.classList.remove("hidden"); showError("");
}
$("createBtn").onclick = () => { audio(); socket.emit("createRoom", { name: $("playerName").value.trim() || "Hero" }, enterRoom); };
$("joinBtn").onclick = () => { audio(); socket.emit("joinRoom", { name: $("playerName").value.trim() || "Hero", code: $("roomCode").value }, enterRoom); };
$("copyBtn").onclick = () => navigator.clipboard?.writeText(roomCode).then(() => $("copyBtn").textContent = "COPIED");
$("againBtn").onclick = () => location.reload();
$("soloBtn").onclick = () => socket.emit("startSolo");
socket.on("connect_error", () => $("status").textContent = "Connection problem. Refresh and try again.");
socket.on("notice", msg => $("status").textContent = msg);

let lastStage = -1, windSeen = new Set(), lastWindSfx = 0;
socket.on("state", s => {
  // monsters that just started winding up get an audible warning
  s.enemies.forEach(e => {
    if (e.winding && !windSeen.has(e.id)) { windSeen.add(e.id); if (performance.now() - lastWindSfx > 160) { sfx.windup(); lastWindSfx = performance.now(); } }
    if (!e.winding) windSeen.delete(e.id);
  });
  if (s.stage !== lastStage) {
    lastStage = s.stage; rp.clear();
    banner = { text: `ROOM ${s.stage + 1}`, sub: roomNames[s.stage].toUpperCase(), start: performance.now(), until: performance.now() + 2600 };
  }
  state = s; updateHud(); checkOverlay();
});
socket.on("fx", handleFx);

function updateHud() {
  if (!state) return;
  $("roomLabel").textContent = `${state.stage + 1} / 3 — ${roomNames[state.stage]}`;
  const ps = state.players, mx = state.maxHp || 5;
  $("healthLabel").textContent = ps.map(p => `${p.name}: ${"❤️".repeat(p.hp)}${"🖤".repeat(mx - p.hp)}${p.alive ? "" : " DOWN"}`).join("　");
  $("enemyLabel").textContent = `${state.enemyCount} remaining`;
  $("keyLabel").textContent = state.key ? "🗝️ Carried" : state.keyDrop ? "✨ On the floor!" : "🔒 Not found";
  $("soloBtn").classList.toggle("hidden", !state.waiting);
}
function checkOverlay() {
  if (!state) return;
  if (state.finished) { $("overlayTitle").textContent = "DUNGEON CLEARED!"; $("overlayText").textContent = "The team made it out. Excellent teamwork!"; $("overlay").classList.remove("hidden"); }
  else if (state.gameOver) { $("overlayTitle").textContent = "TEAM DEFEATED"; $("overlayText").textContent = "Every hero has fallen. The dungeon wins this time."; $("overlay").classList.remove("hidden"); }
  else $("overlay").classList.add("hidden");
}

/* ------------------------------------------------------------------ input */
function doDash() { socket.emit("dash"); }
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (k === " ") { if (!e.repeat) socket.emit("attack"); return; }
  if (k === "shift" || k === "e") { if (!e.repeat) doDash(); return; }
  if (k === "q" || k === "f") { if (!e.repeat) socket.emit("note"); return; }
  if (k === "w" || k === "arrowup") keys.up = true;
  if (k === "s" || k === "arrowdown") keys.down = true;
  if (k === "a" || k === "arrowleft") keys.left = true;
  if (k === "d" || k === "arrowright") keys.right = true;
});
window.addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if (k === "w" || k === "arrowup") keys.up = false;
  if (k === "s" || k === "arrowdown") keys.down = false;
  if (k === "a" || k === "arrowleft") keys.left = false;
  if (k === "d" || k === "arrowright") keys.right = false;
});
window.addEventListener("blur", () => keys = {});
// Touch controls: on-screen d-pad, attack and dash (shown only on touch devices).
document.querySelectorAll("#touchPad [data-key]").forEach(b => {
  const k = b.dataset.key;
  b.addEventListener("pointerdown", e => { e.preventDefault(); keys[k] = true; });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => b.addEventListener(t, e => { e.preventDefault(); keys[k] = false; }));
  b.addEventListener("contextmenu", e => e.preventDefault());
});
(() => {
  const atk = $("atkBtn"); let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  atk.addEventListener("pointerdown", e => { e.preventDefault(); socket.emit("attack"); stop(); timer = setInterval(() => socket.emit("attack"), 490); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => atk.addEventListener(t, stop));
  atk.addEventListener("contextmenu", e => e.preventDefault());
  const nb = $("noteBtn"); nb.addEventListener("pointerdown", e => { e.preventDefault(); socket.emit("note"); }); nb.addEventListener("contextmenu", e => e.preventDefault());
  const dash = $("dashBtn");
  dash.addEventListener("pointerdown", e => { e.preventDefault(); doDash(); });
  dash.addEventListener("contextmenu", e => e.preventDefault());
})();
setInterval(() => {
  if (!myId || !state) return;
  const me = state.players.find(p => p.id === myId); if (!me || !me.alive) return;
  const facing = keys.left ? "left" : keys.right ? "right" : keys.up ? "up" : keys.down ? "down" : me.facing;
  socket.emit("input", { ...keys, facing });
}, 50);

/* ------------------------------------------------------------------ effects */
const parts = [], floats = [], swing = {}, noteGlyphs = [];
let shake = 0, hurtFlash = 0, banner = null, rp = new Map(), frame = 0;
function burst(x, y, col, n, sp, life, size, grav = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = sp * (0.35 + Math.random() * 0.85);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, col, size: size * (0.6 + Math.random() * 0.8), grav });
  }
}
function floater(x, y, text, col) { floats.push({ x, y, text, col, life: 900, max: 900 }); }
const KIND_COL = { slime: "#5cc86b", skeleton: "#e8e4d4", bat: "#8e5bc4", brute: "#c0503b" };
function handleFx(f) {
  const now = performance.now();
  switch (f.type) {
    case "swing": swing[f.id] = now; sfx.swing(); break;
    case "hit": burst(f.x, f.y, "#fff3b0", 8, 150, 380, 4); burst(f.x, f.y, "#ffb347", 5, 110, 320, 3); shake = Math.max(shake, 3); sfx.hit(); break;
    case "kill": burst(f.x, f.y, KIND_COL[f.kind] || "#fff", 22, 190, 650, 5, 220); burst(f.x, f.y, "#cfd3dc", 8, 90, 700, 7); shake = Math.max(shake, 7); sfx.kill(); break;
    case "hurt": burst(f.x, f.y, "#ff5a5a", 14, 170, 520, 4); shake = Math.max(shake, 11); floater(f.x, f.y - 30, "-" + f.dmg, "#ff6b6b"); if (f.id === myId) hurtFlash = 0.55; sfx.hurt(); break;
    case "heal": burst(f.x, f.y, "#ff8fb3", 10, 80, 700, 4, -80); floater(f.x, f.y - 20, "+1 HEART", "#ff9dbb"); sfx.heal(); break;
    case "keydrop": burst(f.x, f.y, "#ffd86b", 24, 160, 800, 4, -30); floater(f.x, f.y - 30, "THE KEY!", "#ffe08a"); shake = Math.max(shake, 5); sfx.keydrop(); break;
    case "key": burst(f.x, f.y, "#ffe9a0", 26, 200, 800, 4, -60); floater(f.x, f.y - 30, "KEY GET!", "#ffe08a"); sfx.key(); break;
    case "door": burst(738, 262, "#ffd86b", 30, 200, 900, 4, -40); shake = Math.max(shake, 5); sfx.door(); break;
    case "notes": { sfx.notes(); const d = f.facing === "left" ? -1 : f.facing === "right" ? 1 : 0, v = f.facing === "up" ? -1 : f.facing === "down" ? 1 : 0;
      for (let i = 0; i < 9; i++) noteGlyphs.push({ x: f.x + d * 20, y: f.y - 10 + v * 20, vx: d * rnd(110, 260) + rnd(-40, 40) * (v ? 1 : 0), vy: v * rnd(110, 260) + rnd(-50, 50) * (d ? 1 : 0), life: 800, max: 800, g: ["♪", "♫", "♩"][i % 3], col: ["#ffe08a", "#7fe3ff", "#ff9dbb"][i % 3] });
      break; }
    case "stun": burst(f.x, f.y - 20, "#fff3b0", 8, 90, 450, 4); floater(f.x, f.y - 40, "STUNNED", "#ffe08a"); break;
    case "dash": burst(f.x, f.y, "#bfe9ff", 10, 120, 350, 4); sfx.dash(); break;
    case "down": burst(f.x, f.y, "#9aa3b5", 16, 120, 800, 5, -30); floater(f.x, f.y - 34, "DOWN!", "#ff8b8b"); sfx.down(); break;
    case "revive": burst(f.x, f.y, "#7fe3ff", 26, 150, 900, 4, -90); floater(f.x, f.y - 34, "REVIVED!", "#9cecff"); sfx.revive(); break;
    case "stage": sfx.stage(); break;
    case "win": sfx.win(); break;
    case "gameover": sfx.gameover(); break;
  }
}

/* ------------------------------------------------------------------ backgrounds */
const THEMES = [
  { floorA: "#2d323e", floorB: "#282d38", line: "#394050", speck: "#444c5e", wall: "#5d596a", wallDark: "#3b3846", ambient: 0.52, torch: "#ffb347", glow: "255,170,70" },
  { floorA: "#243030", floorB: "#202b2b", line: "#314343", speck: "#3d5555", wall: "#4e6258", wallDark: "#33423b", ambient: 0.64, torch: "#8dffbd", glow: "110,255,170" },
  { floorA: "#3b3428", floorB: "#362f24", line: "#4d4333", speck: "#5c4f38", wall: "#85734a", wallDark: "#5a4c30", ambient: 0.44, torch: "#ffd86b", glow: "255,210,100" }
];
const TORCHES = [90, 400, 690];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function bricks(g, x, y, w, h, th) {
  g.fillStyle = th.wallDark; g.fillRect(x, y, w, h);
  const bh = 14, bw = 34;
  for (let r = 0; r * bh < h; r++) {
    const off = (r % 2) * bw / 2;
    for (let bx = -off; bx < w; bx += bw) {
      const sx = Math.max(0, bx), ex = Math.min(w, bx + bw - 2); if (ex <= sx) continue;
      g.fillStyle = th.wall; g.fillRect(x + sx, y + r * bh + 1, ex - sx, Math.min(bh - 2, h - r * bh - 1));
      g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + sx, y + r * bh + 1, ex - sx, 2);
    }
  }
}
function barrel(g, x, y) { g.fillStyle = "#5a3d24"; g.beginPath(); g.ellipse(x, y, 15, 17, 0, 0, 6.283); g.fill(); g.fillStyle = "#74502f"; g.fillRect(x - 12, y - 10, 24, 5); g.fillStyle = "#3a3f4a"; g.fillRect(x - 14, y - 4, 28, 4); g.fillRect(x - 13, y + 6, 26, 4); }
function chest(g, x, y) { g.fillStyle = "#6b4423"; g.fillRect(x - 20, y - 4, 40, 22); g.fillStyle = "#85562c"; g.fillRect(x - 20, y - 14, 40, 12); g.fillStyle = "#d4a73c"; g.fillRect(x - 21, y - 6, 42, 4); g.fillRect(x - 4, y - 8, 8, 12); g.fillStyle = "#ffe08a"; g.fillRect(x - 2, y - 4, 4, 5); }
function coins(g, x, y, rng) { for (let i = 0; i < 9; i++) { g.fillStyle = rng() < .5 ? "#e0b13c" : "#ffd96b"; g.fillRect(x + (rng() * 26 | 0) - 13, y + (rng() * 12 | 0) - 6, 5, 3); } }
function skull(g, x, y) { g.fillStyle = "#cfc8b4"; g.fillRect(x - 5, y - 5, 10, 9); g.fillRect(x - 3, y + 3, 6, 3); g.fillStyle = "#222"; g.fillRect(x - 3, y - 2, 2, 3); g.fillRect(x + 1, y - 2, 2, 3); }
function bone(g, x, y, a) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = "#cfc8b4"; g.fillRect(-9, -1.5, 18, 3); g.fillRect(-11, -3, 4, 6); g.fillRect(7, -3, 4, 6); g.restore(); }
function buildBg(stage) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), th = THEMES[stage], rng = mulberry(stage * 7919 + 13);
  for (let y = 0; y < H; y += 40) for (let x = 0; x < W; x += 40) {
    g.fillStyle = ((x / 40 + y / 40) % 2) ? th.floorA : th.floorB; g.fillRect(x, y, 40, 40);
    g.strokeStyle = th.line; g.strokeRect(x + .5, y + .5, 39, 39);
  }
  for (let i = 0; i < 170; i++) { g.fillStyle = rng() < .5 ? th.line : th.speck; g.fillRect(rng() * W | 0, rng() * H | 0, 2 + (rng() * 3 | 0), 2 + (rng() * 2 | 0)); }
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { let x = 60 + rng() * 680, y = 90 + rng() * 380; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - .5) * 28; y += (rng() - .3) * 24; g.lineTo(x, y); } g.stroke(); }
  if (stage === 0) {                                   // red carpet, barrels, banners
    g.fillStyle = "#5b2433"; g.fillRect(40, 238, 676, 44);
    g.fillStyle = "#c9a24d"; g.fillRect(40, 236, 676, 3); g.fillRect(40, 281, 676, 3);
    for (let x = 60; x < 700; x += 40) { g.fillStyle = "#7a3345"; g.beginPath(); g.moveTo(x, 260); g.lineTo(x + 8, 252); g.lineTo(x + 16, 260); g.lineTo(x + 8, 268); g.fill(); }
    barrel(g, 52, 100); barrel(g, 748, 100); barrel(g, 52, 460); barrel(g, 748, 462);
  } else if (stage === 1) {                            // crypt: sarcophagi, bones, cobwebs, puddles
    for (const sx of [130, 330, 530]) {
      g.fillStyle = "#3d4a44"; g.fillRect(sx, 58, 76, 38); g.fillStyle = "#566a60"; g.fillRect(sx + 3, 60, 70, 12);
      g.fillStyle = "#2a332f"; g.fillRect(sx + 36, 62, 4, 30); g.fillRect(sx + 26, 70, 24, 4);
    }
    for (let i = 0; i < 6; i++) skull(g, 70 + rng() * 660, 120 + rng() * 360);
    for (let i = 0; i < 10; i++) bone(g, 60 + rng() * 680, 110 + rng() * 380, rng() * 3.14);
    g.fillStyle = "rgba(60,120,140,.25)"; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(120 + rng() * 560, 150 + rng() * 300, 30 + rng() * 20, 12 + rng() * 8, 0, 0, 6.283); g.fill(); }
    g.strokeStyle = "rgba(220,230,230,.35)"; g.lineWidth = 1;
    for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(18, 54); g.lineTo(18 + i * 12, 54 + (5 - i) * 12); g.stroke(); g.beginPath(); g.moveTo(782, 54); g.lineTo(782 - i * 12, 54 + (5 - i) * 12); g.stroke(); }
  } else {                                             // treasure chamber: gold inlay, chests, coins
    g.strokeStyle = "rgba(243,201,105,.45)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(400, 120); g.lineTo(580, 260); g.lineTo(400, 400); g.lineTo(220, 260); g.closePath(); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(400, 160); g.lineTo(530, 260); g.lineTo(400, 360); g.lineTo(270, 260); g.closePath(); g.stroke();
    g.fillStyle = "rgba(243,201,105,.18)"; g.beginPath(); g.arc(400, 260, 34, 0, 6.283); g.fill();
    for (const [cx, cy] of [[60, 86], [140, 86], [660, 86], [740, 86], [60, 470], [740, 470]]) { chest(g, cx, cy); coins(g, cx + 26, cy + 18, rng); }
  }
  bricks(g, 0, 0, W, 54, th);                          // top wall
  bricks(g, 0, 54, 18, H - 54, th); bricks(g, W - 18, 54, 18, H - 54, th); bricks(g, 0, H - 18, W, 18, th);
  const sh = g.createLinearGradient(0, 54, 0, 84); sh.addColorStop(0, "rgba(0,0,0,.5)"); sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh; g.fillRect(18, 54, W - 36, 30);
  return c;
}
const bgCache = {};
const bg = s => bgCache[s] || (bgCache[s] = buildBg(s));
const dark = document.createElement("canvas"); dark.width = W; dark.height = H; const dctx = dark.getContext("2d");
function light(g, x, y, r, s) { const gr = g.createRadialGradient(x, y, r * 0.08, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${s})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }

/* ------------------------------------------------------------------ sprites */
const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
function shadow(x, y, w) { ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.38, 0, 0, 6.283); ctx.fill(); }
function heartShape(x, y, s, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x - s * .5, y - s * .3, s * .55, Math.PI, 0); ctx.arc(x + s * .5, y - s * .3, s * .55, Math.PI, 0); ctx.lineTo(x, y + s * .95); ctx.closePath(); ctx.fill(); }
function keyIcon(x, y, s, col = "#ffd86b") {
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#2a2418"; ctx.beginPath(); ctx.arc(x, y, 3 * s, 0, 6.283); ctx.fill();
  ctx.fillStyle = col; ctx.fillRect(x + 5 * s, y - 2 * s, 17 * s, 4 * s); ctx.fillRect(x + 15 * s, y, 4 * s, 8 * s); ctx.fillRect(x + 21 * s, y, 3 * s, 6 * s);
}
const PAL = [
  { tunic: "#3fb6d8", dark: "#1f7894", pants: "#2b3a52", hair: "#4a2f1d", cape: "#1d5d78" },
  { tunic: "#e8a33c", dark: "#a8691a", pants: "#4b3320", hair: "#c9833a", cape: "#9a5a14" }
];
function R(id, x, y) {
  let r = rp.get(id); if (!r) { r = { x, y, moving: false }; rp.set(id, r); }
  const dx = x - r.x, dy = y - r.y;
  if (Math.abs(dx) > 140 || Math.abs(dy) > 140) { r.x = x; r.y = y; r.moving = false; }
  else { r.moving = Math.hypot(dx, dy) > 1.4; r.x += dx * 0.4; r.y += dy * 0.4; }
  r.seen = frame; return r;
}
const labels = [];
function drawHero(p, r, t) {
  const x = Math.round(r.x), y = Math.round(r.y), pal = PAL[(p.slot || 0) % 2], me = p.id === myId;
  shadow(x, y + 16, 14);
  if (!p.alive) {                                       // tombstone + revive ring
    px(x - 11, y - 8, 22, 24, "#6b7280"); px(x - 8, y - 13, 16, 7, "#6b7280"); px(x - 2, y - 7, 4, 14, "#4b5563"); px(x - 7, y - 2, 14, 4, "#4b5563");
    ctx.save(); ctx.strokeStyle = "rgba(127,227,255,.5)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 0.02;
    ctx.beginPath(); ctx.arc(x, y + 2, 50, 0, 6.283); ctx.stroke(); ctx.restore();
    if (p.revive > 0) { ctx.strokeStyle = "#7fe3ff"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y + 2, 30, -1.57, -1.57 + 6.283 * p.revive); ctx.stroke(); }
    labels.push({ x, y: y - 22, text: p.name + " (DOWN)", col: "#ff9a9a" });
    return;
  }
  const blink = p.invuln && Math.floor(t / 90) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.45;
  const bob = r.moving ? -Math.abs(Math.sin(t * 0.018)) * 3 : Math.sin(t * 0.005 + (p.slot || 0)) * -1;
  const step = r.moving ? Math.sin(t * 0.02) * 4 : 0;
  if (p.dashing) { ctx.globalAlpha *= 0.55; px(x - 14, y - 22, 28, 34, "#bfe9ff"); ctx.globalAlpha = blink ? 0.45 : 1; }
  const behind = p.facing === "left" ? 1 : p.facing === "right" ? -1 : 0;
  px(x - 10 + behind * 8, y - 8 + bob, 20, 18, pal.cape);                         // cape
  px(x - 8, y + 6, 6, 8 + Math.max(0, step), pal.pants); px(x + 2, y + 6, 6, 8 + Math.max(0, -step), pal.pants);
  px(x - 9, y + 13 + Math.max(0, step), 8, 4, "#2a2018"); px(x + 1, y + 13 + Math.max(0, -step), 8, 4, "#2a2018");
  px(x - 10, y - 8 + bob, 20, 16, pal.tunic); px(x - 10, y + 3 + bob, 20, 3, "#5a3d1f"); px(x - 2, y + 2 + bob, 4, 5, "#e8c452");
  px(x - 10, y - 8 + bob, 20, 3, pal.dark);
  px(x - 13, y - 6 + bob, 4, 10, pal.dark); px(x + 9, y - 6 + bob, 4, 10, pal.dark);
  px(x - 7, y - 22 + bob, 14, 13, "#f0c79b");                                      // head
  px(x - 8, y - 25 + bob, 16, 7, pal.hair); px(x - 8, y - 21 + bob, 3, 7, pal.hair); px(x + 5, y - 21 + bob, 3, 7, pal.hair);
  if (p.facing === "right") { px(x + 1, y - 16 + bob, 3, 3, "#29202a"); px(x + 5, y - 16 + bob, 2, 3, "#29202a"); }
  else if (p.facing === "left") { px(x - 4, y - 16 + bob, 3, 3, "#29202a"); px(x - 7, y - 16 + bob, 2, 3, "#29202a"); }
  else if (p.facing === "down") { px(x - 5, y - 16 + bob, 3, 3, "#29202a"); px(x + 2, y - 16 + bob, 3, 3, "#29202a"); }
  const ang = ANG[p.facing] || 0, age = t - (swing[p.id] || -9999), swinging = age < 260;
  const playing = p.playing; ctx.save(); ctx.translate(x, y - 2 + bob);
  if (playing) { ctx.rotate(ang * 0 + (p.facing === "left" ? 0.25 : -0.25) + Math.sin(t * 0.04) * 0.08); }
  else ctx.rotate(ang + (swinging ? -1.25 + (age / 260) * 2.5 : 0.85));
  const gx = playing ? (p.facing === "left" ? -8 : 8) : 0, gd = playing && p.facing === "left" ? -1 : 1;
  ctx.translate(gx, playing ? 4 : 0); ctx.scale(playing ? gd : 1, 1);
  px(2, -2, 22, 4, "#6b4a2a"); px(24, -4, 7, 8, "#3a2814"); px(26, -6, 2, 2, "#ddd"); px(29, -6, 2, 2, "#ddd");   // neck + headstock
  px(-6, -9, 14, 18, "#c0562b"); px(-10, -6, 8, 12, "#c0562b"); px(-3, -9, 8, 3, "#e9824f"); px(-1, -3, 6, 6, "#2a1a10"); px(3, -1, 8, 2, "#e8dcc0");
  ctx.restore();
  ctx.globalAlpha = 1;
  if (swinging) {                                                                    // big slash arc
    const pr = age / 260;
    ctx.save(); ctx.translate(x, y - 2); ctx.rotate(ang); ctx.lineCap = "round";
    ctx.globalAlpha = (1 - pr) * 0.95; ctx.strokeStyle = "#fff7c2"; ctx.lineWidth = 16 * (1 - pr * 0.5);
    ctx.beginPath(); ctx.arc(0, 0, 66, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = "rgba(255,190,70,.9)"; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 76, -1.0, 1.0); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (me) { px(x - 14, y + 22, 28, 4, "#0c0e14"); px(x - 13, y + 23, 26 * (1 - p.noteCd), 2, p.noteCd > 0 ? "#6b7280" : "#7fe3ff"); }
  labels.push({ x, y: y - 32 + bob, text: p.name, col: me ? "#7fe3ff" : "#ffe08a", me });
}
function tint(base, e, t) { return e.hurt ? "#ffffff" : (e.winding && Math.floor(t / 70) % 2 === 0) ? "#ff6a5a" : base; }
function drawEnemy(e, r, t, faceX) {
  const x = Math.round(r.x), y = Math.round(r.y), ph = (e.id.length * 1.7) % 6, dir = faceX >= 0 ? 1 : -1;
  if (e.dormant) ctx.globalAlpha = 0.6;
  if (e.keeper) { const gl = ctx.createRadialGradient(x, y, 4, x, y, 52); gl.addColorStop(0, "rgba(255,216,107,.55)"); gl.addColorStop(1, "rgba(255,216,107,0)"); ctx.fillStyle = gl; ctx.fillRect(x - 55, y - 55, 110, 110); }
  if (e.kind === "slime") {
    shadow(x, y + 13, 16);
    const sq = Math.sin(t * 0.008 + ph) * 2.5, w = 32 + sq, h = 24 - sq;
    ctx.fillStyle = tint("#4fae5e", e, t); ctx.beginPath(); ctx.ellipse(x, y + 3, w / 2, h / 2, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = tint("#7ee08d", e, t); ctx.beginPath(); ctx.ellipse(x - 4, y - 2, w / 3.2, h / 3.4, 0, 0, 6.283); ctx.fill();
    px(x - 8, y - 2, 5, 6, "#fff"); px(x + 3, y - 2, 5, 6, "#fff"); px(x - 6 + dir, y, 2, 4, "#222"); px(x + 5 + dir, y, 2, 4, "#222");
  } else if (e.kind === "bat") {
    const fl = Math.sin(t * 0.035 + ph), yy = y - 8 + Math.sin(t * 0.01 + ph) * 3;
    shadow(x, y + 16, 9);
    ctx.fillStyle = tint("#5a3380", e, t);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + s * 30, yy - 10 - fl * 12); ctx.lineTo(x + s * 22, yy + 4); ctx.lineTo(x + s * 14, yy + 2 + fl * 3); ctx.lineTo(x + s * 8, yy + 8); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = tint("#3c2358", e, t); ctx.beginPath(); ctx.ellipse(x, yy + 1, 8, 9, 0, 0, 6.283); ctx.fill();
    px(x - 6, yy - 10, 4, 6, "#3c2358"); px(x + 2, yy - 10, 4, 6, "#3c2358");
    px(x - 4, yy - 2, 3, 3, "#ff4d4d"); px(x + 1, yy - 2, 3, 3, "#ff4d4d");
  } else if (e.kind === "skeleton") {
    shadow(x, y + 16, 14);
    const sw = Math.sin(t * 0.012 + ph) * 2, bone = tint("#e6e1cf", e, t), dk = tint("#a39d8a", e, t);
    px(x - 7, y + 6, 4, 10 + sw, bone); px(x + 3, y + 6, 4, 10 - sw, bone);
    px(x - 9, y - 8, 18, 15, bone); for (let i = 0; i < 3; i++) px(x - 8, y - 5 + i * 4, 16, 2, dk); px(x - 1, y - 8, 2, 15, dk);
    px(x - 13, y - 6 + sw, 4, 12, bone); px(x + 9, y - 6 - sw, 4, 12, bone);
    px(x + dir * 12 - 1, y - 14 - sw, 3, 20, "#8b95a5"); px(x + dir * 12 - 3, y + 4 - sw, 7, 3, "#6b4a2a");
    px(x - 8, y - 23, 16, 14, bone); px(x - 6, y - 12, 12, 4, dk);
    px(x - 5, y - 19, 4, 4, "#16161c"); px(x + 1, y - 19, 4, 4, "#16161c");
    px(x - 4 + dir, y - 18, 2, 2, e.winding ? "#ff5a5a" : "#7be0ff"); px(x + 2 + dir, y - 18, 2, 2, e.winding ? "#ff5a5a" : "#7be0ff");
  } else {                                              // brute
    shadow(x, y + 24, 26);
    const sw = Math.sin(t * 0.007 + ph) * 2;
    px(x - 18, y + 12, 12, 14 + sw, tint("#5c241c", e, t)); px(x + 6, y + 12, 12, 14 - sw, tint("#5c241c", e, t));
    px(x - 24, y - 16, 48, 34, tint("#8b3a2f", e, t)); px(x - 14, y - 4, 28, 20, tint("#a85a45", e, t));
    px(x - 32, y - 12 + sw, 9, 24, tint("#8b3a2f", e, t)); px(x + 23, y - 12 - sw, 9, 24, tint("#8b3a2f", e, t));
    px(x + dir * 30 - 4, y - 34, 9, 40, "#6b4a2a"); px(x + dir * 30 - 8, y - 40, 17, 14, "#4a331c");
    px(x - 15, y - 38, 30, 24, tint("#a3473a", e, t));
    px(x - 20, y - 46, 7, 14, "#e8dcc0"); px(x + 13, y - 46, 7, 14, "#e8dcc0");
    px(x - 9, y - 31, 6, 6, "#ffe58a"); px(x + 3, y - 31, 6, 6, "#ffe58a"); px(x - 7 + dir, y - 29, 3, 3, "#222"); px(x + 5 + dir, y - 29, 3, 3, "#222");
    px(x - 8, y - 21, 4, 6, "#fff"); px(x + 4, y - 21, 4, 6, "#fff");
  }
  ctx.globalAlpha = 1;
  const top = e.kind === "brute" ? 54 : e.kind === "bat" ? 30 : 34;
  if (e.keeper) { keyIcon(x - 10, y - top - 8 + Math.sin(t * 0.006) * 3, 0.9); }
  if (e.dormant) { ctx.fillStyle = "#cfe3ff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("z", x + 12, y - top + Math.sin(t * 0.004) * 3); ctx.fillText("Z", x + 20, y - top - 8 + Math.sin(t * 0.004 + 1) * 3); }
  if (e.hp < e.maxHp || e.kind === "brute") {
    const bw = e.kind === "brute" ? 44 : 30, by = y - top - (e.keeper ? 22 : 8);
    px(x - bw / 2 - 1, by - 1, bw + 2, 6, "#0c0e14"); px(x - bw / 2, by, bw, 4, "#3a1f26"); px(x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 4, "#e66c75");
  }
  if (e.stunned && !e.dormant) { for (let i = 0; i < 3; i++) { const a = t * 0.008 + i * 2.09; ctx.fillStyle = "#ffe08a"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("★", x + Math.cos(a) * 16, y - top - 6 + Math.sin(a) * 4); } }
  if (e.winding) {                                      // attack warning: pulsing ring + !
    const rg = RANGE[e.kind] || 46, pu = 0.7 + 0.3 * Math.sin(t * 0.03);
    ctx.fillStyle = "rgba(255,60,60,.16)"; ctx.beginPath(); ctx.arc(x, y, rg * pu, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(255,90,90,.85)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, rg * pu, 0, 6.283); ctx.stroke();
    ctx.fillStyle = "#ff5a5a"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", x, y - top - 14);
  }
}
function drawDoor(t) {
  const open = !!(state && state.doorOpen), needKey = !!(state && state.stage > 0 && !state.key);
  px(704, 197, 74, 126, open ? "#a8863a" : "#4c4650"); px(710, 203, 62, 114, open ? "#c9a24d" : "#37323d");
  if (open) {
    const gr = ctx.createLinearGradient(724, 0, 760, 0); gr.addColorStop(0, "#ffe9a0"); gr.addColorStop(1, "#d69a2a");
    ctx.fillStyle = gr; ctx.fillRect(722, 216, 38, 88);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; const gl = ctx.createRadialGradient(741, 260, 5, 741, 260, 90); gl.addColorStop(0, "rgba(255,220,120,.55)"); gl.addColorStop(1, "rgba(255,220,120,0)"); ctx.fillStyle = gl; ctx.fillRect(650, 170, 150, 180); ctx.restore();
    ctx.fillStyle = "#fff2bd"; ctx.font = "bold 11px 'Press Start 2P',monospace"; ctx.textAlign = "center"; ctx.fillText("EXIT", 741, 195);
    ctx.fillStyle = "#ffe08a"; const bx = 690 + Math.sin(t * 0.008) * 5; ctx.beginPath(); ctx.moveTo(bx + 16, 260); ctx.lineTo(bx, 248); ctx.lineTo(bx, 272); ctx.fill();
  } else {
    px(722, 216, 38, 88, "#15131a");
    for (let i = 0; i < 5; i++) px(725 + i * 8, 216, 3, 88, "#6b7280");
    px(722, 250, 38, 4, "#6b7280");
    if (needKey) {                                    // padlock
      px(733, 246, 16, 14, "#d4a73c"); ctx.strokeStyle = "#d4a73c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(741, 246, 6, Math.PI, 0); ctx.stroke(); px(739, 251, 4, 5, "#2a2418");
    }
  }
}
function drawPickups(t) {
  if (!state) return;
  (state.pickups || []).forEach(pk => {
    const yy = pk.y + Math.sin(t * 0.006 + pk.x) * 3; shadow(pk.x, pk.y + 12, 9);
    heartShape(pk.x, yy, 11, "#ff5d8f"); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(pk.x - 8, yy - 9, 4, 3);
  });
  if (state.keyDrop) {
    const k = state.keyDrop, yy = k.y + Math.sin(t * 0.006) * 4;
    shadow(k.x + 8, k.y + 14, 14); keyIcon(k.x - 8, yy, 1.5);
    const ay = k.y - 40 + Math.sin(t * 0.01) * 5; ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.moveTo(k.x, ay + 12); ctx.lineTo(k.x - 9, ay); ctx.lineTo(k.x + 9, ay); ctx.fill();
    ctx.font = "bold 10px 'Press Start 2P',monospace"; ctx.textAlign = "center"; ctx.fillText("KEY", k.x, ay - 6);
  }
}

/* ------------------------------------------------------------------ main loop */
let lastTs = 0;
function draw(ts) {
  requestAnimationFrame(draw);
  try { render(ts || performance.now()); } catch (err) { if (!draw.warned) { console.error(err); draw.warned = true; } }
}
function render(t) {
  const dt = Math.min(50, t - (lastTs || t)); lastTs = t; frame++;
  const stage = state ? state.stage : 0, th = THEMES[stage];
  ctx.save();
  if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.86; } else shake = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg(stage), 0, 0);
  drawDoor(t);
  TORCHES.forEach((x, i) => {                                                        // torches
    const fl = Math.sin(t * 0.013 + i * 2) * 2 + Math.sin(t * 0.031 + i) * 1.5;
    px(x, 32, 7, 22, "#70513a"); px(x - 3, 26 + fl * 0.3, 13, 11, th.torch); px(x, 22 + fl, 6, 8, "#fff1b8");
    if (Math.random() < 0.06) parts.push({ x: x + 3 + rnd(-3, 3), y: 24, vx: rnd(-12, 12), vy: rnd(-50, -25), life: 900, max: 900, col: th.torch, size: 2.5, grav: 0 });
  });
  drawPickups(t);
  labels.length = 0;
  if (state) {
    const items = [];
    state.enemies.filter(e => e.alive).forEach(e => items.push({ y: R(e.id, e.x, e.y).y, e }));
    state.players.forEach(p => items.push({ y: R(p.id, p.x, p.y).y, p }));
    items.sort((a, b) => a.y - b.y);
    items.forEach(it => {
      if (it.e) {
        const nearest = state.players.filter(p => p.alive).sort((a, b) => Math.hypot(a.x - it.e.x, a.y - it.e.y) - Math.hypot(b.x - it.e.x, b.y - it.e.y))[0];
        drawEnemy(it.e, rp.get(it.e.id), t, nearest ? nearest.x - it.e.x : 1);
      } else drawHero(it.p, rp.get(it.p.id), t);
      if (it.p && it.p.dashing && Math.random() < 0.9) parts.push({ x: it.p.x, y: it.p.y, vx: 0, vy: 0, life: 260, max: 260, col: "#bfe9ff", size: 9, grav: 0 });
    });
    for (const id of rp.keys()) if (rp.get(id).seen < frame - 90) rp.delete(id);
  }
  for (let i = parts.length - 1; i >= 0; i--) {                                      // particles
    const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.grav * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; const s = p.size; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  for (let i = noteGlyphs.length - 1; i >= 0; i--) {
    const n = noteGlyphs[i]; n.life -= dt; if (n.life <= 0) { noteGlyphs.splice(i, 1); continue; }
    n.x += n.vx * dt / 1000; n.y += n.vy * dt / 1000 + Math.sin(t * 0.02 + i) * 0.6; n.vx *= 0.985; n.vy *= 0.985;
    ctx.globalAlpha = Math.min(1, n.life / 250); ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.7)";
    ctx.strokeText(n.g, n.x, n.y); ctx.fillStyle = n.col; ctx.fillText(n.g, n.x, n.y);
  }
  ctx.globalAlpha = 1;
  // lighting: darkness with pools of light around torches, heroes, key and the open door
  dctx.globalCompositeOperation = "source-over"; dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = `rgba(4,6,12,${th.ambient})`; dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = "destination-out";
  TORCHES.forEach((x, i) => light(dctx, x + 3, 40, 150 + Math.sin(t * 0.013 + i * 2) * 8, 0.95));
  if (state) {
    state.players.filter(p => p.alive).forEach(p => { const r = rp.get(p.id); if (r) light(dctx, r.x, r.y, 185, 0.95); });
    if (state.keyDrop) light(dctx, state.keyDrop.x, state.keyDrop.y, 130, 0.95);
    if (state.doorOpen) light(dctx, 741, 260, 150, 0.95);
    state.enemies.filter(e => e.alive && e.keeper).forEach(e => { const r = rp.get(e.id); if (r) light(dctx, r.x, r.y, 90, 0.7); });
    (state.pickups || []).forEach(pk => light(dctx, pk.x, pk.y, 60, 0.8));
  }
  ctx.drawImage(dark, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = "lighter";                              // warm torch glow
  TORCHES.forEach((x, i) => { const r = 120 + Math.sin(t * 0.013 + i * 2) * 8, gr = ctx.createRadialGradient(x + 3, 40, 4, x + 3, 40, r); gr.addColorStop(0, `rgba(${th.glow},.28)`); gr.addColorStop(1, `rgba(${th.glow},0)`); ctx.fillStyle = gr; ctx.fillRect(x - r, 0, r * 2 + 6, 40 + r); });
  ctx.restore();
  labels.forEach(l => {                                                              // name tags
    ctx.font = "bold 11px 'Space Grotesk',sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.8)";
    ctx.strokeText(l.text, l.x, l.y); ctx.fillStyle = l.col; ctx.fillText(l.text, l.x, l.y);
    if (l.me) { ctx.fillStyle = "#7fe3ff"; ctx.beginPath(); ctx.moveTo(l.x, l.y - 6); ctx.lineTo(l.x - 5, l.y - 13); ctx.lineTo(l.x + 5, l.y - 13); ctx.fill(); }
  });
  for (let i = floats.length - 1; i >= 0; i--) {                                     // floating text
    const f = floats[i]; f.life -= dt; if (f.life <= 0) { floats.splice(i, 1); continue; }
    const pr = 1 - f.life / f.max; ctx.globalAlpha = Math.min(1, f.life / 300);
    ctx.font = "bold 13px 'Press Start 2P',monospace"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(f.text, f.x, f.y - pr * 34); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y - pr * 34);
  }
  ctx.globalAlpha = 1;
  if (hurtFlash > 0.01) {                                                            // red vignette when you get hit
    const vg = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 470); vg.addColorStop(0, "rgba(255,0,0,0)"); vg.addColorStop(1, `rgba(255,30,30,${hurtFlash})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); hurtFlash *= 0.9;
  }
  if (banner && t < banner.until) {                                                  // room title card
    const a = Math.min(1, (banner.until - t) / 500, (t - banner.start) / 250);
    ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 190, W, 120);
    ctx.textAlign = "center"; ctx.fillStyle = "#f3c969"; ctx.font = "26px 'Press Start 2P',monospace"; ctx.fillText(banner.text, W / 2, 245);
    ctx.fillStyle = "#fff"; ctx.font = "14px 'Press Start 2P',monospace"; ctx.fillText(banner.sub, W / 2, 280); ctx.globalAlpha = 1;
  }
  if (state && state.waiting) {                                                      // waiting for the teammate
    ctx.fillStyle = "rgba(6,9,16,.72)"; ctx.fillRect(0, 380, W, 110);
    ctx.textAlign = "center"; ctx.fillStyle = "#f3c969"; ctx.font = "14px 'Press Start 2P',monospace"; ctx.fillText("WAITING FOR YOUR TEAMMATE", W / 2, 420);
    ctx.fillStyle = "#fff"; ctx.font = "12px 'Press Start 2P',monospace"; ctx.fillText("ROOM CODE:  " + roomCode, W / 2, 452);
    ctx.fillStyle = "#aab2c3"; ctx.font = "9px 'Press Start 2P',monospace"; ctx.fillText("MONSTERS SLEEP UNTIL THEY JOIN", W / 2, 475);
  }
  ctx.restore();
}
requestAnimationFrame(draw);
