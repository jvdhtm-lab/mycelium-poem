import {
  boot,
  chooseIsolatedNode,
  edgesOf,
  emptyPoint,
  expect,
  frames,
  test
} from "./fixtures";

test.describe("interaction", () => {
  test("hovering a node shows its line and related echoes inside the viewport", async ({ page }) => {
    await boot(page);
    const chosen = await chooseIsolatedNode(page);
    expect(chosen, "a visible isolated node exists").toBeTruthy();

    await page.mouse.move(chosen.screenX, chosen.screenY);
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.hoveredId), { timeout: 5_000 })
      .toBe(chosen.id);

    const primary = page.locator('[data-testid="line-primary"]');
    await expect(primary).toBeVisible();
    const primaryText = await primary.innerText();
    const line = await page.evaluate((id: string) => (window as any).__MYCELIUM__.lines.find((l: any) => l.id === id), chosen.id);
    expect(primaryText).toContain(line.en);
    expect(primaryText).toContain(line.fa);

    const neighbours = await edgesOf(page, chosen.id);
    const expectedEchoes = Math.min(4, neighbours.length);
    await expect
      .poll(() => page.locator('[data-testid="line-echo"]').count(), { timeout: 10_000 })
      .toBe(expectedEchoes);
    await frames(page, 2);

    const echoIds: string[] = await page
      .locator('[data-testid="line-echo"]')
      .evaluateAll((elements) => elements.map((el) => (el as HTMLElement).dataset.nodeId || ""));
    expect(new Set(echoIds).size).toBe(echoIds.length);
    for (const id of echoIds) expect(neighbours, id + " is a neighbour").toContain(id);

    const boxes = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid="line-primary"], [data-testid="line-echo"]')
      ) as HTMLElement[];
      return nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.dataset.nodeId,
          primary: node.dataset.testid === "line-primary",
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom
        };
      });
    });
    const viewport = page.viewportSize()!;
    for (const box of boxes) {
      expect(box.left, box.id + " inside left edge").toBeGreaterThanOrEqual(-0.5);
      expect(box.top, box.id + " inside top edge").toBeGreaterThanOrEqual(-0.5);
      expect(box.right, box.id + " inside right edge").toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.bottom, box.id + " inside bottom edge").toBeLessThanOrEqual(viewport.height + 0.5);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const intersects =
          a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        expect(intersects, `lines ${a.id} and ${b.id} do not overlap`).toBe(false);
      }
    }
  });

  test("clicking locks a node and clicking empty space unlocks it", async ({ page }) => {
    await boot(page);
    const chosen = await chooseIsolatedNode(page);
    await page.mouse.move(chosen.screenX, chosen.screenY);
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.hoveredId), { timeout: 5_000 })
      .toBe(chosen.id);

    await page.mouse.click(chosen.screenX, chosen.screenY);
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lockedId), { timeout: 5_000 })
      .toBe(chosen.id);
    await expect
      .poll(() => page.evaluate((id: string) => {
        const api = (window as any).__MYCELIUM__;
        const node = api.nodes.find((n: any) => n.id === id);
        return node ? node.depth : 999;
      }, chosen.id), { timeout: 7_000 })
      .toBeLessThanOrEqual(3.6);

    const empty = await emptyPoint(page);
    await page.mouse.move(empty.x, empty.y);
    await frames(page, 3);
    expect(await page.evaluate(() => (window as any).__MYCELIUM__.state.lockedId)).toBe(chosen.id);
    await expect(page.locator('[data-testid="line-primary"]')).toBeVisible();

    await page.mouse.click(empty.x, empty.y);
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lockedId), { timeout: 5_000 })
      .toBeNull();
  });

  test("tap locks a node on touch devices", async ({ page }) => {
    test.skip(!test.info().project.use.isMobile, "touch project only");
    await boot(page);
    const chosen = await chooseIsolatedNode(page);
    await page.touchscreen.tap(chosen.screenX, chosen.screenY);
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lockedId), { timeout: 5_000 })
      .toBe(chosen.id);
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.navMode), { timeout: 3_000 })
      .toBe("flyto");
  });
});
