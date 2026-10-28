import { boot, expect, getState, test } from "./fixtures";

test.describe("sound", () => {
  test("sound is silent by default and starts only after a gesture", async ({ page }) => {
    await boot(page);
    const supported = await page.evaluate(() => Boolean(window.AudioContext || (window as any).webkitAudioContext));
    test.skip(!supported, "This headless engine exposes no Web Audio API; real Safari/Chrome audio is checked manually in QA.md");
    expect(await page.locator("[data-testid=\"sound-btn\"]").isVisible()).toBe(true);
    const initial = await page.evaluate(() => ({
      soundOn: (window as any).__MYCELIUM__.state.soundOn,
      audio: (window as any).__MYCELIUM__.audioState,
      pressed: document.querySelector('[data-testid="sound-btn"]')!.getAttribute("aria-pressed")
    }));
    expect(initial.soundOn).toBe(false);
    expect(initial.audio).toBe("none");
    expect(initial.pressed).toBe("false");

    await page.locator('[data-testid="sound-btn"]').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.soundOn), { timeout: 3_000 })
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => (window as any).__MYCELIUM__.audioState), { timeout: 3_000 })
      .toBe("running");
    expect(await page.locator('[data-testid="sound-btn"]').getAttribute("aria-pressed")).toBe("true");

    await page.locator('[data-testid="sound-btn"]').click();
    await expect.poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.soundOn)).toBe(false);
    expect((await getState(page)).soundOn).toBe(false);
  });
});
