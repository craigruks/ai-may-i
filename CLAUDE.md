# ai-may-i

may-i asks a person before an agent's command reaches production secrets in 1Password.
TypeScript, built and tested with Bun, run by Bun or Node 22. Zero runtime dependencies.
The prompt is macOS only.

## Commands

```sh
just check                       # lint, typecheck, limits, tests: every commit passes it
just test test/lifecycle.test.ts # one file
just build                       # bin/may-i, bin/may-i-hook, dist/
just mac-check                   # on a Mac, by hand
```

## Where things are

- `src/gate.ts` decides and acts. It reports only through events (`src/events.ts`).
- Receipts, the system log, tripwires and observers are subscribers to those events.
- `spec/*.json` is the behaviour every implementation must pass. The tests read it.
- `test/support/harness.ts` runs the tripwires after every test.

## Rules the code cannot check

- Fail closed. A new way for a request to end refuses, unless it is the allow tier or an
  Approve. Add it to `spec/lifecycle.json` with its exact event sequence.
- Change behaviour in `spec/` first, then the code. v0.2 (Rust) must pass the same files.
- Call each macOS helper by absolute path (`/usr/bin/osascript`, `/usr/bin/security`,
  `/usr/bin/logger`). The agent being gated sets PATH. `alerter` is the one exception,
  because it can only open the dialog.
- No terminal prompt. The agent owns the terminal, so a y/N it can type is no consent.
- A repo file can only tighten. A new config key is user-only, unless adding it can only
  make a decision stricter.
- A subscriber cannot change an outcome. One that throws before the spawn refuses the
  run, so a request that was not recorded never runs.
- No secret value in an error message, a log line or a test's failure output. The
  tripwires check events only.
- Text from the agent reaches osascript only through `appleScriptString`.
- Tests and scripts never touch the prod Keychain item (service `ai-may-i`) or 1Password.
  Fakes are typed to the interface they replace (`MacShell`, `Prompt`, `TokenSource`),
  never cast with `as any` or `as never`.
- One idea per commit, with its test. Conventional commit messages.
- Comments say why. No em dashes anywhere.
- Docs: reference text matches `src/` (`test/docs.test.ts` checks the flags, recipes,
  paths and links). A section marked `<!-- VOICE: ... -->` is the author's to write.
  Leave it as it is.
