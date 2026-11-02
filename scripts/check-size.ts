/** Every source, test and script file stays under 300 lines, so each can be read whole. */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 300;
const files = ["src", "test", "scripts"].flatMap((dir) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(dir, f)),
);
const long = files
  .map((path) => ({ path, lines: readFileSync(path, "utf8").split("\n").length - 1 }))
  .filter((f) => f.lines >= LIMIT);
if (long.length > 0) {
  for (const f of long) console.error(`${f.path}: ${f.lines} lines (limit ${LIMIT - 1})`);
  process.exit(1);
}
console.log(`${files.length} files, all under ${LIMIT} lines`);
