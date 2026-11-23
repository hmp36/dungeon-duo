// Riff & Shield 3D view (opt-in beta). Draws the server's flat 2D game state on a 3D toon-shaded stage.
// Gameplay, networking and UI are untouched: this only replaces what is drawn behind the HTML HUD.
import * as THREE from "three";

const S = 1 / 20, FW = 800, FH = 520;                         // world pixels -> scene units; play field size
const X = x => x * S, Z = y => y * S;
const FACE = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
let cloudMap = null;
const mobile = matchMedia("(pointer:coarse)").matches;
const LOW = mobile || (navigator.hardwareConcurrency || 8) <= 4;

/* ---------------------------------------------------------------- palettes (index = server theme) */
const dungeon = (ground, ground2, wall, torch, fog) => ({ dungeon: true, sky: ["#07080d", "#161a26"], ground: [ground, ground2], wall, torch, fog, hemi: ["#b4bce0", "#6a6070", 1.25], sun: ["#c8d0ff", 1.9], grass: null });
const PAL = [
  dungeon("#6a7088", "#5a6078", "#7a7690", "#ffb347", "#1a1d2a"),
  dungeon("#587a6c", "#486a5c", "#6a8a72", "#8dffbd", "#122018"),
  dungeon("#6a7290", "#5a6280", "#7480a0", "#9ad0ff", "#181c2a"),
  dungeon("#9a8454", "#86724a", "#a8925a", "#ffd86b", "#2a2214"),
  dungeon("#8a4e4a", "#764040", "#94544e", "#ff6a3c", "#2a1414"),
  { sky: ["#6fb4e8", "#f6e3b4"], ground: ["#8fc46a", "#6fae55"], fog: "#e9e2c3", hemi: ["#cfe6ff", "#7a9a5a", 1.0], sun: ["#fff0c8", 2.4], grass: ["#4f9a3c", "#c4e56a"], tree: ["#4a9a45", "#7fc65a", "#a7da6c"] },
  { sky: ["#5fa8e6", "#f4e4b0"], ground: ["#86c466", "#64a850"], fog: "#e6e4bf", hemi: ["#cfe6ff", "#6f9a55", 1.0], sun: ["#fff0c0", 2.5], grass: ["#478f38", "#bde064"], tree: ["#3f8f46", "#6fbf58", "#a0d86a"] },   // Greenwood
  { sky: ["#6f8f8f", "#c7d4b0"], ground: ["#5f8a5a", "#4a7348"], fog: "#aebf9e", hemi: ["#bfd6cf", "#4d6a4a", 0.9], sun: ["#e8f0c8", 1.5], grass: ["#3d7a4a", "#8fc27a"], tree: ["#3a7048", "#5f9a60", "#86b878"] },   // Mire
  { sky: ["#4fa6ea", "#fbe8c0"], ground: ["#e2cf9a", "#cdb97f"], fog: "#f1e6c8", hemi: ["#d8ecff", "#b8a470", 1.0], sun: ["#fff2cc", 2.6], grass: ["#b7b05a", "#e8e08a"], tree: ["#58a860", "#8ccf78", "#b4e08a"] },   // Coast
  { sky: ["#ff9f6b", "#ffe3a8"], ground: ["#b9d46a", "#98c058"], fog: "#f7dcae", hemi: ["#ffe1c0", "#9aa860", 1.0], sun: ["#ffd9a0", 2.6], grass: ["#7fae3f", "#f0d86a"], tree: ["#e8a23c", "#f0c25a", "#f6d880"] }      // Fairground
];

/* ---------------------------------------------------------------- renderer, camera, lights */
const canvas = document.createElement("canvas");
canvas.id = "gl3d"; canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:none";
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.25 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 800 / 520, 1, 600);
const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1), sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(-18, 40, 10); sun.target.position.set(20, 0, 13);
sun.castShadow = !LOW; sun.shadow.mapSize.set(LOW ? 512 : 2048, LOW ? 512 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 1, far: 120 });
scene.add(hemi, sun, sun.target);

