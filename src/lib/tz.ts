// Small timezone helpers shared by the cron-side fetchers.

/** UTC offset in minutes for `tz` at the given instant (e.g. -420 for PDT). */
export function tzOffsetMinutes(at: Date, tz: string): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = part.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 0;
}

/** Epoch seconds for a wall-clock time in `tz` (month is 0-based). */
export function zonedEpoch(y: number, mo: number, d: number, h: number, mn: number, tz: string): number {
  const guess = Date.UTC(y, mo, d, h, mn);
  return Math.floor((guess - tzOffsetMinutes(new Date(guess), tz) * 60_000) / 1000);
}

/** YYYY-MM-DD for `at` as seen in `tz`. */
export function zonedDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
