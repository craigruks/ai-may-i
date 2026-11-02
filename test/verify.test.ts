// Proves `may-i verify` re-judges receipts from their events: it passes what the gate
// really writes, and flags a spawn without approval, a refusal that ran, a logged value.
import { describe, expect, it } from "bun:test";
import type { EventBody, GateEvent } from "../src/events.js";
import { gate } from "../src/gate.js";
import { type Receipt, receiptWriter } from "../src/receipts.js";
import { verify } from "../src/verify.js";
import { fakePrompt, harness } from "./support/harness.js";

function written(answer: "approve" | "deny", command = ["op", "read", "op://Prod/db/pw"]): Receipt {
  const lines: string[] = [];
  const h = harness({ prompt: fakePrompt({ answer, via: "dialog", detail: null }) });
  h.deps.events.subscribe(receiptWriter({ open() {}, append: (l) => lines.push(l) }));
  gate({ command }, h.deps);
  return JSON.parse(lines[0] ?? "{}");
}

const add = (r: Receipt, ...bodies: EventBody[]): Receipt => ({
  ...r,
  events: [...r.events, ...bodies.map((b): GateEvent => ({ ...b, id: r.id, at: r.at }))],
});
const drop = (r: Receipt, type: string): Receipt => ({
  ...r,
  events: r.events.filter((e) => e.type !== type),
});

describe("verify", () => {
  it("passes every receipt the gate really writes", () => {
    const real = [
      written("approve"),
      written("deny"),
      written("approve", ["op", "read", "op://Prod/root/k"]),
    ];
    expect(verify(real)).toEqual([]);
  });

  it.each<[string, () => Receipt, string]>([
    [
      "a spawn without an Approve",
      () => drop(drop(written("approve"), "answered"), "asked"),
      "spawned on the ask tier without an Approve",
    ],
    [
      "a refusal that ran",
      () => add(written("deny"), { type: "spawned", program: "op" }, { type: "exited", code: 0 }),
      "was refused, yet it ran",
    ],
    [
      "a logged value",
      () => ({ ...written("deny"), reason: "use ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8" }),
      "holds a value that looks like a secret at reason",
    ],
    [
      "a summary that lies",
      () => ({ ...written("deny"), outcome: "ran" }),
      "says outcome unlike its own events",
    ],
    ["a request that never ended", () => drop(written("approve"), "exited"), "never ended"],
  ])("flags %s", (_, receipt, problem) => {
    expect(verify([receipt()]).map((f) => f.problem)).toContain(problem);
  });
});
