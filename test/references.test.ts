// Proves may-i sees every op:// reference a command can reach (its arguments, the env files
// it names, its environment), never returns a value, and never mistakes a missing file for an empty one.
import { describe, expect, it } from "bun:test";
import {
  DEFAULT_FILE_FLAGS,
  findReferences,
  referencesIn,
  type Sources,
} from "../src/references.js";

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

const files: Record<string, string> = {
  "/repo/.env.prod": [
    "DB_PASSWORD=op://Prod/db/password",
    "LEGACY_TOKEN=sk_live_THISISASECRETVALUE0000",
    'STRIPE="op://Prod/stripe/secret"',
  ].join("\n"),
  "/repo/.env.schema": "# @plugin(@varlock/1password-plugin)\nAPI_KEY=op(op://Staging/api/key)\n",
  "/etc/shared.env": "X=op://Shared/x/y\n",
};
const sources: Sources = {
  cwd: "/repo",
  env: {},
  readText: (path) => files[path] ?? null,
  fileFlags: DEFAULT_FILE_FLAGS,
  scanFiles: [],
};
const PROD = ["op://Prod/db/password", "op://Prod/stripe/secret"];

describe("findReferences", () => {
  it.each([
    ["op run --env-file", ["op", "run", "--env-file", ".env.prod", "--", "x"], PROD],
    ["--env-file=", ["op", "run", "--env-file=.env.prod", "--", "x"], PROD],
    ["varlock run --path", ["varlock", "run", "--path", ".env.schema"], ["op://Staging/api/key"]],
    ["an absolute path", ["op", "run", "--env-file", "/etc/shared.env"], ["op://Shared/x/y"]],
    ["a flag inside bash -c", ["bash", "-c", "op run --env-file='.env.prod' -- make"], PROD],
  ])("reads the file named by %s", (_, argv, refs) => {
    expect(findReferences(argv, sources)).toEqual({ references: refs, unreadable: [] });
  });

  it("returns names only, never another value from the file", () => {
    const out = findReferences(["op", "run", "--env-file", ".env.prod"], sources);
    expect(JSON.stringify(out)).not.toContain("sk_live");
  });

  it("lists a missing file as unreadable, never skips it", () => {
    const out = findReferences(["op", "run", "--env-file", ".env.missing", "--", "x"], sources);
    expect(out).toEqual({ references: [], unreadable: [".env.missing"] });
  });

  it("reads configured files the command does not name, and lets them be absent", () => {
    const scan = { ...sources, scanFiles: [".env.schema", ".env.absent"] };
    expect(findReferences(["varlock", "run", "--", "x"], scan)).toEqual({
      references: ["op://Staging/api/key"],
      unreadable: [],
    });
  });

  it("finds references in the inherited environment, which op run resolves", () => {
    const env = { GH_TOKEN: "op://Staging/github/token", HOME: "/home/u" };
    expect(findReferences(["op", "run", "--", "x"], { ...sources, env }).references).toEqual([
      "op://Staging/github/token",
    ]);
  });
});