const ramp = (() => { const d = new Uint8Array([70, 150, 255]), t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
const OUT = 0x2b1d14;
function outline(mesh, t = 0.05, col = OUT) {                   // inverted-hull ink line, the cheap way to get a painted edge
  const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide });
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = position + normal * ${t.toFixed(3)};`); };
  const o = new THREE.Mesh(mesh.geometry, m); o.userData.isOutline = true; mesh.add(o); return o;
}
function part(geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, line = 0.05, cast = true, parent } = {}) {
  const m = new THREE.Mesh(geo, toon(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = cast;
  if (line) outline(m, line / Math.max(0.5, Math.min(sx, sy, sz) * 0.9 + 0.1)); if (parent) parent.add(m); return m;
}
const G = { sph: new THREE.SphereGeometry(1, 16, 12), cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cone: new THREE.ConeGeometry(1, 1, 12), box: new THREE.BoxGeometry(1, 1, 1), ico: new THREE.IcosahedronGeometry(1, 1), tor: new THREE.TorusGeometry(1, 0.18, 8, 24) };
const C = c => new THREE.Color(c);
const rnd = (() => { let a = 12345; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();

/* ---------------------------------------------------------------- environment (rebuilt per theme) */
const env = new THREE.Group(); scene.add(env);
const uni = { time: { value: 0 }, heroes: { value: [new THREE.Vector3(-99, 0, -99), new THREE.Vector3(-99, 0, -99)] }, cloud: { value: null }, cloudOff: { value: new THREE.Vector2() } };
let envTheme = -1, torches = [], cloudTex = null;

function paintTex(c1, c2, size = 512, blots = 260, seed = 7) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size; const g = cv.getContext("2d");
  g.fillStyle = c1; g.fillRect(0, 0, size, size); const r = (() => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  for (let i = 0; i < blots; i++) {                              // soft watercolor blotches in two close tones
    const x = r() * size, y = r() * size, rad = 20 + r() * 70, c0 = r() < 0.7 ? c2 + "99" : "#ffffff14", c1 = c0.slice(0, 7) + "00";
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {                // draw wrapped copies so the tile has no seams
      const gx = x + ox, gy = y + oy; if (gx + rad < 0 || gx - rad > size || gy + rad < 0 || gy - rad > size) continue;
      const gr = g.createRadialGradient(gx, gy, 0, gx, gy, rad); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function cloudTexture() {
  const size = 256, cv = document.createElement("canvas"); cv.width = cv.height = size; const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 22; i++) { const x = rnd() * size, y = rnd() * size, rad = 30 + rnd() * 50, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, "rgba(120,130,150,.55)"); gr.addColorStop(1, "rgba(120,130,150,0)"); for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { g.save(); g.translate(ox, oy); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); } }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function skyDome(top, hor, sunCol) {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C(top) }, hor: { value: C(hor) }, sunCol: { value: C(sunCol) }, sunDir: { value: new THREE.Vector3(-18, 40, 10).normalize() } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform vec3 top,hor,sunCol,sunDir; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.1,0.,1.); vec3 c = mix(hor, top, pow(h,0.7)); float s = max(dot(normalize(vP), sunDir),0.); c += sunCol * (pow(s,64.)*0.9 + pow(s,6.)*0.18); gl_FragColor = linearToOutputTexel(vec4(c,1.)); }" });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), m); mesh.renderOrder = -1; return mesh;
}
function tree(p, x, z, s) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  part(G.cyl, "#7a5636", { x: 0, y: 1.3, sx: 0.38, sy: 2.6, sz: 0.38, parent: g, line: 0.06 });
  [[0, 3.6, 0, 1.9], [-0.9, 3.0, 0.4, 1.4], [0.9, 3.1, -0.3, 1.5]].forEach(([a, b, c, r], i) => { const m = part(G.ico, p.tree[i % 3], { x: a, y: b, z: c, sx: r, sy: r * 0.92, sz: r, parent: g, line: 0.06 }); m.rotation.y = rnd() * 3; });
  return g;
}
function buildEnv(theme) {
  scene.remove(env); env.clear(); scene.add(env); torches = [];
  const p = PAL[theme] || PAL[6], dun = !!p.dungeon;
  scene.fog = new THREE.Fog(C(p.fog), dun ? 40 : 90, dun ? 110 : 230); scene.background = C(p.fog);
  hemi.color.set(p.hemi[0]); hemi.groundColor.set(p.hemi[1]); hemi.intensity = p.hemi[2]; sun.color.set(p.sun[0]); sun.intensity = p.sun[1];
  env.add(skyDome(p.sky[0], p.sky[1], dun ? "#223" : p.sun[0]));
  const tex = paintTex(p.ground[0], p.ground[1], 512, 90, theme + 3); tex.repeat.set(10, 8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshLambertMaterial({ map: tex })); ground.rotation.x = -Math.PI / 2; ground.position.set(20, 0, 13); ground.receiveShadow = true; env.add(ground);
  if (!cloudTex) cloudTex = cloudTexture(); uni.cloud.value = cloudTex;
  if (!dun) {                                                        // drifting cloud shadows
    const ct = cloudTex.clone(); ct.needsUpdate = true; ct.repeat.set(3, 2.2); ct.userData = {}; cloudMap = ct;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshBasicMaterial({ map: ct, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(20, 0.03, 13); sh.userData.cloud = true; env.add(sh);
  }
  if (p.grass) {                                                     // wind-swept grass, bent by the heroes
    const n = LOW ? 2800 : 9000, geo = new THREE.PlaneGeometry(0.2, 1.0, 1, 3); geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { ...uni, base: { value: C(p.grass[0]) }, tip: { value: C(p.grass[1]) } },
      vertexShader: `uniform float time; uniform vec3 heroes[2]; varying float vH; varying vec3 vW; varying float vR;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){ vec4 w = instanceMatrix * vec4(position,1.); float h = uv.y; vH = h; vec3 base = (instanceMatrix * vec4(0.,0.,0.,1.)).xyz; vR = h21(base.xz);
          float sway = sin(time*1.7 + base.x*0.55 + base.z*0.35) * 0.30 + sin(time*3.1 + base.x*1.7) * 0.07;
          w.x += sway*h*h*0.9; w.z += cos(time*1.3 + base.z*0.5)*0.12*h*h;
          for(int i=0;i<2;i++){ vec2 d = base.xz - heroes[i].xz; float L = length(d); float f = smoothstep(1.7, 0.2, L); w.xz += normalize(d+0.001)*f*h*0.9; w.y -= f*h*0.35; }
          vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 base; uniform vec3 tip; uniform sampler2D cloud; uniform vec2 cloudOff; varying float vH; varying vec3 vW; varying float vR;
        void main(){ vec3 c = mix(base, tip, vH) * (0.85 + vR*0.3); float cs = texture2D(cloud, vW.xz*0.0189*3.0 + cloudOff).r; c *= mix(0.72, 1.0, cs); gl_FragColor = linearToOutputTexel(vec4(c,1.)); }` });
    mat.uniforms.cloud = uni.cloud; mat.uniforms.cloudOff = uni.cloudOff;
    const gr = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) { const x = -3 + rnd() * 46, z = -3 + rnd() * 32; e.set(0, rnd() * 3.14, 0); q.setFromEuler(e); const s = 0.6 + rnd() * 0.6; m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.5 + rnd() * 0.5), s)); gr.setMatrixAt(i, m4); }
    gr.frustumCulled = false; env.add(gr);
    const fl = new THREE.InstancedMesh(G.sph, new THREE.MeshToonMaterial({ gradientMap: ramp }), 120);   // little flowers
    const cols = theme === 9 ? ["#ffffff", "#ff5a4a", "#ffe14a"] : ["#ffffff", "#ffe36a", "#ff9ab8", "#9ec8ff"];
    for (let i = 0; i < 120; i++) { m4.compose(new THREE.Vector3(-2 + rnd() * 44, 0.28, -2 + rnd() * 30), q.identity(), new THREE.Vector3(0.1, 0.1, 0.1)); fl.setMatrixAt(i, m4); fl.setColorAt(i, C(cols[i % cols.length])); }
    env.add(fl);
  }
  if (!dun) {                                                        // trees ring the clearing; rocks scattered
    for (let i = 0; i < 70; i++) { const side = i % 4; let x, z; if (side === 0) { x = -9 + rnd() * 58; z = -5 - rnd() * 22; } else if (side === 1) { x = -9 + rnd() * 58; z = 33 + rnd() * 10; } else if (side === 2) { x = -4 - rnd() * 20; z = -3 + rnd() * 32; } else { x = 44 + rnd() * 20; z = -3 + rnd() * 32; } env.add(tree(p, x, z, (side === 1 ? 0.9 : 1.1) + rnd() * (side === 1 ? 0.6 : 1.4))); }
    for (let i = 0; i < 14; i++) { const x = -1 + rnd() * 42, z = -1 + rnd() * 28; if (x > 3 && x < 37 && z > 2.5 && z < 24) continue; const r = 0.5 + rnd() * 0.8; const m = part(G.ico, "#a9a79c", { x, y: r * 0.5, z, sx: r * 1.3, sy: r * 0.8, sz: r, line: 0.06 }); env.add(m); }
  } else {                                                           // stone walls and pillars for the dungeon rooms
    const wc = p.wall, wall = (x, z, w, d, h = 3.2) => { const m = part(G.box, wc, { x, y: h / 2, z, sx: w, sy: h, sz: d, line: 0.05 }); m.receiveShadow = true; env.add(m); };
    wall(20, 0.2, 46, 2.4); wall(20, 27.4, 46, 1.6, 0.9); wall(-1.2, 13.5, 1.6, 32, 0.9); wall(41.2, 13.5, 1.6, 32, 0.9);
    for (const x of [3, 14, 26, 37]) { const m = part(G.cyl, "#8b87a0", { x, y: 1.9, z: 1.9, sx: 0.8, sy: 3.8, sz: 0.8, line: 0.05 }); env.add(m); }
    [[4.5, 1.4], [20, 1.4], [35.5, 1.4]].forEach(([x, z]) => { const l = new THREE.PointLight(C(p.torch), 30, 34, 1.5); l.position.set(x, 3.2, z + 1); env.add(l); torches.push(l); const f = part(G.ico, p.torch, { x, y: 3.0, z: z + 0.6, sx: 0.22, sy: 0.34, sz: 0.22, line: 0, cast: false }); f.material = new THREE.MeshBasicMaterial({ color: C(p.torch) }); env.add(f); });
  }
  const exit = new THREE.Group(); exit.position.set(X(790), 0, 13); exit.userData.exit = true; env.add(exit);   // exit gate: glows when open
  [-2.6, 2.6].forEach(zz => part(G.cyl, "#8a8372", { x: 0, y: 1.6, z: zz, sx: 0.55, sy: 3.2, sz: 0.55, parent: exit })); part(G.box, "#8a8372", { x: 0, y: 3.3, z: 0, sx: 0.8, sy: 0.6, sz: 6.4, parent: exit });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); glow.rotation.y = Math.PI / 2; glow.position.y = 1.6; glow.name = "glow"; exit.add(glow);
  envTheme = theme;
}

/* ---------------------------------------------------------------- heroes */
function makeHero(cls) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); const kn = cls === "knight";
  const skin = "#f1c9a0", cloth = kn ? "#7f93b3" : "#2f8f8a", trim = kn ? "#c7d3e6" : "#e8b24a", pants = kn ? "#59657d" : "#4a3a2f";
  const mkLeg = x => { const l = new THREE.Group(); l.position.set(x, 0.85, 0); part(G.cyl, pants, { y: -0.4, sx: 0.2, sy: 0.85, sz: 0.2, parent: l }); part(G.sph, "#3a2a20", { y: -0.85, z: 0.1, sx: 0.26, sy: 0.18, sz: 0.34, parent: l }); body.add(l); return l; };
  const legL = mkLeg(-0.24), legR = mkLeg(0.24);
  const torso = part(new THREE.CylinderGeometry(0.78, 1, 1, 14), cloth, { y: 1.35, sx: 0.5, sy: 0.9, sz: 0.38, parent: body });
  part(G.cyl, trim, { y: 1.0, sx: 0.52, sy: 0.12, sz: 0.4, parent: body }); body.userData.torso = torso;
  const head = new THREE.Group(); head.position.y = 2.05; body.add(head);
  part(G.sph, skin, { sx: 0.42, sy: 0.44, sz: 0.42, parent: head, line: 0.045 });
  [-0.16, 0.16].forEach(x => part(G.sph, "#2a1d16", { x, y: 0.03, z: 0.38, sx: 0.045, sy: 0.07, sz: 0.04, parent: head, line: 0 }));
  if (kn) { part(G.sph, "#aab6cb", { y: 0.08, sx: 0.5, sy: 0.42, sz: 0.5, parent: head }); part(G.box, "#2b303c", { y: 0.04, z: 0.4, sx: 0.34, sy: 0.07, sz: 0.1, parent: head, line: 0 }); part(G.cone, "#d4503c", { y: 0.62, z: -0.08, sx: 0.12, sy: 0.55, sz: 0.12, parent: head }); }
  else { part(G.sph, "#5b3a22", { y: 0.12, z: -0.05, sx: 0.46, sy: 0.4, sz: 0.46, parent: head }); const hat = part(G.cyl, "#c0463a", { y: 0.36, x: 0.06, sx: 0.5, sy: 0.14, sz: 0.5, parent: head }); hat.rotation.z = -0.15; part(G.cone, "#f2e6b8", { x: -0.36, y: 0.5, z: 0, sx: 0.05, sy: 0.6, sz: 0.05, parent: head, line: 0.03 }).rotation.z = 0.7; }
  const mkArm = (x, right) => { const a = new THREE.Group(); a.position.set(x, 1.75, 0); part(G.cyl, cloth, { y: -0.35, sx: 0.15, sy: 0.7, sz: 0.15, parent: a }); part(G.sph, skin, { y: -0.75, sx: 0.17, sy: 0.17, sz: 0.17, parent: a, line: 0.04 }); body.add(a); return a; };
  const armL = mkArm(-0.58), armR = mkArm(0.58, true);
  let weapon;
  if (kn) {
    weapon = new THREE.Group(); weapon.position.set(0, -0.75, 0.1); part(G.box, "#e4ebf5", { y: 0.9, sx: 0.12, sy: 1.5, sz: 0.04, parent: weapon, line: 0.035 }); part(G.box, "#c89a3c", { y: 0.14, sx: 0.5, sy: 0.1, sz: 0.1, parent: weapon, line: 0.03 }); part(G.cyl, "#5a3d24", { y: -0.05, sx: 0.06, sy: 0.3, sz: 0.06, parent: weapon, line: 0.03 }); armR.add(weapon);
    const sh = part(G.cyl, "#4c6aa8", { x: -0.12, y: -0.45, z: 0.12, sx: 0.55, sy: 0.12, sz: 0.55, parent: armL }); sh.rotation.z = Math.PI / 2; part(G.cyl, "#d9b24c", { y: 0.1, sx: 0.2, sy: 0.08, sz: 0.2, parent: sh, line: 0.02 });
  } else {
    weapon = new THREE.Group(); weapon.position.set(0, -0.75, 0.05);
    const gb = part(G.sph, "#c8793a", { y: 0.2, sx: 0.55, sy: 0.7, sz: 0.14, parent: weapon, line: 0.04 }); part(G.cyl, "#2a1b12", { y: 0.2, z: 0.1, sx: 0.16, sy: 0.04, sz: 0.04, parent: weapon, line: 0 }).rotation.x = 1.57; part(G.box, "#4a2f1c", { y: 1.15, sx: 0.1, sy: 1.1, sz: 0.1, parent: weapon, line: 0.03 }); weapon.rotation.x = 0.4; armR.add(weapon);
  }
  const mats = []; root.traverse(o => { if (o.isMesh && !o.userData.isOutline) mats.push(o.material); });
  root.scale.setScalar(1.45);
  return { root, body, legL, legR, armL, armR, head, weapon, mats, kn, phase: 0, atkT: -1, atkK: 0, lx: 0, lz: 0, rot: 0, shield: null };
}
function makeEnemy(kind, e) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); let s = 1, wing = null, anim = "walk";
  const eye = (x, y, z, r = 0.06, p) => part(G.sph, "#fff", { x, y, z, sx: r, sy: r * 1.2, sz: r, parent: p || body, line: 0.02 }) && part(G.sph, "#1a1410", { x, y, z: z + r * 0.7, sx: r * 0.5, sy: r * 0.7, sz: r * 0.4, parent: p || body, line: 0 });
  if (kind === "slime") { s = 1; const b = part(G.sph, "#62d36f", { y: 0.6, sx: 0.85, sy: 0.7, sz: 0.85, parent: body, line: 0.07 }); b.material.transparent = false; eye(-0.25, 0.8, 0.62, 0.11); eye(0.25, 0.8, 0.62, 0.11); part(G.sph, "#b8f5bf", { x: -0.3, y: 1.05, z: 0.35, sx: 0.14, sy: 0.08, sz: 0.1, parent: body, line: 0 }); anim = "slime"; }
  else if (kind === "bat") { part(G.sph, "#6b4a9a", { y: 1.4, sx: 0.4, sy: 0.4, sz: 0.4, parent: body }); eye(-0.12, 1.5, 0.32, 0.07); eye(0.12, 1.5, 0.32, 0.07); [-0.2, 0.2].forEach(x => part(G.cone, "#6b4a9a", { x, y: 1.85, sx: 0.1, sy: 0.25, sz: 0.1, parent: body, line: 0.03 })); wing = [-1, 1].map(sd => { const w = new THREE.Group(); w.position.set(sd * 0.3, 1.4, 0); part(G.sph, "#8a63c0", { x: sd * 0.5, sx: 0.55, sy: 0.05, sz: 0.4, parent: w, line: 0.04 }); body.add(w); return w; }); anim = "bat"; }
  else if (kind === "boss") { s = 2.1; part(G.sph, "#b3322e", { y: 1.4, sx: 1.2, sy: 1.0, sz: 1.5, parent: body, line: 0.08 }); part(G.sph, "#e8c277", { y: 1.15, z: 0.3, sx: 0.9, sy: 0.75, sz: 1.3, parent: body, line: 0 }); const h = new THREE.Group(); h.position.set(0, 2.2, 1.3); body.add(h); part(G.sph, "#c43a34", { sx: 0.65, sy: 0.55, sz: 0.8, parent: h, line: 0.07 }); part(G.cone, "#f2e6b8", { x: -0.35, y: 0.55, z: -0.1, sx: 0.12, sy: 0.55, sz: 0.12, parent: h }); part(G.cone, "#f2e6b8", { x: 0.35, y: 0.55, z: -0.1, sx: 0.12, sy: 0.55, sz: 0.12, parent: h }); eye(-0.28, 0.12, 0.62, 0.1, h); eye(0.28, 0.12, 0.62, 0.1, h); for (let i = 0; i < 4; i++) part(G.cone, "#7a1f1f", { y: 2.2 - i * 0.2, z: -0.4 - i * 0.45, sx: 0.18, sy: 0.5, sz: 0.18, parent: body }); part(G.cone, "#b3322e", { y: 0.9, z: -1.9, sx: 0.4, sy: 1.6, sz: 0.4, parent: body }).rotation.x = -1.9; wing = [-1, 1].map(sd => { const w = new THREE.Group(); w.position.set(sd * 0.9, 2.0, -0.2); part(G.sph, "#8e2a2a", { x: sd * 1.2, sx: 1.4, sy: 0.07, sz: 0.9, parent: w, line: 0.05 }); body.add(w); return w; }); anim = "boss"; }
  else {
    const cfg = { skeleton: ["#ece7d2", "#d8d2b8", 1], archer: ["#4a8a4a", "#e4c9a0", 1], brute: ["#b4553f", "#e0b090", 1.45], hexer: ["#7e55c4", "#e4c9a0", 1.05], bomber: ["#33323a", "#ff8a3c", 0.95], hotdog: ["#e8a23c", "#c0392b", 1.1], mimic: ["#7a5636", "#c43a34", 1.0] }[kind] || ["#888", "#ccc", 1];
    s = cfg[2];
    if (kind === "bomber") { part(G.sph, cfg[0], { y: 0.7, sx: 0.65, sy: 0.65, sz: 0.65, parent: body, line: 0.07 }); eye(-0.2, 0.85, 0.52, 0.09); eye(0.2, 0.85, 0.52, 0.09); const f = part(G.cyl, "#c8a060", { y: 1.45, sx: 0.05, sy: 0.3, sz: 0.05, parent: body, line: 0.02 }); const sp = part(G.ico, "#ffb347", { y: 1.65, sx: 0.12, sy: 0.12, sz: 0.12, parent: body, line: 0 }); sp.material = new THREE.MeshBasicMaterial({ color: 0xffb347 }); body.userData.spark = sp; }
    else if (kind === "hotdog") { part(G.cyl, "#e8b862", { y: 0.9, sx: 0.5, sy: 1.5, sz: 0.5, parent: body, line: 0.06 }); part(G.cyl, "#c43a30", { y: 0.95, z: 0.08, sx: 0.4, sy: 1.5, sz: 0.4, parent: body, line: 0 }); part(G.cyl, "#f4d03f", { y: 1.0, z: 0.42, sx: 0.08, sy: 1.0, sz: 0.04, parent: body, line: 0 }).rotation.z = 0.2; eye(-0.15, 1.35, 0.4, 0.08); eye(0.15, 1.35, 0.4, 0.08); [-1, 1].forEach(sd => part(G.cyl, "#e8b862", { x: sd * 0.5, y: 0.9, sx: 0.08, sy: 0.7, sz: 0.08, parent: body, line: 0.03 })); }
    else {
      part(G.cyl, cfg[0], { y: 0.95, sx: 0.5, sy: 1.0, sz: 0.4, parent: body }); const hd = part(G.sph, kind === "skeleton" ? "#f4f0e0" : cfg[1], { y: 1.75, sx: 0.4, sy: 0.42, sz: 0.4, parent: body, line: 0.05 }); eye(-0.14, 1.78, 0.34, 0.07); eye(0.14, 1.78, 0.34, 0.07);
      [-0.22, 0.22].forEach(x => part(G.cyl, cfg[0], { x, y: 0.3, sx: 0.14, sy: 0.6, sz: 0.14, parent: body, line: 0.04 }));
      if (kind === "hexer") part(G.cone, "#4b2f86", { y: 2.35, sx: 0.4, sy: 0.9, sz: 0.4, parent: body }); if (kind === "archer") { part(G.cone, "#2f6a2f", { y: 2.15, sx: 0.48, sy: 0.55, sz: 0.48, parent: body }); part(G.tor, "#7a5636", { x: 0.55, y: 1.1, sx: 0.55, sy: 0.55, sz: 0.55, parent: body, line: 0.03 }).rotation.y = 1.57; }
      if (kind === "skeleton") for (let i = 0; i < 3; i++) part(G.box, "#fffbe8", { y: 0.65 + i * 0.28, z: 0.36, sx: 0.55, sy: 0.05, sz: 0.04, parent: body, line: 0 });
      if (kind === "brute") { part(G.cyl, "#5a3d24", { x: 0.75, y: 1.0, sx: 0.12, sy: 1.8, sz: 0.12, parent: body }); part(G.sph, "#6b4a30", { x: 0.75, y: 1.9, sx: 0.3, sy: 0.3, sz: 0.3, parent: body }); }
      if (kind === "mimic") { part(G.box, "#c43a34", { y: 1.0, sx: 0.9, sy: 0.4, sz: 0.5, parent: body }); }
    }
  }
  if (e.elite) s *= 1.5; s *= kind === "boss" ? 1.25 : 1.35;
  root.scale.setScalar(s);
  if (e.shield) { const sh = part(G.cyl, "#b8c2d4", { x: -0.7, y: 1.0, z: 0.35, sx: 0.55, sy: 0.1, sz: 0.55, parent: body, line: 0.04 }); sh.rotation.z = Math.PI / 2; part(G.sph, "#808aa0", { y: 0.12, sx: 0.18, sy: 0.12, sz: 0.18, parent: sh, line: 0 }); }
  if (e.elite) { const r = new THREE.Mesh(G.tor, new THREE.MeshBasicMaterial({ color: 0xffd34d })); r.rotation.x = Math.PI / 2; r.scale.setScalar(0.9); r.position.y = 0.06; body.add(r); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 32), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.setScalar((kind === "boss" ? 2.4 : 1.1) / (e.elite ? 1 : 1)); root.add(ring);
  const mats = []; body.traverse(o => { if (o.isMesh && !o.userData.isOutline && o.material.emissive) mats.push(o.material); });
  return { root, body, ring, wing, anim, s, mats, lx: 0, lz: 0, ph: Math.random() * 6 };
}
const shadowBlob = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t; })();
function blob(r) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowBlob, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.scale.setScalar(r * 2.2); return m; }

/* ---------------------------------------------------------------- particles + decals */
const MAXP = 420, pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
pMesh.frustumCulled = false; pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(pMesh);
const parts = []; const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
function burst(x, z, y, col, n, speed, life, size, grav = 9, up = 3) {
  for (let i = 0; i < n && parts.length < MAXP; i++) { const a = rnd() * 6.283, sp = speed * (0.3 + rnd()); parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: up * (0.4 + rnd()), vz: Math.sin(a) * sp, life, max: life, size: size * (0.6 + rnd() * 0.8), col: C(col), grav }); }
}
const decals = [];
function ringDecal(x, z, col, r0, r1, life, y = 0.08, thick = 0.25) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1 - thick, 1, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); decals.push({ m, r0, r1, life, max: life });
}
function arcDecal(x, z, ang, col, life, r = 3.4) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.35, r, 24, 1, -0.9, 1.8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.rotation.z = ang; m.position.set(x, 1.1, z); scene.add(m); decals.push({ m, r0: 0.7, r1: 1.05, life, max: life, fade: true });
}

/* ---------------------------------------------------------------- HTML overlay (name tags, banner, boss bar, floating text) */
const ui = document.createElement("div"); ui.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:'Space Grotesk',sans-serif;display:none";
ui.innerHTML = '<div id="g3Ban" style="position:absolute;left:0;right:0;top:34%;text-align:center;opacity:0;transition:opacity .35s;text-shadow:0 2px 12px #0009"><div style="font:26px \'Press Start 2P\',monospace;color:#fff3c4" id="g3B1"></div><div style="font:13px \'Press Start 2P\',monospace;color:#fff;margin-top:12px" id="g3B2"></div></div><div id="g3Boss" style="position:absolute;left:20%;right:20%;top:8px;display:none"><div style="font:9px \'Press Start 2P\',monospace;color:#fff;text-align:center;margin-bottom:4px;text-shadow:0 1px 4px #000">DRAGON OF DEBT</div><div style="height:12px;background:#0007;border:2px solid #fff6;border-radius:6px;overflow:hidden"><div id="g3BossF" style="height:100%;background:#e0483f;width:100%"></div></div></div><div id="g3Hurt" style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(255,30,30,.55));opacity:0;transition:opacity .25s"></div><div id="g3Wait" style="position:absolute;left:0;right:0;bottom:6%;text-align:center;font:12px \'Press Start 2P\',monospace;color:#fff;text-shadow:0 2px 8px #000;display:none;line-height:2"></div>';
const tags = new Map(), floatEls = [];
function tagEl(id) { let t = tags.get(id); if (!t) { t = document.createElement("div"); t.style.cssText = "position:absolute;transform:translate(-50%,-100%);font:700 12px 'Space Grotesk',sans-serif;color:#fff;text-shadow:0 0 4px #000,0 1px 3px #000;white-space:nowrap;text-align:center"; ui.appendChild(t); tags.set(id, t); } return t; }
function floatText(x, y, z, text, col) { const el = document.createElement("div"); el.textContent = text; el.style.cssText = `position:absolute;font:bold 13px 'Press Start 2P',monospace;color:${col};text-shadow:0 0 4px #000,0 2px 4px #000;transform:translate(-50%,-100%)`; ui.appendChild(el); floatEls.push({ el, x, y, z, t: 0 }); }
const proj = (x, y, z, w, h) => { tmpV.set(x, y, z).project(camera); return [(tmpV.x * 0.5 + 0.5) * w, (-tmpV.y * 0.5 + 0.5) * h, tmpV.z < 1]; };

/* ---------------------------------------------------------------- state -> scene */
const pl = new Map(), en = new Map(), chestM = new Map(), pickM = new Map(), shotPool = [];
let keyM = null, lastStageKey = "", bannerUntil = 0, shake = 0, on = false, W = 0, H = 0, lastT = 0, simT = 0;
const RSG = () => window.RSG;
function sizeUp() { const p = canvas.parentElement; if (!p) return; const w = p.clientWidth, h = p.clientHeight; if (w === W && h === H) return; W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
function frameCam(tx, tz, dt) {
  const needW = 42.5, d0 = Math.max(needW / (2 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect), 36), pitch = 61 * Math.PI / 180;
  const cx = 20 + (tx - 20) * 0.08, cz = 13.4 + (tz - 13) * 0.06;
  camera.position.set(cx + Math.sin(simT * 0.2) * 0.25 + (rnd() - 0.5) * shake, d0 * Math.sin(pitch) + (rnd() - 0.5) * shake, cz + d0 * Math.cos(pitch));
  camera.lookAt(cx, 0, cz); shake *= Math.pow(0.0008, dt);
}
function syncHeroes(st, dt, w, h) {
  const seen = new Set(); let me = null;
  st.players.forEach((p, i) => {
    let o = pl.get(p.id); if (!o) { o = makeHero(p.cls); o.blob = blob(1.1); o.group = new THREE.Group(); o.group.add(o.root); scene.add(o.group, o.blob); o.tx = X(p.x); o.tz = Z(p.y); o.group.position.set(o.tx, 0, o.tz); pl.set(p.id, o); }
    seen.add(p.id); const g = o.group, tx = X(p.x), tz = Z(p.y), k = 1 - Math.exp(-dt * 22);
    g.position.x += (tx - g.position.x) * k; g.position.z += (tz - g.position.z) * k;
    const vx = g.position.x - o.lx, vz = g.position.z - o.lz, sp = Math.min(1, Math.hypot(vx, vz) / (dt * 9 + 1e-4)); o.lx = g.position.x; o.lz = g.position.z;
    const f = FACE[p.facing] || [0, 1], targetRot = Math.atan2(f[0], f[1]); let dr = targetRot - o.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); o.rot += dr * (1 - Math.exp(-dt * 16));
    const t = simT; o.phase += dt * (6 + sp * 9) * (sp > 0.05 ? 1 : 0.2); const sw = Math.sin(o.phase) * 0.75 * sp;
    if (p.attacking && o.atkT < 0) { o.atkT = 0; o.atkK = p.atkKind || 0; } if (!p.attacking && o.atkT > 0.45) o.atkT = -1;
    if (o.atkT >= 0) o.atkT += dt;
    const dur = o.atkK === 2 ? 0.42 : o.atkK === 4 ? 0.34 : 0.26, a = o.atkT >= 0 ? Math.min(1, o.atkT / dur) : -1;
    o.legL.rotation.x = sw; o.legR.rotation.x = -sw; o.armL.rotation.x = -sw * 0.8; o.armR.rotation.x = sw * 0.8; o.armL.rotation.z = 0.12; o.armR.rotation.z = -0.12;
    let spin = 0, lean = sp * 0.18, squash = 1;
    if (a >= 0) { const e2 = a * a * (3 - 2 * a); o.armR.rotation.x = o.atkK === 2 ? -2.7 + e2 * 3.3 : -2.3 + e2 * 3.0; o.armR.rotation.z = o.atkK === 1 ? 0.8 - e2 * 1.6 : -0.1; lean += 0.25 * (1 - a); if (o.atkK === 4) spin = e2 * 6.283; if (o.atkK === 3) lean += 0.35; }
    else if (!o.kn) o.armR.rotation.x = 0.25 + sw * 0.4;
    if (p.dashing) { lean = 0.5; squash = 1.15; }
    o.root.rotation.y = o.rot + spin; o.body.rotation.x = lean; o.body.position.y = Math.abs(Math.sin(o.phase)) * 0.12 * sp + Math.sin(t * 2.2 + i) * 0.025; o.body.scale.set(1 / squash, 1, squash);
    if (!p.alive) { o.body.rotation.x = -1.45; o.body.position.y = 0.35; }
    const hurt = p.hurt ? 1 : 0; o.mats.forEach(m => { m.emissive.setRGB(hurt * 0.8, hurt * 0.05, hurt * 0.05); }); o.root.visible = !(p.invuln && !p.hurt && ((t * 14 | 0) & 1));
    if (p.guard) { if (!o.bub) { o.bub = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.28, depthWrite: false })); o.bub.scale.setScalar(1.5); o.bub.position.y = 1.2; o.group.add(o.bub); } o.bub.visible = true; o.bub.scale.setScalar(1.45 + Math.sin(t * 8) * 0.05); } else if (o.bub) o.bub.visible = false;
    o.blob.position.x = g.position.x; o.blob.position.z = g.position.z;
    uni.heroes.value[Math.min(i, 1)].set(g.position.x, 0, g.position.z);
    if (p.id === RSG().myId) me = g.position;
    const tag = tagEl(p.id), [sx, sy, vis] = proj(g.position.x, 3.9, g.position.z, w, h); tag.style.display = vis ? "" : "none"; tag.style.left = sx + "px"; tag.style.top = sy + "px";
    tag.style.color = p.id === RSG().myId ? "#9fe8ff" : "#ffe9a8"; tag.textContent = p.name + (p.alive ? "" : "  (down " + Math.round(p.revive * 100) + "%)");
    if (!p.alive || p.hp <= 1) tag.style.color = "#ff9a8a";
    if (p.playing && Math.random() < 0.3) burst(g.position.x + (rnd() - 0.5), g.position.z + (rnd() - 0.5), 2.4, "#ffe27a", 1, 0.6, 0.8, 0.09, -1.5, 1.2);
  });
  for (const [id, o] of pl) if (!seen.has(id)) { scene.remove(o.group, o.blob); pl.delete(id); tags.get(id)?.remove(); tags.delete(id); }
  return me;
}
function syncEnemies(st, dt, w, h) {
  const seen = new Set(), t = simT;
  for (const e of st.enemies) {
    let o = en.get(e.id); if (!o) { o = makeEnemy(e.kind, e); o.group = new THREE.Group(); o.group.add(o.root); o.blob = blob(0.8 * o.s); o.hp = document.createElement("div"); o.hp.style.cssText = "position:absolute;width:34px;height:5px;background:#0008;border:1px solid #000a;transform:translate(-50%,0);border-radius:3px;overflow:hidden;display:none"; o.hp.innerHTML = '<div style="height:100%;background:#e0483f"></div>'; ui.appendChild(o.hp); scene.add(o.group, o.blob); o.group.position.set(X(e.x), 0, Z(e.y)); o.lx = o.group.position.x; o.lz = o.group.position.z; en.set(e.id, o); }
    seen.add(e.id); const g = o.group, k = 1 - Math.exp(-dt * 16); g.position.x += (X(e.x) - g.position.x) * k; g.position.z += (Z(e.y) - g.position.z) * k;
    const vx = g.position.x - o.lx, vz = g.position.z - o.lz, sp = Math.min(1, Math.hypot(vx, vz) / (dt * 5 + 1e-4)); if (Math.hypot(vx, vz) > 0.003) { const tr = Math.atan2(vx, vz); let dr = tr - (o.rot || 0); dr = Math.atan2(Math.sin(dr), Math.cos(dr)); o.rot = (o.rot || 0) + dr * (1 - Math.exp(-dt * 8)); } o.lx = g.position.x; o.lz = g.position.z;
    o.root.rotation.y = o.rot || 0; const ph = t * 8 + o.ph; let by = 0, sq = 1, sxs = 1;
    if (o.anim === "slime") { const b = Math.sin(t * 5 + o.ph); sq = 1 + b * 0.12; sxs = 1 - b * 0.08; by = 0; } else if (o.anim === "bat") { by = 0.6 + Math.sin(t * 3 + o.ph) * 0.2; o.wing[0].rotation.z = Math.sin(t * 22) * 0.7; o.wing[1].rotation.z = -Math.sin(t * 22) * 0.7; o.blob.material.opacity = 0.5; } else if (o.anim === "boss") { by = Math.abs(Math.sin(t * 1.6)) * 0.12; o.wing[0].rotation.z = Math.sin(t * 2.5) * 0.35; o.wing[1].rotation.z = -Math.sin(t * 2.5) * 0.35; } else { by = Math.abs(Math.sin(ph)) * 0.1 * sp; o.body.rotation.z = Math.sin(ph) * 0.06 * sp; }
    if (e.winding) { sq *= 0.88; sxs *= 1.1; o.ring.material.opacity = 0.35 + 0.4 * Math.abs(Math.sin(t * 20)); o.ring.scale.setScalar((e.kind === "boss" ? 2.6 : 1.3) * (0.9 + 0.2 * Math.sin(t * 14))); } else o.ring.material.opacity = 0;
    if (e.stunned) { o.body.rotation.z = Math.sin(t * 30) * 0.15; }
    o.body.position.y = by; o.body.scale.set(sxs, sq, sxs); o.root.visible = !e.dormant || ((t * 3 | 0) & 1) === 0 || true;
    const hurt = e.hurt ? 1 : 0, dorm = e.dormant ? 0.35 : 0; o.mats.forEach(m => m.emissive.setRGB(hurt * 0.9 + dorm * 0.1, hurt * 0.9 + dorm * 0.1, hurt * 0.9 + dorm * 0.2));
    if (o.body.userData.spark) o.body.userData.spark.visible = ((t * 12 | 0) & 1) === 0;
    o.blob.position.x = g.position.x; o.blob.position.z = g.position.z;
    const [sx, sy, vis] = proj(g.position.x, 0.0, g.position.z, w, h), dmg = e.hp < e.maxHp;
    o.hp.style.display = vis && (dmg || e.kind === "boss") && e.kind !== "boss" ? "block" : "none"; o.hp.style.left = sx + "px"; o.hp.style.top = (proj(g.position.x, 2.7 * o.s * 0.75, g.position.z, w, h)[1]) + "px"; o.hp.firstChild.style.width = Math.max(0, e.hp / e.maxHp * 100) + "%";
    if (e.keeper) { if (!o.crown) { o.crown = part(G.ico, "#ffd34d", { y: 3.0, sx: 0.28, sy: 0.28, sz: 0.28, parent: o.root, line: 0 }); o.crown.material = new THREE.MeshBasicMaterial({ color: 0xffd34d }); } o.crown.position.y = 2.9 * o.s * 0.8 + Math.sin(t * 4) * 0.12; o.crown.rotation.y = t * 2; } else if (o.crown) o.crown.visible = false;
  }
  for (const [id, o] of en) if (!seen.has(id)) { scene.remove(o.group, o.blob); o.hp.remove(); en.delete(id); }
}
function mkChest(c) {
  const g = new THREE.Group(), base = part(G.box, "#8a5a32", { y: 0.45, sx: 1.3, sy: 0.9, sz: 0.9, parent: g }); part(G.box, "#d9b24c", { y: 0.45, sx: 1.34, sy: 0.18, sz: 0.94, parent: g, line: 0.02 });
  const lid = new THREE.Group(); lid.position.set(0, 0.9, -0.45); const lm = part(G.cyl, "#9a6a3c", { y: 0, z: 0.45, sx: 0.45, sy: 1.3, sz: 0.45, parent: lid }); lm.rotation.z = Math.PI / 2; lm.scale.set(0.45, 1.3, 0.9); g.add(lid); g.userData.lid = lid; g.position.set(X(c.x), 0, Z(c.y)); scene.add(g); return g;
}
function mkHeart() { const sh = new THREE.Shape(); sh.moveTo(0, -0.5); sh.bezierCurveTo(-0.9, 0.1, -0.5, 0.8, 0, 0.35); sh.bezierCurveTo(0.5, 0.8, 0.9, 0.1, 0, -0.5); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }), toon("#ff4a5e")); m.castShadow = true; outline(m, 0.05); return m; }
function syncProps(st, dt) {
  const t = simT, seenC = new Set();
  for (const c of st.chests) { let g = chestM.get(c.id); if (!g) { g = mkChest(c); chestM.set(c.id, g); } seenC.add(c.id); const target = c.open ? -1.9 : 0; g.userData.lid.rotation.x += (target - g.userData.lid.rotation.x) * (1 - Math.exp(-dt * 12)); }
  for (const [id, g] of chestM) if (!seenC.has(id)) { scene.remove(g); chestM.delete(id); }
  const seenP = new Set();
  for (const pk of st.pickups) { let m = pickM.get(pk.id); if (!m) { m = mkHeart(); pickM.set(pk.id, m); scene.add(m); } seenP.add(pk.id); m.position.set(X(pk.x), 0.9 + Math.sin(t * 3 + pk.x) * 0.15, Z(pk.y)); m.rotation.y = t * 1.8; }
  for (const [id, m] of pickM) if (!seenP.has(id)) { scene.remove(m); pickM.delete(id); }
  if (st.keyDrop) { if (!keyM) { keyM = new THREE.Group(); part(G.tor, "#ffd34d", { sx: 0.4, sy: 0.4, sz: 0.4, parent: keyM, line: 0.03 }); part(G.cyl, "#ffd34d", { y: -0.8, sx: 0.09, sy: 1.0, sz: 0.09, parent: keyM, line: 0.03 }); part(G.box, "#ffd34d", { x: 0.2, y: -1.1, sx: 0.3, sy: 0.12, sz: 0.1, parent: keyM, line: 0.03 }); scene.add(keyM); } keyM.visible = true; keyM.position.set(X(st.keyDrop.x), 1.9 + Math.sin(t * 3) * 0.2, Z(st.keyDrop.y)); keyM.rotation.y = t * 2.4; } else if (keyM) keyM.visible = false;
  const ex = env.children.find(o => o.userData.exit); if (ex) { const gl = ex.getObjectByName("glow"); gl.material.opacity += ((st.doorOpen ? 0.55 + Math.sin(t * 4) * 0.12 : 0) - gl.material.opacity) * (1 - Math.exp(-dt * 6)); }
}
function syncShots(st) {
  while (shotPool.length < st.shots.length) { const m = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xffffff })); const tr = new THREE.PointLight(0xffffff, 2.5, 6, 2); m.add(tr); m.userData.l = tr; scene.add(m); shotPool.push(m); }
  shotPool.forEach((m, i) => { const s = st.shots[i]; m.visible = !!s; if (!s) return; const col = s.k === "fire" ? 0xff7a2a : s.k === "hex" ? 0xb56bff : 0xe8e0c0; m.material.color.setHex(col); m.userData.l.color.setHex(col); m.position.set(X(s.x), 1.2, Z(s.y)); if (s.k === "arrow") m.scale.set(0.5, 0.1, 0.1); else m.scale.setScalar(s.k === "fire" ? 0.42 : 0.3); m.rotation.y = -s.a; });
}
function syncParticles(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy -= p.grav * dt; p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt; }
  for (const p of parts) { const k = p.life / p.max, s = p.size * (0.4 + k * 0.8); tmpV.set(p.x, p.y, p.z); tmpS.set(s, s, s); tmpM.compose(tmpV, tmpQ.identity(), tmpS); pMesh.setMatrixAt(n, tmpM); tmpC.copy(p.col); pMesh.setColorAt(n, tmpC); n++; }
  pMesh.count = n; pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i]; d.life -= dt; if (d.life <= 0) { scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); decals.splice(i, 1); continue; } const k = 1 - d.life / d.max; d.m.scale.setScalar(d.r0 + (d.r1 - d.r0) * k * (d.fade ? 1 : 1)); d.m.material.opacity = (d.fade ? 0.7 : 0.9) * (1 - k); }
  for (let i = floatEls.length - 1; i >= 0; i--) { const f = floatEls[i]; f.t += dt; if (f.t > 0.9) { f.el.remove(); floatEls.splice(i, 1); continue; } const [sx, sy] = proj(f.x, f.y + f.t * 2, f.z, W, H); f.el.style.left = sx + "px"; f.el.style.top = sy + "px"; f.el.style.opacity = Math.min(1, (0.9 - f.t) * 3); }
}
function overlay(st) {
  const key = st.scene + ":" + st.region + ":" + st.stage + ":" + st.roomName;
  if (key !== lastStageKey) { lastStageKey = key; if (!st.waiting || st.stage > 0) { ui.querySelector("#g3B1").textContent = st.story && st.region ? (document.querySelector("#roomLabel")?.textContent || "") .split("—")[1]?.trim()?.toUpperCase() || "" : "ROOM " + (st.stage + 1); ui.querySelector("#g3B2").textContent = st.story ? "" : (document.querySelector("#roomLabel")?.textContent.split("—")[1] || "").trim().toUpperCase(); ui.querySelector("#g3Ban").style.opacity = 1; bannerUntil = performance.now() + 2400; } }
  if (bannerUntil && performance.now() > bannerUntil) { ui.querySelector("#g3Ban").style.opacity = 0; bannerUntil = 0; }
  const boss = st.enemies.find(e => e.kind === "boss"), bb = ui.querySelector("#g3Boss"); bb.style.display = boss ? "block" : "none"; if (boss) ui.querySelector("#g3BossF").style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
  const wt = ui.querySelector("#g3Wait"); wt.style.display = st.waiting ? "block" : "none"; if (st.waiting) wt.innerHTML = "WAITING FOR YOUR TEAMMATE<br>ROOM CODE: " + (RSG().code || "");
}

