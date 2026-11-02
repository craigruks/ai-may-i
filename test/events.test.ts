// Proves the lifecycle is closed: only Approve runs anything, and a request ends at refused or exited.
import { describe, expect, it } from "bun:test";
import { ANSWER_RUNS, ANSWERS, ENDS_REQUEST } from "../src/events.js";

describe("events", () => {
  it("runs on exactly one answer: approve", () => {
    expect(ANSWERS.filter((a) => ANSWER_RUNS[a])).toEqual(["approve"]);
  });

  it("ends a request at refused or exited, and at no other event", () => {
    const ends = Object.entries(ENDS_REQUEST).filter(([, ends]) => ends);
    expect(ends.map(([type]) => type).sort()).toEqual(["exited", "refused"]);
  });
});
