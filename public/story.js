/* Story mode (client): Emberfall village, region themes, NPCs, dialogue, world map.
   Loaded after game.js, which calls into these functions through typeof guards. */

const REGIONS_C = [
  { id: "greenwood", name: "Greenwood", gx: 120, req: [], col: "90,220,120", icon: "🌿" },
  { id: "mire", name: "Sunken Mire", gx: 280, req: ["greenwood"], col: "90,220,210", icon: "🍄" },
  { id: "coast", name: "Shattered Coast", gx: 440, req: ["mire"], col: "110,170,255", icon: "🌊" },
  { id: "keep", name: "Keep of Debt", gx: 650, req: ["greenwood", "mire", "coast"], col: "255,110,70", icon: "🐉" }
];

/* ---- saved progress (this device only) ---- */
const WKEY = "dd_world";
function readWorld() {
  try { const w = JSON.parse(localStorage.getItem(WKEY) || "{}"); return { done: Array.isArray(w.done) ? w.done.filter(x => typeof x === "string") : [], seen: w.seen && typeof w.seen === "object" ? w.seen : {} }; }
  catch (e) { return { done: [], seen: {} }; }
}
let WORLD = readWorld();
function saveWorld() { try { localStorage.setItem(WKEY, JSON.stringify(WORLD)); } catch (e) {} }
function loadWorld() { return { done: WORLD.done }; }
(function lobbyStory() {
  const sc = $("storyChk"), dc = $("dailyChk"), rs = $("resetStory");
  if (sc && dc) { sc.addEventListener("change", () => { if (sc.checked) dc.checked = false; }); dc.addEventListener("change", () => { if (dc.checked) sc.checked = false; }); }
  const note = () => { const n = WORLD.done.length; if ($("storyNote")) $("storyNote").textContent = n ? `Saved: ${n} of 3 sigils${WORLD.done.includes("keep") ? " and the Keep cleared" : ""}.` : "No saved progress yet."; if (rs) rs.classList.toggle("hidden", !n); };
  note();
  if (rs) rs.onclick = () => { WORLD = { done: [], seen: {} }; saveWorld(); note(); };
})();

/* ---- themes for the village and regions (indexes 5 to 8) ---- */
THEMES.push(
  { floorA: "#4c7a3e", floorB: "#477238", line: "#3f6a34", speck: "#6b9a52", wall: "#2f6b3a", wallDark: "#1f4a2a", ambient: 0.06, torch: "#ffe9a0", glow: "255,220,150" },
  { floorA: "#35643a", floorB: "#305d35", line: "#2a5230", speck: "#4f8750", wall: "#265c33", wallDark: "#173d22", ambient: 0.34, torch: "#c8ff9a", glow: "170,255,150" },
  { floorA: "#2b4a44", floorB: "#274640", line: "#21403a", speck: "#3f6e62", wall: "#2a4a3c", wallDark: "#183228", ambient: 0.5, torch: "#7dffd8", glow: "100,255,210" },
  { floorA: "#cdb78a", floorB: "#c5af82", line: "#b89f70", speck: "#e2d2a8", wall: "#7a7f8c", wallDark: "#51566a", ambient: 0.16, torch: "#ffe6b0", glow: "255,230,170" }
);

