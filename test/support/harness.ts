/**
 * Fakes for the gate, each typed to the interface it stands in for, and the
 * check that makes the tripwires run after every test. bunfig.toml preloads
 * this file, so the `afterEach` below is global: any test whose gate emitted a
 * stream that breaks an invariant fails, whatever that test set out to check.
 */

import { afterEach } from "bun:test";
import { type Config, DEFAULT_CONFIG } from "../../src/config.js";
import { createEmitter, type GateEvent } from "../../src/events.js";
import type { Clock, GateDeps, Spawn } from "../../src/gate.js";
import type { TokenRead, TokenSource } from "../../src/keychain.js";
import type { Prompt, PromptAnswer, Question } from "../../src/prompt.js";
import { scan } from "../../src/tripwires.js";

export const CONFIG: Config = {
  ...DEFAULT_CONFIG,
  user: { allow: ["op://Staging/*"], ask: [], deny: ["op://Prod/root/*"] },
};

export const STAGING_ENV = { OP_SERVICE_ACCOUNT_TOKEN: "staging-sa-token-kept-by-the-caller" };

export const PROD_TOKEN = "prod-sa-token-from-the-keychain";

/** Each harness's stream during the current test, and the values none may hold. */
const ledger = { streams: [] as GateEvent[][], secrets: new Set<string>([PROD_TOKEN]) };

afterEach(() => {
  const trips = ledger.streams.flatMap((events) => scan(events, [...ledger.secrets]));
  ledger.streams = [];
  if (trips.length > 0) throw new Error(`tripwires: ${trips.join("; ")}`);
});

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

/** A Keychain that counts its reads, so a test can prove when it was not read. */
export function fakeKeychain(
  read: TokenRead = { ok: true, token: PROD_TOKEN },
): TokenSource & { reads: number } {
  const keychain = {
    reads: 0,
    read() {
      keychain.reads += 1;
      return read;
    },
  };
  return keychain;
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
  ledger.streams.push(events);
  let requests = 0;
  for (const value of Object.values(over.env ?? STAGING_ENV)) if (value) ledger.secrets.add(value);
  const { code: _, ...deps } = over;
  return {
    deps: {
      config: CONFIG,
      env: STAGING_ENV,
      cwd: "/work/repo",
      readText: () => null,
      prompt: fakePrompt(),
      token: fakeKeychain(),
      spawn,
      events: emitter,
      clock,
      newId: () => `r${++requests}`,
      ...deps,
    },
    events,
    spawned,
    types: () => events.map((e) => e.type),
  };
}
