// Proves how may-i reads its own options: everything up to `--` is may-i's, everything
// after it is the command, untouched, and a mistake is an error, never a program to run.
import { describe, expect, it } from "bun:test";
import { parseArgs } from "../src/args.js";
import { MAX_TIMEOUT_SECONDS } from "../src/config.js";

const CMD = ["op", "read", "op://Prod/db/password"];

describe("parseArgs", () => {
  it("takes the options before -- and the command after it", () => {
    expect(
      parseArgs(["--agent", "codex-1", "--reason", "rotate", "--timeout", "30", "--", ...CMD]),
    ).toEqual({
      kind: "run",
      agent: "codex-1",
      reason: "rotate",
      timeoutSeconds: 30,
      command: CMD,
    });
  });

  it("accepts --option=value", () => {
    expect(parseArgs(["--agent=codex-1", "--reason=a = b", "--timeout=5", "--", ...CMD])).toEqual({
      kind: "run",
      agent: "codex-1",
      reason: "a = b",
      timeoutSeconds: 5,
      command: CMD,
    });
  });

  it("leaves everything after the first -- to the command, its own options and -- too", () => {
    const command = ["op", "run", "--env-file", ".env.prod", "--", "./deploy.sh", "--help"];
    expect(parseArgs(["--", ...command])).toEqual({ kind: "run", command });
  });

  it("lets a later option win over an earlier one", () => {
    expect(parseArgs(["--agent", "a", "--agent", "b", "--", ...CMD])).toMatchObject({ agent: "b" });
  });

  it.each<[string[], "help" | "version"]>([
    [["-h"], "help"],
    [["--help"], "help"],
    [["-v"], "version"],
    [["--version"], "version"],
    [["--agent", "codex-1", "--help"], "help"],
  ])("reads %j as %s", (argv, kind) => {
    expect(parseArgs(argv)).toEqual({ kind });
  });

  it.each([
    [["1"], 1],
    [[String(MAX_TIMEOUT_SECONDS)], MAX_TIMEOUT_SECONDS],
  ])("takes --timeout %j", ([raw], seconds) => {
    expect(parseArgs(["--timeout", raw ?? "", "--", ...CMD])).toMatchObject({
      timeoutSeconds: seconds,
    });
  });

  it.each([
    [[], "nothing to run: expected -- <command…>"],
    [["--"], "nothing to run after --"],
    [CMD, "put -- before the command: op"],
    [["--yes", "--", ...CMD], "unknown option --yes"],
    [["--reason"], "--reason needs a value"],
    [["--agent", "codex-1"], "nothing to run: expected -- <command…>"],
    [["--timeout", "0", "--", ...CMD], '--timeout takes whole seconds from 1 to 600, not "0"'],
    [["--timeout", "601", "--", ...CMD], '--timeout takes whole seconds from 1 to 600, not "601"'],
    [["--timeout", "1.5", "--", ...CMD], '--timeout takes whole seconds from 1 to 600, not "1.5"'],
    [["--timeout=", "--", ...CMD], '--timeout takes whole seconds from 1 to 600, not ""'],
  ])("rejects %j", (argv, message) => {
    expect(parseArgs(argv)).toEqual({ kind: "error", message });
  });
});