/* ---- outdoor backgrounds ---- */
function oTree(g, x, y, s, c1, c2) {
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(x, y + 4 * s, 17 * s, 6 * s, 0, 0, 6.283); g.fill();
  g.fillStyle = "#4a3220"; g.fillRect(x - 3 * s, y - 14 * s, 6 * s, 18 * s);
  for (const [dx, dy, r, c] of [[0, -28, 15, c1], [-11, -21, 11, c2], [11, -21, 11, c2], [0, -39, 10, c1], [-5, -33, 6, "rgba(255,255,255,.12)"]]) { g.fillStyle = c; g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 6.283); g.fill(); }
}
function oDead(g, x, y, s) {
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(x, y + 3 * s, 14 * s, 5 * s, 0, 0, 6.283); g.fill();
  g.strokeStyle = "#2c2a26"; g.lineCap = "round"; g.lineWidth = 5 * s; g.beginPath(); g.moveTo(x, y + 2 * s); g.lineTo(x, y - 30 * s); g.stroke();
  g.lineWidth = 2.4 * s; for (const [a, b, c, d] of [[0, -18, -14, -32], [0, -22, 13, -36], [0, -12, 12, -22], [0, -26, -8, -42]]) { g.beginPath(); g.moveTo(x + a * s, y + b * s); g.lineTo(x + c * s, y + d * s); g.stroke(); }
}
function oBush(g, x, y, s, c) { g.fillStyle = "rgba(0,0,0,.22)"; g.beginPath(); g.ellipse(x, y + 4 * s, 13 * s, 4 * s, 0, 0, 6.283); g.fill(); g.fillStyle = c; for (const [dx, dy, r] of [[-6, 0, 7], [6, 0, 7], [0, -5, 8]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 6.283); g.fill(); } g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.arc(x - 2 * s, y - 8 * s, 3.5 * s, 0, 6.283); g.fill(); }
function oRock(g, x, y, s, c) { g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.ellipse(x, y + 5 * s, 14 * s, 4 * s, 0, 0, 6.283); g.fill(); g.fillStyle = c; g.beginPath(); g.moveTo(x - 12 * s, y + 4 * s); g.lineTo(x - 8 * s, y - 7 * s); g.lineTo(x + 2 * s, y - 11 * s); g.lineTo(x + 11 * s, y - 4 * s); g.lineTo(x + 13 * s, y + 4 * s); g.closePath(); g.fill(); g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(x - 8 * s, y - 7 * s); g.lineTo(x + 2 * s, y - 11 * s); g.lineTo(x + 1 * s, y - 4 * s); g.closePath(); g.fill(); }
function oFlower(g, x, y, c) { g.fillStyle = "#2d6a34"; g.fillRect(x, y, 1, 4); g.fillStyle = c; g.fillRect(x - 1, y - 2, 3, 3); g.fillStyle = "#ffe9a0"; g.fillRect(x, y - 1, 1, 1); }
function oMush(g, x, y, c, glow) { g.fillStyle = "#e8e0cc"; g.fillRect(x - 1, y, 3, 4); g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 5, 3.4, 0, Math.PI, 0); g.fill(); g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(x - 2, y - 2, 1.5, 1.5); if (glow) { g.fillStyle = "rgba(120,255,220,.16)"; g.beginPath(); g.arc(x, y, 10, 0, 6.283); g.fill(); } }
function oCottage(g, x, y, w, roof, wall) {
  g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(x + w / 2, y + 62, w * 0.62, 9, 0, 0, 6.283); g.fill();
  g.fillStyle = wall; g.fillRect(x, y + 20, w, 42); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y + 56, w, 6);
  g.fillStyle = "#5a3d22"; g.fillRect(x + w - 22, y - 4, 10, 22);
  g.fillStyle = roof; g.beginPath(); g.moveTo(x - 8, y + 24); g.lineTo(x + w / 2, y - 8); g.lineTo(x + w + 8, y + 24); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,.14)"; g.beginPath(); g.moveTo(x - 8, y + 24); g.lineTo(x + w / 2, y - 8); g.lineTo(x + w / 2, y + 24); g.closePath(); g.fill();
  g.fillStyle = "#4a2f1a"; g.fillRect(x + w / 2 - 9, y + 36, 18, 26); g.fillStyle = "#e8c452"; g.fillRect(x + w / 2 + 4, y + 49, 2, 2);
  g.fillStyle = "#ffd98a"; g.fillRect(x + 8, y + 32, 14, 12); g.fillRect(x + w - 22, y + 32, 14, 12); g.strokeStyle = "#4a2f1a"; g.lineWidth = 1.5; g.strokeRect(x + 8, y + 32, 14, 12); g.strokeRect(x + w - 22, y + 32, 14, 12);
}
function oLantern(g, x, y) { g.fillStyle = "#3a3a44"; g.fillRect(x - 1.5, y - 26, 3, 28); g.fillStyle = "#2a2a32"; g.fillRect(x - 6, y - 36, 12, 4); g.fillStyle = "#ffd98a"; g.fillRect(x - 4, y - 32, 8, 8); g.fillStyle = "rgba(255,220,140,.18)"; g.beginPath(); g.arc(x, y - 28, 22, 0, 6.283); g.fill(); }

