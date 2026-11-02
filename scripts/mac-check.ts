/**
 * `just mac-check`: the checks only a Mac and a person can do, walked once by hand. It runs
 * the real dialog, notification, logger and security, with may-i in-process
 * against a temporary config and receipts, and asks y/n where only a person
 * can tell. The answers go to mac-check-results.md, to paste back.
 *
 * It never touches 1Password or the real Keychain item: every `security` call
 * goes to a throwaway item (service ai-may-i-test) that it creates and deletes,
 * and the only command it lets may-i run is /bin/sh.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { GateEvent } from "../src/events.js";
import { ACCOUNT, keychainToken, SECURITY } from "../src/keychain.js";
import { notificationArgs } from "../src/notify.js";
import { VERSION } from "../src/version.js";
import {
  mayI,
  type Result,
  type Run,
  resultsMarkdown,
  shell,
  sleep,
  status,
  TEST_SERVICE,
  waitForReturn,
  yes,
} from "./mac-check-lib.js";

const REPO = resolve(import.meta.dir, "..");
const RESULTS = join(REPO, "mac-check-results.md");
const PROD_REF = "op://MacCheckProd/item/field";
const results: Result[] = [];
const record = (check: string, ok: boolean | "skip", notes = ""): void => {
  results.push({ check, status: ok === "skip" ? "skip" : status(ok), notes });
};

const tmp = mkdtempSync(join(tmpdir(), "may-i-mac-check-"));
const token = `mac-check-${randomUUID()}`;
const tokenFile = join(tmp, "token-seen-by-the-command");
let itemCreated = false;

/** Through the guarded shell, so even this script's own calls stay on the test item. */
const security = (args: string[]) => shell.run(SECURITY, args, 30_000);
const deleteItem = () => security(["delete-generic-password", "-s", TEST_SERVICE, "-a", ACCOUNT]);

process.on("exit", () => {
  if (itemCreated) deleteItem();
  rmSync(tmp, { recursive: true, force: true });
});
process.on("SIGINT", () => process.exit(130));

/** The ask-tier request every prompt step makes: /bin/sh saves the token it was given. */
function ask(reason: string, timeout = 60): Run {
  rmSync(tokenFile, { force: true });
  const script = 'printf %s "$OP_SERVICE_ACCOUNT_TOKEN" > "$0"';
  const argv = ["--agent", "mac-check", "--reason", reason, "--timeout", String(timeout), "--"];
  return mayI([...argv, "/bin/sh", "-c", script, tokenFile, PROD_REF], tmp);
}

const why = (run: Run) => run.receipt?.why ?? "";
type Answered = Extract<GateEvent, { type: "answered" }>;
const via = (run: Run) =>
  run.receipt?.events.find((e): e is Answered => e.type === "answered")?.via ?? "";
const which = (bin: string) => spawnSync("/usr/bin/which", [bin], { encoding: "utf8" });
const alerter = which("alerter").stdout.trim() || null;

function checkAlerterFlags(): void {
  if (!alerter) {
    record("alerter -help lists every flag may-i passes", "skip", "alerter is not installed");
    return;
  }
  const help = spawnSync(alerter, ["-help"], { encoding: "utf8", timeout: 10_000 });
  const text = `${help.stdout}${help.stderr}`;
  const q = { id: "x", agent: "a", command: "c", reason: null, cwd: "/", timeoutSeconds: 1 };
  const flags = notificationArgs({ ...q, references: [], unreadable: [] }).filter((a) =>
    a.startsWith("--"),
  );
  const missing = flags.filter((f) => !new RegExp(`(^|\\s)${f}\\b`).test(text));
  const answers = ["@CONTENTCLICKED", "@ACTIONCLICKED", "@TIMEOUT", "@CLOSED"];
  const unlisted = answers.filter((a) => !text.includes(a));
  const notes = `uses ${flags.join(" ")}; missing from -help: ${missing.join(" ") || "none"}; answers not in -help: ${unlisted.join(" ") || "none"}`;
  record("alerter -help lists every flag may-i passes", missing.length === 0, notes);
}

