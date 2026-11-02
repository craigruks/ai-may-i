/**
 * The decision: each reference gets a tier, and the strictest one wins.
 *
 *  - allow runs at once, with the caller's own environment.
 *  - ask   shows the prompt; only Approve runs, with the prod token.
 *  - deny  refuses without asking.
 *
 * A reference no rule matches asks, so with no rules at all everything asks.
 * When rules disagree the stricter one wins, which means adding a rule can only
 * ever tighten. The config's "a repo file can only tighten" rests on that.
 */

import type { Tier } from "./events.js";
import type { Found } from "./references.js";

export interface Rules {
  allow: readonly string[];
  ask: readonly string[];
  deny: readonly string[];
}

export const NO_RULES: Rules = { allow: [], ask: [], deny: [] };

const RANK: Readonly<Record<Tier, number>> = { allow: 0, ask: 1, deny: 2 };

export const isLooser = (a: Tier, than: Tier): boolean => RANK[a] < RANK[than];

/** `*` matches any run of characters, `/` included, and the pattern is anchored
 *  at both ends: `op://Staging/*` is everything in the Staging vault. */
function matches(pattern: string, ref: string, ignoreCase = false): boolean {
  const body = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`, ignoreCase ? "i" : "").test(ref);
}

/** Rules that tighten match regardless of case and the rule that loosens matches
 *  exactly, so a reference spelt `op://prod/…` can still be denied by `op://Prod/*`
 *  but never allowed by `op://Staging/*` as `op://staging/…`. Either way a
 *  mismatch errs strict. */
function tierOf(ref: string, rules: Rules): { tier: Tier; rule: string | null } {
  const deny = rules.deny.find((p) => matches(p, ref, true));
  if (deny) return { tier: "deny", rule: deny };
  const ask = rules.ask.find((p) => matches(p, ref, true));
  if (ask) return { tier: "ask", rule: ask };
  const allow = rules.allow.find((p) => matches(p, ref));
  return allow ? { tier: "allow", rule: allow } : { tier: "ask", rule: null };
}

export interface Decision {
  tier: Tier;
  why: string;
}

export function decide(found: Found, rules: Rules): Decision {
  // Finding nothing is not evidence that it reaches nothing: `varlock run` with
  // no readable schema still opens the vault.
  if (found.references.length === 0) {
    const unread = found.unreadable.length ? `; could not read ${found.unreadable.join(", ")}` : "";
    return { tier: "ask", why: `no reference could be read${unread}` };
  }
  const tiers = found.references.map((ref) => ({ ref, ...tierOf(ref, rules) }));
  const worst = tiers.reduce((a, b) => (RANK[b.tier] > RANK[a.tier] ? b : a));
  const because = worst.rule ? `${worst.tier} ${worst.rule}` : "no rule matches";
  const decision: Decision = { tier: worst.tier, why: `${worst.ref}: ${because}` };
  // An unreadable file may hold anything, so the rules have nothing to judge it by.
  if (found.unreadable.length > 0 && isLooser(decision.tier, "ask")) {
    return { tier: "ask", why: `could not read ${found.unreadable.join(", ")}` };
  }
  return decision;
}
