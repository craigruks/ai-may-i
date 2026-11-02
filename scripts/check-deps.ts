/** No runtime dependencies: every line that runs is in this repo, and can be read in an afternoon. */

import { readFileSync } from "node:fs";

const pkg: Record<string, unknown> = JSON.parse(readFileSync("package.json", "utf8"));
const kinds = ["dependencies", "optionalDependencies", "peerDependencies", "bundleDependencies"];
const found = kinds.flatMap((kind) => {
  const deps = pkg[kind];
  return deps && typeof deps === "object"
    ? Object.keys(deps).map((name) => `${kind}: ${name}`)
    : [];
});
if (found.length > 0) {
  console.error(`runtime dependencies must stay empty; found:\n  ${found.join("\n  ")}`);
  process.exit(1);
}
console.log("no runtime dependencies");
