#!/usr/bin/env bun
/**
 * Holds each recipe that runs `op` behind may-i to the secrets its script reads, so the
 * approval lists only the fields that command uses. may-i shows every `op://` reference it
 * is handed and cannot know what a script will read, so this runs before the code lands:
 * in a pre-commit hook and in CI. Copy it into your repo; it needs nothing but Node or Bun.
 *
 * The rules:
 * - each such recipe has an `--env-file` of its own, shared with no other recipe;
 * - every line of that file is NAME=op://vault/item/field;
 * - the script reads every name in the file, and the file names every secret the script
 *   reads. A tool that reads the environment itself is declared in the script with a
 *   `# reads: NAME` comment.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Problem {
  readonly says: string;
}

interface Recipe {
  readonly name: string;
  readonly body: string;
}

const LINE = /^([A-Z_][A-Z0-9_]*)=op:\/\/[^/\s]+\/[^/\s]+\/\S+$/;

/** Recipes as `name` plus their indented body, from a justfile. */
function recipesIn(justfile: string): Recipe[] {
  const out: { name: string; lines: string[] }[] = [];
  for (const line of justfile.split("\n")) {
    const header = line.match(/^([a-z][\w-]*)[^\n:]*:(?!=)/);
    if (header?.[1]) out.push({ name: header[1], lines: [] });
    else if (/^\s+\S/.test(line)) out.at(-1)?.lines.push(line.trim());
  }
  return out.map((r) => ({ name: r.name, body: r.lines.join("\n") }));
}

/** The names an env file declares, and a problem for each line that is not a reference. */
function declared(file: string, text: string): { names: string[]; problems: Problem[] } {
  const names: string[] = [];
  const problems: Problem[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const name = line.match(LINE)?.[1];
    if (name) names.push(name);
    else problems.push({ says: `${file} line ${i + 1} is not NAME=op://vault/item/field` });
  });
  return { names, problems };
}

/** Every environment name a shell or JS script reads, plus its `# reads:` declarations. */
function reads(script: string): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /\$\{?([A-Z_][A-Z0-9_]*)/g,
    /process\.env\.([A-Z_][A-Z0-9_]*)/g,
    /process\.env\[["']([A-Z_][A-Z0-9_]*)["']\]/g,
  ];
  for (const re of patterns) for (const m of script.matchAll(re)) if (m[1]) found.add(m[1]);
  for (const m of script.matchAll(/#\s*reads:\s*([A-Z0-9_ ,]+)/g)) {
    for (const name of (m[1] ?? "").split(/[\s,]+/)) if (name) found.add(name);
  }
  return found;
}

interface Use {
  readonly recipe: string;
  readonly file: string;
  readonly script: string;
}

/** What each `may-i … op run --env-file F -- SCRIPT` recipe uses, or why it cannot be read. */
function usesIn(recipes: Recipe[]): { uses: Use[]; problems: Problem[] } {
  const uses: Use[] = [];
  const problems: Problem[] = [];
  for (const { name, body } of recipes) {
    if (!/\bmay-i\b/.test(body) || !/\bop run\b/.test(body)) continue;
    const call = body.match(/--env-file\s+(\S+)\s+--\s+(\S+)/);
    if (!call?.[1] || !call[2]) {
      problems.push({ says: `${name} runs op behind may-i with no --env-file of its own` });
    } else if (!/^\.?\.?\/[\w./-]+$/.test(call[2])) {
      problems.push({ says: `${name} runs ${call[2]}, which the check cannot read` });
    } else {
      uses.push({ recipe: name, file: call[1], script: call[2] });
    }
  }
  return { uses, problems };
}

/** An env file used by more than one recipe lists the union of their fields in each approval. */
function shared(uses: Use[]): Problem[] {
  const owners = new Map<string, string[]>();
  for (const u of uses) owners.set(u.file, [...(owners.get(u.file) ?? []), u.recipe]);
  return [...owners]
    .filter(([, recipes]) => recipes.length > 1)
    .map(([file, recipes]) => ({ says: `${file} is shared by ${recipes.join(", ")}` }));
}

/** Each env file's declared names, keyed by file. */
function loadFiles(
  dir: string,
  uses: Use[],
): { files: Map<string, string[]>; problems: Problem[] } {
  const files = new Map<string, string[]>();
  const problems: Problem[] = [];
  for (const file of new Set(uses.map((u) => u.file))) {
    if (!existsSync(join(dir, file))) {
      problems.push({ says: `${file} does not exist` });
      continue;
    }
    const parsed = declared(file, readFileSync(join(dir, file), "utf8"));
    files.set(file, parsed.names);
    problems.push(...parsed.problems);
  }
  return { files, problems };
}

/** Over-declared: a name the script never reads. Under-declared: a known secret it reads
 *  that its own file does not name. */
function mismatches(names: string[], used: Set<string>, secrets: Set<string>, u: Use): Problem[] {
  const over = names
    .filter((n) => !used.has(n))
    .map((n) => ({ says: `${u.file} names ${n}, which ${u.script} never reads` }));
  const under = [...used]
    .filter((n) => secrets.has(n) && !names.includes(n))
    .map((n) => ({ says: `${u.script} reads ${n}, which ${u.file} does not name` }));
  return [...over, ...under];
}

/** Every problem with the recipes in `dir/justfile`; an empty list means the rule holds. */
export function checkEnvFiles(dir: string): Problem[] {
  const justfile = join(dir, "justfile");
  if (!existsSync(justfile)) return [{ says: `no justfile in ${dir}` }];
  const { uses, problems } = usesIn(recipesIn(readFileSync(justfile, "utf8")));
  const { files, problems: fileProblems } = loadFiles(dir, uses);
  problems.push(...shared(uses), ...fileProblems);
  const secrets = new Set([...files.values()].flat());
  for (const u of uses) {
    const names = files.get(u.file);
    if (!names) continue;
    if (!existsSync(join(dir, u.script))) {
      problems.push({ says: `${u.script} does not exist` });
      continue;
    }
    problems.push(
      ...mismatches(names, reads(readFileSync(join(dir, u.script), "utf8")), secrets, u),
    );
  }
  return problems;
}

// \`import.meta.main\` is Bun's and newer Node's. Older Node would skip the block and pass in
// silence, so the path comparison makes sure it runs everywhere.
if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkEnvFiles(process.argv[2] ?? ".");
  for (const p of problems) console.error(`check-env-files: ${p.says}`);
  if (problems.length > 0) process.exit(1);
  console.log("check-env-files: every approval names only the fields its command reads");
}
