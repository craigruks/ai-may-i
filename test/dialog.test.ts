// Proves the dialog says what is being approved, cannot be answered by a stray key,
// treats silence as no, and approves only on the exact answer osascript gives for Approve.
import { describe, expect, it } from "bun:test";
import {
  dialogPrompt,
  dialogScript,
  HELPER_GRACE_MS,
  type MacShell,
  OSASCRIPT,
  readDialog,
  type ShellResult,
} from "../src/dialog.js";
import type { Answer } from "../src/events.js";
import { type Question, renderQuestion } from "../src/prompt.js";

const question: Question = {
  id: "r1",
  agent: "claude-code:bc3851a2",
  command: "op run --env-file .env.prod -- ./deploy.sh",
  reason: "ship the checkout fix",
  references: ["op://Prod/cloudflare/token", "op://Prod/stripe/secret"],
  unreadable: [],
  cwd: "/work/feat-checkout",
  timeoutSeconds: 120,
};

describe("renderQuestion", () => {
  const lines = renderQuestion(question).split("\n");

  it("leads with the command, then who asked, from where, and why in the agent's words", () => {
    expect(lines.slice(0, 5)).toEqual([
      question.command,
      "",
      "Asked by claude-code:bc3851a2",
      "In feat-checkout",
      'The agent says: "ship the checkout fix"',
    ]);
  });

  it("lists each reference on its own line, and says what Approve hands over", () => {
    expect(lines).toContain("  - op://Prod/cloudflare/token");
    expect(lines).toContain("  - op://Prod/stripe/secret");
    expect(lines.at(-1)).toBe("Approve gives this one command the production token.");
  });

  it("truncates a long list with a count, never silently", () => {
    const many = Array.from({ length: 20 }, (_, i) => `op://Prod/item-${i}/f`);
    expect(renderQuestion({ ...question, references: many })).toContain("... and 8 more");
  });

  it("warns when it cannot say what the command reaches", () => {
    const text = renderQuestion({ ...question, references: [], unreadable: [".env.prod"] });
    expect(text).toContain("No 1Password reference could be read");
    expect(text).toContain("Could not read .env.prod");
  });
});

describe("dialogScript", () => {
  const script = dialogScript(question);

  it("offers Deny and Approve with neither as a default or cancel button", () => {
    expect(script).toContain('buttons {"Deny", "Approve"}');
    expect(script).not.toMatch(/default button|cancel button/);
  });

  it("gives up on its own after the timeout", () => {
    expect(script).toEndWith("giving up after 120");
  });
});

describe("readDialog", () => {
  it.each<[string, ShellResult, Answer]>([
    [
      "a click on Approve",
      { status: 0, stdout: "button returned:Approve, gave up:false\n" },
      "approve",
    ],
    ["a click on Deny", { status: 0, stdout: "button returned:Deny, gave up:false\n" }, "deny"],
    ["a dialog that gave up", { status: 0, stdout: "button returned:, gave up:true\n" }, "timeout"],
    [
      "Approve with gave up:true",
      { status: 0, stdout: "button returned:Approve, gave up:true" },
      "timeout",
    ],
    ["anything else on stdout", { status: 0, stdout: "button returned:Approve\nextra" }, "error"],
    [
      "a failed osascript",
      { status: 1, stdout: "button returned:Approve, gave up:false" },
      "error",
    ],
    ["a killed osascript", { status: null, stdout: "" }, "error"],
  ])("reads %s as %s", (_, res, answer) => {
    expect(readDialog(res).answer).toBe(answer);
  });
});

describe("dialogPrompt", () => {
  it("runs osascript by absolute path, and outlives the dialog's own timeout", () => {
    const calls: [string, number][] = [];
    const shell: MacShell = {
      run(bin, _args, timeoutMs) {
        calls.push([bin, timeoutMs]);
        return { status: 0, stdout: "button returned:Deny, gave up:false" };
      },
    };
    expect(dialogPrompt(shell).ask(question)).toEqual({
      answer: "deny",
      via: "dialog",
      detail: null,
    });
    expect(calls).toEqual([[OSASCRIPT, 120_000 + HELPER_GRACE_MS]]);
  });
});
