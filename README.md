# messana.ai

Personal landing page for **messana.ai** — v5. An editorial serif wordmark for the **Messana family** over slowly moving, warped violet silk, with a soft light that follows the pointer. Installable as a PWA on iOS and Android.

Live at <https://messana.ai>.

## Project structure

```
website/
├── index.html             Markup + SEO/structured data + PWA tags
├── css/
│   └── styles.css          Design system, frame + bars, CSS fallback gradient, responsive rules
├── js/
│   └── main.js             UTC clock, the "Silk" WebGL shader, service-worker registration
├── manifest.webmanifest    PWA manifest (standalone, icons, dark theme)
├── sw.js                   Service worker (offline app shell; runtime cache for fonts)
├── icon-180/192/512.png    PWA / home-screen icons
├── favicon.svg
├── concepts/               Design exploration — 10 concept directions + gallery (archive)
└── CNAME                   GitHub Pages custom domain
```

No build step. Vanilla HTML/CSS/JS — no framework, no bundler, no CDN scripts. The backdrop is a single raw WebGL 1 fragment shader. Without WebGL, the canvas stays hidden and a pure‑CSS violet gradient carries the page; the UTC clock keeps ticking regardless.

## The effect

- **Silk**: one full‑screen fragment shader. Two levels of domain‑warped fbm noise make the violet "silk," with a gentle shadow pooled behind the wordmark for legibility. It fades up from ink on first load, renders at a reduced, pixel‑capped resolution (the silk is soft), with dithering to prevent banding and a static SVG film grain on top.
- **Interaction**: a soft light follows the pointer and drifts slowly when idle. A tap or click makes it flare.
- **Typography**: Instrument Serif for the wordmark (`.ai` in italic amethyst) and IBM Plex Mono for the small caps. A hairline frame holds the coordinates, UTC clock, and names.
- **Respectful motion**: with `prefers-reduced-motion` you get a single composed still frame. The loop pauses on hidden tabs.

## PWA

- `manifest.webmanifest` declares `display: standalone`, `orientation: any`, maskable icons, and a dark (`#07030f`) theme.
- `sw.js` precaches the app shell and serves it offline (network‑first for navigations, cache‑first for assets), with runtime caching of Google Fonts.
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

> Note: service workers cache aggressively. After changing assets, bump the `CACHE` name in `sw.js` (currently `messana-v5-3`) or unregister via DevTools → Application.

## Concept archive

`concepts/` holds the ten v3 design explorations (and a gallery at `concepts/index.html`) — including three.js pieces (Resonance Field, Latent Concerto, Spectral Ribbon) and Canvas 2D pieces. v4 "Signal" (a three.js neural constellation, in git history) grew out of these. Kept as a reference; not linked from the homepage.

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
