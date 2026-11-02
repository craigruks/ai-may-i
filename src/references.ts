/**
 * Which 1Password references can this command reach?
 *
 * Only names leave this module, never values: may-i decides on `op://vault/item/field`
 * alone, so it has no reason to hold a secret and none to leak.
 */

/** A reference ends at whitespace, a quote or shell punctuation, wherever it sits:
 *  a bare argument, `--x=op://…`, or deep inside a `bash -c '…'` string. Item
 *  names with spaces are cut short, which still names the vault the tiers match on. */
const REFERENCE = /op:\/\/[^\s'"`<>|;&()$\\]+/g;

function referencesInText(text: string): string[] {
  // Trailing commas and full stops are prose around a reference, not part of it.
  return [...text.matchAll(REFERENCE)].map((m) => m[0].replace(/[,.]+$/, ""));
}

/** Sorted and once each, so the person approving reads a list they can check. */
export function referencesIn(argv: readonly string[]): string[] {
  return [...new Set(argv.flatMap(referencesInText))].sort();
}
