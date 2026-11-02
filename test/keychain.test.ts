// Proves the prod token is read from exactly one Keychain item by the system's own
// security tool, and that every way the read can fail refuses rather than runs.
import { describe, expect, it } from "bun:test";
import type { MacShell, ShellResult } from "../src/dialog.js";
import { keychainToken, SECURITY } from "../src/keychain.js";

function fakeSecurity(res: ShellResult): MacShell & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run(bin, args) {
      calls.push([bin, ...args]);
      return res;
    },
  };
}

describe("keychainToken", () => {
  it("runs /usr/bin/security with exactly this argv, and returns the token as stored", () => {
    const shell = fakeSecurity({ status: 0, stdout: "ops_prod token with spaces \n" });
    expect(keychainToken(shell).read()).toEqual({ ok: true, token: "ops_prod token with spaces " });
    expect(shell.calls).toEqual([
      [SECURITY, "find-generic-password", "-s", "ai-may-i", "-a", "op-service-account", "-w"],
    ]);
  });

  it.each<[string, ShellResult, string]>([
    ["a missing item", { status: 44, stdout: "" }, "no Keychain item for service ai-may-i"],
    ["a refused read", { status: 51, stdout: "" }, "security exited 51"],
    ["a killed read", { status: null, stdout: "" }, "security was killed"],
    ["an empty item", { status: 0, stdout: "\n" }, "the Keychain item is empty"],
  ])("refuses on %s", (_, res, why) => {
    const read = keychainToken(fakeSecurity(res)).read();
    expect(read).toEqual({ ok: false, why: expect.stringContaining(why) });
  });
});
