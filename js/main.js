(() => {
  'use strict';

  /* ─────────── Digital Rain ─────────── */
  const canvas = document.getElementById('rain');
  const ctx = canvas.getContext('2d', { alpha: true });

  const GLYPHS = (
    'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
    '0123456789' +
    '∆∇∞≡≈⌬⌭⌶⍱⌁'
  ).split('');

  let cols = 0;
  let drops = [];
  let fontSize = 16;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let running = true;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fontSize = w < 720 ? 14 : 18;
    cols = Math.ceil(w / fontSize);
    drops = new Array(cols).fill(0).map(() =>
      Math.random() * (h / fontSize) * -1
    );
  }

  function step() {
    if (!running) { requestAnimationFrame(step); return; }

    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = `${fontSize}px "Courier New", Courier, monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < cols; i++) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];

      ctx.fillStyle = 'rgba(220, 255, 235, 0.95)';
      ctx.shadowColor = '#00ff9d';
      ctx.shadowBlur = 12;
      ctx.fillText(ch, x, y);

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0, 255, 157, 0.55)';
      if (Math.random() > 0.975) {
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y - fontSize);
      }

      if (y > h && Math.random() > 0.965) {
        drops[i] = (Math.random() * -20) | 0;
      }
      drops[i] += 1;
    }

    requestAnimationFrame(step);
  }

  /* ─────────── Clock ─────────── */
  const clockEl = document.getElementById('clock');
  function tick() {
    const d = new Date();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    clockEl.textContent = `${hh}:${mm}:${ss} UTC`;
  }
  tick();
  setInterval(tick, 1000);

  /* ─────────── Build hash ─────────── */
  const buildEl = document.getElementById('build');
  buildEl.textContent = Array.from({ length: 4 }, () =>
    '0123456789ABCDEF'[(Math.random() * 16) | 0]
  ).join('');

  /* ─────────── Pause when tab hidden ─────────── */
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
  });

  /* ─────────── Init ─────────── */
  resize();
  window.addEventListener('resize', resize, { passive: true });
  requestAnimationFrame(step);
})();
