/**
 * Where the rules come from:
 *
 *   $XDG_CONFIG_HOME/may-i/config.json   (default ~/.config/may-i/config.json)
 *   .may-i.json in the cwd, or the nearest parent that has one
 *
 * The repo file can only tighten. The agent being gated can usually write to
 * the repo it works in, so a repo file that could `allow` would let it switch
 * the gate off for itself. Its `allow` is ignored with a warning; its `ask` and
 * `deny` add to the user's, and since the strictest tier wins (policy.ts), adding
 * can only tighten. Its timeout can only shorten.
 */

import { dirname, join } from "node:path";
import { type Observer, parseObservers } from "./observers.js";
import { NO_RULES, type Rules } from "./policy.js";
import { DEFAULT_FILE_FLAGS, type ReadText } from "./references.js";

export interface Config {
  user: Rules;
  repo: Pick<Rules, "ask" | "deny">;
  timeoutSeconds: number;
  fileFlags: readonly string[];
  scanFiles: readonly string[];
  observers: readonly Observer[];
}

/** Long enough to read the request, short enough that a forgotten prompt does
 *  not hold a terminal all night. A timeout refuses. */
export const DEFAULT_TIMEOUT_SECONDS = 120;
export const MAX_TIMEOUT_SECONDS = 600;
export const REPO_FILE = ".may-i.json";

export const DEFAULT_CONFIG: Config = {
  user: NO_RULES,
  repo: { ask: [], deny: [] },
  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  fileFlags: DEFAULT_FILE_FLAGS,
  scanFiles: [],
  observers: [],
};

export function effectiveRules(config: Config): Rules {
  return {
    allow: config.user.allow,
    ask: [...config.user.ask, ...config.repo.ask],
    deny: [...config.user.deny, ...config.repo.deny],
  };
}

const LIST_KEYS = ["allow", "ask", "deny", "scanFiles", "fileFlags"] as const;
type ListKey = (typeof LIST_KEYS)[number];
type FileConfig = Partial<Record<ListKey, string[]>> & {
  timeoutSeconds?: number;
  observers?: Observer[];
};
const USER_ONLY = ["allow", "scanFiles", "fileFlags", "observers"] as const;

const isListKey = (key: string): key is ListKey => LIST_KEYS.some((k) => k === key);
const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");
const isTimeout = (v: unknown): v is number =>
  Number.isInteger(v) && Number(v) >= 1 && Number(v) <= MAX_TIMEOUT_SECONDS;

/** Sets one field on `out`, or says why it cannot. An unknown key is a bad field,
 *  since a misspelt `deny` would otherwise vanish without a word. */
function setField(out: FileConfig, key: string, value: unknown): string | null {
  if (key === "timeoutSeconds") {
    if (!isTimeout(value)) return `\`timeoutSeconds\` must be 1 to ${MAX_TIMEOUT_SECONDS}`;
    out.timeoutSeconds = value;
    return null;
  }
  if (key === "observers") {
    const observers = parseObservers(value);
    if (typeof observers === "string") return observers;
    out.observers = observers;
    return null;
  }
  if (!isListKey(key)) return `unknown key \`${key}\``;
  if (!isStringList(value)) return `\`${key}\` must be a list of strings`;
  out[key] = value;
  return null;
}

/** All or nothing per file: one bad field rejects the whole file, because a
 *  half-applied policy is a policy nobody wrote. */
function parse(path: string, text: string): FileConfig | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return `${path}: not valid JSON (${err instanceof Error ? err.message : String(err)})`;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return `${path}: expected a JSON object`;
  }
  const out: FileConfig = {};
  for (const [key, value] of Object.entries(raw)) {
    const bad = setField(out, key, value);
    if (bad) return `${path}: ${bad}`;
  }
  return out;
}

/** Dropping a broken user file leaves the default, which asks for everything.
 *  Dropping a broken repo file would loosen instead, since all it holds is asks
 *  and denies, so in its place it asks for everything. */
function load(
  path: string,
  text: string | null,
  warnings: string[],
  broken: FileConfig,
): FileConfig {
  if (text === null) return {};
  const parsed = parse(path, text);
  if (typeof parsed === "string") {
    warnings.push(`${parsed}; asking for everything until it is fixed`);
    return broken;
  }
  return parsed;
}

function findRepoFile(cwd: string, readText: ReadText): { path: string; text: string } | null {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const path = join(dir, REPO_FILE);
    const text = readText(path);
    if (text !== null) return { path, text };
    if (dirname(dir) === dir) return null;
  }
}

export interface LoadInput {
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  cwd: string;
  readText: ReadText;
}

export function userConfigPath(env: LoadInput["env"], home: string): string {
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "may-i", "config.json");
}

export function loadConfig(input: LoadInput): { config: Config; warnings: string[] } {
  const warnings: string[] = [];
  const userPath = userConfigPath(input.env, input.home);
  const user = load(userPath, input.readText(userPath), warnings, {});
  const found = findRepoFile(input.cwd, input.readText);
  const repo = found ? load(found.path, found.text, warnings, { ask: ["*"] }) : {};
  for (const key of USER_ONLY) {
    if (found && repo[key])
      warnings.push(`${found.path}: ignored \`${key}\`; set it in ${userPath}`);
  }
  const config: Config = {
    user: { allow: user.allow ?? [], ask: user.ask ?? [], deny: user.deny ?? [] },
    repo: { ask: repo.ask ?? [], deny: repo.deny ?? [] },
    timeoutSeconds: Math.min(
      user.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
      repo.timeoutSeconds ?? MAX_TIMEOUT_SECONDS,
    ),
    fileFlags: [...new Set([...DEFAULT_FILE_FLAGS, ...(user.fileFlags ?? [])])],
    scanFiles: user.scanFiles ?? [],
    observers: user.observers ?? [],
  };
  return { config, warnings };
}
