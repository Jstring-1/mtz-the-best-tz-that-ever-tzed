import { getAllJsonTimestamps, getRowCounts } from '@/lib/cache';
import { relativeFromIso } from '@/lib/time';
import AdminButtons from './AdminButtons';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BUCKETS = [
  { id: '1m',  desc: 'WeatherAPI current, OpenWeather (every 1 minute — needs external pinger)' },
  { id: '2m',  desc: 'PurpleAir AQ (every 2 minutes — needs external pinger)' },
  { id: '5m',  desc: 'NOAA alerts, stocks (every 5 minutes)' },
  { id: '15m', desc: 'NOAA buoys (every 15 minutes)' },
  { id: '1h',  desc: 'NOAA forecast/hourly/aviation, WeatherAPI marine/forecast, USGS earthquakes, eBird (every hour)' },
  { id: '4h',  desc: 'News RSS, NOAA water RSS, NOAA WeatherStory imagery, local-venue event scrape (every 4 hours)' },
  { id: '12h', desc: 'OpenStreetMap places, Ticketmaster events, City of Martinez parks scrape (every 12 hours)' },
  { id: 'all', desc: 'Run every bucket sequentially (manual / cold start)' },
];

export default async function AdminPage() {
  let timestamps: Record<string, string> = {};
  let counts: Record<string, number> = {};
  try { timestamps = await getAllJsonTimestamps(); } catch { /* DB cold */ }
  try { counts = await getRowCounts(); } catch { /* DB cold */ }

  return (
    <div className="page admin">
      <h1>Admin</h1>
      <p className="muted">Manually trigger background refresh buckets. In production these tick automatically via the inline scheduler (src/instrumentation.ts); pages render purely from cached DB rows.</p>

      <h2>Cron buckets</h2>
      <AdminButtons buckets={BUCKETS} />

      <h2>Last updated (apis_json)</h2>
      {Object.keys(timestamps).length === 0 ? (
        <p className="fade">No data cached yet.</p>
      ) : (
        <table className="kv-table">
          <thead><tr><th>id</th><th>updated at</th></tr></thead>
          <tbody>
            {Object.entries(timestamps).map(([id, ts]) => (
              <tr key={id}><td className="k" style={{ color: 'gold' }}>{id}</td><td className="v">{relativeFromIso(ts)} <span className="muted" style={{ fontSize: '.8em' }}>({ts})</span></td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Row counts</h2>
      <table className="kv-table">
        <thead><tr><th>table</th><th>rows</th></tr></thead>
        <tbody>
          {Object.entries(counts).map(([t, c]) => (
            <tr key={t}><td className="k" style={{ color: 'gold' }}>{t}</td><td className="v">{c < 0 ? '—' : c}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
