/**
 * Every step of a consent request, as data. The gate reports itself only by
 * emitting these: receipts, tripwires, the log, verify and observers all read
 * this one stream, so none of them is wired into the gate.
 *
 * Payloads carry names and redacted text, never a secret value. The tripwires
 * hold every event to that.
 */

export const TIERS = ["allow", "ask", "deny"] as const;
export type Tier = (typeof TIERS)[number];

export const ANSWERS = ["approve", "deny", "timeout", "closed", "error"] as const;
export type Answer = (typeof ANSWERS)[number];

/** A Record, so a new answer cannot be added without deciding here whether it runs. */
export const ANSWER_RUNS: Readonly<Record<Answer, boolean>> = {
  approve: true,
  deny: false,
  timeout: false,
  closed: false,
  error: false,
};

/** The child runs with its caller's own environment, or with the prod token from Keychain. */
export type Credentials = "caller" | "keychain";

export type EventBody =
  | { type: "requested"; agent: string; command: string; reason: string | null; cwd: string }
  | { type: "references-found"; references: readonly string[]; unreadable: readonly string[] }
  // `userTier` is what the user's own config decides alone. A repo file may raise it, never lower it.
  | { type: "tier-decided"; tier: Tier; userTier: Tier; why: string }
  | { type: "asked"; timeoutSeconds: number }
  | { type: "answered"; answer: Answer; via: string; detail: string | null }
  | { type: "allowed"; credentials: Credentials }
  | { type: "refused"; why: string }
  | { type: "spawned"; program: string }
  | { type: "exited"; code: number };

/** `id` is the request's, shared by every event it emits; `at` is ISO 8601. */
export type GateEvent = EventBody & { id: string; at: string };
export type EventType = GateEvent["type"];

/** A Record, so a new event type has to say whether it ends a request. */
export const ENDS_REQUEST: Readonly<Record<EventType, boolean>> = {
  requested: false,
  "references-found": false,
  "tier-decided": false,
  asked: false,
  answered: false,
  allowed: false,
  spawned: false,
  refused: true,
  exited: true,
};