function buildOutdoorBg(stage) {
  const c = document.createElement("canvas"); c.width = W * DPR; c.height = H * DPR;
  const g = c.getContext("2d"); g.scale(DPR, DPR);
  const th = THEMES[stage], rng = mulberry(stage * 7919 + 13), R = (a, b) => a + rng() * (b - a);
  g.fillStyle = th.floorA; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1100; i++) { g.fillStyle = rng() < 0.5 ? th.floorB : (rng() < 0.5 ? th.line : th.speck); g.fillRect(R(0, W), R(0, H), R(2, 10), R(1, 4)); }
  const free = (x, y) => true;
  if (stage === 5) {                                                    // ---- Emberfall village
    const GX = [120, 280, 440, 650];
    GX.forEach(gx => { g.lineCap = "round"; g.strokeStyle = "#7d6340"; g.lineWidth = 50; g.beginPath(); g.moveTo(gx, 100); g.quadraticCurveTo(gx, 210, 400 + (gx - 400) * 0.3, 250); g.stroke(); g.strokeStyle = "#a88a5c"; g.lineWidth = 40; g.beginPath(); g.moveTo(gx, 100); g.quadraticCurveTo(gx, 210, 400 + (gx - 400) * 0.3, 250); g.stroke();
      for (let i = 0; i < 26; i++) { g.fillStyle = rng() < 0.5 ? "#8e7248" : "#bb9d6c"; g.fillRect(gx + R(-18, 18), R(104, 230), 3, 2); } });
    g.save(); g.beginPath(); g.ellipse(400, 305, 205, 120, 0, 0, 6.283); g.fillStyle = "#8d8574"; g.fill(); g.clip();
    for (let i = 0; i < 260; i++) { const sx = R(190, 610), sy = R(185, 425), sw = R(12, 22), sh = R(8, 13); g.fillStyle = rng() < 0.5 ? "#9b9382" : "#7d7565"; g.beginPath(); g.roundRect(sx, sy, sw, sh, 3); g.fill(); g.strokeStyle = "rgba(0,0,0,.2)"; g.lineWidth = 1; g.stroke(); }
    g.restore(); g.strokeStyle = "#5b5546"; g.lineWidth = 4; g.beginPath(); g.ellipse(400, 305, 205, 120, 0, 0, 6.283); g.stroke();
    g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(400, 322, 62, 30, 0, 0, 6.283); g.fill();                // fountain
    g.fillStyle = "#7d8590"; g.beginPath(); g.ellipse(400, 305, 56, 31, 0, 0, 6.283); g.fill(); g.fillStyle = "#98a1ae"; g.beginPath(); g.ellipse(400, 302, 56, 29, 0, 0, 6.283); g.fill();
    g.fillStyle = "#3d8fd0"; g.beginPath(); g.ellipse(400, 303, 47, 23, 0, 0, 6.283); g.fill(); g.fillStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.ellipse(388, 297, 20, 6, -0.2, 0, 6.283); g.fill();
    g.fillStyle = "#8a93a0"; g.fillRect(394, 268, 12, 36); g.fillStyle = "#a8b0bc"; g.beginPath(); g.ellipse(400, 268, 17, 7, 0, 0, 6.283); g.fill(); g.fillStyle = "#6fb6f0"; g.beginPath(); g.ellipse(400, 267, 13, 5, 0, 0, 6.283); g.fill();
    oCottage(g, 28, 392, 98, "#a8442e", "#d9c9a6"); oCottage(g, 676, 392, 98, "#3f6aa8", "#d9c9a6");
    for (const [lx, ly] of [[250, 238], [550, 238], [300, 432], [500, 432]]) oLantern(g, lx, ly);
    g.fillStyle = "#6b4a2a"; g.fillRect(168, 365, 64, 8); g.fillRect(172, 373, 5, 9); g.fillRect(223, 373, 5, 9);                 // bench near the elder
    for (const [tx, ty, ts] of [[40, 150, 1], [34, 255, 1.1], [762, 150, 1], [766, 250, 1.1], [60, 330, 0.9], [742, 320, 0.9], [190, 175, 0.8], [610, 170, 0.8]]) oTree(g, tx, ty, ts, "#2f7a3a", "#3d9148");
    for (let i = 0; i < 40; i++) { const x = R(40, 760), y = R(130, 490), ell = ((x - 400) / 215) ** 2 + ((y - 305) / 130) ** 2; if (ell > 1 && !(y < 260 && GX.some(gx => Math.abs(x - gx) < 34)) && !(y > 380 && (x < 140 || x > 660))) { if (rng() < 0.4) oBush(g, x, y, R(0.8, 1.1), "#3b8a42"); else oFlower(g, x, y, ["#ff7a9a", "#ffd34a", "#a98cff", "#ffffff"][i % 4]); } }
  } else if (stage === 6) {                                              // ---- Greenwood
    g.lineCap = "round"; for (const [w, col] of [[54, "#5a4328"], [44, "#76593a"]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(24, 262); g.bezierCurveTo(240, 180, 520, 350, 776, 262); g.stroke(); }
    for (let i = 0; i < 60; i++) { g.fillStyle = rng() < 0.5 ? "#6b5030" : "#8a6c46"; g.fillRect(R(40, 760), 235 + R(0, 50) + Math.sin(i) * 20, 3, 2); }
    for (let i = 0; i < 16; i++) { const x = R(40, 760), y = rng() < 0.5 ? R(86, 150) : R(410, 485); if (Math.abs(y - 262) < 70) continue; oTree(g, x, y, R(0.8, 1.25), "#2d7a3a", "#3a9448"); }
    for (let i = 0; i < 34; i++) { const x = R(40, 760), y = R(120, 480); if (Math.abs(y - (262 + Math.sin(x / 130) * 55)) < 44) continue; const q = rng(); if (q < 0.35) oBush(g, x, y, R(0.7, 1), "#2f7e3c"); else if (q < 0.6) oFlower(g, x, y, ["#ff7a9a", "#ffd34a", "#ffffff"][i % 3]); else if (q < 0.8) oMush(g, x, y, "#d0483c", false); else oRock(g, x, y, R(0.5, 0.8), "#7c8486"); }
    g.fillStyle = "#5a3d22"; g.beginPath(); g.roundRect(300, 420, 70, 16, 7); g.fill(); g.fillStyle = "#8a6a44"; g.beginPath(); g.ellipse(300, 428, 5, 8, 0, 0, 6.283); g.fill();     // fallen log
    for (let i = 0; i < 7; i++) { g.fillStyle = "rgba(255,255,190,.07)"; g.beginPath(); g.arc(R(60, 740), R(120, 460), R(30, 60), 0, 6.283); g.fill(); }
  } else if (stage === 7) {                                              // ---- Sunken Mire
    for (let i = 0; i < 8; i++) { const x = R(70, 730), y = rng() < 0.5 ? R(100, 200) : R(330, 470); g.fillStyle = "#183c3c"; g.beginPath(); g.ellipse(x, y, R(36, 70), R(16, 28), 0, 0, 6.283); g.fill(); g.fillStyle = "#1f5a62"; g.beginPath(); g.ellipse(x, y, R(30, 60) * 0.9, R(12, 24) * 0.9, 0, 0, 6.283); g.fill(); g.strokeStyle = "rgba(160,240,230,.25)"; g.lineWidth = 1; g.beginPath(); g.ellipse(x - 6, y - 3, 18, 6, 0, 0, 6.283); g.stroke(); g.fillStyle = "#3f8a4a"; g.beginPath(); g.ellipse(x + R(-20, 20), y + R(-5, 5), 6, 3, 0, 0, 6.283); g.fill(); }
    g.fillStyle = "#4a3320"; g.fillRect(24, 240, 752, 46); for (let x = 24; x < 776; x += 26) { g.fillStyle = (x / 26) % 2 ? "#6b4a2c" : "#785535"; g.fillRect(x, 242, 24, 42); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x + 23, 242, 2, 42); }
    g.fillStyle = "#3a2716"; for (const px0 of [60, 260, 460, 660]) { g.fillRect(px0, 232, 6, 60); }
    for (let i = 0; i < 18; i++) { const x = R(40, 760), y = rng() < 0.5 ? R(95, 215) : R(310, 480); g.strokeStyle = "#4f8a52"; g.lineWidth = 1.6; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 3, y); g.lineTo(x + k * 5, y - R(10, 20)); g.stroke(); } g.fillStyle = "#6b4a2a"; g.fillRect(x - 1, y - 20, 3, 8); }
    for (let i = 0; i < 12; i++) oMush(g, R(40, 760), rng() < 0.5 ? R(100, 220) : R(320, 480), rng() < 0.5 ? "#4fd8c0" : "#a98cff", true);
    for (const [tx, ty] of [[50, 120], [160, 96], [640, 100], [748, 130], [60, 440], [740, 450]]) oDead(g, tx, ty, R(0.9, 1.2));
    for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(180,255,230,.05)"; g.beginPath(); g.arc(R(60, 740), R(120, 460), R(50, 90), 0, 6.283); g.fill(); }
  } else {                                                               // ---- Shattered Coast
    const sea = g.createLinearGradient(0, 430, 0, H); sea.addColorStop(0, "#3a86c0"); sea.addColorStop(1, "#16406e"); g.fillStyle = "#b59f74"; g.fillRect(0, 405, W, 32); g.fillStyle = sea; g.fillRect(0, 432, W, H - 432);
    g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= W; x += 8) { const y = 432 + Math.sin(x / 24) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 2; for (let r = 0; r < 3; r++) { g.beginPath(); for (let x = 0; x <= W; x += 8) { const y = 452 + r * 18 + Math.sin(x / 30 + r) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.lineCap = "round"; g.strokeStyle = "#b89f70"; g.lineWidth = 50; g.beginPath(); g.moveTo(24, 262); g.bezierCurveTo(240, 330, 520, 190, 776, 262); g.stroke(); g.strokeStyle = "#dccb9e"; g.lineWidth = 40; g.beginPath(); g.moveTo(24, 262); g.bezierCurveTo(240, 330, 520, 190, 776, 262); g.stroke();
    for (const [rx, ry] of [[140, 120], [520, 100], [700, 160], [90, 360], [620, 380], [330, 395]]) oRock(g, rx, ry, R(0.9, 1.5), "#7d8290");
    g.strokeStyle = "#5a3d22"; g.lineWidth = 5; for (const [wx, wy] of [[610, 150], [180, 360]]) { g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(wx, wy + 20, 70, 12, 0, 0, 6.283); g.fill(); g.beginPath(); g.moveTo(wx - 60, wy + 20); g.lineTo(wx + 60, wy + 20); g.stroke(); for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(wx + i * 22, wy + 20, 36 - Math.abs(i) * 6, Math.PI, 0); g.stroke(); } }
    for (let i = 0; i < 26; i++) { const x = R(40, 760), y = R(110, 400); if (Math.abs(y - 262) < 36) continue; const q = rng(); if (q < 0.4) { g.fillStyle = "#f2b8c0"; g.beginPath(); g.ellipse(x, y, 3, 2, 0.4, 0, 6.283); g.fill(); } else if (q < 0.7) { g.fillStyle = "#e8873a"; g.fillRect(x - 3, y - 1, 6, 2); g.fillRect(x - 1, y - 3, 2, 6); } else { g.save(); g.translate(x, y); g.rotate(R(0, 3)); g.fillStyle = "#6b4a2c"; g.fillRect(-12, -2, 24, 4); g.restore(); } }
    for (let i = 0; i < 4; i++) { g.fillStyle = "#6fb6e8"; g.beginPath(); g.ellipse(R(80, 720), R(330, 400), 18, 6, 0, 0, 6.283); g.fill(); }
  }
  // outer walls, then a foliage or rock fringe over the top
  bricks(g, 0, 0, W, 54, th); bricks(g, 0, 54, 18, H - 54, th); bricks(g, W - 18, 54, 18, H - 54, th); bricks(g, 0, H - 18, W, 18, th);
  if (stage <= 7) {
    const cols = stage === 7 ? ["#1d3a30", "#27483c", "#335a49"] : stage === 6 ? ["#1c5a2c", "#256a35", "#2f8040"] : ["#256b34", "#2f8040", "#3b9a4c"];
    for (let i = 0; i < 46; i++) { g.fillStyle = cols[i % 3]; g.beginPath(); g.arc(R(0, W), R(8, 52), R(11, 20), 0, 6.283); g.fill(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.arc(R(0, W), R(6, 36), R(3, 8), 0, 6.283); g.fill(); }
  } else {
    for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? "#6a6f7c" : "#8a8fa0"; g.beginPath(); g.moveTo(R(0, W), 54); g.lineTo(R(0, W), R(6, 30)); g.lineTo(R(0, W), 54); g.fill(); }
  }
  g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(0, 46, W, 8); g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 54, W, 1);
  const a3 = g.createLinearGradient(0, H - 18, 0, H - 64); a3.addColorStop(0, "rgba(0,0,0,.45)"); a3.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = a3; g.fillRect(18, H - 64, W - 36, 46);
  const sh = g.createLinearGradient(0, 54, 0, 84); sh.addColorStop(0, "rgba(0,0,0,.4)"); sh.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sh; g.fillRect(18, 54, W - 36, 30);
  return c;
}

