// railrat.net only prints a "Nm lt" badge for small delays; a train running
// 1.5 hours late shows nothing, which reads as "on time". This derives the
// badge from the "Ar sch. HH:MM, est./act. HH:MM" detail line instead.
// Pure and dependency-free so both the scraper and client components can use it.

import type { TrainEntry } from './trains';

/** Minutes late (+) or early (-) from the arrival detail line, or null when
 *  there is no scheduled time or no estimate/actual to compare. */
export function delayMinutes(details: string[]): number | null {
  for (const line of details) {
    const m = line.match(/^Ar\s+sch\.\s*(\d{1,2}):(\d{2})(?:\s*,\s*(?:est|act)\.\s*(\d{1,2}):(\d{2}))?/i);
    if (!m) continue;
    if (m[3] == null) return null;
    let d = (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2]));
    if (d > 720) d -= 1440;          // crossed midnight
    else if (d < -720) d += 1440;
    return d;
  }
  return null;
}

function label(d: number): string {
  if (d === 0) return 'on tm';
  const n = Math.abs(d);
  const t = n >= 60 ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ''}` : `${n}m`;
  return `${t} ${d > 0 ? 'lt' : 'er'}`;
}

/** Fill in status/minutesOff/warn when railrat left them blank. Entries that
 *  already carry railrat's own badge are returned untouched. */
export function withDelay(e: TrainEntry): TrainEntry {
  if (e.status) return e;
  const d = delayMinutes(e.details);
  if (d == null) return e;
  return { ...e, status: label(d), minutesOff: d, warn: e.warn || d >= 15 };
}
