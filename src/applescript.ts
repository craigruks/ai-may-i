/**
 * Text from the agent (its name, its reason, its command) is about to be
 * pasted into an AppleScript program that osascript compiles and runs. A quote
 * that closes the literal early turns the rest of that text into code:
 * `" & (do shell script "id") & "` would run `id` as the person at the Mac.
 *
 * So every string goes through `appleScriptString`, and the test suite fuzzes
 * it. AppleScript string literals know only `\"`, `\\`, `\n`, `\r` and `\t`;
 * escaping the backslash first is what keeps the other escapes from being undone.
 */

const ESCAPES: Readonly<Record<string, string>> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/** Characters with no business in a consent dialog. Control codes have no
 *  AppleScript escape, NUL cannot reach osascript's argv at all, and bidi
 *  overrides can make the text read differently from what it says. */
function unprintable(c: string): boolean {
  const code = c.codePointAt(0) ?? 0;
  return (
    code < 0x20 ||
    code === 0x7f ||
    (code >= 0x80 && code < 0xa0) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x200e && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

export const REPLACEMENT = "�";

/** One complete AppleScript string literal, quotes included. */
export function appleScriptString(text: string): string {
  let body = "";
  for (const c of text) {
    const escaped = ESCAPES[c];
    if (escaped !== undefined) body += escaped;
    else body += unprintable(c) ? REPLACEMENT : c;
  }
  return `"${body}"`;
}
