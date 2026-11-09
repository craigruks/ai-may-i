// Proves the last line of defence: if may-i itself throws, the command it guards never runs.
import { describe, expect, it } from "bun:test";
import { failClosed } from "../src/fail-closed.js";
import { EXIT_REFUSED } from "../src/gate.js";

describe("failClosed", () => {
  it("refuses with 77 and says why when may-i throws before deciding", () => {
    const stderr: string[] = [];
    const code = failClosed(
      () => {
        throw new Error("config parser blew up");
      },
      (line) => stderr.push(line),
    );
    expect(code).toBe(EXIT_REFUSED);
    expect(stderr.join("\n")).toContain("failed before it could decide");
    expect(stderr.join("\n")).toContain("config parser blew up");
  });

  it("passes the decided exit code through untouched", () => {
    const stderr: string[] = [];
    expect(
      failClosed(
        () => 3,
        (line) => stderr.push(line),
      ),
    ).toBe(3);
    expect(stderr).toEqual([]);
  });
});
