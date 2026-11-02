/**
 * What a prompt is asked and how it answers. The gate depends on this and on
 * nothing macOS-specific, so the whole decision runs in tests with a fake.
 */

import { basename } from "node:path";
import type { Answer } from "./events.js";

export interface Question {
  id: string;
  agent: string;
  /** Already redacted and paste-safe. */
  command: string;
  /** The agent's own words, so shown as its claim and never as the headline. */
  reason: string | null;
  references: readonly string[];
  unreadable: readonly string[];
  cwd: string;
  timeoutSeconds: number;
}

export interface PromptAnswer {
  answer: Answer;
  /** How it was answered, for the receipt: "dialog", "notification". */
  via: string;
  detail: string | null;
}

export interface Prompt {
  /** Why it cannot ask here, or null when it can. Checked before anything is
   *  shown, so "nobody could be asked" never reads as "asked, no answer". */
  readonly unavailable: string | null;
  ask(question: Question): PromptAnswer;
}

const MAX_LISTED = 12;

function reach(q: Question): string[] {
  const unread = q.unreadable.map((f) => `! Could not read ${f}, so what it holds is unknown.`);
  if (q.references.length === 0) {
    return [
      "! No 1Password reference could be read, so nothing says what this reaches.",
      ...unread,
    ];
  }
  const shown = q.references.slice(0, MAX_LISTED).map((r) => `  - ${r}`);
  const rest = q.references.length - shown.length;
  const n = q.references.length;
  return [
    `Reaches ${n} 1Password ${n === 1 ? "reference" : "references"}:`,
    ...shown,
    ...(rest > 0 ? [`  ... and ${rest} more`] : []),
    ...unread,
  ];
}

/**
 * Plain lines, command first. The command is the one line that answers "should
 * I approve this"; a window that leads with a label gets approved on its shape.
 */
export function renderQuestion(q: Question): string {
  return [
    q.command,
    "",
    `Asked by ${q.agent}`,
    // The checkout, not the repo: worktrees share one vault, so this says which one.
    `In ${basename(q.cwd)}`,
    ...(q.reason ? [`The agent says: "${q.reason}"`] : []),
    "",
    ...reach(q),
    "",
    "Approve gives this one command the production token.",
  ].join("\n");
}
