---
title: Receipts, log and verify
description: The JSONL receipt may-i writes for every request, its copy in the system log, may-i log and may-i verify.
sidebar:
  label: Receipts
---

## The receipts file

may-i writes one JSON line per request to `~/.local/state/may-i/receipts.jsonl`
(`$XDG_STATE_HOME/may-i/receipts.jsonl` when set). The file is mode 600, in a directory of
mode 700, since a receipt says what was reached and by whom.

may-i opens the file before the command starts. If it cannot, it refuses, so no command
runs without a receipt. It appends the line when the request ends.

## A receipt

| Field | Value |
| --- | --- |
| `id` | The request's id, shared by all its events. |
| `at` | When the request started, ISO 8601, UTC. |
| `agent` | Who asked: `--agent`, `$MAY_I_AGENT`, the Claude Code session, or `a local shell`. |
| `command` | The command, redacted: `op://` references stay, secret-looking values become `***`. |
| `reason` | The agent's `--reason`, redacted, or `null`. |
| `tier` | `allow`, `ask` or `deny`. |
| `outcome` | `ran` or `refused`. |
| `code` | The command's exit code when it ran, else `null`. |
| `why` | Why it was refused, else `null`. |
| `events` | Every event of the request, in order. See [How it works](/ai-may-i/how-it-works/). |

The summary fields are built from `events`, so `may-i verify` can build them again and
compare. An approved deploy, as one receipt:

```json
{
  "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b",
  "at": "2026-11-02T09:14:12.000Z",
  "agent": "claude-code:bc3851a2",
  "command": "op run --env-file .env.deploy-prod -- ./deploy.sh production",
  "reason": "ship main to production",
  "tier": "ask",
  "outcome": "ran",
  "code": 0,
  "why": null,
  "events": [
    { "type": "requested", "agent": "claude-code:bc3851a2", "command": "op run --env-file .env.deploy-prod -- ./deploy.sh production", "reason": "ship main to production", "cwd": "/Users/you/code/shop", "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:14:12.000Z" },
    { "type": "references-found", "references": ["op://Prod/cloudflare/api-token"], "unreadable": [], "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:14:12.004Z" },
    { "type": "tier-decided", "tier": "ask", "why": "op://Prod/cloudflare/api-token: no rule matches", "userTier": "ask", "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:14:12.005Z" },
    { "type": "asked", "timeoutSeconds": 120, "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:14:12.006Z" },
    { "type": "answered", "answer": "approve", "via": "notification+dialog", "detail": null, "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:14:31.512Z" },
    { "type": "allowed", "credentials": "keychain", "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:14:31.580Z" },
    { "type": "spawned", "program": "op", "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:14:31.581Z" },
    { "type": "exited", "code": 0, "id": "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b", "at": "2026-11-02T09:15:02.230Z" }
  ]
}
```

In the file this is one line. The token is in no field: `credentials: "keychain"` says
where it came from, and nothing more.

## The system log

On a Mac, may-i also writes each receipt as one line with `logger -t may-i`, so Console.app
shows it, and an MDM that collects logs collects it too:

```text
9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b ran agent="claude-code:bc3851a2" tier="ask" code=0 command="op run --env-file .env.deploy-prod -- ./deploy.sh production" reason="ship main to production"
c41d9e7a-6b2f-4a8c-9d3e-5f7a1b2c3d4e refused agent="codex-1" tier="ask" why="not approved: deny" command="op read op://Prod/stripe/secret-key" reason="check the webhook secret"
```

To find one request from a terminal:

```sh
log show --last 1h --style compact --predicate 'eventMessage CONTAINS "9a7e4d20-1b3c-4e5f-8a6b-7c9d0e1f2a3b"'
```

The JSONL file stays the record. A failure to write the system log is reported on stderr
and changes nothing.

## may-i log

```sh
may-i log
may-i log --agent codex-1
may-i log --since 12h
may-i log --since 2026-11-01
```

One line per request: the start time (UTC, to the minute), the agent, how it ended, and the
command. `allowed` means the allow tier ran it unasked, `approved` means you clicked
Approve, and `refused` gives the reason.

```text
2026-11-02 09:14  codex-1               allowed, exit 0              op read op://Staging/postgres/url
2026-11-02 09:14  claude-code:bc3851a2  approved, exit 0             op run --env-file .env.deploy-prod -- ./deploy.sh production
2026-11-02 09:14  codex-1               refused: not approved: deny  op read op://Prod/stripe/secret-key
```

`--since` takes `30m`, `12h`, `7d` or a date. `may-i log` takes its options as
`--agent <id>`, never `--agent=<id>`. A line in the file that is not a receipt is counted on
stderr, never dropped in silence. A `--since` it cannot read exits 64.

## may-i verify

`may-i verify` checks every receipt again, from its own events. It takes nothing on the
receipt's word.

```text
$ may-i verify
41 receipt(s) checked: the gate held
```

It reports one line per problem, as `<id>: <problem>`, and exits 1 if there is any:

| Problem | What it means |
| --- | --- |
| `says outcome, code, … unlike its own events` | A summary field differs from what the events say. |
| `holds 2 event(s) from another request` | An event has another request's id. |
| `has no events` | The receipt has nothing to check. |
| `spawned without being allowed` | The command started with no `allowed` before it. |
| `spawned on the ask tier without an Approve` | An ask-tier command ran without an Approve. |
| `spawned on the deny tier` | A deny-tier command ran. |
| `spawned after a refusal` | A command ran after `refused`. |
| `tier allow is looser than the user's own ask` | A repo file loosened your config. |
| `was refused, yet it ran` | The receipt says `refused` and has a `spawned` event. |
| `never ended` | The last event is neither `exited` nor `refused`. |
| `holds a value that looks like a secret at events.0.command` | A string that redaction would change: a secret-looking value reached the disk. |

A line in the file that is not a receipt is a problem too.
