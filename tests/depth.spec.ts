import { boot, chooseIsolatedNode, expect, frames, parseMatrixScale, test } from "./fixtures";

test.describe("depth", () => {
  test("near lines are larger and more opaque than far lines", async ({ page }) => {
    await boot(page);
    const nodes = await page.evaluate(() => (window as any).__MYCELIUM__.nodes);
    const sorted = nodes.slice().sort((a: any, b: any) => a.depth - b.depth);
    const near = sorted[0];
    const far = sorted[sorted.length - 1];
    expect(near.depth).toBeLessThan(far.depth);
    const styles = await page.evaluate(
      ({ nearId, farId }) => {
        const read = (id: string) => {
          const element = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
          const computed = getComputedStyle(element);
          return {
            opacity: Number(computed.opacity),
            transform: computed.transform,
            visibility: computed.visibility
          };
        };
        return { near: read(nearId), far: read(farId) };
      },
      { nearId: near.id, farId: far.id }
    );
    const nearScale = parseMatrixScale(styles.near.transform);
    const farScale = parseMatrixScale(styles.far.transform);
    expect(nearScale).toBeGreaterThan(farScale);
    expect(styles.near.opacity).toBeGreaterThan(styles.far.opacity);
  });

  test("lines beyond the fade distance are hidden until the camera moves closer", async ({ page }) => {
    await boot(page);
    const info = await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      const fade = api.config.text.fadeDistance;
      const hidden = api.nodes.filter((node: any) => node.depth > fade && node.visible === false);
      return { fade, hidden };
    });
    expect(info.hidden.length, "at least one line starts beyond the fade distance").toBeGreaterThan(0);
    const target = info.hidden[0];
    const before = await page.evaluate((id: string) => {
      const element = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
      const computed = getComputedStyle(element);
      return { visibility: computed.visibility, opacity: Number(computed.opacity) };
    }, target.id);
    expect(before.visibility).toBe("hidden");
    expect(before.opacity).toBeLessThanOrEqual(0.01);

    await page.evaluate((id: string) => (window as any).__MYCELIUM__.flyTo(id), target.id);
    const primary = page.locator('[data-testid="line-primary"]');
    await expect(primary).toBeVisible();
    await frames(page, 2);
    const after = await primary.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        visibility: computed.visibility,
        opacity: Number(computed.opacity),
        filter: computed.filter,
        scale: Number(computed.transform.match(/matrix\(([^,]+)/)![1])
      };
    });
    expect(after.visibility).toBe("visible");
    expect(after.opacity).toBeGreaterThan(0.95);
    expect(after.filter === "none" || after.filter === "").toBe(true);
    expect(after.scale).toBeGreaterThan(1);
  });

  test("Persian lines use scale and translation only, never rotation or skew", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => (window as any).__MYCELIUM__.setLang("fa"));
    const chosen = await chooseIsolatedNode(page);
    await page.evaluate((id: string) => (window as any).__MYCELIUM__.lock(id), chosen.id);
    await frames(page, 3);
    const primary = page.locator('[data-testid="line-primary"]');
    await expect(primary).toBeVisible();
    const transform = await primary.evaluate((element) => getComputedStyle(element).transform);
    expect(transform.startsWith("matrix3d(")).toBe(false);
    expect(transform.startsWith("matrix(")).toBe(true);
    const values = transform.slice(7, -1).split(",").map(Number);
    expect(Math.abs(values[1]), "no skew/rotation b").toBeLessThan(0.001);
    expect(Math.abs(values[2]), "no skew/rotation c").toBeLessThan(0.001);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[3]).toBeGreaterThan(0);
    expect(Math.abs(values[0] - values[3])).toBeLessThan(0.001);
  });
});
