/**
 * Your own command, run on the events you name: a sound on `asked`, a chat
 * message on `refused`, a copy of every receipt shipped somewhere central.
 *
 * Observers watch and never decide. Each gets the event as JSON on stdin and
 * nothing else: not the token, which no event carries, and no say in the
 * outcome, since its exit code and output are ignored. One that fails or hangs
 * becomes an `observer-failed` event, so the receipt records it, and the run
 * goes on as if it were not there. A failure on the event that ends a request
 * comes after that request's receipt is written, so it reaches stderr instead.
 *
 * They come from the user's config only. A repo file naming one would let the
 * agent being gated choose a command that runs on every request.
 */

import { spawnSync } from "node:child_process";
import type { Emitter, EventType, GateEvent, Subscriber } from "./events.js";
import { ENDS_REQUEST } from "./events.js";

export interface Observer {
  /** Event types, or "*" for all of them. */
  on: readonly string[];
  run: readonly string[];
}

/** Runs one observer with `input` on stdin; says why it failed, or null. */
export type Runner = (argv: readonly string[], input: string, timeoutMs: number) => string | null;

/** Long enough for a webhook, short enough that a hung one cannot hold a prompt back for long. */
export const OBSERVER_TIMEOUT_MS = 5_000;

export const systemRunner: Runner = (argv, input, timeoutMs) => {
  const [bin = "", ...args] = argv;
  const res = spawnSync(bin, args, {
    input,
    timeout: timeoutMs,
    stdio: ["pipe", "ignore", "ignore"],
  });
  if (res.error) return res.error.message;
  if (res.status !== 0)
    return res.status === null ? "it was killed or timed out" : `it exited ${res.status}`;
  return null;
};

const KNOWN = new Set<string>([...Object.keys(ENDS_REQUEST), "*"]);
const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

export function parseObservers(value: unknown): Observer[] | string {
  if (!Array.isArray(value)) return "`observers` must be a list";
  const out: Observer[] = [];
  for (const o of value) {
    if (typeof o !== "object" || o === null || !("on" in o) || !("run" in o)) {
      return "each observer needs `on` and `run`";
    }
    if (!isStringList(o.on) || o.on.some((t: string) => !KNOWN.has(t))) {
      return `an observer's \`on\` must list event types: ${[...KNOWN].join(", ")}`;
    }
    if (!isStringList(o.run) || o.run.length === 0)
      return "an observer's `run` must be a non-empty list";
    out.push({ on: o.on, run: o.run });
  }
  return out;
}

const watches = (o: Observer, type: EventType) => o.on.includes("*") || o.on.includes(type);

export function observe(observers: readonly Observer[], run: Runner, events: Emitter): Subscriber {
  return (event: GateEvent) => {
    // Never on its own failures, which would loop on an observer that always fails.
    if (event.type === "observer-failed") return;
    for (const o of observers.filter((o) => watches(o, event.type))) {
      let why: string | null;
      try {
        why = run(o.run, JSON.stringify(event), OBSERVER_TIMEOUT_MS);
      } catch (err) {
        why = err instanceof Error ? err.message : String(err);
      }
      if (why === null) continue;
      events.emit({
        type: "observer-failed",
        id: event.id,
        at: event.at,
        observer: o.run[0] ?? "",
        on: event.type,
        why,
      });
    }
  };
}
