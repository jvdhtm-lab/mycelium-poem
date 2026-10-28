import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, "index.html");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(fs.existsSync(file), "index.html exists");
if (!fs.existsSync(file)) {
  console.error("index.html is missing. Run npm run build.");
  process.exit(1);
}

const html = fs.readFileSync(file, "utf8");
const bytes = Buffer.byteLength(html);

check(bytes < 2 * 1024 * 1024, `index.html is ${(bytes / 1024).toFixed(1)} KiB (limit 2048 KiB)`);
check(!/\blocalStorage\b/.test(html), "no localStorage use");
check(!/\bsessionStorage\b/.test(html), "no sessionStorage use");
check(!/\bMath\.random\b/.test(html), "no Math.random in layout or render code");
check(!/\uFFFD/.test(html), "no Unicode replacement characters");
check(!/[\u0643\u064A]/.test(html), "no Arabic kaf/yeh variants");
check(/\u200C/.test(html), "ZWNJ characters survive in the built file");
check(/viewport-fit=cover/.test(html), "viewport-fit=cover is set");
check(/<meta charset="utf-8">/i.test(html), "utf-8 charset is declared");

check(
  html.includes("https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js"),
  "Three.js is imported from the pinned cdnjs 0.160.0 URL"
);
check(!/<script[^>]+src=/.test(html), "no external script tags");
check(!/three\.js\/(?:latest|\^|~)/.test(html), "no unpinned Three.js version");
check(/fonts\.googleapis\.com\/css2\?.*Vazirmatn/.test(html), "Vazirmatn is loaded from Google Fonts");
check(/Cormorant\+Garamond/.test(html), "Cormorant Garamond is loaded from Google Fonts");

const urls = Array.from(html.matchAll(/https?:\/\/[^\s"'<>()]+/g), (match) => match[0]);
const allowedHosts = new Set([
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "www.w3.org"
]);
for (const url of urls) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    failures.push("unparseable URL: " + url);
    continue;
  }
  check(allowedHosts.has(parsed.hostname), "unexpected external host: " + parsed.hostname);
  if (parsed.hostname === "cdnjs.cloudflare.com") {
    check(
      parsed.pathname === "/ajax/libs/three.js/0.160.0/three.module.min.js",
      "unexpected cdnjs resource: " + parsed.pathname
    );
  }
}

const required = [
  'data-testid="lang-toggle"',
  'data-testid="lang-en"',
  'data-testid="lang-fa"',
  'data-testid="lang-both"',
  'data-testid="share-btn"',
  'data-testid="sound-btn"',
  'data-testid="tilt-btn"',
  'data-testid="hide-ui"',
  'data-testid="fallback-list"',
  'data-testid="hint"',
  'data-testid="add-btn"',
  'data-testid="add-dialog"',
  'data-testid="add-en"',
  'data-testid="add-fa"',
  'data-testid="add-theme"',
  'data-testid="add-submit"'
];
for (const marker of required) check(html.includes(marker), "missing " + marker);
check(html.includes('"line-primary"'), "line-primary test id is generated");
check(html.includes('"line-echo"'), "line-echo test id is generated");
check(html.includes("REPLACE WITH REAL LINES"), "placeholder poem comment is present");
check(html.includes("const CONFIG ="), "CONFIG object is present");
check(html.includes("const POEM ="), "POEM object is present");
check(html.includes("__MYCELIUM_ADDITIONS__"), "shared additions marker is present");
check(html.includes("__MYCELIUM_HAS_API__"), "API marker is present");

const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
check(Boolean(cssMatch), "inline stylesheet exists");
if (cssMatch) {
  const css = cssMatch[1];
  const persianSelector = /(?:\.line-fa|\.brand-fa|\.hint-fa|\.idx-fa|\.lang-fa|\.lang-both|\[lang=["']fa["']\]|#controls\s+\.fa)/;
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rulePattern.exec(css))) {
    const selector = match[1];
    const body = match[2];
    if (!persianSelector.test(selector)) continue;
    const spacing = body.match(/letter-spacing\s*:\s*([^;]+)/i);
    if (spacing) {
      const value = spacing[1].trim().toLowerCase();
      check(
        value === "normal" || value === "0" || value === "0px" || value.startsWith("normal "),
        "Persian selector has letter-spacing: " + selector.trim() + " -> " + value
      );
    }
  }
  check(/#gl[\s\S]*?touch-action\s*:\s*none/.test(css), "canvas has touch-action: none");
  check(/env\(safe-area-inset-top/.test(css), "safe-area insets are used");
}

const poemSection = html.slice(html.indexOf("const POEM ="), html.indexOf("const nodeById"));
const nodeEntries = (poemSection.match(/id: "n?\w+"/g) || []).length;
check(nodeEntries >= 12, "poem data contains nodes");
check(!/Math\.random/.test(poemSection), "poem section has no randomness");

if (failures.length) {
  console.error("Static checks failed:\n" + failures.map((failure) => " - " + failure).join("\n"));
  process.exit(1);
}

console.log(
  `Static checks passed: ${(bytes / 1024).toFixed(1)} KiB, ` +
    `${urls.length} allowlisted URLs, ${nodeEntries} poem nodes, Persian typography rules intact.`
);
