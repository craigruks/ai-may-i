---
title: The Claude Code hook
description: may-i-hook, a PreToolUse hook that routes Claude Code's op and varlock calls through may-i.
sidebar:
  label: Claude Code hook
---

`may-i-hook` reads each Bash call Claude Code is about to make. When the call runs `op` or
`varlock` without `may-i` in front, the hook blocks it, or rewrites it with `--wrap`. Every
other call passes untouched, and Claude Code's own permission flow goes on as usual.

## Install

`just install` puts `may-i-hook` next to `may-i`. Add it to `~/.claude/settings.json`, or to
a project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "may-i-hook" }] }
    ]
  }
}
```

| Option | Meaning |
| --- | --- |
| (none) | Block mode: deny the call, and give Claude the gated command to run instead. |
| `--wrap` | Wrap mode: allow the call, with its command rewritten to go through may-i. |
| `--gate <command>` | How to call may-i, when `may-i` is not on PATH. Default: `may-i`. |

Any other option, or input that is not a JSON object, makes the hook exit 2, which blocks
the call, with the reason on stderr.

## Block mode

For a call to `op read op://Prod/db/password` in session `bc3851a2-…`, the hook prints:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "This reaches 1Password without may-i, so it did not run. Run it as:\nmay-i --agent claude-code:bc3851a2 -- op read op://Prod/db/password"
  }
}
```

Claude then runs the gated command, and may-i decides from your config.

## Wrap mode

With `--wrap`, the same call becomes:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "routed through may-i, which asks for prod access itself",
    "updatedInput": { "command": "may-i --agent claude-code:bc3851a2 -- op read op://Prod/db/password" }
  }
}
```

`updatedInput` keeps every other field of the call. A single `op …` keeps its form. A line
with more than one command goes through `bash -c`, so may-i stands in front of every part:
`cd app && op run --env-file .env.prod -- ./x` becomes
`may-i --agent claude-code -- bash -c 'cd app && op run --env-file .env.prod -- ./x'`.

What an `allow` from a hook skips in Claude Code's own permission rules is Claude Code's
to decide: see its [hooks reference](https://code.claude.com/docs/en/hooks). Use block
mode if you want Claude Code to ask you about the gated command too.

## The agent's name

The hook calls the agent `claude-code:` plus the first 8 characters of the session id, so
two sessions read differently in the prompt and in `may-i log`.

## What it catches

The hook splits the line into the programs it runs, with a small lexer,
[`src/hook-lex.ts`](https://github.com/craigruks/ai-may-i/blob/main/src/hook-lex.ts). It
finds `op` and `varlock`:

- in a chain, a pipe, a subshell or the background: `ls && op read …`, `(cd x && op run …) &`;
- after assignments and by absolute path: `FOO=1 /opt/homebrew/bin/op read …`;
- behind `command`, `env`, `exec`, `nohup`, `time`, `nice`, `sudo`, `doas`, `xargs`,
  `timeout`, `caffeinate`, `npx`, `bunx`, `pnpx`, `pnpm exec`, `pnpm dlx`, `npm exec`,
  `yarn dlx`, `yarn exec` and `bun x`;
- inside `bash -c`, `sh -lc`, `zsh -c` and `eval`;
- in `$(…)`, backticks and `<(…)`.

`op --version`, `op -v`, `op --help`, `op -h`, `op help` and `op completion` pass. A bare
`varlock` is caught, since it loads the vault. Every case is a row in
[`spec/hook-lex.json`](https://github.com/craigruks/ai-may-i/blob/main/spec/hook-lex.json).

## What it cannot see

- `op` named by a variable: `$OP read …`.
- `op` inside a script file: `./deploy.sh`, when the script runs `op`.
- `op` fed to a shell on stdin: `echo 'op read …' | sh`.

These are rows in `spec/hook-lex.json` too, marked as known limits. An agent that runs
`op` one of these ways gets its own environment, which has the staging token at most.
Keep the prod token out of that environment: put it in the Keychain item that only may-i
reads after an Approve.
