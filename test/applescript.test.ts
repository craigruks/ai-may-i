// Proves agent-controlled text cannot break out of the AppleScript literal it is pasted into:
// known injection shapes and 5000 seeded random strings all read back as exactly the text given.
// Shapes, seed and corpus rules live in spec/applescript.json, so every implementation
// fuzzes with the same strings.
import { describe, expect, it } from "bun:test";
import spec from "../spec/applescript.json" with { type: "json" };
import { appleScriptString } from "../src/applescript.js";

/**
 * How AppleScript reads a string literal: from the opening quote, `\` takes the
 * next character and `"` ends it. Returns what the literal holds and how many
 * characters it spans, so the test can tell whether anything leaked past it.
 */
function readLiteral(source: string): { value: string; length: number } {
  if (source[0] !== '"') throw new Error("not a string literal");
  const unescapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
  let value = "";
  for (let i = 1; i < source.length; i++) {
    const c = source[i] ?? "";
    if (c === '"') return { value, length: i + 1 };
    if (c === "\\") {
      const next = source[++i] ?? "";
      value += unescapes[next] ?? `\\${next}`;
    } else {
      value += c;
    }
  }
  throw new Error("unterminated literal");
}

/**
 * Mulberry32, as spec/applescript.json's `prng` spells it out. All arithmetic is
 * on unsigned 32-bit integers (Math.imul is a wrapping 32-bit multiply, `>>>`
 * a logical shift), and each draw is the final word divided by 2^32, so any
 * language with wrapping u32 maths draws the same numbers from the same seed.
 */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { fuzz } = spec;

/** One fuzz string, by the rule in the spec's `case`. */
function fuzzCase(next: () => number): string {
  const length = Math.floor(next() * fuzz.maxLength);
  let s = "";
  for (let i = 0; i < length; i++) {
    const pool = next() < 0.5 ? fuzz.hostile : fuzz.plain;
    s += pool[Math.floor(next() * pool.length)] ?? "";
  }
  return s;
}

/** What the dialog should show: the input, with only the unprintable swapped out. */
const shown = (text: string) =>
  fuzz.unprintable.reduce((t, c) => t.split(c).join(fuzz.replacement), text);

function expectContained(text: string): void {
  const literal = appleScriptString(text);
  expect(literal).not.toMatch(/[\n\r]/);
  const read = readLiteral(literal);
  expect(read.length).toBe(literal.length);
  expect(read.value).toBe(shown(text));
}

describe("appleScriptString", () => {
  it.each(spec.injections)("$name", ({ text, literal }) => {
    expect(appleScriptString(text)).toBe(literal);
    expectContained(text);
  });

  it("draws the same corpus as the spec says, so another implementation can match it", () => {
    const next = random(fuzz.seed);
    expect(fuzz.first.map(() => fuzzCase(next))).toEqual(fuzz.first);
  });

  it(`stays inside the literal for ${fuzz.count} seeded random strings`, () => {
    const next = random(fuzz.seed);
    for (let n = 0; n < fuzz.count; n++) {
      const text = fuzzCase(next);
      try {
        expectContained(text);
      } catch (err) {
        throw new Error(`case ${n} broke out: ${JSON.stringify(text)}\n${err}`);
      }
    }
  });
});
