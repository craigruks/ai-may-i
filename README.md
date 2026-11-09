# ai-may-i

**Ask a human before an AI agent's command reaches production secrets in 1Password.**

[![CI](https://github.com/craigruks/ai-may-i/actions/workflows/ci.yml/badge.svg)](https://github.com/craigruks/ai-may-i/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Documentation: [`website/`](./website/src/content/docs/index.mdx), published at
https://craigruks.github.io/ai-may-i/ once the repo is public.

<!-- VOICE: brief 1 (README opening) -->
`may-i` runs in front of an agent's command and shows you which agent asks, which command it runs and which 1Password references it reaches.

<!-- DEMO: assets/demo.gif (the notification, the dialog, then `may-i log`) -->

> [!NOTE]
> **Reading this as an agent?** Start with [`AGENTS.md`](./AGENTS.md).

> [!WARNING]
> **Status: v0.1, pre-1.0, macOS only.** It is **not audited** and is **not a
> security guarantee**. In v0.1, may-i reads the prod token through
> `/usr/bin/security`, so any process that runs as you can read the same Keychain
> item. The prompt and the receipts are the control. v0.2 reads the item from a
> signed binary. See [SECURITY.md](./SECURITY.md) for the scope and every known limit.

## Why

<!-- VOICE: brief 2 (README Why) -->
1Password's own prompt for the CLI does not say which agent, which command or which credential.

## Install

v0.1 is not on npm or Homebrew. Build it from source on a Mac:

```sh
git clone https://github.com/craigruks/ai-may-i.git && cd ai-may-i
mise install                # bun and just, at the versions in mise.toml
mise exec -- bun install    # dev tooling only: may-i has no runtime dependencies
mise exec -- just install   # builds bin/may-i and bin/may-i-hook, links both into ~/.local/bin
```

`mise exec --` runs each step with the pinned bun and just, so it works whether or not your
shell activates mise. If it does, plain `bun install` and `just install` work too.

`just install` takes another directory as its one argument: `just install /usr/local/bin`.
`just build` also writes ESM with types to `dist/`, which runs on Node 22 or later.

Then set up the Mac:

```sh
brew install vjeantet/tap/alerter                                 # optional: a notification before the dialog
security add-generic-password -s ai-may-i -a op-service-account -w   # paste the prod service-account token
may-i doctor
```

`may-i doctor` prints one line per check (`ok`, `warn` or `fail`) and exits 1 if any check
fails. Without `alerter` it warns, and the dialog opens straight away.

## Usage

Put `may-i --` in front of the command:

```sh
may-i -- op read op://Staging/postgres/url
may-i --reason "ship main to production" -- op run --env-file .env.prod -- ./deploy.sh production
```

may-i finds the `op://` references the command can reach: in its arguments (inside a
`bash -c` string too), in the files it gives to `--env-file` (`op run`) or `--path`
(`varlock run`), and in `op://` values in the environment it inherits. It gives each
reference a tier from your config and acts on the strictest:

| Tier | What may-i does |
| --- | --- |
| `allow` | Runs the command at once, with your environment as it is (a staging token, at most). |
| `ask` | Shows a notification, then a dialog. Only Approve runs the command, and only that run gets the prod token. |
| `deny` | Refuses without asking. |

A reference that no rule matches is `ask`. A command with no readable reference is `ask`.
With no config at all, everything asks.

The dialog leads with the command:

```text
op run --env-file .env.prod -- ./deploy.sh production

Asked by claude-code:bc3851a2
In shop
The agent says: "ship main to production"

Reaches 3 1Password references:
  - op://Prod/cloudflare/api-token
  - op://Prod/postgres/url
  - op://Prod/stripe/secret-key

Approve gives this one command the production token.
```

The dialog has Deny and Approve and no default button, so Return and Escape do nothing.
It gives up after the timeout, and a timeout refuses.

### Options

| Option | Meaning |
| --- | --- |
| `--agent <id>` | Who is asking. Default: `$MAY_I_AGENT`, then `claude-code:<session>` inside Claude Code, else `a local shell`. A label, not proof of identity. |
| `--reason <text>` | Why, in the agent's words. Shown in the prompt as the agent's claim, and kept in the receipt. |
| `--timeout <s>` | Wait less than the config's timeout, 1 to 600 seconds. It can only shorten. |
| `-h`, `--help` | Print the usage. |
| `-v`, `--version` | Print the version. |

`--` is required before the command, so a mistyped option can never become the program
to run. These options also take the `--agent=<id>` form.

### Commands

| Command | What it does |
| --- | --- |
| `may-i log [--agent <id>] [--since <30m\|12h\|7d\|date>]` | One line per request from the receipts: when (UTC), who, how it ended, the command. |
| `may-i verify` | Checks every receipt again from its own events, and exits 1 on any problem. |
| `may-i doctor` | Checks the Keychain item, the receipts file and `alerter`. |

### Exit codes

| Code | When |
| --- | --- |
| the command's own | The command ran. |
| 77 | may-i refused: deny tier, Deny, timeout, a closed notification, an error, no display, no Keychain item, a receipt it could not write, a tripwire, or a failure in may-i itself. |
| 64 | Misuse: an unknown option, a bad value, no `--` before the command, or a `--since` that `may-i log` cannot read. |
| 127 | The approved command could not start. |
| 128 + n | The command was killed by signal n. |
| 1 | `may-i verify` found a problem or a line that is not a receipt, or `may-i doctor` found a failing check. |

## Configuration

Your config is `~/.config/may-i/config.json` (`$XDG_CONFIG_HOME/may-i/config.json` when
that is set). It decides which vault is which:

```json
{
  "allow": ["op://Staging/*"],
  "deny": ["op://Prod/root/*"],
  "timeoutSeconds": 120
}
```

`*` matches any run of characters, `/` included, and a pattern must match the whole
reference. `deny` and `ask` patterns ignore case. `allow` patterns match the exact case, so
a spelling mismatch can only make a decision stricter.

A repo can add `.may-i.json`: may-i reads the one in the working directory or its nearest
parent. A repo file can only tighten, because the agent you gate can usually write to the
repo.

| Key | Value | In a repo file | Meaning |
| --- | --- | --- | --- |
| `allow` | patterns | ignored, with a warning | Run at once, with your environment. |
| `ask` | patterns | added to yours | Ask first. Only Approve runs, with the prod token. |
| `deny` | patterns | added to yours | Refuse without asking. |
| `timeoutSeconds` | 1 to 600, default 120 | can only shorten | How long the prompt waits. Silence refuses. |
| `scanFiles` | paths, relative to the working directory | ignored, with a warning | Files read on every run, whether or not the command mentions them. |
| `fileFlags` | flags | ignored, with a warning | Flags whose value is a file of references, added to `--env-file` and `--path`. |
| `observers` | `[{ "on": [<event type> or "*"], "run": [<argv>] }]` | ignored, with a warning | Your commands, run on events. They get the event as JSON on stdin and cannot change an outcome. |

An unknown key or a bad value rejects the whole file, with a warning. A broken user file
leaves the defaults, so everything asks. A broken repo file makes everything ask.

## Put it behind your task runner

A recipe that starts with `may-i` gates every run of it, whoever runs it. With just
([`examples/justfile`](./examples/justfile)):

```just
deploy-prod reason="ship main to production":
    may-i --reason {{ quote(reason) }} -- op run --env-file .env.prod -- ./deploy.sh production
```

With make:

```make
deploy-prod:
	may-i --reason "ship main to production" -- op run --env-file .env.prod -- ./deploy.sh production
```

With a shell alias:

```sh
alias prod='may-i -- op run --env-file .env.prod --'
prod ./scripts/backfill.sh --since 7d
```

The `.env` files contain `op://` references only, never values
([`examples/.env.prod`](./examples/.env.prod)). Tell your agents the same thing in their
AGENTS.md: [`examples/AGENTS.snippet.md`](./examples/AGENTS.snippet.md).

## The Claude Code hook

`may-i-hook` is a `PreToolUse` hook. It reads each Bash call. When the call runs `op` or
`varlock` without `may-i` in front, the hook blocks it and gives Claude the gated command
to run instead. `op --version`, `op --help`, `op help` and `op completion` pass. Add it to
`~/.claude/settings.json` or a project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "may-i-hook" }] }
    ]
  }
}
```

`may-i-hook --wrap` rewrites the call to go through may-i instead of blocking it.
`may-i-hook --gate <command>` says how to call may-i when it is not on PATH. The hook
cannot see `op` behind a variable, inside a script file or fed to a shell on stdin. An
agent that runs `op` that way gets your environment only, which has the staging token
at most.

## Receipts

may-i writes one JSON line per request to `~/.local/state/may-i/receipts.jsonl`
(`$XDG_STATE_HOME/may-i/receipts.jsonl` when that is set). Only you can read it: mode 600,
in a directory of mode 700. Each receipt keeps every event of its request, so
`may-i verify` can judge it again later. If the file cannot be written, may-i refuses
before the command starts. On a Mac it also writes a one-line
copy to the system log with `logger -t may-i`, which Console.app shows.

```text
$ may-i log --since 1h
2026-11-02 09:14  codex-1               allowed, exit 0              op read op://Staging/postgres/url
2026-11-02 09:14  claude-code:bc3851a2  approved, exit 0             op run --env-file .env.prod -- ./deploy.sh production
2026-11-02 09:14  codex-1               refused: not approved: deny  op read op://Prod/stripe/secret-key
```

## Design principles

<!-- VOICE: brief 4 (design principles intro, and one or two sentences per principle) -->
Each principle below has a check in the code or the tests.

| Principle | Where it is checked |
| --- | --- |
| Fails closed: anything but an Approve runs nothing. | `ANSWER_RUNS` in [`src/events.ts`](./src/events.ts); every ending in [`spec/lifecycle.json`](./spec/lifecycle.json) |
| Reads `op://` references, never values. The one exception is the prod token, which goes to the approved command only. | [`src/tripwires.ts`](./src/tripwires.ts), run after every test by [`test/support/harness.ts`](./test/support/harness.ts) |
| One approval, one command. | "asks again for every request" in [`test/lifecycle.test.ts`](./test/lifecycle.test.ts) |
| A repo file can only tighten. | `config` cases in [`spec/tiers.json`](./spec/tiers.json); the tier tripwire |
| Observers watch, never decide. | [`test/observers.test.ts`](./test/observers.test.ts) |
| Zero runtime dependencies. | [`scripts/check-deps.ts`](./scripts/check-deps.ts), in `just check` |

## Development

```sh
mise install    # bun and just; the lines below assume your shell activates mise
bun install
just            # lists every recipe
just check      # lint, typecheck, limits and tests: what every commit passes
just build      # bin/may-i, bin/may-i-hook and dist/
just mac-check  # on a Mac, by hand: the checks only a person can do
just site       # the docs site in website/, built to website/dist
```

Source uses `node:*` APIs only, never the `Bun` global (a Biome rule checks it), so the
same code runs compiled by Bun and as plain JS on Node 22. Every file stays under 300
lines. The behaviour every implementation must match is in [`spec/`](./spec/README.md).
Before a release, run the [manual checklist](./docs/manual-test.md) on a Mac. Changes are
in the [changelog](./CHANGELOG.md).

## License

[MIT](./LICENSE) © Craig Ruks