/* ---------------------------------------------------------------- effects from the server */
function fx(f) {
  const x = X(f.x || 0), z = Z(f.y || 0), st = RSG().state; const P = id => { const o = pl.get(id); return o ? o.group.position : null; };
  switch (f.type) {
    case "swing": { const o = pl.get(f.id), pos = P(f.id); if (o && pos) { const fa = FACE[st.players.find(p => p.id === f.id)?.facing] || [1, 0]; arcDecal(pos.x + fa[0] * 0.8, pos.z + fa[1] * 0.8, Math.atan2(fa[1], fa[0]) * -1 + Math.PI * 0, f.cls === "knight" ? 0xcfe6ff : 0xffd27a, 0.22, f.kind === 4 ? 3.0 : 2.4); } break; }
    case "hit": burst(x, z, 1.3, f.crit ? "#ffd34d" : "#fff5d0", f.crit ? 14 : 8, 5, 0.35, 0.14, 12, 4); if (f.big) { ringDecal(x, z, 0xffb070, 0.5, 4, 0.35); shake = Math.max(shake, 0.5); } break;
    case "pound": ringDecal(x, z, f.cls === "knight" ? 0xc8e6ff : 0xffbe5a, 0.5, 5.6, 0.5, 0.1, 0.35); shake = Math.max(shake, 0.6); burst(x, z, 0.3, "#d8c8a0", 14, 5, 0.5, 0.18, 8, 3); break;
    case "kill": { const col = { slime: "#62d36f", skeleton: "#ece7d2", bat: "#8a63c0", brute: "#c0503b", hotdog: "#e8a23c", hexer: "#9b6bd6", bomber: "#ff8a3c" }[f.kind] || "#fff"; burst(x, z, 0.8, col, 18, 5, 0.7, 0.2, 7, 5); burst(x, z, 0.8, "#f4f1e8", 8, 2.5, 0.9, 0.3, -1, 1.5); if (f.kind === "boss" || f.kind === "brute") shake = Math.max(shake, 0.7); break; }
    case "heal": burst(x, z, 1.2, "#7dff9a", 6, 1, 0.9, 0.13, -3, 2); floatText(x, 2.4, z, "+1", "#7dff9a"); break;
    case "song": ringDecal(x, z, 0x7dff9a, 0.6, 8, 0.8, 0.1, 0.12); break;
    case "hurt": burst(x, z, 1.4, "#ff6a5a", 8, 4, 0.4, 0.14, 10, 3); floatText(x, 2.6, z, "-" + (f.dmg || 1), "#ff7a6a"); shake = Math.max(shake, 0.35); if (f.id === RSG().myId) { const h = ui.querySelector("#g3Hurt"); h.style.transition = "none"; h.style.opacity = 1; requestAnimationFrame(() => { h.style.transition = "opacity .35s"; h.style.opacity = 0; }); } break;
    case "down": burst(x, z, 0.8, "#ff6a5a", 14, 3, 0.8, 0.16, 4, 3); break;
    case "revive": burst(x, z, 0.8, "#7dff9a", 18, 3, 1, 0.14, -2, 2.5); ringDecal(x, z, 0x7dff9a, 0.5, 3, 0.7); break;
    case "dash": burst(x, z, 0.2, "#e8dcc0", 6, 2, 0.4, 0.2, 2, 1); break;
    case "notes": case "bash": { const pos = P(f.id); if (pos) { const fa = FACE[f.facing] || [1, 0]; for (let i = 0; i < 7; i++) { const a = Math.atan2(fa[1], fa[0]) + (rnd() - 0.5) * 0.7; parts.push({ x: pos.x, y: 1.4, z: pos.z, vx: Math.cos(a) * 8, vy: 0.5, vz: Math.sin(a) * 8, life: 0.6, max: 0.6, size: 0.22, col: C(f.type === "bash" ? "#cfe6ff" : "#ffe27a"), grav: 0 }); } } break; }
    case "stun": burst(x, z, 2.2, "#ffe14a", 5, 1.5, 0.7, 0.13, 0, 0.5); break;
    case "loot": burst(x, z, 1.5, f.rarity === 2 ? "#c58bff" : f.rarity === 1 ? "#6ab8ff" : "#ffd34d", 12, 2, 1, 0.16, -3, 3); break;
    case "bigshake": shake = Math.max(shake, 0.8); break;
    case "door": ringDecal(X(790), Z(260), 0xfff1b0, 0.5, 5, 0.8); break;
    case "key": case "keydrop": burst(x, z, 1.2, "#ffd34d", 12, 3, 0.8, 0.15, -2, 3); break;
    case "bossfire": ringDecal(x, z, 0xff7a2a, 0.5, 4, 0.5); break;
    default: break;
  }
}

