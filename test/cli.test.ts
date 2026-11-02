// Proves the CLI contract a script relies on: the command's own exit code when it ran,
// 77 when refused, 64 on misuse, and --reason carried to the prompt and the receipt.
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXIT_USAGE, USAGE } from "../src/args.js";
import { type CliDeps, runCli } from "../src/cli.js";
import type { MacShell, ShellResult } from "../src/dialog.js";
import { EXIT_REFUSED } from "../src/gate.js";
import type { ReceiptSink } from "../src/receipts.js";
import { VERSION } from "../src/version.js";
import { clock, STAGING_ENV } from "./support/harness.js";

const USER_CONFIG = "/home/u/.config/may-i/config.json";

interface Run {
  code: number;
  stdout: string[];
  stderr: string[];
  spawned: (readonly string[])[];
  receipts: string[];
  shellCalls: string[][];
}

function cli(argv: string[], over: Partial<CliDeps> & { exit?: number } = {}): Run {
  const out: Omit<Run, "code"> = {
    stdout: [],
    stderr: [],
    spawned: [],
    receipts: [],
    shellCalls: [],
  };
  const answers: Record<string, ShellResult> = {
    "/usr/bin/which": { status: 1, stdout: "" },
    "/usr/bin/osascript": { status: 0, stdout: "button returned:Approve, gave up:false\n" },
    "/usr/bin/security": { status: 0, stdout: "prod-token-from-the-keychain\n" },
    "/usr/bin/logger": { status: 0, stdout: "" },
  };
  const shell: MacShell = {
    run(bin, args) {
      out.shellCalls.push([bin, ...args]);
      return answers[bin] ?? { status: 127, stdout: "" };
    },
  };
  const sink: ReceiptSink = { open() {}, append: (line) => out.receipts.push(line) };
  const { exit, ...rest } = over;
  const code = runCli({
    argv,
    env: STAGING_ENV,
    cwd: "/work/repo",
    home: "/home/u",
    platform: "darwin",
    readText: () => null,
    shell,
    spawn: (command) => {
      out.spawned.push(command);
      return exit ?? 0;
    },
    sinkFor: () => sink,
    clock,
    newId: () => "r1",
    stdout: (line) => out.stdout.push(line),
    stderr: (line) => out.stderr.push(line),
    ...rest,
  });
  return { code, ...out };
}

const PROD = ["op", "read", "op://Prod/db/password"];

