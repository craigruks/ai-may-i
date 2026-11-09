---
title: The command line
description: Every option, command and exit code of may-i.
---

Put `may-i --` in front of the command:

```sh
may-i -- op read op://Staging/postgres/url
may-i --reason "ship main to production" -- op run --env-file .env.deploy-prod -- ./deploy.sh production
```

## Options

| Option | Meaning |
| --- | --- |
| `--agent <id>` | Who is asking. Default: `$MAY_I_AGENT`, then `claude-code:<session>` inside Claude Code, else `a local shell`. A label, not proof of identity. |
| `--reason <text>` | Why, in the agent's words. Shown in the prompt as the agent's claim, and kept in the receipt. |
| `--timeout <s>` | Wait less than the config's timeout, 1 to 600 seconds. It can only shorten. |
| `-h`, `--help` | Print the usage. |
| `-v`, `--version` | Print the version. |

`--` is required before the command, so a mistyped option can never become the program
to run. These options also take the `--agent=<id>` form.

## Commands

| Command | What it does |
| --- | --- |
| `may-i log [--agent <id>] [--since <30m\|12h\|7d\|date>]` | One line per request from the receipts: when (UTC), who, how it ended, the command. |
| `may-i verify` | Checks every receipt again from its own events, and exits 1 on any problem. |
| `may-i doctor` | Checks the Keychain item, the receipts file and `alerter`. |

## Exit codes

| Code | When |
| --- | --- |
| the command's own | The command ran. |
| 77 | may-i refused: deny tier, Deny, timeout, a closed notification, an error, no display, no Keychain item, a receipt it could not write, a tripwire, or a failure in may-i itself. |
| 64 | Misuse: an unknown option, a bad value, no `--` before the command, or a `--since` that `may-i log` cannot read. |
| 127 | The approved command could not start. |
| 128 + n | The command was killed by signal n. |
| 1 | `may-i verify` found a problem or a line that is not a receipt, or `may-i doctor` found a failing check. |
