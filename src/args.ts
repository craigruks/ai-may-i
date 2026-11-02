import { MAX_TIMEOUT_SECONDS } from "./config.js";

/** sysexits.h EX_USAGE. */
export const EXIT_USAGE = 64;

export const USAGE = `may-i [--agent <id>] [--reason <text>] [--timeout <s>] -- <command…>
may-i log [--agent <id>] [--since <30m|12h|7d|date>]
may-i verify
may-i doctor

Runs <command> if its 1Password references are in the allow tier; asks you
first if they are in the ask tier, and gives it the prod token only on Approve;
refuses if any is in the deny tier.

  --agent <id>      who is asking (default: $MAY_I_AGENT, or detected)
  --reason <text>   why, in the agent's words; shown in the prompt and the receipt
  --timeout <s>     wait less than the config's timeout (120 s by default); silence refuses
  log               what each agent ran or was refused, from the receipts
  verify            re-judge every receipt; exits 1 if any shows the gate did not hold
  doctor            check this Mac is set up: Keychain item, receipts, alerter
  -h, --help        this text
  -v, --version     the version

Exit: the command's own code when it ran; 77 when refused; 64 on misuse.`;

export type Parsed =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "log"; agent?: string; since?: string }
  | { kind: "verify" }
  | { kind: "doctor" }
  | {
      kind: "run";
      command: string[];
      agent?: string;
      reason?: string;
      timeoutSeconds?: number;
    };

type Options = Omit<Extract<Parsed, { kind: "run" }>, "kind" | "command">;

function timeoutOf(raw: string): number | string {
  const n = Number(raw);
  return /^\d+$/.test(raw) && n >= 1 && n <= MAX_TIMEOUT_SECONDS
    ? n
    : `--timeout takes whole seconds from 1 to ${MAX_TIMEOUT_SECONDS}, not "${raw}"`;
}

/** Applies one valued option; returns how many argv entries it took, or an error. */
function takeOption(argv: readonly string[], i: number, opts: Options): number | string {
  const arg = argv[i] ?? "";
  const eq = arg.indexOf("=");
  const flag = eq === -1 ? arg : arg.slice(0, eq);
  const inline = eq === -1 ? undefined : arg.slice(eq + 1);
  const value = inline ?? argv[i + 1];
  if (!["--agent", "--reason", "--timeout"].includes(flag)) return `unknown option ${arg}`;
  if (value === undefined) return `${flag} needs a value`;
  if (flag === "--timeout") {
    const t = timeoutOf(value);
    if (typeof t === "string") return t;
    opts.timeoutSeconds = t;
  } else {
    opts[flag === "--agent" ? "agent" : "reason"] = value;
  }
  return inline === undefined ? 2 : 1;
}

const misuse = (message: string): Parsed => ({ kind: "error", message });

/** What argv[i] means: a finished parse, or how many entries it took. */
function readAt(argv: readonly string[], i: number, opts: Options): Parsed | number {
  const arg = argv[i] ?? "";
  if (arg === "--") {
    const command = argv.slice(i + 1);
    return command.length > 0
      ? { kind: "run", ...opts, command }
      : misuse("nothing to run after --");
  }
  if (arg === "-h" || arg === "--help") return { kind: "help" };
  if (arg === "-v" || arg === "--version") return { kind: "version" };
  if (!arg.startsWith("-")) return misuse(`put -- before the command: ${arg}`);
  const used = takeOption(argv, i, opts);
  return typeof used === "string" ? misuse(used) : used;
}

/**
 * `--` is required before the command. Without it, a misspelt option (`--yes`)
 * would become the program to run, at the one moment a surprise costs most,
 * and a program called `log` could not be told from the subcommand.
 */
export function parseArgs(argv: readonly string[]): Parsed {
  if (argv[0] === "log") return parseLog(argv.slice(1));
  if (argv[0] === "verify" || argv[0] === "doctor") {
    return argv.length === 1 ? { kind: argv[0] } : misuse(`${argv[0]} takes no options`);
  }
  const opts: Options = {};
  for (let i = 0; i < argv.length; ) {
    const read = readAt(argv, i, opts);
    if (typeof read !== "number") return read;
    i += read;
  }
  return misuse("nothing to run: expected -- <command…>");
}

function parseLog(argv: readonly string[]): Parsed {
  const out: Extract<Parsed, { kind: "log" }> = { kind: "log" };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag !== "--agent" && flag !== "--since") return misuse(`log: unknown option ${flag}`);
    if (value === undefined) return misuse(`log: ${flag} needs a value`);
    out[flag === "--agent" ? "agent" : "since"] = value;
  }
  return out;
}
