/**
 * may-i reads the prod token from one Keychain item, only after an Approve and
 * only for the one command approved. The caller's own environment holds the
 * staging token at most.
 *
 * In v0.1 the item is a convenience, not a boundary. The read goes through
 * /usr/bin/security, so Keychain's access check sees `security`, not may-i, and
 * any process can run `security`. What holds the line is the prompt and the
 * receipts. v0.2 reads the item in-process from a signed binary, which makes
 * the item itself a boundary.
 */

import type { MacShell } from "./dialog.js";

/** By absolute path: the gated agent sets PATH. */
export const SECURITY = "/usr/bin/security";
export const SERVICE = "ai-may-i";
export const ACCOUNT = "op-service-account";

/** security(1) exits 44 when the item does not exist. */
const NOT_FOUND = 44;

export type TokenRead = { ok: true; token: string } | { ok: false; why: string };

export interface TokenSource {
  read(): TokenRead;
}

export function keychainToken(shell: MacShell): TokenSource {
  return {
    read() {
      const args = ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"];
      const res = shell.run(SECURITY, args, 30_000);
      if (res.status === NOT_FOUND) {
        return { ok: false, why: `no Keychain item for service ${SERVICE}, account ${ACCOUNT}` };
      }
      if (res.status !== 0) {
        const how = res.status === null ? "was killed" : `exited ${res.status}`;
        return { ok: false, why: `reading the Keychain failed: security ${how}` };
      }
      // `-w` prints the secret and one newline; anything else is part of the secret.
      const token = res.stdout.replace(/\n$/, "");
      return token ? { ok: true, token } : { ok: false, why: "the Keychain item is empty" };
    },
  };
}