/* ---- the village: gates and townsfolk ---- */
const NPCS = [{ id: "marn", name: "Elder Marn", x: 205, y: 335 }, { id: "pip", name: "Pip", x: 592, y: 345 }];
function drawGate(r, t) {
  const x = r.gx, done = state.story.done.includes(r.id), locked = !r.req.every(q => state.story.done.includes(q));
  const gt = state.gate && state.gate.id === r.id ? state.gate : null;
  const stone = locked ? "#5d616c" : "#8a90a0", dk = locked ? "#44474f" : "#646a7a";
  px(x - 44, 101, 88, 6, "rgba(0,0,0,.28)");
  px(x - 38, 24, 18, 78, stone); px(x - 38, 24, 5, 78, "rgba(255,255,255,.16)"); px(x - 24, 24, 4, 78, dk);
  px(x + 20, 24, 18, 78, stone); px(x + 20, 24, 5, 78, "rgba(255,255,255,.16)"); px(x + 34, 24, 4, 78, dk);
  ctx.fillStyle = stone; ctx.beginPath(); ctx.moveTo(x - 42, 42); ctx.quadraticCurveTo(x, -8, x + 42, 42); ctx.lineTo(x + 20, 48); ctx.quadraticCurveTo(x, 24, x - 20, 48); ctx.closePath(); ctx.fill();
  rr(x - 7, 6, 14, 13, 2, locked ? "#4a4c54" : done ? "#f2c94c" : "#caa84a");
  const ox = x - 20, oy = 46, ow = 40, oh = 56;
  if (locked) {
    px(ox, oy, ow, oh, "#0e1016"); for (let i = 0; i < 5; i++) px(ox + 4 + i * 8, oy, 3, oh, "#6b7280"); px(ox, oy + 26, ow, 4, "#6b7280");
    px(x - 7, oy + 22, 14, 12, "#d4a73c"); ctx.strokeStyle = "#d4a73c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, oy + 22, 5, Math.PI, 0); ctx.stroke(); px(x - 1, oy + 26, 2, 4, "#2a2418");
  } else {
    const gr = ctx.createLinearGradient(0, oy, 0, oy + oh); gr.addColorStop(0, `rgba(${r.col},.95)`); gr.addColorStop(1, `rgba(${r.col},.3)`); ctx.fillStyle = gr; ctx.fillRect(ox, oy, ow, oh);
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, ow, oh); ctx.clip(); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x, oy + 36, 8 + i * 7 + Math.sin(t * 0.004 + i) * 2, 22 + i * 4, 0, 0, 6.283); ctx.stroke(); } ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = "lighter"; const gl = ctx.createRadialGradient(x, oy + 36, 4, x, oy + 36, 78); gl.addColorStop(0, `rgba(${r.col},.38)`); gl.addColorStop(1, `rgba(${r.col},0)`); ctx.fillStyle = gl; ctx.fillRect(x - 80, oy - 40, 160, 160); ctx.restore();
  }
  if (done) { const sy = 14 + Math.sin(t * 0.004 + x) * 2; ctx.save(); ctx.shadowColor = "#ffd34a"; ctx.shadowBlur = 10; ctx.fillStyle = "#ffd34a"; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 4 : 9; ctx.lineTo(x + Math.cos(a) * rad, sy + 10 + Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); ctx.restore(); }
  if (gt && !gt.locked) { ctx.strokeStyle = "rgba(255,235,150,.95)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, oy + oh - 6, 28, -Math.PI / 2, -Math.PI / 2 + 6.283 * gt.p); ctx.stroke(); }
  ctx.font = "bold 9px 'Press Start 2P',monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillText(r.name.toUpperCase(), x + 1, 125); ctx.fillStyle = locked ? "#9aa1b0" : "#fff2c4"; ctx.fillText(r.name.toUpperCase(), x, 124);
  ctx.font = "bold 8px 'Press Start 2P',monospace"; ctx.fillStyle = locked ? "#c06a6a" : done ? "#ffd34a" : `rgb(${r.col})`; ctx.fillText(locked ? "SEALED" : done ? "CLEARED" : "OPEN", x, 138);
}
function drawMarn(x, y, t) {
  shadow(x, y + 24, 16); const b = Math.sin(t * 0.003) * 1;
  blob(x, y + 8 + b, 14, 19, "#5a3d8a"); blob(x, y + 12 + b, 14, 12, "#6d4aa8"); rr(x - 13, y + 4 + b, 26, 3, 1, "#e8c452");
  ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.beginPath(); ctx.ellipse(x - 5, y + 2 + b, 4, 12, 0.2, 0, 6.283); ctx.fill();
  ball(x, y - 14 + b, 8, "#e8c4a0"); blob(x, y - 6 + b, 7.5, 9.5, "#f1eee6"); blob(x - 3, y - 4 + b, 3, 6, "#e2ded2");
  ball(x - 3, y - 15 + b, 1.1, "#2a2018"); ball(x + 3, y - 15 + b, 1.1, "#2a2018"); px(x - 6, y - 19 + b, 5, 1.5, "#f1eee6"); px(x + 1, y - 19 + b, 5, 1.5, "#f1eee6");
  ctx.fillStyle = "#4b2f78"; ctx.beginPath(); ctx.moveTo(x - 12, y - 20 + b); ctx.lineTo(x + 3, y - 46 + b + Math.sin(t * 0.004) * 1.5); ctx.lineTo(x + 12, y - 20 + b); ctx.closePath(); ctx.fill(); blob(x, y - 20 + b, 14, 3.5, "#3d2860");
  px(x + 17, y - 22, 3, 52, "#6b4a2a"); const pu = 4.5 + Math.sin(t * 0.006) * 1; ctx.save(); ctx.shadowColor = "#8fe0ff"; ctx.shadowBlur = 12; ball(x + 18.5, y - 26, pu, "#8fe0ff"); ctx.restore(); ball(x + 17, y - 28, 1.6, "#ffffff");
}
function drawPip(x, y, t) {
  const sx = x + 28;
  shadow(sx + 46, y + 28, 52);
  px(sx, y - 6, 94, 32, "#7a5632"); px(sx, y - 6, 94, 5, "#9a7244"); px(sx + 2, y + 18, 90, 6, "#5a3d22");
  for (let i = 0; i < 6; i++) px(sx - 4 + i * 16, y - 44, 16, 22, i % 2 ? "#f4efe2" : "#c9503a");
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(sx - 4, y - 24, 96, 3); px(sx + 2, y - 44, 3, 40, "#5a3d22"); px(sx + 87, y - 44, 3, 40, "#5a3d22");
  for (const [bx, col] of [[sx + 10, "#e8405a"], [sx + 28, "#4aa8ff"], [sx + 46, "#7be0a0"], [sx + 64, "#ffd34a"]]) { rr(bx, y - 16, 9, 10, 2, col); px(bx + 3, y - 20, 3, 4, "#e8e0cc"); }
  ctx.font = "bold 7px 'Press Start 2P',monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#fff2c4"; ctx.fillText("SUPPLIES", sx + 46, y + 11);
  shadow(x, y + 24, 14); const b = Math.sin(t * 0.0045 + 1) * 1;
  blob(x - 8, y + 4 + b, 9, 12, "#6b4a2a"); blob(x - 9, y + 8 + b, 7, 6, "#82592f");
  blob(x, y + 8 + b, 13, 16, "#3a7a4a"); rr(x - 10, y + 6 + b, 20, 16, 4, "#e8e0cc"); px(x - 10, y + 6 + b, 20, 2, "rgba(0,0,0,.12)");
  ball(x, y - 10 + b, 8, "#e8c4a0"); ball(x - 3, y - 11 + b, 1.1, "#2a2018"); ball(x + 3, y - 11 + b, 1.1, "#2a2018"); blob(x, y - 6 + b, 5, 1.8, "#4a2f1a");
  ctx.fillStyle = "#c9503a"; ctx.beginPath(); ctx.ellipse(x, y - 16 + b, 9, 6, 0, Math.PI, 0); ctx.fill(); px(x - 2, y - 17 + b, 11, 3, "#a83a2a");
}
function nearNpc() {
  if (!state || !myId) return null; const me = state.players.find(p => p.id === myId); if (!me) return null;
  let best = null, bd = 78; for (const n of NPCS) { const d = Math.hypot(me.x - (n.id === "pip" ? n.x + 40 : n.x), me.y - n.y); if (d < bd) { bd = d; best = n; } } return best;
}
function drawHub(t) {
  if (!state || state.scene !== "hub" || !state.story) return;
  REGIONS_C.forEach(r => drawGate(r, t));
  drawMarn(NPCS[0].x, NPCS[0].y, t); drawPip(NPCS[1].x, NPCS[1].y, t);
  for (let i = 0; i < 5; i++) { const a = t * 0.004 + i * 1.3; ctx.fillStyle = "rgba(220,245,255,.7)"; ctx.fillRect(400 + Math.cos(a) * 14, 270 + (a * 6) % 18 - Math.sin(a) * 2, 2, 2); }   // fountain spray
  const n = nearNpc();
  if (n && !dlgActive) { const bx = n.id === "pip" ? n.x : n.x, by = n.y - 64; ctx.font = "bold 8px 'Press Start 2P',monospace"; const w = ctx.measureText(n.name.toUpperCase() + ": SPACE").width + 16; rr(bx - w / 2, by - 12, w, 20, 5, "rgba(8,12,20,.85)"); ctx.fillStyle = "#ffe08a"; ctx.textAlign = "center"; ctx.fillText(n.name.toUpperCase() + ": SPACE", bx, by + 2); }
}

