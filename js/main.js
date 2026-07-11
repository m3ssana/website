/* ============================================================
   messana.ai — v4 "Signal"
   A minimalistic, AI-themed landing page for the Messana family.
   A slow-drifting neural constellation — glowing nodes joined by
   "signal" edges that form and dissolve as the graph rewires —
   sits behind the wordmark: the family as one small, connected
   signal node, rendered in glass and light.

   The graph is alive and reactive: the cursor is a transient node
   that brightens and knits edges to its neighbours; firing nodes
   send "signal packets" travelling down their edges (a damped
   chain — a quiet inference cascade); a click/tap ignites the
   nearest node; the constellation reveals itself on first load;
   and the whole palette breathes with a UTC day/night cycle,
   staying deep-space dark throughout.

   three.js r0.160 · additive GPU points + UnrealBloom · graceful
   fallback to the CSS backdrop when WebGL/CDN is unavailable.
   ============================================================ */

/* PWA: register the service worker (root scope) */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* Live UTC timestamp — the signal node's heartbeat. */
const clockEl = document.getElementById('clock');
function tickClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  clockEl.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}
tickClock();
setInterval(tickClock, 1000);

/* "About the backdrop" — a subtle disclosure explaining the AI metaphor.
   Lives outside the WebGL path so it works even if three.js never loads. */
(function aboutPanel() {
  const btn = document.getElementById('info-btn');
  const panel = document.getElementById('about');
  if (!btn || !panel) return;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const onOutside = (e) => { if (!panel.contains(e.target) && !btn.contains(e.target)) close(false); };
  function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    panel.focus();
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onOutside, true);
  }
  function close(returnFocus = true) {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    removeEventListener('keydown', onKey);
    removeEventListener('pointerdown', onOutside, true);
    if (returnFocus) btn.focus();
  }
  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
})();

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('scene');

/* ==PURE:START== */
/* Pure, three.js-free helpers — self-contained (no THREE, no DOM, no scene state).
   Unit-tested headlessly in Node; keep this block dependency-free so the extraction
   test can slice + import it directly. */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// First-load reveal envelopes: nodes bloom in, edges knit slightly later.
const revealNodes = (t) => smoothstep(0.0, 1.5, t);
const revealEdges = (t) => smoothstep(0.4, 1.6, t);

// UTC day/night: 0 at 00:00 (deepest night) → 1 at 12:00 → 0 at 24:00.
function daylight01(hours, minutes = 0) {
  const frac = ((((hours + minutes / 60) % 24) + 24) % 24) / 24;
  return 0.5 - 0.5 * Math.cos(frac * Math.PI * 2);
}

// Day/night palette endpoints [night, day] — authored sRGB. The background day
// endpoint stays under DN_DAY_CAP so "noon" never outshines the pre-darkening theme.
const DN_NIGHT_BG = 0x070310;
const DN_DAY_BG   = 0x150a2a;
const DN_DAY_CAP  = 0x160b2e;
const DN_ROYAL    = [0x6b2fd0, 0x8b4cf2];
const DN_AMETHYST = [0x9578e8, 0xb89bff];
const DN_LILAC    = [0xccb9f5, 0xe2d3ff];
const DN_CORE     = [0xe4d9ff, 0xf4eeff];

const hexToRGB = (hex) => ({
  r: ((hex >> 16) & 255) / 255,
  g: ((hex >> 8) & 255) / 255,
  b: (hex & 255) / 255,
});

function mixHex(a, b, t) {
  const k = clamp01(t), ca = hexToRGB(a), cb = hexToRGB(b);
  return {
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  };
}

const packRGB = ({ r, g, b }) =>
  (Math.round(clamp01(r) * 255) << 16) | (Math.round(clamp01(g) * 255) << 8) | Math.round(clamp01(b) * 255);

