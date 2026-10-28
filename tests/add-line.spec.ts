import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { boot, expect, frames, test } from "./fixtures";

const PORT = 4199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let backend: ChildProcess | null = null;
let tempDir = "";
let dataFile = "";

test.describe("shared additions", () => {
  test.beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mycelium-add-"));
    dataFile = path.join(tempDir, "additions.json");
    backend = spawn(process.execPath, ["scripts/serve.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(PORT),
        MYCELIUM_TEST: "1",
        MYCELIUM_DATA_FILE: dataFile
      },
      stdio: "ignore"
    });
    await expect
      .poll(async () => {
        try {
          const response = await fetch(ORIGIN + "/api/health");
          return response.status;
        } catch {
          return 0;
        }
      }, { timeout: 20_000 })
      .toBe(200);
  });

  test.afterAll(async () => {
    if (backend) {
      backend.kill();
      backend = null;
    }
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("a visitor can grow a shared node with a live thread animation", async ({ browser }) => {
    test.skip(test.info().project.name !== "chromium", "the shared backend test runs once on chromium");
    test.setTimeout(120_000);
    const context = await browser.newContext({
      baseURL: ORIGIN,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await boot(page);
    const initial = await page.evaluate(() => (window as any).__MYCELIUM__.lines.length);
    expect(initial).toBe(24);
    await expect(page.locator('[data-testid="add-btn"]')).toBeVisible();

    await page.locator('[data-testid="add-btn"]').click();
    await expect(page.locator('[data-testid="add-dialog"]')).toBeVisible();
    await page.fill('[data-testid="add-en"]', "A small rain enters the roots.");
    await page.fill('[data-testid="add-fa"]', "بارانی کوچک به ریشه‌ها می‌رسد.");
    await page.selectOption('[data-testid="add-theme"]', "roots");
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/lines") && response.request().method() === "POST"
    );
    await page.locator('[data-testid="add-submit"]').click();
    expect((await responsePromise).status()).toBe(201);

    await expect.poll(() => page.evaluate(() => (window as any).__MYCELIUM__.lines.length), { timeout: 10_000 }).toBe(25);
    await expect.poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lockedId), { timeout: 8_000 }).toBeTruthy();
    const grown = await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      return {
        nodes: api.nodes.length,
        added: api.state.addedCount,
        growth: api.state.growth,
        dynamicNodes: api.state.dynamicNodes,
        dynamicEdges: api.state.dynamicEdges,
        locked: api.state.lockedId,
        line: api.lines.find((entry: any) => entry.id === api.state.lockedId),
        hasLineElement: Boolean(document.querySelector(`[data-node-id="${api.state.lockedId}"]`))
      };
    });
    expect(grown.nodes).toBe(25);
    expect(grown.added).toBe(1);
    expect(grown.dynamicNodes).toBe(1);
    expect(grown.dynamicEdges).toBe(3);
    expect(grown.locked).toBeTruthy();
    expect(grown.line.fa).toContain("بارانی");
    expect(grown.hasLineElement).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.growth), { timeout: 6_000 }).toBeGreaterThan(1.2);
    await expect(page.locator('[data-testid="line-primary"]')).toBeVisible();
    await frames(page, 2);

    const otherContext = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
    const other = await otherContext.newPage();
    await boot(other);
    const persisted = await other.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      return {
        lines: api.lines.length,
        added: api.state.addedCount,
        last: api.lines[api.lines.length - 1]
      };
    });
    expect(persisted.lines).toBe(25);
    expect(persisted.added).toBe(1);
    expect(persisted.last.fa).toContain("بارانی");
    await otherContext.close();

    const invalid = await fetch(ORIGIN + "/api/lines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ en: "No Persian here", fa: "No Persian here", themes: ["roots"] })
    });
    expect(invalid.status).toBe(400);
    const duplicate = await fetch(ORIGIN + "/api/lines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        en: "A small rain enters the roots.",
        fa: "بارانی کوچک به ریشه‌ها می‌رسد.",
        themes: ["roots"]
      })
    });
    expect(duplicate.status).toBe(409);
    expect(errors).toEqual([]);
    await context.close();
  });
});
