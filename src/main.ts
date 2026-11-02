#!/usr/bin/env node
/** The `may-i` executable: real processes, files and clock, handed to `runCli`. */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { constants, homedir } from "node:os";
import { runCli } from "./cli.js";
import { systemShell } from "./dialog.js";
import { EXIT_REFUSED, type Spawn } from "./gate.js";
import { fileSink } from "./receipts.js";

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

const spawn: Spawn = (argv, env) => {
  const [bin = "", ...args] = argv;
  const res = spawnSync(bin, args, { stdio: "inherit", env: { ...env } });
  if (res.error) {
    console.error(`may-i: could not start ${bin}: ${res.error.message}`);
    return 127;
  }
  if (res.status !== null) return res.status;
  // Killed by a signal: report it the way a shell would, 128 + its number.
  const signal = res.signal ? constants.signals[res.signal] : undefined;
  return signal === undefined ? 1 : 128 + signal;
};

let code: number;
try {
  code = runCli({
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
    readText,
    shell: systemShell,
    spawn,
    sinkFor: fileSink,
    clock: { now: () => new Date() },
    newId: randomUUID,
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  });
} catch (err) {
  // A gate that broke must never fall through to the command it stands in front of.
  console.error("may-i: failed before it could decide:", err);
  code = EXIT_REFUSED;
}
process.exit(code);
