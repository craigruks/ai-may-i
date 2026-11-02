// Proves observers watch and never decide: they see the events they name, a failing one
// is recorded as an event, no observer can change an outcome, and only the user names them.
import { describe, expect, it } from "bun:test";
import { type LoadInput, loadConfig } from "../src/config.js";
import { gate } from "../src/gate.js";
import { type Observer, observe, type Runner } from "../src/observers.js";
import { receiptWriter } from "../src/receipts.js";
import { fakePrompt, harness } from "./support/harness.js";

const PROD = ["op", "read", "op://Prod/db/password"];

function watched(observers: Observer[], run: Runner, answer: "approve" | "deny" = "approve") {
  const h = harness({ prompt: fakePrompt({ answer, via: "dialog", detail: null }) });
  const receipts: string[] = [];
  h.deps.events.subscribe(observe(observers, run, h.deps.events));
  h.deps.events.subscribe(receiptWriter({ open() {}, append: (l) => receipts.push(l) }));
  return { h, result: gate({ command: PROD }, h.deps), receipts };
}

describe("observe", () => {
  it("runs each observer on the events it names, with the event as JSON on stdin", () => {
    const seen: [string, string][] = [];
    const run: Runner = (argv, input) => {
      seen.push([argv.join(" "), JSON.parse(input).type]);
      return null;
    };
    watched(
      [
        { on: ["asked"], run: ["say", "asked"] },
        { on: ["*"], run: ["tee"] },
      ],
      run,
    );
    expect(seen.filter(([cmd]) => cmd === "say asked")).toEqual([["say asked", "asked"]]);
    expect(seen.filter(([cmd]) => cmd === "tee")).toHaveLength(8);
  });

  it("records a failing observer as an event in the receipt, and the run goes on", () => {
    const { h, result, receipts } = watched(
      [{ on: ["asked"], run: ["hook"] }],
      () => "it exited 1",
    );
    expect(result.ran).toBe(true);
    const failed = { type: "observer-failed", observer: "hook", on: "asked", why: "it exited 1" };
    expect(h.events).toContainEqual(expect.objectContaining(failed));
    expect(JSON.parse(receipts[0] ?? "{}").events).toContainEqual(expect.objectContaining(failed));
  });

  it("cannot change an outcome: not by succeeding, failing or throwing", () => {
    const throwing: Runner = () => {
      throw new Error("ENOENT");
    };
    expect(watched([{ on: ["*"], run: ["x"] }], () => null, "deny").result.ran).toBe(false);
    expect(watched([{ on: ["*"], run: ["x"] }], throwing, "deny").result.ran).toBe(false);
    expect(watched([{ on: ["*"], run: ["x"] }], throwing).result.ran).toBe(true);
  });
});

describe("observers in config", () => {
  const USER = "/home/u/.config/may-i/config.json";
  const REPO = "/work/repo/.may-i.json";
  const input = (files: Record<string, string>): LoadInput => ({
    env: {},
    home: "/home/u",
    cwd: "/work/repo",
    readText: (p) => files[p] ?? null,
  });
  const observers = '{"observers":[{"on":["refused"],"run":["say","refused"]}]}';

  it("come from the user's file, and a repo file's are ignored out loud", () => {
    expect(loadConfig(input({ [USER]: observers })).config.observers).toEqual([
      { on: ["refused"], run: ["say", "refused"] },
    ]);
    const fromRepo = loadConfig(input({ [REPO]: observers }));
    expect(fromRepo.config.observers).toEqual([]);
    expect(fromRepo.warnings.join("\n")).toContain("ignored `observers`");
  });

  it("must name real event types", () => {
    const bad = '{"observers":[{"on":["finished"],"run":["say"]}]}';
    expect(loadConfig(input({ [USER]: bad })).warnings[0]).toContain("must list event types");
  });
});
