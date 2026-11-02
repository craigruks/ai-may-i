---
title: Configuration and tiers
description: The config files, every key, how a tier is decided, and why a repo file can only tighten.
---

## The files

| File | Who writes it | What it can do |
| --- | --- | --- |
| `~/.config/may-i/config.json` (`$XDG_CONFIG_HOME/may-i/config.json` when set) | you | everything |
| `.may-i.json` in the working directory, or its nearest parent that has one | the repo | tighten only |

The agent you gate can usually write to the repo it works in. A repo file that could
`allow` would let the agent switch the gate off for itself, so may-i ignores a repo's
`allow`, and the repo's `ask` and `deny` add to yours.

## Keys

| Key | Value | In a repo file | Meaning |
| --- | --- | --- | --- |
| `allow` | patterns | ignored, with a warning | Run at once, with your environment as it is. |
| `ask` | patterns | added to yours | Ask first. Only Approve runs the command, and only that run gets the prod token. |
| `deny` | patterns | added to yours | Refuse without asking. |
| `timeoutSeconds` | whole seconds, 1 to 600. Default 120. | can only shorten | How long the prompt waits. Silence refuses. |
| `scanFiles` | paths, relative to the working directory | ignored, with a warning | Files read on every run, whether or not the command mentions them. A missing one is skipped. |
| `fileFlags` | flags | ignored, with a warning | Flags whose value is a file of references. They add to `--env-file` and `--path`. |
| `observers` | a list of `{ "on": [...], "run": [...] }` | ignored, with a warning | Your commands, run on events. See [Observers](#observers). |

An example with every key:

```json
{
  "allow": ["op://Staging/*"],
  "ask": ["op://Staging/root/*"],
  "deny": ["op://Prod/billing/*"],
  "timeoutSeconds": 90,
  "scanFiles": [".env.local"],
  "fileFlags": ["--secrets-file"],
  "observers": [{ "on": ["asked"], "run": ["afplay", "/System/Library/Sounds/Glass.aiff"] }]
}
```

## Patterns

A pattern is a whole `op://` reference, with `*` for any run of characters, `/` included.
It must match the whole reference: `op://Staging/*` matches `op://Staging/db/url`, and not
`op://Staging-old/db/url`.

`deny` and `ask` patterns ignore case. `allow` patterns match the exact case. So
`op://prod/db/url` is still denied by `op://Prod/*`, and `op://staging/db/url` is not
allowed by `op://Staging/*`. A spelling mismatch can only make a decision stricter.

## How a tier is decided

1. may-i finds every `op://` reference the command can reach: in its arguments (inside a
   `bash -c` string too), in each file given to a `fileFlags` flag, in each `scanFiles`
   file, and in `op://` values in the environment it inherits.
2. Each reference gets the tier of the first rule that matches it, checking `deny`, then
   `ask`, then `allow`. A reference that no rule matches is `ask`.
3. The strictest tier among the references wins: `deny`, then `ask`, then `allow`.
4. If no reference was found, the tier is `ask`. `varlock run` with no readable schema
   still opens the vault, so finding nothing proves nothing.
5. If the command gave a file that may-i could not read, the tier is at least `ask`.

The `why` in `tier-decided` says which reference and which rule decided, for example
`op://Prod/stripe/secret-key: no rule matches` or `op://Staging/postgres/url: allow op://Staging/*`.

## The timeout

The prompt waits `timeoutSeconds`, then refuses. A repo file can only shorten it: the
lower of the two wins. `--timeout` can shorten it again for one request, never lengthen it.

## A broken file

One bad field rejects the whole file, since a half-read policy is one nobody wrote. An
unknown key is a bad field, so a misspelt `deny` cannot vanish in silence. may-i prints a
warning on stderr and goes on:

| Broken file | What may-i does |
| --- | --- |
| your config | Ignores it. With no rules, everything asks. |
| the repo's `.may-i.json` | Asks for everything until it is fixed. Dropping it would loosen. |

The warnings say what happened, for example:

```text
may-i: /Users/you/.config/may-i/config.json: unknown key `denny`; asking for everything until it is fixed
may-i: /Users/you/code/shop/.may-i.json: ignored `allow`; set it in /Users/you/.config/may-i/config.json
```

## Observers

An observer is your own command, run on the events you choose: a sound on `asked`, a
message to your phone on `refused`, a copy of every event sent somewhere central.

```json
{
  "observers": [
    { "on": ["asked"], "run": ["afplay", "/System/Library/Sounds/Glass.aiff"] },
    { "on": ["refused"], "run": ["/Users/you/bin/notify-phone"] },
    { "on": ["*"], "run": ["/Users/you/bin/ship-events"] }
  ]
}
```

- `on` lists event types from [How it works](/ai-may-i/how-it-works/), or `"*"` for all.
- `run` is an argv. may-i runs it without a shell, with the event as one JSON object on
  stdin.
- may-i waits up to 5 seconds for it, and discards its output.
- A non-zero exit, a timeout or a failure to start becomes an `observer-failed` event in
  the receipt. The request goes on as if the observer were not there.
- No event has the prod token in it, so no observer can get it.
- Observers come from your config only. A repo file that lists one gets a warning.