// Rec.709 luminance on the authored sRGB values — enough to assert the day cap in tests.
const relLuminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Given hub NDC xy (flat, stride 2), pointer NDC (px,py), return the nearest hub
// index and the nearby set with a 1→0 proximity falloff inside `radius`.
function pickNearby(ndc, n, px, py, radius) {
  let nearest = -1, best = Infinity;
  const list = [];
  const r2 = radius * radius;
  for (let i = 0; i < n; i++) {
    const dx = ndc[i * 2] - px, dy = ndc[i * 2 + 1] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; nearest = i; }
    if (d2 <= r2) list.push({ i, fall: 1 - Math.sqrt(d2) / radius });
  }
  return { nearest, list };
}

// ---- Signal-packet pool (plain typed arrays; no THREE) ----
function makePool(cap) {
  return {
    cap, n: 0,
    src: new Int16Array(cap), dst: new Int16Array(cap),
    prog: new Float32Array(cap), speed: new Float32Array(cap), level: new Float32Array(cap),
  };
}

// Spawn up to `maxPer` packets from `src` toward `neighbors`, bounded by pool capacity.
function spawnPackets(pool, src, neighbors, level, speed, maxPer) {
  let added = 0;
  for (let k = 0; k < neighbors.length && added < maxPer && pool.n < pool.cap; k++) {
    const idx = pool.n++;
    pool.src[idx] = src; pool.dst[idx] = neighbors[k];
    pool.prog[idx] = 0; pool.speed[idx] = speed; pool.level[idx] = level;
    added++;
  }
  return added;
}

// Advance all packets by dt, compact survivors in place, return arrivals [{dst, level}].
function advancePackets(pool, dt) {
  const arrivals = [];
  let w = 0;
  for (let i = 0; i < pool.n; i++) {
    const p = pool.prog[i] + pool.speed[i] * dt;
    if (p >= 1) { arrivals.push({ dst: pool.dst[i], level: pool.level[i] }); continue; }
    pool.src[w] = pool.src[i]; pool.dst[w] = pool.dst[i];
    pool.prog[w] = p; pool.speed[w] = pool.speed[i]; pool.level[w] = pool.level[i];
    w++;
  }
  pool.n = w;
  return arrivals;
}

// Damped chain: deposit heat on arrival; return the onward fire-level if the node
// re-fires, else 0. Because level shrinks by `damp` each hop and re-fire needs
// level ≥ `refireMin`, cascades self-extinguish within a couple of hops.
function chainOnArrival(heat, dst, level, deposit, refireMin, damp, heatCap) {
  heat[dst] = Math.min(heatCap, heat[dst] + level * deposit);
  return level >= refireMin ? level * damp : 0;
}
/* ==PURE:END== */

/* The WebGL backdrop is a progressive enhancement. If three.js can't load
   (offline first visit, CDN hiccup, ancient browser), we hide the canvas and
   the CSS gradient carries the page — the wordmark never sits on a void.
   Dynamic import keeps the clock + service worker alive regardless. */
boot();

