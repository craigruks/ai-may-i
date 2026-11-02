// Proves the lifecycle is closed (only Approve runs; a request ends at refused or exited)
// and that every subscriber sees every event, in one order, whatever another subscriber does.
import { describe, expect, it } from "bun:test";
import {
  ANSWER_RUNS,
  ANSWERS,
  createEmitter,
  ENDS_REQUEST,
  type GateEvent,
} from "../src/events.js";

describe("events", () => {
  it("runs on exactly one answer: approve", () => {
    expect(ANSWERS.filter((a) => ANSWER_RUNS[a])).toEqual(["approve"]);
  });

  it("ends a request at refused or exited, and at no other event", () => {
    const ends = Object.entries(ENDS_REQUEST).filter(([, ends]) => ends);
    expect(ends.map(([type]) => type).sort()).toEqual(["exited", "refused"]);
  });
});

const event = (id: string): GateEvent => ({
  id,
  at: "2026-10-31T09:00:00.000Z",
  type: "exited",
  code: 0,
});

describe("createEmitter", () => {
  it("delivers each event to every subscriber, in the order emitted", () => {
    const events = createEmitter();
    const seen: string[] = [];
    events.subscribe((e) => seen.push(`a:${e.id}`));
    events.subscribe((e) => seen.push(`b:${e.id}`));
    events.emit(event("1"));
    events.emit(event("2"));
    expect(seen).toEqual(["a:1", "b:1", "a:2", "b:2"]);
  });

  it("queues an event emitted mid-delivery, so no subscriber sees it out of order", () => {
    const events = createEmitter();
    const seen: string[] = [];
    events.subscribe((e) => {
      seen.push(`a:${e.id}`);
      if (e.id === "1") events.emit(event("2"));
    });
    events.subscribe((e) => seen.push(`b:${e.id}`));
    events.emit(event("1"));
    expect(seen).toEqual(["a:1", "b:1", "a:2", "b:2"]);
  });

  it("reports a throwing subscriber to the caller without starving the others", () => {
    const events = createEmitter();
    const seen: string[] = [];
    events.subscribe(() => {
      throw new Error("disk full");
    });
    events.subscribe((e) => seen.push(e.id));
    const failures = events.emit(event("1"));
    expect(seen).toEqual(["1"]);
    expect(failures.map((f) => [f.event.id, String(f.error)])).toEqual([["1", "Error: disk full"]]);
  });
});
