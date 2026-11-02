// Proves each request leaves one plain line in the system log, through /usr/bin/logger,
// that a log reader can grep, and that the line can never span two log entries.
import { describe, expect, it } from "bun:test";
import type { MacShell } from "../src/dialog.js";
import { gate } from "../src/gate.js";
import { LOGGER, loggerLog, type SystemLog, systemLogWriter } from "../src/syslog.js";
import { fakePrompt, harness } from "./support/harness.js";

function memoryLog(): SystemLog & { lines: string[] } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

function logged(answer: "approve" | "deny", reason?: string): string[] {
  const log = memoryLog();
  const h = harness({ prompt: fakePrompt({ answer, via: "dialog", detail: null }) });
  h.deps.events.subscribe(systemLogWriter(log));
  gate({ command: ["op", "read", "op://Prod/db/password"], agent: "codex-1", reason }, h.deps);
  return log.lines;
}

describe("systemLogWriter", () => {
  it("writes one line when a request runs, and one when it is refused", () => {
    expect(logged("approve")).toEqual([
      'r1 ran agent="codex-1" tier="ask" code=0 command="op read op://Prod/db/password"',
    ]);
    expect(logged("deny")).toEqual([
      'r1 refused agent="codex-1" tier="ask" why="not approved: deny" command="op read op://Prod/db/password"',
    ]);
  });

  it("keeps a multi-line reason on one line", () => {
    const [line] = logged("approve", "first\nsecond");
    expect(line).toContain('reason="first\\nsecond"');
    expect(line).not.toContain("\n");
  });
});

describe("loggerLog", () => {
  it("tags the line may-i and passes it as one argv entry, through logger at its fixed path", () => {
    const calls: string[][] = [];
    const shell: MacShell = {
      run(bin, args) {
        calls.push([bin, ...args]);
        return { status: 0, stdout: "" };
      },
    };
    loggerLog(shell).write("r1 ran");
    expect(calls).toEqual([[LOGGER, "-t", "may-i", "r1 ran"]]);
  });
});
