// Proves the public API is exactly what it says (a change to it is a deliberate diff)
// and is enough on its own to gate a command with your own prompt and judge the result.
import { describe, expect, it } from "bun:test";
import * as api from "../src/index.js";
import {
  createEmitter,
  DEFAULT_CONFIG,
  findReferences,
  type GateEvent,
  gate,
  type Prompt,
  receiptFrom,
  type TokenSource,
  verify,
} from "../src/index.js";

describe("the public API", () => {
  it("exports exactly these values", () => {
    expect(Object.keys(api).sort()).toEqual([
      "DEFAULT_CONFIG",
      "EXIT_REFUSED",
      "createEmitter",
      "findReferences",
      "gate",
      "loadConfig",
      "parseReceipts",
      "receiptFrom",
      "verify",
    ]);
  });

  it("gates a command with a caller's own prompt, and verify agrees the gate held", () => {
    const events = createEmitter();
    const seen: GateEvent[] = [];
    events.subscribe((e) => seen.push(e));
    const prompt: Prompt = {
      unavailable: null,
      ask: (q) => ({ answer: q.agent === "ci" ? "approve" : "deny", via: "custom", detail: null }),
    };
    const token: TokenSource = { read: () => ({ ok: true, token: "library-test-prod-token" }) };
    const command = ["deploy", "op://Prod/api/key"];
    const result = gate(
      { command, agent: "ci" },
      {
        config: DEFAULT_CONFIG,
        env: {},
        cwd: "/srv/app",
        readText: () => null,
        prompt,
        token,
        spawn: (_, env) => (env.OP_SERVICE_ACCOUNT_TOKEN ? 0 : 1),
        events,
        clock: { now: () => new Date("2026-10-31T09:00:00.000Z") },
        newId: () => "lib-1",
      },
    );
    expect(result).toEqual({ ran: true, code: 0 });
    expect(
      findReferences(command, {
        cwd: "/",
        env: {},
        readText: () => null,
        fileFlags: [],
        scanFiles: [],
      }).references,
    ).toEqual(["op://Prod/api/key"]);
    expect(verify([receiptFrom(seen)])).toEqual([]);
  });
});
