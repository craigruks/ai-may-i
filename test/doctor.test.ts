// Proves `may-i doctor` passes only a Mac where the gate can work, names each failing
// check in one line, and treats a missing alerter as a warning rather than a failure.
import { describe, expect, it } from "bun:test";
import type { MacShell, ShellResult } from "../src/dialog.js";
import { type DoctorDeps, doctor } from "../src/doctor.js";
import { SECURITY } from "../src/keychain.js";

function deps(
  answers: Record<string, ShellResult> = {},
  over: Partial<DoctorDeps> = {},
): DoctorDeps {
  const shell: MacShell = { run: (bin) => answers[bin] ?? { status: 0, stdout: "" } };
  return {
    platform: "darwin",
    shell,
    receipts: "/Users/u/.local/state/may-i/receipts.jsonl",
    canWrite: () => null,
    ...over,
  };
}
const levels = (d: DoctorDeps) => doctor(d).map((c) => c.level);

describe("doctor", () => {
  it("passes a Mac where every check holds", () => {
    expect(levels(deps())).toEqual(["ok", "ok", "ok"]);
  });

  it.each<[string, DoctorDeps, string]>([
    [
      "a missing Keychain item",
      deps({ [SECURITY]: { status: 44, stdout: "" } }),
      "no Keychain item",
    ],
    ["receipts it cannot write", deps({}, { canWrite: () => "EACCES" }), "cannot write receipts"],
    ["another platform", deps({}, { platform: "linux" }), "only on macOS"],
  ])("fails %s, saying so", (_, d, says) => {
    const failed = doctor(d).filter((c) => c.level === "fail");
    expect(failed.map((c) => c.says).join("\n")).toContain(says);
  });

  it("only warns without alerter", () => {
    const d = deps({ "/usr/bin/which": { status: 1, stdout: "" } });
    expect(levels(d)).toEqual(["ok", "ok", "warn"]);
  });
});
