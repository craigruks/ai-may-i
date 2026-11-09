---
title: Coverage map
description: Each threat may-i guards against, the mechanism, and the test file and spec vector that prove it.
---

Each row is one way an agent's command could reach production secrets without your
consent, the part of may-i that stops it, and the test that proves it. A test that reads a
`spec/` file runs every vector in it, so a second implementation passes the same ones. The
tripwires also run after every test in the suite
([`test/support/harness.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/support/harness.ts)),
so any test whose events break a rule fails, whatever it set out to check.

## The decision

| Threat | Mechanism | Test | Spec vector |
| --- | --- | --- | --- |
| A deny-tier command runs | The gate refuses before asking | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "every ending" | `spec/lifecycle.json`: "deny tier: refused unasked" |
| An unmatched reference runs unasked | No match is `ask` | [`test/policy.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/policy.test.ts) | `spec/tiers.json` `decide`: "asks for a reference no rule matches", "asks for everything when there are no rules" |
| A command with no readable reference runs unasked | Finding nothing is `ask` | [`test/policy.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/policy.test.ts) | `spec/tiers.json` `decide`: "asks when no reference was found" |
| A command hides its references in a file may-i cannot read | An unreadable file is at least `ask` | [`test/references.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/references.test.ts) "lists a missing file as unreadable, never skips it" | `spec/tiers.json` `decide`: "asks when a named file was unreadable, even if the rest is allowed" |
| A reference spelt in another case dodges a deny | `deny` and `ask` ignore case, `allow` does not | [`test/policy.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/policy.test.ts) | `spec/tiers.json` `decide`: "denies regardless of case", "allows only on the exact case" |
| A repo file loosens your config | A repo's `allow` is ignored; the tier tripwire | [`test/config.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/config.test.ts), [`test/tripwires.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/tripwires.test.ts) | `spec/tiers.json` `config`: "ignores a repo file's allow", "lets a repo ask beat the user's allow" |
| A broken repo file drops its asks | It asks for everything instead | [`test/config.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/config.test.ts) | `spec/tiers.json` `config`: "asks for everything when the repo file is not JSON", "... has a bad field", "... has an unknown key" |
| A request waits longer than your config allows | `--timeout` and a repo file can only shorten | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "lets a request shorten the wait, never lengthen it"; [`test/config.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/config.test.ts) | none |

## The prompt

| Threat | Mechanism | Test | Spec vector |
| --- | --- | --- | --- |
| Anything but Approve runs the command | `ANSWER_RUNS` | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "every ending"; [`test/events.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/events.test.ts) "runs on exactly one answer: approve" | `spec/lifecycle.json`: Deny, timeout, closed, error, "a prompt that throws" |
| Return or Escape answers the dialog | No default and no cancel button | [`test/dialog.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/dialog.test.ts) "offers Deny and Approve with neither as a default or cancel button"; by hand, [manual check](https://github.com/craigruks/ai-may-i/blob/main/docs/manual-test.md) 5 | none |
| A keystroke in flight lands in the dialog | A notification first; the dialog opens only on a click | [`test/notify.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/notify.test.ts) "opens the dialog only after the notification is clicked"; by hand, manual check 4 | none |
| Silence approves | The dialog gives up after the timeout, and a timeout refuses | [`test/dialog.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/dialog.test.ts) "gives up on its own after the timeout" | `spec/lifecycle.json`: "ask tier, timeout: refused" |
| An odd answer from osascript approves | Only the exact Approve line approves | [`test/dialog.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/dialog.test.ts) "reads %s as %s" | none |
| A fake `osascript` or `security` on PATH answers | Both run by absolute path | [`test/dialog.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/dialog.test.ts) "runs osascript by absolute path"; [`test/keychain.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/keychain.test.ts) | none |
| The agent's text breaks out of the AppleScript string | `appleScriptString` escapes it and replaces control and bidi characters | [`test/applescript.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/applescript.test.ts), with a seeded fuzz | `spec/applescript.json`: every `injections` row, and the `fuzz` corpus |
| Nobody is there to answer | Refuse before asking | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts); [`test/cli.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/cli.test.ts) "refuses with 77 off macOS"; the headless macOS job in [`.github/workflows/macos.yml`](https://github.com/craigruks/ai-may-i/blob/main/.github/workflows/macos.yml) | `spec/lifecycle.json`: "ask tier, no display: refused before asking" |
| One Approve covers more than one run | Every request asks again | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "asks again for every request: one Approve is one run" | none |
| A secret value shows in the prompt | Redaction | [`test/redact.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/redact.test.ts) | `spec/redact.json` `redactCommand` |
| A newline or escape code hides part of the command | Control characters shown as text | [`test/redact.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/redact.test.ts) "never lets a control character through raw" | `spec/redact.json` `shellLine`: "shows a newline or escape code as text, never raw" |
| A failure inside may-i before it decides | Any throw is a refusal: exit 77, nothing runs | [`test/fail-closed.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/fail-closed.test.ts) "refuses with 77 and says why when may-i throws before deciding" | none |

