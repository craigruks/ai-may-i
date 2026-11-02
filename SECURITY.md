# Security policy

## Disclaimer

This software is provided **"AS IS"**, without warranty of any kind, express or implied.
It is **not audited** and is **not a security guarantee**. It guards one path, listed
below, on one Mac. It does not make an agent safe to run with production access, and it
does not replace your own judgement when you click Approve.

**The authors accept no liability for any loss or damages** arising from the use of this
software. See the [LICENSE](./LICENSE) (MIT) for the full terms.

## Scope

may-i guards a command that an agent runs through `may-i` and that reaches 1Password
references with `op` or `varlock`. A report is in scope when may-i:

- runs an ask-tier command without a click on Approve, or runs a deny-tier command at all;
- lets a keystroke, a timeout, a closed notification or an error count as an Approve;
- lets the prod token reach anything but the approved command: an event, a receipt, the
  system log, an observer, or may-i's own output;
- lets text from the agent escape the AppleScript string in the dialog;
- lets a repo's `.may-i.json` loosen the user's config;
- runs a command after it failed to open the receipts file;
- writes a receipt that breaks a rule and that `may-i verify` passes;
- lets through a command line that `spec/hook-lex.json` says the hook catches.

## Known limits in v0.1

These are not covered. Do not assume they are.

- may-i reads the prod token with `/usr/bin/security`. Any process that runs as you can run
  `security` and read the same Keychain item. v0.2 reads it in-process from a signed
  binary, so the item can trust may-i alone.
- The hook cannot see `op` behind a variable, inside a script file or on a shell's stdin.
  An agent that runs `op` that way gets its own environment, so keep the prod token out
  of that environment.
- `--agent` is a label that any caller can set. It is not authentication.
- Redaction is best effort. A secret typed as a literal value, not passed by reference,
  can show in the prompt and the receipt when its form is not one may-i masks.
- A person who approves a command they did not read.

## Supported versions

Pre-1.0, and no release is published yet: only the latest commit on `main` receives
security fixes.

| Version | Supported |
| --- | --- |
| `main` | yes |
| anything older | no |

## Reporting a vulnerability

Report a suspected vulnerability **privately** through GitHub Security Advisories
("Report a vulnerability" on the repository's Security tab), not in a public issue. A
public issue that shows a working bypass discloses it before a fix exists.

Include a description, the commit you tested, and a reproduction if you can. Expect an
acknowledgement within 72 hours. Please allow a reasonable window for a fix before public
disclosure.
