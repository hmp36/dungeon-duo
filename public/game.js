const socket = io();
const $ = id => document.getElementById(id);
const lobby = $("lobby"), game = $("game"), canvas = $("gameCanvas"), mctx = canvas.getContext("2d");
let ctx = mctx;
const W = 800, H = 520;
let myId = null, roomCode = "", state = null, keys = {};
const roomNames = ["Forgotten Entrance", "The Crypt", "Archer Gallery", "Treasure Chamber", "Dragon of Debt"];
const RANGE = { slime: 46, skeleton: 50, bat: 40, brute: 62, archer: 30, mimic: 46, boss: 108 };
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
  bash() { noise(0.15, 0.09, 700); tone(120, 0.18, "square", 0.1, 60); },
  song() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "sine", 0.07, null, i * 0.09)); },
  guard() { tone(880, 0.12, "triangle", 0.06); tone(1175, 0.2, "triangle", 0.05, null, 0.06); },
  roar() { tone(90, 0.8, "sawtooth", 0.11, 40); noise(0.7, 0.09, 300); },
  fire() { noise(0.35, 0.08, 1200); tone(260, 0.3, "sawtooth", 0.05, 110); },
  slam() { tone(70, 0.4, "square", 0.12, 30); noise(0.3, 0.1, 250); },
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
  $("codeLabel").textContent = roomCode; $("roomLabel").textContent = "1 / 5";
  lobby.classList.add("hidden"); game.classList.remove("hidden"); showError("");
}
$("playBtn").onclick = () => { audio(); $("title").classList.add("hidden"); lobby.classList.remove("hidden"); };
$("howBtn").onclick = () => $("howto").classList.remove("hidden");
$("howClose").onclick = () => $("howto").classList.add("hidden");
let myCls = "bard";
const CLS_DESC = { bard: "Guitar smash (2 dmg). Q: riff stuns monsters in a cone. R: healing song for nearby heroes.", knight: "Wide sword slash. Q: shield bash knocks enemies back and stuns. R: guard, brief damage immunity." };
function pickCls(c) { myCls = c; document.querySelectorAll(".cls").forEach(b => b.classList.toggle("on", b.dataset.cls === c)); $("clsDesc").textContent = CLS_DESC[c]; }
document.querySelectorAll(".cls").forEach(b => b.onclick = () => pickCls(b.dataset.cls));
pickCls("bard");
$("createBtn").onclick = () => { audio(); socket.emit("createRoom", { name: $("playerName").value.trim() || "Hero", cls: myCls, daily: $("dailyChk").checked }, enterRoom); };
function loadBoard() {
  Promise.all([fetch("/api/leaderboard?daily=1").then(r => r.json()), fetch("/api/leaderboard").then(r => r.json())]).then(([d, a]) => {
    const list = (title, arr) => `<h3>${title}</h3>` + (arr.length ? "<ol>" + arr.slice(0, 5).map(b => `<li>${b.names} — ${b.score} pts (${b.time}s)</li>`).join("") + "</ol>" : '<div class="empty">No runs yet. Be the first!</div>');
    $("boardBox").innerHTML = list("TODAY'S DAILY DUNGEON", d.top) + list("ALL-TIME TOP RUNS", a.top);
  }).catch(() => {});
}
loadBoard();
$("joinBtn").onclick = () => { audio(); socket.emit("joinRoom", { name: $("playerName").value.trim() || "Hero", cls: myCls, code: $("roomCode").value }, enterRoom); };
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
    lastStage = s.stage; rp.clear(); splats.length = 0;
    banner = { text: `ROOM ${s.stage + 1}`, sub: roomNames[s.stage].toUpperCase(), start: performance.now(), until: performance.now() + 2600 };
  }
  state = s; updateHud(); checkOverlay(); updateShop(); setTrack(s.stage, s.waiting);
});
socket.on("fx", handleFx);

let lastCls = "";
function updateHud() {
  if (!state) return;
  const meP = state.players.find(p => p.id === myId);
  if (meP && meP.cls !== lastCls) { lastCls = meP.cls; $("noteBtn").textContent = meP.cls === "knight" ? "BASH" : "RIFF"; $("spBtn").textContent = meP.cls === "knight" ? "GUARD" : "HEAL"; }
  $("roomLabel").textContent = `${state.stage + 1} / 5 — ${roomNames[state.stage]}`;
  const ps = state.players;
  $("healthLabel").textContent = ps.map(p => `${p.name}: ${"❤️".repeat(p.hp)}${"🖤".repeat(Math.max(0, p.cap - p.hp))}${p.alive ? "" : " DOWN"}`).join("　");
  $("enemyLabel").textContent = `${state.enemyCount} remaining`;
  $("keyLabel").textContent = state.key ? "🗝️ Carried" : state.keyDrop ? "✨ On the floor!" : "🔒 Not found";
  $("goldLabel").textContent = "🪙 " + (state.gold || 0);
  $("soloBtn").classList.toggle("hidden", !state.waiting);
}
function checkOverlay() {
  if (!state) return;
  const rb = $("resultBox"); rb.innerHTML = "";
  if (state.finished && state.result) {
    const r = state.result, mm = Math.floor(r.time / 60), ss = String(r.time % 60).padStart(2, "0");
    $("overlayTitle").textContent = "DUNGEON CLEARED!"; $("overlayText").textContent = r.daily ? "Daily Dungeon " + r.daily : "The team made it out. Excellent teamwork!";
    rb.innerHTML = `<div class="result"><div class="big">${r.score} PTS</div><div>Time ${mm}:${ss} • Gold ${r.gold} • Kills ${r.kills} • Falls ${r.downs}</div>
      <table><tr><th>HERO</th><th>KILLS</th><th>CHESTS</th><th>REVIVES</th><th>HEARTS</th></tr>${r.players.map(p => `<tr><td>${p.cls === "knight" ? "🛡" : "🎸"} ${p.name}</td><td>${p.kills}</td><td>${p.chests}</td><td>${p.revives}</td><td>${p.hearts}</td></tr>`).join("")}</table>
      <div class="eyebrow">${r.daily ? "TODAY'S DAILY LEADERBOARD" : "TOP RUNS"}</div><ol>${r.top.map(b => `<li>${b.names} — ${b.score} pts (${b.time}s)</li>`).join("")}</ol></div>`;
    $("overlay").classList.remove("hidden");
  } else if (state.finished) { $("overlayTitle").textContent = "DUNGEON CLEARED!"; $("overlayText").textContent = ""; $("overlay").classList.remove("hidden"); }
  else if (state.gameOver) { $("overlayTitle").textContent = "TEAM DEFEATED"; $("overlayText").textContent = "Every hero has fallen. The dungeon wins this time."; $("overlay").classList.remove("hidden"); }
  else $("overlay").classList.add("hidden");
}