/* ---------------------------------------------------------------- frame loop */
function frame(t) {
  const st = RSG().state; if (!st) return;
  const dt = Math.min(0.05, Math.max(0.001, (t - (lastT || t)) / 1000)); lastT = t; if (!st.paused) simT += dt;
  const parent = canvas.parentElement; if (!parent) return; if (ui.parentElement !== parent) parent.insertBefore(ui, canvas.nextSibling);
  sizeUp(); if (!W) return;
  const theme = st.theme !== undefined ? st.theme : st.stage; if (theme !== envTheme) buildEnv(theme);
  uni.time.value = simT; uni.cloudOff.value.set(simT * 0.006, simT * 0.003); if (cloudMap) cloudMap.offset.set(simT * 0.006, simT * 0.003);
  torches.forEach((l, i) => { l.intensity = 28 + Math.sin(simT * 9 + i * 2) * 3 + Math.sin(simT * 23 + i) * 1.5; });
  if (!st.paused) { const me = syncHeroes(st, dt, W, H); syncEnemies(st, dt, W, H); syncProps(st, dt); syncShots(st); syncParticles(dt); frameCam(me ? me.x : 20, me ? me.z : 13, dt); }
  overlay(st); renderer.render(scene, camera);
}
function setOn(v) {
  on = !!v; window.RS3D.on = on; const active = window.RS3D.active();
  canvas.style.display = active ? "block" : "none"; ui.style.display = active ? "block" : "none";
}
const API = {
  on: false, loaded: true,
  active() { const s = RSG() && RSG().state; return !!(this.on && s && s.scene !== "hub"); },
  frame(t) { const a = this.active(); if (!canvas.parentElement) { const w = document.querySelector(".stage-wrap"); if (w) w.insertBefore(canvas, document.getElementById("gameCanvas").nextSibling); }
    canvas.style.display = a ? "block" : "none"; ui.style.display = a ? "block" : "none"; if (a) { try { frame(t); } catch (e) { if (!API.err) { API.err = e; console.error("3D view error", e); } } } },
  fx(f) { try { fx(f); } catch (e) {} },
  setOn
};
window.RS3D = API;
