/**
 * Just enough of a shell lexer to say which programs a command line runs, and
 * behind which others. `ls && sudo op read x` runs `ls`, `sudo`, and `op` behind
 * `sudo`.
 *
 * Simple commands split on `;`, `&`, `|`, newlines and parentheses outside
 * quotes. `$(…)`, backticks and `<(…)` are lifted out as commands of their own:
 * the shell runs them before the command they sit in starts, so they run behind
 * nothing on that line. `bash -c '…'` and `eval …` are followed into.
 *
 * It is not a shell parser and is honest about it: a program named by a
 * variable (`$OP read`), or run from inside a script file, is invisible here.
 */

const BREAKS = new Set([";", "&", "|", "(", ")", "\n"]);

interface Lexed {
  segments: string[][];
  nested: string[];
}

/** The body of a `$(…)` or `<(…)` whose paren is at `open`, and where it ends.
 *  Unterminated runs to the end, which keeps whatever it holds in view. */
function readParens(s: string, open: number): { body: string; end: number } {
  let depth = 1;
  let quote: string | null = null;
  for (let j = open + 1; j < s.length; j++) {
    const c = s[j];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return { body: s.slice(open + 1, j), end: j };
  }
  return { body: s.slice(open + 1), end: s.length };
}

function readBackticks(s: string, open: number): { body: string; end: number } {
  for (let j = open + 1; j < s.length; j++) {
    if (s[j] === "\\") j++;
    else if (s[j] === "`") return { body: s.slice(open + 1, j), end: j };
  }
  return { body: s.slice(open + 1), end: s.length };
}

function substitutionAt(s: string, i: number, quoted: boolean) {
  const [c, next] = [s[i], s[i + 1]];
  if (c === "`") return readBackticks(s, i);
  if (c === "$" && next === "(") return readParens(s, i + 1);
  if (!quoted && (c === "<" || c === ">") && next === "(") return readParens(s, i + 1);
  return null;
}

/** One character at a time; `step` returns the index of the last one it used. */
class Lexer {
  readonly segments: string[][] = [];
  readonly nested: string[] = [];
  private words: string[] = [];
  private word = "";
  private inWord = false;
  private quote: "'" | '"' | null = null;

  constructor(private readonly s: string) {}

  private add(text: string): void {
    this.word += text;
    this.inWord = true;
  }

  private endWord(): void {
    if (this.inWord) this.words.push(this.word);
    this.word = "";
    this.inWord = false;
  }

  endSegment(): void {
    this.endWord();
    if (this.words.length > 0) this.segments.push(this.words);
    this.words = [];
  }

  step(i: number): number {
    const c = this.s[i] ?? "";
    if (this.quote === "'") {
      if (c === "'") this.quote = null;
      else this.word += c;
      return i;
    }
    if (c === "\\") {
      this.add(this.s[i + 1] ?? "");
      return i + 1;
    }
    const sub = substitutionAt(this.s, i, this.quote !== null);
    if (sub) {
      this.nested.push(sub.body);
      this.add("$_");
      return sub.end;
    }
    if (this.quote === '"') {
      if (c === '"') this.quote = null;
      else this.word += c;
      return i;
    }
    return this.unquoted(c, i);
  }

  private unquoted(c: string, i: number): number {
    if (c === "'" || c === '"') {
      this.quote = c;
      this.inWord = true;
    } else if (BREAKS.has(c)) this.endSegment();
    else if (c === " " || c === "\t") this.endWord();
    else if (c === "#" && !this.inWord) {
      const nl = this.s.indexOf("\n", i);
      return nl === -1 ? this.s.length : nl - 1;
    } else this.add(c);
    return i;
  }
}

function lex(line: string): Lexed {
  const lexer = new Lexer(line);
  for (let i = 0; i < line.length; i++) i = lexer.step(i);
  lexer.endSegment();
  return { segments: lexer.segments, nested: lexer.nested };
}

