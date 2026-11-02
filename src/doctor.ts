/**
 * `may-i doctor`: is this Mac set up so the gate can work? One plain line per
 * check. A missing `alerter` is a warning, since the dialog still asks without
 * it; anything else that fails means prod access would be refused.
 */

import type { MacShell } from "./dialog.js";
import { ACCOUNT, SECURITY, SERVICE } from "./keychain.js";

export interface Check {
  level: "ok" | "warn" | "fail";
  says: string;
}

export interface DoctorDeps {
  platform: string;
  shell: MacShell;
  receipts: string;
  /** Why `path` cannot be written, or null. */
  canWrite: (path: string) => string | null;
}

const ok = (says: string): Check => ({ level: "ok", says });
const fail = (says: string): Check => ({ level: "fail", says });

/** Without `-w`, find-generic-password reports the item and never prints the token. */
function keychainItem(shell: MacShell): Check {
  const found = shell.run(
    SECURITY,
    ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT],
    30_000,
  );
  return found.status === 0
    ? ok(`Keychain item ${SERVICE} / ${ACCOUNT} exists`)
    : fail(
        `no Keychain item ${SERVICE} / ${ACCOUNT}: security add-generic-password -s ${SERVICE} -a ${ACCOUNT} -w`,
      );
}

export function doctor(deps: DoctorDeps): Check[] {
  if (deps.platform !== "darwin")
    return [fail(`may-i asks only on macOS, and this is ${deps.platform}`)];
  const unwritable = deps.canWrite(deps.receipts);
  const alerter = deps.shell.run("/usr/bin/which", ["alerter"], 5_000).status === 0;
  return [
    keychainItem(deps.shell),
    unwritable
      ? fail(`cannot write receipts to ${deps.receipts}: ${unwritable}`)
      : ok(`receipts go to ${deps.receipts}`),
    alerter
      ? ok("alerter is installed, so a notification comes first")
      : {
          level: "warn",
          says: "no alerter: the dialog opens straight away (brew install vjeantet/tap/alerter)",
        },
  ];
}
