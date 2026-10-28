import { boot, expect, frames, test } from "./fixtures";

test.describe("Persian and bilingual text", () => {
  test("Persian primary line is right-to-left, Vazirmatn, unspaced and joined", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => (window as any).__MYCELIUM__.setLang("fa"));
    const chosen = await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      return api.nodes.find((node: any) => node.visible)!.id;
    });
    await page.evaluate((id: string) => (window as any).__MYCELIUM__.lock(id), chosen);
    await frames(page, 3);
    const primary = page.locator('[data-testid="line-primary"]');
    await expect(primary).toBeVisible();
    const info = await primary.evaluate((element) => {
      const computed = getComputedStyle(element);
      const fa = element.querySelector(".line-fa")!;
      const faComputed = getComputedStyle(fa);
      return {
        lang: element.lang,
        dir: element.dir,
        font: computed.fontFamily,
        spacing: computed.letterSpacing,
        faFont: faComputed.fontFamily,
        faSpacing: faComputed.letterSpacing,
        faChildren: fa.children.length,
        faText: fa.textContent || "",
        faDir: getComputedStyle(fa).direction,
        faLang: fa.lang
      };
    });
    expect(info.lang).toBe("fa");
    expect(info.dir).toBe("rtl");
    expect(info.faDir).toBe("rtl");
    expect(info.faLang).toBe("fa");
    expect(info.font.replace(/["']/g, "").startsWith("Vazirmatn")).toBe(true);
    expect(info.faFont.replace(/["']/g, "").startsWith("Vazirmatn")).toBe(true);
    expect(["normal", "0px", "0"]).toContain(info.spacing);
    expect(["normal", "0px", "0"]).toContain(info.faSpacing);
    expect(info.faChildren).toBe(0);
    expect(info.faText).toMatch(/[\u0600-\u06FF]/);

    const fontAvailable = await page.evaluate(() => document.fonts.check('16px "Vazirmatn"'));
    expect(fontAvailable).toBe(true);
  });

  test("ZWNJ survives into the DOM and no Persian text is split into letters", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => (window as any).__MYCELIUM__.setLang("fa"));
    const line = await page.evaluate(() => (window as any).__MYCELIUM__.lines.find((l: any) => l.fa.includes("\u200C")));
    expect(line, "the poem uses a zero-width non-joiner").toBeTruthy();
    const dom = await page.evaluate((id: string) => {
      const element = document.querySelector(`[data-node-id="${id}"] .line-fa`) as HTMLElement;
      return { text: element.textContent || "", children: element.children.length };
    }, line.id);
    expect(dom.text).toContain("\u200C");
    expect(dom.children).toBe(0);

    const offenders = await page.evaluate(() => {
      const result: string[] = [];
      for (const element of Array.from(document.querySelectorAll("body *"))) {
        if (!/[\u0600-\u06FF]/.test(element.textContent || "")) continue;
        for (const child of Array.from(element.children)) {
          const text = (child.textContent || "").trim();
          if (/^[\u0600-\u06FF]$/.test(text)) {
            result.push((element as HTMLElement).tagName + "." + (element as HTMLElement).className);
            break;
          }
        }
      }
      return result;
    });
    expect(offenders, "splitting Persian into per-letter spans breaks joining").toEqual([]);
  });

  test("both mode shows each language with its own direction and no overlap", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => (window as any).__MYCELIUM__.setLang("both"));
    await page.evaluate(() => (window as any).__MYCELIUM__.lock("n16"));
    await frames(page, 3);
    const info = await page.evaluate(() => {
      const primary = document.querySelector('[data-testid="line-primary"]') as HTMLElement;
      const en = primary.querySelector(".line-en") as HTMLElement;
      const fa = primary.querySelector(".line-fa") as HTMLElement;
      const enRect = en.getBoundingClientRect();
      const faRect = fa.getBoundingClientRect();
      return {
        enDisplay: getComputedStyle(en).display,
        faDisplay: getComputedStyle(fa).display,
        enDir: getComputedStyle(en).direction,
        faDir: getComputedStyle(fa).direction,
        enLang: en.lang,
        faLang: fa.lang,
        enText: en.textContent || "",
        faText: fa.textContent || "",
        overlap: enRect.left < faRect.right && enRect.right > faRect.left && enRect.top < faRect.bottom && enRect.bottom > faRect.top
      };
    });
    expect(info.enDisplay).toBe("block");
    expect(info.faDisplay).toBe("block");
    expect(info.enDir).toBe("ltr");
    expect(info.faDir).toBe("rtl");
    expect(info.enLang).toBe("en");
    expect(info.faLang).toBe("fa");
    expect(info.enText.trim().length).toBeGreaterThan(0);
    expect(info.faText.trim().length).toBeGreaterThan(0);
    expect(info.overlap).toBe(false);
  });

  test("language buttons update the interface and the choice persists across nodes", async ({ page }) => {
    await boot(page);
    const hint = page.locator('[data-testid="hint"]');
    await page.locator('[data-testid="lang-en"]').click();
    await expect.poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lang)).toBe("en");
    expect(await page.locator('[data-testid="lang-en"]').getAttribute("aria-pressed")).toBe("true");
    expect(await page.locator('[data-testid="lang-fa"]').getAttribute("aria-pressed")).toBe("false");
    expect(await hint.getAttribute("data-lang")).toBe("en");
    expect(await page.locator(".hint-fa").evaluate((el) => getComputedStyle(el).display)).toBe("none");

    await page.locator('[data-testid="lang-fa"]').click();
    await expect.poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lang)).toBe("fa");
    expect(await hint.getAttribute("data-lang")).toBe("fa");
    expect(await page.locator(".hint-en").evaluate((el) => getComputedStyle(el).display)).toBe("none");

    await page.evaluate(() => (window as any).__MYCELIUM__.lock("n01"));
    await frames(page, 2);
    await page.evaluate(() => (window as any).__MYCELIUM__.lock("n22"));
    await frames(page, 2);
    const primary = page.locator('[data-testid="line-primary"]');
    expect(await primary.getAttribute("lang")).toBe("fa");
    expect(await primary.getAttribute("dir")).toBe("rtl");

    await page.locator('[data-testid="lang-both"]').click();
    await expect.poll(() => page.evaluate(() => (window as any).__MYCELIUM__.state.lang)).toBe("both");
    expect(await hint.getAttribute("data-lang")).toBe("both");
    expect(await page.locator(".hint-en").evaluate((el) => getComputedStyle(el).display)).toBe("block");
    expect(await page.locator(".hint-fa").evaluate((el) => getComputedStyle(el).display)).toBe("block");
  });

  test("Persian line visual snapshot", async ({ page }) => {
    test.skip(!!process.env.CI, "Pixel baselines are platform-specific; see QA.md");
    await boot(page);
    await page.evaluate(() => {
      const api = (window as any).__MYCELIUM__;
      api.setLang("fa");
      api.lock("n16");
      api.freeze(6);
    });
    await frames(page, 3);
    const primary = page.locator('[data-testid="line-primary"]');
    await expect(primary).toBeVisible();
    await expect(primary).toHaveScreenshot("persian-line-primary.png", { maxDiffPixelRatio: 0.02 });
  });
});
