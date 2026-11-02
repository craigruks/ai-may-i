/**
 * What `just mac-check` needs besides its steps: a shell that keeps every
 * Keychain call on a throwaway item, a spawn that runs only /bin/sh, may-i run
 * in-process against a temporary config, and y/n prompts on the terminal.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../src/cli.js";
import { type MacShell, systemShell } from "../src/dialog.js";
import type { Spawn } from "../src/gate.js";
import { SECURITY, SERVICE } from "../src/keychain.js";
import { systemRunner } from "../src/observers.js";
import { fileSink, parseReceipts, type Receipt, receiptsPath } from "../src/receipts.js";

/** The only Keychain service this check reads, writes or deletes. */
export const TEST_SERVICE = "ai-may-i-test";

/**
 * Every `security` call goes to TEST_SERVICE. may-i's own calls name SERVICE,
 * so they are pointed at the test item; a call naming any other service, or
 * none, throws before anything runs.
 */
export function testKeychainShell(inner: MacShell): MacShell {
  return {
    run(bin, args, timeoutMs) {
      if (bin !== SECURITY) return inner.run(bin, args, timeoutMs);
      const at = args.indexOf("-s");
      const service = at === -1 ? undefined : args[at + 1];
      if (service !== SERVICE && service !== TEST_SERVICE) {
        throw new Error(`mac-check: refusing a security call outside ${TEST_SERVICE}`);
      }
      return inner.run(bin, args.with(at + 1, TEST_SERVICE), timeoutMs);
    },
  };
}

export const shell = testKeychainShell(systemShell);

/** The approved command can only be /bin/sh, so nothing here can start `op`. */
export const shOnly: Spawn = (argv, env) => {
  const [bin, ...args] = argv;
  if (bin !== "/bin/sh") throw new Error(`mac-check: refusing to run ${bin}`);
  const res = spawnSync(bin, args, { stdio: "inherit", env: { ...env } });
  return res.status ?? 1;
};

export interface Run {
  code: number;
  out: string[];
  receipt: Receipt | undefined;
}

/** may-i in-process, with only PATH from the real environment: no token, no real config. */
export function mayI(argv: string[], tmp: string): Run {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    XDG_CONFIG_HOME: join(tmp, "config"),
    XDG_STATE_HOME: join(tmp, "state"),
  };
  const out: string[] = [];
  const say = (line: string) => {
    out.push(line);
    console.log(`    ${line}`);
  };
  const code = runCli({
    argv,
    env,
    cwd: tmp,
    home: tmp,
    platform: process.platform,
    readText: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    shell,
    spawn: shOnly,
    runObserver: systemRunner,
    sinkFor: fileSink,
    clock: { now: () => new Date() },
    newId: randomUUID,
    stdout: say,
    stderr: say,
  });
  const path = receiptsPath(env, tmp);
  const text = (() => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  })();
  return { code, out, receipt: parseReceipts(text).receipts.at(-1) };
}

/** One line from the terminal, read synchronously so the steps stay in order. */
function readLine(): string {
  const byte = Buffer.alloc(1);
  let line = "";
  for (;;) {
    const n = readSync(0, byte, 0, 1, null);
    if (n === 0 || byte[0] === 0x0a) return line;
    line += byte.toString("utf8");
  }
}

export function yes(question: string): boolean {
  for (;;) {
    process.stdout.write(`\n  ${question} [y/n] `);
    const answer = readLine().trim().toLowerCase();
    if (answer === "y" || answer === "n") return answer === "y";
  }
}

export function waitForReturn(text: string): void {
  console.log(`\n${text}`);
  process.stdout.write("  Press Return to start. ");
  readLine();
}

export function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export type Status = "pass" | "fail" | "skip";

export interface Result {
  check: string;
  status: Status;
  notes: string;
}

export const status = (ok: boolean): Status => (ok ? "pass" : "fail");

export function resultsMarkdown(header: string[], results: readonly Result[]): string {
  const cell = (s: string) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    "# mac-check results",
    "",
    ...header.map((h) => `- ${h}`),
    "",
    "| # | Check | Result | Notes |",
    "| --- | --- | --- | --- |",
    ...results.map((r, i) => `| ${i + 1} | ${cell(r.check)} | ${r.status} | ${cell(r.notes)} |`),
    "",
  ].join("\n");
}