/* ---- dialogue ---- */
let dlgActive = false, dlgQ = [], dlgFull = "", dlgTimer = null, dlgEnd = null, capTimer = null;
function say(lines, onEnd) { $("cap").classList.add("hidden"); dlgQ = lines.slice(); dlgEnd = onEnd || null; dlgActive = true; $("dlg").classList.remove("hidden"); dlgShow(); }
function dlgShow() {
  const l = dlgQ.shift(); if (!l) return endDlg();
  dlgFull = l[1]; $("dlgName").textContent = l[0]; const el = $("dlgText"); let i = 0; clearInterval(dlgTimer); el.textContent = "";
  dlgTimer = setInterval(() => { i += 2; el.textContent = dlgFull.slice(0, i); if (i >= dlgFull.length) { clearInterval(dlgTimer); dlgTimer = null; } }, 22);
}
function dlgNext() { if (dlgTimer) { clearInterval(dlgTimer); dlgTimer = null; $("dlgText").textContent = dlgFull; return; } dlgShow(); }
function endDlg() { dlgActive = false; clearInterval(dlgTimer); dlgTimer = null; $("dlg").classList.add("hidden"); const f = dlgEnd; dlgEnd = null; if (f) f(); }
$("dlg").addEventListener("pointerdown", e => { e.preventDefault(); dlgNext(); });
function narrate(who, text) { const c = $("cap"); c.innerHTML = `<b>${who}</b> ${text}`; c.classList.remove("hidden"); clearTimeout(capTimer); capTimer = setTimeout(() => c.classList.add("hidden"), 5500); }

