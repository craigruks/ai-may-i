/** Fakes for the gate, each typed to the interface it stands in for. */

import { type Config, DEFAULT_CONFIG } from "../../src/config.js";
import { createEmitter, type GateEvent } from "../../src/events.js";
import type { Clock, GateDeps, Spawn } from "../../src/gate.js";
import type { Prompt, PromptAnswer, Question } from "../../src/prompt.js";

export const CONFIG: Config = {
  ...DEFAULT_CONFIG,
  user: { allow: ["op://Staging/*"], ask: [], deny: ["op://Prod/root/*"] },
};

export const STAGING_ENV = { OP_SERVICE_ACCOUNT_TOKEN: "staging-sa-token-kept-by-the-caller" };

export const clock: Clock = { now: () => new Date("2026-10-31T09:00:00.000Z") };

/** A prompt that answers from a script and keeps every question it was asked. */
export function fakePrompt(
  answer: PromptAnswer = { answer: "approve", via: "dialog", detail: null },
): Prompt & { asked: Question[] } {
  const asked: Question[] = [];
  return {
    asked,
    unavailable: null,
    ask(question) {
      asked.push(question);
      return answer;
    },
  };
}

export interface Harness {
  deps: GateDeps;
  events: GateEvent[];
  spawned: { argv: readonly string[]; env: Readonly<Record<string, string | undefined>> }[];
  types(): string[];
}

export function harness(over: Partial<GateDeps> & { code?: number } = {}): Harness {
  const events: GateEvent[] = [];
  const spawned: Harness["spawned"] = [];
  const spawn: Spawn = (argv, env) => {
    spawned.push({ argv, env });
    return over.code ?? 0;
  };
  const emitter = createEmitter();
  emitter.subscribe((e) => events.push(e));
  const { code: _, ...deps } = over;
  return {
    deps: {
      config: CONFIG,
      env: STAGING_ENV,
      cwd: "/work/repo",
      readText: () => null,
      prompt: fakePrompt(),
      spawn,
      events: emitter,
      clock,
      newId: () => "r1",
      ...deps,
    },
    events,
    spawned,
    types: () => events.map((e) => e.type),
  };
}
