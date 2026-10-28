import { test as base, expect, type Page } from "@playwright/test";

type Audit = {
  consoleErrors: string[];
  blockedRequests: string[];
};

const ALLOWED: RegExp[] = [
  /^http:\/\/127\.0\.0\.1:4173\/(?:\?.*)?$/,
  /^http:\/\/127\.0\.0\.1:4173\/index\.html(?:\?.*)?$/,
  /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/0\.160\.0\/three\.module\.min\.js$/,
  /^https:\/\/fonts\.googleapis\.com\/css2\?/,
  /^https:\/\/fonts\.gstatic\.com\//,
  /^(?:data|blob):/,
  /^about:blank$/
];

function allowed(url: string): boolean {
  return ALLOWED.some((rule) => rule.test(url));
}

export const test = base.extend<{ audit: Audit }>({
  audit: [
    async ({ page }, use, testInfo) => {
      const audit: Audit = { consoleErrors: [], blockedRequests: [] };
      page.on("console", (message) => {
        if (message.type() === "error") audit.consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => {
        audit.consoleErrors.push("pageerror: " + error.message);
      });
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (allowed(url)) {
          await route.continue();
          return;
        }
        audit.blockedRequests.push(url);
        await route.abort("blockedbyclient");
      });
      await use(audit);
      if (audit.consoleErrors.length) {
        await testInfo.attach("console-errors", {
          body: audit.consoleErrors.join("\n"),
          contentType: "text/plain"
        });
      }
      if (audit.blockedRequests.length) {
        await testInfo.attach("blocked-requests", {
          body: audit.blockedRequests.join("\n"),
          contentType: "text/plain"
        });
      }
      expect(audit.consoleErrors, "console and page errors").toEqual([]);
      expect(audit.blockedRequests, "requests outside the allowlist").toEqual([]);
    },
    { auto: true }
  ]
});

export { expect };

export async function boot(page: Page, query = "?test=1&seed=42"): Promise<void> {
  await page.goto("/" + query, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as any).__MYCELIUM__), undefined, {
    timeout: 60_000
  });
  await page.evaluate(() => (window as any).__MYCELIUM__.ready);
  await page.waitForFunction(() => (window as any).__MYCELIUM__?.readyDone === true, undefined, {
    timeout: 60_000
  });
  const failed = await page.evaluate(() => document.body.classList.contains("webgl-failed"));
  if (failed) throw new Error("WebGL failed to start; the fallback list was shown");
  await frames(page, 2);
}

export async function frames(page: Page, count = 2): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        function step() {
          seen++;
          if (seen >= n) resolve();
          else requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }),
    count
  );
}

export async function getState(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__MYCELIUM__.state);
}

export async function getCamera(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__MYCELIUM__.camera);
}

export async function getNodes(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__MYCELIUM__.nodes);
}

export async function getLines(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__MYCELIUM__.lines);
}

export async function edgesOf(page: Page, id: string): Promise<string[]> {
  return page.evaluate((nodeId) => (window as any).__MYCELIUM__.edgesOf(nodeId), id);
}

export type ChosenNode = {
  id: string;
  screenX: number;
  screenY: number;
  depth: number;
  degree: number;
  nearest: number;
};

export async function chooseIsolatedNode(page: Page, options: { minDegree?: number } = {}): Promise<ChosenNode> {
  const minDegree = options.minDegree ?? 3;
  return page.evaluate(
    ({ minDegree }) => {
      const api = (window as any).__MYCELIUM__;
      const nodes = api.nodes as Array<{ id: string; screenX: number; screenY: number; depth: number; visible: boolean }>;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const top = 120;
      const bottom = h - 150;
      let best: any = null;
      let bestNearest = -1;
      for (const node of nodes) {
        if (!node.visible) continue;
        if (node.screenX < 70 || node.screenX > w - 70) continue;
        if (node.screenY < top || node.screenY > bottom) continue;
        const degree = api.edgesOf(node.id).length;
        if (degree < minDegree) continue;
        let nearest = Infinity;
        for (const other of nodes) {
          if (other.id === node.id) continue;
          nearest = Math.min(nearest, Math.hypot(node.screenX - other.screenX, node.screenY - other.screenY));
        }
        if (nearest > bestNearest) {
          bestNearest = nearest;
          best = { ...node, degree, nearest };
        }
      }
      return best;
    },
    { minDegree }
  );
}

export async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const api = (window as any).__MYCELIUM__;
    const nodes = api.nodes as Array<{ screenX: number; screenY: number; visible: boolean }>;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const startY = 130;
    const endY = h - 170;
    for (let y = startY; y < endY; y += 40) {
      for (let x = 80; x < w - 80; x += 40) {
        const overUI = document.elementFromPoint(x, y)?.closest("#controls, #brand, #hint, #fallback-list, #toast");
        if (overUI) continue;
        let clear = true;
        for (const node of nodes) {
          if (!node.visible) continue;
          if (Math.hypot(node.screenX - x, node.screenY - y) < 90) {
            clear = false;
            break;
          }
        }
        if (clear) return { x, y };
      }
    }
    return { x: 30, y: 140 };
  });
}

export function parseMatrixScale(transform: string): number {
  if (transform.startsWith("matrix3d(")) {
    const values = transform
      .slice(9, -1)
      .split(",")
      .map(Number);
    return Math.hypot(values[0], values[1], values[2]);
  }
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return 1;
  const values = match[1].split(",").map(Number);
  return Math.hypot(values[0], values[1]);
}

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
