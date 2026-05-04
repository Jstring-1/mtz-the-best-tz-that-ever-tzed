import { getJson, getAllJsonTimestamps } from '@/lib/cache';
import type { ShowRow } from '@/lib/types';
import { getLocation } from '@/lib/location';
import { relativeFromIso } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EventsPage() {
  const loc = getLocation();
  const [shows, ts] = await Promise.all([
    getJson<Record<string, ShowRow> | string>('TM_shows'),
    getAllJsonTimestamps(),
  ]);

  const list = (typeof shows === 'object' && shows !== null) ? Object.values(shows) : [];
  list.sort((a, b) => a.date - b.date);

  // Group by month label
  const groups: Record<string, ShowRow[]> = {};
  for (const s of list) {
    const label = s.date ? new Date(s.date * 1000).toLocaleDateString('en-US', { timeZone: loc.timezone, month: 'long', year: 'numeric' }) : 'Unknown';
    (groups[label] ??= []).push(s);
  }

  return (
    <div className="page">
      <h1>Events near {loc.short}</h1>
      <p className="muted">Live music &amp; shows pulled from Ticketmaster within ~80 km, sorted by date.</p>

      {ts['TM_shows'] && <p className="muted" style={{ fontSize: '.8em', marginTop: 8 }}>Cache updated {relativeFromIso(ts['TM_shows'])}</p>}

      {list.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          No events cached yet. Run the 12h bucket on <a href="/admin">/admin</a>.
        </div>
      ) : Object.entries(groups).map(([month, items]) => (
        <section key={month}>
          <h2>{month}</h2>
          <div className="stack">
            {items.map((s, i) => (
              <article className="event" key={i}>
                <div className="date">
                  <span className="d">{s.date ? new Date(s.date * 1000).toLocaleDateString('en-US', { timeZone: loc.timezone, day: 'numeric' }) : '—'}</span>
                  <span>{s.date ? new Date(s.date * 1000).toLocaleDateString('en-US', { timeZone: loc.timezone, weekday: 'short' }) : ''}</span>
                </div>
                <div>
                  <div className="name">{s.band}</div>
                  <div className="venue">{s.venue}{s.city ? ` · ${s.city}` : ''}</div>
                </div>
                {s.distance && <div className="dist">{s.distance}</div>}
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="sources">
        Source: <a href="https://developer.ticketmaster.com" target="_blank" rel="noopener">Ticketmaster Discovery API</a>.
      </div>
    </div>
  );
}
