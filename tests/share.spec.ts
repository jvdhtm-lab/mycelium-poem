import fs from "node:fs";
import path from "node:path";
import { boot, expect, frames, test } from "./fixtures";

const GOLDEN = path.join(__dirname, "fixtures", "share-card-golden.json");

test.describe("share and hide", () => {
  test("the share card is drawn after fonts are ready and contains the locked line", async ({ page }) => {
    await boot(page);
    const line = await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      api.lock("n05");
      api.freeze(7);
      return api.lines.find((l: any) => l.id === "n05");
    });
    await frames(page, 2);
    const card = await page.evaluate(() => (window as any).__MYCELIUM__.shareCard());
    expect(card.width).toBe(1200);
    expect(card.height).toBe(630);
    expect(card.fontsReady).toBe(true);
    expect(card.lines.en).toBe(line.en);
    expect(card.lines.fa).toBe(line.fa);
    expect(card.dataURL).toMatch(/^data:image\/png;base64,/);
    expect(await page.evaluate(() => document.fonts.check('16px "Vazirmatn"'))).toBe(true);

    const imageStats = await page.evaluate(async (url: string) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 18;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 32, 18);
      const data = ctx.getImageData(0, 0, 32, 18).data;
      const grid: number[] = [];
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        grid.push(data[i], data[i + 1], data[i + 2]);
        total += data[i] + data[i + 1] + data[i + 2];
      }
      return { grid, mean: total / (data.length / 4), width: image.width, height: image.height };
    }, card.dataURL);
    expect(imageStats.width).toBe(1200);
    expect(imageStats.height).toBe(630);
    expect(imageStats.mean).toBeGreaterThan(8);

    expect(fs.existsSync(GOLDEN), "share-card golden fingerprint exists").toBe(true);
    const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
    expect(golden.grid.length).toBe(imageStats.grid.length);
    let delta = 0;
    for (let i = 0; i < golden.grid.length; i++) delta += Math.abs(golden.grid[i] - imageStats.grid[i]);
    delta /= golden.grid.length;
    expect(delta, "coarse share-card golden difference").toBeLessThan(24);
  });

  test("the share button downloads a PNG", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => (window as any).__MYCELIUM__.lock("n05"));
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.locator('[data-testid="share-btn"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const stat = fs.statSync(filePath!);
    expect(stat.size).toBeGreaterThan(10_000);
  });

  test("hide-ui hides every testid and the H key restores it", async ({ page }) => {
    await boot(page);
    await page.locator('[data-testid="hide-ui"]').click();
    await expect.poll(() => page.evaluate(() => document.body.classList.contains("ui-hidden"))).toBe(true);
    const hidden = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("[data-testid]"));
      return {
        count: elements.length,
        allHidden: elements.every((element) => getComputedStyle(element).display === "none")
      };
    });
    expect(hidden.count).toBeGreaterThan(0);
    expect(hidden.allHidden).toBe(true);
    await page.keyboard.press("h");
    await expect.poll(() => page.evaluate(() => document.body.classList.contains("ui-hidden"))).toBe(false);
    expect(
      await page.locator('[data-testid="lang-toggle"]').evaluate((element) => getComputedStyle(element).display)
    ).not.toBe("none");
  });
});
