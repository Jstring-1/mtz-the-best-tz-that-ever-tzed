import { getJson } from '@/lib/cache';
import type { NoaaForecastPeriod } from '@/lib/types';

// 7-day forecast strip.  Renders below the hourly strip on every page.
// Concise: day name + high temp only. NOAA splits day/night periods; we
// take daytime periods and let the first non-day period through (e.g.
// "Tonight") for early-evening visits.

export default async function ForecastStrip() {
  let periods: NoaaForecastPeriod[] = [];
  try {
    const fc = await getJson<{ properties?: { periods?: NoaaForecastPeriod[] } }>('NOAA_gp_forecast');
    const all = fc?.properties?.periods ?? [];
    // Prefer daytime periods; if the first is night (evening visit), keep it.
    const first = all[0];
    const daytime = all.filter((p) => p.isDaytime);
    periods = first && !first.isDaytime ? [first, ...daytime].slice(0, 7) : daytime.slice(0, 7);
  } catch (e) {
    console.error('ForecastStrip cache read failed:', e);
  }

  return (
    <>
      {periods.length === 0
        ? <span className="label">forecast —</span>
        : periods.map((d, i) => (
          <span key={i} className="hf-cell" title={[d.name, d.shortForecast].filter(Boolean).join(' — ')}>
            <span className="label">{shortName(d.name, d.startTime, d.isDaytime)}</span>{' '}
            <span className="wx-temp">{d.temperature != null ? `${d.temperature}°` : '—'}</span>
          </span>
        ))}
    </>
  );
}

function shortName(s?: string, startTime?: string, isDaytime?: boolean): string {
  if (!s) return '';
  const map: Record<string, string> = {
    Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
    Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
    'This Afternoon': 'Today', 'This Morning': 'Today',
    Today: 'Today', Tonight: 'Tonight',
  };
  if (map[s]) return map[s];
  // "Monday Night" → "Mon Nt"
  const nightMatch = s.match(/^(\w+) Night$/);
  if (nightMatch) {
    const day = nightMatch[1];
    return `${map[day] ?? day.slice(0, 3)} Nt`;
  }
  // NOAA replaces the weekday with the holiday name on federal holidays
  // ("Memorial Day", "Independence Day", etc.) — derive the day-of-week
  // from startTime instead so we never show a half-clipped holiday.
  if (startTime) {
    const d = new Date(startTime);
    if (!Number.isNaN(d.getTime())) {
      const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' });
      return isDaytime === false ? `${dow} Nt` : dow;
    }
  }
  return s.slice(0, 5);
}
