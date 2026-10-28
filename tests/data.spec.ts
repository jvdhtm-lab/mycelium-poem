import { boot, edgesOf, expect, test } from "./fixtures";

const THEMES = new Set(["roots", "light", "decay", "memory", "silence", "return"]);

test.describe("poem data", () => {
  test("every node has both languages, themes and a weight", async ({ page }) => {
    await boot(page);
    const lines = await page.evaluate(() => (window as any).__MYCELIUM__.lines);
    expect(lines.length).toBeGreaterThanOrEqual(12);
    for (const line of lines) {
      expect(line.en.trim().length, line.id + " english").toBeGreaterThan(0);
      expect(line.fa.trim().length, line.id + " persian").toBeGreaterThan(0);
      expect(Array.isArray(line.themes), line.id + " themes").toBe(true);
      expect(line.themes.length, line.id + " has a theme").toBeGreaterThan(0);
      for (const theme of line.themes) expect(THEMES.has(theme), "unknown theme " + theme).toBe(true);
      expect([1, 2, 3]).toContain(line.weight);
      expect(Number.isInteger(line.weight)).toBe(true);
    }
    const usedThemes = new Set(lines.flatMap((line: any) => line.themes));
    expect(usedThemes.size).toBeGreaterThanOrEqual(5);
    expect(usedThemes.size).toBeLessThanOrEqual(6);
  });

  test("ids are unique, links resolve, and no node is orphaned", async ({ page }) => {
    await boot(page);
    const info = await page.evaluate(() => ({
      lines: (window as any).__MYCELIUM__.lines,
      links: (window as any).__MYCELIUM__.links
    }));
    const ids = info.lines.map((line: any) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
    const idSet = new Set(ids);
    for (const link of info.links) {
      expect(link.length).toBe(2);
      expect(idSet.has(link[0]), "link start " + link[0]).toBe(true);
      expect(idSet.has(link[1]), "link end " + link[1]).toBe(true);
      expect(link[0]).not.toBe(link[1]);
    }
    const graph = await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      return api.lines.map((line: any) => ({ id: line.id, neighbours: api.edgesOf(line.id) }));
    });
    for (const entry of graph) {
      expect(entry.neighbours.length, entry.id + " has at least one edge").toBeGreaterThan(0);
      expect(new Set(entry.neighbours).size, entry.id + " has no duplicate edges").toBe(entry.neighbours.length);
    }
  });

  test("Persian lines are Persian, joined, and free of Arabic Kaf and Yeh", async ({ page }) => {
    await boot(page);
    const lines = await page.evaluate(() => (window as any).__MYCELIUM__.lines);
    let zwnjCount = 0;
    let questionCount = 0;
    let guillemetCount = 0;
    let commaCount = 0;
    let semicolonCount = 0;
    for (const line of lines) {
      const fa: string = line.fa;
      expect(fa, line.id + " contains Persian letters").toMatch(/[\u0600-\u06FF]/);
      expect(fa, line.id + " contains no Latin letters").not.toMatch(/[A-Za-z]/);
      expect(fa, line.id + " uses Persian kaf and yeh").not.toMatch(/[\u0643\u064A]/);
      expect(fa, line.id + " has no replacement glyphs").not.toContain("\uFFFD");
      zwnjCount += (fa.match(/\u200C/g) || []).length;
      questionCount += (fa.match(/\u061F/g) || []).length;
      guillemetCount += (fa.match(/[«»]/g) || []).length;
      commaCount += (fa.match(/\u060C/g) || []).length;
      semicolonCount += (fa.match(/\u061B/g) || []).length;
    }
    expect(zwnjCount, "zero-width non-joiners are preserved in the data").toBeGreaterThan(0);
    expect(questionCount, "Persian question mark is exercised").toBeGreaterThan(0);
    expect(guillemetCount, "Persian guillemets are exercised").toBeGreaterThan(0);
    expect(commaCount, "Persian comma is exercised").toBeGreaterThan(0);
    expect(semicolonCount, "Persian semicolon is exercised").toBeGreaterThan(0);
  });
});