const MARN = "Elder Marn";
const BEATS = {
  intro: [[MARN, "Easy, travelers. You made it to Emberfall. Not many do these days."], [MARN, "The Dragon of Debt took the Keep on the hill and swore the whole valley owes him. Every road now pays a toll."], [MARN, "Three Wardens collect it, one in Greenwood, one in the Sunken Mire and one on the Shattered Coast. Each guards a sigil."], [MARN, "Bring me all three and the Keep's seal will break. Walk into the Greenwood gate to begin. Press Space near me or Pip when you need us."]],
  greenwood: [[MARN, "The Thorn sigil! Feel it hum? The Warden's grip on Greenwood is broken."], [MARN, "The Sunken Mire is next. Hexers there fire slowing orbs, so keep moving. Visit Pip first, gold is no good in a swamp."]],
  mire: [[MARN, "The Bog sigil. The Mire Mother ran a tight swamp, I will give her that. Two down."], [MARN, "The coast bites back. Archers on the cliffs, and the Tidebreaker in the cove. Stay close to your partner."]],
  coast: [[MARN, "All three sigils! Hear that crack? The Keep's seal is breaking, and the Dragon knows you are coming."], [MARN, "Rest, spend your gold and gear up. When you are ready, the gate on the right leads to the Keep of Debt."]]
};
const ENTER = { greenwood: ["Greenwood", "The old road is overgrown. Something heavy has been stomping through it."], mire: ["Sunken Mire", "The mire swallows sound. Watch for orbs that slow you down."], coast: ["Shattered Coast", "Wreckage and gulls. And archers, always archers."], keep: ["Keep of Debt", "Every stone here has a price tag. Find the key, reach the dragon."] };
function marnHint() {
  const d = state.story.done;
  if (!d.includes("greenwood")) return [[MARN, "Start with the Greenwood gate, top left. The Thorn Warden holds the first sigil. Stay together and dash out of red rings."]];
  if (!d.includes("mire")) return [[MARN, "The Sunken Mire is next. Hexers slow you down, so keep moving. Bombers are loud for a reason."]];
  if (!d.includes("coast")) return [[MARN, "Only the coast remains. Archers on the cliffs, and the Tidebreaker waits in the cove. Spend your gold with Pip first."]];
  return [[MARN, "Three sigils, and the Keep's seal is cracked. The gate on the right leads to the Dragon of Debt. Bring everything you have."]];
}
let pipMet = false;
function hubInteract() {
  if (!state || state.scene !== "hub" || !state.story || dlgActive || state.waiting) return false;
  const n = nearNpc(); if (!n) return false;
  if (n.id === "marn") say(marnHint());
  else say(pipMet ? [["Pip", "Back again! Take a look."]] : [["Pip", "Gold? Wonderful. I mean, welcome! Hearts, quicker feet, tougher swings. Everything is priced fairly. Mostly."]], () => { pipMet = true; hubShopOpen = true; shopSig = ""; updateShop(); });
  return true;
}

