import {
  boot,
  chooseIsolatedNode,
  expect,
  getCamera,
  getLines,
  getState,
  seeded,
  test
} from "./fixtures";

function cameraRadius(camera: any): number {
  return Math.hypot(
    camera.position[0] - camera.target[0],
    camera.position[1] - camera.target[1],
    camera.position[2] - camera.target[2]
  );
}

test.describe("navigation", () => {
  test("dragging changes the camera and wheel zoom stays inside the limits", async ({ page }) => {
    await boot(page);
    const viewport = page.viewportSize()!;
    const cx = Math.round(viewport.width / 2);
    const cy = Math.round(viewport.height / 2);
    const before = await getCamera(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 140, cy + 60, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => JSON.stringify((await getCamera(page)).position), { timeout: 4_000 })
      .not.toBe(JSON.stringify(before.position));
    expect((await getState(page)).navMode).toBe("orbit");

    const startRadius = cameraRadius(await getCamera(page));
    await page.mouse.wheel(0, -850);
    await expect.poll(async () => cameraRadius(await getCamera(page)), { timeout: 4_000 }).toBeLessThan(startRadius);
    const limits = (await getState(page)).limits;
    const near = cameraRadius(await getCamera(page));
    expect(near).toBeGreaterThanOrEqual(limits.minRadius - 0.2);
    expect(near).toBeLessThanOrEqual(limits.maxRadius + 0.2);

    await page.mouse.wheel(0, 12000);
    await expect
      .poll(async () => {
        const state = await getState(page);
        const radius = cameraRadius(await getCamera(page));
        return radius <= state.limits.maxRadius + 0.2;
      }, { timeout: 4_000 })
      .toBe(true);
    expect(cameraRadius(await getCamera(page))).toBeLessThanOrEqual(limits.maxRadius + 0.2);
  });

  test("pinching changes distance and remains inside the limits", async ({ page }) => {
    await boot(page);
    const before = cameraRadius(await getCamera(page));
    await page.evaluate(() => {
      const canvas = document.getElementById("gl")!;
      const make = (type: string, x: number, y: number, id: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: id,
          pointerType: "touch",
          isPrimary: id === 1,
          buttons: type === "pointerup" ? 0 : 1
        });
      canvas.dispatchEvent(make("pointerdown", 600, 400, 1));
      canvas.dispatchEvent(make("pointerdown", 680, 400, 2));
      window.dispatchEvent(make("pointermove", 500, 400, 1));
      window.dispatchEvent(make("pointermove", 780, 400, 2));
      window.dispatchEvent(make("pointerup", 500, 400, 1));
      window.dispatchEvent(make("pointerup", 780, 400, 2));
    });
    await expect.poll(async () => cameraRadius(await getCamera(page)), { timeout: 4_000 }).not.toBeCloseTo(before, 1);
    const state = await getState(page);
    const radius = cameraRadius(await getCamera(page));
    expect(radius).toBeGreaterThanOrEqual(state.limits.minRadius - 0.2);
    expect(radius).toBeLessThanOrEqual(state.limits.maxRadius + 0.2);
    expect(state.navMode).toBe("orbit");
  });

  test("clicking a node flies to a reading distance and locks its line", async ({ page }) => {
    await boot(page);
    const chosen = await chooseIsolatedNode(page);
    await page.mouse.move(chosen.screenX, chosen.screenY);
    await page.mouse.click(chosen.screenX, chosen.screenY);
    await expect.poll(async () => (await getState(page)).navMode, { timeout: 3_000 }).toBe("flyto");
    await expect
      .poll(async () => {
        const api = await page.evaluate(() => (window as any).__MYCELIUM__.nodes);
        return api.find((node: any) => node.id === chosen.id).depth;
      }, { timeout: 12_000 })
      .toBeLessThanOrEqual(3.5);
    const state = await getState(page);
    expect(state.lockedId).toBe(chosen.id);
    const primary = page.locator('[data-testid="line-primary"]');
    await expect(primary).toBeVisible();
    const style = await primary.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { opacity: computed.opacity, transform: computed.transform, visibility: computed.visibility };
    });
    expect(style.visibility).toBe("visible");
    expect(Number(style.opacity)).toBeCloseTo(1, 2);
    expect(style.transform.startsWith("matrix(")).toBe(true);
    const values = style.transform.slice(7, -1).split(",").map(Number);
    expect(Math.abs(values[1])).toBeLessThan(0.001);
    expect(Math.abs(values[2])).toBeLessThan(0.001);
  });

  test("the flyTo promise resolves at a safe viewpoint from ten seeded starts", async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page);
    const lines = await getLines(page);
    const viewport = page.viewportSize()!;
    const cx = Math.round(viewport.width / 2);
    const cy = Math.round(viewport.height / 2);
    const random = seeded(42);
    for (let i = 0; i < 10; i++) {
      const dx = (random() * 2 - 1) * 140;
      const dy = (random() * 2 - 1) * 100;
      const startX = Math.max(20, Math.min(viewport.width - 20, cx + dx));
      const startY = Math.max(120, Math.min(viewport.height - 160, cy + dy));
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + (random() * 2 - 1) * 90, startY + (random() * 2 - 1) * 70, { steps: 5 });
      await page.mouse.up();
      await page.mouse.wheel(0, (random() * 2 - 1) * 700);
      const target = lines[(i * 7 + 3) % lines.length].id;
      const result = await page.evaluate((id: string) => (window as any).__MYCELIUM__.flyTo(id), target);
      expect(result, "flight " + i).toBe(true);
      const check = await page.evaluate(() => {
        const api = (window as any).__MYCELIUM__;
        const state = api.state;
        const camera = api.camera;
        const targetNode = api.nodes.find((node: any) => node.id === state.lockedId);
        return {
          lockedId: state.lockedId,
          navMode: state.navMode,
          up: camera.up,
          depth: targetNode ? targetNode.depth : 999,
          minThread: api.minThreadDistance(),
          minNode: api.minNodeDistance()
        };
      });
      expect(check.lockedId).toBe(target);
      expect(check.navMode).toBe("flyto");
      expect(check.depth).toBeGreaterThanOrEqual(2);
      expect(check.depth).toBeLessThanOrEqual(3.5);
      expect(check.up).toEqual([0, 1, 0]);
      expect(check.minThread, "camera not inside a thread").toBeGreaterThan(0.05);
      expect(check.minNode, "camera not inside a node").toBeGreaterThan(0.45);
    }
  });

  test("idle drift travels the network and yields to mouse or keyboard input", async ({ page }) => {
    await boot(page, "?test=1&seed=42&wander=1");
    await expect.poll(async () => (await getState(page)).navMode, { timeout: 6_000 }).toBe("drift");
    const first = (await getState(page)).hoveredId;
    expect(first).toBeTruthy();
    await expect
      .poll(async () => (await getState(page)).hoveredId, { timeout: 7_000 })
      .not.toBe(first);

    const state = await getState(page);
    expect(state.lockedId).toBeNull();
    const empty = await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      const nodes = api.nodes;
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (let y = 130; y < h - 170; y += 40) {
        for (let x = 80; x < w - 80; x += 40) {
          const overUI = document.elementFromPoint(x, y)?.closest("#controls, #brand, #hint, #fallback-list, #toast");
          if (overUI) continue;
          let clear = true;
          for (const node of nodes) {
            if (!node.visible) continue;
            if (Math.hypot(node.screenX - x, node.screenY - y) < 90) { clear = false; break; }
          }
          if (clear) return { x, y };
        }
      }
      return { x: 20, y: 140 };
    });
    await page.mouse.move(empty.x, empty.y);
    await expect.poll(async () => (await getState(page)).navMode, { timeout: 1_500 }).toBe("orbit");

    await expect.poll(async () => (await getState(page)).navMode, { timeout: 6_000 }).toBe("drift");
    await page.keyboard.press("ArrowLeft");
    expect(await page.evaluate(() => (window as any).__MYCELIUM__.state.navMode)).toBe("orbit");
  });
});