## The prod token

| Threat | Mechanism | Test | Spec vector |
| --- | --- | --- | --- |
| The token is read without an Approve | Read only after `answered: approve` | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "every ending" checks the read count | `spec/lifecycle.json`: `keychainReads` on every ending |
| The token reaches more than the approved command | It goes into that child's environment only | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "goes to the approved command's environment, in place of the caller's token" | none |
| The token, or your own token, shows in an event, a receipt, the system log or an observer | The secret tripwire, inline and after every test | [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "appears in no event"; [`test/tripwires.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/tripwires.test.ts) "refuses before anyone sees an event that would carry the caller's token" | none |
| Approve with no Keychain item runs with your token instead | Refuse | [`test/keychain.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/keychain.test.ts) "refuses on %s" | `spec/lifecycle.json`: "ask tier, Approve, but no Keychain item: refused" |

## The record

| Threat | Mechanism | Test | Spec vector |
| --- | --- | --- | --- |
| A command runs with no receipt | The file is opened at `allowed`; a subscriber failure before the run refuses | [`test/receipts.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/receipts.test.ts) "refuses, running nothing, when the receipt cannot be written"; [`test/lifecycle.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/lifecycle.test.ts) "refuses, running nothing, when a subscriber fails before the run" | none |
| A command runs that should not have | The order tripwires | [`test/tripwires.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/tripwires.test.ts) "catches %s" | none |
| A receipt is edited, or written by a broken gate | `may-i verify` rebuilds and checks it | [`test/verify.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/verify.test.ts) "flags %s" | none |
| A damaged line in the file is skipped in silence | It is counted | [`test/log.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/log.test.ts) "counts lines that are not receipts instead of dropping them" | none |
| An observer changes an outcome | Its result is ignored; a failure is an event | [`test/observers.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/observers.test.ts) "cannot change an outcome" | none |
| A repo file adds an observer | Observers come from your config only | [`test/observers.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/observers.test.ts) "come from the user's file, and a repo file's are ignored out loud" | none |

## The command line and the hook

| Threat | Mechanism | Test | Spec vector |
| --- | --- | --- | --- |
| A mistyped option becomes the program to run | `--` is required | [`test/args.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/args.test.ts) "rejects %j"; [`test/cli.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/cli.test.ts) "exits 64 on %j, running nothing" | none |
| Claude Code runs `op` without may-i | `may-i-hook` blocks or wraps it | [`test/hook.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/hook.test.ts); [`test/hook-lex.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/hook-lex.test.ts) | `spec/hook-lex.json`: every row with `caught: true` |

## Not covered

These have no mechanism in v0.1. [SECURITY.md](https://github.com/craigruks/ai-may-i/blob/main/SECURITY.md)
lists them as known limits.

| Threat | Why not | Where it is pinned |
| --- | --- | --- |
| A process that runs as you reads the Keychain item with `security` | v0.1 reads the item through `/usr/bin/security`, which the item trusts | v0.2 |
| `op` behind a variable, in a script file, or on a shell's stdin | The hook's lexer cannot see it | `spec/hook-lex.json`: the three "(a known limit)" rows |
| An agent claims another agent's name | `--agent` is a label | [`src/agent.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/agent.ts) |
| You approve a command you did not read | The prompt leads with the command | none |
