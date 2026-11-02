/**
 * The command as a person sees it and a receipt keeps it: every `op://`
 * reference intact, every literal that looks like a secret replaced by `***`.
 *
 * Best effort, and wrong in one direction only by design. may-i never needs a
 * value to decide, so masking too much costs a little readability and masking
 * too little is the failure to avoid. A secret these shapes miss is a reason
 * to pass it by reference instead.
 */

export const MASK = "***";

const SECRET_WORD = "(?:pass(?:word)?|passwd|token|secret|api-?key|private-?key|credentials?)";
const SECRET_FLAG = new RegExp(String.raw`^--?[\w-]*${SECRET_WORD}[\w-]*$`, "i");
const VALUE = String.raw`(?!op://)("[^"]*"|'[^']*'|[^\s'"]+)`;

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(Bearer|Basic)\s+[^\s'"]+/g, `$1 ${MASK}`],
  // --password=x or --api-token "x", whether one argv entry or inside a shell string.
  [new RegExp(String.raw`(--?[\w-]*${SECRET_WORD}[\w-]*)(=|\s+)${VALUE}`, "gi"), `$1$2${MASK}`],
  // Any NAME=value. Most are harmless (NODE_ENV=production); masking them all
  // is cheaper than deciding which names are secret. A reference is a name, so it stays.
  [new RegExp(String.raw`(^|[\s'"(;&|])([A-Za-z_]\w*)=${VALUE}`, "g"), `$1$2=${MASK}`],
  // The password in scheme://user:password@host.
  [/(\b[a-z][\w+.-]*:\/\/[^\s:/@'"]*:)[^\s@/'"]+@/gi, `$1${MASK}@`],
  // A JWT: three base64url parts joined by dots.
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, MASK],
];

/** A run of base64 or base64url. Not after `/`, `.` or `:`, and only whole runs,
 *  so a path, a file name or the item id inside a reference is never a candidate. */
const RUN = /(?<![\w/.:~+=-])[A-Za-z0-9+/_-]{32,}={0,2}(?![\w/.=])/g;

/** Mixed case and a digit keeps commit hashes and long-word names readable; few
 *  slashes keeps a long path readable while base64 with an odd `/` still goes. */
function tokenShaped(run: string): boolean {
  const slashes = run.split("/").length - 1;
  return /[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run) && slashes * 16 <= run.length;
}

export function redactText(text: string): string {
  const ruled = RULES.reduce((acc, [pattern, to]) => acc.replace(pattern, to), text);
  return ruled.replace(RUN, (run) => (tokenShaped(run) ? MASK : run));
}

export function redactArgv(argv: readonly string[]): string[] {
  return argv.map((arg, i) => {
    const prev = argv[i - 1];
    // `--api-token VALUE` as two argv entries: the value carries no marker of its own.
    if (prev !== undefined && SECRET_FLAG.test(prev) && !arg.startsWith("op://")) return MASK;
    return redactText(arg);
  });
}

const isControl = (c: string) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f;
const hasControl = (s: string) => [...s].some(isControl);

/** ANSI-C quoting, so a newline or escape code shows as text instead of moving
 *  the rest of the line out of view. */
function cQuote(arg: string): string {
  const named: Record<string, string> = { "\n": "\\n", "\t": "\\t", "\r": "\\r" };
  const body = [...arg]
    .map((c) => {
      if (c === "\\" || c === "'") return `\\${c}`;
      if (named[c]) return named[c];
      return isControl(c) ? `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}` : c;
    })
    .join("");
  return `$'${body}'`;
}

/** Paste-safe: each entry comes back as one argv entry in bash or zsh. Bare words
 *  stay bare, and `*` too, so the mask reads as a mask. */
export function shellLine(argv: readonly string[]): string {
  return argv
    .map((a) => {
      if (/^[\w.:/=@,+%*-]+$/.test(a)) return a;
      if (hasControl(a)) return cQuote(a);
      return `'${a.replaceAll("'", `'\\''`)}'`;
    })
    .join(" ");
}

export function redactCommand(argv: readonly string[]): string {
  return shellLine(redactArgv(argv));
}
