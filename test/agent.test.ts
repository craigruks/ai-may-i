// Proves the prompt always names who is asking, in a fixed order of precedence.
import { describe, expect, it } from "bun:test";
import { agentName } from "../src/agent.js";

const claude = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "bc3851a2-3667-4d1e-9a1f" };

describe("agentName", () => {
  it.each([
    ["the --agent flag first", "reviewer-2", { ...claude, MAY_I_AGENT: "codex-1" }, "reviewer-2"],
    ["then MAY_I_AGENT", undefined, { ...claude, MAY_I_AGENT: "codex-1" }, "codex-1"],
    ["then the Claude Code session", undefined, claude, "claude-code:bc3851a2"],
    ["then Claude Code without a session", undefined, { CLAUDECODE: "1" }, "claude-code"],
    ["else a local shell", undefined, {}, "a local shell"],
    ["treating a blank name as none", "  ", { MAY_I_AGENT: "" }, "a local shell"],
  ])("uses %s", (_, flag, env, name) => {
    expect(agentName(flag, env)).toBe(name);
  });
});
