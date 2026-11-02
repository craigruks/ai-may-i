/**
 * The gate: find what a command reaches, decide its tier, then run it or
 * refuse. It reports itself only through events; whatever records, checks or
 * shows a request is a subscriber, so none of that code lives here.
 *
 * Every dependency is passed in, so the whole path runs in tests with no Mac,
 * no vault and no child process.
 */

import { basename } from "node:path";
import { agentName } from "./agent.js";
import { type Config, effectiveRules } from "./config.js";
import { ANSWER_RUNS, type Emitter, type EventBody, type GateEvent } from "./events.js";
import { decide } from "./policy.js";
import type { Prompt, PromptAnswer, Question } from "./prompt.js";
import { redactCommand, redactText } from "./redact.js";
import { findReferences, type ReadText } from "./references.js";

type Env = Readonly<Record<string, string | undefined>>;

/** sysexits.h EX_NOPERM: distinct from what a command usually returns, so a
 *  script can tell "refused" from "ran and failed". */
export const EXIT_REFUSED = 77;

export interface GateRequest {
  command: readonly string[];
  agent?: string | undefined;
  reason?: string | undefined;
  /** Shortens the config's timeout for this one request. */
  timeoutSeconds?: number | undefined;
}

/** Runs the command to completion and returns its exit code. */
export type Spawn = (argv: readonly string[], env: Env) => number;

export interface Clock {
  now(): Date;
}

export interface GateDeps {
  config: Config;
  env: Env;
  cwd: string;
  readText: ReadText;
  prompt: Prompt;
  spawn: Spawn;
  events: Emitter;
  clock: Clock;
  newId: () => string;
}

export interface GateResult {
  ran: boolean;
  /** The command's own exit code when it ran; EXIT_REFUSED when it did not. */
  code: number;
}

/** A prompt that throws has not answered, and only an answer can approve. */
function askSafely(prompt: Prompt, question: Question): PromptAnswer {
  try {
    return prompt.ask(question);
  } catch (err) {
    return {
      answer: "error",
      via: "prompt",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** One request's view of the event stream: stamps each event, and counts the
 *  subscribers that failed to see one. */
function stream(deps: GateDeps) {
  const id = deps.newId();
  let missed = 0;
  const emit = (body: EventBody) => {
    const event: GateEvent = { ...body, id, at: deps.clock.now().toISOString() };
    missed += deps.events.emit(event).length;
  };
  const refuse = (why: string): GateResult => {
    emit({ type: "refused", why });
    return { ran: false, code: EXIT_REFUSED };
  };
  return { id, emit, refuse, missed: () => missed };
}

export function gate(request: GateRequest, deps: GateDeps): GateResult {
  const program = request.command[0];
  if (program === undefined) throw new TypeError("gate: the command is empty");
  const { id, emit, refuse, missed } = stream(deps);
  const { config } = deps;

  const who = {
    agent: agentName(request.agent, deps.env),
    command: redactCommand(request.command),
    reason: request.reason ? redactText(request.reason) : null,
    cwd: deps.cwd,
  };
  emit({ type: "requested", ...who });
  const found = findReferences(request.command, {
    cwd: deps.cwd,
    env: deps.env,
    readText: deps.readText,
    fileFlags: config.fileFlags,
    scanFiles: config.scanFiles,
  });
  emit({ type: "references-found", ...found });
  const decision = decide(found, effectiveRules(config));
  const userTier = decide(found, config.user).tier;
  emit({ type: "tier-decided", ...decision, userTier });

  if (decision.tier === "deny") return refuse(`deny tier: ${decision.why}`);
  if (decision.tier === "ask") {
    // Shorter only: the agent writes the request, and the config is the person's.
    const timeoutSeconds = Math.min(request.timeoutSeconds ?? Infinity, config.timeoutSeconds);
    const question: Question = { ...who, ...found, id, timeoutSeconds };
    if (deps.prompt.unavailable !== null) return refuse(`cannot ask: ${deps.prompt.unavailable}`);
    emit({ type: "asked", timeoutSeconds });
    const answer = askSafely(deps.prompt, question);
    emit({ type: "answered", ...answer });
    if (!ANSWER_RUNS[answer.answer]) return refuse(`not approved: ${answer.answer}`);
  }

  emit({ type: "allowed", credentials: "caller" });
  // A subscriber that could not see the request is a record that does not exist.
  if (missed() > 0) return refuse(`${missed()} event subscriber(s) failed before the run`);
  emit({ type: "spawned", program: basename(program) });
  const code = deps.spawn(request.command, deps.env);
  emit({ type: "exited", code });
  return { ran: true, code };
}