function checkDoctor(): void {
  console.log("\n  may-i doctor, before the test item exists:");
  const before = mayI(["doctor"], tmp);
  const created = security([
    "add-generic-password",
    "-s",
    TEST_SERVICE,
    "-a",
    ACCOUNT,
    "-w",
    token,
    "-U",
  ]);
  itemCreated = created.status === 0;
  record("Keychain: create the test item", itemCreated, `security exited ${created.status}`);
  console.log("\n  may-i doctor, with the test item:");
  const after = mayI(["doctor"], tmp);
  const missingFails =
    before.code === 1 && before.out.some((l) => l.startsWith("fail  no Keychain item"));
  record("doctor fails without the item", missingFails, before.out.join("; "));
  record("doctor passes with the item", after.code === 0, after.out.join("; "));
}

function checkKeychainRead(): void {
  const read = keychainToken(shell).read();
  record(
    "Keychain: may-i reads the test item",
    read.ok && read.token === token,
    read.ok ? "token matches" : read.why,
  );
}

function checkFocusReturnDeny(): void {
  const steps = alerter
    ? "  1. You have 5 seconds: click into another app (TextEdit or Notes) and keep typing.\n  2. A may-i notification appears. Keep typing for a few seconds.\n  3. Click the notification (or its Review button) to open the dialog."
    : "  1. No alerter, so the dialog opens straight away.";
  waitForReturn(
    `Notification, Return key and Deny.\n${steps}\n  4. In the dialog, press Return twice, then Escape. The dialog must stay open.\n  5. Click Deny.`,
  );
  if (alerter) sleep(5_000);
  const run = ask("mac-check: press Return, then Escape, then click Deny");
  if (alerter) {
    record(
      "The notification does not take focus",
      yes("Did your typing stay in the other app when the notification appeared?"),
    );
  } else record("The notification does not take focus", "skip", "alerter is not installed");
  record(
    "The dialog has no default button",
    yes("Did the dialog stay open after Return and Escape?"),
  );
  const denied = run.code === 77 && why(run) === "not approved: deny" && !existsSync(tokenFile);
  record("Deny refuses and runs nothing", denied, `exit ${run.code}; ${why(run)}; via ${via(run)}`);
}

function checkApprove(): string | undefined {
  waitForReturn(`Approve.\n  ${alerter ? "Click the notification, then click" : "Click"} Approve.`);
  const run = ask("mac-check: click Approve");
  const seen = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8") : null;
  const ok = run.code === 0 && seen === token;
  record(
    "Approve runs the command with the test token",
    ok,
    `exit ${run.code}; the command ${seen === token ? "got" : "did not get"} the token`,
  );
  return run.receipt?.id;
}

function checkTimeouts(): void {
  waitForReturn("Timeout. Touch nothing for 10 seconds.");
  const idle = ask("mac-check: touch nothing", 10);
  record(
    "A timeout refuses (--timeout 10)",
    idle.code === 77 && why(idle) === "not approved: timeout",
    `exit ${idle.code}; via ${via(idle)}`,
  );
  if (!alerter) return;
  waitForReturn(
    "Dialog timeout. Click the notification to open the dialog, then leave the dialog for 10 seconds.",
  );
  const open = ask("mac-check: leave this dialog alone", 10);
  const ok =
    open.code === 77 &&
    why(open) === "not approved: timeout" &&
    via(open) === "notification+dialog";
  record("The dialog times out on its own", ok, `exit ${open.code}; via ${via(open)}`);
}

