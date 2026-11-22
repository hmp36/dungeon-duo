const socket = io();
const $ = id => document.getElementById(id);
const lobby = $("lobby"), game = $("game"), canvas = $("gameCanvas"); let mctx = canvas.getContext("2d");
let ctx = mctx;
const W = 800, H = 520, DPR = 2; canvas.width = W * DPR; canvas.height = H * DPR;
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
const fsEl = $("game"), fsOk = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
function toggleFs() {
  const on = document.fullscreenElement || document.webkitFullscreenElement;
  if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
}
if (!fsOk) $("fsBtn").classList.add("hidden"); else $("fsBtn").onclick = toggleFs;
function fsLabel() { $("fsBtn").textContent = (document.fullscreenElement || document.webkitFullscreenElement) ? "EXIT FULLSCREEN" : "FULLSCREEN"; }
document.addEventListener("fullscreenchange", fsLabel); document.addEventListener("webkitfullscreenchange", fsLabel);

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
let myDiff = "normal";
const DIFF_DESC = { easy: "7 hearts to start, monsters have about 30% less health. Score x0.8.", normal: "5 hearts to start. The intended challenge.", hard: "4 hearts to start, monsters have about 35% more health. Score x1.25." };
function pickDiff(d) { myDiff = d; document.querySelectorAll(".dbtn").forEach(b => b.classList.toggle("on", b.dataset.d === d)); $("diffDesc").textContent = DIFF_DESC[d]; }
document.querySelectorAll(".dbtn").forEach(b => b.onclick = () => pickDiff(b.dataset.d));
pickDiff("normal");
$("createBtn").onclick = () => { audio(); socket.emit("createRoom", { name: $("playerName").value.trim() || "Hero", cls: myCls, daily: $("dailyChk").checked, diff: myDiff }, enterRoom); };
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
let iVoted = false;
$("rematchBtn").onclick = () => { iVoted = true; $("rematchBtn").disabled = true; socket.emit("rematch"); };
const canPause = () => state && !state.waiting && !state.finished && !state.gameOver && !state.shop && !game.classList.contains("hidden");
function togglePause() { if (canPause()) socket.emit("pause"); }
$("pauseBtn").onclick = togglePause; $("resumeBtn").onclick = togglePause;
$("soloBtn").onclick = () => socket.emit("startSolo");
// Free hosting naps when idle, so the first connection can take a while. Say so instead of looking broken.
const connEl = $("conn"); let connTimer = null, everConnected = false;
function setNetUi(ok) {
  $("createBtn").disabled = !ok; $("joinBtn").disabled = !ok;
  clearTimeout(connTimer);
  if (ok) { connEl.classList.add("hidden"); return; }
  connTimer = setTimeout(() => {
    connEl.textContent = everConnected ? "Connection lost. Reconnecting..." : "Waking the dungeon... the server naps when idle, so this can take up to a minute.";
    connEl.classList.remove("hidden");
  }, everConnected ? 600 : 1200);
}
setNetUi(false);
socket.on("connect", () => { everConnected = true; setNetUi(true); });
socket.on("disconnect", () => setNetUi(false));
socket.on("connect_error", () => setNetUi(false));
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
  state = s; updateHud(); checkOverlay(); updateShop(); renderGear(); setTrack(s.stage, s.waiting);
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
    rb.innerHTML = `<div class="result"><div class="big">${r.score} PTS</div><div>${r.diff && r.diff !== "Normal" ? r.diff + " • " : ""}Time ${mm}:${ss} • Gold ${r.gold} • Kills ${r.kills} • Falls ${r.downs}</div>
      <table><tr><th>HERO</th><th>KILLS</th><th>CHESTS</th><th>REVIVES</th><th>HEARTS</th></tr>${r.players.map(p => `<tr><td>${p.cls === "knight" ? "🛡" : "🎸"} ${p.name}</td><td>${p.kills}</td><td>${p.chests}</td><td>${p.revives}</td><td>${p.hearts}</td></tr>`).join("")}</table>
      <div class="eyebrow">${r.daily ? "TODAY'S DAILY LEADERBOARD" : "TOP RUNS"}</div><ol>${r.top.map(b => `<li>${b.names} — ${b.score} pts (${b.time}s)</li>`).join("")}</ol></div>`;
    $("overlay").classList.remove("hidden");
  } else if (state.finished) { $("overlayTitle").textContent = "DUNGEON CLEARED!"; $("overlayText").textContent = ""; $("overlay").classList.remove("hidden"); }
  else if (state.gameOver) { $("overlayTitle").textContent = "TEAM DEFEATED"; $("overlayText").textContent = "Every hero has fallen. The dungeon wins this time."; $("overlay").classList.remove("hidden"); }
  else $("overlay").classList.add("hidden");
  // play again: shows who is ready; re-arms itself once the new run starts
  const ended = state.finished || state.gameOver, rb2 = $("rematchBtn");
  if (ended) {
    rb2.disabled = iVoted;
    rb2.textContent = iVoted && state.needRematch > 1 ? `WAITING FOR TEAMMATE (${state.rematch}/${state.needRematch})` : state.rematch > 0 && state.needRematch > 1 ? `PLAY AGAIN (${state.rematch}/${state.needRematch} ready)` : "PLAY AGAIN";
  } else { iVoted = false; rb2.disabled = false; }
  const pv = $("pauseOv");
  if (state.paused && !ended) { $("pauseText").textContent = `${state.pausedBy || "A hero"} paused the game. Press P or RESUME to continue.`; pv.classList.remove("hidden"); } else pv.classList.add("hidden");
  $("pauseBtn").textContent = state.paused ? "RESUME (P)" : "PAUSE (P)";
}

/* ------------------------------------------------------------------ gear */
let gearOpen = false, gearSig = "";
const RCOL = ["#cfd6e4", "#6ee08a", "#ffb347"], RNAME = ["Common", "Uncommon", "Rare"];
function toggleGear() { gearOpen = !gearOpen; gearSig = ""; renderGear(); }
$("gearBtn").onclick = toggleGear; $("gearTouch").addEventListener("pointerdown", e => { e.preventDefault(); toggleGear(); });
function renderGear() {
  const el = $("gear"); const me = state && state.players.find(p => p.id === myId);
  if (me) $("gearBtn").textContent = "GEAR (I)" + (me.inv.length ? " •" + me.inv.length : "");
  if (!gearOpen || !me) { el.classList.add("hidden"); return; }
  const sig = JSON.stringify([me.equip, me.inv]); if (sig === gearSig && !el.classList.contains("hidden")) return; gearSig = sig;
  const st = me.st || {}, bits = [];
  if (st.dmg) bits.push("+" + st.dmg + " dmg"); if (st.crit) bits.push(st.crit + "% crit"); if (st.reach) bits.push("+" + st.reach + " reach"); if (st.hp) bits.push("+" + st.hp + " heart"); if (st.speed) bits.push("+" + Math.round(st.speed * 100) + "% speed"); if (st.cd) bits.push("-" + Math.round(st.cd * 100) + "% cooldowns"); if (st.stun) bits.push("+" + st.stun + "ms stun");
  const slot = (key, label) => { const id = me.equip[key], it = ITEMS[id]; return `<button class="slot" data-un="${key}"><small>${label}</small>${it ? `<b style="color:${RCOL[it.rarity]}">${it.name}</b><small>${it.desc} • click to unequip</small>` : '<small>empty</small>'}</button>`; };
  el.innerHTML = `<h3>GEAR <button class="x" data-close="1">CLOSE</button></h3>${slot("weapon", "WEAPON")}${slot("head", "HEAD")}${slot("trinket", "TRINKET")}
    <div class="stats">${bits.length ? "Bonuses: " + bits.join(", ") : "No bonuses yet. Smash chests and mimics for gear."}</div><h4>BACKPACK</h4>` +
    (me.inv.length ? me.inv.map(id => { const it = ITEMS[id]; return `<button class="inv" data-eq="${id}"><b style="color:${RCOL[it.rarity]}">${it.name}</b> <small>${RNAME[it.rarity]} ${it.slot} • ${it.desc}</small></button>`; }).join("") : '<div class="empty">Empty. Items you find appear here; click to equip.</div>');
  el.classList.remove("hidden");
}
$("gear").addEventListener("pointerdown", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.close) { gearOpen = false; renderGear(); } else if (b.dataset.eq) socket.emit("equip", b.dataset.eq); else if (b.dataset.un) socket.emit("unequip", b.dataset.un);
});

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

/* ------------------------------------------------------------------ music: metal-style engine
   Distorted power-chord rhythm guitar, palm-muted gallops, drums with double kick, and a shredding
   lead built from scale runs, arpeggios and sequences (harmonic minor / phrygian dominant). */
