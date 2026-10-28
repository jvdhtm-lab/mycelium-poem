import fs from "node:fs";
import { boot, expect, getCamera, getState, median, test } from "./fixtures";

const isChromium = () => test.info().project.name === "chromium";

test.describe("performance", () => {
  test("median frame rate over five seconds is at least thirty under software rendering", async ({ page }) => {
    test.skip(!isChromium(), "the software-rendering frame rate is measured on desktop chromium");
    test.setTimeout(90_000);
    await boot(page);
    expect((await getState(page)).quality).toBe("low");
    const samples = await page.evaluate(async () => {
      const values: number[] = [];
      const start = performance.now();
      let last = 0;
      await new Promise<void>((resolve) => {
        function step(now: number) {
          if (now - last >= 250) {
            values.push((window as any).__MYCELIUM__.state.fps);
            last = now;
          }
          if (now - start < 5_000) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
      return values;
    });
    expect(samples.length).toBeGreaterThanOrEqual(10);
    const measured = median(samples);
    expect(measured, "median of state.fps samples: " + samples.join(", ")).toBeGreaterThanOrEqual(30);
  });

  test("pixel ratio is capped at two", async ({ browser }) => {
    test.skip(!isChromium(), "device scale factor launch is checked on chromium");
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?test=1&seed=42&quality=high");
    await page.waitForFunction(() => (window as any).__MYCELIUM__?.readyDone === true, undefined, { timeout: 30_000 });
    const state = await page.evaluate(() => (window as any).__MYCELIUM__.state);
    expect(state.pixelRatio).toBeLessThanOrEqual(2);
    expect(state.pixelRatio).toBeCloseTo(2, 5);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("quality=low disables depth of field and mist and halves spores", async ({ page }) => {
    test.skip(!isChromium(), "forced quality tiers are verified on chromium");
    await boot(page, "?test=1&seed=42&quality=low");
    const state = await getState(page);
    expect(state.quality).toBe("low");
    expect(state.effects.dof).toBe(false);
    expect(state.effects.mist).toBe(false);
    expect(state.effects.spores).toBe(0.5);
  });

  test("quality tiers can be selected explicitly", async ({ page }) => {
    test.skip(!isChromium(), "forced quality tiers are verified on chromium");
    for (const tier of ["medium", "high"] as const) {
      await boot(page, "?test=1&seed=42&quality=" + tier);
      const state = await getState(page);
      expect(state.quality).toBe(tier);
      expect(state.effects.dof).toBe(true);
      expect(state.effects.mist).toBe(true);
    }
  });

  test("memory does not grow more than thirty percent during twenty seconds of interaction", async ({ page }) => {
    test.skip(!isChromium(), "performance.memory is only available in Chromium");
    test.setTimeout(120_000);
    await boot(page);
    const available = await page.evaluate(() => Boolean((performance as any).memory));
    test.skip(!available, "performance.memory is unavailable in this Chromium build");
    const result = await page.evaluate(async () => {
      const api = (window as any).__MYCELIUM__;
      const ids = api.lines.map((line: any) => line.id);
      if ((window as any).gc) (window as any).gc();
      const start = (performance as any).memory.usedJSHeapSize;
      const started = performance.now();
      let frame = 0;
      const canvas = document.getElementById("gl")!;
      const pointer = (type: string, x: number, y: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 7,
          pointerType: "mouse",
          isPrimary: true,
          buttons: type === "pointerup" ? 0 : 1
        });
      await new Promise<void>((resolve) => {
        function step() {
          frame++;
          if (frame % 14 === 0) api.hover(ids[(frame / 14) % ids.length | 0]);
          if (frame % 14 === 7) api.hover(null);
          if (frame % 20 === 0) {
            canvas.dispatchEvent(pointer("pointerdown", 600, 400));
            window.dispatchEvent(pointer("pointermove", 600 + (frame % 120), 400 + (frame % 60)));
            window.dispatchEvent(pointer("pointerup", 600 + (frame % 120), 400 + (frame % 60)));
          }
          if (performance.now() - started < 20_000) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
      api.hover(null);
      if ((window as any).gc) (window as any).gc();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const end = (performance as any).memory.usedJSHeapSize;
      return { start, end };
    });
    expect(result.end).toBeLessThan(result.start * 1.3);
  });

  test("the built file is under two megabytes", async () => {
    const stat = fs.statSync("index.html");
    expect(stat.size).toBeLessThan(2 * 1024 * 1024);
  });
});
