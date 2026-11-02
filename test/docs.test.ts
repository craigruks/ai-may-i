// Proves the docs show only what exists: every may-i flag and subcommand in their code is
// one `may-i --help` lists, every may-i-hook flag parses, every `just` recipe is in a
// justfile, every config path is one the code reads, and every link into the repo resolves.
import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { USAGE } from "../src/args.js";
import { parseHookArgs } from "../src/hook.js";

const SITE = "website/src/content/docs";
const pages = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "CLAUDE.md",
  ...(["docs", SITE] as const).flatMap((dir) =>
    existsSync(dir)
      ? readdirSync(dir, { recursive: true, encoding: "utf8" })
          .filter((f) => /\.mdx?$/.test(f))
          .map((f) => join(dir, f))
      : [],
  ),
].filter((f) => existsSync(f));

/** Fenced blocks, then inline code spans from what is left. */
function codeIn(text: string): string[] {
  const fences = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
  const prose = text.replace(/```[^\n]*\n[\s\S]*?```/g, "");
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] ?? "");
  // A shell comment is prose: "# builds bin/may-i and …" is no call.
  return [...fences, ...spans].map((c) => c.replace(/(^|\s)#.*$/gm, ""));
}

const FLAGS = new Set(USAGE.match(/(?<=\s|\[)--?[a-z][\w-]*/g));
const SUBCOMMANDS = new Set([...USAGE.matchAll(/^may-i ([a-z]+)/gm)].map((m) => m[1]));
const HOOK_FLAGS = ["--wrap", "--gate"];

/** Each `may-i …` call's own words: up to `--`, a pipe, a `;` or the end of the line. */
function calls(code: string, program: "may-i" | "may-i-hook"): string[][] {
  const at = new RegExp(`(?:^|[\\s;&|(\`"'/])${program}(?=\\s|$)([^\\n|;&]*)`, "gm");
  return [...code.matchAll(at)].map((m) => {
    const words = (m[1] ?? "").trim().split(/\s+/).filter(Boolean);
    const end = words.indexOf("--");
    return (end === -1 ? words : words.slice(0, end)).map((w) =>
      w.replace(/^["'`[]+|["'`,\]]+$/g, ""),
    );
  });
}

function recipes(path: string): string[] {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  return [...text.matchAll(/^([a-z][\w-]*)[^\n:]*:(?!=)/gm)].map((m) => m[1] ?? "");
}
const RECIPES = new Set([...recipes("justfile"), ...recipes("examples/justfile")]);

describe.each(pages)("%s", (page) => {
  const text = readFileSync(page, "utf8");
  const code = codeIn(text).join("\n");

  it("uses only flags and subcommands may-i --help lists", () => {
    const unknown = calls(code, "may-i").flatMap(([first, ...rest]) => {
      if (first === undefined) return [];
      const sub = !first.startsWith("-") && !first.startsWith("<");
      const words = sub ? rest : [first, ...rest];
      return [
        ...(sub && !SUBCOMMANDS.has(first) ? [first] : []),
        ...words.filter((w) => /^--?[a-z]/.test(w) && !FLAGS.has(w.split("=")[0] ?? "")),
      ];
    });
    expect(unknown).toEqual([]);
  });

  it("uses only flags may-i-hook parses", () => {
    expect(parseHookArgs(["--wrap", "--gate", "may-i"])).toEqual({ mode: "wrap", gate: "may-i" });
    const flags = calls(code, "may-i-hook").flatMap((words) =>
      words.filter((w) => w.startsWith("-")),
    );
    expect(flags.filter((f) => !HOOK_FLAGS.includes(f))).toEqual([]);
  });

  it("runs only recipes a justfile has", () => {
    const used = [...code.matchAll(/(?:^|[\s(`])just ([a-z][\w-]*)/gm)].map((m) => m[1] ?? "");
    expect(used.filter((r) => !RECIPES.has(r))).toEqual([]);
  });

  it("gives only the config and receipt paths the code reads", () => {
    const paths = [...text.matchAll(/[\w~.$/{}-]*\/may-i\/[\w.-]+/g)].map((m) => m[0]);
    const known = /\/may-i\/(config\.json|receipts\.jsonl)$/;
    expect(paths.filter((p) => !known.test(p) && !p.includes("github.com"))).toEqual([]);
  });

  it("links only to files that exist", () => {
    const repoLinks = [
      ...text.matchAll(/github\.com\/craigruks\/ai-may-i\/(?:blob|tree)\/main\/([^)#\s]+)/g),
    ];
    const relative = [...text.matchAll(/\]\((?!https?:|#|mailto:|\/)([^)#\s]+)/g)];
    const missing = [
      ...repoLinks.map((m) => m[1] ?? "").filter((p) => !existsSync(p)),
      ...relative
        .map((m) => normalize(join(dirname(page), m[1] ?? "")))
        .filter((p) => !existsSync(p)),
    ];
    expect(missing).toEqual([]);
  });

  it("links only to site pages that exist", () => {
    const routes = [...text.matchAll(/(?:\]\(|href=")\/ai-may-i\/([^)#\s"]*)/g)].map(
      (m) => m[1] ?? "",
    );
    const page = (route: string) => {
      const slug = route.replace(/\/$/, "") || "index";
      return [".md", ".mdx"].some((ext) => existsSync(join(SITE, `${slug}${ext}`)));
    };
    expect(routes.filter((r) => !page(r))).toEqual([]);
  });
});
