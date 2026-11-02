// Proves each way a request can go, as the exact sequence of events it emits, and that
// nothing runs unless that sequence reaches `allowed`. The endings live in spec/lifecycle.json.
import { describe, expect, it } from "bun:test";
import spec from "../spec/lifecycle.json" with { type: "json" };
import { DEFAULT_CONFIG } from "../src/config.js";
import { ANSWERS, type Answer, type GateEvent } from "../src/events.js";
import { EXIT_REFUSED, gate } from "../src/gate.js";
import type { Prompt } from "../src/prompt.js";
import { fakePrompt, harness, STAGING_ENV } from "./support/harness.js";

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

describe("gate: ask tier", () => {
  it("asks, naming who, what, why and what it reaches, and runs only on Approve", () => {
    const prompt = fakePrompt();
    const h = harness({ prompt });
    expect(gate({ command: PROD, agent: "codex-1", reason: "rotate the key" }, h.deps).ran).toBe(
      true,
    );
    expect(h.types()).toEqual([
      "requested",
      "references-found",
      "tier-decided",
      "asked",
      "answered",
      "allowed",
      "spawned",
      "exited",
    ]);
    expect(prompt.asked).toEqual([
      {
        id: "r1",
        agent: "codex-1",
        command: "op read op://Prod/db/password",
        reason: "rotate the key",
        references: ["op://Prod/db/password"],
        unreadable: [],
        cwd: "/work/repo",
        timeoutSeconds: 120,
      },
    ]);
  });

  it("lets a request shorten the wait, never lengthen it", () => {
    const prompt = fakePrompt();
    gate({ command: PROD, timeoutSeconds: 30 }, harness({ prompt }).deps);
    gate({ command: PROD, timeoutSeconds: 600 }, harness({ prompt }).deps);
    expect(prompt.asked.map((q) => q.timeoutSeconds)).toEqual([30, 120]);
  });

  it("asks again for every request: one Approve is one run", () => {
    const prompt = fakePrompt();
    const h = harness({ prompt });
    gate({ command: PROD }, h.deps);
    gate({ command: PROD }, h.deps);
    expect(prompt.asked).toHaveLength(2);
    expect(h.spawned).toHaveLength(2);
  });
});

/** One line per event, as spec/lifecycle.json's `trace` describes. */
function trace(events: readonly GateEvent[]): string[] {
  return events.map((e) => {
    if (e.type === "tier-decided") return `tier-decided:${e.tier}`;
    if (e.type === "answered") return `answered:${e.answer}`;
    if (e.type === "allowed") return `allowed:${e.credentials}`;
    return e.type;
  });
}

const says = (answer: Answer): Prompt => fakePrompt({ answer, via: "dialog", detail: null });
const PROMPTS: Readonly<Record<string, Prompt>> = {
  ...Object.fromEntries(ANSWERS.map((a) => [a, says(a)])),
  throws: {
    unavailable: null,
    ask() {
      throw new Error("osascript: no window server");
    },
  },
  unavailable: {
    unavailable: "may-i asks only on macOS",
    ask() {
      throw new Error("never called");
    },
  },
};

interface Ending {
  name: string;
  command: string[];
  prompt: string;
  sequence: string[];
  ran: boolean;
  why?: string;
}
const endings: Ending[] = spec.endings;
const config = { ...DEFAULT_CONFIG, user: spec.rules };

describe("gate: every ending, as its exact event sequence", () => {
  it.each(endings)("$name", (ending) => {
    const prompt = PROMPTS[ending.prompt];
    if (!prompt) throw new Error(`spec names an unknown prompt: ${ending.prompt}`);
    const h = harness({ prompt, config });
    const result = gate({ command: ending.command }, h.deps);
    expect(trace(h.events)).toEqual(ending.sequence);
    expect(result).toEqual(
      ending.ran ? { ran: true, code: 0 } : { ran: false, code: EXIT_REFUSED },
    );
    expect(h.spawned).toHaveLength(ending.ran ? 1 : 0);
    if (ending.why !== undefined) expect(h.events.at(-1)).toMatchObject({ why: ending.why });
  });
});
