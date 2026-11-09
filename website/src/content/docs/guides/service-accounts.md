---
title: "Service accounts: staging in the env, prod in Keychain"
description: Set up two 1Password service accounts, one for staging in your agents' environment and one for production that only may-i reads.
sidebar:
  label: Service accounts
---

Honestly, it's all one 1Password account. You create a service account scoped to your
production vault, and its token is what goes into Keychain. For staging, you create a separate
service account for the staging vault, and its token goes in an environment variable, which
gives your agents access. I keep it out of git, in a `mise.local.toml` file.

The key bit here is that a service account can't reach other vaults. We can restrict it to at
least that granularity.

If you export the prod token as a local environment variable, you're defeating the whole
purpose of this, because that hands it to every agent. Setting it as an environment variable in
the cloud is a different situation, and it depends on what you put in front of it, but that's a
separate topic.

This guide sets up that split: a staging service account in your agents' environment, and a
production one in a Keychain item.

1Password's side of each step is in its own docs:
[Get started with 1Password Service Accounts](https://www.1password.dev/service-accounts/get-started/).
This page covers what may-i needs from it.

## 1. Put agent secrets in their own vaults

A service account cannot reach your built-in Personal, Private or Employee vault, or your
default Shared vault. Put the secrets your agents use in vaults of their own, one for
staging and one for production. This guide calls them `Staging` and `Prod`.

## 2. Create a staging service account

Give it read access to `Staging` and nothing else:

```sh
op service-account create "agents-staging" --vault Staging:read_items
```

1Password shows the token once. Save it in your own vault. A service account's vaults and
permissions cannot change after you create it. To change them, revoke it and create a
new one.

## 3. Create a production service account

```sh
op service-account create "agents-prod" --vault Prod:read_items
```

Save this token too. It goes in the Keychain in step 5, and in no environment.

## 4. Put the staging token in the environment

Set `OP_SERVICE_ACCOUNT_TOKEN` to the staging token in the environment your agents start
in, for example in your shell profile. `op` reads that variable, so an agent can run
staging commands with no prompt. may-i still writes a receipt for each one it runs, and
`may-i log` shows them.

## 5. Put the production token in the Keychain

```sh
security add-generic-password -s ai-may-i -a op-service-account -w
```

Paste the production token when `security` asks. may-i reads this item only after you
click Approve. It gives the token to the approved command as `OP_SERVICE_ACCOUNT_TOKEN`,
in place of the staging token, and to nothing else.

## 6. Tell may-i which vault is which

In `~/.config/may-i/config.json`:

```json
{
  "allow": ["op://Staging/*"]
}
```

Every `Staging` reference runs at once, with the staging token from the environment.
Every other reference asks.

## 7. Check it

```sh
may-i doctor
may-i -- op read op://Staging/postgres/url
may-i --reason "check the prod setup" -- op read op://Prod/postgres/url
```

`may-i doctor` passes. The staging read runs at once. The prod read shows the prompt, and
runs only if you click Approve.

## The v0.1 limit

may-i reads the Keychain item with `/usr/bin/security`. The item trusts `security`, and
any process that runs as you can run `security`:

```sh
security find-generic-password -s ai-may-i -a op-service-account -w
```

That prints the production token with no prompt while you are logged in. So in v0.1 the
Keychain item keeps the token out of your agents' environment, and out of every event and
receipt, but it does not stop a process that sets out to read it. The prompt and the
receipts are the control.

v0.2 reads the item in-process from a signed binary, and the item trusts that binary's
signature, so any other program that asks for it gets a macOS prompt.

## Rotate or revoke

If you think a token leaked, revoke that service account in 1Password first. Then create
a new one, and replace the Keychain item:

```sh
security add-generic-password -U -s ai-may-i -a op-service-account -w
```

`-U` updates the item if it already exists. To remove it:

```sh
security delete-generic-password -s ai-may-i -a op-service-account
```

With no item, may-i refuses every Approve with
`approved, but no Keychain item for service ai-may-i, account op-service-account`.
