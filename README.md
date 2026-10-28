# Mycelium Poem · شعرِ میسلیوم

A bilingual (English / Persian), single-file WebGL poem. A glowing mycelial network grows in the dark. Every node is a line of poetry. Hover or tap a node to send light along the real thread curves, then click to fly down the network and read.

## Run it

```bash
npm install
npm run build
npm start
# http://127.0.0.1:4173/
```

`index.html` is committed and self-contained. `npm start` now runs the shared API **and** serves the piece, so visitors can add lines to the network. The runtime requests are the pinned Three.js 0.160.0 module from cdnjs, Google Fonts, and the same-origin `/api` endpoints. Opening the static file directly still shows the poem; the add control stays hidden without a backend.

## Grow the shared network

Start the backend on any host with a persistent disk:

```bash
npm start          # http://127.0.0.1:4173
# or
npm run build
docker build -t mycelium-poem .
docker run -p 4173:4173 -v mycelium-data:/data mycelium-poem
```

The **add / افزودن** button opens a bilingual composer. A new line is saved through `POST /api/lines`, inserted into the shared graph, and grows in with new threads from its nearest neighbours; other open pages receive it on the next poll (eight seconds). Lines live in `data/additions.json` (or `MYCELIUM_DATA_FILE`).

- `GET /api/lines` — all shared additions.
- `GET /api/health` — count, capacity, version.
- `POST /api/lines` — `{ en, fa, themes }`; validated, rate-limited and deduplicated.
- `DELETE /api/lines/:id` — admin only, requires `ADMIN_TOKEN`.
- Capacity defaults to 300 lines and five submissions per IP per ten minutes (`MAX_ADDITIONS`, `RATE_LIMIT`).

For a temporary public link while your machine is running:

```bash
cloudflared tunnel --url http://127.0.0.1:4173
# or, when Cloudflare is not reachable:
npx tunnelmole 4173
```

Use a permanent host with a mounted volume for a durable public network. The GitHub Pages/static build intentionally has no API; the composer hides itself there. See [QA.md](QA.md) for moderation and security notes.

## Edit the poem

Open `src/app.js` and edit `POEM.nodes` (search for `REPLACE WITH REAL LINES`). Every node has:

```js
{ id: "n01", en: "...", fa: "...", themes: ["roots"], weight: 3 }
```

- `themes` can contain `roots`, `light`, `decay`, `memory`, `silence`, `return`.
- `weight` is 1–3 and controls glow, point size and light pools.
- Edges are derived automatically from shared themes plus nearby nodes. Add deliberate cross-links with `POEM.links: [["n01", "n12"]]`.
- Persian is shaped by the browser in real HTML, with `lang="fa"`, `dir="rtl"` and Vazirmatn. Preserve ZWNJ (`‌`) characters.

Run `npm run build` after editing; run `npm test` to verify.

## Tune the scene

`CONFIG` at the top of `src/app.js` controls:

- layout spread and force-layout iterations
- camera radius, field of view, fly-to distance and orbit limits
- fog colour and density
- bloom and depth-of-field strength
- intro duration and reduced-motion duration
- text fade distance
- spore counts and quality tiers

## Quality tiers

- **high** — full bloom, depth of field, mist, full spore field, full text detail.
- **medium** — 82% internal render scale, lighter spore field.
- **low** — no depth of field or mist, half spores, lighter text, software-safe render path.
- `?quality=low|medium|high` forces a tier.
- Software WebGL (SwiftShader/llvmpipe) is detected automatically and uses the low tier with a direct render path so it stays interactive. Real GPUs keep high quality and the full composer.

## Test flags

- `?test=1&seed=42` — deterministic layout/animation, no idle orbit/drift, 0.5 s intro, exposes `window.__MYCELIUM__`.
- `?wander=1` (with `test=1`) — 1 s idle threshold for drift.
- `?reducedmotion=1` — forces the reduced-motion path.
- `?quality=low|medium|high` — forces a quality tier.

## Tests

```bash
npx playwright test                 # one command, all five projects
npm test                            # rebuild + same
npm run test:ui                     # Playwright UI
npm run test:update-snapshots       # regenerate pixel baselines (local)
npm run lint                        # static constraints
npm run check                       # lint + full suite
```

Projects: `chromium`, `firefox`, `webkit` (1280×800) and mobile emulation `iphone-13` (390×844) and `pixel-7` (412×915), both touch/high-DPR. GitHub CI runs Chromium, WebKit, iPhone 13 and Pixel 7; Firefox is local-only because the GitHub Linux headless Firefox build has no WebGL context. Visual snapshots are baseline-compared locally and intentionally skipped in CI; see [QA.md](QA.md).

## Structure

```
index.html                 self-contained deliverable (generated)
src/shell.html             markup, UI and additions marker
src/styles.css             visual design
src/app.js                 poem data, layout, shaders, navigation, shared growth, tests hook
build.mjs                  inlines src/ into index.html
tests/                     Playwright suites + baselines
scripts/serve.mjs          static host + shared-lines API
tests/add-line.spec.ts     isolated shared-backend growth test
Dockerfile                 persistent backend deployment
scripts/static-check.mjs   local constraint lint
QA.md                      manual checklist, limitations, coverage matrix
```
