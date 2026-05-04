import { getJson, getAllJsonTimestamps } from '@/lib/cache';
import { getLocation } from '@/lib/location';
import type { BirdRow, QuakeRow } from '@/lib/types';
import { relativeFromIso } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InfoPage() {
  const loc = getLocation();

  const [birds, quakes, ts] = await Promise.all([
    getJson<Record<string, BirdRow>>('eBird'),
    getJson<Record<string, QuakeRow>>('USGS_earthquakes'),
    getAllJsonTimestamps(),
  ]);

  const birdList = birds && typeof birds === 'object' ? Object.values(birds) : [];
  const quakeList = quakes && typeof quakes === 'object' ? Object.values(quakes) : [];

  return (
    <div className="page">
      <h1>{loc.name}</h1>
      <p className="muted">Civic info plus rotating eBird notable sightings and recent CA earthquakes.</p>

      <h2>Birds spotted nearby
        {ts['eBird'] && <span className="ts">· eBird notable · checked {relativeFromIso(ts['eBird'])}</span>}
      </h2>
      {birdList.length === 0 ? (
        <div className="empty">No bird sightings cached yet. Run the 1h bucket on <a href="/admin">/admin</a>.</div>
      ) : (
        <div className="grid grid-auto-sm">
          {birdList.slice(0, 24).map((b, i) => (
            <article className="bird" key={i}>
              <span className="name">{b.name}</span>
              <span className="sci">{b.fancy_name}</span>
              <span className="meta">{b.place}</span>
            </article>
          ))}
        </div>
      )}

      <h2>Recent CA earthquakes
        {ts['USGS_earthquakes'] && <span className="ts">· USGS · checked {relativeFromIso(ts['USGS_earthquakes'])}</span>}
      </h2>
      {quakeList.length === 0 ? (
        <div className="empty">No earthquake data cached yet. Run the 1h bucket on <a href="/admin">/admin</a>.</div>
      ) : (
        <div className="grid grid-auto-sm">
          {quakeList.map((q, i) => (
            <article className="quake" key={i}>
              <span className="mag"><a href={q.url} target="_blank" rel="noopener">M{q.magnitude} earthquake</a></span>
              <span className="place">{q.place}</span>
              <span className="when">{q.occurred_at ? new Date(q.occurred_at * 1000).toLocaleString('en-US', { timeZone: loc.timezone }) : ''}</span>
            </article>
          ))}
        </div>
      )}

      <div className="sources">
        Sources: <a href="https://ebird.org/api/keygen" target="_blank" rel="noopener">eBird API (Cornell Lab)</a> ·{' '}
        <a href="https://earthquake.usgs.gov/fdsnws/event/1/" target="_blank" rel="noopener">USGS Earthquakes feed</a>.
      </div>
    </div>
  );
}
