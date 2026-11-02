---
title: Objection handling
description: The hardest questions about may-i, each answered straight.
---

The questions a skeptical developer or security reviewer asks first, with the facts each
answer rests on.

## Isn't Touch ID already enough?

<!-- VOICE: brief 6 (objection 1: Isn't Touch ID already enough?) -->

The answer covers:

- What 1Password's prompt for a terminal session says, and that it does not say which
  agent, which command or which credential.
- What one Touch ID approval unlocks: the whole account, for the session (brief 5 says 10
  minutes).
- What one may-i Approve unlocks: one run of one command, with a service account that
  reaches only the vaults it was given. Every request asks again
  ([`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts),
  "asks again for every request").
- That a service account can be revoked without touching your own account.

## Can't an agent just get around the hook?

<!-- VOICE: brief 6 (objection 2: Can't an agent just get around the hook?) -->

The answer covers:

- Yes. The hook cannot see `op` behind a variable, inside a script file, or fed to a shell
  on stdin. Each is a known-limit row in
  [`spec/hook-lex.json`](https://github.com/craigruks/ai-may-i/blob/main/spec/hook-lex.json).
- The hook catches an agent that forgets. It is a seatbelt. The boundary is where the prod
  token is kept.
- A command that goes around may-i runs with the agent's own environment, which has the
  staging token at most.
- The prod token is only in the Keychain item, and in v0.1 any process that runs as you
  can read that item with `/usr/bin/security`. v0.2 makes the item trust may-i's
  signature alone.

## Why does it handle the service-account token at all? Isn't that a new risk?

<!-- VOICE: brief 6 (objection 3: Why does it handle the service-account token at all?) -->

The answer covers:

- The other options: the prod token in every agent's environment, or no prod access for
  agents at all.
- may-i reads the token only after an Approve, and not at all on any other ending
  (`keychainReads` in
  [`spec/lifecycle.json`](https://github.com/craigruks/ai-may-i/blob/main/spec/lifecycle.json)).
- It puts the token in the approved command's environment and nowhere else. The tripwires
  refuse any event that has it, inline and after every test
  ([`src/tripwires.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/tripwires.ts)).
- Receipts, the system log and observers are built from events, so none of them can have it.

## Why TypeScript and not Rust?

<!-- VOICE: brief 6 (objection 4: Why TypeScript and not Rust?) -->

The answer covers:

- v0.1 is TypeScript with zero runtime dependencies, under 300 lines a file, and runs
  compiled by Bun or as plain JS on Node 22.
- v0.2 moves to Rust to read the Keychain item in-process with `SecItemCopyMatching`, from
  a signed binary the item can trust.
- The behaviour is in [`spec/`](https://github.com/craigruks/ai-may-i/blob/main/spec/README.md),
  so the Rust version has to pass the same vectors.

## Why isn't it on npm or Homebrew?

<!-- VOICE: brief 6 (objection 5: Why isn't it on npm or Homebrew?) -->

The answer covers:

- v0.1 installs from a checkout with `just install`, and you can read every line first.
- npm and Homebrew are not in v0.1.

## Why only macOS?

<!-- VOICE: brief 6 (objection 6: Why only macOS?) -->

The answer covers:

- The prompt is a macOS notification and dialog, run through `/usr/bin/osascript` and
  `alerter`.
- There is no terminal prompt: the agent being gated owns the terminal, so a y/N it can
  type is no consent ([`src/cli.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/cli.ts)).
- Off macOS, every ask-tier command is refused with exit 77, and the allow tier still runs.
- Linux and Windows prompts are not in v0.1.

## Is this audited?

<!-- VOICE: brief 6 (objection 7: Is this audited?) -->

The answer covers:

- No. No third party has reviewed it.
- What runs on every commit: `just check` (Biome, strict `tsc`, file limits, every test,
  with the tripwires after each one), CI on Linux with a Node 22 run of the built JS, and a
  headless macOS job that must exit 77.
- What a person checks on a Mac before a release:
  [`docs/manual-test.md`](https://github.com/craigruks/ai-may-i/blob/main/docs/manual-test.md),
  walked with `just mac-check`.
- Where a finding goes: a private report, per
  [SECURITY.md](https://github.com/craigruks/ai-may-i/blob/main/SECURITY.md).
