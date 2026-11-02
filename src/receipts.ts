/**
 * One JSONL line per request, built from its events: who asked, what it
 * reached, how it was decided, and how it ended. Evidence, not conclusions, so
 * `may-i verify` can re-judge every request later from the events themselves.
 *
 * It is a subscriber like any other. What makes it able to stop a run is the
 * gate's rule that a subscriber failing before the spawn refuses it: the
 * receipt file is opened at `allowed`, so a file that cannot be written stops
 * the command before it starts, and an approval nobody can check never runs.
 */

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { ENDS_REQUEST, type GateEvent, type Subscriber, type Tier } from "./events.js";

export interface Receipt {
  id: string;
  at: string;
  agent: string | null;
  command: string | null;
  reason: string | null;
  tier: Tier | null;
  outcome: "ran" | "refused";
  /** The command's exit code when it ran. */
  code: number | null;
  /** Why it was refused, when it was. */
  why: string | null;
  events: GateEvent[];
}

export function receiptFrom(events: readonly GateEvent[]): Receipt {
  const first = events[0];
  if (!first) throw new TypeError("a receipt needs at least one event");
  const find = <T extends GateEvent["type"]>(type: T) =>
    events.find((e): e is Extract<GateEvent, { type: T }> => e.type === type);
  const requested = find("requested");
  const exited = find("exited");
  return {
    id: first.id,
    at: first.at,
    agent: requested?.agent ?? null,
    command: requested?.command ?? null,
    reason: requested?.reason ?? null,
    tier: find("tier-decided")?.tier ?? null,
    outcome: exited ? "ran" : "refused",
    code: exited?.code ?? null,
    why: find("refused")?.why ?? null,
    events: [...events],
  };
}

export interface ReceiptSink {
  /** Throws when the receipt could not be written later. */
  open(): void;
  append(line: string): void;
}

/** Gathers each request's events and hands over its receipt when it ends. */
export function onReceipt(handle: (receipt: Receipt) => void): Subscriber {
  const pending = new Map<string, GateEvent[]>();
  return (event) => {
    const events = [...(pending.get(event.id) ?? []), event];
    if (!ENDS_REQUEST[event.type]) {
      pending.set(event.id, events);
      return;
    }
    pending.delete(event.id);
    handle(receiptFrom(events));
  };
}

export function receiptWriter(sink: ReceiptSink): Subscriber {
  const write = onReceipt((receipt) => {
    sink.open();
    sink.append(JSON.stringify(receipt));
  });
  return (event) => {
    if (event.type === "allowed") sink.open();
    write(event);
  };
}

export function receiptsPath(env: Readonly<Record<string, string | undefined>>, home: string) {
  return join(env.XDG_STATE_HOME || join(home, ".local", "state"), "may-i", "receipts.jsonl");
}

/** Owner-only, since a receipt says what was reached and by whom. */
export function fileSink(path: string): ReceiptSink {
  let fd: number | null = null;
  return {
    open() {
      if (fd !== null) return;
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      fd = openSync(path, "a", 0o600);
    },
    append(line) {
      if (fd === null) throw new Error(`${path} was never opened`);
      writeSync(fd, `${line}\n`);
      closeSync(fd);
      fd = null;
    },
  };
}
