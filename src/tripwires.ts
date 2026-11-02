/**
 * Invariants checked on the event stream itself, so they hold wherever the
 * events come from:
 *
 *  - nothing is spawned without `allowed`, nor on the ask tier without an
 *    Approve, nor after a refusal;
 *  - no event carries a secret value: the caller's own token, or the prod token
 *    once it has been read;
 *  - no tier is looser than the user's own config alone would make it, which is
 *    what "a repo file can only tighten" means on the wire.
 *
 * The gate runs them inline and refuses when one trips. `scan` runs them over a
 * finished stream, which is how the test suite checks every test and how
 * `may-i verify` checks the receipts.
 */

import type { GateEvent, Tier } from "./events.js";
import { isLooser } from "./policy.js";

export interface Tripwires {
  /** A value that must never appear in any event from here on. */
  secret(value: string): void;
  /** Why this event breaks an invariant, given what came before; null when it does not. */
  check(event: GateEvent): string | null;
}

interface Seen {
  tier: Tier | null;
  approved: boolean;
  allowed: boolean;
  refused: boolean;
}

function spawnTrip(seen: Seen): string | null {
  if (seen.refused) return "spawned after a refusal";
  if (!seen.allowed) return "spawned without being allowed";
  if (seen.tier === "deny") return "spawned on the deny tier";
  if (seen.tier === "ask" && !seen.approved) return "spawned on the ask tier without an Approve";
  return null;
}

function orderTrip(event: GateEvent, seen: Seen): string | null {
  switch (event.type) {
    case "tier-decided":
      seen.tier = event.tier;
      return isLooser(event.tier, event.userTier)
        ? `tier ${event.tier} is looser than the user's own ${event.userTier}`
        : null;
    case "answered":
      seen.approved = event.answer === "approve";
      return null;
    case "allowed":
      seen.allowed = true;
      return null;
    case "refused":
      seen.refused = true;
      return null;
    case "spawned":
      return spawnTrip(seen);
    default:
      return null;
  }
}

export function createTripwires(): Tripwires {
  const secrets = new Set<string>();
  const requests = new Map<string, Seen>();
  return {
    secret(value) {
      if (value) secrets.add(value);
    },
    check(event) {
      const text = JSON.stringify(event);
      // Says which event, never which value: the report must not leak it either.
      for (const s of secrets) if (text.includes(s)) return `a secret value in ${event.type}`;
      const seen = requests.get(event.id) ?? {
        tier: null,
        approved: false,
        allowed: false,
        refused: false,
      };
      requests.set(event.id, seen);
      return orderTrip(event, seen);
    },
  };
}

/** Every trip in a finished stream, as "<request id>: <why>". */
export function scan(events: readonly GateEvent[], secrets: readonly string[] = []): string[] {
  const wires = createTripwires();
  for (const s of secrets) wires.secret(s);
  return events.flatMap((e) => {
    const trip = wires.check(e);
    return trip ? [`${e.id}: ${trip}`] : [];
  });
}

/** Short values match too much by accident, and a reference is a name, not a value. */
const SECRET_NAME = /(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)$/i;

/** The caller's own secrets, by the name of the variable that holds them. */
export function secretsIn(env: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(env).flatMap(([name, value]) =>
    value && SECRET_NAME.test(name) && value.length >= 12 && !value.startsWith("op://")
      ? [value]
      : [],
  );
}
