/**
 * A copy of each receipt, as one line, in the system log: macOS unified logging
 * shows it in Console.app, and an MDM that collects logs collects it too. The
 * JSONL receipts stay the record; this is the copy that leaves the Mac without
 * anyone setting up an observer.
 *
 * It is written when a request has ended, after the decision, so a failure here
 * is reported and changes nothing.
 */

import type { MacShell } from "./dialog.js";
import type { Subscriber } from "./events.js";
import { onReceipt, type Receipt } from "./receipts.js";

export interface SystemLog {
  write(line: string): void;
}

/** By absolute path, for the same reason as osascript: the agent sets PATH. */
export const LOGGER = "/usr/bin/logger";

export function loggerLog(shell: MacShell): SystemLog {
  return {
    write(line) {
      const res = shell.run(LOGGER, ["-t", "may-i", line], 5_000);
      if (res.status !== 0) throw new Error(`logger exited ${res.status}`);
    },
  };
}

/** key="value" pairs, JSON-quoted so a newline in an agent's reason stays one line. */
export function summary(r: Receipt): string {
  const fields: [string, string | number | null][] = [
    ["agent", r.agent],
    ["tier", r.tier],
    [r.outcome === "ran" ? "code" : "why", r.outcome === "ran" ? r.code : r.why],
    ["command", r.command],
    ["reason", r.reason],
  ];
  const pairs = fields.filter(([, v]) => v !== null).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return [r.id, r.outcome, ...pairs].join(" ");
}

export function systemLogWriter(log: SystemLog): Subscriber {
  return onReceipt((receipt) => log.write(summary(receipt)));
}