function checkSystemLog(id: string | undefined): void {
  if (!id) {
    record("logger reached the system log (Console)", false, "no receipt id from Approve");
    return;
  }
  const predicate = `eventMessage CONTAINS "${id}"`;
  console.log(
    `\n  Running: /usr/bin/log show --last 10m --style compact --predicate '${predicate}'`,
  );
  const res = spawnSync(
    "/usr/bin/log",
    ["show", "--last", "10m", "--style", "compact", "--predicate", predicate],
    { encoding: "utf8", timeout: 120_000 },
  );
  const lines = res.stdout.split("\n").filter((l) => l.includes(id));
  for (const l of lines) console.log(`    ${l}`);
  record(
    "logger reached the system log (Console)",
    lines.length > 0,
    lines[0]?.slice(0, 200) ?? `log show exited ${res.status}`,
  );
}

function checkHook(): void {
  const dir = join(tmp, "hook-check");
  const marker = join(dir, "fake-op-ran");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "op"), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  const hook = { type: "command", command: join(REPO, "bin", "may-i-hook") };
  const settings = {
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [hook] }] },
    // So Claude Code cannot start may-i here, whose Approve would read the real item.
    permissions: { deny: ["Bash(may-i:*)"] },
  };
  const json = JSON.stringify(settings, null, 2);
  writeFileSync(join(dir, ".claude", "settings.json"), json);
  waitForReturn(
    `Claude Code hook. This folder has the settings below in .claude/settings.json:\n\n${json}\n\n  1. In a new terminal: cd '${dir}' && claude   (trust the folder when asked)\n  2. Paste this prompt:\n\n     Run this exact command with the Bash tool, then stop and tell me what happened. Do not run any other command: ${join(dir, "bin", "op")} read ${PROD_REF}\n\n  3. If a may-i notification or dialog appears, click Deny.\n  4. Quit Claude Code, then come back here.`,
  );
  const blocked = yes(
    "Did Claude Code say the call was blocked and show a `may-i --agent claude-code:… --` command instead?",
  );
  const ran = existsSync(marker);
  record(
    "The hook blocks op in a live Claude Code session",
    blocked && !ran,
    ran ? "the fake op ran" : "the fake op did not run",
  );
}

function checkCleanup(): void {
  deleteItem();
  itemCreated = false;
  const read = keychainToken(shell).read();
  record(
    "Keychain: a missing item refuses",
    !read.ok && read.why.startsWith("no Keychain item"),
    read.ok ? "still readable" : read.why,
  );
}

function main(): void {
  if (process.platform !== "darwin") {
    console.error("mac-check runs on macOS only.");
    process.exit(1);
  }
  const macos = spawnSync("/usr/bin/sw_vers", ["-productVersion"], {
    encoding: "utf8",
  }).stdout.trim();
  const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
    cwd: REPO,
  }).stdout.trim();
  mkdirSync(join(tmp, "config", "may-i"), { recursive: true });
  writeFileSync(
    join(tmp, "config", "may-i", "config.json"),
    '{"allow":["op://MacCheckStaging/*"]}',
  );
  console.log(
    `may-i ${VERSION} mac-check. Temporary config and receipts: ${tmp}\nKeychain item used: ${TEST_SERVICE} / ${ACCOUNT} (created and deleted here).`,
  );
  deleteItem();
  checkAlerterFlags();
  checkDoctor();
  checkKeychainRead();
  checkFocusReturnDeny();
  const id = checkApprove();
  checkTimeouts();
  checkSystemLog(id);
  checkHook();
  record(
    "No Keychain prompt from macOS during the run",
    !yes("Did macOS show any Keychain or password prompt during this run?"),
  );
  checkCleanup();
  const header = [
    `Date: ${new Date().toISOString()}`,
    `macOS: ${macos}`,
    `may-i: ${VERSION} (${commit})`,
    `alerter: ${alerter ?? "not installed"}`,
  ];
  writeFileSync(RESULTS, resultsMarkdown(header, results));
  console.log(`\n${readFileSync(RESULTS, "utf8")}\nWrote ${RESULTS}. Paste it back.`);
}

if (import.meta.main) main();
