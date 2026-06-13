import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ---------- Chrome: clock + build hash ---------- */
const buildHash = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
document.getElementById('build').textContent = `v2.0 // BUILD_${buildHash}`;

const clockEl = document.getElementById('clock');
function tickClock() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  clockEl.textContent = `${hh}:${mm}:${ss} UTC`;
}
tickClock();
setInterval(tickClock, 1000);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Glyph atlas (offscreen 2D canvas -> CanvasTexture) ---------- */
const GRID = 8;                 // 8 x 8 = 64 cells
const CELL = 64;                // px per cell
const ATLAS = GRID * CELL;      // 512

// katakana + digits + a few symbols
const glyphs = [];
for (let c = 0x30A1; c <= 0x30F6; c++) glyphs.push(String.fromCharCode(c)); // katakana
'0123456789'.split('').forEach(ch => glyphs.push(ch));
'ｱｲｳ:=*+<>'.split('').forEach(ch => glyphs.push(ch));
while (glyphs.length < GRID * GRID) glyphs.push('0');
glyphs.length = GRID * GRID;

function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.floor(CELL * 0.74)}px 'Courier New', Courier, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < glyphs.length; i++) {
    const col = i % GRID;
    const row = Math.floor(i / GRID);
    const cx = col * CELL + CELL / 2;
    const cy = row * CELL + CELL / 2;
    ctx.fillText(glyphs[i], cx, cy);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// UV bottom-left offset of each cell, accounting for default flipY=true
function cellOffset(index) {
  const col = index % GRID;
  const row = Math.floor(index / GRID);
  return [col / GRID, 1 - (row + 1) / GRID];
}

/* ---------- Renderer / scene / camera ---------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.021);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 12);

// Aspect-aware framing: a fixed vertical FOV zooms in too far on tall,
// narrow phone screens (portrait), hiding the side rain. Widen the
// vertical FOV as the viewport gets narrower so the scene stays immersive.
const BASE_FOV = 62;
function applyCameraProjection() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect < 1
    ? THREE.MathUtils.clamp(BASE_FOV / Math.max(aspect, 0.5), BASE_FOV, 85)
    : BASE_FOV;
  camera.updateProjectionMatrix();
}
applyCameraProjection();

/* ---------- Volumetric rain (InstancedMesh + atlas shader) ---------- */
const STREAMS = 150;
const PER_STREAM = 18;
const COUNT = STREAMS * PER_STREAM;
const SPACING = 1.45;

const BOUNDS = { x: 30, y: 28, zNear: 7, zFar: -46 };

const geo = new THREE.PlaneGeometry(1.15, 1.45);
const aOffset = new Float32Array(COUNT * 2);
const aIntensity = new Float32Array(COUNT);
geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(aOffset, 2).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(aIntensity, 1));

const atlas = buildAtlas();
const material = new THREE.MeshBasicMaterial({
  map: atlas,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false,
  fog: true,
});

const headColor = new THREE.Color(0xe8fff5);
const tailColor = new THREE.Color(0x00ff9d);

material.onBeforeCompile = (shader) => {
  shader.uniforms.cellSize = { value: 1 / GRID };
  shader.uniforms.uHead = { value: headColor };
  shader.uniforms.uTail = { value: tailColor };

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec2 aOffset;
      attribute float aIntensity;
      uniform float cellSize;
      varying vec2 vAtlasUv;
      varying float vIntensity;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vAtlasUv = aOffset + uv * cellSize;
      vIntensity = aIntensity;`);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec2 vAtlasUv;
      varying float vIntensity;
      uniform vec3 uHead;
      uniform vec3 uTail;`)
    .replace('#include <map_fragment>', `
      vec4 texel = texture2D( map, vAtlasUv );
      float mask = texel.a;
      vec3 col = mix( uTail, uHead, smoothstep(0.55, 1.0, vIntensity) );
      // boost the leading glyph toward white-hot
      col += uHead * pow(vIntensity, 6.0) * 0.6;
      diffuseColor.rgb = col;
      diffuseColor.a *= mask * (0.05 + 0.95 * vIntensity);`);
};

const mesh = new THREE.InstancedMesh(geo, material, COUNT);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;
scene.add(mesh);

// per-stream state
// Keep a clear vertical corridor down the foreground center so the
// wordmark stays readable. Streams nearer the camera than CLEAR_Z must
// sit outside a horizontal half-width of CLEAR_X; distant streams (small,
// dim, fogged) are free to fill the background behind the text.
let CLEAR_X = 11;
const CLEAR_Z = -14;
const CAM_BASE_Z = 12;

