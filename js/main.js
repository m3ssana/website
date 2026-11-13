/* messana.ai — two cups. Live UTC clock and the service worker. */

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

(function () {
  var clock = document.getElementById('clock');
  if (!clock) return;

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function tick() {
    var now = new Date();
    var h = pad(now.getUTCHours());
    var m = pad(now.getUTCMinutes());
    var s = pad(now.getUTCSeconds());
    clock.textContent = h + ':' + m + ':' + s + ' UTC';
    clock.setAttribute('datetime', now.toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }

  tick();
  setInterval(tick, 1000);
})();
