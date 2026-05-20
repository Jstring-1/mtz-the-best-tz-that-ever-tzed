import { getJson, getAllJsonTimestamps } from '@/lib/cache';
import { getLocation } from '@/lib/location';
import { relativeFromIso } from '@/lib/time';
import type { TmEvent } from '@/lib/types';
import EventsList from './EventsList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EventsPage() {
  const loc = getLocation();
  const [raw, ts] = await Promise.all([
    getJson<TmEvent[] | string | Record<string, unknown>>('TM_shows'),
    getAllJsonTimestamps(),
  ]);

  // Cache may hold either the new raw array, the legacy curated object, or
  // the "No events found." string.  Coerce to an array.
  const events: TmEvent[] = Array.isArray(raw) ? raw : [];

  return (
    <div className="page">
      <h1>Events near {loc.short}</h1>
      <p className="muted">
        Live music, sports, comedy, theatre — pulled from Ticketmaster within range. Click any card for details &amp; ticket links.
      </p>
      {ts['TM_shows'] && (
        <p className="muted" style={{ fontSize: '.8em', marginTop: 8 }}>
          Cache updated {relativeFromIso(ts['TM_shows'])}
        </p>
      )}

      {events.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          {!Array.isArray(raw)
            ? 'No events cached in the new format yet — run the 12h bucket on /admin to refresh.'
            : 'No events cached yet. Run the 12h bucket on /admin.'}
        </div>
      ) : (
        <EventsList events={events} timezone={loc.timezone} />
      )}

      <div className="sources">
        Source: <a href="https://developer.ticketmaster.com" target="_blank" rel="noopener">Ticketmaster Discovery API</a>.
      </div>
    </div>
  );
}
