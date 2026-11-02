# Manual test checklist

CI runs every test on Linux and proves on a headless Mac that nobody there to click
means exit 77. It cannot click a dialog, watch focus, or start Claude Code. These checks
need a person at a Mac. Run them before a release, and after any change to
`src/applescript.ts`, `src/dialog.ts`, `src/notify.ts`, `src/keychain.ts`,
`src/syslog.ts` or `src/hook.ts`.

## The guided run

```sh
just mac-check
```

It builds, walks every check below, asks y/n where only you can tell, and writes
`mac-check-results.md` (git-ignored) to paste into the pull request.

It runs may-i in-process with a temporary config and temporary receipts. Every
`security` call goes to a throwaway Keychain item, service `ai-may-i-test`, which it
creates at the start and deletes at the end. It never reads the `ai-may-i` item and
never runs `op`: the only command it lets may-i run is `/bin/sh`.

## The checks

| # | Check | How | Passes when |
| --- | --- | --- | --- |
| 1 | `alerter` flags | `alerter -help` | It lists `--title`, `--message`, `--actions`, `--sound`, `--timeout` and `--group`, the flags may-i passes. |
| 2 | doctor | `may-i doctor`, without and then with the Keychain item | It fails on the missing item and exits 1, then passes and exits 0. |
| 3 | Keychain read | may-i reads the item | The token matches what the item stores. |
| 4 | Focus | Type in another app while a request starts | The notification appears, and your keystrokes stay in that app. |
| 5 | No default button | In the dialog, press Return twice, then Escape | The dialog stays open. |
| 6 | Deny | Click Deny | Exit 77. The receipt says `not approved: deny`. Nothing ran. |
| 7 | Approve | Click Approve | Exit 0. The command got the token as `OP_SERVICE_ACCOUNT_TOKEN`. |
| 8 | Timeout | `--timeout 10`, touch nothing | Exit 77. The receipt says `not approved: timeout`. |
| 9 | Dialog timeout | `--timeout 10`, open the dialog, then leave it | Exit 77, `not approved: timeout`, answered via `notification+dialog`. |
| 10 | System log | `log show --last 10m --style compact --predicate 'eventMessage CONTAINS "<id>"'` with a receipt's id | The receipt's one-line copy is there. |
| 11 | Hook | A live Claude Code session with `may-i-hook` as a `PreToolUse` hook asks to run `op read …` | Claude Code reports the call as blocked and shows the `may-i --agent claude-code:… --` command. The command did not run. |
| 12 | No macOS prompt | Watch for a Keychain or password prompt during the run | None appears. |
| 13 | Missing item | Delete the item, then read it | may-i refuses with `no Keychain item for service ai-may-i, account op-service-account`. |

Without `alerter`, checks 1, 4 and 9 are skipped and the dialog opens straight away.
