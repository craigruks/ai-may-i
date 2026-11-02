// Proves the hook routes every op/varlock call an agent types through may-i, leaves
// everything else alone, speaks Claude Code's PreToolUse JSON, and fails closed.
// What it catches, and the evasions it cannot see, are the `caught` cases in
// spec/hook-lex.json, pinned so nobody mistakes it for a wall.
import { describe, expect, it } from "bun:test";
import spec from "../spec/hook-lex.json" with { type: "json" };
import { hookResponse, runHook, ungated } from "../src/hook.js";

const caught = (line: string) => ungated(line).length > 0;

interface LexCase {
  name: string;
  line: string;
  caught: boolean;
}
const cases: LexCase[] = spec.cases;

describe("ungated", () => {
  it.each(cases)("$name", ({ line, caught: expected }) => {
    expect(caught(line)).toBe(expected);
  });
});

const call = (command: string, tool = "Bash") => ({
  session_id: "bc3851a2-3667-4d1e-9a1f-1234",
  transcript_path: "/home/u/.claude/projects/x/transcript.jsonl",
  cwd: "/work/repo",
  permission_mode: "default",
  hook_event_name: "PreToolUse",
  tool_name: tool,
  tool_input: { command, description: "Read it", timeout: 120000, run_in_background: false },
  tool_use_id: "toolu_01ABC",
});
const output = (command: string, mode: "block" | "wrap", gate?: string) =>
  JSON.parse(hookResponse(call(command), mode, gate).stdout).hookSpecificOutput;

describe("hookResponse", () => {
  it("stays silent for other tools and ordinary commands", () => {
    const silent = { code: 0, stdout: "", stderr: "" };
    expect(hookResponse(call("op read x", "Read"), "block")).toEqual(silent);
    expect(hookResponse(call("ls"), "block")).toEqual(silent);
  });

  it("denies in block mode and hands Claude the gated command, which itself passes", () => {
    const out = output("FOO=1 op read op://v/i/f | wc -c", "block");
    expect(out).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny" });
    const suggested = out.permissionDecisionReason.split("\n").at(-1);
    expect(suggested).toBe(
      "may-i --agent claude-code:bc3851a2 -- bash -c 'FOO=1 op read op://v/i/f | wc -c'",
    );
    expect(caught(suggested)).toBe(false);
  });

  it("rewrites in wrap mode, keeping every other tool_input field, since it replaces them all", () => {
    expect(output("op read op://v/i/f", "wrap", "bunx may-i")).toMatchObject({
      permissionDecision: "allow",
      updatedInput: {
        command: "bunx may-i --agent claude-code:bc3851a2 -- op read op://v/i/f",
        description: "Read it",
        timeout: 120000,
        run_in_background: false,
      },
    });
  });

  it.each([
    ["not JSON", [], "{"],
    ["not an object", [], "[]"],
    ["a Bash call without a command", [], '{"tool_name":"Bash","tool_input":{}}'],
    ["an unknown option", ["--wrapp"], JSON.stringify(call("ls"))],
  ])("blocks with exit 2 on %s", (_, argv, stdin) => {
    expect(runHook(argv, stdin).code).toBe(2);
  });
});
