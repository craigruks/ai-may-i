/**
 * The macOS dialog. Every call to the system goes through `MacShell`, so the
 * flow is tested on Linux with a fake that answers the way osascript does.
 */

import { spawnSync } from "node:child_process";
import { appleScriptString } from "./applescript.js";
import { type Prompt, type PromptAnswer, type Question, renderQuestion } from "./prompt.js";

export interface ShellResult {
  /** null when the helper was killed, by its timeout or otherwise. */
  status: number | null;
  stdout: string;
}

export interface MacShell {
  run(bin: string, args: readonly string[], timeoutMs: number): ShellResult;
}

export const systemShell: MacShell = {
  run(bin, args, timeoutMs) {
    const res = spawnSync(bin, [...args], { encoding: "utf8", timeout: timeoutMs });
    return { status: res.status, stdout: res.stdout ?? "" };
  },
};

/** By absolute path: the gated agent sets PATH, and an `osascript` of its own
 *  that prints "button returned:Approve" would approve itself. */
export const OSASCRIPT = "/usr/bin/osascript";
export const TITLE = "may-i: approve production access";

/** Headroom over the dialog's own timeout, so the dialog gives up (and says
 *  so) before the helper is killed (which would only say it failed). */
export const HELPER_GRACE_MS = 15_000;

/**
 * No `default button` and no `cancel button`, so neither Return nor Escape
 * answers it: a keystroke already in flight when the window appears presses
 * nothing. `giving up after` makes silence an answer, and the answer is no.
 */
export function dialogScript(q: Question): string {
  return [
    `display dialog ${appleScriptString(renderQuestion(q))}`,
    `with title ${appleScriptString(TITLE)}`,
    'buttons {"Deny", "Approve"}',
    "with icon caution",
    `giving up after ${q.timeoutSeconds}`,
  ].join(" ");
}

const ANSWER = /^button returned:(Approve|Deny|), gave up:(true|false)$/;

/** Only the exact line osascript prints for a click on Approve approves. */
export function readDialog(res: ShellResult): PromptAnswer {
  const via = "dialog";
  if (res.status !== 0) {
    const detail = res.status === null ? "osascript was killed" : `osascript exited ${res.status}`;
    return { answer: "error", via, detail };
  }
  const match = ANSWER.exec(res.stdout.trim());
  if (!match) return { answer: "error", via, detail: "unreadable answer from the dialog" };
  if (match[2] === "true") return { answer: "timeout", via, detail: null };
  return { answer: match[1] === "Approve" ? "approve" : "deny", via, detail: null };
}

export function askWithDialog(shell: MacShell, q: Question): PromptAnswer {
  const timeoutMs = q.timeoutSeconds * 1000 + HELPER_GRACE_MS;
  return readDialog(shell.run(OSASCRIPT, ["-e", dialogScript(q)], timeoutMs));
}

export function dialogPrompt(shell: MacShell): Prompt {
  return { unavailable: null, ask: (q) => askWithDialog(shell, q) };
}
