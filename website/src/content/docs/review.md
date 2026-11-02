---
title: Review methodology and limits
description: How may-i is checked before a change lands, what that review is not, and where findings go.
---

may-i is **not audited** and is **not a security guarantee** (see
[SECURITY.md](https://github.com/craigruks/ai-may-i/blob/main/SECURITY.md)). This page
lists how changes are checked, so the process and its limits are in the open.

<!-- VOICE: brief 7 (review methodology intro) -->
Every change is checked by the same commands, listed below, and a change to the Mac path also gets a check by hand.

## What this is not

- Not an external audit. No third party has reviewed this code.
- Not formal verification. No property here has a machine-checked proof.
- Not a substitute for your own review. The files are capped under 300 lines, and the
  runtime has no dependencies, so you can read all of it.

## What every commit passes

`just check`, on each commit on its own:

| Step | What it checks |
| --- | --- |
| `just lint` | Biome's recommended rules, plus no `any`, no non-null assertion, a cap on cognitive complexity, and no `Bun` global or `bun:*` import in `src/`, so the code runs on Node too. |
| `just typecheck` | `tsc` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch` and `verbatimModuleSyntax`, over `src/`, `test/` and `scripts/`. |
| `just limits` | No runtime dependencies, and no file of 300 lines or more. |
| `just test` | Every test, with the tripwires run after each one. |

## How the tests are built

- The behaviour is data in [`spec/`](https://github.com/craigruks/ai-may-i/blob/main/spec/README.md):
  every ending of a request, the tiers, redaction, AppleScript escaping and the hook's
  lexer. The tests run every vector, and v0.2 must pass the same files.
- Every fake is typed to the interface it replaces (`MacShell`, `Prompt`, `TokenSource`,
  `Spawn`), so a fake cannot test an API that does not exist.
- [`test/support/harness.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/support/harness.ts)
  runs the tripwires over every test's events. A test that lets a token into an event, or
  spawns without an Approve, fails, whatever it set out to check.
- The AppleScript escaper runs a seeded fuzz corpus, defined in
  `spec/applescript.json`, as well as the known injection forms.
- A fix lands with the vectors that pin it. `fix(config): a broken repo file asks for
  everything` adds the broken-repo-file cases to `spec/tiers.json` with the fix.
- [`test/docs.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/docs.test.ts)
  checks that every flag, recipe, path and link these docs show exists in the code.

## What CI runs

| Job | What it proves |
| --- | --- |
| Linux | `just check`, `just build`, `just --dry-run` on every example recipe, and that the example env files have `op://` references only. |
| Node 22 | The built `dist/` JS prints its version, and refuses an ask-tier command with exit 77 and a receipt. |
| macOS, headless | With nobody there to click, an ask-tier command exits 77 and runs nothing, and `may-i doctor` fails with no Keychain item. |

The workflows are
[`.github/workflows/ci.yml`](https://github.com/craigruks/ai-may-i/blob/main/.github/workflows/ci.yml)
and [`.github/workflows/macos.yml`](https://github.com/craigruks/ai-may-i/blob/main/.github/workflows/macos.yml).

## What a person checks

CI cannot click a dialog, watch focus, or start Claude Code. Before a release, and after a
change to the Mac path, a person runs the
[manual checklist](https://github.com/craigruks/ai-may-i/blob/main/docs/manual-test.md)
with `just mac-check`, and pastes the results file into the pull request.

## Limits of this review

- On a Mac, the dialog, the notification and the Keychain are checked by hand. CI checks
  them with fakes.
- The hook's lexer is checked against the cases in `spec/hook-lex.json`. A form not in
  that file is not checked.
- Redaction is checked against the forms in `spec/redact.json`. A secret in another form
  can get through.
- Every known limit of v0.1 is in SECURITY.md and on the
  [coverage map](/ai-may-i/coverage-map/).

## Where findings go

Report a suspected vulnerability privately, per
[SECURITY.md](https://github.com/craigruks/ai-may-i/blob/main/SECURITY.md).