export interface Program {
  /** The program's file name: `/opt/homebrew/bin/op` is `op`. */
  name: string;
  /** Its words, from the program on, quotes removed. */
  words: string[];
  /** What it runs behind, outermost first: `["may-i", "bash"]`. */
  behind: string[];
}

/** Programs that run the rest of their words as a command, and the options of
 *  theirs that take a value, so the value is not mistaken for the program. */
const WRAPPERS: Readonly<Record<string, readonly string[]>> = {
  command: [],
  exec: ["-a"],
  nohup: [],
  time: ["-f", "-o"],
  nice: ["-n"],
  env: ["-u", "-C", "-S", "--unset", "--chdir"],
  sudo: ["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"],
  doas: ["-u", "-C"],
  xargs: ["-n", "-I", "-L", "-P", "-d", "-s", "-E", "-a"],
  timeout: ["-s", "-k", "--signal", "--kill-after"],
  caffeinate: ["-t", "-w"],
  npx: ["-p", "--package"],
  bunx: ["-p", "--package"],
  pnpx: [],
  "may-i": ["--agent", "--reason", "--timeout"],
};
const RUNNER_VERBS = new Set([
  "pnpm exec",
  "pnpm dlx",
  "npm exec",
  "yarn dlx",
  "yarn exec",
  "bun x",
]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const MAX_DEPTH = 6;
/** Stands in for a line nested deeper than MAX_DEPTH, which nobody types by hand. */
export const TOO_DEEP = "(nested too deep to follow)";

const base = (word: string) => word.slice(word.lastIndexOf("/") + 1);
const isAssignment = (word: string) => /^[A-Za-z_]\w*=/.test(word);

/** Past a wrapper's options (and env's assignments) to the next word that is not one. */
function skipOptions(
  words: readonly string[],
  from: number,
  valued: readonly string[],
  env: boolean,
) {
  let i = from;
  for (let w = words[i]; w !== undefined; w = words[i]) {
    if (w === "--") return i + 1;
    if (w.startsWith("-")) i += valued.includes(w) ? 2 : 1;
    else if (env && isAssignment(w)) i += 1;
    else break;
  }
  return i;
}

/** Where the wrapped command starts. `timeout` takes its duration first. */
function wrappedStart(name: string, words: readonly string[], from: number): number {
  const at = skipOptions(words, from, WRAPPERS[name] ?? [], name === "env");
  return name === "timeout" ? at + 1 : at;
}

function inSegment(words: readonly string[], behind: string[], depth: number): Program[] {
  let at = 0;
  while (words[at] !== undefined && isAssignment(words[at] ?? "")) at++;
  const head = words[at];
  if (head === undefined) return [];
  const name = base(head);
  const self: Program = { name, words: words.slice(at), behind };
  const pair = `${name} ${words[at + 1] ?? ""}`;
  const isWrapper = name in WRAPPERS || RUNNER_VERBS.has(pair);
  if (isWrapper) {
    const start = wrappedStart(name, words, at + (RUNNER_VERBS.has(pair) ? 2 : 1));
    return [self, ...inSegment(words.slice(start), [...behind, name], depth)];
  }
  if (SHELLS.has(name)) {
    const flag = words.findIndex((w, i) => i > at && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w));
    const script = flag === -1 ? undefined : words[flag + 1];
    return script === undefined ? [self] : [self, ...walk(script, [...behind, name], depth + 1)];
  }
  if (name === "eval")
    return [self, ...walk(words.slice(at + 1).join(" "), [...behind, name], depth + 1)];
  return [self];
}

function walk(line: string, behind: string[], depth: number): Program[] {
  if (depth > MAX_DEPTH) return [{ name: TOO_DEEP, words: [line], behind }];
  const { segments, nested } = lex(line);
  return [
    ...nested.flatMap((n) => walk(n, behind, depth + 1)),
    ...segments.flatMap((words) => inSegment(words, behind, depth)),
  ];
}

export function programsIn(line: string): Program[] {
  return walk(line, [], 0);
}
