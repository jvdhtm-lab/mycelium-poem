# QA — Mycelium Poem

The automated suite is the first gate. This document records the checks that cannot be trusted to a headless browser, the known limits of the test environment, and the split between automation and manual verification.

## 1. Manual checklist

### Persian on real browsers and devices

- [ ] **iPhone Safari (iOS 17 and 18), portrait and landscape.** Open the page. Switch to فارسی. Confirm every line is joined (no disconnected letters), right-to-left, and that ZWNJ words such as «روشنایی‌اش», «می‌روید» and «همه‌مان» render without a gap or a break in joining.
- [ ] **Android Chrome (a mid-range device).** Repeat the Persian check in فارسی and both modes.
- [ ] Confirm Persian punctuation sits on the correct side: `،` `؛` `؟` `«»` and the colon in «گوش کن:». Check mixed-direction cases: an English sentence followed by a Persian one, and the UI buttons that contain both languages.
- [ ] Rotate the phone while a Persian line is locked. The line must stay upright, joined, crisp, and inside the safe area (not under the notch or home indicator).
- [ ] Confirm the line is never rotated or skewed: it stays a billboard and only scales/translates.

### Depth, glow and motion

- [ ] On a real-GPU phone and a desktop GPU, confirm foreground threads are larger and brighter, distant threads fade into the blue-green fog, and the focused line is sharp while distant strands soften (depth of field).
- [ ] Check the depth-of-field focus follows fly-to and locked nodes. Turn `?quality=low` on and off to confirm the CONFIG/quality path changes the effect.
- [ ] Verify the mist and three spore depths create parallax when orbiting slowly.
- [ ] **Real-GPU frame rate:** on a mid-range Android phone and an iPhone, measure with Safari/Chrome performance tools or a 10-second recording. Target 60 fps in high/medium; low should stay smooth on software renderers.
- [ ] Confirm the 6-second growth intro reads from the root outward. Reload with `?reducedmotion=1`; the intro should be short and the camera still.
- [ ] **Motion comfort:** orbit, fly to 10 different nodes, then trigger drift. Confirm there are no sudden loops, no upside-down camera, no clipping through nodes, and no nausea-inducing spins. Stop immediately with any input.
- [ ] Check the idle auto-orbit appears only after 8 seconds without input and does not fight a locked line.

### Touch, tilt and sound

- [ ] On iOS, open the tilt button. Confirm the permission prompt appears on the user gesture, and that subtle gyroscope parallax starts only after permission. On Android, confirm tilt works without a prompt. The button must be absent where `DeviceOrientationEvent` is unsupported.
- [ ] Tap a node: lock, fly, and keep the line visible after lifting the finger. Tap empty space: unlock.
- [ ] Pinch to zoom and drag to orbit on both phones; confirm the camera stays inside the distance limits.
- [ ] Sound is silent on first load. Tap sound once: a quiet drone and soft chimes on pulse arrivals. Tap again: silence. Switch tabs for 30 seconds and return: audio resumes only if it was on, and never starts on its own. Check headphones and the phone's silent switch.

### Reading, share and recording

- [ ] Open the poem index by button and by keyboard. Tab through it; the panel appears on focus. Enter flies to the line.
- [ ] VoiceOver (iOS) and TalkBack (Android) pass: the canvas is announced, the toggle/controls have names, the complete poem is readable in the fallback/index list, and the active line updates the live region.
- [ ] Keyboard-only desktop pass: Tab reaches every control with a visible focus ring; arrow keys orbit; `+`/`-` zoom; `H` hides/restores the interface; Escape unlocks or closes the index.
- [ ] Share a thread while a node is locked. The PNG must contain the scene, the English and Persian lines, the title, and correctly joined Persian. Check it on a phone and on desktop.
- [ ] Record a clean 10-second webm with the UI hidden, and record a full fly-through. Check that text is legible in the recording and audio is not required.
- [ ] Hide the UI with `H` and with a long press. Confirm every `data-testid` element disappears and returns.
- [ ] Check the page with a network throttled after load; fonts and the Three.js module are the only external dependencies.

### Fallback and resilience

- [ ] Disable WebGL in a desktop browser. Confirm the full bilingual poem appears as a readable list and the rest of the UI is hidden.
- [ ] Confirm the page still works after a tab is hidden for several minutes, after resizing, and after orientation changes.

## 2. Known limitations found while testing

