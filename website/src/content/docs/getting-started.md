---
title: Getting started
description: Build may-i, store the production token, write a config, and run a first command.
---

This page sets up may-i on one Mac. You need the 1Password CLI (`op`), and two 1Password
service accounts: one that reads your staging vault, one that reads your production
vault. The [service accounts guide](/ai-may-i/guides/service-accounts/) shows how to make them.

## 1. Build and install

v0.1 is not on npm or Homebrew. Build it from source:

```sh
git clone https://github.com/craigruks/ai-may-i.git && cd ai-may-i
mise install                # bun and just, at the versions in mise.toml
mise exec -- bun install    # dev tooling only: may-i has no runtime dependencies
mise exec -- just install   # builds bin/may-i and bin/may-i-hook, links both into ~/.local/bin
```

`mise exec --` runs each step with the pinned bun and just, so it works whether or not your
shell activates mise. If it does, plain `bun install` and `just install` work too.

`just install` links into `~/.local/bin` unless you give it another directory:
`just install /usr/local/bin`. That directory must be on your PATH.

## 2. Install alerter (optional)

```sh
brew install vjeantet/tap/alerter
```

With `alerter`, may-i shows a notification first, and the dialog opens only when you click
it. A notification does not take focus, so a keystroke you are typing cannot land in the
dialog. Without `alerter`, the dialog opens straight away.

## 3. Store the production token

```sh
security add-generic-password -s ai-may-i -a op-service-account -w
```

`security` asks for the password twice. Paste the production service account's token.
may-i reads this item only after you click Approve, and gives the token only to the
command you approved, as `OP_SERVICE_ACCOUNT_TOKEN`.

:::caution[v0.1 limit]
may-i reads the item with `/usr/bin/security`. Any process that runs as you can run
`security` and read the same item without a prompt. In v0.1 the Keychain item keeps the
token out of your shell's environment. It does not stop a process that sets out to read
it. v0.2 reads the item from a signed binary, so the item can trust may-i alone.
:::

## 4. Write a config

Put this in `~/.config/may-i/config.json`:

```json
{
  "allow": ["op://Staging/*"]
}
```

Use your own vault name. Every reference in the `Staging` vault now runs at once.
Everything else asks. See [Configuration and tiers](/ai-may-i/configuration/) for every key.

## 5. Check the Mac

```sh
may-i doctor
```

```text
ok    Keychain item ai-may-i / op-service-account exists
ok    receipts go to /Users/you/.local/state/may-i/receipts.jsonl
ok    alerter is installed, so a notification comes first
```

`may-i doctor` exits 1 if a line says `fail`. A missing `alerter` is a `warn`.

## 6. Run something

```sh
may-i -- op read op://Staging/postgres/url
```

That reference is in the allow tier, so `op` runs at once, with the staging token your
environment has. may-i writes a receipt and returns `op`'s exit code.

```sh
may-i --reason "check the webhook secret" -- op read op://Prod/stripe/secret-key
```

No rule matches that reference, so may-i asks. Click Approve and `op` runs with the
production token. Click Deny, or wait out the timeout, and may-i exits 77 and runs nothing.

```sh
may-i log
```

shows both requests, one line each. Next, put may-i behind your
[task runner](/ai-may-i/task-runners/) and add the
[Claude Code hook](/ai-may-i/claude-code-hook/).
