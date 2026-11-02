/**
 * `may-i verify`: judge every request again, after the fact, from its receipt.
 *
 * Nothing in a receipt is taken on its word. The summary fields are rebuilt
 * from the events and compared; the events are run through the same tripwires
 * the gate runs inline; every string is redacted again, and one that changes
 * was a secret-looking value written to disk.
 */

import type { GateEvent } from "./events.js";
import { type Receipt, receiptFrom } from "./receipts.js";
import { redactText } from "./redact.js";
import { scan } from "./tripwires.js";

export interface Finding {
  id: string;
  problem: string;
}

/** Every string in a receipt, with where it sits: `reason`, `events.3.why`. */
function strings(value: unknown, at: string): [string, string][] {
  if (typeof value === "string") return [[at, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => strings(v, at ? `${at}.${k}` : k));
}

function summaryProblems(r: Receipt): string[] {
  if (r.events.length === 0) return ["has no events"];
  const rebuilt = receiptFrom(r.events);
  const fields = ["outcome", "code", "tier", "why", "command", "agent"] as const;
  const differ = fields.filter((f) => rebuilt[f] !== r[f]);
  const ids = r.events.filter((e: GateEvent) => e.id !== r.id).length;
  return [
    ...(differ.length ? [`says ${differ.join(", ")} unlike its own events`] : []),
    ...(ids ? [`holds ${ids} event(s) from another request`] : []),
  ];
}

function receiptProblems(r: Receipt): string[] {
  const ran = r.events.some((e) => e.type === "spawned");
  const ended = r.events.at(-1)?.type;
  return [
    ...summaryProblems(r),
    ...scan(r.events).map((trip) => trip.slice(trip.indexOf(": ") + 2)),
    ...(r.outcome === "refused" && ran ? ["was refused, yet it ran"] : []),
    ...(ended !== "refused" && ended !== "exited" ? ["never ended"] : []),
    ...strings(r, "")
      .filter(([, s]) => redactText(s) !== s)
      .map(([at]) => `holds a value that looks like a secret at ${at}`),
  ];
}

export function verify(receipts: readonly Receipt[]): Finding[] {
  return receipts.flatMap((r) => receiptProblems(r).map((problem) => ({ id: r.id, problem })));
}
