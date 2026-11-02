/**
 * Which 1Password references can this command reach?
 *
 * Only names leave this module, never values: may-i decides on `op://vault/item/field`
 * alone, so it has no reason to hold a secret and none to leak.
 */

import { resolve } from "node:path";

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

/** The file's text, or null when it cannot be read. */
export type ReadText = (path: string) => string | null;

/** `op run --env-file` and `varlock run --path`. */
export const DEFAULT_FILE_FLAGS: readonly string[] = ["--env-file", "--path"];

export interface Sources {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  readText: ReadText;
  /** Flags whose value names a file of references. */
  fileFlags: readonly string[];
  /** Files read on every run, relative to cwd, whether or not the command names them. */
  scanFiles: readonly string[];
}

export interface Found {
  references: string[];
  /** Files the command named that could not be read, as it named them. */
  unreadable: string[];
}

const unquote = (word: string) => word.replace(/^(['"])(.*)\1$/, "$2");

/** Splitting on whitespace also finds a flag inside a `bash -c` string. Crude, and
 *  safe: a file it misses means fewer references, and too few makes it ask. */
function namedFiles(argv: readonly string[], fileFlags: readonly string[]): string[] {
  const words = argv.flatMap((a) => a.split(/\s+/)).filter(Boolean);
  return words.flatMap((word, i) =>
    fileFlags.flatMap((flag) => {
      const next = words[i + 1];
      if (word === flag && next !== undefined) return [unquote(next)];
      if (word.startsWith(`${flag}=`)) return [unquote(word.slice(flag.length + 1))];
      return [];
    }),
  );
}

export function findReferences(argv: readonly string[], sources: Sources): Found {
  const named = new Set(namedFiles(argv, sources.fileFlags));
  const texts: string[] = [];
  const unreadable: string[] = [];
  for (const name of new Set([...named, ...sources.scanFiles])) {
    const text = sources.readText(resolve(sources.cwd, name));
    // A configured file that is absent is normal; one the command names and
    // cannot be read hides exactly what this module is asked to find.
    if (text === null) {
      if (named.has(name)) unreadable.push(name);
    } else {
      texts.push(text);
    }
  }
  // `op run` resolves references in the environment it inherits, too.
  const inherited = Object.values(sources.env).filter((v): v is string => !!v?.includes("op://"));
  const references = referencesIn([...argv, ...texts, ...inherited]);
  return { references, unreadable };
}
