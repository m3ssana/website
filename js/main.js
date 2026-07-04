/* ============================================================
   messana.ai — v4 "Signal"
   A minimalistic, AI-themed landing page for the Messana family.
   A slow-drifting neural constellation — glowing nodes joined by
   "signal" edges that form and dissolve as the graph rewires —
   sits behind the wordmark: the family as one small, connected
   signal node, rendered in glass and light.
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
  const AUBERGINE = 0x160726;
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

  // Palette shared across all three materials (one source of truth).
  const uniforms = {
    uTime:     { value: 0 },
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
      varying float vTw;
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r);
        vec3 c = mix(uRoyal, uAmethyst, vTw);
        gl_FragColor = vec4(c, a * (0.25 + 0.5 * vTw) * vFade);
      }`,
  });
  const dustPts = new THREE.Points(dustGeo, dustMat);
  dustPts.frustumCulled = false;
  scene.add(dustPts);

  // ---------- (2) Signal nodes: the constellation (CPU-driven drift + heat) ----------
  const N_HUB = small ? 58 : 90;
  const LINK = 21;            // max edge length (world units)
  const MAX_SEG = 420;        // hard cap on drawn edges
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
      void main() {
        float tw = 0.5 + 0.5 * sin(uTime * 1.5 + aSeed * 30.0);
        vGlow = clamp(0.4 + 0.45 * tw + aHeat, 0.0, 1.6);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (2.2 + 3.6 * vGlow) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLilac;
      uniform vec3 uCore;
      varying float vGlow;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        vec3 c = mix(uLilac, uCore, clamp(vGlow - 0.5, 0.0, 1.0));
        gl_FragColor = vec4(c, core);
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

  // ---------- Post: a restrained bloom for the glow ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.75, 0.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- Interaction: gentle pointer parallax (desktop delight) ----------
  let tx = 0, ty = 0, px = 0, py = 0;
  if (!reduceMotion) addEventListener('pointermove', (e) => {
    tx = e.clientX / innerWidth - 0.5;
    ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', onResize);

  // Drift the nodes, decay heat, fire the occasional neuron, rebuild the edges.
  let lastFire = 0;
  function updateGraph(t, dt) {
    for (let i = 0; i < N_HUB; i++) {
      const s = hubSeed[i] * 6.2831853;
      hubPos[i * 3]     = hubBase[i * 3]     + Math.sin(t * 0.21 + s) * 3.1;
      hubPos[i * 3 + 1] = hubBase[i * 3 + 1] + Math.cos(t * 0.17 + s * 1.3) * 3.1;
      hubPos[i * 3 + 2] = hubBase[i * 3 + 2] + Math.sin(t * 0.14 + s * 0.7) * 3.1;
      hubHeat[i] = Math.max(0, hubHeat[i] - dt * 1.4);
    }
    if (t - lastFire > 0.5) {                 // a node "fires" — quiet inference metaphor
      lastFire = t;
      hubHeat[(Math.random() * N_HUB) | 0] = 1.0;
    }
    hubPosAttr.needsUpdate = true;
    hubHeatAttr.needsUpdate = true;

    let seg = 0;
    const L2 = LINK * LINK;
    for (let i = 0; i < N_HUB && seg < MAX_SEG; i++) {
      const ax = hubPos[i * 3], ay = hubPos[i * 3 + 1], az = hubPos[i * 3 + 2];
      for (let j = i + 1; j < N_HUB && seg < MAX_SEG; j++) {
        const dx = ax - hubPos[j * 3], dy = ay - hubPos[j * 3 + 1], dz = az - hubPos[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > L2) continue;
        const d = Math.sqrt(d2);
        let a = 1 - d / LINK;                                           // linear falloff — closer = stronger
        const heat = Math.max(hubHeat[i], hubHeat[j]);
        a *= 0.5 + heat * 0.95;                                         // clearly faint at rest, bright when a node fires
        a *= 0.8 + 0.2 * Math.sin(t * 0.8 + (i * 7 + j) * 0.9);         // gentle shimmer
        if (a < 0.02) continue;
        const o = seg * 6, va = seg * 2;
        linePos[o]     = ax; linePos[o + 1] = ay; linePos[o + 2] = az;
        linePos[o + 3] = hubPos[j * 3]; linePos[o + 4] = hubPos[j * 3 + 1]; linePos[o + 5] = hubPos[j * 3 + 2];
        lineAlpha[va] = a; lineAlpha[va + 1] = a;
        seg++;
      }
    }
    linePosAttr.needsUpdate = true;
    lineAlphaAttr.needsUpdate = true;
    lineGeo.setDrawRange(0, seg * 2);
  }

  function render(t) {
    uniforms.uTime.value = t;
    if (!reduceMotion) {
      px += (tx - px) * 0.045;
      py += (ty - py) * 0.045;
      camera.position.x = Math.sin(t * 0.05) * 4 + px * 9;
      camera.position.y = Math.cos(t * 0.043) * 2.2 - py * 6;
      camera.lookAt(0, 0, 0);
    }
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
    bloom.dispose?.(); composer.dispose?.(); renderer.dispose();
  }, { once: true });

  if (reduceMotion) {
    updateGraph(6.0, 0);   // one composed still frame — the constellation, held
    render(6.0);
  } else {
    loop();
  }
}