/* ------------------------------------------------------------------ shop */
const SHOP = [
  { id: "heal", name: "Rest & Heal", desc: "Everyone heals to full hearts.", cost: 40 },
  { id: "hp", name: "Heart Container", desc: "+1 max heart for you (max 2).", cost: 60, max: 2 },
  { id: "cd", name: "Quick Hands", desc: "Your abilities recharge 20% faster (max 3).", cost: 60, max: 3 },
  { id: "speed", name: "Fleet Boots", desc: "+8% move speed (max 3).", cost: 50, max: 3 },
  { id: "dmg", name: "Sharper Hits", desc: "+1 damage on your attacks.", cost: 120, max: 1 }
];
let shopSig = "";
function updateShop() {
  const el = $("shop");
  if (!state || !state.shop) { el.classList.add("hidden"); shopSig = ""; return; }
  const me = state.players.find(p => p.id === myId), ready = state.shop.ready.includes(myId);
  const sig = [state.gold, ready, state.shop.ready.length, state.shop.left, JSON.stringify(me && me.up)].join("|");
  if (sig === shopSig) return; shopSig = sig;
  el.innerHTML = `<h2>REST STOP</h2><div class="gold">🪙 ${state.gold} gold • auto-continue in ${state.shop.left}s</div><div class="shopgrid">` +
    SHOP.map(it => { const lv = (me && me.up[it.id]) || 0, maxed = it.max && lv >= it.max, can = state.gold >= it.cost && !maxed;
      return `<div class="item"><b>${it.name}${it.max ? ` (${lv}/${it.max})` : ""}</b><span>${it.desc}</span><button data-buy="${it.id}" ${can ? "" : "disabled"}>${maxed ? "MAXED" : "BUY — " + it.cost + " 🪙"}</button></div>`; }).join("") +
    `</div><button class="primary" data-ready="1" ${ready ? "disabled" : ""} style="padding:14px 26px">${ready ? "WAITING FOR TEAMMATE…" : "READY"}</button>`;
  el.classList.remove("hidden");
}
$("shop").addEventListener("pointerdown", e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.buy) socket.emit("buy", b.dataset.buy); else if (b.dataset.ready) socket.emit("ready");
});

/* ------------------------------------------------------------------ music */
const TRACKS = [
  { bpm: 104, root: 196, lead: [4, null, 2, null, 3, null, 1, null, 2, null, 0, null, 1, 2, null, null], bass: [0, null, 0, null, -2, null, -2, null, -3, null, -3, null, -2, null, 0, null], wave: "triangle" },
  { bpm: 84, root: 175, lead: [2, null, null, 3, null, null, 1, null, 0, null, null, 2, null, null, -1, null], bass: [0, null, null, null, -3, null, null, null, -2, null, null, null, -3, null, null, null], wave: "sine" },
  { bpm: 112, root: 208, lead: [4, 3, null, 4, 6, null, 4, null, 3, 2, null, 3, 5, null, 3, null], bass: [0, null, 2, null, 0, null, 2, null, -1, null, 1, null, -1, null, 1, null], wave: "square" },
  { bpm: 120, root: 220, lead: [5, null, 7, null, 6, 5, null, 3, 5, null, 7, 8, 7, null, 5, null], bass: [0, null, 0, 2, 0, null, 0, 2, -2, null, -2, 0, -2, null, -2, 0], wave: "triangle" },
  { bpm: 152, root: 147, lead: [4, 4, null, 5, 4, null, 2, null, 4, 4, null, 7, 6, null, 5, null], bass: [0, 0, null, 0, -3, null, -3, null, 0, 0, null, 0, -2, null, -2, null], wave: "sawtooth", drums: true }
];
const SCALE = [0, 3, 5, 7, 10];
const degFreq = (root, d) => root * Math.pow(2, SCALE[((d % 5) + 5) % 5] / 12 + Math.floor(d / 5));
let curTrack = -1, mStep = 0, mNext = 0, mTimer = null;
function setTrack(stage, waiting) {
  const want = waiting ? 1 : stage; if (want === curTrack) return; curTrack = want; mStep = 0;
}
function musicTick() {
  if (muted || !actx || curTrack < 0) return;
  const tr = TRACKS[curTrack], step = 60 / tr.bpm / 2;
  if (mNext < actx.currentTime) mNext = actx.currentTime + 0.05;
  while (mNext < actx.currentTime + 0.25) {
    const i = mStep % 16, l = tr.lead[i], b = tr.bass[i], d = mNext - actx.currentTime;
    if (l !== null && l !== undefined) tone(degFreq(tr.root * 2, l), step * 1.6, tr.wave, 0.022, null, d);
    if (b !== null && b !== undefined) tone(degFreq(tr.root / 2, b), step * 1.8, "square", 0.03, null, d);
    if (tr.drums && i % 2 === 0) noise(0.05, i % 4 === 0 ? 0.05 : 0.025, i % 4 === 0 ? 200 : 4000, d);
    else if (i % 4 === 0) noise(0.04, 0.02, 5000, d);
    mStep++; mNext += step;
  }
}
setInterval(musicTick, 80);

