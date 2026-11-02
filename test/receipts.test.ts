// Proves every request leaves exactly one receipt that can be re-judged from its events,
// and that a receipt which cannot be written stops the command before it runs.
import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gate } from "../src/gate.js";
import { fileSink, type ReceiptSink, receiptWriter } from "../src/receipts.js";
import { fakePrompt, harness } from "./support/harness.js";

const PROD = ["op", "read", "op://Prod/db/password"];

function memorySink(failOpen = false): ReceiptSink & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    open() {
      if (failOpen) throw new Error("EACCES: permission denied");
    },
    append(line) {
      lines.push(line);
    },
  };
}

function run(command: string[], sink: ReceiptSink, answer: "approve" | "deny" = "approve") {
  const h = harness({ prompt: fakePrompt({ answer, via: "dialog", detail: null }), code: 4 });
  h.deps.events.subscribe(receiptWriter(sink));
  return { h, result: gate({ command, reason: "rotate the key" }, h.deps) };
}

describe("receiptWriter", () => {
  it("writes one line for a request that ran, with its exit code and every event", () => {
    const sink = memorySink();
    const { h } = run(PROD, sink);
    expect(sink.lines).toHaveLength(1);
    expect(JSON.parse(sink.lines[0] ?? "")).toEqual({
      id: "r1",
      at: "2026-10-31T09:00:00.000Z",
      agent: "a local shell",
      command: "op read op://Prod/db/password",
      reason: "rotate the key",
      tier: "ask",
      outcome: "ran",
      code: 4,
      why: null,
      events: h.events,
    });
  });

  it("writes one line for a refusal too, saying why", () => {
    const sink = memorySink();
    run(PROD, sink, "deny");
    expect(JSON.parse(sink.lines[0] ?? "")).toMatchObject({
      outcome: "refused",
      code: null,
      why: "not approved: deny",
    });
  });

  it("refuses, running nothing, when the receipt cannot be written", () => {
    const { h, result } = run(PROD, memorySink(true));
    expect(result.ran).toBe(false);
    expect(h.spawned).toEqual([]);
    expect(h.events.at(-1)).toMatchObject({ type: "refused" });
  });
});

describe("fileSink", () => {
  it("appends a line to an owner-only file, making its directory", () => {
    const path = join(mkdtempSync(join(tmpdir(), "may-i-")), "state", "receipts.jsonl");
    const sink = fileSink(path);
    for (const line of ['{"n":1}', '{"n":2}']) {
      sink.open();
      sink.append(line);
    }
    expect(readFileSync(path, "utf8")).toBe('{"n":1}\n{"n":2}\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("fails at open, before anything runs, when the path cannot be written", () => {
    const file = join(mkdtempSync(join(tmpdir(), "may-i-")), "not-a-dir");
    writeFileSync(file, "");
    expect(() => fileSink(join(file, "receipts.jsonl")).open()).toThrow();
  });
});
