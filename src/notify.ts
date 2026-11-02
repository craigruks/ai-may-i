/**
 * Announce with a notification first, then ask with the dialog.
 *
 * A modal that appears while someone is typing takes focus and catches the
 * keystroke in flight. The dialog has no default button, so a stray Return
 * cannot approve, but it still should not be the thing that interrupts. A
 * notification takes no focus; clicking it opens the dialog. Without `alerter`
 * the dialog opens directly, and says how to get the gentler path.
 *
 * The notification can only open the dialog, never approve. So an `alerter`
 * found through the agent's own PATH is safe to run: at worst it skips straight
 * to the dialog, which is still the one osascript at its fixed path.
 */

import {
  askWithDialog,
  HELPER_GRACE_MS,
  type MacShell,
  type ShellResult,
  TITLE,
} from "./dialog.js";
import type { Prompt, PromptAnswer, Question } from "./prompt.js";

export const INSTALL_HINT =
  "may-i: no `alerter` on PATH, so the dialog opens straight away and takes focus. For a notification first: brew install vjeantet/tap/alerter";

function findAlerter(shell: MacShell): string | null {
  const res = shell.run("/usr/bin/which", ["alerter"], 5_000);
  const path = res.stdout.trim();
  return res.status === 0 && path ? path : null;
}

const short = (text: string, max = 80) =>
  text.length > max ? `${text.slice(0, max - 3)}...` : text;

/** Each value is one argv entry and no shell is involved, so nothing here needs escaping. */
export function notificationArgs(q: Question): string[] {
  const n = q.references.length;
  const reach = n === 0 ? "unknown references" : `${n} ${n === 1 ? "reference" : "references"}`;
  return [
    ["--title", TITLE],
    ["--message", `${q.agent} · ${short(q.command)} · ${reach}`],
    ["--actions", "Review"],
    ["--sound", "default"],
    ["--timeout", String(q.timeoutSeconds)],
    // One group per request, so a retry replaces its own stale notification.
    ["--group", `may-i-${q.id}`],
  ].flat();
}

const OPENS = new Set(["@CONTENTCLICKED", "@ACTIONCLICKED", "Review"]);

/** "open" when the person clicked through to the dialog; otherwise how it ended. */
export function readNotification(res: ShellResult): "open" | PromptAnswer {
  const via = "notification";
  if (res.status !== 0) return { answer: "error", via, detail: `alerter exited ${res.status}` };
  const said = res.stdout.trim();
  if (OPENS.has(said)) return "open";
  if (said === "@TIMEOUT") return { answer: "timeout", via, detail: null };
  if (said === "@CLOSED") return { answer: "closed", via, detail: null };
  return { answer: "error", via, detail: `unexpected answer from alerter: ${short(said, 40)}` };
}

export function macPrompt(shell: MacShell, log: (line: string) => void): Prompt {
  return {
    unavailable: null,
    ask(q) {
      const alerter = findAlerter(shell);
      if (!alerter) {
        log(INSTALL_HINT);
        return askWithDialog(shell, q);
      }
      log(`may-i: waiting for approval; click the notification (${q.timeoutSeconds} s)`);
      const timeoutMs = q.timeoutSeconds * 1000 + HELPER_GRACE_MS;
      const opened = readNotification(shell.run(alerter, notificationArgs(q), timeoutMs));
      if (opened !== "open") return opened;
      return { ...askWithDialog(shell, q), via: "notification+dialog" };
    },
  };
}
