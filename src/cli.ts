/**
 * Wires the gate to a real machine. Parses, builds the subscribers, picks the
 * prompt for the platform, and calls the gate. No decision is made here.
 */

import { EXIT_USAGE, parseArgs, USAGE } from "./args.js";
import { loadConfig } from "./config.js";
import type { MacShell } from "./dialog.js";
import { doctor } from "./doctor.js";
import { createEmitter, type Subscriber } from "./events.js";
import { type Clock, EXIT_REFUSED, gate, type Spawn } from "./gate.js";
import { keychainToken } from "./keychain.js";
import { formatLog, parseSince } from "./log.js";
import { macPrompt } from "./notify.js";
import { observe, type Runner } from "./observers.js";
import type { Prompt } from "./prompt.js";
import { parseReceipts, type ReceiptSink, receiptsPath, receiptWriter } from "./receipts.js";
import type { ReadText } from "./references.js";
import { loggerLog, systemLogWriter } from "./syslog.js";
import { verify } from "./verify.js";
import { VERSION } from "./version.js";

export interface CliDeps {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  home: string;
  platform: string;
  readText: ReadText;
  /** Every macOS helper (osascript, alerter, security, logger) runs through this. */
  shell: MacShell;
  spawn: Spawn;
  runObserver: Runner;
  sinkFor: (path: string) => ReceiptSink;
  clock: Clock;
  newId: () => string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

/** There is no terminal fallback, on purpose: the agent being gated owns the
 *  terminal, so a y/N it can type itself is no consent at all. */
function promptFor(deps: CliDeps): Prompt {
  if (deps.platform === "darwin") return macPrompt(deps.shell, deps.stderr);
  return {
    unavailable: `may-i asks only on macOS, and this is ${deps.platform}`,
    ask: () => ({ answer: "error", via: "prompt", detail: "no prompt on this platform" }),
  };
}

/** Says out loud when a subscriber fails, then lets the gate decide what that means. */
function reporting(name: string, subscriber: Subscriber, deps: CliDeps): Subscriber {
  return (event) => {
    try {
      subscriber(event);
    } catch (err) {
      deps.stderr(`may-i: ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };
}

function runCommand(parsed: Extract<ReturnType<typeof parseArgs>, { kind: "run" }>, deps: CliDeps) {
  const { config, warnings } = loadConfig(deps);
  for (const w of warnings) deps.stderr(`may-i: ${w}`);
  const events = createEmitter();
  const sink = deps.sinkFor(receiptsPath(deps.env, deps.home));
  events.subscribe(reporting("the receipt", receiptWriter(sink), deps));
  if (deps.platform === "darwin") {
    events.subscribe(reporting("the system log", systemLogWriter(loggerLog(deps.shell)), deps));
  }
  events.subscribe(observe(config.observers, deps.runObserver, events));
  events.subscribe((e) => {
    if (e.type === "refused") deps.stderr(`may-i: refused: ${e.why}`);
    if (e.type === "observer-failed") deps.stderr(`may-i: observer ${e.observer} failed: ${e.why}`);
  });
  const result = gate(
    {
      command: parsed.command,
      agent: parsed.agent,
      reason: parsed.reason,
      timeoutSeconds: parsed.timeoutSeconds,
    },
    {
      config,
      env: deps.env,
      cwd: deps.cwd,
      readText: deps.readText,
      prompt: promptFor(deps),
      token: keychainToken(deps.shell),
      spawn: deps.spawn,
      events,
      clock: deps.clock,
      newId: deps.newId,
    },
  );
  return result.ran ? result.code : EXIT_REFUSED;
}

function showLog(parsed: Extract<ReturnType<typeof parseArgs>, { kind: "log" }>, deps: CliDeps) {
  const since = parsed.since === undefined ? undefined : parseSince(parsed.since, deps.clock.now());
  if (typeof since === "string") {
    deps.stderr(`may-i: ${since}`);
    return EXIT_USAGE;
  }
  const path = receiptsPath(deps.env, deps.home);
  const { receipts, unreadable } = parseReceipts(deps.readText(path) ?? "");
  for (const line of formatLog(receipts, { agent: parsed.agent, since })) deps.stdout(line);
  if (unreadable > 0) deps.stderr(`may-i: ${unreadable} line(s) in ${path} are not receipts`);
  return 0;
}

function runVerify(deps: CliDeps): number {
  const path = receiptsPath(deps.env, deps.home);
  const { receipts, unreadable } = parseReceipts(deps.readText(path) ?? "");
  const findings = verify(receipts);
  for (const f of findings) deps.stdout(`${f.id}: ${f.problem}`);
  if (unreadable > 0) deps.stdout(`${unreadable} line(s) in ${path} are not receipts`);
  const held = findings.length === 0 && unreadable === 0;
  deps.stdout(`${receipts.length} receipt(s) checked: ${held ? "the gate held" : "see above"}`);
  return held ? 0 : 1;
}

function runDoctor(deps: CliDeps): number {
  const receipts = receiptsPath(deps.env, deps.home);
  const canWrite = (path: string) => {
    try {
      deps.sinkFor(path).open();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };
  const checks = doctor({ ...deps, receipts, canWrite });
  for (const c of checks) deps.stdout(`${c.level.padEnd(4)}  ${c.says}`);
  return checks.some((c) => c.level === "fail") ? 1 : 0;
}

export function runCli(deps: CliDeps): number {
  const parsed = parseArgs(deps.argv);
  switch (parsed.kind) {
    case "help":
      deps.stdout(USAGE);
      return 0;
    case "version":
      deps.stdout(VERSION);
      return 0;
    case "error":
      deps.stderr(`may-i: ${parsed.message}\n\n${USAGE}`);
      return EXIT_USAGE;
    case "run":
      return runCommand(parsed, deps);
    case "log":
      return showLog(parsed, deps);
    case "verify":
      return runVerify(deps);
    case "doctor":
      return runDoctor(deps);
  }
}
