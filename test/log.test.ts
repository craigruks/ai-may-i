// Proves `may-i log` shows each request once, says whether it was allowed unasked,
// approved or refused, filters by agent and time, and never hides a damaged line.
import { describe, expect, it } from "bun:test";
import type { GateEvent } from "../src/events.js";
import { formatLog, parseSince } from "../src/log.js";
import { parseReceipts, type Receipt, receiptFrom } from "../src/receipts.js";

const asked: GateEvent = { id: "x", at: "x", type: "asked", timeoutSeconds: 120 };
function receipt(over: Partial<Receipt>): Receipt {
  const base = receiptFrom([{ id: "r", at: "2026-10-31T09:00:00.000Z", type: "exited", code: 0 }]);
  return { ...base, agent: "codex-1", command: "op read op://Staging/a/b", tier: "allow", ...over };
}

const receipts = [
  receipt({ at: "2026-10-30T08:00:00.000Z" }),
  receipt({
    agent: "claude-code:bc3851a2",
    command: "op read op://Prod/db/pw",
    tier: "ask",
    events: [asked],
  }),
  receipt({
    outcome: "refused",
    code: null,
    why: "not approved: timeout",
    command: "op read op://Prod/x/y",
  }),
];

describe("formatLog", () => {
  it("tells allowed from approved from refused", () => {
    expect(formatLog(receipts, {})).toEqual([
      "2026-10-30 08:00  codex-1               allowed, exit 0                 op read op://Staging/a/b",
      "2026-10-31 09:00  claude-code:bc3851a2  approved, exit 0                op read op://Prod/db/pw",
      "2026-10-31 09:00  codex-1               refused: not approved: timeout  op read op://Prod/x/y",
    ]);
  });

  it("filters by agent and by time", () => {
    expect(formatLog(receipts, { agent: "claude-code:bc3851a2" })).toHaveLength(1);
    expect(formatLog(receipts, { since: new Date("2026-10-31T00:00:00Z") })).toHaveLength(2);
  });
});

describe("parseSince", () => {
  const now = new Date("2026-10-31T12:00:00.000Z");
  it.each([
    ["30m", "2026-10-31T11:30:00.000Z"],
    ["12h", "2026-10-31T00:00:00.000Z"],
    ["7d", "2026-10-24T12:00:00.000Z"],
    ["2026-10-01", "2026-10-01T00:00:00.000Z"],
  ])("reads %s", (raw, iso) => {
    expect(parseSince(raw, now)).toEqual(new Date(iso));
  });

  it("refuses what it cannot read", () => {
    expect(parseSince("yesterday", now)).toContain("--since takes");
  });
});

describe("parseReceipts", () => {
  it("counts lines that are not receipts instead of dropping them", () => {
    const text = `${JSON.stringify(receipts[0])}\nnot json\n{"id":1}\n\n${JSON.stringify(receipts[2])}\n`;
    const { receipts: read, unreadable } = parseReceipts(text);
    expect(read).toHaveLength(2);
    expect(unreadable).toBe(2);
  });
});
