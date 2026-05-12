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
    <section className="wx-row-forecast" aria-label="7-day forecast">
      {periods.length === 0
        ? <span className="label">forecast —</span>
        : periods.map((d, i) => (
          <span key={i} className="cell" title={d.shortForecast ?? ''}>
            <span className="label">{shortName(d.name)}</span>
            <span className="wx-temp">{d.temperature != null ? `${d.temperature}°` : '—'}</span>
          </span>
        ))}
    </section>
  );
}

function shortName(s?: string): string {
  if (!s) return '';
  const map: Record<string, string> = {
    Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
    Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
    'This Afternoon': 'Today', 'This Morning': 'Today',
    Today: 'Today', Tonight: 'Tonight',
  };
  if (map[s]) return map[s];
  // "Monday Night" → "Mon Nt", "Sunday Night" → "Sun Nt"
  const nightMatch = s.match(/^(\w+) Night$/);
  if (nightMatch) {
    const day = nightMatch[1];
    return `${map[day] ?? day.slice(0, 3)} Nt`;
  }
  return s.slice(0, 5);
}
