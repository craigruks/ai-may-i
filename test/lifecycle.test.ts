// Proves each way a request can go, as the exact sequence of events it emits, and that
// nothing runs unless that sequence reaches `allowed`.
import { describe, expect, it } from "bun:test";
import { EXIT_REFUSED, gate } from "../src/gate.js";
import { harness, STAGING_ENV } from "./support/harness.js";

const STAGING = ["op", "read", "op://Staging/db/password"];
const PROD = ["op", "read", "op://Prod/db/password"];

describe("gate: allow tier", () => {
  it("runs at once with the caller's own environment, and records each step", () => {
    const h = harness({ code: 3 });
    expect(gate({ command: STAGING }, h.deps)).toEqual({ ran: true, code: 3 });
    expect(h.types()).toEqual([
      "requested",
      "references-found",
      "tier-decided",
      "allowed",
      "spawned",
      "exited",
    ]);
    expect(h.spawned).toEqual([{ argv: STAGING, env: STAGING_ENV }]);
    expect(h.events).toContainEqual(expect.objectContaining({ type: "exited", code: 3 }));
  });

  it("records what was asked in names and redacted text only", () => {
    const h = harness();
    gate(
      { command: [...STAGING, "--password=hunter2"], agent: "codex-1", reason: "TOKEN=abc" },
      h.deps,
    );
    expect(h.events[0]).toMatchObject({
      type: "requested",
      agent: "codex-1",
      command: "op read op://Staging/db/password --password=***",
      reason: "TOKEN=***",
      cwd: "/work/repo",
    });
    expect(h.events[1]).toMatchObject({ references: ["op://Staging/db/password"], unreadable: [] });
    expect(h.events[2]).toMatchObject({ tier: "allow", userTier: "allow" });
  });

  it("refuses, running nothing, when a subscriber fails before the run", () => {
    const h = harness();
    h.deps.events.subscribe((e) => {
      if (e.type === "requested") throw new Error("receipt disk full");
    });
    expect(gate({ command: STAGING }, h.deps)).toEqual({ ran: false, code: EXIT_REFUSED });
    expect(h.types().at(-1)).toBe("refused");
    expect(h.spawned).toEqual([]);
  });
});

describe("gate: until it can ask", () => {
  it("refuses anything outside the allow tier, running nothing", () => {
    const h = harness();
    expect(gate({ command: PROD }, h.deps).code).toBe(EXIT_REFUSED);
    expect(h.types()).toEqual(["requested", "references-found", "tier-decided", "refused"]);
    expect(h.spawned).toEqual([]);
  });
});
