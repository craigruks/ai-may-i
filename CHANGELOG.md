# Changelog

Every change a user can see. Versions follow [SemVer](https://semver.org). Before 1.0, a
minor version can change behaviour.

## [Unreleased]

## 0.1.0 (2026-11-09)

### Added

- `may-i -- <command>`. Each `op://` reference the command can reach gets a tier, `allow`,
  `ask` or `deny`, and the strictest wins. may-i finds references in the arguments, in
  files given to `--env-file` and `--path`, in `scanFiles`, and in the inherited
  environment.
- The prompt: a notification first when `alerter` is installed, then a dialog with Deny
  and Approve and no default button. A timeout, a closed notification or an error refuses.
- The prod token: read from the Keychain item `ai-may-i` / `op-service-account` after an
  Approve, and given only to the approved command, as `OP_SERVICE_ACCOUNT_TOKEN`.
- Config in `~/.config/may-i/config.json`, and a repo's `.may-i.json` that can only tighten.
- Tripwires on the event stream: no spawn without `allowed`, no ask-tier spawn without an
  Approve, no secret value in an event, no tier looser than the user's own config.
- One JSONL receipt per request in `~/.local/state/may-i/receipts.jsonl`, and a one-line
  copy in the macOS system log.
- `may-i log`, `may-i verify` and `may-i doctor`.
- `may-i-hook`, a Claude Code `PreToolUse` hook that blocks `op` and `varlock` calls
  without may-i in front, or rewrites them with `--wrap`.
- Observers: your own commands, run on the events you choose, with no say in the outcome.
- A library API: `gate`, `findReferences`, `loadConfig`, `verify` and the event types.
- Single-file binaries built by Bun, and ESM with types for Node 22.
- `spec/`: the behaviour as JSON vectors that every implementation must pass.
- `just mac-check`: the manual checklist, walked by hand on a Mac.

### Known limits

- The prod token is read with `/usr/bin/security`, so any process that runs as you can
  read the same Keychain item. v0.2 reads it in-process from a signed binary.
- The prompt is macOS only. Elsewhere every ask-tier command is refused.
- The hook cannot see `op` behind a variable, inside a script file or on a shell's stdin.
