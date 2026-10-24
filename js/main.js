/* ============================================================
   messana.ai — v5 "Silk"
   One full-screen fragment shader: slow, domain-warped fbm "silk"
   in violet. A soft light follows the pointer (or drifts when idle)
   and flares on tap; the scene fades up from ink on first load.

   Plain WebGL 1 — no library, no CDN. If WebGL is unavailable the
   canvas stays hidden and the CSS gradient carries the page.
   ============================================================ */

/* PWA: register the service worker (root scope) */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* Live UTC clock */
const clockEl = document.getElementById('clock');
function tickClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  clockEl.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}
tickClock();
setInterval(tickClock, 1000);

/* "About the backdrop" disclosure — independent of WebGL. */
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

const root = document.documentElement;
const canvas = document.getElementById('scene');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const VERT = /* glsl */`
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
precision highp float;

uniform vec2  uRes;     // drawing-buffer size (px)
uniform float uTime;    // seconds
uniform float uIntro;   // 0 -> 1 first-load reveal
uniform vec2  uLight;   // soft light position, follows the pointer (uv space)
uniform float uPulse;   // tap flare, decays to 0

// Brand palette (sRGB, written straight to the sRGB framebuffer)
const vec3 INK    = vec3(0.027, 0.012, 0.059);   // #07030f
const vec3 PLUM   = vec3(0.180, 0.063, 0.396);   // #2e1065
const vec3 VIOLET = vec3(0.298, 0.114, 0.584);   // #4c1d95
const vec3 ROYAL  = vec3(0.486, 0.227, 0.929);   // #7c3aed
const vec3 LILAC  = vec3(0.847, 0.788, 1.000);   // #d8c9ff

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += a * noise(p);
    p = ROT * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;   // centered, height = 1
  float t = uTime * 0.035;

  // ---- Silk: two levels of domain warping ----
  vec2 p = uv * 1.5;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + 1.3 * t),
                fbm(p + 3.2 * q + vec2(8.3, 2.8) - 0.9 * t));
  float f = fbm(p + 3.0 * r);

  vec3 col = mix(INK, PLUM, smoothstep(0.15, 0.85, f));
  col = mix(col, VIOLET, smoothstep(0.35, 1.15, length(q)) * 0.65);
  col = mix(col, ROYAL, smoothstep(0.55, 0.95, r.x) * 0.35);
  float fold = smoothstep(0.62, 0.98, f) * smoothstep(0.35, 0.85, r.y);
  col += LILAC * fold * 0.16;
  col *= 0.40 + 1.15 * f * f;

  // ---- Light: a soft glow that follows the pointer (slow drift when idle) ----
  vec2 ld = uv - uLight;
  float light = exp(-dot(ld, ld) * 7.0) * (1.0 + uPulse * 1.4);
  col *= 1.0 + 1.1 * light;
  col += ROYAL * light * 0.06 * (0.4 + f);

  // ---- Legibility: a gentle, wide shadow pooled behind the wordmark ----
  vec2 tv = uv * vec2(0.85, 1.9);
  col *= 1.0 - 0.32 * exp(-dot(tv, tv) * 5.0);

  // ---- Finish ----
  vec2 vv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(vv, vv) * 1.15;                       // vignette
  col = mix(INK, col, smoothstep(0.0, 0.35, uIntro));    // fade up from ink
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;   // dither out banding
  gl_FragColor = vec4(col, 1.0);
}
`;

silk();

function silk() {
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  if (!gl) return standDown();

  const small = Math.min(innerWidth, innerHeight) < 560;
  const prog = buildProgram(gl, VERT, FRAG.replace('OCTAVES', small ? '4' : '5'));
  if (!prog) return standDown();

  // full-screen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(prog);

  const U = {};
  for (const k of ['uRes', 'uTime', 'uIntro', 'uLight', 'uPulse']) U[k] = gl.getUniformLocation(prog, k);

  // The silk is soft, so render below native resolution and let CSS upscale;
  // cap total pixels so huge/HiDPI screens stay cool.
  function resize() {
    let scale = Math.min(devicePixelRatio || 1, 1.5) * 0.8;
    const maxPx = 1.4e6;
    if (innerWidth * innerHeight * scale * scale > maxPx) scale = Math.sqrt(maxPx / (innerWidth * innerHeight));
    canvas.width = Math.max(1, Math.round(innerWidth * scale));
    canvas.height = Math.max(1, Math.round(innerHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
  }
  resize();
  addEventListener('resize', () => { resize(); if (!running) draw(lastT); });

  // ---- Pointer: the corona leans toward you; a tap flares it ----
  let lx = 0.25 * Math.min(innerWidth / innerHeight, 1.6), ly = 0.2;   // eased light position (uv)
  let tlx = lx, tly = ly;            // target
  let lastPointer = -Infinity;
  let pulse = 0;
  const toUV = (e) => [
    (e.clientX - innerWidth / 2) / innerHeight,
    -(e.clientY - innerHeight / 2) / innerHeight,
  ];
  if (!reduceMotion) {
    addEventListener('pointermove', (e) => {
      [tlx, tly] = toUV(e);
      lastPointer = performance.now();
    }, { passive: true });
    addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('button, .info-panel')) return;
      [tlx, tly] = toUV(e);
      lastPointer = performance.now();
      pulse = 1;
    }, { passive: true });
  }

  let lastT = 6;
  function draw(t) {
    lastT = t;
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uIntro, reduceMotion ? 1 : smoothstep(0.25, 2.9, t));
    gl.uniform2f(U.uLight, lx, ly);
    gl.uniform1f(U.uPulse, pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- Loop / lifecycle ----
  let running = false;
  let start = performance.now();
  let prev = start;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    const t = (now - start) / 1000;

    // idle: the light drifts slowly in a wide loop
    if (now - lastPointer > 3500) {
      const a = 0.55 + t * 0.07;
      tlx = Math.cos(a) * 0.42 * Math.min(innerWidth / innerHeight, 1.6);
      tly = Math.sin(a) * 0.3;
    }
    const k = 1 - Math.exp(-dt * 2.2);
    lx += (tlx - lx) * k;
    ly += (tly - ly) * k;
    pulse = Math.max(0, pulse - dt * 1.4);
    draw(t);
  }
  function play() {
    if (running || reduceMotion) return;
    running = true;
    prev = performance.now();
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else { start += performance.now() - prev; play(); }   // resume without a time jump
  });

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; standDown(); });

  root.classList.add('gl');
  if (reduceMotion) draw(6);   // a single composed still
  else play();
}

function standDown() {
  root.classList.remove('gl');
  canvas.style.display = 'none';
}

function buildProgram(gl, vs, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[silk] shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[silk] link:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
