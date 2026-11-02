// Proves may-i sees every op:// reference a command names, wherever in its arguments it sits.
import { describe, expect, it } from "bun:test";
import { referencesIn } from "../src/references.js";

describe("referencesIn", () => {
  it.each([
    ["a bare argument", ["op", "read", "op://Prod/db/password"], ["op://Prod/db/password"]],
    ["a flag value", ["tool", "--secret=op://Prod/api/key"], ["op://Prod/api/key"]],
    [
      "a bash -c string, quoted or not",
      ["bash", "-c", `op read 'op://Prod/a/b' | psql "$(op read "op://Prod/c/d")" op://Prod/e/f`],
      ["op://Prod/a/b", "op://Prod/c/d", "op://Prod/e/f"],
    ],
    [
      "shell punctuation, which ends a reference",
      ["sh", "-c", "X=op://A/b/c;Y=op://A/d/e&&op://A/f/g|x"],
      ["op://A/b/c", "op://A/d/e", "op://A/f/g"],
    ],
    ["prose, without its comma", ["echo", "see op://A/b/c, then"], ["op://A/b/c"]],
    [
      "repeats, listed once and sorted",
      ["op://b/x/y", "op://a/x/y", "op://b/x/y"],
      ["op://a/x/y", "op://b/x/y"],
    ],
    ["a command that names none", ["ls", "-la"], []],
  ])("finds them in %s", (_, argv, refs) => {
    expect(referencesIn(argv)).toEqual(refs);
  });
});
