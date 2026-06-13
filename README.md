# messana.ai

Personal landing page for **messana.ai** — a cinematic, Matrix-themed single page. v2.0 rebuilds the digital rain in 3D with [three.js](https://threejs.org/): you stand *inside* a volumetric downpour of katakana glyphs with depth-of-field, fog, a gently drifting camera, and bloom, while the `messana.ai` wordmark holds calm and centered.

Live at <https://messana.ai>.

## Project structure

```
website/
├── index.html      Markup + SEO/structured data
├── css/
│   └── styles.css  Presentation, chrome overlay, responsive rules
├── js/
│   └── main.js     three.js volumetric rain, UTC clock, build hash
└── CNAME           GitHub Pages custom domain
```

No build step. `index.html`, `css/styles.css`, and `js/main.js` are served as-is; three.js is loaded at runtime from the unpkg CDN via an ES-module import map (`three@0.160.0`).

## Run locally

ES modules need to be served over HTTP (not opened via `file://`):

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit <http://localhost:8000>. A network connection is required so the browser can fetch three.js from the CDN.

## The effect

- **Volumetric rain** — many glyph streams (`InstancedMesh` + a glyph-atlas texture and a small custom shader) fall through 3D space at varying depths; near streams are large and white-hot at the leading glyph, far ones small, green, and lost in fog.
- **Cinematic post** — `EffectComposer` + `UnrealBloomPass` for the glow; `FogExp2` for depth falloff; a slow orbit/breathing-dolly camera.
- **Readable wordmark** — a clear vertical corridor is kept down the foreground center (`computeClearX`) so falling glyphs never drown the centered `messana.ai`.

## Browser & device support

Modern evergreen browsers with WebGL. Uses `100dvh`, CSS `clamp()`, and an ES-module import map.

- **Mobile / iPhone** — `viewport-fit=cover` plus `env(safe-area-inset-*)` keeps the terminal chrome clear of the notch/Dynamic Island and home indicator; the camera FOV widens on portrait aspect ratios so the rain still frames well on tall screens; `devicePixelRatio` is capped at 2 for performance.
- **Reduced motion** — `prefers-reduced-motion` renders a single calm static frame instead of the animation loop.
- The render loop pauses while the tab is hidden.

## Deployment

Hosted on **GitHub Pages**, branch-based from `main` at `/`.

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