const SCALES = { hm: [0, 2, 3, 5, 7, 8, 11], pd: [0, 1, 4, 5, 7, 8, 10], nm: [0, 2, 3, 5, 7, 8, 10] };
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function genLead(seed, bars) {
  const r = seeded(seed), out = [];
  for (let b = 0; b < 4; b++) {
    const bar = Array(16).fill(null);
    if (bars[b]) {
      const type = Math.floor(r() * 4), d0 = Math.floor(r() * 3);
      for (let i = 0; i < 16; i++) {
        let d;
        if (type === 0) d = d0 + (i < 8 ? i : 15 - i);                                  // run up then back down
        else if (type === 1) d = d0 + [0, 2, 4, 7, 4, 2][i % 6];                       // sweeping arpeggio
        else if (type === 2) d = i < 8 ? d0 + 4 + (i % 2) : d0 + 4 + (i - 8) % 4 * 2 - 2;   // trill then climb
        else d = d0 + Math.floor(i / 3) + (i % 3);                                       // 3-note sequence
        bar[i] = d;
      }
      if (bars[b] === 2) { bar[14] = null; bar[15] = null; bar[7] = null; }                // lighter phrasing
    }
    out.push(bar);
  }
  return out;
}
const TRACKS = [
  { name: "entrance", bpm: 126, root: 82.41, scale: "hm", prog: [0, 0, 8, 7], gtrVol: 0.15,
    rhythm: ["xmmxmmxmxmmxmmxm", "xmmxmmxmxmmxmmxm", "xmmxmmxmxmmxmmxm", "xmmxmmxmmxxxm.x."],
    kick: ["x.....x.x.x.....", "x.....x.x.x.....", "x.....x.x.x.....", "x...x...x.x.x.x."], snare: ["....x.......x...", "....x.......x...", "....x.......x...", "....x.......x.x."], hat: ["x.x.x.x.x.x.x.x."],
    leadBars: [0, 2, 0, 1], seed: 11 },
  { name: "crypt", bpm: 100, root: 73.42, scale: "pd", prog: [0, 0, 1, 0], gtrVol: 0.16,
    rhythm: ["x...m.m.x...m.m.", "x...m.m.x.......", "x...m.m.x...m.m.", "x.m.x.m.x.......x"],
    kick: ["x.......x.x.....", "x.......x.......", "x.......x.x.....", "x.x.....x.x.x..."], snare: ["........x.......", "........x.......", "........x.......", "........x.....x."], hat: ["x...x...x...x..."],
    leadBars: [0, 2, 0, 2], seed: 23 },
  { name: "gallery", bpm: 140, root: 98, scale: "hm", prog: [0, 3, 8, 7], gtrVol: 0.15,
    rhythm: ["xmmxmmxmxmmxmmxm", "xmmxmmxmmxmmxxx.", "xmmxmmxmxmmxmmxm", "xmxmxmxmxxxxm.x."],
    kick: ["x..xx..xx..xx.x.", "x..xx..xx..xx.x.", "x..xx..xx..xx.x.", "x.x.x.x.xxxx...."], snare: ["....x.......x...", "....x.......x...", "....x.......x...", "....x...x...x..."], hat: ["x.x.x.x.x.x.x.x."],
    leadBars: [2, 1, 2, 1], seed: 37 },
  { name: "treasure", bpm: 152, root: 87.31, scale: "hm", prog: [0, 0, 8, 10], gtrVol: 0.15,
    rhythm: ["xmmxmmxmmxmmxmmx", "xmmxmmxmmxmmxmmx", "xmmxmmxmmxmmxmmx", "xxmmxxmmxxxxxxx."],
    kick: ["xx.xx.xxxx.xx.xx", "xx.xx.xxxx.xx.xx", "xx.xx.xxxx.xx.xx", "xxxxxxxxxxxxxxxx"], snare: ["....x.......x...", "....x.......x...", "....x.......x...", "....x...x...x..x"], hat: ["x.x.x.x.x.x.x.x."],
    leadBars: [1, 1, 1, 1], seed: 53 },
  { name: "boss", bpm: 176, root: 73.42, scale: "hm", prog: [0, 0, 1, 0], gtrVol: 0.16,
    rhythm: ["xmmmxmmmxmmmxmmm", "xmmxmmxmmxmmxmmm", "xmxmxmxmxmxmxmxm", "xxxxxxxxxxxxxxxx"],
    kick: ["xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx"], snare: ["....x.......x...", "..x.x.x...x.x.x.", "....x.......x...", "x.x.x.x.x.x.x.x."], hat: ["x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "xxxxxxxxxxxxxxxx"],
    leadBars: [1, 1, 1, 1], seed: 71 },
  { name: "menu", bpm: 92, root: 110, scale: "nm", prog: [0, 8, 10, 7], clean: true, gtrVol: 0.1,
    rhythm: ["x"], kick: ["................"], snare: ["................"], hat: ["................"], leadBars: [0, 0, 0, 0], seed: 5 }
];
TRACKS.forEach(t => { t.lead = genLead(t.seed, t.leadBars); });
const scaleFreq = (root, sc, deg) => root * Math.pow(2, (SCALES[sc][((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7)) / 12);

function buildEngine(a) {
  const bus = a.createGain(); bus.gain.value = 0.36; const comp = a.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; bus.connect(comp); comp.connect(a.destination);
  const curve = (k) => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * k); } return c; };
  const gIn = a.createGain(); gIn.gain.value = 16; const gSh = a.createWaveShaper(); gSh.curve = curve(7); gSh.oversample = "2x";
  const gLp = a.createBiquadFilter(); gLp.type = "lowpass"; gLp.frequency.value = 3400; const gHp = a.createBiquadFilter(); gHp.type = "highpass"; gHp.frequency.value = 70;
  const gOut = a.createGain(); gOut.gain.value = 0.26; gIn.connect(gSh); gSh.connect(gLp); gLp.connect(gHp); gHp.connect(gOut); gOut.connect(bus);
  const lIn = a.createGain(); lIn.gain.value = 9; const lSh = a.createWaveShaper(); lSh.curve = curve(2.5); const lLp = a.createBiquadFilter(); lLp.type = "lowpass"; lLp.frequency.value = 5200; const lOut = a.createGain(); lOut.gain.value = 0.3;
  lIn.connect(lSh); lSh.connect(lLp); lLp.connect(lOut); lOut.connect(bus);
  const dl = a.createDelay(1); dl.delayTime.value = 0.19; const fb = a.createGain(); fb.gain.value = 0.3; const wet = a.createGain(); wet.gain.value = 0.28; lOut.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(bus);
  const nb = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return { a, bus, gIn, lIn, nb };
}
function mEnv(a, t, peak, dur, att = 0.004) { const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(att + 0.01, dur)); return g; }
function vGtr(E, freqs, t, dur, vol) {
  for (const f of freqs) for (const det of [-7, 7]) {
    const o = E.a.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
    const g = mEnv(E.a, t, vol / freqs.length, dur); o.connect(g); g.connect(E.gIn); o.start(t); o.stop(t + dur + 0.05);
  }
}
function vLead(E, f, t, dur, vol) {
  const o = E.a.createOscillator(), o2 = E.a.createOscillator(); o.type = "sawtooth"; o2.type = "square";
  o.frequency.setValueAtTime(f * 0.975, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03); o2.frequency.setValueAtTime(f * 0.975, t); o2.frequency.exponentialRampToValueAtTime(f, t + 0.03); o2.detune.value = 9;
  const g = mEnv(E.a, t, vol, dur, 0.006); o.connect(g); o2.connect(g); g.connect(E.lIn); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function vPluck(E, f, t, dur, vol) { const o = E.a.createOscillator(); o.type = "triangle"; o.frequency.value = f; const g = mEnv(E.a, t, vol, dur, 0.006); o.connect(g); g.connect(E.bus); o.start(t); o.stop(t + dur + 0.05); }
function vNoise(E, t, dur, vol, type, freq) { const s = E.a.createBufferSource(); s.buffer = E.nb; const f = E.a.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = mEnv(E.a, t, vol, dur, 0.001); s.connect(f); f.connect(g); g.connect(E.bus); s.start(t); s.stop(t + dur + 0.05); }
function vKick(E, t) { const o = E.a.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.1); const g = mEnv(E.a, t, 0.9, 0.16, 0.002); o.connect(g); g.connect(E.bus); o.start(t); o.stop(t + 0.2); vNoise(E, t, 0.02, 0.12, "highpass", 3000); }
function vSnare(E, t) { vNoise(E, t, 0.16, 0.38, "bandpass", 1900); const o = E.a.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); const g = mEnv(E.a, t, 0.35, 0.1, 0.002); o.connect(g); g.connect(E.bus); o.start(t); o.stop(t + 0.15); }

// Schedules every voice for 16th-note `s` of track `tr` at time t. Works on any (Offline)AudioContext.
function playStep(E, tr, s, t) {
  const bar = Math.floor(s / 16) % 4, i = s % 16, step = 60 / tr.bpm / 4, rootF = tr.root * Math.pow(2, tr.prog[bar] / 12);
  if (tr.clean) {
    const arp = [0, 7, 12, 16, 12, 7, 0, 7, 12, 16, 19, 16, 12, 7, 12, 7][i];
    if (i % 2 === 0) vPluck(E, rootF * 2 * Math.pow(2, arp / 12), t, step * 3.2, 0.3);
    if (i === 0) { vPluck(E, rootF, t, step * 12, 0.22); } return;
  }
  const rp = tr.rhythm[bar % tr.rhythm.length][i];
  const chord = [rootF, rootF * 1.4983, rootF * 2];
  if (rp === "x") vGtr(E, chord, t, step * 2.6, tr.gtrVol); else if (rp === "m") vGtr(E, chord, t, step * 0.8, tr.gtrVol * 0.9);
  if (tr.kick[bar % tr.kick.length][i] === "x") vKick(E, t);
  if (tr.snare[bar % tr.snare.length][i] === "x") vSnare(E, t);
  if (tr.hat[bar % tr.hat.length][i] === "x") vNoise(E, t, 0.04, 0.12, "highpass", 7500);
  const ld = tr.lead[bar][i]; if (ld !== null) vLead(E, scaleFreq(tr.root * 8, tr.scale, ld), t, step * 1.05, 0.085);
}

let curTrack = -1, mStep = 0, mNext = 0, engine = null;
function setTrack(stage, waiting) { const want = waiting ? 5 : stage; if (want === curTrack) return; curTrack = want; mStep = 0; mNext = 0; }
function musicTick() {
  if (muted || !actx || curTrack < 0) return;
  if (!engine || engine.a !== actx) engine = buildEngine(actx);
  const tr = TRACKS[curTrack], step = 60 / tr.bpm / 4;
  if (mNext < actx.currentTime) mNext = actx.currentTime + 0.06;
  while (mNext < actx.currentTime + 0.3) { playStep(engine, tr, mStep, mNext); mStep++; mNext += step; }
}
setInterval(musicTick, 90);


