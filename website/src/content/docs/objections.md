---
title: Objection handling
description: The hardest questions about may-i, each answered straight.
---

The questions a skeptical developer or security reviewer asks first, with the facts each
answer rests on.

## Isn't Touch ID already enough?

Touch ID is great, but it gives too much access, because there's no way to limit it to a
single item in a vault.

- What 1Password's prompt for a terminal session says, and that it does not say which
  agent, which command or which credential.
- What one Touch ID approval unlocks: the whole account, for the session.
- What one may-i Approve unlocks: one run of one command, with a service account that
  reaches only the vaults it was given. Every request asks again
  ([`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts),
  "asks again for every request").
- That a service account can be revoked without touching your own account.

## Can't an agent just get around the hook?

Yes, an agent can get around the hook, by hiding `op` in a script or a variable. In v0.1 it
can also get around the prod token in Keychain: anything running as you can read it. So today
the real control is the prompt and the receipts. In v0.2 a signed binary reads the prod token,
and that's the thing an agent can't get around.

- The hook cannot see `op` behind a variable, inside a script file, or fed to a shell
  on stdin. Each is a known-limit row in
  [`spec/hook-lex.json`](https://github.com/craigruks/ai-may-i/blob/main/spec/hook-lex.json).
- The hook catches an agent that forgets. The boundary is where the prod token is kept.
- A command that goes around may-i runs with the agent's own environment, which has the
  staging token at most.
- The prod token is only in the Keychain item, and in v0.1 any process that runs as you
  can read that item with `/usr/bin/security`. v0.2 makes the item trust may-i's
  signature alone.

## Why does it handle the service-account token at all? Isn't that a new risk?

I want the service-account token because then I can connect it to things like GitHub Actions
and other cloud services for the staging credentials.

may-i hands the prod token only to the command you approved. A tripwire checks that it never
appears in an event, a receipt or the system log.

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

I chose TypeScript because I didn't want to deal with compilation, and my codebase is
TypeScript, so it made an easier first version. A Rust version is coming, or I may move to
Rust entirely, so it's easier for other people to pick up.

- v0.1 is TypeScript with zero runtime dependencies, under 300 lines a file, and runs
  compiled by Bun or as plain JS on Node 22.
- v0.2 moves to Rust to read the Keychain item in-process with `SecItemCopyMatching`, from
  a signed binary the item can trust.
- The behaviour is in [`spec/`](https://github.com/craigruks/ai-may-i/blob/main/spec/README.md),
  so the Rust version has to pass the same vectors.

## Why isn't it on npm or Homebrew?

Honestly, to avoid the upkeep. In a lot of cases you're better off reading this codebase and
rolling your own inside yours. Think of it as a guide for your AI as much as something you
drop in.

- v0.1 installs from a checkout with `just install`, and you can read every line first.
- npm and Homebrew are not in v0.1.

## Why only macOS?

It's what I work on. Happy to add support if people want it. I've been eyeing Omarchy, so
Linux support may come if I move over.

- The prompt is a macOS notification and dialog, run through `/usr/bin/osascript` and
  `alerter`.
- There is no terminal prompt: the agent being gated owns the terminal, so a y/N it can
  type is no consent ([`src/cli.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/cli.ts)).
- Off macOS, every ask-tier command is refused with exit 77, and the allow tier still runs.
- Linux and Windows prompts are not in v0.1.

## Is this audited?

No. Nobody has audited it yet. If you'd like to, I'd welcome it.

- No third party has reviewed it.
- What runs on every commit: `just check` (Biome, strict `tsc`, file limits, every test,
  with the tripwires after each one), CI on Linux with a Node 22 run of the built JS, and a
  headless macOS job that must exit 77.
- What a person checks on a Mac before a release:
  [`docs/manual-test.md`](https://github.com/craigruks/ai-may-i/blob/main/docs/manual-test.md),
  walked with `just mac-check`.
- Where a finding goes: a private report, per
  [SECURITY.md](https://github.com/craigruks/ai-may-i/blob/main/SECURITY.md).
