/**
 * may-i as a library: the same core the CLI runs, for a tool that wants to put
 * its own prompt, its own spawner or its own subscribers around it.
 */

export type { Config } from "./config.js";
export { DEFAULT_CONFIG, loadConfig } from "./config.js";
export type {
  Answer,
  Credentials,
  Emitter,
  EventBody,
  EventType,
  GateEvent,
  Subscriber,
  SubscriberFailure,
  Tier,
} from "./events.js";
export { createEmitter } from "./events.js";
export type { Clock, GateDeps, GateRequest, GateResult, Spawn } from "./gate.js";
export { EXIT_REFUSED, gate } from "./gate.js";
export type { TokenRead, TokenSource } from "./keychain.js";
export type { Prompt, PromptAnswer, Question } from "./prompt.js";
export type { Receipt } from "./receipts.js";
export { parseReceipts, receiptFrom } from "./receipts.js";
export type { Found, ReadText, Sources } from "./references.js";
export { findReferences } from "./references.js";
export type { Finding } from "./verify.js";
export { verify } from "./verify.js";
