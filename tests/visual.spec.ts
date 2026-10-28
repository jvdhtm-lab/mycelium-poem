import { boot, expect, frames, test } from "./fixtures";

test.describe("visual", () => {
  test.skip(!!process.env.CI, "Pixel baselines are generated per OS and project; see QA.md");
  test.slow();

  test("idle, locked, camera depths and after fly-to", async ({ page }) => {
    await boot(page, "?test=1&seed=42&quality=high");
    await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      api.setLang("both");
      api.freeze(8);
    });
    await frames(page, 3);
    await expect(page).toHaveScreenshot("idle.png", { fullPage: true, maxDiffPixelRatio: 0.02 });

    await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      api.setCamera({ radius: 35, theta: 0, phi: 1.47, target: [0, 0, 0] });
      api.lock("n16");
      api.freeze(8);
    });
    await frames(page, 3);
    await expect(page).toHaveScreenshot("locked.png", { fullPage: true, maxDiffPixelRatio: 0.02 });

    for (const [name, radius] of [
      ["view-far", 46],
      ["view-mid", 26],
      ["view-inside", 7]
    ] as const) {
      await page.evaluate((r: number) => {
        const api = (window as any).__MYCELIUM__;
        api.unlock();
        api.setCamera({ radius: r, theta: 0.7, phi: 1.32, target: [0, 0, 0] });
        api.freeze(8);
      }, radius);
      await frames(page, 3);
      await expect(page).toHaveScreenshot(name + ".png", { fullPage: true, maxDiffPixelRatio: 0.02 });
    }

    await page.evaluate(async () => {
      const api = (window as any).__MYCELIUM__;
      api.unfreeze();
      api.unlock();
      await api.flyTo("n12");
      api.freeze(8);
    });
    await frames(page, 3);
    await expect(page).toHaveScreenshot("after-flyto.png", { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
});
