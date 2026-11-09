/** Runs may-i and turns any throw into a refusal: a gate that broke must never fall through
 *  to the command it stands in front of. Separate from `main.ts` so a test can prove it. */

import { EXIT_REFUSED } from "./gate.js";

export function failClosed(run: () => number, stderr: (line: string) => void): number {
  try {
    return run();
  } catch (err) {
    stderr(
      `may-i: failed before it could decide: ${err instanceof Error ? err.message : String(err)}`,
    );
    return EXIT_REFUSED;
  }
}
