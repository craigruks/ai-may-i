// Proves the decision: the strictest tier among a command's references wins, anything
// unmatched or unknown asks, and a mismatch in spelling can only make it stricter.
// The cases live in spec/tiers.json, so every implementation runs the same ones.
import { describe, expect, it } from "bun:test";
import spec from "../spec/tiers.json" with { type: "json" };
import { decide, type Rules } from "../src/policy.js";

interface DecideCase {
  name: string;
  rules?: Rules;
  references: string[];
  unreadable?: string[];
  tier: string;
  why?: string;
}
const cases: DecideCase[] = spec.decide;

describe("decide", () => {
  it.each(cases)("$name", (c) => {
    const decision = decide(
      { references: c.references, unreadable: c.unreadable ?? [] },
      c.rules ?? spec.rules,
    );
    const got: { tier: string; why: string } = decision;
    expect(got.tier).toBe(c.tier);
    if (c.why !== undefined) expect(got.why).toBe(c.why);
  });
});
