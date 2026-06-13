# messana.ai

Personal landing page for **messana.ai** — v3 "The Glass Score." A quiet, royal‑purple‑on‑white wordmark floats over a music staff where a slow "AI" cursor writes a melody, note by note. The notes are a hidden transcription of Ed Sheeran's *Thinking Out Loud* (verse, D major, ~79 BPM) — a gem for those who read music. Installable as a PWA on iOS and Android.

Live at <https://messana.ai>.

## Project structure

```
website/
├── index.html             Markup + SEO/structured data + PWA tags
├── css/
│   └── styles.css          Purple + white design system, chrome overlay, responsive rules
├── js/
│   └── main.js             UTC clock, the "Glass Score" canvas, service-worker registration
├── manifest.webmanifest    PWA manifest (standalone, icons, theme)
├── sw.js                   Service worker (offline app shell)
├── icon-180/192/512.png    PWA / home-screen icons
├── favicon.svg
├── concepts/               Design exploration — 10 concept directions + gallery (archive)
└── CNAME                   GitHub Pages custom domain
```

No build step. Everything is served as‑is — vanilla HTML/CSS/JS, no framework, no bundler. The homepage uses the Canvas 2D API (no WebGL), so it runs without any CDN dependency beyond Google Fonts.

## The effect

- **The Glass Score** — a five‑line treble staff sits in the lower third. A glowing vertical "AI" cursor sweeps left→right at the song's real tempo (derived from `BPM`), revealing each note with an ink‑bleed fade and a faint melodic contour line. The key signature (two sharps) and clef are drawn in; the phrase loops.
- **Hidden melody** — the note data is *Thinking Out Loud*; lyrics are intentionally omitted so it reads as pure notation.
- **Live UTC clock** and the family chrome (coordinates, operator/contact names) frame the page.

## PWA

- `manifest.webmanifest` declares `display: standalone`, `orientation: any`, and maskable icons.
- `sw.js` precaches the app shell and serves it offline (network‑first for navigations, cache‑first for assets, with runtime caching of Google Fonts).
- iOS: `apple-mobile-web-app-*` tags + a PNG `apple-touch-icon`; Android/Chrome: manifest + service worker satisfy install criteria.
- `viewport-fit=cover`, `100dvh`, and `env(safe-area-inset-*)` padding keep the chrome clear of the notch/Dynamic Island and home indicator in both orientations.

## Run locally

A service worker needs to be served over HTTP(S), not `file://`:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit <http://localhost:8000>. `localhost` is a secure context, so the PWA/service worker works there; in production GitHub Pages serves over HTTPS.

> Note: service workers cache aggressively. After changing assets, bump the `CACHE` name in `sw.js` (currently `messana-v3-1`) or unregister via DevTools → Application.

## Concept archive

`concepts/` holds the ten v3 design explorations (and a gallery at `concepts/index.html`) that led to The Glass Score — including three.js pieces (Resonance Field, Latent Concerto, Spectral Ribbon) and Canvas 2D pieces. Kept as a reference; not linked from the homepage.

## Deployment

Hosted on **GitHub Pages**, branch‑based from `main` at `/`.

- Pushing to `main` triggers a Pages build (~30–60s).
- Custom domain wired via the `CNAME` file at the repo root.
- HTTPS is enforced.

### DNS

The apex `messana.ai` points to GitHub's Pages IPs:

```
A  @  185.199.108.153
A  @  185.199.109.153
A  @  185.199.110.153
A  @  185.199.111.153
```

(Plus matching `AAAA` records for IPv6.)
