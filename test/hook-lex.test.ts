// Proves the lexer finds every program a command line runs, and what each runs behind,
// through the shapes agents actually type, and pins the evasions it cannot see.
// The cases live in spec/hook-lex.json, so every implementation runs the same ones.
import { describe, expect, it } from "bun:test";
import spec from "../spec/hook-lex.json" with { type: "json" };
import { programsIn, TOO_DEEP } from "../src/hook-lex.js";

/** "may-i>bash>op", as the spec's `programs` describes. */
const shown = (line: string) => programsIn(line).map((p) => [...p.behind, p.name].join(">"));

interface LexCase {
  name: string;
  line: string;
  programs: string[];
  caught?: boolean;
}
const cases: LexCase[] = spec.cases;

describe("programsIn", () => {
  it.each(cases)("$name", ({ line, programs, caught }) => {
    expect(shown(line)).toEqual(programs);
    if (caught === false) {
      const vault = programsIn(line).filter((p) => p.name === "op" || p.name === "varlock");
      expect(vault.filter((p) => !p.behind.includes("may-i"))).toEqual([]);
    }
  });

  it("gives up on a line nested past what anyone types, rather than guessing", () => {
    let deep = "op read x";
    for (let i = 0; i < 8; i++) deep = `bash -c '${deep.replaceAll("'", "'\\''")}'`;
    expect(programsIn(deep).some((p) => p.name === TOO_DEEP)).toBe(true);
  });
});
