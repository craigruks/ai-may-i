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

export type Subscriber = (event: GateEvent) => void;

export interface SubscriberFailure {
  event: GateEvent;
  error: unknown;
}

export interface Emitter {
  subscribe(subscriber: Subscriber): void;
  /** Delivers to every subscriber before it returns, and returns what threw. */
  emit(event: GateEvent): readonly SubscriberFailure[];
}

/**
 * Synchronous on purpose: when `emit` returns, every subscriber has seen the
 * event, so the gate can act on a failure before it spawns anything.
 *
 * An event emitted from inside a subscriber is queued behind the one in
 * flight rather than delivered on the spot, so every subscriber sees the same
 * order. Its failures are returned by the outer `emit`.
 */
export function createEmitter(): Emitter {
  const subscribers: Subscriber[] = [];
  const queue: GateEvent[] = [];
  let delivering = false;
  return {
    subscribe(subscriber) {
      subscribers.push(subscriber);
    },
    emit(event) {
      queue.push(event);
      if (delivering) return [];
      delivering = true;
      const failures: SubscriberFailure[] = [];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        for (const subscriber of subscribers) {
          try {
            subscriber(next);
          } catch (error) {
            failures.push({ event: next, error });
          }
        }
      }
      delivering = false;
      return failures;
    },
  };
}
