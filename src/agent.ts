/**
 * Who is asking, in words the person approving can match to a window.
 *
 * A label, not authentication: any caller can pass any `--agent`. It answers
 * "which of my four sessions is this", which 1Password's own prompt cannot.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const UNNAMED = "a local shell";

const present = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

export function agentName(flag: string | undefined, env: Env): string {
  const named = present(flag) ?? present(env.MAY_I_AGENT);
  if (named) return named;
  // Claude Code's Bash tool sets CLAUDECODE=1 and CLAUDE_CODE_SESSION_ID in the
  // shells it runs (seen in practice; the hooks docs list neither). Eight
  // characters of the id tell two sessions apart by eye.
  if (env.CLAUDECODE === "1") {
    const session = present(env.CLAUDE_CODE_SESSION_ID);
    return session ? `claude-code:${session.slice(0, 8)}` : "claude-code";
  }
  return UNNAMED;
}
