// Proves the tripwires catch each bug they exist for (reintroduced into a real stream,
// so the check is shown to go red) and that the gate refuses inline, before the spawn.
import { describe, expect, it } from "bun:test";
import type { EventBody, GateEvent } from "../src/events.js";
import { gate } from "../src/gate.js";
import type { Prompt } from "../src/prompt.js";
import { scan, secretsIn } from "../src/tripwires.js";
import { fakePrompt, harness, STAGING_ENV } from "./support/harness.js";

const TOKEN = STAGING_ENV.OP_SERVICE_ACCOUNT_TOKEN;
const PROD = ["op", "read", "op://Prod/db/password"];

function streamOf(command: string[], prompt: Prompt = fakePrompt()): GateEvent[] {
  const h = harness({ prompt });
  gate({ command }, h.deps);
  return h.events;
}
const denied = () => streamOf(PROD, fakePrompt({ answer: "deny", via: "dialog", detail: null }));
const at = (like: GateEvent, body: EventBody): GateEvent => ({ ...body, id: like.id, at: like.at });
const without = (events: GateEvent[], type: string) => events.filter((e) => e.type !== type);
const replace = (events: GateEvent[], type: string, body: EventBody) =>
  events.map((e) => (e.type === type ? at(e, body) : e));

describe("scan", () => {
  it("passes every stream the gate really emits", () => {
    expect(scan(streamOf(PROD), [TOKEN])).toEqual([]);
    expect(scan(denied(), [TOKEN])).toEqual([]);
    expect(scan(streamOf(["op", "read", "op://Staging/a/b"]), [TOKEN])).toEqual([]);
  });

  const deny = () => denied().slice(0, -1);
  const tail = (e: GateEvent[]): GateEvent[] => {
    const [first] = e;
    if (!first) throw new Error("the gate emitted nothing");
    return [
      ...e,
      at(first, { type: "allowed", credentials: "caller" }),
      at(first, { type: "spawned", program: "op" }),
    ];
  };
  it.each<[string, () => GateEvent[], string]>([
    ["a gate that ignores Deny", () => tail(deny()), "spawned on the ask tier without an Approve"],
    ["a gate that runs after refusing", () => tail(denied()), "spawned after a refusal"],
    [
      "a gate that skips `allowed`",
      () => without(streamOf(PROD), "allowed"),
      "spawned without being allowed",
    ],
    [
      "a repo file that loosened a tier",
      () =>
        replace(streamOf(PROD), "tier-decided", {
          type: "tier-decided",
          tier: "allow",
          userTier: "ask",
          why: "",
        }),
      "tier allow is looser than the user's own ask",
    ],
    [
      "an event that logged the token",
      () => replace(denied(), "refused", { type: "refused", why: `bad token ${TOKEN}` }),
      "a secret value in",
    ],
  ])("catches %s", (_, events, trip) => {
    const trips = scan(events(), [TOKEN]);
    expect(trips.join("\n")).toContain(trip);
    expect(trips.join("\n")).not.toContain(TOKEN);
  });
});

describe("gate, inline", () => {
  it("refuses before anyone sees an event that would carry the caller's token", () => {
    const h = harness();
    const result = gate({ command: PROD, reason: `use ${TOKEN}` }, h.deps);
    expect(result.ran).toBe(false);
    expect(h.spawned).toEqual([]);
    expect(h.events).toEqual([
      expect.objectContaining({ type: "refused", why: "tripwire: a secret value in requested" }),
    ]);
  });
});

describe("secretsIn", () => {
  it("takes values by a secret-sounding name, skipping short ones and references", () => {
    const env = {
      OP_SERVICE_ACCOUNT_TOKEN: TOKEN,
      GH_TOKEN: "op://Staging/gh/token",
      API_KEY: "short",
      HOME: "/home/u/longer-than-12",
    };
    expect(secretsIn(env)).toEqual([TOKEN]);
  });
});
