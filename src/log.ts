/**
 * `may-i log`: what each agent did, one line per request. The allow tier runs
 * unasked by design, so this is where anyone sees what staging access was used.
 */

import type { Receipt } from "./receipts.js";

export interface LogFilter {
  agent?: string | undefined;
  since?: Date | undefined;
}

const UNITS: Readonly<Record<string, number>> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

/** `30m`, `12h`, `7d`, or anything Date can parse (`2026-10-31`). */
export function parseSince(raw: string, now: Date): Date | string {
  const rel = /^(\d+)([mhd])$/.exec(raw);
  if (rel) return new Date(now.getTime() - Number(rel[1]) * (UNITS[rel[2] ?? ""] ?? 0));
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? `--since takes 30m, 12h, 7d or a date, not "${raw}"` : at;
}

/** How it went, in the words a reader scans for: allowed, approved or refused. */
function how(r: Receipt): string {
  if (r.outcome === "refused") return `refused: ${r.why ?? "no reason recorded"}`;
  const asked = r.events.some((e) => e.type === "asked");
  return `${asked ? "approved" : "allowed"}, exit ${r.code ?? "?"}`;
}

export function formatLog(receipts: readonly Receipt[], filter: LogFilter): string[] {
  const shown = receipts.filter(
    (r) =>
      (filter.agent === undefined || r.agent === filter.agent) &&
      (filter.since === undefined || new Date(r.at) >= filter.since),
  );
  const rows = shown.map((r) => [r.at.slice(0, 16).replace("T", " "), r.agent ?? "?", how(r)]);
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => row[i]?.length ?? 0)));
  return rows.map((row, n) => {
    const cells = row.map((cell, i) => cell.padEnd(widths[i] ?? 0));
    return [...cells, shown[n]?.command ?? "?"].join("  ");
  });
}