/* ------------------------------------------------------------------ input */
function doDash() { socket.emit("dash"); }
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (k === " ") { if (!e.repeat) socket.emit("attack"); return; }
  if (k === "shift" || k === "e") { if (!e.repeat) doDash(); return; }
  if (k === "q" || k === "f") { if (!e.repeat) socket.emit("note"); return; }
  if (k === "g" && !e.repeat && fsOk) { toggleFs(); return; }
  if (k === "i" && !e.repeat) { toggleGear(); return; }
  if (k === "p" && !e.repeat && !(e.target && e.target.tagName === "INPUT")) { togglePause(); return; }
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
    case "swing": swing[f.id] = { t: now, k: f.kind || 0 }; sfx.swing(); break;
    case "hit": if (f.crit) floater(f.x, f.y - 30, "CRIT!", "#ffd34d"); if (f.big) { shake = Math.max(shake, 9); burst(f.x, f.y, "#ffb070", 12, 220, 450, 5); } burst(f.x, f.y, "#fff3b0", 8, 150, 380, 4); burst(f.x, f.y, "#ffb347", 5, 110, 320, 3); shake = Math.max(shake, 3); sfx.hit(); break;
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
    case "loot": { const rc = RCOL[f.rarity] || "#fff"; burst(f.x, f.y, rc, 18, 160, 800, 4, -40); floater(f.x, f.y - 40, f.name.toUpperCase(), rc); if (f.pid === myId) { $("status").textContent = "Found " + f.name + "! Press I to equip."; } sfx.key(); break; }
    case "equipped": sfx.guard(); break;
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
function chest(g, x, y) {
  g.fillStyle = "#6b4423"; g.beginPath(); g.roundRect(x - 20, y - 4, 40, 22, 3); g.fill();
  const lg = g.createLinearGradient(0, y - 18, 0, y - 2); lg.addColorStop(0, "#b27a3f"); lg.addColorStop(1, "#7a4d2a"); g.fillStyle = lg; g.beginPath(); g.moveTo(x - 20, y - 3); g.lineTo(x - 20, y - 8); g.quadraticCurveTo(x, y - 24, x + 20, y - 8); g.lineTo(x + 20, y - 3); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x - 18, y + 2, 36, 2);
  g.fillStyle = "#d4a73c"; g.fillRect(x - 21, y - 6, 42, 4); g.fillRect(x - 14, y - 14, 4, 30); g.fillRect(x + 10, y - 14, 4, 30);
  g.fillStyle = "#f1cd69"; g.beginPath(); g.roundRect(x - 5, y - 9, 10, 13, 2); g.fill(); g.fillStyle = "#2a2418"; g.beginPath(); g.arc(x, y - 2, 1.8, 0, 6.283); g.fill(); g.fillRect(x - 0.8, y - 2, 1.6, 4);
}
function coins(g, x, y, rng) { for (let i = 0; i < 9; i++) { g.fillStyle = rng() < .5 ? "#e0b13c" : "#ffd96b"; g.fillRect(x + (rng() * 26 | 0) - 13, y + (rng() * 12 | 0) - 6, 5, 3); } }
function skull(g, x, y) { g.fillStyle = "#cfc8b4"; g.fillRect(x - 5, y - 5, 10, 9); g.fillRect(x - 3, y + 3, 6, 3); g.fillStyle = "#222"; g.fillRect(x - 3, y - 2, 2, 3); g.fillRect(x + 1, y - 2, 2, 3); }
function bone(g, x, y, a) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = "#cfc8b4"; g.fillRect(-9, -1.5, 18, 3); g.fillRect(-11, -3, 4, 6); g.fillRect(7, -3, 4, 6); g.restore(); }
function buildBg(stage) {
  const c = document.createElement("canvas"); c.width = W * DPR; c.height = H * DPR;
  const g = c.getContext("2d"); g.scale(DPR, DPR); const th = THEMES[stage], rng = mulberry(stage * 7919 + 13);
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
  { const ao = (x0, y0, x1, y1, w, h) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(0,0,0,.5)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(w[0], w[1], w[2], w[3]); };
    ao(0, 96, 0, 150, [0, 96, W, 54]); ao(36, 0, 90, 0, [36, 96, 54, H]); ao(W - 36, 0, W - 90, 0, [W - 90, 96, 54, H]); ao(0, H - 24, 0, H - 80, [0, H - 80, W, 56]); }
  { const sg = g.createRadialGradient(W / 2, H / 2 + 20, 120, W / 2, H / 2 + 20, 480); sg.addColorStop(0, "rgba(255,255,255,.05)"); sg.addColorStop(1, "rgba(0,0,0,.18)"); g.fillStyle = sg; g.fillRect(0, 0, W, H); }
  return c;
}
const bgCache = {};
const bg = s => bgCache[s] || (bgCache[s] = buildBg(s));
const bl = document.createElement("canvas"); bl.width = 200; bl.height = 130; const bctx = bl.getContext("2d");
const bl2 = document.createElement("canvas"); bl2.width = 80; bl2.height = 52; const bctx2 = bl2.getContext("2d");
const grain = document.createElement("canvas"); grain.width = grain.height = 128; { const gg = grain.getContext("2d"), im = gg.createImageData(128, 128); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } gg.putImageData(im, 0, 0); }
const dark = document.createElement("canvas"); dark.width = W; dark.height = H; const dctx = dark.getContext("2d");
function light(g, x, y, r, s) { const gr = g.createRadialGradient(x, y, r * 0.08, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${s})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }

/* ------------------------------------------------------------------ sprites */
const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
/* Sprite layer: each character is drawn to an offscreen canvas, then given a top-light/bottom-shade
   gradient and a dark outline before it lands on the scene. That is what gives it the 16-bit look. */
