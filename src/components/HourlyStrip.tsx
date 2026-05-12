import { getNoaaHourly } from '@/lib/cache';
import { getLocation } from '@/lib/location';

// Next-12-hours strip.  Renders below the main weather strip on every page.
// Reads NOAA gridpoint hourly cache rows — concise: hour + temp only.

interface HourlyPayload {
  temperature?: number;
  shortForecast?: string;
}

export default async function HourlyStrip() {
  const loc = getLocation();
  let cells: { ts: number; p: HourlyPayload }[] = [];
  try {
    const rows = await getNoaaHourly();
    const now = Math.floor(Date.now() / 1000);
    cells = rows
      .map((r) => {
        const ts = Number(r.ts);
        let p: HourlyPayload = {};
        try { p = JSON.parse(r.json) as HourlyPayload; } catch { /* ignore */ }
        return { ts, p };
      })
      .filter(({ ts }) => ts >= now - 3600 && ts <= now + 12 * 3600)
      .slice(0, 12);
  } catch (e) {
    console.error('HourlyStrip cache read failed:', e);
  }

  return (
    <section className="wx-row-hourly" aria-label="Next 12 hours">
      {cells.length === 0
        ? <span className="label">hourly —</span>
        : cells.map(({ ts, p }) => {
          const now = Math.floor(Date.now() / 1000);
          const isNow = ts <= now && now < ts + 3600;
          return (
            <span key={ts} className={`cell ${isNow ? 'now' : ''}`} title={p.shortForecast ?? ''}>
              <span className="label">{fmtHour(ts * 1000, loc.timezone)}</span>
              <span className="wx-temp">{p.temperature != null ? `${p.temperature}°` : '—'}</span>
            </span>
          );
        })}
    </section>
  );
}

function fmtHour(ms: number, tz: string) {
  return new Date(ms).toLocaleString('en-US', { timeZone: tz, hour: 'numeric' })
    .replace(' ', '').toLowerCase();
}
