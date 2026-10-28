import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const shell = read("src/shell.html");
const css = read("src/styles.css");
const app = read("src/app.js");

const banner = `<!--
  MYCELIUM POEM — a bilingual, three-dimensional mycelium of poetry.

  EDITING THE POEM
  The poem lives in POEM.nodes inside the inline module below (search for
  "REPLACE WITH REAL LINES"). Each node has:
    id       a unique short id
    en, fa   the same line in English and Persian
    themes   one or more of: roots, light, decay, memory, silence, return
    weight   1-3; heavier nodes glow more, grow larger, light their threads

  Edges are generated automatically from shared themes. Add cross-theme
  connections in POEM.links, e.g. [["n01", "n12"]].

  TUNING
  Edit the CONFIG object at the top of the module for layout spread, camera
  distance and limits, fog, bloom, depth of field, intro length, quality
  tiers and the fade distance at which lines become unreadable.

  BUILDING
  The editable sources live in src/. Run "npm run build" to regenerate this
  self-contained file. Only the pinned Three.js module (cdnjs, r160 /
  0.160.0) and Google Fonts are requested at runtime.
-->`;

let out = shell
  .replace("/*__STYLE__*/", () => css)
  .replace("/*__APP__*/", () => app.replace(/<\/script>/gi, "<\\/script>"))
  .replace("<!doctype html>", "<!doctype html>\n" + banner);

fs.writeFileSync(path.join(root, "index.html"), out, "utf8");
const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log(`index.html written (${kb} KiB)`);