/* ------------------------------------------------------------------ input */
function doDash() { socket.emit("dash"); }
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (k === " ") { if (!e.repeat) socket.emit("attack"); return; }
  if (k === "shift" || k === "e") { if (!e.repeat) doDash(); return; }
  if (k === "q" || k === "f") { if (!e.repeat) socket.emit("note"); return; }
  if (k === "r") { if (!e.repeat) socket.emit("special"); return; }
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
  const sp = $("spBtn"); sp.addEventListener("pointerdown", e => { e.preventDefault(); socket.emit("special"); }); sp.addEventListener("contextmenu", e => e.preventDefault());
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
const splats = [], motes = Array.from({ length: 36 }, () => ({ x: Math.random() * 800, y: Math.random() * 520, s: Math.random() * 6.28, z: 0.4 + Math.random() })); const rings = [], parts = [], floats = [], swing = {}, noteGlyphs = [];
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
    case "kill": splats.push({ x: f.x, y: f.y + 8, col: KIND_COL[f.kind] || "#fff", kind: f.kind, r: rnd(0, 6.28) }); if (splats.length > 40) splats.shift(); burst(f.x, f.y, KIND_COL[f.kind] || "#fff", 22, 190, 650, 5, 220); burst(f.x, f.y, "#cfd3dc", 8, 90, 700, 7); shake = Math.max(shake, 7); sfx.kill(); break;
    case "hurt": burst(f.x, f.y, "#ff5a5a", 14, 170, 520, 4); shake = Math.max(shake, 11); floater(f.x, f.y - 30, "-" + f.dmg, "#ff6b6b"); if (f.id === myId) hurtFlash = 0.55; sfx.hurt(); break;
    case "heal": burst(f.x, f.y, "#ff8fb3", 10, 80, 700, 4, -80); floater(f.x, f.y - 20, "+1 HEART", "#ff9dbb"); sfx.heal(); break;
    case "keydrop": burst(f.x, f.y, "#ffd86b", 24, 160, 800, 4, -30); floater(f.x, f.y - 30, "THE KEY!", "#ffe08a"); shake = Math.max(shake, 5); sfx.keydrop(); break;
    case "key": burst(f.x, f.y, "#ffe9a0", 26, 200, 800, 4, -60); floater(f.x, f.y - 30, "KEY GET!", "#ffe08a"); sfx.key(); break;
    case "chest": burst(f.x, f.y, "#ffd86b", 20, 170, 800, 4, 160); if (f.loot === "gold") { floater(f.x, f.y - 30, "+25 GOLD", "#ffe08a"); sfx.key(); } else { floater(f.x, f.y - 30, "A HEART!", "#ff9dbb"); sfx.heal(); } shake = Math.max(shake, 4); break;
    case "door": burst(738, 262, "#ffd86b", 30, 200, 900, 4, -40); shake = Math.max(shake, 5); sfx.door(); break;
    case "notes": { sfx.notes(); const d = f.facing === "left" ? -1 : f.facing === "right" ? 1 : 0, v = f.facing === "up" ? -1 : f.facing === "down" ? 1 : 0;
      for (let i = 0; i < 9; i++) noteGlyphs.push({ x: f.x + d * 20, y: f.y - 10 + v * 20, vx: d * rnd(110, 260) + rnd(-40, 40) * (v ? 1 : 0), vy: v * rnd(110, 260) + rnd(-50, 50) * (d ? 1 : 0), life: 800, max: 800, g: ["♪", "♫", "♩"][i % 3], col: ["#ffe08a", "#7fe3ff", "#ff9dbb"][i % 3] });
      break; }
    case "bash": burst(f.x, f.y, "#dfe6ee", 14, 200, 380, 5); sfx.bash(); shake = Math.max(shake, 4); rings.push({ x: f.x + (f.facing === "right" ? 40 : f.facing === "left" ? -40 : 0), y: f.y + (f.facing === "down" ? 40 : f.facing === "up" ? -40 : 0), r: 10, max: 70, col: "223,230,238", life: 320, t0: 320 }); break;
    case "song": sfx.song(); for (let i = 0; i < 8; i++) noteGlyphs.push({ x: f.x + rnd(-30, 30), y: f.y - 10, vx: rnd(-40, 40), vy: rnd(-120, -60), life: 1000, max: 1000, g: ["♪", "♫", "♥"][i % 3], col: ["#9cffb8", "#ff9dbb", "#ffe08a"][i % 3] }); rings.push({ x: f.x, y: f.y, r: 10, max: 190, col: "156,255,184", life: 700, t0: 700 }); break;
    case "guard": sfx.guard(); rings.push({ x: f.x, y: f.y, r: 10, max: 60, col: "127,227,255", life: 400, t0: 400 }); break;
    case "blocked": floater(f.x, f.y - 34, "BLOCKED", "#9cecff"); sfx.hit(); break;
    case "mimic": burst(f.x, f.y, "#ffd86b", 22, 190, 700, 5, 150); floater(f.x, f.y - 34, "MIMIC!", "#ff8b8b"); shake = Math.max(shake, 9); sfx.hurt(); break;
    case "bossphase": shake = 20; banner = { text: f.phase === 3 ? "ENRAGED!" : "IT ROARS!", sub: "THE DRAGON OF DEBT", start: performance.now(), until: performance.now() + 1800 }; sfx.roar(); burst(f.x, f.y, "#ff8a3c", 30, 260, 800, 6, -40); break;
    case "bossfire": burst(f.x, f.y, "#ffb347", 26, 240, 500, 5); sfx.fire(); shake = Math.max(shake, 6); break;
    case "slam": rings.push({ x: f.x, y: f.y + 20, r: 20, max: 120, col: "255,120,60", life: 420, t0: 420 }); burst(f.x, f.y + 30, "#c9a27c", 20, 220, 500, 6, 160); shake = Math.max(shake, 16); sfx.slam(); break;
    case "bigshake": shake = 18; break;
    case "shopopen": sfx.stage(); break;
    case "buy": sfx.key(); break;
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
  { floorA: "#2f3340", floorB: "#2a2e3a", line: "#3d4456", speck: "#4a5268", wall: "#58617a", wallDark: "#383e52", ambient: 0.5, torch: "#9ad0ff", glow: "120,190,255" },
  { floorA: "#3b3428", floorB: "#362f24", line: "#4d4333", speck: "#5c4f38", wall: "#85734a", wallDark: "#5a4c30", ambient: 0.44, torch: "#ffd86b", glow: "255,210,100" },
  { floorA: "#3a2323", floorB: "#321e1e", line: "#4f2c2c", speck: "#6a3a30", wall: "#6b3b36", wallDark: "#3d201e", ambient: 0.58, torch: "#ff6a3c", glow: "255,100,50" }
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
    const j = rng();                                                           // per-tile tone, bevel, wear
    g.fillStyle = j < 0.5 ? `rgba(255,255,255,${0.012 + j * 0.05})` : `rgba(0,0,0,${(j - 0.5) * 0.14})`; g.fillRect(x, y, 40, 40);
    g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(x, y, 40, 1); g.fillRect(x, y, 1, 40);
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + 1, y + 1, 38, 1); g.fillRect(x + 1, y + 1, 1, 38);
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x + 1, y + 38, 38, 2); g.fillRect(x + 38, y + 1, 2, 38);
    if (rng() < 0.3) { g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x + 4 + (rng() * 24 | 0), y + 4 + (rng() * 24 | 0), 6 + (rng() * 8 | 0), 2); }
    if (rng() < 0.12) { g.fillStyle = stage === 1 ? "rgba(90,150,90,.28)" : "rgba(255,255,255,.05)"; for (let k = 0; k < 6; k++) g.fillRect(x + 3 + (rng() * 32 | 0), y + 3 + (rng() * 32 | 0), 2 + (rng() * 3 | 0), 2); }
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
  } else if (stage === 2) {                            // archer gallery: pillars, banners, target dummies
    for (const px0 of [200, 400, 600]) for (const py0 of [150, 370]) {
      g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(px0, py0 + 26, 26, 9, 0, 0, 6.283); g.fill();
      g.fillStyle = "#4a5268"; g.fillRect(px0 - 16, py0 - 24, 32, 52); g.fillStyle = "#66708a"; g.fillRect(px0 - 16, py0 - 24, 32, 6); g.fillRect(px0 - 20, py0 + 22, 40, 8); g.fillStyle = "#3a4158"; g.fillRect(px0 + 6, py0 - 18, 8, 44);
    }
    for (const bx of [110, 690]) { g.fillStyle = "#7a2230"; g.fillRect(bx, 56, 30, 54); g.fillStyle = "#c9a24d"; g.fillRect(bx, 56, 30, 4); g.beginPath(); g.moveTo(bx, 110); g.lineTo(bx + 15, 98); g.lineTo(bx + 30, 110); g.fill(); }
    g.strokeStyle = "rgba(180,200,255,.15)"; g.lineWidth = 2; for (let x = 60; x < 740; x += 80) { g.beginPath(); g.moveTo(x, 90); g.lineTo(x, 500); g.stroke(); }
  } else if (stage === 4) {                            // dragon's lair: cracked lava floor and a gold hoard
    g.strokeStyle = "rgba(255,110,40,.8)"; g.lineWidth = 3;
    for (let i = 0; i < 10; i++) { let x = 40 + rng() * 720, y = 90 + rng() * 400; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rng() - .5) * 60; y += (rng() - .5) * 50; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = "rgba(255,200,90,.5)"; g.lineWidth = 1.5; for (let i = 0; i < 10; i++) { let x = 40 + rng() * 720, y = 90 + rng() * 400; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - .5) * 50; y += (rng() - .5) * 40; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 90; i++) { const gx = 560 + rng() * 190, gy = 70 + rng() * 40; g.fillStyle = rng() < .5 ? "#e0b13c" : "#ffd96b"; g.fillRect(gx, gy, 6, 3); }
    for (let i = 0; i < 6; i++) skull(g, 70 + rng() * 660, 120 + rng() * 360);
    g.fillStyle = "rgba(255,90,30,.12)"; g.beginPath(); g.arc(560, 250, 190, 0, 6.283); g.fill();
  } else {                                             // treasure chamber: gold inlay, chests, coins
    g.strokeStyle = "rgba(243,201,105,.45)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(400, 120); g.lineTo(580, 260); g.lineTo(400, 400); g.lineTo(220, 260); g.closePath(); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(400, 160); g.lineTo(530, 260); g.lineTo(400, 360); g.lineTo(270, 260); g.closePath(); g.stroke();
    g.fillStyle = "rgba(243,201,105,.18)"; g.beginPath(); g.arc(400, 260, 34, 0, 6.283); g.fill();
  }
  bricks(g, 0, 0, W, 54, th);                          // top wall
  bricks(g, 0, 54, 18, H - 54, th); bricks(g, W - 18, 54, 18, H - 54, th); bricks(g, 0, H - 18, W, 18, th);
  g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(0, 46, W, 8); g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(0, 54, W, 1);   // wall ledge
  { const a1 = g.createLinearGradient(18, 0, 70, 0); a1.addColorStop(0, "rgba(0,0,0,.45)"); a1.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = a1; g.fillRect(18, 54, 52, H - 72);
    const a2 = g.createLinearGradient(W - 18, 0, W - 70, 0); a2.addColorStop(0, "rgba(0,0,0,.45)"); a2.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = a2; g.fillRect(W - 70, 54, 52, H - 72);
    const a3 = g.createLinearGradient(0, H - 18, 0, H - 64); a3.addColorStop(0, "rgba(0,0,0,.5)"); a3.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = a3; g.fillRect(18, H - 64, W - 36, 46); }
  const sh = g.createLinearGradient(0, 54, 0, 84); sh.addColorStop(0, "rgba(0,0,0,.5)"); sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh; g.fillRect(18, 54, W - 36, 30);
  return c;
}
const bgCache = {};
const bg = s => bgCache[s] || (bgCache[s] = buildBg(s));
const bl = document.createElement("canvas"); bl.width = 200; bl.height = 130; const bctx = bl.getContext("2d");
const dark = document.createElement("canvas"); dark.width = W; dark.height = H; const dctx = dark.getContext("2d");
function light(g, x, y, r, s) { const gr = g.createRadialGradient(x, y, r * 0.08, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${s})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }

