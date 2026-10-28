import { boot, expect, getCamera, frames, test } from "./fixtures";

test.describe("accessibility", () => {
  test("axe finds no serious or critical violations", async ({ page }) => {
    await boot(page);
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const main = await page.evaluate(async () => {
      const result = await (window as any).axe.run(document);
      return result.violations.map((violation: any) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node: any) => node.target)
      }));
    });
    const serious = main.filter((violation: any) => violation.impact === "serious" || violation.impact === "critical");
    expect(serious).toEqual([]);

    await page.locator('[data-testid="index-btn"]').click();
    const fallback = await page.evaluate(async () => {
      const result = await (window as any).axe.run(document.getElementById("fallback-list"));
      return result.violations.map((violation: any) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node: any) => node.target)
      }));
    });
    const fallbackSerious = fallback.filter(
      (violation: any) => violation.impact === "serious" || violation.impact === "critical"
    );
    expect(fallbackSerious).toEqual([]);
  });

  test("the full keyboard path reaches every control with visible focus", async ({ page }) => {
    await boot(page);
    const seen = new Map<string, any>();
    const audioSupported = await page.evaluate(() => Boolean(window.AudioContext || (window as any).webkitAudioContext));
    let canvasFocusVisible = false;
    for (let i = 0; i < 55; i++) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return null;
        const computed = getComputedStyle(active);
        return {
          testid: active.dataset?.testid || null,
          id: active.id,
          insideFallback: Boolean(active.closest("#fallback-list")),
          focusVisible: active.matches(":focus-visible"),
          outlineWidth: computed.outlineWidth,
          outlineStyle: computed.outlineStyle
        };
      });
      if (!state) continue;
      if (state.id === "gl") canvasFocusVisible = state.focusVisible && state.outlineStyle !== "none";
      if (state.testid) seen.set(state.testid, state);
      if (state.insideFallback) seen.set("fallback-list", state);
      if (seen.has("hide-ui") && seen.has("fallback-list")) break;
    }

    const requiredControls = ["lang-en", "share-btn", "hide-ui", "fallback-list"];
    if (audioSupported) requiredControls.push("sound-btn");
    expect(audioSupported || (await page.locator("[data-testid=\"sound-btn\"]").isVisible()) === false).toBe(true);
    for (const required of requiredControls) {
      expect(seen.has(required), "tab reaches " + required).toBe(true);
    }
    for (const required of requiredControls) {
      const state = seen.get(required);
      expect(state.focusVisible, required + " shows keyboard focus").toBe(true);
      expect(state.outlineStyle, required + " has a visible outline").not.toBe("none");
      expect(state.outlineWidth, required + " outline has width").not.toBe("0px");
    }
    expect(canvasFocusVisible).toBe(true);

    const firstItem = page.locator(".poem-index-item").first();
    const id = await firstItem.getAttribute("data-node-id");
    await firstItem.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lockedId), { timeout: 5_000 })
      .toBe(id);
    await expect
      .poll(() => page.evaluate((nodeId: string) => {
        const api = (window as any).__MYCELIUM__;
        return api.nodes.find((node: any) => node.id === nodeId).depth;
      }, id!), { timeout: 7_000 })
      .toBeLessThanOrEqual(3.5);

    await page.locator("#gl").focus();
    const before = await getCamera(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("+");
    await expect
      .poll(async () => JSON.stringify((await getCamera(page)).position), { timeout: 4_000 })
      .not.toBe(JSON.stringify(before.position));
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("camera is still and the intro is shortened", async ({ page }) => {
      await boot(page, "?test=1&seed=42&wander=1&reducedmotion=1");
      const info = await page.evaluate(() => ({
        intro: (window as any).__MYCELIUM__.state.introDuration,
        navMode: (window as any).__MYCELIUM__.state.navMode
      }));
      expect(info.intro).toBeLessThanOrEqual(1.1);
      expect(info.navMode).toBe("orbit");
      const camera = JSON.stringify(await getCamera(page));
      await expect
        .poll(async () => JSON.stringify(await getCamera(page)), {
          timeout: 3_000,
          intervals: [2_200]
        })
        .toBe(camera);
      expect(await page.evaluate(() => (window as any).__MYCELIUM__.state.navMode)).toBe("orbit");
    });
  });
});