/* ---- hub shop ---- */
let hubShopOpen = false;
function closeHubShop() { hubShopOpen = false; shopSig = ""; $("shop").classList.add("hidden"); }
function hubShopRender(el) {
  const me = state.players.find(p => p.id === myId), sig = ["hub", state.gold, JSON.stringify(me && me.up)].join("|");
  if (sig === shopSig) return; shopSig = sig;
  el.innerHTML = `<h2>PIP'S SUPPLIES</h2><div class="gold">🪙 ${state.gold} gold. Gold carries between trips.</div><div class="shopgrid">` +
    SHOP.map(it => { const lv = (me && me.up[it.id]) || 0, maxed = it.max && lv >= it.max, can = state.gold >= it.cost && !maxed;
      return `<div class="item"><b>${it.name}${it.max ? ` (${lv}/${it.max})` : ""}</b><span>${it.desc}</span><button data-buy="${it.id}" ${can ? "" : "disabled"}>${maxed ? "MAXED" : "BUY — " + it.cost + " 🪙"}</button></div>`; }).join("") +
    `</div><button class="primary" data-close="1" style="padding:14px 26px">CLOSE</button>`;
  el.classList.remove("hidden");
}

/* ---- world map ---- */
let mapOpen = false;
function toggleMap() { if (!state || !state.story) return; mapOpen = !mapOpen; $("mapOv").classList.toggle("hidden", !mapOpen); if (mapOpen) drawWorldMap(); }
$("mapBtn").onclick = toggleMap; $("mapClose").onclick = toggleMap;
function drawWorldMap() {
  const cv = $("mapCv"), g = cv.getContext("2d"), Wm = cv.width, Hm = cv.height, done = state.story.done;
  const bgG = g.createLinearGradient(0, 0, Wm, Hm); bgG.addColorStop(0, "#d8c496"); bgG.addColorStop(1, "#bfa56f"); g.fillStyle = bgG; g.fillRect(0, 0, Wm, Hm);
  g.strokeStyle = "#6b4a2a"; g.lineWidth = 6; g.strokeRect(3, 3, Wm - 6, Hm - 6);
  const rng = mulberry(9);
  for (let i = 0; i < 28; i++) { const x = 30 + rng() * (Wm - 60), y = 30 + rng() * (Hm - 60); g.fillStyle = "rgba(60,110,50,.35)"; g.beginPath(); g.arc(x, y, 6 + rng() * 6, 0, 6.283); g.fill(); }
  g.fillStyle = "rgba(60,120,190,.5)"; g.beginPath(); g.moveTo(Wm * 0.38, Hm); g.quadraticCurveTo(Wm * 0.55, Hm * 0.8, Wm * 0.75, Hm); g.fill();
  g.fillStyle = "rgba(60,120,190,.4)"; g.beginPath(); g.ellipse(Wm * 0.78, -6, Wm * 0.22, 46, 0, 0, 6.283); g.fill();
  const P = { home: [330, 290], greenwood: [100, 205], mire: [220, 105], coast: [420, 88], keep: [560, 190] };
  const road = [P.home, P.greenwood, P.mire, P.coast, P.keep];
  g.setLineDash([9, 7]); g.strokeStyle = "#6b4a2a"; g.lineWidth = 4; g.beginPath(); road.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.beginPath(); g.moveTo(P.home[0], P.home[1]); g.lineTo(P.keep[0], P.keep[1]); g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1; g.setLineDash([]);
  const node = (id, [x, y], label, col, icon) => {
    const isDone = done.includes(id), reg = REGIONS_C.find(r => r.id === id), locked = reg && !reg.req.every(q => done.includes(q));
    g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(x, y + 16, 24, 7, 0, 0, 6.283); g.fill();
    g.fillStyle = locked ? "#6b6f78" : isDone ? "#e8b92c" : `rgb(${col})`; g.beginPath(); g.arc(x, y, 20, 0, 6.283); g.fill(); g.strokeStyle = "#3a2a18"; g.lineWidth = 3; g.stroke();
    g.font = "20px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#1a1208"; g.fillText(locked ? "🔒" : icon, x, y + 1);
    g.textBaseline = "alphabetic"; g.font = "bold 9px 'Press Start 2P',monospace"; g.fillStyle = "#2a1c0c"; g.fillText(label, x, y + 38); if (isDone) { g.fillStyle = "#7a5a00"; g.fillText("CLEARED", x, y + 50); }
  };
  node("home", P.home, "EMBERFALL", "250,200,110", "🏠"); REGIONS_C.forEach(r => node(r.id, P[r.id], r.name.toUpperCase(), r.col, r.icon));
  const here = state.scene === "hub" ? P.home : (P[state.region] || P.home); g.fillStyle = "#ff3b3b"; g.beginPath(); g.moveTo(here[0], here[1] - 34); g.lineTo(here[0] - 8, here[1] - 48); g.lineTo(here[0] + 8, here[1] - 48); g.closePath(); g.fill();
  g.font = "bold 9px 'Press Start 2P',monospace"; g.fillStyle = "#2a1c0c"; g.textAlign = "left"; g.fillText("THE VALLEY OF EMBERFALL", 16, Hm - 14);
}

