# ai-may-i

**Ask a human before an AI agent's command reaches production secrets in 1Password.**

[![CI](https://github.com/craigruks/ai-may-i/actions/workflows/ci.yml/badge.svg)](https://github.com/craigruks/ai-may-i/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Documentation: https://craigruks.github.io/ai-may-i/

`may-i` puts two screens in front of your 1Password credentials, so before an agent gets them,
you know what's asking and why.

Earlier this year I stopped running agents in a multi-pane terminal, where I could see which
one was asking, and started running many agents out of sight. Then a prompt would pop up
asking for a whole vault's worth of production credentials, and I didn't know who was asking,
why, or for what. 1Password's prompt only says that something in the terminal wants access to
the vault. That's it.

may-i first shows a macOS notification, so it doesn't break your flow: glance up and see the
command that wants credentials. Click **Review** and a dialog shows the command, the agent and
which `op://` references it will use. Then Deny or Approve.

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

I use may-i by default for any local agent work in my repos. When I want many agents running
at once, I still know what each one is asking for, and what I'm giving it.

Blindly approving an AI agent's access to your production vault is a terrible idea. In the
early days of building and hacking, with a vault that doesn't reach much, it's okay. It even
worked for me with a multi-pane setup, because I could see which agent was asking. Once I was
doing tens of PRs a day, I needed something better.

The split setup is a great starting point when you're hacking a project together. Staging
matches production. The credentials have the same names in both, but they live in two
separate vaults. Agents can read all of the staging vault, so they can deploy to staging, and
staging can optionally read production. Later you can move production reads onto production
workers only. Eventually you stop needing any of this, because you use short-lived tokens from
your cloud. For small and mid-sized projects, or as an interim step, it's what I'd recommend.

What I refused to compromise on: an agent getting access to a whole vault. It still frustrates
me that none of the big password managers, the ones with cloud sync, a desktop app and a phone
app, let a CLI ask for a single item in a vault. That granularity doesn't exist, and I don't
have the time or the interest to build and secure my own vault service. So this is what I came
up with.

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
may-i --reason "ship main to production" -- op run --env-file .env.deploy-prod -- ./deploy.sh production
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

A reference that no rule matches is `ask`. With no config at all, everything asks. The
dialog leads with the command, and has no default button:

```text
op run --env-file .env.deploy-prod -- ./deploy.sh production

Asked by claude-code:bc3851a2
In shop
The agent says: "ship main to production"

Reaches 1 1Password reference:
  - op://Prod/cloudflare/api-token

Approve gives this one command the production token.
```

Every option, command and exit code: [the command line](https://craigruks.github.io/ai-may-i/cli/).

## Name only the fields a command uses

may-i shows every reference it is handed, so give each recipe an env file of its own,
naming only what its script reads. Then the dialog above lists exactly those fields.
[`examples/`](./examples) follows the rule, and
[`examples/check-env-files.ts`](./examples/check-env-files.ts) enforces it in pre-commit
and CI: [the guide](https://craigruks.github.io/ai-may-i/guides/scope-each-command/).

## More

- [Configuration](https://craigruks.github.io/ai-may-i/configuration/): which vault is which, in `~/.config/may-i/config.json`, and a repo's `.may-i.json` that can only tighten.
- [Task runners](https://craigruks.github.io/ai-may-i/task-runners/): just and make recipes that start with `may-i`, and [`examples/AGENTS.snippet.md`](./examples/AGENTS.snippet.md) for your agents.
- [The Claude Code hook](https://craigruks.github.io/ai-may-i/claude-code-hook/): `may-i-hook` blocks, or wraps, any Bash call that runs `op` without may-i.
- [Receipts](https://craigruks.github.io/ai-may-i/receipts/): one JSON line per request, `may-i log` and `may-i verify`.
- [Service accounts](https://craigruks.github.io/ai-may-i/guides/service-accounts/): staging in the environment, prod in Keychain.

## Design principles

Each principle below has a check in the code or the tests.

| Principle | Where it is checked |
| --- | --- |
| **Fails closed.** Anything but an Approve, nothing runs. | `ANSWER_RUNS` in [`src/events.ts`](./src/events.ts); every ending in [`spec/lifecycle.json`](./spec/lifecycle.json) |
| **Never sees your secrets.** It reads `op://` references, never values. The one exception is the prod token: it goes only to the command you approved, and a tripwire makes sure it never shows up in a log. | [`src/tripwires.ts`](./src/tripwires.ts), run after every test by [`test/support/harness.ts`](./test/support/harness.ts) |
| **One approval, one command.** No sessions. No "approve for 10 minutes". | "asks again for every request" in [`test/lifecycle.test.ts`](./test/lifecycle.test.ts) |
| **A repo can only make it stricter.** The agent can write to the repo, so the repo can't loosen anything. | `config` cases in [`spec/tiers.json`](./spec/tiers.json); the tier tripwire |
| **Hooks watch, they never decide.** An observer can ping your phone. It can't approve. | [`test/observers.test.ts`](./test/observers.test.ts) |
| **Zero runtime dependencies.** You can read all of it in an afternoon. | [`scripts/check-deps.ts`](./scripts/check-deps.ts), in `just check` |

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