describe("may-i", () => {
  it.each([
    [[]],
    [["--agent", "codex-1"]],
    [["op", "read", "op://Prod/db/password"]],
    [["--yes", "--", ...PROD]],
    [["--timeout", "0", "--", ...PROD]],
    [["--timeout", "601", "--", ...PROD]],
    [["--reason"]],
    [["--"]],
  ])("exits 64 on %j, running nothing", (argv) => {
    const run = cli(argv);
    expect(run.code).toBe(EXIT_USAGE);
    expect(run.spawned).toEqual([]);
    expect(run.stderr.join("\n")).toContain(USAGE);
  });

  it("passes the command's own exit code through", () => {
    const readText = (p: string) => (p === USER_CONFIG ? '{"allow":["op://Staging/*"]}' : null);
    const run = cli(["--", "op", "read", "op://Staging/x/y"], { readText, exit: 3 });
    expect(run).toMatchObject({ code: 3, spawned: [["op", "read", "op://Staging/x/y"]] });
  });

  it("exits 77 when refused, says why, and runs nothing", () => {
    const run = cli(["--", ...PROD], { platform: "linux" });
    expect(run.code).toBe(EXIT_REFUSED);
    expect(run.spawned).toEqual([]);
    expect(run.stderr).toContain(
      "may-i: refused: cannot ask: may-i asks only on macOS, and this is linux",
    );
  });

  it("carries --agent and --reason to the dialog and the receipt", () => {
    const run = cli([
      "--agent",
      "codex-1",
      "--reason=rotate the key",
      "--timeout",
      "30",
      "--",
      ...PROD,
    ]);
    expect(run.code).toBe(0);
    const dialog = run.shellCalls.find(([bin]) => bin === "/usr/bin/osascript")?.join(" ") ?? "";
    expect(dialog).toContain("Asked by codex-1");
    expect(dialog).toContain('The agent says: \\"rotate the key\\"');
    expect(dialog).toContain("giving up after 30");
    expect(JSON.parse(run.receipts[0] ?? "{}")).toMatchObject({
      agent: "codex-1",
      reason: "rotate the key",
    });
  });

  it("prints its version and its usage on stdout", () => {
    expect(cli(["--version"])).toMatchObject({ code: 0, stdout: [VERSION] });
    expect(cli(["-h"])).toMatchObject({ code: 0, stdout: [USAGE] });
  });

  it("shows the receipts with `log`, and refuses a --since it cannot read", () => {
    const first = cli(["--agent", "codex-1", "--", ...PROD]);
    const file = "/home/u/.local/state/may-i/receipts.jsonl";
    const readText = (p: string) => (p === file ? `${first.receipts.join("\n")}\n` : null);
    const log = cli(["log", "--agent", "codex-1"], { readText });
    expect(log.code).toBe(0);
    expect(log.stdout).toEqual([expect.stringContaining("codex-1  approved, exit 0  op read")]);
    expect(cli(["log", "--since", "soon"], { readText }).code).toBe(EXIT_USAGE);
  });

  it("exits 0 from `verify` when the receipts hold up, and 1 when one does not", () => {
    const [line = ""] = cli(["--", ...PROD]).receipts;
    const file = "/home/u/.local/state/may-i/receipts.jsonl";
    const verifying = (text: string) =>
      cli(["verify"], { readText: (p) => (p === file ? text : null) });
    expect(verifying(line)).toMatchObject({
      code: 0,
      stdout: ["1 receipt(s) checked: the gate held"],
    });
    expect(verifying(line.replace('"outcome":"ran"', '"outcome":"refused"')).code).toBe(1);
    expect(verifying(`${line}\ngarbage`).code).toBe(1);
  });

  it("reports a config warning, and still decides", () => {
    const readText = (p: string) => (p === USER_CONFIG ? "{" : null);
    const run = cli(["--", ...PROD], { readText });
    expect(run.stderr[0]).toContain("not valid JSON");
    expect(run.code).toBe(0);
  });
});

describe("may-i, as a real process", () => {
  const home = mkdtempSync(join(tmpdir(), "may-i-home-"));
  const env = { PATH: process.env.PATH ?? "", HOME: home, XDG_CONFIG_HOME: join(home, "config") };
  // `bun file.ts -- x` keeps the `--` for itself, so each call leads with an option.
  const main = (args: string[]) =>
    spawnSync(process.execPath, ["src/main.ts", "--reason", "smoke", ...args], {
      env,
      encoding: "utf8",
    });

  // On a Mac this would open the real dialog; the macOS CI job covers that path.
  it.skipIf(process.platform === "darwin")("refuses with 77 off macOS and leaves a receipt", () => {
    const res = main(["--", ...PROD]);
    expect(res.status).toBe(EXIT_REFUSED);
    const receipt = readFileSync(join(home, ".local/state/may-i/receipts.jsonl"), "utf8");
    expect(JSON.parse(receipt)).toMatchObject({ outcome: "refused", command: PROD.join(" ") });
  });

  it("runs an allowed command and returns its exit code", () => {
    mkdirSync(join(home, "config", "may-i"), { recursive: true });
    writeFileSync(join(home, "config", "may-i", "config.json"), '{"allow":["op://Staging/*"]}');
    const res = main(["--", "sh", "-c", "exit 3", "op://Staging/x/y"]);
    expect(res.status).toBe(3);
  });
});