async function boot() {
  let THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass;
  try {
    THREE = await import('three');
    ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
    ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
    ({ UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'));
    ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
  } catch (err) {
    canvas.style.display = 'none';   // stand down; let the CSS backdrop shine
    return;
  }
  signal(THREE, { EffectComposer, RenderPass, UnrealBloomPass, OutputPass });
}

function signal(THREE, { EffectComposer, RenderPass, UnrealBloomPass, OutputPass }) {
  const AUBERGINE = 0x0a0414;
  const small = Math.min(innerWidth, innerHeight) < 560;   // scale cost to the viewport

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(AUBERGINE, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(AUBERGINE, 0.015);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
  camera.position.set(0, 0, 62);

  // Palette shared across all materials (one source of truth). uIntro drives the
  // first-load reveal; the colours drift subtly with the UTC day/night cycle.
  const uniforms = {
    uTime:     { value: 0 },
    uIntro:    { value: 0 },
    uRoyal:    { value: new THREE.Color(0x7c3aed) },
    uAmethyst: { value: new THREE.Color(0xa78bfa) },
    uLilac:    { value: new THREE.Color(0xd8c9ff) },
    uCore:     { value: new THREE.Color(0xece4ff) },
  };

  // ---------- (1) Dust: a deep, drifting field of latent points ----------
  const N_DUST = small ? 700 : 1300;
  const dust = new Float32Array(N_DUST * 3);
  const dustSeed = new Float32Array(N_DUST);
  for (let i = 0; i < N_DUST; i++) {
    dust[i * 3]     = (Math.random() - 0.5) * 150;
    dust[i * 3 + 1] = (Math.random() - 0.5) * 95;
    dust[i * 3 + 2] = (Math.random() - 0.5) * 70 - 8;
    dustSeed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime;
      attribute float aSeed;
      varying float vTw;
      varying float vFade;
      void main() {
        vec3 p = position;
        float s = aSeed * 6.2831853;
        p.x += sin(uTime * 0.24 + s) * 1.7;
        p.y += cos(uTime * 0.19 + s * 1.3) * 1.7;
        p.z += sin(uTime * 0.16 + s * 0.7) * 1.7;
        vTw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.3 + aSeed * 40.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFade = smoothstep(150.0, 45.0, -mv.z);     // fade the deep field into the aubergine
        gl_PointSize = (0.8 + 2.0 * vTw) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uRoyal;
      uniform vec3 uAmethyst;
      uniform float uIntro;
      varying float vTw;
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r);
        vec3 c = mix(uRoyal, uAmethyst, vTw);
        gl_FragColor = vec4(c, a * (0.25 + 0.5 * vTw) * vFade * uIntro);
      }`,
  });
  const dustPts = new THREE.Points(dustGeo, dustMat);
  dustPts.frustumCulled = false;
  scene.add(dustPts);

  // ---------- (2) Signal nodes: the constellation (CPU-driven drift + heat) ----------
  const N_HUB = small ? 58 : 90;
  const LINK = 21;            // max edge length (world units)
  const MAX_SEG = 420;        // hard cap on drawn edges
  const POINTER_EDGE_MAX = 8; // reserved for cursor→node edges
  const HUB_SEG_MAX = MAX_SEG - POINTER_EDGE_MAX;   // leave room so pointer edges always fit
  const hubBase = new Float32Array(N_HUB * 3);
  const hubSeed = new Float32Array(N_HUB);
  const hubPos  = new Float32Array(N_HUB * 3);   // live positions, rebuilt each frame
  const hubHeat = new Float32Array(N_HUB);       // 0..1 activation, decays
  for (let i = 0; i < N_HUB; i++) {
    hubBase[i * 3]     = (Math.random() - 0.5) * 116;
    hubBase[i * 3 + 1] = (Math.random() - 0.5) * 70;
    hubBase[i * 3 + 2] = (Math.random() - 0.5) * 44 - 6;
    hubSeed[i] = Math.random();
  }
  const hubGeo = new THREE.BufferGeometry();
  const hubPosAttr  = new THREE.BufferAttribute(hubPos, 3).setUsage(THREE.DynamicDrawUsage);
  const hubHeatAttr = new THREE.BufferAttribute(hubHeat, 1).setUsage(THREE.DynamicDrawUsage);
  hubGeo.setAttribute('position', hubPosAttr);
  hubGeo.setAttribute('aSeed', new THREE.BufferAttribute(hubSeed, 1));
  hubGeo.setAttribute('aHeat', hubHeatAttr);
  const hubMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime;
      attribute float aSeed;
      attribute float aHeat;
      varying float vGlow;
      varying float vReveal;
      void main() {
        float tw = 0.5 + 0.5 * sin(uTime * 1.5 + aSeed * 30.0);
        vGlow = clamp(0.4 + 0.45 * tw + aHeat, 0.0, 1.6);
        vReveal = smoothstep(0.0, 0.9, uTime - aSeed * 0.55);   // staggered knit-in
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (2.2 + 3.6 * vGlow) * (0.4 + 0.6 * vReveal) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLilac;
      uniform vec3 uCore;
      varying float vGlow;
      varying float vReveal;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        vec3 c = mix(uLilac, uCore, clamp(vGlow - 0.5, 0.0, 1.0));
        gl_FragColor = vec4(c, core * vReveal);
      }`,
  });
  const hubPts = new THREE.Points(hubGeo, hubMat);
  hubPts.frustumCulled = false;
  scene.add(hubPts);

  // ---------- (3) Edges: proximity graph, rebuilt each frame from live nodes ----------
  const linePos = new Float32Array(MAX_SEG * 2 * 3);
  const lineAlpha = new Float32Array(MAX_SEG * 2);
  const lineGeo = new THREE.BufferGeometry();
  const linePosAttr = new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage);
  const lineAlphaAttr = new THREE.BufferAttribute(lineAlpha, 1).setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute('position', linePosAttr);
  lineGeo.setAttribute('aAlpha', lineAlphaAttr);
  const lineMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aAlpha;
      varying float vA;
      void main() {
        vA = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uAmethyst;
      uniform vec3 uLilac;
      varying float vA;
      void main() {
        gl_FragColor = vec4(mix(uAmethyst, uLilac, clamp(vA, 0.0, 1.0)), vA);
      }`,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  scene.add(lines);

  // ---------- (4) Signal packets: bright pulses travelling fired edges ----------
  const PACKET_CAP = 48;
  const PACKET_SPEED = 1.1;        // progress/sec (~0.9s node-to-node)
  const INIT_FANOUT = 4;           // packets from an initial (periodic/click) fire
  const CHAIN_FANOUT = 2;          // packets from a re-fire (keeps cascades small)
  const DEPOSIT = 0.35;            // heat deposited on arrival
  const REFIRE_MIN = 0.55;         // arriving level needed to re-fire
  const CHAIN_DAMP = 0.5;          // level shrinks each hop → cascade dies fast
  const REFIRE_CHANCE = 0.6;       // re-fires only "occasionally"
  const HEAT_CAP = 1.2;
  const FRAME_SPAWN_BUDGET = 3;    // hard per-frame cap on new fires (belt + braces)
  const pool = makePool(PACKET_CAP);
  const pkPos = new Float32Array(PACKET_CAP * 3);
  const pkLevel = new Float32Array(PACKET_CAP);
  const pkGeo = new THREE.BufferGeometry();
  const pkPosAttr = new THREE.BufferAttribute(pkPos, 3).setUsage(THREE.DynamicDrawUsage);
  const pkLevelAttr = new THREE.BufferAttribute(pkLevel, 1).setUsage(THREE.DynamicDrawUsage);
  pkGeo.setAttribute('position', pkPosAttr);
  pkGeo.setAttribute('aLevel', pkLevelAttr);
  pkGeo.setDrawRange(0, 0);
  const pkMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aLevel;
      varying float vL;
      void main() {
        vL = clamp(aLevel, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.6 + 3.4 * vL) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLilac;
      uniform vec3 uCore;
      varying float vL;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(mix(uLilac, uCore, vL), core * vL);
      }`,
  });
  const pkPts = new THREE.Points(pkGeo, pkMat);
  pkPts.frustumCulled = false;
  scene.add(pkPts);

  // Nearest live neighbours of hub i (within LINK), closest first.
  const _nbrBuf = [];
  function neighborsOf(i, maxCount) {
    _nbrBuf.length = 0;
    const ax = hubPos[i * 3], ay = hubPos[i * 3 + 1], az = hubPos[i * 3 + 2];
    const L2 = LINK * LINK;
    for (let j = 0; j < N_HUB; j++) {
      if (j === i) continue;
      const dx = ax - hubPos[j * 3], dy = ay - hubPos[j * 3 + 1], dz = az - hubPos[j * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= L2) _nbrBuf.push({ j, d2 });
    }
    _nbrBuf.sort((a, b) => a.d2 - b.d2);
    const out = [];
    for (let k = 0; k < maxCount && k < _nbrBuf.length; k++) out.push(_nbrBuf[k].j);
    return out;
  }

  // Ignite a node and emit packets to its neighbours. `force` (a click) bypasses
  // the per-frame budget so a tap always fires; auto/chain fires respect it.
  let frameBudget = FRAME_SPAWN_BUDGET;
  function fireHub(i, level, force = false) {
    hubHeat[i] = Math.max(hubHeat[i], Math.min(HEAT_CAP, level));
    if (!force && frameBudget <= 0) return;
    const fan = level >= 0.9 ? INIT_FANOUT : CHAIN_FANOUT;
    const nbrs = neighborsOf(i, fan);
    if (nbrs.length) {
      spawnPackets(pool, i, nbrs, level, PACKET_SPEED, fan);
      if (!force) frameBudget--;
    }
  }

  // ---------- Post: a restrained bloom for the glow ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.75, 0.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- Interaction: pointer parallax + cursor-as-node + click-to-fire ----------
  let tx = 0, ty = 0, px = 0, py = 0;         // parallax targets / eased
  let pnx = 0, pny = 0;                        // pointer in NDC (-1..1)
  let pointerInfluence = 0;                    // rises on move, decays on stop/leave
  const PROX_RADIUS = 0.18;                    // NDC radius of the cursor's pull
  const PROX_HEAT = 0.7;                       // how bright nearby nodes get
  const POINTER_EDGE_ALPHA = 0.9;
  const INFLUENCE_DECAY = 2.5;                 // per second (~0.4s to fade out)
  const _v = new THREE.Vector3();              // scratch (projection)
  const _a = new THREE.Vector3();              // scratch (pointer world anchor)
  const hubNDC = new Float32Array(N_HUB * 2);  // hub xy in NDC
  const hubNDCz = new Float32Array(N_HUB);     // hub NDC depth (for the edge anchor)

  const toNDC = (e) => {
    pnx = (e.clientX / innerWidth) * 2 - 1;
    pny = -((e.clientY / innerHeight) * 2 - 1);
  };
  if (!reduceMotion) {
    addEventListener('pointermove', (e) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
      toNDC(e);
      pointerInfluence = 1;
    }, { passive: true });
    addEventListener('pointerleave', () => { pointerInfluence = 0; }, { passive: true });
    addEventListener('pointerdown', (e) => {
      toNDC(e);
      pointerInfluence = 1;
      let nearest = -1, best = Infinity;               // nearest hub in screen space
      for (let i = 0; i < N_HUB; i++) {
        _v.set(hubPos[i * 3], hubPos[i * 3 + 1], hubPos[i * 3 + 2]).project(camera);
        const dx = _v.x - pnx, dy = _v.y - pny, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; nearest = i; }
      }
      if (nearest >= 0) fireHub(nearest, 1.0, true);   // a tap always ignites + ripples
    }, { passive: true });
  }

  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', onResize);

  // Position the camera (parallax) and refresh its matrices so project()/unproject()
  // are correct this frame. Called before updateGraph so the cursor maths line up.
  function positionCamera(t) {
    if (!reduceMotion) {
      px += (tx - px) * 0.045;
      py += (ty - py) * 0.045;
      camera.position.x = Math.sin(t * 0.05) * 4 + px * 9;
      camera.position.y = Math.cos(t * 0.043) * 2.2 - py * 6;
      camera.lookAt(0, 0, 0);
    }
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  }

  // Drift nodes, decay heat, advance the inference cascade, fire, rebuild edges,
  // knit cursor edges, and lay out the packet points — the whole living graph.
  let lastFire = 0;
  function updateGraph(t, dt) {
    frameBudget = FRAME_SPAWN_BUDGET;

    // 1) drift + heat decay
    for (let i = 0; i < N_HUB; i++) {
      const s = hubSeed[i] * 6.2831853;
      hubPos[i * 3]     = hubBase[i * 3]     + Math.sin(t * 0.21 + s) * 3.1;
      hubPos[i * 3 + 1] = hubBase[i * 3 + 1] + Math.cos(t * 0.17 + s * 1.3) * 3.1;
      hubPos[i * 3 + 2] = hubBase[i * 3 + 2] + Math.sin(t * 0.14 + s * 0.7) * 3.1;
      hubHeat[i] = Math.max(0, hubHeat[i] - dt * 1.4);
    }
    hubPosAttr.needsUpdate = true;

    // 2) advance packets, then the damped chain (arrivals deposit heat / re-fire)
    const arrivals = advancePackets(pool, dt);
    for (let k = 0; k < arrivals.length; k++) {
      const nl = chainOnArrival(hubHeat, arrivals[k].dst, arrivals[k].level, DEPOSIT, REFIRE_MIN, CHAIN_DAMP, HEAT_CAP);
      if (nl > 0 && frameBudget > 0 && Math.random() < REFIRE_CHANCE) fireHub(arrivals[k].dst, nl);
    }

    // 3) the periodic "inference" fire (held back until the reveal has settled)
    if (t - lastFire > 0.5 && revealNodes(t) > 0.5) {
      lastFire = t;
      fireHub((Math.random() * N_HUB) | 0, 1.0);
    }

    // 4) rebuild the proximity edge graph (reserve headroom for cursor edges)
    let seg = 0;
    const introE = revealEdges(t);
    const L2 = LINK * LINK;
    for (let i = 0; i < N_HUB && seg < HUB_SEG_MAX; i++) {
      const ax = hubPos[i * 3], ay = hubPos[i * 3 + 1], az = hubPos[i * 3 + 2];
      for (let j = i + 1; j < N_HUB && seg < HUB_SEG_MAX; j++) {
        const dx = ax - hubPos[j * 3], dy = ay - hubPos[j * 3 + 1], dz = az - hubPos[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > L2) continue;
        const d = Math.sqrt(d2);
        let a = 1 - d / LINK;                                           // linear falloff — closer = stronger
        const heat = Math.max(hubHeat[i], hubHeat[j]);
        a *= 0.5 + heat * 0.95;                                         // clearly faint at rest, bright when a node fires
        a *= 0.8 + 0.2 * Math.sin(t * 0.8 + (i * 7 + j) * 0.9);         // gentle shimmer
        a *= introE;                                                    // edges knit in after the nodes
        if (a < 0.02) continue;
        const o = seg * 6, va = seg * 2;
        linePos[o]     = ax; linePos[o + 1] = ay; linePos[o + 2] = az;
        linePos[o + 3] = hubPos[j * 3]; linePos[o + 4] = hubPos[j * 3 + 1]; linePos[o + 5] = hubPos[j * 3 + 2];
        lineAlpha[va] = a; lineAlpha[va + 1] = a;
        seg++;
      }
    }

    // 5) cursor as a transient node — brighten neighbours and knit edges toward it
    if (!reduceMotion && pointerInfluence > 0.001) {
      for (let i = 0; i < N_HUB; i++) {
        _v.set(hubPos[i * 3], hubPos[i * 3 + 1], hubPos[i * 3 + 2]).project(camera);
        hubNDC[i * 2] = _v.x; hubNDC[i * 2 + 1] = _v.y; hubNDCz[i] = _v.z;
      }
      const { nearest, list } = pickNearby(hubNDC, N_HUB, pnx, pny, PROX_RADIUS);
      for (let k = 0; k < list.length; k++) {
        const boost = list[k].fall * pointerInfluence * PROX_HEAT;     // a floor, not accumulation
        if (boost > hubHeat[list[k].i]) hubHeat[list[k].i] = boost;
      }
      if (nearest >= 0 && list.length) {
        _a.set(pnx, pny, hubNDCz[nearest]).unproject(camera);          // pointer at the nearest node's depth
        let added = 0;
        for (let k = 0; k < list.length && added < POINTER_EDGE_MAX && seg < MAX_SEG; k++) {
          const a = list[k].fall * pointerInfluence * POINTER_EDGE_ALPHA;
          if (a < 0.02) continue;
          const hi = list[k].i, o = seg * 6, va = seg * 2;
          linePos[o]     = _a.x; linePos[o + 1] = _a.y; linePos[o + 2] = _a.z;
          linePos[o + 3] = hubPos[hi * 3]; linePos[o + 4] = hubPos[hi * 3 + 1]; linePos[o + 5] = hubPos[hi * 3 + 2];
          lineAlpha[va] = a; lineAlpha[va + 1] = a;
          seg++; added++;
        }
      }
    }
    pointerInfluence = Math.max(0, pointerInfluence - dt * INFLUENCE_DECAY);
    linePosAttr.needsUpdate = true;
    lineAlphaAttr.needsUpdate = true;
    lineGeo.setDrawRange(0, seg * 2);

    // 6) lay out packet points along their edges (fade in/out; gated by the reveal)
    const introN = revealNodes(t);
    for (let i = 0; i < pool.n; i++) {
      const s = pool.src[i], d = pool.dst[i], pr = pool.prog[i];
      const sx = hubPos[s * 3], sy = hubPos[s * 3 + 1], sz = hubPos[s * 3 + 2];
      pkPos[i * 3]     = sx + (hubPos[d * 3]     - sx) * pr;
      pkPos[i * 3 + 1] = sy + (hubPos[d * 3 + 1] - sy) * pr;
      pkPos[i * 3 + 2] = sz + (hubPos[d * 3 + 2] - sz) * pr;
      pkLevel[i] = pool.level[i] * Math.sin(Math.PI * pr) * introN;
    }
    pkPosAttr.needsUpdate = true;
    pkLevelAttr.needsUpdate = true;
    pkGeo.setDrawRange(0, pool.n);

    // 7) push heat last, after every mutation (decay, chain, fire, cursor)
    hubHeatAttr.needsUpdate = true;
  }

  // Day/night: drift the palette + background with UTC time-of-day (throttled to ~1/s).
  // Kept deep-space dark end to end — the day background stays under the pre-dark theme.
  let lastDN = -1;
  function updateDayNight(t) {
    const sec = t | 0;
    if (sec === lastDN) return;
    lastDN = sec;
    const now = new Date();
    const dl = daylight01(now.getUTCHours(), now.getUTCMinutes());
    const bg = packRGB(mixHex(DN_NIGHT_BG, DN_DAY_BG, dl));
    renderer.setClearColor(bg, 1);
    scene.fog.color.setHex(bg);
    uniforms.uRoyal.value.setHex(packRGB(mixHex(DN_ROYAL[0], DN_ROYAL[1], dl)));
    uniforms.uAmethyst.value.setHex(packRGB(mixHex(DN_AMETHYST[0], DN_AMETHYST[1], dl)));
    uniforms.uLilac.value.setHex(packRGB(mixHex(DN_LILAC[0], DN_LILAC[1], dl)));
    uniforms.uCore.value.setHex(packRGB(mixHex(DN_CORE[0], DN_CORE[1], dl)));
  }

  function render(t) {
    uniforms.uTime.value = t;
    uniforms.uIntro.value = revealNodes(t);
    updateDayNight(t);
    composer.render();
  }

  // ---------- Loop / lifecycle ----------
  const clock = new THREE.Clock();
  let running = true;
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);   // getDelta() also advances elapsedTime
    const t = clock.elapsedTime;
    positionCamera(t);
    updateGraph(t, dt);
    render(t);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; }
    else if (!reduceMotion && !running) { running = true; clock.getDelta(); loop(); }
  });

  addEventListener('pagehide', () => {
    running = false;
    dustGeo.dispose(); dustMat.dispose();
    hubGeo.dispose();  hubMat.dispose();
    lineGeo.dispose(); lineMat.dispose();
    pkGeo.dispose();   pkMat.dispose();
    bloom.dispose?.(); composer.dispose?.(); renderer.dispose();
  }, { once: true });

  if (reduceMotion) {
    positionCamera(6.0);
    updateGraph(6.0, 0);   // one composed still frame — the constellation, held (fully revealed)
    render(6.0);
  } else {
    loop();
  }
}
