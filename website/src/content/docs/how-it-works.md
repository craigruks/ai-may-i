---
title: How it works
description: Every request as a sequence of typed events, and everything that reads them.
---

I really like the event-based design, because it makes it easier to log and find bugs over
time. Especially now, with AI: the more you can give it in file form, the better, because it
can look through for patterns and find issues. You can hook into the events yourself, or hand
the receipts to whoever needs them, like your employer.

Each request is a sequence of events, and every other part of may-i reads those events.

## The events

The gate in [`src/gate.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/gate.ts)
reports only by emitting these. The types are in
[`src/events.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/events.ts).

| Event | Fields | The gate emits it |
| --- | --- | --- |
| `requested` | `agent`, `command`, `reason`, `cwd` | First, for every request. `command` and `reason` are redacted. |
| `references-found` | `references`, `unreadable` | After it reads the arguments, the env files and the environment. `unreadable` lists files the command gave that it could not read. |
| `tier-decided` | `tier`, `userTier`, `why` | After it applies the rules. `userTier` is the tier your config alone gives, so a repo file that loosened it shows. |
| `asked` | `timeoutSeconds` | Ask tier only, just before the prompt. Not emitted when no prompt is possible here. |
| `answered` | `answer`, `via`, `detail` | When the prompt returns. `answer` is `approve`, `deny`, `timeout`, `closed` or `error`. `via` is `dialog`, `notification`, `notification+dialog`, or `prompt` when the prompt itself threw. |
| `allowed` | `credentials` | Just before the command starts. `caller` means your environment as it is. `keychain` means the prod token from the Keychain item. |
| `spawned` | `program` | When the command starts. The program's file name only. |
| `exited` | `code` | When the command ends. This ends the request. |
| `refused` | `why` | When may-i will not run the command. This ends the request, and nothing ran. |
| `observer-failed` | `observer`, `on`, `why` | When one of your observers fails. It changes nothing. |

Every event also has `id`, which all events of one request share, and `at`, an ISO 8601
time. No event has a secret value in it. The tripwires check that on every event.

## Every ending

Each ending is one exact sequence. The table is
[`spec/lifecycle.json`](https://github.com/craigruks/ai-may-i/blob/main/spec/lifecycle.json),
and [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts)
runs every row.

| Ending | Events |
| --- | --- |
| allow tier: runs at once, unasked | requested, references-found, tier-decided `allow`, allowed `caller`, spawned, exited |
| ask tier, Approve: runs with the prod token | requested, references-found, tier-decided `ask`, asked, answered `approve`, allowed `keychain`, spawned, exited |
| deny tier: refused unasked | requested, references-found, tier-decided `deny`, refused |
| ask tier, Deny | requested, references-found, tier-decided `ask`, asked, answered `deny`, refused |
| ask tier, timeout | requested, references-found, tier-decided `ask`, asked, answered `timeout`, refused |
| ask tier, notification closed | requested, references-found, tier-decided `ask`, asked, answered `closed`, refused |
| ask tier, prompt error | requested, references-found, tier-decided `ask`, asked, answered `error`, refused |
| ask tier, a prompt that throws | requested, references-found, tier-decided `ask`, asked, answered `error`, refused |
| ask tier, no display | requested, references-found, tier-decided `ask`, refused |
| ask tier, Approve, but no Keychain item | requested, references-found, tier-decided `ask`, asked, answered `approve`, refused |

Only `approve` runs. That rule is one record, `ANSWER_RUNS` in `src/events.ts`, so a new
answer cannot be added without saying whether it runs.

## What reads the events

| Reader | What it does with them |
| --- | --- |
| Receipts | Writes one JSON line per request when it ends. It opens the file at `allowed`, so a file it cannot write stops the command before it starts. |
| System log | On a Mac, writes a one-line copy of each receipt with `logger -t may-i`. |
| Tripwires | Check every event before any reader sees it. A trip refuses the request. |
| Observers | Run your own commands on the events you choose. |
| `may-i log` and `may-i verify` | Read the receipts later. |

A reader that throws before `spawned` makes the gate refuse: a request that was not
recorded does not run. After the command starts, a failure is reported on stderr and
changes nothing.

## The tripwires

[`src/tripwires.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/tripwires.ts)
checks each event against what came before it in the same request:

- nothing is spawned without `allowed`, after `refused`, on the deny tier, or on the ask
  tier without an Approve;
- no event has a value from a secret-named variable in the caller's environment (`*_TOKEN`,
  `*_SECRET`, `*_PASSWORD`, `*_API_KEY` and the like, 12 characters or longer), or the prod
  token once may-i has read it;
- no tier is looser than `userTier`.

The gate runs them inline, before it delivers each event. The test suite runs them after
every test. `may-i verify` runs them over every receipt.