1. **Headless WebKit has no Web Audio API.** `window.AudioContext`, `webkitAudioContext`, `MediaRecorder`, and `canvas.captureStream` are all undefined in Playwright's WebKit. The sound test is skipped there with a clear message; the page hides the sound button when audio is unsupported. Real Safari audio is a manual check.
2. **Software WebGL is much slower than a GPU.** Chromium CI uses SwiftShader. The app detects SwiftShader/llvmpipe and switches to the low tier with a direct render path (no composer, no mist/DOF, reduced decoration, lighter text), which keeps the automated median at or above 30 fps. This is a deliberate quality trade-off, not the visual experience on real GPUs.
3. **Software mode intentionally looks different.** Low/software mode uses exposure-boosted direct rendering and local halo glow instead of the full bloom/DOF composer. Visual baselines for high quality are generated with `?quality=high`.
4. **Pixel baselines are OS- and engine-specific.** Baselines are committed for Windows Chromium/Firefox/WebKit and the two mobile emulations. CI skips pixel comparisons (`process.env.CI`) because the Linux runner uses different text rasterisation and GPU raster paths. Run `npm run test:update-snapshots` on the target OS to refresh them.
5. **iPhone emulation uses Chromium.** The `iphone-13` project reproduces a 390×844 viewport, touch, DPR and user agent in Chromium so visual/perf baselines stay reproducible; desktop WebKit covers the Safari engine. Real iPhone Safari remains a manual check (especially shaping, dynamic browser chrome and safe areas).
6. **Pinch is tested with synthetic pointer events.** Real multi-touch hardware behaviour (pointer capture, palm rejection) is a manual check.
7. **Firefox has no WebGL on GitHub's headless Linux runner.** The same Firefox build creates a context on a Windows GPU host and passes the full local suite. CI therefore omits the Firefox project (with this written reason) while keeping WebKit and SwiftShader Chromium; the fallback list is also covered by the Chromium WebGL-disable test.
8. **Gyroscope/tilt cannot be automated headlessly.** Permission prompts, sensor availability and iOS gestures are manual.
9. **Real-GPU 60 fps is not asserted in CI.** CI only has software rendering. The 60 fps desktop/mid-range-phone target is a manual measurement.
10. **External dependencies.** The page needs the pinned cdnjs Three.js module and Google Fonts at first load. The fallback list covers WebGL failure, not a total CDN failure. Static checks fail if an unpinned or unexpected URL is introduced.
11. **Visual snapshots can be refreshed on one OS only.** The committed baselines use `win32`. A Linux/macOS developer should run the update command before comparing.
12. **No localStorage.** Language/state persistence is intentionally per session. Reloading returns to the default bilingual view.
13. **`prefers-reduced-motion` disables camera drift/orbit and shortens the intro**, but subtle particle twinkle remains because it is decorative and does not move the viewer.

## 3. Automation vs manual

| Area | Automated | Manual only |
| --- | --- | --- |
| Boot, canvas non-blank, no console errors | Chromium, Firefox, WebKit, iPhone 13, Pixel 7 | — |
| Seeded layout determinism | All projects reload + Chromium/Firefox/WebKit coordinate match | Real-device projection quirks |
| WebGL failure fallback list | Chromium with WebGL disabled | Other browsers/OS combinations |
| Data schema, themes, weights, links, orphans | All projects | Editorial quality of the poetry |
| Persian joins, RTL, font, ZWNJ, no per-letter spans | All projects (computed styles + screenshot) | Real iPhone Safari / Android Chrome shaping |
| Hover, echo ordering, viewport/non-overlap boxes | All projects | Subjective calm/feel |
| Lock/unlock, empty-space click | All projects | Real touch palm rejection |
| Tap to lock | iPhone 13, Pixel 7 | Real device touch |
| Drag, wheel, pinch, limits | All projects (pinch synthetic) | Real pinch hardware |
| Fly-to distance, up vector, thread/node clearance | All projects, 10 seeded starts | Nausea/motion comfort |
| Drift and input hand-back | All projects | Idle timing in a real session |
| Text depth hierarchy and fade distance | All projects | Perceptual readability at distance |
| Share PNG, fonts-ready, download | All projects where downloads work | Visual quality of the card by eye |
| Hide UI | All projects | Clean recording on device |
| Axe serious/critical, keyboard path, reduced motion | All projects | VoiceOver/TalkBack |
| Sound default/on gesture | Chromium, Firefox (WebKit skipped: no API) | Drums/chimes mix, tab-switch resume |
| 30 fps software median, 20 s memory stability | Chromium | Real-GPU 60 fps |
| Quality tiers, DPR cap, file size | Chromium / all projects | Device-specific thermal behaviour |
| Visual snapshots for idle/locked/3 depths/fly-to | Local all five projects; skipped in CI | Real-device screenshot review |
| Gyroscope/tilt | — (not automatable) | iOS and Android |

## 4. Reproduce the automated results

```bash
npm ci
npm run build
npx playwright install --with-deps chromium firefox webkit
npx playwright test
```

Local result at the time of writing: **162 passed, 28 skipped, 0 failed** across `chromium`, `firefox`, `webkit`, `iphone-13`, and `pixel-7`. The local skips are intentional: touch on the three desktop projects, the WebGL-disable test outside Chromium, performance/memory on non-Chromium projects, headless-WebKit audio, the cross-engine comparison outside Chromium projects, and pixel comparisons in CI. GitHub CI runs Chromium, WebKit, iPhone 13 and Pixel 7; the Firefox project is local-only because GitHub's headless Linux Firefox cannot create a WebGL context. Update the baselines with:

```bash
npm run test:update-snapshots
```
