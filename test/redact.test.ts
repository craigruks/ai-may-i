// Proves what a person is shown (and a receipt keeps) never holds a secret-looking value,
// keeps every reference readable, and pastes back into a shell as the same command.
// The cases live in spec/redact.json, so every implementation runs the same ones.
import { describe, expect, it } from "bun:test";
import spec from "../spec/redact.json" with { type: "json" };
import { redactCommand, redactText, shellLine } from "../src/redact.js";

describe("redactCommand: references stay, values go", () => {
  it.each(spec.redactCommand)("$name", ({ argv, shown }) => {
    expect(redactCommand(argv)).toBe(shown);
  });

  it("is idempotent, so a receipt can be checked by redacting it again", () => {
    for (const { shown } of spec.redactCommand) expect(redactText(shown)).toBe(shown);
  });
});

describe("shellLine: what is shown pastes back as the same argv", () => {
  it.each(spec.shellLine)("$name", ({ argv, line }) => {
    expect(shellLine(argv)).toBe(line);
  });

  it("never lets a control character through raw", () => {
    for (const { line } of spec.shellLine) {
      expect([...line].every((c) => c.charCodeAt(0) >= 0x20)).toBe(true);
    }
  });
});
