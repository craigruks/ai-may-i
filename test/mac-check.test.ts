// Proves `just mac-check` cannot reach the real Keychain item: every security call it
// makes, its own and may-i's, lands on the throwaway test item or does not run at all.
import { describe, expect, it } from "bun:test";
import { shOnly, TEST_SERVICE, testKeychainShell } from "../scripts/mac-check-lib.js";
import type { MacShell } from "../src/dialog.js";
import { doctor } from "../src/doctor.js";
import { ACCOUNT, keychainToken, SECURITY, SERVICE } from "../src/keychain.js";

function recording(): MacShell & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run(bin, args) {
      calls.push([bin, ...args]);
      return { status: 0, stdout: "test-token\n" };
    },
  };
}

describe("mac-check's Keychain shell", () => {
  it("points may-i's read at the test item", () => {
    const inner = recording();
    expect(keychainToken(testKeychainShell(inner)).read()).toEqual({
      ok: true,
      token: "test-token",
    });
    expect(inner.calls).toEqual([
      [SECURITY, "find-generic-password", "-s", TEST_SERVICE, "-a", ACCOUNT, "-w"],
    ]);
  });

  it("points doctor's check at the test item", () => {
    const inner = recording();
    const receipts = "/tmp/r.jsonl";
    doctor({ platform: "darwin", shell: testKeychainShell(inner), receipts, canWrite: () => null });
    const security = inner.calls.filter(([bin]) => bin === SECURITY);
    expect(security).toEqual([
      [SECURITY, "find-generic-password", "-s", TEST_SERVICE, "-a", ACCOUNT],
    ]);
  });

  it.each([
    ["another service", ["delete-generic-password", "-s", "something-else", "-a", ACCOUNT]],
    ["no service", ["find-generic-password", "-a", ACCOUNT, "-w"]],
    ["-s as the last word", ["find-generic-password", "-s"]],
  ])("refuses a call naming %s, running nothing", (_, args) => {
    const inner = recording();
    expect(() => testKeychainShell(inner).run(SECURITY, args, 1)).toThrow(TEST_SERVICE);
    expect(inner.calls).toEqual([]);
  });

  it("passes every other program through unchanged", () => {
    const inner = recording();
    testKeychainShell(inner).run("/usr/bin/osascript", ["-e", `"-s ${SERVICE}"`], 1);
    expect(inner.calls).toEqual([["/usr/bin/osascript", "-e", `"-s ${SERVICE}"`]]);
  });
});

describe("mac-check's spawn", () => {
  it("runs nothing but /bin/sh", () => {
    expect(() => shOnly(["op", "read", "op://Prod/db/password"], {})).toThrow("refusing to run op");
  });
});