/* ------------------------------------------------------------------ sprites */
const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
/* Sprite layer: each character is drawn to an offscreen canvas, then given a top-light/bottom-shade
   gradient and a dark outline before it lands on the scene. That is what gives it the 16-bit look. */
const SPS = 260, spr = document.createElement("canvas"), sil = document.createElement("canvas");
spr.width = spr.height = sil.width = sil.height = SPS;
const sctx = spr.getContext("2d"), ictx = sil.getContext("2d");
let spriteOn = false, spX = 0, spY = 0, spA = 1;
function beginSprite(x, y) { ctx = sctx; sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.clearRect(0, 0, SPS, SPS); sctx.translate(SPS / 2 - x, SPS / 2 - y); spX = x; spY = y; spriteOn = true; }
function endSprite(scale = 1, alpha = 1, h = 36) {
  spriteOn = false; ctx = mctx; sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = "source-atop";
  const c = SPS / 2, gr = sctx.createLinearGradient(0, c - h, 0, c + h * 0.7);
  gr.addColorStop(0, "rgba(255,255,255,.22)"); gr.addColorStop(0.45, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(8,6,36,.38)");
  sctx.fillStyle = gr; sctx.fillRect(0, 0, SPS, SPS);
  const gx = sctx.createLinearGradient(c - h, 0, c + h, 0); gx.addColorStop(0, "rgba(255,255,255,.1)"); gx.addColorStop(0.6, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,30,.18)");
  sctx.fillStyle = gx; sctx.fillRect(0, 0, SPS, SPS); sctx.globalCompositeOperation = "source-over";
  ictx.globalCompositeOperation = "source-over"; ictx.clearRect(0, 0, SPS, SPS); ictx.drawImage(spr, 0, 0);
  ictx.globalCompositeOperation = "source-in"; ictx.fillStyle = "#0c0a14"; ictx.fillRect(0, 0, SPS, SPS);
  mctx.save(); mctx.globalAlpha = alpha * spA; mctx.translate(spX, spY + 16); mctx.scale(scale, scale); mctx.translate(-spX, -(spY + 16));
  const ox = spX - SPS / 2, oy = spY - SPS / 2;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) mctx.drawImage(sil, ox + dx, oy + dy);
  mctx.drawImage(spr, ox, oy); mctx.restore(); spA = 1;
}
function shadow(x, y, w) { const ctx = mctx; ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.38, 0, 0, 6.283); ctx.fill(); }
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
let guardFx = false;
function drawHero(p, r, t) {
  guardFx = false;
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
  beginSprite(x, y); if (blink) spA = 0.5;
  if (r.moving && frame % 7 === 0 && p.alive) parts.push({ x: x + rnd(-6, 6), y: y + 16, vx: rnd(-14, 14), vy: rnd(-18, -6), life: 380, max: 380, col: "#9a9fb0", size: 3.5, grav: 0 });
  const bob = r.moving ? -Math.abs(Math.sin(t * 0.018)) * 3 : Math.sin(t * 0.005 + (p.slot || 0)) * -1;
  const step = r.moving ? Math.sin(t * 0.02) * 4 : 0;
  if (p.dashing) px(x - 14, y - 22, 28, 34, "#bfe9ff88");
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

  if (p.cls === "knight") {                              // steel helm with plume
    const hb2 = Math.round(bob), ph = r.moving ? Math.sin(t * 0.02) * 2 : Math.sin(t * 0.006);
    px(x - 9, y - 30 + hb2, 18, 15, "#aeb8c8"); px(x - 9, y - 30 + hb2, 18, 3, "#dfe6ee"); px(x - 9, y - 18 + hb2, 18, 3, "#7d8799");
    px(x - 7, y - 21 + hb2, 14, 4, "#1c2230"); px(x - 1, y - 30 + hb2, 2, 12, "#7d8799");
    ctx.fillStyle = pal.tunic; ctx.beginPath(); ctx.moveTo(x - 2, y - 30 + hb2); ctx.quadraticCurveTo(x - 4 + ph, y - 46 + hb2, x + 8 + ph, y - 40 + hb2); ctx.quadraticCurveTo(x + 2, y - 34 + hb2, x + 3, y - 30 + hb2); ctx.fill();
  } else {
  // troubadour hat: wide brim, tall crown, band and a long feather
  const hc = pal.cape, hd = pal.dark, hb = Math.round(bob);
  px(x - 14, y - 26 + hb, 28, 4, hd); px(x - 16, y - 24 + hb, 8, 3, hd); px(x + 8, y - 24 + hb, 8, 3, hd);          // brim
  px(x - 9, y - 35 + hb, 18, 11, hc); px(x - 6, y - 38 + hb, 12, 4, hc); px(x - 9, y - 28 + hb, 18, 3, "#e8c452");   // crown + gold band
  px(x - 9, y - 35 + hb, 18, 2, "#ffffff22");
  const fd = p.facing === "left" ? -1 : 1, fw = r.moving ? Math.sin(t * 0.02) * 2 : Math.sin(t * 0.006);
  ctx.strokeStyle = "#e8402f"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x + fd * 6, y - 30 + hb); ctx.quadraticCurveTo(x + fd * 20, y - 48 + hb + fw, x + fd * 28, y - 38 + hb + fw); ctx.stroke();
  ctx.strokeStyle = "#ffd0a8"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + fd * 6, y - 30 + hb); ctx.quadraticCurveTo(x + fd * 20, y - 48 + hb + fw, x + fd * 28, y - 38 + hb + fw); ctx.stroke();
  }
  const ang = ANG[p.facing] || 0, age = t - (swing[p.id] || -9999), swinging = age < 260;
  if (p.cls === "knight") {
    const guard = p.guard, bashing = p.playing;
    ctx.save(); ctx.translate(x, y - 2 + bob); ctx.rotate(ang + (swinging ? -1.35 + (age / 260) * 2.7 : bashing ? -0.1 : 0.85));
    px(2, -1.5, 6, 3, "#6b4a2a"); px(7, -5, 4, 10, "#e8c452"); px(11, -3, 30, 6, "#dfe6ee"); px(11, -3, 30, 2, "#ffffff"); px(41, -2, 4, 4, "#ffffff");
    ctx.restore();
    const sd = p.facing === "left" ? 1 : -1;                                           // shield on the off side
    ctx.save(); ctx.translate(x + sd * (bashing ? -4 : 13), y + 2 + bob);
    ctx.fillStyle = guard ? "#7fe3ff" : pal.dark; ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(8, -9); ctx.lineTo(8, 3); ctx.lineTo(0, 12); ctx.lineTo(-8, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = guard ? "#dff7ff" : "#e8c452"; ctx.fillRect(-1, -7, 2, 15); ctx.fillRect(-5, -2, 10, 2);
    ctx.restore();
    guardFx = guard;
  } else {
  const playing = p.playing; ctx.save(); ctx.translate(x, y - 2 + bob);
  if (playing) { ctx.rotate(ang * 0 + (p.facing === "left" ? 0.25 : -0.25) + Math.sin(t * 0.04) * 0.08); }
  else ctx.rotate(ang + (swinging ? -1.25 + (age / 260) * 2.5 : 0.85));
  const gx = playing ? (p.facing === "left" ? -8 : 8) : 0, gd = playing && p.facing === "left" ? -1 : 1;
  ctx.translate(gx, playing ? 4 : 0); ctx.scale(playing ? gd : 1, 1);
  px(2, -2, 22, 4, "#6b4a2a"); px(24, -4, 7, 8, "#3a2814"); px(26, -6, 2, 2, "#ddd"); px(29, -6, 2, 2, "#ddd");   // neck + headstock
  px(-6, -9, 14, 18, "#c0562b"); px(-10, -6, 8, 12, "#c0562b"); px(-3, -9, 8, 3, "#e9824f"); px(-1, -3, 6, 6, "#2a1a10"); px(3, -1, 8, 2, "#e8dcc0");
  ctx.restore();
  }
  endSprite(1 + Math.sin(t * 0.004 + (p.slot || 0)) * 0.012, 1, 42);
  if (guardFx) {
  { ctx.strokeStyle = "rgba(127,227,255,.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 4, 30 + Math.sin(t * 0.02) * 2, 0, 6.283); ctx.stroke(); ctx.fillStyle = "rgba(127,227,255,.12)"; ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (swinging) {                                                                    // big slash arc
    const pr = age / 260;
    ctx.save(); ctx.translate(x, y - 2); ctx.rotate(ang); ctx.lineCap = "round";
    ctx.globalAlpha = (1 - pr) * 0.95; ctx.strokeStyle = "#fff7c2"; ctx.lineWidth = 16 * (1 - pr * 0.5);
    ctx.beginPath(); ctx.arc(0, 0, 66, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = "rgba(255,190,70,.9)"; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 76, -1.0, 1.0); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (me) { px(x - 14, y + 22, 28, 4, "#0c0e14"); px(x - 13, y + 23, 12 * (1 - p.noteCd), 2, p.noteCd > 0 ? "#6b7280" : "#7fe3ff"); px(x + 1, y + 23, 12 * (1 - p.specialCd), 2, p.specialCd > 0 ? "#6b7280" : "#b48cff"); }
  labels.push({ x, y: y - 56 + bob, text: p.name, col: me ? "#7fe3ff" : "#ffe08a", me });
}
function tint(base, e, t) { return e.hurt ? "#ffffff" : (e.winding && Math.floor(t / 70) % 2 === 0) ? "#ff6a5a" : base; }
function drawEnemy(e, r, t, faceX) {
  const x = Math.round(r.x), y = Math.round(r.y), ph = (e.id.length * 1.7) % 6, dir = faceX >= 0 ? 1 : -1;
  if (e.keeper) { const gl = ctx.createRadialGradient(x, y, 4, x, y, 52); gl.addColorStop(0, "rgba(255,216,107,.55)"); gl.addColorStop(1, "rgba(255,216,107,0)"); ctx.fillStyle = gl; ctx.fillRect(x - 55, y - 55, 110, 110); }
  beginSprite(x, y); if (e.dormant) spA = 0.6;
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
  } else if (e.kind === "archer") {
    shadow(x, y + 16, 13);
    const sw = Math.sin(t * 0.012 + ph) * 2;
    px(x - 7, y + 6, 5, 10 + sw, tint("#3b4a2a", e, t)); px(x + 2, y + 6, 5, 10 - sw, tint("#3b4a2a", e, t));
    px(x - 9, y - 9, 18, 16, tint("#4f7a3a", e, t)); px(x - 9, y + 3, 18, 3, "#5a3d1f");
    px(x - 8, y - 23, 16, 15, tint("#3f6330", e, t)); px(x - 6, y - 20, 12, 10, "#f0c79b"); px(x - 4 + dir, y - 17, 3, 3, "#222"); px(x + 2 + dir, y - 17, 3, 3, "#222");
    px(x - 9, y - 26, 18, 5, tint("#2f4d24", e, t));
    ctx.save(); ctx.translate(x + dir * 14, y - 2); ctx.strokeStyle = "#8b5a2b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 15, -1.2 + (dir < 0 ? Math.PI : 0), 1.2 + (dir < 0 ? Math.PI : 0)); ctx.stroke();
    ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.beginPath(); const bx = dir * (e.winding ? -4 : 3); ctx.moveTo(dir * 6, -13); ctx.lineTo(bx, 0); ctx.lineTo(dir * 6, 13); ctx.stroke();
    if (e.winding) { ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(dir * 20, 0); ctx.stroke(); }
    ctx.restore();
  } else if (e.kind === "mimic") {
    shadow(x, y + 18, 20);
    const bounce = Math.abs(Math.sin(t * 0.02 + ph)) * 4, open = Math.abs(Math.sin(t * 0.012 + ph)) * 9;
    px(x - 17, y + 8, 6, 8, "#4a2f18"); px(x + 11, y + 8, 6, 8, "#4a2f18");
    px(x - 20, y - 4 - bounce, 40, 20, tint("#6b4423", e, t)); px(x - 21, y - 2 - bounce, 42, 4, tint("#d4a73c", e, t));
    px(x - 20, y - 18 - bounce - open, 40, 14, tint("#85562c", e, t)); px(x - 21, y - 8 - bounce - open, 42, 3, tint("#d4a73c", e, t));
    ctx.fillStyle = "#7a1d1d"; ctx.fillRect(x - 17, y - 5 - bounce - open * 0.5, 34, 4 + open * 0.6);
    ctx.fillStyle = "#fff"; for (let i = 0; i < 5; i++) { ctx.fillRect(x - 15 + i * 7, y - 5 - bounce - open * 0.5, 3, 4); ctx.fillRect(x - 12 + i * 7, y - 1 - bounce, 3, 3); }
    px(x - 9, y - 14 - bounce - open, 5, 5, "#ffe58a"); px(x + 4, y - 14 - bounce - open, 5, 5, "#ffe58a"); px(x - 7 + dir, y - 13 - bounce - open, 2, 3, "#222"); px(x + 6 + dir, y - 13 - bounce - open, 2, 3, "#222");
  } else if (e.kind === "boss") {
    const enr = e.phase === 3, pulse = Math.sin(t * 0.01) * 3, flap = Math.sin(t * 0.006) * 10;
    shadow(x, y + 62, 72);
    ctx.fillStyle = tint(enr ? "#7a1f16" : "#7c2a22", e, t);
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sd * 20, y - 20); ctx.lineTo(x + sd * 80, y - 70 - flap); ctx.lineTo(x + sd * 72, y - 22); ctx.lineTo(x + sd * 82, y - 6); ctx.lineTo(x + sd * 50, y + 6); ctx.lineTo(x + sd * 30, y + 6); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = "#4a1812"; ctx.lineWidth = 2; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sd * 24, y - 18); ctx.lineTo(x + sd * 78, y - 66 - flap); ctx.moveTo(x + sd * 40, y - 8); ctx.lineTo(x + sd * 74, y - 24); ctx.stroke(); }
    px(x - dir * 52, y + 24, 36, 12, tint("#962f25", e, t)); px(x - dir * 70, y + 20, 22, 8, tint("#962f25", e, t)); px(x - dir * 82, y + 14, 14, 8, tint("#ff8a3c", e, t));
    px(x - 34, y + 28, 18, 32, tint("#7f2a21", e, t)); px(x + 16, y + 28, 18, 32, tint("#7f2a21", e, t)); px(x - 38, y + 56, 24, 8, "#3a1914"); px(x + 12, y + 56, 24, 8, "#3a1914");
    ctx.fillStyle = tint(enr ? "#c4412c" : "#a8362a", e, t); ctx.beginPath(); ctx.ellipse(x, y + 6, 46, 40, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = tint("#e4b46c", e, t); ctx.beginPath(); ctx.ellipse(x + dir * 6, y + 14, 28, 28, 0, 0, 6.283); ctx.fill();
    for (let i = 0; i < 5; i++) px(x - 16 + i * 8, y + 2 + i % 2 * 2, 4, 3, "rgba(120,70,30,.5)");
    for (let i = -2; i <= 2; i++) { ctx.fillStyle = "#4a1812"; ctx.beginPath(); ctx.moveTo(x + i * 14 - 5, y - 32); ctx.lineTo(x + i * 14, y - 44 + Math.abs(i) * 2); ctx.lineTo(x + i * 14 + 5, y - 32); ctx.fill(); }
    const hx = x + dir * 40, hy = y - 30 + pulse * 0.3;
    ctx.fillStyle = tint("#b53b2d", e, t); ctx.beginPath(); ctx.ellipse(hx, hy, 28, 22, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = tint("#9c3024", e, t); ctx.beginPath(); ctx.ellipse(hx + dir * 20, hy + 6, 18, 12, 0, 0, 6.283); ctx.fill();
    px(hx - 14, hy - 30, 6, 16, "#e8dcc0"); px(hx + 8, hy - 30, 6, 16, "#e8dcc0"); px(hx - 16, hy - 36, 4, 8, "#e8dcc0"); px(hx + 12, hy - 36, 4, 8, "#e8dcc0");
    px(hx - 8 + dir * 6, hy - 8, 9, 8, enr ? "#fff27a" : "#ffe08a"); px(hx + 6 + dir * 6, hy - 8, 9, 8, enr ? "#fff27a" : "#ffe08a"); px(hx - 4 + dir * 8, hy - 6, 3, 5, "#2a0a08"); px(hx + 10 + dir * 8, hy - 6, 3, 5, "#2a0a08");
    px(hx + dir * 28 - 3, hy + 2, 6, 4, "#2a0a08");
    for (let i = 0; i < 3; i++) px(hx + dir * (14 + i * 6) - 1, hy + 12, 3, 5, "#fff");
    if (e.winding) { const fg = ctx.createRadialGradient(hx + dir * 36, hy + 8, 2, hx + dir * 36, hy + 8, 34); fg.addColorStop(0, "rgba(255,230,120,.95)"); fg.addColorStop(1, "rgba(255,90,30,0)"); ctx.fillStyle = fg; ctx.fillRect(hx + dir * 36 - 34, hy - 26, 68, 68); }
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
  endSprite(e.winding ? 1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.03)) : 1 + Math.sin(t * 0.006 + ph) * 0.015, 1, e.kind === "boss" ? 84 : e.kind === "brute" ? 52 : 36);
  const top = e.kind === "boss" ? 96 : e.kind === "brute" ? 54 : e.kind === "bat" ? 30 : e.kind === "mimic" ? 30 : 34;
  if (e.keeper) { keyIcon(x - 10, y - top - 8 + Math.sin(t * 0.006) * 3, 0.9); }
  if (e.dormant) { ctx.fillStyle = "#cfe3ff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("z", x + 12, y - top + Math.sin(t * 0.004) * 3); ctx.fillText("Z", x + 20, y - top - 8 + Math.sin(t * 0.004 + 1) * 3); }
  if ((e.hp < e.maxHp || e.kind === "brute") && e.kind !== "boss") {
    const bw = e.kind === "brute" ? 44 : 30, by = y - top - (e.keeper ? 22 : 8);
    px(x - bw / 2 - 1, by - 1, bw + 2, 6, "#0c0e14"); px(x - bw / 2, by, bw, 4, "#3a1f26"); px(x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 4, "#e66c75");
  }
  if (e.stunned && !e.dormant) { for (let i = 0; i < 3; i++) { const a = t * 0.008 + i * 2.09; ctx.fillStyle = "#ffe08a"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("★", x + Math.cos(a) * 16, y - top - 6 + Math.sin(a) * 4); } }
  if (e.winding && e.kind === "archer" && state) { const tg = state.players.filter(p => p.alive).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; if (tg) { ctx.save(); ctx.strokeStyle = "rgba(255,90,90,.55)"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tg.x, tg.y); ctx.stroke(); ctx.restore(); } }
  if (e.winding && e.kind !== "archer") {                                      // attack warning: pulsing ring + !
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
function drawChest(c, t, near) {
  const x = c.x, y = c.y; shadow(x, y + 18, 22);
  if (!c.open) {
    chest(ctx, x, y);
    if (near) { ctx.fillStyle = "#ffe08a"; ctx.font = "bold 9px 'Press Start 2P',monospace"; ctx.textAlign = "center"; ctx.fillText("SMASH!", x, y - 24 + Math.sin(t * 0.01) * 2); }
  } else {
    px(x - 20, y - 4, 40, 22, "#6b4423"); px(x - 21, y - 6, 42, 4, "#d4a73c"); px(x - 17, y - 2, 34, 6, "#1a1208");
    px(x - 20, y - 24, 40, 10, "#85562c"); px(x - 21, y - 16, 42, 3, "#d4a73c");
  }
}
function drawPickups(t) {
  if (!state) return;
  const me = state.players.find(p => p.id === myId);
  (state.chests || []).forEach(c => drawChest(c, t, me && me.alive && Math.hypot(me.x - c.x, me.y - c.y) < 90));
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
let lastTs = 0, avgDt = 16, lowFx = false;
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
  splats.forEach(sp => {                                                             // remains of defeated monsters
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.globalAlpha = 0.5; ctx.fillStyle = sp.kind === "slime" ? "#3c8a4a" : sp.kind === "bat" ? "#3c2358" : sp.kind === "brute" ? "#6b2a22" : "#cfc8b4";
    if (sp.kind === "skeleton") { ctx.rotate(sp.r); ctx.fillRect(-9, -1.5, 18, 3); ctx.rotate(1.2); ctx.fillRect(-7, -1.5, 14, 3); ctx.fillRect(-3, -9, 7, 6); }
    else { ctx.scale(1, 0.45); ctx.beginPath(); ctx.arc(0, 0, sp.kind === "brute" ? 20 : 13, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(11, 5, 5, 0, 6.28); ctx.arc(-10, -4, 4, 0, 6.28); ctx.fill(); }
    ctx.restore();
  });
  ctx.globalAlpha = 1;
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
  if (state) (state.shots || []).forEach(sh => {                                      // arrows and fireballs
    ctx.save(); ctx.translate(sh.x, sh.y);
    if (sh.k === "fire") { const fg = ctx.createRadialGradient(0, 0, 1, 0, 0, 16); fg.addColorStop(0, "#fff3b0"); fg.addColorStop(0.4, "#ff9a3c"); fg.addColorStop(1, "rgba(255,60,20,0)"); ctx.fillStyle = fg; ctx.fillRect(-16, -16, 32, 32); if (Math.random() < 0.5) parts.push({ x: sh.x, y: sh.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: 300, max: 300, col: "#ff8a3c", size: 4, grav: 0 }); }
    else { ctx.rotate(sh.a); ctx.fillStyle = "#cfa86a"; ctx.fillRect(-10, -1, 18, 2); ctx.fillStyle = "#e8eef5"; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(6, -4); ctx.lineTo(6, 4); ctx.fill(); ctx.fillStyle = "#e8402f"; ctx.fillRect(-12, -3, 4, 2); ctx.fillRect(-12, 1, 4, 2); }
    ctx.restore();
  });
  for (let i = parts.length - 1; i >= 0; i--) {                                      // particles
    const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.grav * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; const s = p.size; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  for (let i = rings.length - 1; i >= 0; i--) {
    const rg = rings[i]; rg.life -= dt; if (rg.life <= 0) { rings.splice(i, 1); continue; }
    const pr = 1 - rg.life / rg.t0, rad = rg.r + (rg.max - rg.r) * pr;
    ctx.strokeStyle = `rgba(${rg.col},${1 - pr})`; ctx.lineWidth = 6 * (1 - pr) + 1; ctx.beginPath(); ctx.arc(rg.x, rg.y, rad, 0, 6.283); ctx.stroke();
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
    (state.shots || []).forEach(sh => { if (sh.k === "fire") light(dctx, sh.x, sh.y, 70, 0.8); });
    state.enemies.filter(e => e.kind === "boss").forEach(e => { const r = rp.get(e.id); if (r) light(dctx, r.x, r.y, 190, 0.8); });
  }
  ctx.drawImage(dark, 0, 0);
  const mc = ["255,190,110", "140,255,190", "170,210,255", "255,225,130", "255,120,60"][stage];                  // drifting dust / embers / sparkles
  motes.forEach(m => {
    m.s += 0.01 * m.z; m.x += Math.sin(m.s) * 0.25 * m.z + 0.12; m.y -= 0.18 * m.z; if (m.y < 60) { m.y = H - 20; m.x = Math.random() * W; } if (m.x > W) m.x = 0;
    ctx.fillStyle = `rgba(${mc},${0.25 + 0.3 * Math.abs(Math.sin(m.s * 2))})`; ctx.fillRect(m.x, m.y, m.z * 2.2, m.z * 2.2);
  });
  { const vg2 = ctx.createRadialGradient(W / 2, H / 2, 230, W / 2, H / 2, 520); vg2.addColorStop(0, "rgba(0,0,0,0)"); vg2.addColorStop(1, "rgba(0,0,0,.55)"); ctx.fillStyle = vg2; ctx.fillRect(0, 0, W, H); }
  ctx.save(); ctx.globalCompositeOperation = "lighter";                              // warm torch glow
  TORCHES.forEach((x, i) => { const r = 120 + Math.sin(t * 0.013 + i * 2) * 8, gr = ctx.createRadialGradient(x + 3, 40, 4, x + 3, 40, r); gr.addColorStop(0, `rgba(${th.glow},.28)`); gr.addColorStop(1, `rgba(${th.glow},0)`); ctx.fillStyle = gr; ctx.fillRect(x - r, 0, r * 2 + 6, 40 + r); });
  ctx.restore();
  { const fx0 = (t * 0.012) % (W + 400) - 200;                                   // slow drifting fog
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) { const fx = ((fx0 + i * 330) % (W + 400)) - 200, fy = 150 + i * 120 + Math.sin(t * 0.0004 + i) * 30; const fg = ctx.createRadialGradient(fx, fy, 10, fx, fy, 220); fg.addColorStop(0, `rgba(${th.glow},.045)`); fg.addColorStop(1, `rgba(${th.glow},0)`); ctx.fillStyle = fg; ctx.fillRect(fx - 220, fy - 220, 440, 440); }
    ctx.restore(); }
  avgDt = avgDt * 0.95 + dt * 0.05; if (frame > 120 && avgDt > 26) lowFx = true;
  if (!lowFx) try {                                                                  // cheap bloom: bright areas glow
    bctx.clearRect(0, 0, 200, 130); bctx.filter = "brightness(1.15) contrast(1.9) blur(1.5px)"; bctx.drawImage(canvas, 0, 0, 200, 130); bctx.filter = "none";
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5; ctx.imageSmoothingEnabled = true; ctx.drawImage(bl, 0, 0, W, H); ctx.restore();
  } catch (e) {}
  ctx.save(); ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.28; ctx.fillStyle = `rgb(${["255,190,120", "110,230,170", "140,180,255", "255,210,110", "255,90,50"][stage]})`; ctx.fillRect(0, 0, W, H); ctx.restore();   // colour grade
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
  if (state) { const bs = state.enemies.find(e => e.kind === "boss");
    if (bs) { const bw = 420, bx = (W - bw) / 2; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(bx - 4, 62, bw + 8, 24); ctx.fillStyle = "#3a1f26"; ctx.fillRect(bx, 66, bw, 12); ctx.fillStyle = bs.phase === 3 ? "#ff6a3c" : "#e66c75"; ctx.fillRect(bx, 66, bw * Math.max(0, bs.hp / bs.maxHp), 12);
      ctx.fillStyle = "#fff"; ctx.font = "8px 'Press Start 2P',monospace"; ctx.textAlign = "center"; ctx.fillText("DRAGON OF DEBT", W / 2, 96); } }
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
