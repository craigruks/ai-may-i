// Proves the notification comes first when alerter is there, can only open the dialog
// (never approve), and that a lapsed or closed notification ends the request unasked.
import { describe, expect, it } from "bun:test";
import { type MacShell, OSASCRIPT, type ShellResult } from "../src/dialog.js";
import type { Answer } from "../src/events.js";
import { INSTALL_HINT, macPrompt, notificationArgs } from "../src/notify.js";
import type { Question } from "../src/prompt.js";

const question: Question = {
  id: "r1",
  agent: "claude-code:bc3851a2",
  command: "op run --env-file .env.prod -- ./deploy.sh",
  reason: null,
  references: ["op://Prod/cloudflare/token"],
  unreadable: [],
  cwd: "/work/feat-checkout",
  timeoutSeconds: 60,
};

const ALERTER = "/opt/homebrew/bin/alerter";
const APPROVE: ShellResult = { status: 0, stdout: "button returned:Approve, gave up:false\n" };

/** A scripted Mac: each program answers from a table, and every call is kept. */
function fakeMac(answers: Record<string, ShellResult>): MacShell & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    run(bin) {
      calls.push(bin);
      return answers[bin] ?? { status: 127, stdout: "" };
    },
  };
}
const withAlerter = (said: string) =>
  fakeMac({
    "/usr/bin/which": { status: 0, stdout: `${ALERTER}\n` },
    [ALERTER]: { status: 0, stdout: `${said}\n` },
    [OSASCRIPT]: APPROVE,
  });

describe("macPrompt", () => {
  it("opens the dialog only after the notification is clicked", () => {
    const mac = withAlerter("@CONTENTCLICKED");
    expect(macPrompt(mac, () => {}).ask(question)).toEqual({
      answer: "approve",
      via: "notification+dialog",
      detail: null,
    });
    expect(mac.calls).toEqual(["/usr/bin/which", ALERTER, OSASCRIPT]);
  });

  it.each<[string, Answer]>([
    ["@TIMEOUT", "timeout"],
    ["@CLOSED", "closed"],
    ["something new", "error"],
  ])("ends on %s without ever showing the dialog", (said, answer) => {
    const mac = withAlerter(said);
    expect(macPrompt(mac, () => {}).ask(question).answer).toBe(answer);
    expect(mac.calls).not.toContain(OSASCRIPT);
  });

  it("falls back to the dialog without alerter, and says how to get it", () => {
    const mac = fakeMac({ "/usr/bin/which": { status: 1, stdout: "" }, [OSASCRIPT]: APPROVE });
    const lines: string[] = [];
    expect(macPrompt(mac, (l) => lines.push(l)).ask(question).via).toBe("dialog");
    expect(mac.calls).toEqual(["/usr/bin/which", OSASCRIPT]);
    expect(lines).toEqual([INSTALL_HINT]);
  });
});

describe("notificationArgs", () => {
  it("names who, what and how much in the notification itself, and lapses on its own", () => {
    const args = notificationArgs(question);
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(value("--message")).toBe(
      "claude-code:bc3851a2 · op run --env-file .env.prod -- ./deploy.sh · 1 reference",
    );
    expect(value("--timeout")).toBe("60");
    expect(value("--group")).toBe("may-i-r1");
  });
});
