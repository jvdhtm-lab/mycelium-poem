import fs from "node:fs";
import { boot, expect, frames, test } from "./fixtures";

test.describe("boot", () => {
  test("canvas renders a non-blank scene with the full poem and no console errors", async ({ page }) => {
    await boot(page);
    const info = await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      return {
        nodes: api.nodes.length,
        lines: api.lines.length,
        poemCount: api.poemCount,
        canvas: { w: document.getElementById("gl")!.width, h: document.getElementById("gl")!.height }
      };
    });
    expect(info.nodes).toBe(info.lines);
    expect(info.nodes).toBe(info.poemCount);
    expect(info.nodes).toBeGreaterThanOrEqual(12);
    expect(info.canvas.w).toBeGreaterThan(0);
    expect(info.canvas.h).toBeGreaterThan(0);

    const dataURL = await page.evaluate(() => (window as any).__MYCELIUM__.captureCanvas());
    expect(dataURL).toMatch(/^data:image\/png;base64,/);
    const pixels = await page.evaluate(async (url: string) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let bright = 0;
      const colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (Math.max(r, g, b) > 24) bright++;
        colors.add((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3));
      }
      return { bright, colors: colors.size, total: data.length / 4, width: canvas.width, height: canvas.height };
    }, dataURL);
    expect(pixels.width).toBe(info.canvas.w);
    expect(pixels.bright).toBeGreaterThan(200);
    expect(pixels.colors).toBeGreaterThan(12);
  });

  test("seeded layout is deterministic across reloads within one pixel", async ({ page }) => {
    await boot(page);
    const first = await page.evaluate(() => (window as any).__MYCELIUM__.nodes);
    await boot(page);
    const second = await page.evaluate(() => (window as any).__MYCELIUM__.nodes);
    expect(second.length).toBe(first.length);
    const byId = new Map(second.map((node: any) => [node.id, node]));
    for (const a of first) {
      const b: any = byId.get(a.id);
      expect(b, "node " + a.id + " exists after reload").toBeTruthy();
      expect(Math.abs(a.screenX - b.screenX)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.screenY - b.screenY)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.depth - b.depth)).toBeLessThanOrEqual(0.05);
    }
  });

  test("the same seed gives the same screen positions in Chromium, Firefox and WebKit", async ({
    browserName,
    page,
    playwright
  }) => {
    test.skip(browserName !== "chromium", "the cross-engine comparison runs once, from the chromium project");
    test.setTimeout(240_000);
    await boot(page);
    await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      api.setCamera({ radius: 35, theta: 0, phi: 1.47, target: [0, 0, 0] });
      api.freeze(8);
    });
    await frames(page, 1);
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const chromiumNodes = await page.evaluate(() => (window as any).__MYCELIUM__.nodes);
    const chromiumWorld = await page.evaluate(() => (window as any).__MYCELIUM__.worldNodes);
    await page.close();
    for (const [name, type] of [
      ["firefox", playwright.firefox],
      ["webkit", playwright.webkit]
    ] as const) {
      const browser = await type.launch({ headless: true });
      try {
        const context = await browser.newContext({
          baseURL: "http://127.0.0.1:4173",
          viewport,
          deviceScaleFactor: 1
        });
        const other = await context.newPage();
        await boot(other);
        await other.evaluate(() => {
          const api = (window as any).__MYCELIUM__;
          api.setCamera({ radius: 35, theta: 0, phi: 1.47, target: [0, 0, 0] });
          api.freeze(8);
        });
        await frames(other, 1);
        const otherNodes = await other.evaluate(() => (window as any).__MYCELIUM__.nodes);
        const otherWorld = await other.evaluate(() => (window as any).__MYCELIUM__.worldNodes);
        const worldById = new Map(otherWorld.map((node: any) => [node.id, node]));
        for (const node of chromiumWorld) {
          const match: any = worldById.get(node.id);
          expect(match, name + " has node " + node.id).toBeTruthy();
          expect(Math.abs(node.x - match.x), name + " world x for " + node.id).toBeLessThanOrEqual(0.01);
          expect(Math.abs(node.y - match.y), name + " world y for " + node.id).toBeLessThanOrEqual(0.01);
          expect(Math.abs(node.z - match.z), name + " world z for " + node.id).toBeLessThanOrEqual(0.01);
        }
        const byId = new Map(otherNodes.map((node: any) => [node.id, node]));
        expect(otherNodes.length).toBe(chromiumNodes.length);
        for (const node of chromiumNodes) {
          const match: any = byId.get(node.id);
          expect(match, name + " has node " + node.id).toBeTruthy();
          expect(Math.abs(node.screenX - match.screenX), name + " x for " + node.id).toBeLessThanOrEqual(1);
          expect(Math.abs(node.screenY - match.screenY), name + " y for " + node.id).toBeLessThanOrEqual(1);
        }
        await context.close();
      } finally {
        await browser.close();
      }
    }
  });

  test("WebGL failure shows the complete fallback list in both languages", async ({ browserName, playwright }) => {
    test.skip(browserName !== "chromium", "Chromium is the only project with a WebGL-disable launch flag");
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--disable-webgl", "--disable-webgl2", "--disable-gpu"]
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4173/?test=1&seed=42");
    await page.waitForFunction(() => (window as any).__MYCELIUM__?.readyDone === true, undefined, { timeout: 20_000 });
    await expect(page.locator("body")).toHaveClass(/webgl-failed/);
    const list = page.locator('[data-testid="fallback-list"]');
    await expect(list).toBeVisible();
    const info = await page.evaluate(() => ({
      lines: (window as any).__MYCELIUM__.lines,
      text: document.querySelector('[data-testid="fallback-list"]')?.textContent || ""
    }));
    for (const line of info.lines) {
      expect(info.text).toContain(line.en);
      expect(info.text).toContain(line.fa);
    }
    expect(errors).toEqual([]);
    await browser.close();
  });
});

test("built file stays under two megabytes", async () => {
  const stat = fs.statSync("index.html");
  expect(stat.size).toBeLessThan(2 * 1024 * 1024);
});