// Size the clear corridor to the visible width at the clearance plane so
// the wordmark stays unobstructed on any screen. Portrait phones keep a
// larger fraction clear (the wordmark occupies more of a narrow screen);
// wide screens keep it tighter so foreground rain still fills the sides.
function computeClearX() {
  const refDist = CAM_BASE_Z - CLEAR_Z;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * refDist;
  const halfW = halfH * camera.aspect;
  const clearFrac = camera.aspect < 1 ? 0.72 : 0.42;
  CLEAR_X = THREE.MathUtils.clamp(halfW * clearFrac, 5, BOUNDS.x * 0.9);
}
computeClearX();

function placeStreamXZ(stream) {
  stream.z = THREE.MathUtils.randFloat(BOUNDS.zFar, BOUNDS.zNear);
  let x = THREE.MathUtils.randFloatSpread(BOUNDS.x * 2);
  if (stream.z > CLEAR_Z && Math.abs(x) < CLEAR_X) {
    const sign = x < 0 ? -1 : 1;
    x = sign * THREE.MathUtils.randFloat(CLEAR_X, BOUNDS.x);
  }
  stream.x = x;
}

const streams = [];
for (let s = 0; s < STREAMS; s++) {
  const stream = {
    x: 0,
    z: 0,
    headY: THREE.MathUtils.randFloat(-BOUNDS.y, BOUNDS.y + 30),
    speed: THREE.MathUtils.randFloat(5.5, 13.5),
    swap: THREE.MathUtils.randFloat(0.04, 0.16),
  };
  placeStreamXZ(stream);
  streams.push(stream);
}

function randGlyphOffset(idx) {
  const off = cellOffset(Math.floor(Math.random() * glyphs.length));
  aOffset[idx * 2] = off[0];
  aOffset[idx * 2 + 1] = off[1];
}

// initialize attributes + intensities
for (let s = 0; s < STREAMS; s++) {
  for (let g = 0; g < PER_STREAM; g++) {
    const idx = s * PER_STREAM + g;
    randGlyphOffset(idx);
    // g=0 is the leading (bottom) glyph -> brightest; trail fades upward
    aIntensity[idx] = Math.max(0, 1 - g / (PER_STREAM - 1));
  }
}
geo.getAttribute('aIntensity').needsUpdate = true;

const dummy = new THREE.Object3D();

function writeStream(s, stream) {
  for (let g = 0; g < PER_STREAM; g++) {
    const idx = s * PER_STREAM + g;
    dummy.position.set(stream.x, stream.headY + g * SPACING, stream.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
  }
}

// first placement
for (let s = 0; s < STREAMS; s++) writeStream(s, streams[s]);
mesh.instanceMatrix.needsUpdate = true;
geo.getAttribute('aOffset').needsUpdate = true;

function updateRain(dt, t) {
  let offsetsDirty = false;
  for (let s = 0; s < STREAMS; s++) {
    const stream = streams[s];
    stream.headY -= stream.speed * dt;
    // recycle when the whole stream has fallen past the bottom
    if (stream.headY < -BOUNDS.y - PER_STREAM * SPACING) {
      stream.headY = BOUNDS.y + THREE.MathUtils.randFloat(2, 26);
      placeStreamXZ(stream);
      stream.speed = THREE.MathUtils.randFloat(5.5, 13.5);
      for (let g = 0; g < PER_STREAM; g++) randGlyphOffset(s * PER_STREAM + g);
      offsetsDirty = true;
    }
    // occasional glyph mutation
    if (Math.random() < stream.swap) {
      randGlyphOffset(s * PER_STREAM + Math.floor(Math.random() * PER_STREAM));
      offsetsDirty = true;
    }
    writeStream(s, stream);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (offsetsDirty) geo.getAttribute('aOffset').needsUpdate = true;
}

/* ---------- Post-processing ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.1,   // strength
  0.55,  // radius
  0.12   // threshold
);
composer.addPass(bloom);

/* ---------- Camera drift (gentle orbit + breathing dolly) ---------- */
const lookTarget = new THREE.Vector3(0, 0, -12);
function driftCamera(t) {
  camera.position.x = Math.sin(t * 0.045) * 3.2;
  camera.position.y = Math.cos(t * 0.037) * 1.8;
  camera.position.z = CAM_BASE_Z + Math.sin(t * 0.06) * 2.2;
  camera.lookAt(lookTarget);
}

/* ---------- Resize ---------- */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  applyCameraProjection();
  computeClearX();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* ---------- Loop ---------- */
const clock = new THREE.Clock();
let running = true;

function animate() {
  if (!running) return;
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  updateRain(dt, t);
  driftCamera(t);
  composer.render();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
  } else if (!reduceMotion && !running) {
    running = true;
    clock.getDelta(); // discard the long pause delta
    animate();
  }
});

if (reduceMotion) {
  // Calm fallback: place a single static frame, no animation loop.
  driftCamera(0);
  camera.position.set(0, 0, 12);
  camera.lookAt(lookTarget);
  composer.render();
  running = false;
} else {
  animate();
}
