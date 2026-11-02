// Proves the version a binary reports is the one package.json ships.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version.js";

describe("VERSION", () => {
  it("matches package.json", () => {
    const pkg: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(pkg).toMatchObject({ version: VERSION });
  });
});