const SPS = 260, SS = 2, spr = document.createElement("canvas"), sil = document.createElement("canvas");
spr.width = spr.height = sil.width = sil.height = SPS * SS;
const sctx = spr.getContext("2d"), ictx = sil.getContext("2d");
let spriteOn = false, spX = 0, spY = 0, spA = 1;
function beginSprite(x, y) { ctx = sctx; sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over"; sctx.clearRect(0, 0, SPS * SS, SPS * SS); sctx.setTransform(SS, 0, 0, SS, SS * (SPS / 2 - x), SS * (SPS / 2 - y)); spX = x; spY = y; spriteOn = true; }
function rim(dx, dy, col) {                                  // edge strip on the side facing the light
  ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.globalCompositeOperation = "source-over"; ictx.clearRect(0, 0, SPS * SS, SPS * SS); ictx.drawImage(spr, 0, 0);
  ictx.globalCompositeOperation = "destination-out"; ictx.drawImage(spr, dx * SS, dy * SS);
  ictx.globalCompositeOperation = "source-in"; ictx.fillStyle = col; ictx.fillRect(0, 0, SPS * SS, SPS * SS);
  sctx.drawImage(sil, 0, 0);
}
function endSprite(scale = 1, alpha = 1, h = 36) {
  spriteOn = false; ctx = mctx; sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1;
  const N = SPS * SS, c = N / 2, hh = h * SS;
  sctx.globalCompositeOperation = "source-atop";
  const gr = sctx.createLinearGradient(0, c - hh, 0, c + hh * 0.75);
  gr.addColorStop(0, "rgba(255,244,225,.20)"); gr.addColorStop(0.45, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(10,8,40,.42)");
  sctx.fillStyle = gr; sctx.fillRect(0, 0, N, N);
  const gx = sctx.createLinearGradient(c - hh, 0, c + hh, 0); gx.addColorStop(0, "rgba(255,230,200,.12)"); gx.addColorStop(0.55, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,40,.22)");
  sctx.fillStyle = gx; sctx.fillRect(0, 0, N, N);
  rim(1.5, 1.5, "rgba(255,238,205,.62)"); rim(-1.4, -1.2, "rgba(120,170,255,.34)");
  sctx.globalCompositeOperation = "source-over";
  ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.globalCompositeOperation = "source-over"; ictx.clearRect(0, 0, N, N); ictx.drawImage(spr, 0, 0);
  ictx.globalCompositeOperation = "source-in"; ictx.fillStyle = "#0a0810"; ictx.fillRect(0, 0, N, N);
  mctx.save(); mctx.imageSmoothingEnabled = true; mctx.globalAlpha = alpha * spA; mctx.translate(spX, spY + 16); mctx.scale(scale, scale); mctx.translate(-spX, -(spY + 16));
  const ox = spX - SPS / 2, oy = spY - SPS / 2, o = 0.8;
  const dirs = lowFx ? [[-o, 0], [o, 0], [0, -o], [0, o]] : [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]];
  mctx.globalAlpha *= 0.9; for (const [dx, dy] of dirs) mctx.drawImage(sil, ox + dx, oy + dy, SPS, SPS); mctx.globalAlpha = alpha * spA;
  mctx.drawImage(spr, ox, oy, SPS, SPS); mctx.restore(); spA = 1;
}
function shadow(x, y, w) { const g = mctx; g.save(); g.translate(x, y); g.scale(1, 0.38); const gr = g.createRadialGradient(0, 0, w * 0.1, 0, 0, w * 1.25); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(0.6, "rgba(0,0,0,.28)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, w * 1.25, 0, 6.283); g.fill(); g.restore(); }
const rr = (x, y, w, h, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
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
/* ---- rigged hero: limbs are drawn as jointed strokes so walking, swinging and dashing read as real motion ---- */
const limb = (x1, y1, x2, y2, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
const ball = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };
const blob = (x, y, rx, ry, c, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, 6.283); ctx.fill(); };
function leg(hx, hy, fx, fy, bend, w, c) { const mx = (hx + fx) / 2 + bend, my = (hy + fy) / 2; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(mx, my); ctx.lineTo(fx, fy); ctx.stroke(); }
function arm(sx, sy, hx, hy, w, c, skin) { const mx = (sx + hx) / 2 - (hy - sy) * 0.18, my = (sy + hy) / 2 + (hx - sx) * 0.18; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.lineTo(hx, hy); ctx.stroke(); ball(hx, hy, w * 0.55, skin); }
const ITEMS = {
  oak: { name: "Oak Grip", slot: "weapon", rarity: 0, desc: "+1 damage" }, edge: { name: "Steel Edge", slot: "weapon", rarity: 1, desc: "+1 damage, +14 reach" },
  tooth: { name: "Dragon Tooth", slot: "weapon", rarity: 2, desc: "+2 damage, 15% crit" }, cap: { name: "Leather Cap", slot: "head", rarity: 0, desc: "+1 heart" },
  plume: { name: "Plumed Hat", slot: "head", rarity: 1, desc: "+6% speed, +1 heart" }, crown: { name: "Crown of Echoes", slot: "head", rarity: 2, desc: "-15% ability cooldown, longer stuns" },
  coin: { name: "Lucky Coin", slot: "trinket", rarity: 0, desc: "10% crit chance" }, charm: { name: "Swift Charm", slot: "trinket", rarity: 1, desc: "+10% speed" },
  metro: { name: "Metronome", slot: "trinket", rarity: 1, desc: "-12% cooldown, longer stuns" }, locket: { name: "Heart Locket", slot: "trinket", rarity: 2, desc: "+2 hearts, +1 damage" }
};
const itemRarity = id => (ITEMS[id] ? ITEMS[id].rarity : 0);
const RAR = ["#cfd6e4", "#6ee08a", "#ffb347"];
const ease = u => 1 - (1 - u) * (1 - u), lerp = (a, b, u) => a + (b - a) * u;
function atkPose(kind, age, dur) {
  const u = Math.max(0, Math.min(1, age / dur));
  if (kind === 3) return { th: 0.05, push: lerp(0, 11, ease(Math.min(1, u * 2))) * (1 - Math.max(0, u - 0.6) * 2), ext: 1.5, sq: 0.9 };
  if (kind === 2) {
    if (u < 0.4) return { th: lerp(-0.9, -2.8, ease(u / 0.4)), push: lerp(0, -4, u / 0.4), ext: 1, sq: 1.03 };
    if (u < 0.58) { const v = (u - 0.4) / 0.18; return { th: lerp(-2.8, 1.45, ease(v)), push: lerp(-4, 9, v), ext: 1.1, sq: 0.9 }; }
    return { th: 1.45, push: lerp(9, 0, (u - 0.58) / 0.42), ext: 1, sq: 1 };
  }
  const a = kind === 0 ? [-1.0, -1.9, 1.1] : [1.5, 1.9, -1.5];
  if (u < 0.28) return { th: lerp(a[0], a[1], ease(u / 0.28)), push: lerp(0, -2, u / 0.28), ext: 1, sq: 1 };
  if (u < 0.6) { const v = (u - 0.28) / 0.32; return { th: lerp(a[1], a[2], ease(v)), push: lerp(-2, 5, v), ext: 1.1, sq: 0.96 }; }
  return { th: lerp(a[2], 0.85, (u - 0.6) / 0.4), push: lerp(5, 0, (u - 0.6) / 0.4), ext: 1, sq: 1 };
}
function drawGuitar(len, glow) {
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
  ctx.fillStyle = "#6b4a2a"; ctx.fillRect(2, -1.8, len - 8, 3.6); ctx.fillStyle = "#c9a56a"; for (let i = 0; i < 4; i++) ctx.fillRect(7 + i * 5, -1.8, 1, 3.6);
  ctx.fillStyle = "#2a1a10"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(len - 8, -3.5, 9, 7, 2) : ctx.rect(len - 8, -3.5, 9, 7); ctx.fill();
  blob(-6, 0, 9.5, 8, "#c0562b"); blob(-17, 0, 7, 6, "#c0562b"); blob(-6, -2, 6, 3.5, "#e08a52"); ball(-8, 0.5, 3.2, "#2a1a10"); ctx.fillStyle = "#e8dcc0"; ctx.fillRect(-14, -1, 12, 2);
  ctx.shadowBlur = 0;
}
function drawSword(glow) {
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
  ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-5, -1.8, 9, 3.6); ball(-6, 0, 2.6, "#e8c452");
  ctx.fillStyle = "#e8c452"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(3, -7, 3.6, 14, 1.5) : ctx.rect(3, -7, 3.6, 14); ctx.fill();
  const g = ctx.createLinearGradient(0, -4, 0, 4); g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#dfe6ee"); g.addColorStop(1, "#9aa5b8"); ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(6, -3.6); ctx.lineTo(38, -2.4); ctx.lineTo(46, 0); ctx.lineTo(38, 2.4); ctx.lineTo(6, 3.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(6, 0, 34, 0.8); ctx.shadowBlur = 0;
}
function drawShield(big, glowing, pal) {
  const w = big ? 9 : 7, h = big ? 12 : 10;
  ctx.fillStyle = glowing ? "#7fe3ff" : pal.dark; ctx.beginPath(); ctx.moveTo(-w, -h); ctx.quadraticCurveTo(0, -h - 3, w, -h); ctx.lineTo(w, 2); ctx.quadraticCurveTo(w - 1, h - 2, 0, h + 3); ctx.quadraticCurveTo(-w + 1, h - 2, -w, 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = glowing ? "#e8fbff" : "#e8c452"; ctx.fillRect(-1, -h + 2, 2, h * 2 - 2); ctx.fillRect(-w + 2, -2, w * 2 - 4, 2); ball(0, 0, 2.4, glowing ? "#fff" : "#fff3b0");
}
let guardFx = false;
function drawHero(p, r, t) {
  guardFx = false;
  const x = Math.round(r.x), y = Math.round(r.y), pal = PAL[(p.slot || 0) % 2], me = p.id === myId, knight = p.cls === "knight";
  shadow(x, y + 17, 14);
  if (!p.alive) {                                       // tombstone + revive ring
    px(x - 11, y - 8, 22, 24, "#6b7280"); px(x - 8, y - 13, 16, 7, "#6b7280"); px(x - 2, y - 7, 4, 14, "#4b5563"); px(x - 7, y - 2, 14, 4, "#4b5563");
    ctx.save(); ctx.strokeStyle = "rgba(127,227,255,.5)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 0.02;
    ctx.beginPath(); ctx.arc(x, y + 2, 50, 0, 6.283); ctx.stroke(); ctx.restore();
    if (p.revive > 0) { ctx.strokeStyle = "#7fe3ff"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y + 2, 30, -1.57, -1.57 + 6.283 * p.revive); ctx.stroke(); }
    labels.push({ x, y: y - 22, text: p.name + " (DOWN)", col: "#ff9a9a" });
    return;
  }
  const blink = p.invuln && Math.floor(t / 90) % 2 === 0, flash = p.hurt && Math.floor(t / 55) % 2 === 0;
  beginSprite(x, y); if (blink) spA = 0.5;
  const C = c => flash ? "#ffd8d8" : c;
  if (r.moving && frame % 7 === 0) parts.push({ x: x + rnd(-6, 6), y: y + 16, vx: rnd(-14, 14), vy: rnd(-18, -6), life: 380, max: 380, col: "#9a9fb0", size: 3.5, grav: 0 });
  const f = p.facing, side = f === "left" || f === "right", sgn = f === "left" ? -1 : 1, view = side ? "side" : f === "up" ? "back" : "front";
  const ph = t * 0.019, sw = r.moving ? Math.sin(ph) : 0, moving = r.moving;
  const ageRaw = t - ((swing[p.id] && swing[p.id].t) || -9999), kind = (swing[p.id] && swing[p.id].k) || 0;
  const dur = kind === 2 ? 380 : 260, attacking = ageRaw < dur, pose = attacking ? atkPose(kind, ageRaw, dur) : null;
  const bobY = moving ? -Math.abs(Math.cos(ph)) * 2.4 : Math.sin(t * 0.004 + (p.slot || 0)) * 0.9;
  const lean = (moving ? 0.07 : 0) + (p.dashing ? 0.3 : 0) + (p.hurt ? -0.2 : 0) + (pose ? pose.push * 0.012 : 0);
  const skin = C("#f0c79b");
  ctx.save(); ctx.translate(x + (pose && side ? pose.push * sgn : 0), y + bobY + (pose && !side ? (f === "down" ? pose.push : -pose.push) : 0));
  if (side) ctx.scale(sgn, 1);
  ctx.rotate(side ? lean : 0);
  const sq = pose ? pose.sq : 1, stretch = p.dashing ? 1.14 : 1; ctx.scale(stretch, (p.dashing ? 0.9 : 1) * sq);
  // cape flows behind
  const fl = moving ? Math.sin(ph + 1) * 3 : Math.sin(t * 0.005) * 1.4;
  if (view !== "front") { ctx.fillStyle = C(pal.cape); ctx.beginPath(); ctx.moveTo(-6, -13); ctx.quadraticCurveTo(-13 - (moving || p.dashing ? 5 : 0), -2 + fl, -11 - fl * 0.6 - (p.dashing ? 7 : 0), 11); ctx.lineTo(6, 8); ctx.lineTo(6, -13); ctx.closePath(); ctx.fill(); }
  // legs
  const lA = side ? [-1.5, 2.5] : [-4.5, 4.5];
  for (let i = 0; i < 2; i++) {
    const ph2 = i ? Math.PI : 0, s2 = moving ? Math.sin(ph + ph2) : 0, lift = moving ? Math.max(0, Math.cos(ph + ph2)) * 3.5 : 0;
    const fx2 = side ? lA[i] + s2 * 7.5 : lA[i], fy2 = 15 - (side ? lift : Math.max(0, s2) * 3);
    leg(lA[i], 5, fx2, fy2, side ? 2.4 : 0, 5.2, C(i ? pal.pants : "#1f2b40"));
    ctx.fillStyle = C("#2a2018"); ctx.beginPath(); ctx.ellipse(fx2 + (side ? 1.8 : 0), fy2 + 1.5, 4.4, 3, 0, 0, 6.283); ctx.fill();
  }
  // far arm (swings opposite to the legs)
  const shoulderY = -11.5, farSx = side ? -2 : -7.5, nearSx = side ? 2.5 : 7.5;
  if (!knight) { const as = moving ? Math.sin(ph + Math.PI) * 7 : Math.sin(t * 0.004) * 0.6; arm(farSx, shoulderY, farSx + (side ? as : -2.5), shoulderY + 10.5 - Math.abs(as) * 0.15, 4.6, C(pal.dark), skin); }
  // torso
  ctx.fillStyle = C(pal.tunic); ctx.beginPath(); ctx.moveTo(-7.5, -13.5); ctx.quadraticCurveTo(-9.5, -3, -6.5, 6.5); ctx.lineTo(6.5, 6.5); ctx.quadraticCurveTo(9.5, -3, 7.5, -13.5); ctx.quadraticCurveTo(0, -17.5, -7.5, -13.5); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.ellipse(-1, -8, 4, 6, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = C("#5a3d1f"); ctx.fillRect(-7, 3, 14, 3.4); ctx.fillStyle = "#e8c452"; ctx.fillRect(-2, 2.6, 4, 4.2);
  if (knight) { ctx.fillStyle = "rgba(210,220,235,.9)"; ctx.beginPath(); ctx.ellipse(0, -11, 8.5, 3.2, 0, 0, 6.283); ctx.fill(); }   // pauldron collar
  // head
  const hy = -22.5 + (moving ? Math.sin(ph * 2) * 0.5 : 0);
  ball(0, hy, 7.6, skin);
  if (view === "side") { ball(-6.5, hy + 0.5, 2.4, C(pal.hair)); ball(5.6, hy + 2, 1.6, skin); ball(3.4, hy - 0.8, 1.5, "#fff"); ball(3.9, hy - 0.8, 0.9, "#29202a"); ctx.fillStyle = "#c98b6b"; ctx.fillRect(2, hy + 3.8, 3, 0.9); }
  else if (view === "front") { ball(-3, hy - 0.5, 1.5, "#fff"); ball(3, hy - 0.5, 1.5, "#fff"); ball(-3, hy - 0.3, 0.9, "#29202a"); ball(3, hy - 0.3, 0.9, "#29202a"); ctx.fillStyle = "#c98b6b"; ctx.fillRect(-1.5, hy + 3.8, 3, 0.9); }
  else { ball(0, hy, 7.6, C(pal.hair)); }
  if (view !== "back" && !knight) { ctx.fillStyle = C(pal.hair); ctx.beginPath(); ctx.arc(0, hy - 1, 8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); }
  // head gear
  const hq = p.equip && p.equip.head ? RAR[Math.min(2, itemRarity(p.equip.head))] : null;
  if (knight) {
    ctx.fillStyle = C("#aeb8c8"); ctx.beginPath(); ctx.arc(0, hy - 1, 9.2, Math.PI, 0); ctx.lineTo(8.4, hy + 4); ctx.lineTo(-8.4, hy + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(-3, hy - 6, 4, 2, -0.4, 0, 6.283); ctx.fill();
    if (view !== "back") { ctx.fillStyle = "#1c2230"; ctx.fillRect(side ? 0 : -6, hy - 1, side ? 8 : 12, 3.4); }
    ctx.strokeStyle = C(pal.tunic); ctx.lineWidth = 4.5; ctx.lineCap = "round"; const pl = moving ? Math.sin(ph) * 3 : Math.sin(t * 0.006) * 1.5; ctx.beginPath(); ctx.moveTo(0, hy - 9); ctx.quadraticCurveTo(-6 - pl, hy - 17, -12 - pl * 1.4, hy - 9 + pl); ctx.stroke();
    if (hq) ball(0, hy - 4, 1.8, hq);
  } else {
    ctx.fillStyle = C(pal.dark); ctx.beginPath(); ctx.ellipse(0, hy - 6, 15, 3.8, -0.06, 0, 6.283); ctx.fill();
    ctx.fillStyle = C(pal.cape); ctx.beginPath(); ctx.moveTo(-8, hy - 6); ctx.quadraticCurveTo(-8, hy - 17, 0, hy - 17); ctx.quadraticCurveTo(8, hy - 17, 8, hy - 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8c452"; ctx.fillRect(-8, hy - 9.4, 16, 2.6); if (hq) ball(0, hy - 8.1, 1.8, hq);
    const fw = moving ? Math.sin(ph) * 3 : Math.sin(t * 0.006) * 1.5;
    ctx.strokeStyle = "#e8402f"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(5, hy - 12); ctx.quadraticCurveTo(14, hy - 24 + fw, 22, hy - 14 + fw); ctx.stroke();
    ctx.strokeStyle = "#ffd0a8"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(5, hy - 12); ctx.quadraticCurveTo(14, hy - 24 + fw, 22, hy - 14 + fw); ctx.stroke();
  }
  // weapon arm + weapon (world-space angle so it also works facing up/down)
  const wq = p.equip && p.equip.weapon ? RAR[Math.min(2, itemRarity(p.equip.weapon))] : null, glow = wq && itemRarity(p.equip.weapon) > 0 ? wq : null;
  let th, extend = 1, sx = nearSx, sy = shoulderY;
  if (pose) { th = pose.th; extend = pose.ext; }
  else if (p.playing && !knight) th = -0.32 + Math.sin(t * 0.045) * 0.06;
  else th = 0.95 + (moving ? Math.sin(ph) * 0.12 : Math.sin(t * 0.004) * 0.04);
  const base = side ? 0 : ANG[f], wang = side ? th : base + th * 1.0;      // side view is already mirrored by scale(sgn)
  let hx = sx + Math.cos(wang) * 11 * extend, hy2 = sy + Math.sin(wang) * 11 * extend;
  if (p.playing && !knight) { hx = sx + (side ? 7 : 3); hy2 = -5; }
  const drawW = () => { ctx.save(); ctx.translate(hx, hy2); ctx.rotate(wang); if (p.playing && !knight) ctx.scale(1, 1); if (pose && !knight) { ctx.scale(-1.3, 1.3); } knight ? drawSword(glow) : drawGuitar(34, glow); ctx.restore(); };
  if (view === "back") drawW();
  if (knight && !(view === "back")) {                 // shield on the off arm
    const bashing = p.playing, sx2 = side ? 5 + (bashing ? 8 : 0) : -9, sy2 = -3;
    arm(farSx, shoulderY, sx2, sy2, 4.6, C(pal.dark), skin); ctx.save(); ctx.translate(sx2 + (side ? 2 : 0), sy2); if (p.guard) ctx.scale(1.15, 1.15); drawShield(p.guard || bashing, p.guard, pal); ctx.restore(); guardFx = p.guard;
  }
  arm(sx, sy, hx, hy2, 4.8, C(pal.dark), skin);
  if (view !== "back") drawW();
  ctx.restore();
  endSprite(1, 1, 42);
  if (guardFx) { ctx.strokeStyle = "rgba(127,227,255,.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 4, 30 + Math.sin(t * 0.02) * 2, 0, 6.283); ctx.stroke(); ctx.fillStyle = "rgba(127,227,255,.12)"; ctx.fill(); }
  if (attacking) {                                                                   // sweeping trail follows the weapon
    const pr = ageRaw / dur, aW = ANG[f] || 0, mir = f === "left" ? -1 : 1;
    const wa = th => (side ? (f === "left" ? Math.PI - th : th) : aW + th);
    const sets = kind === 0 ? [-1.9, 1.1] : kind === 1 ? [1.9, -1.5] : kind === 2 ? [-2.8, 1.45] : [-0.25, 0.25];
    ctx.save(); ctx.translate(x, y - 4); ctx.lineCap = "round";
    const col = kind === 2 ? ["#ffd0a0", "rgba(255,110,60,.9)"] : kind === 3 ? ["#bfe9ff", "rgba(120,200,255,.85)"] : ["#fff7c2", "rgba(255,190,70,.9)"];
    const R = (kind === 2 ? 96 : knight ? 82 : 72) + (kind === 3 ? 20 : 0), cur = pose ? pose.th : sets[1];
    ctx.globalAlpha = Math.max(0, 1 - pr) * 0.95;
    const a0 = wa(sets[0]), a1 = wa(cur), ccw = (a1 < a0) !== (f === "left");
    ctx.strokeStyle = col[0]; ctx.lineWidth = (kind === 2 ? 20 : 15) * (1 - pr * 0.5); ctx.beginPath(); ctx.arc(0, 0, R - 8, a0, a1, a1 < a0); ctx.stroke();
    ctx.strokeStyle = col[1]; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, R + 2, a0, a1, a1 < a0); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (me) { px(x - 14, y + 22, 28, 4, "#0c0e14"); px(x - 13, y + 23, 12 * (1 - p.noteCd), 2, p.noteCd > 0 ? "#6b7280" : "#7fe3ff"); px(x + 1, y + 23, 12 * (1 - p.specialCd), 2, p.specialCd > 0 ? "#6b7280" : "#b48cff"); }
  labels.push({ x, y: y - 50 + bobY, text: p.name, col: me ? "#7fe3ff" : "#ffe08a", me });
}
function tint(base, e, t) { return e.hurt ? "#ffffff" : (e.winding && Math.floor(t / 70) % 2 === 0) ? "#ff6a5a" : base; }
function drawEnemy(e, r, t, faceX) {
  const x = Math.round(r.x), y = Math.round(r.y), ph = (e.id.length * 1.7) % 6, dir = faceX >= 0 ? 1 : -1;
  if (e.keeper) { const gl = ctx.createRadialGradient(x, y, 4, x, y, 52); gl.addColorStop(0, "rgba(255,216,107,.55)"); gl.addColorStop(1, "rgba(255,216,107,0)"); ctx.fillStyle = gl; ctx.fillRect(x - 55, y - 55, 110, 110); }
  if (e.elite) { const eg = ctx.createRadialGradient(x, y, 6, x, y, 74); eg.addColorStop(0, "rgba(255,200,70,.42)"); eg.addColorStop(1, "rgba(255,200,70,0)"); ctx.fillStyle = eg; ctx.fillRect(x - 76, y - 76, 152, 152); }
  beginSprite(x, y); if (e.dormant) spA = 0.6;
  if (e.kind === "slime") {
    shadow(x, y + 13, 16);
    const sq = Math.sin(t * 0.008 + ph) * 2.5, w = 34 + sq, h = 25 - sq;
    const jg = ctx.createRadialGradient(x - 5, y - 5, 2, x, y + 3, w / 1.5); jg.addColorStop(0, tint("#b5f5bd", e, t)); jg.addColorStop(0.5, tint("#4fae5e", e, t)); jg.addColorStop(1, tint("#27733a", e, t));
    ctx.fillStyle = jg; ctx.beginPath(); ctx.moveTo(x - w / 2, y + h / 2 + 3); ctx.bezierCurveTo(x - w / 2 - 2, y - h * 0.6, x - w / 4, y - h / 2 - 3, x, y - h / 2 - 2); ctx.bezierCurveTo(x + w / 4, y - h / 2 - 3, x + w / 2 + 2, y - h * 0.6, x + w / 2, y + h / 2 + 3); ctx.quadraticCurveTo(x, y + h / 2 + 8, x - w / 2, y + h / 2 + 3); ctx.fill();
    blob(x - 7, y - 7, 7, 3, "rgba(255,255,255,.55)", -0.5); ball(x + 9, y - 3, 1.5, "rgba(255,255,255,.5)");
    ball(x - 5, y, 3.8, "#fff"); ball(x + 6, y, 3.8, "#fff"); ball(x - 4 + dir, y + 0.6, 2, "#16161e"); ball(x + 7 + dir, y + 0.6, 2, "#16161e"); ball(x - 3.4 + dir, y - 0.2, 0.7, "#fff"); ball(x + 7.6 + dir, y - 0.2, 0.7, "#fff");
    ctx.strokeStyle = "rgba(20,70,35,.8)"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x + 0.5, y + 5, 3.2, 0.2, 2.9); ctx.stroke();
  } else if (e.kind === "bat") {
    const fl = Math.sin(t * 0.035 + ph), yy = y - 8 + Math.sin(t * 0.01 + ph) * 3;
    shadow(x, y + 16, 9);
    for (const s2 of [-1, 1]) {
      const tx = x + s2 * 34, ty = yy - 12 - fl * 13, wg = ctx.createLinearGradient(x, yy, tx, ty); wg.addColorStop(0, tint("#4a2a70", e, t)); wg.addColorStop(1, tint("#7a4cae", e, t));
      ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(x + s2 * 5, yy - 2); ctx.quadraticCurveTo(x + s2 * 18, yy - 17 - fl * 8, tx, ty); ctx.quadraticCurveTo(x + s2 * 28, yy - 3 - fl * 3, x + s2 * 26, yy + 8); ctx.quadraticCurveTo(x + s2 * 19, yy + 1, x + s2 * 16, yy + 9); ctx.quadraticCurveTo(x + s2 * 10, yy + 2, x + s2 * 5, yy + 8); ctx.closePath(); ctx.fill();
      limb(x + s2 * 5, yy - 2, tx, ty, 1.8, "#2a1840"); limb(x + s2 * 14, yy - 7 - fl * 4, x + s2 * 26, yy + 8, 1.1, "#2a1840"); limb(x + s2 * 14, yy - 7 - fl * 4, x + s2 * 16, yy + 9, 1.1, "#2a1840");
    }
    const bg2 = ctx.createRadialGradient(x - 2, yy - 3, 1, x, yy + 1, 11); bg2.addColorStop(0, tint("#5c3a82", e, t)); bg2.addColorStop(1, tint("#2f1c47", e, t)); ctx.fillStyle = bg2; ctx.beginPath(); ctx.ellipse(x, yy + 1, 7.5, 9.5, 0, 0, 6.283); ctx.fill();
    ball(x, yy - 8, 6.4, tint("#4a2f6c", e, t));
    ctx.fillStyle = tint("#3c2358", e, t); for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s2 * 2, yy - 12); ctx.lineTo(x + s2 * 8, yy - 20); ctx.lineTo(x + s2 * 6.5, yy - 10); ctx.fill(); }
    ball(x - 2.6, yy - 8, 1.7, "#ff5a5a"); ball(x + 2.6, yy - 8, 1.7, "#ff5a5a"); ball(x - 2.6, yy - 8.3, 0.6, "#fff");
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x - 2.5, yy - 4); ctx.lineTo(x - 1.5, yy - 1); ctx.lineTo(x - 0.6, yy - 4); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 0.6, yy - 4); ctx.lineTo(x + 1.5, yy - 1); ctx.lineTo(x + 2.5, yy - 4); ctx.fill();
  } else if (e.kind === "skeleton") {
    shadow(x, y + 17, 14);
    ctx.save(); ctx.translate(x, 0); ctx.scale(dir, 1); ctx.translate(-x, 0);
    const wk = Math.sin(t * 0.012 + ph), boneC = tint("#ece7d6", e, t), dk = tint("#a39d8a", e, t), rage = e.winding;
    leg(x - 3, y + 6, x - 4 + wk * 5, y + 17, 1.5, 3.4, boneC); leg(x + 3, y + 6, x + 4 - wk * 5, y + 17, 1.5, 3.4, boneC);
    blob(x - 4 + wk * 5, y + 17, 4, 2.2, dk); blob(x + 4 - wk * 5, y + 17, 4, 2.2, dk);
    blob(x, y + 5, 6.5, 3.2, boneC); limb(x, y - 10, x, y + 4, 2.6, dk);
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = boneC; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(x, y - 8 + i * 3.4, 7 - i * 0.6, 2.2, 0, 0, 6.283); ctx.stroke(); }
    limb(x - 6, y - 9, x - 9 - wk * 2, y + 2, 2.8, boneC); ball(x - 9 - wk * 2, y + 3, 2.2, boneC);
    const ah = rage ? [x + 9, y - 24] : [x + 11 + wk, y - 2];
    limb(x + 6, y - 9, ah[0], ah[1], 2.8, boneC); ball(ah[0], ah[1], 2.2, boneC);
    ctx.save(); ctx.translate(ah[0], ah[1]); ctx.rotate(rage ? -1.2 : -0.3); ctx.fillStyle = "#8b95a5"; ctx.fillRect(0, -1.4, 22, 2.8); ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-4, -1.8, 5, 3.6); ctx.fillRect(1, -4.5, 2, 9); ctx.restore();
    ball(x + 1, y - 19, 7.4, boneC); blob(x + 2, y - 12.6, 5, 3, boneC);
    ball(x + 3.6, y - 19.6, 2.3, "#16161c"); ball(x - 1.4, y - 19.6, 2.3, "#16161c"); ball(x + 3.9, y - 19.6, 1, rage ? "#ff5a5a" : "#7be0ff"); ball(x - 1.1, y - 19.6, 1, rage ? "#ff5a5a" : "#7be0ff");
    ctx.fillStyle = "#16161c"; for (let i = 0; i < 4; i++) ctx.fillRect(x - 1 + i * 1.8, y - 13, 0.8, 2.2);
    ctx.restore();
  } else if (e.kind === "archer") {
    shadow(x, y + 17, 13);
    ctx.save(); ctx.translate(x, 0); ctx.scale(dir, 1); ctx.translate(-x, 0);
    const wk = Math.sin(t * 0.012 + ph);
    leg(x - 3, y + 6, x - 3 + wk * 4, y + 16, 1.4, 4.4, tint("#3b4a2a", e, t)); leg(x + 3, y + 6, x + 3 - wk * 4, y + 16, 1.4, 4.4, tint("#3b4a2a", e, t));
    blob(x - 3 + wk * 4, y + 17, 4, 2.4, "#2a2018"); blob(x + 3 - wk * 4, y + 17, 4, 2.4, "#2a2018");
    ctx.fillStyle = tint("#4f7a3a", e, t); ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.quadraticCurveTo(x - 12, y + 2, x - 9, y + 9); ctx.lineTo(x + 9, y + 9); ctx.quadraticCurveTo(x + 12, y + 2, x + 8, y - 12); ctx.quadraticCurveTo(x, y - 16, x - 8, y - 12); ctx.fill();
    ctx.fillStyle = "#5a3d1f"; ctx.fillRect(x - 8, y + 2, 16, 3); ctx.fillStyle = "#6b4a2a"; ctx.fillRect(x - 9, y - 12, 4, 15);
    ball(x, y - 19, 7.6, "#f0c79b"); ball(x + 3, y - 19, 1.5, "#fff"); ball(x + 3.4, y - 19, 0.8, "#222");
    ctx.fillStyle = tint("#3f6330", e, t); ctx.beginPath(); ctx.arc(x, y - 20, 9, Math.PI * 1.02, Math.PI * 2.0); ctx.lineTo(x + 9, y - 12); ctx.quadraticCurveTo(x, y - 8, x - 9, y - 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f0c79b"; ctx.beginPath(); ctx.ellipse(x + 2, y - 18, 5, 5.5, 0, -1.2, 1.9); ctx.fill(); ball(x + 3, y - 19, 1.4, "#fff"); ball(x + 3.4, y - 19, 0.8, "#222");
    const draw = e.winding ? -5 : 2;
    limb(x + 5, y - 9, x + 14, y - 6, 3.4, tint("#3f6330", e, t)); ball(x + 15, y - 6, 2.2, "#f0c79b");
    ctx.save(); ctx.translate(x + 15, y - 6); ctx.strokeStyle = "#8b5a2b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 15, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, -13); ctx.lineTo(draw, 0); ctx.lineTo(6, 13); ctx.stroke();
    if (e.winding) { ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(draw, 0); ctx.lineTo(20, 0); ctx.stroke(); }
    ctx.restore(); limb(x - 4, y - 9, x + (e.winding ? draw + 6 : 8), y - 4, 3.2, tint("#3f6330", e, t));
    ctx.restore();
  } else if (e.kind === "mimic") {
    shadow(x, y + 18, 20);
    const bounce = Math.abs(Math.sin(t * 0.02 + ph)) * 4, open = Math.abs(Math.sin(t * 0.012 + ph)) * 9, by = y - bounce;
    rr(x - 18, y + 8, 7, 9, 3, "#4a2f18"); rr(x + 11, y + 8, 7, 9, 3, "#4a2f18");
    rr(x - 20, by - 4, 40, 21, 4, tint("#6b4423", e, t)); rr(x - 21, by - 2, 42, 4, 2, tint("#d4a73c", e, t));
    ctx.fillStyle = "#6a1818"; ctx.beginPath(); ctx.roundRect(x - 18, by - 7 - open * 0.5, 36, 6 + open * 0.8, 3); ctx.fill();
    blob(x + dir * 4, by - 1, 8, 3.2, "#d9566a");
    ctx.fillStyle = "#fff"; for (let i = 0; i < 5; i++) { const tx = x - 15 + i * 7; ctx.beginPath(); ctx.moveTo(tx, by - 6 - open * 0.5); ctx.lineTo(tx + 1.6, by - 1 - open * 0.3); ctx.lineTo(tx + 3.2, by - 6 - open * 0.5); ctx.fill(); ctx.beginPath(); ctx.moveTo(tx + 3, by - 1); ctx.lineTo(tx + 4.6, by - 5); ctx.lineTo(tx + 6, by - 1); ctx.fill(); }
    const ly = by - 19 - open, lg = ctx.createLinearGradient(0, ly, 0, ly + 15); lg.addColorStop(0, tint("#a06a35", e, t)); lg.addColorStop(1, tint("#7a4d2a", e, t));
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x - 20, ly + 15); ctx.lineTo(x - 20, ly + 8); ctx.quadraticCurveTo(x, ly - 8, x + 20, ly + 8); ctx.lineTo(x + 20, ly + 15); ctx.closePath(); ctx.fill();
    rr(x - 21, ly + 9, 42, 4, 2, tint("#d4a73c", e, t));
    ball(x - 7, ly + 6, 3.6, "#ffe58a"); ball(x + 7, ly + 6, 3.6, "#ffe58a"); ctx.fillStyle = "#1a0c08"; ctx.fillRect(x - 7.5 + dir, ly + 3.6, 1.6, 5); ctx.fillRect(x + 6.5 + dir, ly + 3.6, 1.6, 5);
    ctx.strokeStyle = "#3a1d0c"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - 12, ly + 1); ctx.lineTo(x - 3, ly + 4); ctx.moveTo(x + 12, ly + 1); ctx.lineTo(x + 3, ly + 4); ctx.stroke();
  } else if (e.kind === "boss") {
    const enr = e.phase === 3, pulse = Math.sin(t * 0.01) * 3, flap = Math.sin(t * 0.006) * 10;
    shadow(x, y + 62, 72);
    const wingC = tint(enr ? "#6a1a12" : "#6f2520", e, t), wingL = tint(enr ? "#b8402a" : "#a03a2e", e, t);
    for (const sd of [-1, 1]) {
      const wg = ctx.createLinearGradient(x + sd * 20, y - 20, x + sd * 84, y - 70); wg.addColorStop(0, wingC); wg.addColorStop(1, wingL); ctx.fillStyle = wg;
      ctx.beginPath(); ctx.moveTo(x + sd * 22, y - 22); ctx.quadraticCurveTo(x + sd * 50, y - 62 - flap, x + sd * 86, y - 78 - flap); ctx.quadraticCurveTo(x + sd * 70, y - 46, x + sd * 88, y - 24); ctx.quadraticCurveTo(x + sd * 66, y - 28, x + sd * 76, y - 4); ctx.quadraticCurveTo(x + sd * 52, y - 16, x + sd * 54, y + 8); ctx.quadraticCurveTo(x + sd * 34, y - 4, x + sd * 28, y + 8); ctx.closePath(); ctx.fill();
      for (const [ex, ey] of [[86, -78 - flap], [88, -24], [76, -4], [54, 8]]) limb(x + sd * 22, y - 20, x + sd * ex, y + ey, ex > 80 ? 3.2 : 2, "#3f130e");
    }
    const bodyC = tint(enr ? "#c4412c" : "#a8362a", e, t), darkC = tint(enr ? "#7a1f16" : "#7c2a22", e, t);
    ctx.lineCap = "round"; ctx.strokeStyle = tint("#8a2c22", e, t); for (const [wd, off] of [[20, 0], [13, 0], [6, 0]]) { ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x - dir * 30, y + 26); ctx.quadraticCurveTo(x - dir * 72, y + 50 + Math.sin(t * 0.004) * 6, x - dir * 94, y + 20); ctx.stroke(); }
    ball(x - dir * 96, y + 16, 8, tint("#ff8a3c", e, t)); ball(x - dir * 96, y + 16, 4, "#fff1b8");
    blob(x - 26, y + 40, 15, 21, darkC); blob(x + 26, y + 40, 15, 21, darkC); blob(x - 30, y + 60, 17, 7, "#3a1914"); blob(x + 30, y + 60, 17, 7, "#3a1914");
    ctx.fillStyle = "#f3ead2"; for (const fx of [-36, -30, -24, 24, 30, 36]) { ctx.beginPath(); ctx.moveTo(fx - 2, y + 64); ctx.lineTo(fx, y + 71); ctx.lineTo(fx + 2, y + 64); ctx.fill(); }
    const bgd = ctx.createRadialGradient(x - 10, y - 8, 6, x, y + 8, 52); bgd.addColorStop(0, bodyC); bgd.addColorStop(1, darkC); ctx.fillStyle = bgd; ctx.beginPath(); ctx.ellipse(x, y + 6, 46, 40, 0, 0, 6.283); ctx.fill();
    const bel = ctx.createLinearGradient(0, y - 12, 0, y + 40); bel.addColorStop(0, tint("#f0cd8a", e, t)); bel.addColorStop(1, tint("#c4914a", e, t)); ctx.fillStyle = bel; ctx.beginPath(); ctx.ellipse(x + dir * 5, y + 15, 27, 29, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(120,70,30,.45)"; ctx.lineWidth = 1.6; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x + dir * 5, y + 4 + i * 8, 24 - i * 2, 4, 0, 0.1, 3.04); ctx.stroke(); }
    ctx.fillStyle = "#4a1812"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 14 - 6, y - 30); ctx.quadraticCurveTo(x + i * 14 - 1, y - 38, x + i * 14 + dir * 3, y - 46 + Math.abs(i) * 2); ctx.quadraticCurveTo(x + i * 14 + 3, y - 36, x + i * 14 + 6, y - 30); ctx.fill(); }
    const hx = x + dir * 40, hy = y - 30 + pulse * 0.3;
    limb(x + dir * 12, y - 14, hx - dir * 6, hy + 8, 24, bodyC);
    ctx.fillStyle = "#efe4c8"; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + sd * 10, hy - 14); ctx.quadraticCurveTo(hx + sd * 26, hy - 26, hx + sd * 14, hy - 46); ctx.quadraticCurveTo(hx + sd * 12, hy - 28, hx + sd * 4, hy - 16); ctx.fill(); }
    const hg = ctx.createRadialGradient(hx - 6, hy - 8, 3, hx, hy, 32); hg.addColorStop(0, tint(enr ? "#d85a40" : "#c9483a", e, t)); hg.addColorStop(1, tint("#8e2a20", e, t)); ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(hx, hy, 28, 22, 0, 0, 6.283); ctx.fill();
    blob(hx + dir * 20, hy + 6, 18, 12, tint("#a8362a", e, t));
    for (const sd of [-1, 1]) { const ex = hx + sd * 8 + dir * 6; ball(ex, hy - 6, 5.4, enr ? "#fff27a" : "#ffe08a"); ctx.fillStyle = "#2a0a08"; ctx.beginPath(); ctx.ellipse(ex + dir * 1.5, hy - 6, 1.6, 4.2, 0, 0, 6.283); ctx.fill(); ctx.strokeStyle = "#4a1812"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(ex - sd * 6, hy - 12 + (sd === dir ? 0 : 3)); ctx.lineTo(ex + sd * 5, hy - 9 - (sd === dir ? 3 : 0)); ctx.stroke(); }
    ball(hx + dir * 30, hy + 1, 2, "#2a0a08"); ball(hx + dir * 22, hy + 1, 2, "#2a0a08");
    ctx.fillStyle = "#fff"; for (let i = 0; i < 4; i++) { const tx = hx + dir * (12 + i * 6); ctx.beginPath(); ctx.moveTo(tx - 1.8, hy + 12); ctx.lineTo(tx, hy + 18); ctx.lineTo(tx + 1.8, hy + 12); ctx.fill(); }
    if (e.winding) { const fg = ctx.createRadialGradient(hx + dir * 36, hy + 8, 2, hx + dir * 36, hy + 8, 34); fg.addColorStop(0, "rgba(255,230,120,.95)"); fg.addColorStop(1, "rgba(255,90,30,0)"); ctx.fillStyle = fg; ctx.fillRect(hx + dir * 36 - 34, hy - 26, 68, 68); }
  } else {                                              // brute
    shadow(x, y + 25, 26);
    ctx.save(); ctx.translate(x, 0); ctx.scale(dir, 1); ctx.translate(-x, 0);
    const wk = Math.sin(t * 0.007 + ph) * 3, skinC = tint("#9a3f33", e, t), dkC = tint("#6a271f", e, t), up = e.winding;
    leg(x - 10, y + 12, x - 11 + wk, y + 25, 2, 11, dkC); leg(x + 10, y + 12, x + 11 - wk, y + 25, 2, 11, dkC);
    blob(x - 11 + wk, y + 26, 8, 4, "#3a1914"); blob(x + 11 - wk, y + 26, 8, 4, "#3a1914");
    blob(x, y, 24, 20, skinC); blob(x + 3, y + 5, 15, 13, tint("#c0705a", e, t)); ctx.fillStyle = "#5a3d1f"; ctx.fillRect(x - 22, y + 8, 44, 5);
    limb(x - 20, y - 8, x - 27, y + 8 + wk, 10, skinC); ball(x - 27, y + 10 + wk, 6.5, tint("#b35a49", e, t));
    const hand = up ? [x + 18, y - 38] : [x + 28, y + 8 - wk];
    limb(x + 19, y - 9, hand[0], hand[1], 10, skinC); ball(hand[0], hand[1], 6.5, tint("#b35a49", e, t));
    ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(up ? -0.5 : -1.25); ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-6, -3.4, 36, 6.8); blob(34, 0, 10, 8.5, "#7a552f"); ctx.fillStyle = "#cfd6e4"; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(30 + i * 3, -8); ctx.lineTo(33 + i * 3, -13); ctx.lineTo(36 + i * 3, -8); ctx.fill(); } ctx.restore();
    ball(x + 3, y - 25, 12, tint("#a3473a", e, t)); blob(x + 9, y - 21, 7, 5.5, tint("#b9604f", e, t));
    ctx.fillStyle = "#e8dcc0"; ctx.beginPath(); ctx.moveTo(x - 6, y - 33); ctx.quadraticCurveTo(x - 15, y - 36, x - 15, y - 46); ctx.quadraticCurveTo(x - 9, y - 40, x - 2, y - 35); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 8, y - 34); ctx.quadraticCurveTo(x + 17, y - 38, x + 17, y - 48); ctx.quadraticCurveTo(x + 11, y - 42, x + 4, y - 36); ctx.fill();
    ball(x + 1, y - 27, 3, "#ffe58a"); ball(x + 9, y - 27, 3, "#ffe58a"); ball(x + 2, y - 27, 1.4, "#222"); ball(x + 10, y - 27, 1.4, "#222");
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x + 4, y - 18); ctx.lineTo(x + 6, y - 13); ctx.lineTo(x + 8, y - 18); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 11, y - 18); ctx.lineTo(x + 13, y - 13); ctx.lineTo(x + 14, y - 18); ctx.fill();
    if (e.elite) { ctx.fillStyle = "#e9b93c"; ctx.beginPath(); ctx.moveTo(x - 7, y - 36); ctx.lineTo(x - 8, y - 47); ctx.lineTo(x - 3, y - 41); ctx.lineTo(x + 3, y - 50); ctx.lineTo(x + 9, y - 41); ctx.lineTo(x + 14, y - 47); ctx.lineTo(x + 13, y - 36); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#8a6414"; ctx.lineWidth = 1.2; ctx.stroke(); ball(x + 3, y - 44, 1.8, "#ff5a5a"); }
    ctx.restore();
  }
  endSprite((e.winding ? 1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.03)) : 1 + Math.sin(t * 0.006 + ph) * 0.015) * (e.elite ? 1.5 : 1), 1, e.kind === "boss" ? 84 : e.kind === "brute" ? 52 : 36);
  const top = e.kind === "boss" ? 96 : e.elite ? 86 : e.kind === "brute" ? 54 : e.kind === "bat" ? 30 : e.kind === "mimic" ? 30 : 34;
  if (e.keeper) { keyIcon(x - 10, y - top - 8 + Math.sin(t * 0.006) * 3, 0.9); }
  if (e.dormant) { ctx.fillStyle = "#cfe3ff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("z", x + 12, y - top + Math.sin(t * 0.004) * 3); ctx.fillText("Z", x + 20, y - top - 8 + Math.sin(t * 0.004 + 1) * 3); }
  if ((e.hp < e.maxHp || e.kind === "brute") && e.kind !== "boss") {
    const bw = e.elite ? 72 : e.kind === "brute" ? 44 : 30, by = y - top - (e.keeper ? 22 : 8);
    px(x - bw / 2 - 1, by - 1, bw + 2, 6, "#0c0e14"); px(x - bw / 2, by, bw, 4, "#3a1f26"); px(x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 4, e.elite ? "#f0c24a" : "#e66c75");
    if (e.elite) { ctx.fillStyle = "#ffe08a"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText("IRON WARDEN", x, by - 5); }
  }
  if (e.stunned && !e.dormant) { for (let i = 0; i < 3; i++) { const a = t * 0.008 + i * 2.09; ctx.fillStyle = "#ffe08a"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("★", x + Math.cos(a) * 16, y - top - 6 + Math.sin(a) * 4); } }
  if (e.winding && e.kind === "archer" && state) { const tg = state.players.filter(p => p.alive).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; if (tg) { ctx.save(); ctx.strokeStyle = "rgba(255,90,90,.55)"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tg.x, tg.y); ctx.stroke(); ctx.restore(); } }
  if (e.winding && e.kind !== "archer") {                                      // attack warning: pulsing ring + !
    const rg = (RANGE[e.kind] || 46) * (e.elite ? 1.5 : 1), pu = 0.7 + 0.3 * Math.sin(t * 0.03);
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
  const pvFired = {};
function drawPreview(cv, cls, t) {
  const g = cv.getContext("2d"), pw = cv.width, ph = cv.height, knight = cls === "knight", saved = mctx;
  mctx = g; ctx = g; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.clearRect(0, 0, pw, ph);
  const bgG = g.createRadialGradient(pw / 2, ph * 0.55, 10, pw / 2, ph * 0.55, pw * 0.85); bgG.addColorStop(0, knight ? "#33476a" : "#4a3a5c"); bgG.addColorStop(1, "#0a0e17"); g.fillStyle = bgG; g.fillRect(0, 0, pw, ph);
  g.fillStyle = "rgba(255,200,120,.10)"; g.beginPath(); g.ellipse(pw / 2, ph * 0.8, pw * 0.42, pw * 0.1, 0, 0, 6.283); g.fill();
  const S = pw / 70; g.setTransform(S, 0, 0, S, pw / 2 - 10 * S, ph * 0.6);
  const id = "pv-" + cls, cyc = t % 3400, plan = [[0, 0], [430, 1], [860, 2]];
  plan.forEach(([at, k]) => { const key = id + k, hit = cyc >= at && cyc < at + 120; if (hit && !pvFired[key]) { pvFired[key] = 1; swing[id] = { t, k }; } if (!hit) pvFired[key] = 0; });
  const special = cyc > 2000 && cyc < 3100;
  drawHero({ id, slot: knight ? 1 : 0, cls, facing: "right", alive: true, revive: 0, invuln: false, hurt: false, dashing: false, playing: special, guard: knight && special, equip: {}, name: "", noteCd: 0, specialCd: 0 }, { x: 0, y: 0, moving: false }, t);
  g.restore(); mctx = saved; ctx = saved; labels.length = 0;
}
function previewLoop(t) { if (lobby.offsetParent !== null) document.querySelectorAll(".pv").forEach(cv => drawPreview(cv, cv.dataset.cls, t)); requestAnimationFrame(previewLoop); }
requestAnimationFrame(previewLoop);
requestAnimationFrame(draw);
  try { render(ts || performance.now()); } catch (err) { if (!draw.warned) { console.error(err); draw.warned = true; } }
}
function render(t) {
  const dt = Math.min(50, t - (lastTs || t)); lastTs = t; frame++;
  const stage = state ? state.stage : 0, th = THEMES[stage];
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.86; } else shake = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg(stage), 0, 0, W, H);
  drawDoor(t);
  TORCHES.forEach((x, i) => {                                                        // torches
    const fl = Math.sin(t * 0.013 + i * 2) * 2 + Math.sin(t * 0.031 + i) * 1.5;
    rr(x, 34, 7, 20, 2, "#70513a"); rr(x - 3, 32, 13, 5, 2, "#3a2c20");
    { const fg = ctx.createRadialGradient(x + 3.5, 30, 1, x + 3.5, 30, 13); fg.addColorStop(0, "#fff6c8"); fg.addColorStop(0.4, th.torch); fg.addColorStop(1, "rgba(255,120,30,0)"); ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(x + 3.5, 14 + fl); ctx.quadraticCurveTo(x + 14, 30, x + 3.5, 38); ctx.quadraticCurveTo(x - 7, 30, x + 3.5, 14 + fl); ctx.fill(); }
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
  ctx.globalCompositeOperation = "lighter";
  for (let i = parts.length - 1; i >= 0; i--) {                                      // particles
    const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.grav * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; const s = p.size; ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.6, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
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
    bctx2.clearRect(0, 0, 80, 52); bctx2.filter = "blur(2px)"; bctx2.drawImage(bl, 0, 0, 80, 52); bctx2.filter = "none";
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "lighter"; ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.3; ctx.drawImage(bl, 0, 0, canvas.width, canvas.height); ctx.globalAlpha = 0.34; ctx.drawImage(bl2, 0, 0, canvas.width, canvas.height); ctx.restore();
  } catch (e) {}
  ctx.save(); ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.28; ctx.fillStyle = `rgb(${["255,190,120", "110,230,170", "140,180,255", "255,210,110", "255,90,50"][stage]})`; ctx.fillRect(0, 0, W, H); ctx.restore();   // colour grade
  ctx.save(); ctx.globalCompositeOperation = "lighter";                              // light shafts from the torches
  TORCHES.forEach((x, i) => { const sw = Math.sin(t * 0.0007 + i * 1.7) * 14, a = 0.016 + 0.007 * Math.sin(t * 0.002 + i), gr = ctx.createLinearGradient(x + 3, 44, x + 3, 340); gr.addColorStop(0, `rgba(${th.glow},${a * 2.2})`); gr.addColorStop(1, `rgba(${th.glow},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 2, 44); ctx.lineTo(x + 8, 44); ctx.lineTo(x + 8 + sw * 2 + 55, 340); ctx.lineTo(x - 2 + sw * 2 - 55, 340); ctx.closePath(); ctx.fill(); });
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = "overlay"; { const gg = ctx.createLinearGradient(0, 0, 0, H); gg.addColorStop(0, "rgba(255,255,255,.10)"); gg.addColorStop(1, "rgba(0,0,0,.22)"); ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); }
  if (!lowFx) { ctx.globalAlpha = 0.08; ctx.translate(-((frame * 37) % 128), -((frame * 53) % 128)); ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, W + 128, H + 128); }
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