/* ---- state hooks ---- */
let hudMode = "";
function storyHud() {
  const story = state && state.story, ek = $("enemyLabel").previousElementSibling, kk = $("keyLabel").previousElementSibling;
  $("mapBtn").classList.toggle("hidden", !story);
  if (!story) { if (hudMode) { ek.textContent = "ENEMIES"; kk.textContent = "DUNGEON KEY"; hudMode = ""; } return; }
  const mode = state.scene === "hub" ? "hub" : "run"; if (mode !== hudMode) { hudMode = mode; ek.textContent = mode === "hub" ? "SIGILS" : "ENEMIES"; kk.textContent = mode === "hub" ? "TOWN" : "DUNGEON KEY"; }
  if (state.scene === "hub") {
    $("roomLabel").textContent = "Emberfall Village";
    $("enemyLabel").textContent = REGIONS_C.slice(0, 3).map(r => r.icon + (state.story.done.includes(r.id) ? "✔" : "–")).join(" ");
    $("keyLabel").textContent = "🏠 Safe";
  } else { const r = REGIONS_C.find(x => x.id === state.region); $("roomLabel").textContent = `${r ? r.name : ""} ${state.stage + 1}/${state.stageTotal}: ${state.roomName}`; }
}
function storyOverlay(ended) {
  if (!state || !state.story) return;
  const rb = $("resultBox");
  if (state.finished && state.result && state.result.story) {
    const r = state.result, mm = Math.floor(r.time / 60), ss = String(r.time % 60).padStart(2, "0");
    $("overlayTitle").textContent = "EMBERFALL IS FREE!"; $("overlayText").textContent = "The Dragon of Debt is gone and every ledger in the valley burns. Emberfall lights its hearth again. Thank you for playing!";
    rb.innerHTML = `<div class="result"><div class="big">STORY COMPLETE</div><div>Keep run ${mm}:${ss} • Gold ${r.gold} • Kills ${r.kills} • Falls ${r.downs}</div><table><tr><th>HERO</th><th>KILLS</th><th>CHESTS</th><th>REVIVES</th><th>HEARTS</th></tr>${r.players.map(p => `<tr><td>${p.cls === "knight" ? "🛡" : "🎸"} ${p.name}</td><td>${p.kills}</td><td>${p.chests}</td><td>${p.revives}</td><td>${p.hearts}</td></tr>`).join("")}</table></div>`;
  } else if (state.gameOver) { $("overlayText").textContent = "The road was too hard. Retry the room, or fall back to Emberfall with your gold and gear."; }
  if (ended) { const b = $("rematchBtn"); b.textContent = iVoted && state.needRematch > 1 ? `WAITING FOR TEAMMATE (${state.rematch}/${state.needRematch})` : "BACK TO VILLAGE"; }
}
function storyOnState(s) {
  if (!s.story) { if (mapOpen) toggleMap(); return; }
  let ch = false; for (const id of s.story.done) if (!WORLD.done.includes(id)) { WORLD.done.push(id); ch = true; } if (ch) saveWorld();
  if (s.scene !== "hub" && hubShopOpen) closeHubShop();
  if (s.scene === "hub") $("cap").classList.add("hidden");
  if (s.scene === "hub") {
    if (hubShopOpen) { const me = s.players.find(p => p.id === myId); if (me && Math.hypot(me.x - 630, me.y - 345) > 210) closeHubShop(); }
    if (!dlgActive && !s.waiting && !s.paused && !s.finished && !s.gameOver) {
      if (!WORLD.seen.intro) { WORLD.seen.intro = 1; saveWorld(); say(BEATS.intro); }
      else for (const id of ["greenwood", "mire", "coast"]) if (s.story.done.includes(id) && !WORLD.seen["done_" + id]) { WORLD.seen["done_" + id] = 1; saveWorld(); say(BEATS[id]); break; }
    }
  } else if (s.stage === 0 && ENTER[s.region] && !WORLD.seen["enter_" + s.region]) { WORLD.seen["enter_" + s.region] = 1; saveWorld(); narrate(ENTER[s.region][0], ENTER[s.region][1]); }
  if (mapOpen) drawWorldMap();
}
function storyEsc() { if (dlgActive) { dlgQ = []; endDlg(); return true; } if (hubShopOpen) { closeHubShop(); return true; } if (mapOpen) { toggleMap(); return true; } return false; }
