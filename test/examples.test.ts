// Proves the examples say what they claim: with the one-line config in examples/justfile,
// the staging recipes are allowed and the prod ones ask, purely from the vault names.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Tier } from "../src/events.js";
import { decide } from "../src/policy.js";
import { DEFAULT_FILE_FLAGS, findReferences } from "../src/references.js";

const dir = fileURLToPath(new URL("../examples", import.meta.url));
const readText = (path: string) => readFileSync(path, "utf8");
const rules = { allow: ["op://Staging/*"], ask: [], deny: [] };

describe("examples", () => {
  it.each<[string, Tier]>([
    [".env.deploy-staging", "allow"],
    [".env.deploy-prod", "ask"],
    [".env.db-migrate-prod", "ask"],
  ])("op run --env-file %s is %s", (file, tier) => {
    const sources = { cwd: dir, env: {}, readText, fileFlags: DEFAULT_FILE_FLAGS, scanFiles: [] };
    const found = findReferences(["op", "run", "--env-file", file, "--", "./deploy.sh"], sources);
    expect(found.references.length).toBeGreaterThan(0);
    expect(decide(found, rules).tier).toBe(tier);
  });
});
