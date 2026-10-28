# Mycelium Poem · شعرِ میسلیوم

A bilingual (English / Persian), single-file WebGL poem. A glowing mycelial network grows in the dark. Every node is a line of poetry. Hover or tap a node to send light along the real thread curves, then click to fly down the network and read.

## Run it

```bash
npm install
npm run build
npm start
# http://127.0.0.1:4173/
```

`index.html` is committed and self-contained; opening it directly from disk also works. The only network requests are the pinned Three.js 0.160.0 module from cdnjs and the two Google Fonts.

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
src/shell.html             markup and UI
src/styles.css             visual design
src/app.js                 poem data, layout, shaders, navigation, tests hook
build.mjs                  inlines src/ into index.html
tests/                     Playwright suites + baselines
scripts/serve.mjs          tiny static server
scripts/static-check.mjs   local constraint lint
QA.md                      manual checklist, limitations, coverage matrix
```
