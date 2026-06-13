/* ============================================================
   messana.ai — v3 "The Glass Score"
   A UTC clock, and a hidden melody written onto a staff by a
   slow "AI" cursor. The notes are Ed Sheeran's "Thinking Out
   Loud" (verse, D major) — a quiet gem for those who read music.
   ============================================================ */

/* PWA: register the service worker (root scope) */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = document.getElementById('scene');
const ctx = cv.getContext('2d');
let W, H, dpr;
function fit() {
  dpr = Math.min(devicePixelRatio, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit();
addEventListener('resize', fit);

/* live UTC timestamp */
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

const ROYAL = '124, 58, 237';
const LINES = 5, GAP = 16;
const BPM = 79;   // "Thinking Out Loud" tempo (4/4)

// --- "Thinking Out Loud" (Ed Sheeran) — verse, D major (two sharps: F#, C#).
// Transcribed by ear within the song's known frame (D major, 4/4, ~79 BPM,
// fully diatonic over I-IV-V); transposed up one octave to sit on the treble
// staff. Each entry: [letter, octave, beats, lyric] (sharps come from the key sig).
const LETTER = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const THEME = [
  ['A', 4, 0.5, 'When'], ['B', 4, 0.5, 'your'],
  ['D', 5, 0.75, 'legs'], ['D', 5, 0.5, 'don\u2019t'], ['D', 5, 0.5, 'work'], ['D', 5, 0.5, 'like'], ['D', 5, 0.5, 'they'],
  ['E', 5, 0.5, 'used'], ['F', 5, 0.5, 'to'], ['E', 5, 0.75, 'be-'], ['D', 5, 1, 'fore'],
  ['A', 4, 0.5, 'and'], ['B', 4, 0.5, 'I'],
  ['D', 5, 0.5, 'can\u2019t'], ['D', 5, 0.5, 'sweep'], ['D', 5, 0.5, 'you'],
  ['E', 5, 0.5, 'off'], ['D', 5, 0.5, 'of'], ['B', 4, 0.5, 'your'], ['A', 4, 1.5, 'feet'],
];
const totalBeats = THEME.reduce((s, n) => s + n[2], 0);
const CYCLE = totalBeats * 60 / BPM;   // one sweep = the phrase at the real tempo
let acc = 0;
const seq = THEME.map((n) => {
  const startN = acc / totalBeats;
  acc += n[2];
  const deg = n[1] * 7 + LETTER[n[0]] - 34; // diatonic steps from B4 (centre line)
  return { deg, startN, x: 0, born: null };
});
let lastLap = -1;

function staffY() {
  const landscapeShort = W > H && H < 560;   // phone on its side
  return H * (landscapeShort ? 0.72 : 0.66);
}
function staffMargin() { return W < 700 ? 16 : Math.min(W * 0.1, 110); }

function glyph(ch, size, x, y, alpha, align) {
  ctx.fillStyle = `rgba(${ROYAL}, ${alpha})`;
  ctx.font = `${size}px 'Segoe UI Symbol', 'Noto Music', serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align || 'left';
  ctx.fillText(ch, x, y);
}

function draw(time) {
  ctx.clearRect(0, 0, W, H);
  const cy = staffY();
  const left = staffMargin();
  const small = Math.min(W, H) < 560;        // phone-sized viewport
  const clefSize = small ? 42 : 56;
  const x0 = left + (small ? 54 : 76);        // notes start after clef + key signature
  const x1 = W - staffMargin();
  const span = x1 - x0;

  // staff lines
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${ROYAL}, 0.22)`;
  for (let i = 0; i < LINES; i++) {
    const y = cy + (i - (LINES - 1) / 2) * GAP;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(x1, y); ctx.stroke();
  }

  // treble clef + D-major key signature (F# on the top line, C# in the 3rd space)
  const ks = small ? 17 : 22;
  glyph('\uD834\uDD1E', clefSize, left + 2, cy + 3, 0.8);  // 𝄞
  glyph('\u266F', ks, left + (small ? 32 : 46), cy - 4 * (GAP / 2), 0.7);  // ♯ on F5
  glyph('\u266F', ks, left + (small ? 42 : 58), cy - 1 * (GAP / 2), 0.7);  // ♯ on C5

  // Standard note spacing (px per beat). When the whole phrase fits, stretch to
  // fill the staff (desktop/landscape). When it doesn't (portrait phones), keep
  // the spacing and pan the staff to follow the writing cursor — like a scrolling score.
  const prog = (time / CYCLE) % 1;
  const MIN_PXB = 46;
  const fitPXB = span / totalBeats;
  const scroll = fitPXB < MIN_PXB;
  const PXB = scroll ? MIN_PXB : fitPXB;
  const virtualW = totalBeats * PXB;
  const cursorVX = prog * virtualW;
  const camX = scroll
    ? Math.min(Math.max(cursorVX - span * 0.45, 0), Math.max(virtualW - span, 0))
    : 0;
  const cx = x0 + (cursorVX - camX);

  const lap = Math.floor(time / CYCLE);
  if (lap !== lastLap) { lastLap = lap; seq.forEach((n) => (n.born = null)); }

  // reveal notes as the cursor reaches them
  seq.forEach((n) => {
    n.x = x0 + (n.startN * virtualW - camX);
    if (prog >= n.startN && n.born === null) n.born = time;
  });
  // only notes that are written and currently on the staff
  const shown = seq.filter((n) => n.born !== null && n.x >= x0 - 1 && n.x <= x1 + 1);

  // melodic contour
  if (shown.length > 1) {
    ctx.strokeStyle = `rgba(${ROYAL}, 0.16)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    shown.forEach((n, i) => {
      const ny = cy - n.deg * (GAP / 2);
      if (i === 0) ctx.moveTo(n.x, ny); else ctx.lineTo(n.x, ny);
    });
    ctx.stroke();
  }

  // notes with ink-bleed fade-in
  const baseR = Math.min(small ? 4.5 : 5, PXB * 0.16); // size note heads to the spacing
  const stemLen = small ? 26 : 34;
  shown.forEach((n) => {
    const age = time - n.born;
    const ny = cy - n.deg * (GAP / 2);
    const grow = Math.min(age / 0.35, 1);
    const r = baseR + (1 - grow) * 6;
    const a = Math.min(age / 0.3, 1) * 0.92;

    // ledger lines for notes beyond the staff
    ctx.strokeStyle = `rgba(${ROYAL}, ${a * 0.7})`;
    ctx.lineWidth = 1;
    if (n.deg > 4) for (let d = 6; d <= n.deg; d += 2) { const ly = cy - d * (GAP / 2); ctx.beginPath(); ctx.moveTo(n.x - 11, ly); ctx.lineTo(n.x + 11, ly); ctx.stroke(); }
    if (n.deg < -4) for (let d = -6; d >= n.deg; d -= 2) { const ly = cy - d * (GAP / 2); ctx.beginPath(); ctx.moveTo(n.x - 11, ly); ctx.lineTo(n.x + 11, ly); ctx.stroke(); }

    // note head
    ctx.fillStyle = `rgba(${ROYAL}, ${a})`;
    ctx.beginPath(); ctx.ellipse(n.x, ny, r * 1.25, r, -0.35, 0, 7); ctx.fill();

    // stem: down for high notes, up for low
    ctx.strokeStyle = `rgba(${ROYAL}, ${a * 0.75})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (n.deg >= 1) { ctx.moveTo(n.x - r * 1.1, ny); ctx.lineTo(n.x - r * 1.1, ny + stemLen); }
    else { ctx.moveTo(n.x + r * 1.1, ny); ctx.lineTo(n.x + r * 1.1, ny - stemLen); }
    ctx.stroke();
  });

  // AI cursor: glowing vertical line with a soft halo
  const cursorH = small ? 46 : 70;
  const grad = ctx.createLinearGradient(cx, cy - cursorH, cx, cy + cursorH);
  grad.addColorStop(0, `rgba(${ROYAL}, 0)`);
  grad.addColorStop(0.5, `rgba(${ROYAL}, 0.9)`);
  grad.addColorStop(1, `rgba(${ROYAL}, 0)`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - cursorH); ctx.lineTo(cx, cy + cursorH); ctx.stroke();
  ctx.fillStyle = `rgba(${ROYAL}, 0.9)`;
  ctx.beginPath(); ctx.arc(cx, cy - (cursorH + 8), 3.5, 0, 7); ctx.fill();
}

let running = true, start = performance.now();
function loop(now) {
  if (!running) return;
  draw((now - start) / 1000);
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) running = false;
  else if (!reduceMotion && !running) { running = true; requestAnimationFrame(loop); }
});
if (reduceMotion) { seq.forEach((n) => (n.born = 0)); lastLap = 0; draw(CYCLE * 0.98); }
else requestAnimationFrame(loop);
