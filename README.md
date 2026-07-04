# messana.ai

Personal landing page for **messana.ai** — v4 "Signal." A quiet, royal‑purple wordmark for the **Messana family** floats over a living neural constellation: glowing nodes joined by "signal" edges that form and dissolve as the graph slowly drifts — a minimal, AI‑themed nod to the family as its own small, connected signal node. Installable as a PWA on iOS and Android.

Live at <https://messana.ai>.

## Project structure

```
website/
├── index.html             Markup + SEO/structured data + PWA tags + three.js import map
├── css/
│   └── styles.css          Aubergine + purple design system, chrome overlay, responsive rules
├── js/
│   └── main.js             UTC clock, the "Signal" WebGL constellation, service-worker registration
├── manifest.webmanifest    PWA manifest (standalone, icons, dark theme)
├── sw.js                   Service worker (offline app shell; runtime cache for fonts + three.js)
├── icon-180/192/512.png    PWA / home-screen icons
├── favicon.svg
├── concepts/               Design exploration — 10 concept directions + gallery (archive)
└── CNAME                   GitHub Pages custom domain
```

No build step. Vanilla HTML/CSS/JS — no framework, no bundler. The homepage backdrop uses **three.js r0.160** (WebGL) loaded through a native ES‑module import map from unpkg. If it can't load — offline first visit, CDN hiccup, no WebGL — the page degrades gracefully to a pure‑CSS violet gradient behind the wordmark, and the UTC clock keeps ticking regardless.

## The effect

- **Signal** — a full‑bleed WebGL constellation sits behind the wordmark: a deep, drifting field of latent "dust" points; a sparser set of brighter **signal nodes**; and **edges** rebuilt every frame from the nodes' live positions, so connections appear as nodes drift near one another and fade as they part. Nodes occasionally "fire," blooming brighter and lighting their local edges — a quiet inference metaphor. Rendered with additive GPU points and a restrained `UnrealBloomPass` for the glow, in linear/sRGB‑correct color.
- **Family framing** — the wordmark reads `messana.ai` above a small `the messana family` subhead; the chrome frames it with live coordinates, a UTC clock, and the operator/contact names.
- **Motion with a reason** — slow camera parallax (nudged by the pointer on desktop) over a gently rewiring graph. Honors `prefers-reduced-motion` with a single composed still frame, and pauses the render loop on hidden tabs.

## PWA

- `manifest.webmanifest` declares `display: standalone`, `orientation: any`, maskable icons, and a dark (`#160726`) theme.
- `sw.js` precaches the app shell and serves it offline (network‑first for navigations, cache‑first for assets), with runtime caching of Google Fonts **and** the unpkg three.js modules — so the WebGL backdrop survives offline on repeat visits (the first load still needs the network).
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

> Note: service workers cache aggressively. After changing assets, bump the `CACHE` name in `sw.js` (currently `messana-v4-1`) or unregister via DevTools → Application.

## Concept archive

`concepts/` holds the ten v3 design explorations (and a gallery at `concepts/index.html`) — including three.js pieces (Resonance Field, Latent Concerto, Spectral Ribbon) and Canvas 2D pieces. "Signal" grew out of these (chiefly Latent Concerto and Neural Orchestra). Kept as a reference; not linked from the homepage.

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
