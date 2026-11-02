/**
 * The Claude Code `PreToolUse` hook: a Bash call that reaches 1Password goes
 * through may-i, or does not run.
 *
 * It guards against an agent that forgets, not one that is hostile: a program
 * behind a variable or inside a script file is out of its sight (see
 * hook-lex.ts). It exists so the ordinary path, an agent typing `op read`,
 * cannot reach 1Password without being named and, for prod, asked.
 *
 * Shapes follow https://code.claude.com/docs/en/hooks: the call arrives on
 * stdin with `tool_name` and `tool_input`; a decision goes out as
 * `hookSpecificOutput.permissionDecision`; `updatedInput` replaces the whole
 * tool input; exit 2 blocks the call, with stderr as the reason.
 */

import { type Program, programsIn, TOO_DEEP } from "./hook-lex.js";

export type HookMode = "block" | "wrap";

export interface HookResult {
  code: number;
  stdout: string;
  stderr: string;
}

export const GATE = "may-i";
/** Listing the harmless subcommands rather than the dangerous ones means a new
 *  `op` subcommand is gated from the day it ships. */
const HARMLESS = new Set(["--version", "-v", "--help", "-h", "help", "completion"]);

function reachesVault(p: Program): boolean {
  if (p.name === TOO_DEEP) return true;
  if (p.name !== "op" && p.name !== "varlock") return false;
  const sub = p.words[1];
  return sub === undefined ? p.name === "varlock" : !HARMLESS.has(sub);
}

/** The programs on this line that reach 1Password without may-i in front. */
export function ungated(line: string): Program[] {
  return programsIn(line).filter((p) => reachesVault(p) && !p.behind.includes(GATE));
}

/** The same command behind the gate. A lone `op …` keeps its shape; anything
 *  compound goes through `bash -c`, so the gate stands in front of every part. */
export function gatedForm(line: string, agent: string, gate = GATE): string {
  const prefix = `${gate} --agent ${agent} --`;
  const programs = programsIn(line);
  const [only] = programs;
  if (programs.length === 1 && only && only.behind.length === 0 && line === only.words.join(" ")) {
    return `${prefix} ${line.trim()}`;
  }
  return `${prefix} bash -c '${line.replaceAll("'", `'\\''`)}'`;
}

const PASS: HookResult = { code: 0, stdout: "", stderr: "" };

/** Exit 2: a call it cannot read might be a command it cannot see. */
const block = (message: string): HookResult => ({
  code: 2,
  stdout: "",
  stderr: `may-i hook: ${message}`,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function hookResponse(input: unknown, mode: HookMode, gate = GATE): HookResult {
  if (!isObject(input)) return block("expected a JSON object on stdin");
  if (input.tool_name !== "Bash") return PASS;
  const toolInput = input.tool_input;
  if (!isObject(toolInput) || typeof toolInput.command !== "string") {
    return block("a Bash call without a tool_input.command string");
  }
  const command = toolInput.command;
  // Silence is not approval: the normal permission flow still runs.
  if (ungated(command).length === 0) return PASS;

  const session = typeof input.session_id === "string" ? input.session_id : "";
  const id = session.replace(/[^\w-]/g, "").slice(0, 8);
  const gated = gatedForm(command, id ? `claude-code:${id}` : "claude-code", gate);
  // `allow` with the rewritten input: may-i asks the person itself for the ask
  // tier, and Claude Code still applies its own deny and ask rules on top.
  const output =
    mode === "wrap"
      ? {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: "routed through may-i, which asks for prod access itself",
          updatedInput: { ...toolInput, command: gated },
        }
      : {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `This reaches 1Password without may-i, so it did not run. Run it as:\n${gated}`,
        };
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: output }), stderr: "" };
}

/** `--wrap` rewrites instead of blocking; `--gate "<command>"` says how to call
 *  may-i where it is not on PATH. Anything else is a mistake worth stopping on. */
export function parseHookArgs(argv: readonly string[]): { mode: HookMode; gate: string } | string {
  let mode: HookMode = "block";
  let gate = GATE;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--wrap") mode = "wrap";
    else if (arg === "--gate" && argv[i + 1]?.trim()) gate = (argv[++i] ?? "").trim();
    else return `unknown option ${arg}`;
  }
  return { mode, gate };
}

export function runHook(argv: readonly string[], stdin: string): HookResult {
  const args = parseHookArgs(argv);
  if (typeof args === "string") return block(args);
  let input: unknown;
  try {
    input = JSON.parse(stdin);
  } catch (err) {
    return block(`unreadable input (${err instanceof Error ? err.message : String(err)})`);
  }
  return hookResponse(input, args.mode, args.gate);
}
