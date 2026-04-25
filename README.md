# messana.ai

Placeholder site for **messana.ai** — a Matrix-themed single page with a canvas-rendered digital rain effect, refined typography, and a centered wordmark.

Live at <https://messana.ai>.

## Project structure

```
website/
├── index.html      Markup
├── css/
│   └── styles.css  Presentation, animations, responsive rules
├── js/
│   └── main.js     Digital rain canvas, UTC clock, build hash
└── CNAME           GitHub Pages custom domain
```

No build step, no dependencies — three static files served as-is.

## Run locally

Open `index.html` directly in a browser, or serve the directory if you want clean URLs:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit <http://localhost:8000>.

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

## Browser support

Modern evergreen browsers. The site uses `100dvh`, CSS `clamp()`, `mask-image`, and Canvas 2D. A `prefers-reduced-motion` fallback dims the rain and disables glitch/grain animations.
