import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 4173);
const files = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"]
]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const file = files.get(url.pathname);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  fs.readFile(path.join(root, file), (err, data) => {
    if (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Could not read " + file);
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-length": data.length
    });
    res.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mycelium Poem served at http://127.0.0.1:${port}/`);
});
