import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const testMode = process.env.MYCELIUM_TEST === "1";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
const dataFile = path.resolve(process.env.MYCELIUM_DATA_FILE || path.join(root, "data", "additions.json"));
const maxAdditions = Number(process.env.MAX_ADDITIONS || 300);
const themes = new Set(["roots", "light", "decay", "memory", "silence", "return"]);
const rateWindow = 10 * 60 * 1000;
const rateLimit = Number(process.env.RATE_LIMIT || 5);
const rate = new Map();
const indexFile = path.join(root, "index.html");
const MARKER = "/*__ADDITIONS__*/[]";
const HAS_MARKER = "/*__HAS_API__*/false";

await fs.promises.mkdir(path.dirname(dataFile), { recursive: true });
if (testMode) {
  await fs.promises.rm(dataFile, { force: true });
}

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u064A/g, "\u06CC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

function validateLine(payload) {
  const en = cleanText(payload?.en).slice(0, 180);
  const fa = cleanText(payload?.fa).slice(0, 180);
  const requested = Array.isArray(payload?.themes) ? payload.themes : [payload?.theme];
  const theme = requested.find((value) => themes.has(value));
  if (Array.from(en).length < 2) return { error: "English line is too short" };
  if (Array.from(fa).length < 2) return { error: "Persian line is too short" };
  if (!/[\u0600-\u06FF]/.test(fa)) return { error: "Persian line must contain Persian letters" };
  if (!theme) return { error: "Choose a theme" };
  return { en, fa, themes: [theme] };
}

async function readAdditions() {
  try {
    const raw = await fs.promises.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line) => line && typeof line.id === "string" && line.en && line.fa && themes.has(line.themes?.[0])).slice(0, maxAdditions);
  } catch {
    return [];
  }
}

let additions = await readAdditions();
let writeQueue = Promise.resolve();

function persist() {
  writeQueue = writeQueue.then(async () => {
    const temp = dataFile + ".tmp";
    await fs.promises.writeFile(temp, JSON.stringify(additions, null, 2), "utf8");
    await fs.promises.rename(temp, dataFile);
  });
  return writeQueue;
}

function clientIp(request) {
  const direct = request.headers["cf-connecting-ip"] || request.headers["x-real-ip"];
  if (typeof direct === "string" && direct) return direct;
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return request.socket.remoteAddress || "local";
}

function withinRate(ip) {
  const now = Date.now();
  const hits = (rate.get(ip) || []).filter((time) => now - time < rateWindow);
  if (hits.length >= rateLimit) {
    rate.set(ip, hits);
    return false;
  }
  hits.push(now);
  rate.set(ip, hits);
  return true;
}

function cors(response) {
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("access-control-allow-headers", "Content-Type, Authorization");
  response.setHeader("access-control-max-age", "86400");
}

function json(response, status, payload) {
  cors(response);
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function version() {
  const last = additions[additions.length - 1];
  return additions.length + ":" + (last?.id || "seed");
}

async function readBody(request) {
  const limit = 16 * 1024;
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serveIndex(response) {
  let html;
  try {
    html = await fs.promises.readFile(indexFile, "utf8");
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("index.html is missing. Run npm run build.");
    return;
  }
  if (!html.includes(MARKER) || !html.includes(HAS_MARKER)) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("The additions marker is missing from index.html. Run npm run build.");
    return;
  }
  const injected = JSON.stringify(additions).replace(/</g, "\\u003c");
  const out = html.replace(MARKER, injected).replace(HAS_MARKER, "true");
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(out)
  });
  response.end(out);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  const pathname = url.pathname;

  try {
    if (request.method === "OPTIONS") {
      cors(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      if (request.method !== "GET") {
        json(response, 405, { error: "method not allowed" });
        return;
      }
      await serveIndex(response);
      return;
    }

    if (pathname === "/api/health" && request.method === "GET") {
      json(response, 200, {
        ok: true,
        count: additions.length,
        max: maxAdditions,
        accepting: additions.length < maxAdditions,
        version: version()
      });
      return;
    }

    if (pathname === "/api/lines" && request.method === "GET") {
      json(response, 200, { lines: additions, version: version() });
      return;
    }

    if (pathname === "/api/lines" && request.method === "POST") {
      if (additions.length >= maxAdditions) {
        json(response, 429, { error: "The network is full for now" });
        return;
      }
      if (!withinRate(clientIp(request))) {
        json(response, 429, { error: "Slow down: too many lines in a short time" });
        return;
      }
      let payload;
      try {
        payload = await readBody(request);
      } catch {
        json(response, 400, { error: "Could not read that line" });
        return;
      }
      const validated = validateLine(payload);
      if (validated.error) {
        json(response, 400, { error: validated.error });
        return;
      }
      if (additions.some((line) => line.en.toLowerCase() === validated.en.toLowerCase() || line.fa === validated.fa)) {
        json(response, 409, { error: "That line is already growing here" });
        return;
      }
      const line = {
        id: "u" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
        en: validated.en,
        fa: validated.fa,
        themes: validated.themes,
        weight: 1,
        addedAt: new Date().toISOString()
      };
      additions.push(line);
      await persist();
      json(response, 201, { line, version: version() });
      return;
    }

    if (pathname === "/api/test/reset" && request.method === "POST" && testMode) {
      additions = [];
      await persist();
      json(response, 200, { ok: true, count: 0 });
      return;
    }

    if (pathname.startsWith("/api/lines/") && request.method === "DELETE") {
      const token = process.env.ADMIN_TOKEN;
      if (!token || request.headers.authorization !== "Bearer " + token) {
        json(response, 403, { error: "not allowed" });
        return;
      }
      const id = decodeURIComponent(pathname.slice("/api/lines/".length));
      const before = additions.length;
      additions = additions.filter((line) => line.id !== id);
      if (additions.length === before) {
        json(response, 404, { error: "line not found" });
        return;
      }
      await persist();
      json(response, 200, { ok: true, count: additions.length });
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: "server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Mycelium Poem backend at http://${host}:${port}/`);
  console.log(`Shared lines: ${additions.length}/${maxAdditions} — ${dataFile}`);
});
