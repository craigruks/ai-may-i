#!/usr/bin/env node
/** The `may-i-hook` executable: stdin in, a decision out. Logic lives in hook.ts. */

import { readFileSync } from "node:fs";
import { runHook } from "./hook.js";

const result = runHook(process.argv.slice(2), readFileSync(0, "utf8"));
if (result.stdout) process.stdout.write(`${result.stdout}\n`);
if (result.stderr) process.stderr.write(`${result.stderr}\n`);
process.exit(result.code);
