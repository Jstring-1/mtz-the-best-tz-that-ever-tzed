import { getPlaces } from '@/lib/cache';
import { getLocation } from '@/lib/location';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PlacesPage() {
  const loc = getLocation();
  const places = await getPlaces();

  // Filter to within the city if we can — by string match; safer than relying on
  // the Foursquare distance field for the older cached rows.
  const local = places.filter((p) => (p.addy ?? '').toLowerCase().includes(loc.short.toLowerCase()));
  const list = local.length ? local : places;

  return (
    <div className="page">
      <h1>Places in {loc.short}</h1>
      <p className="muted">Local restaurants, shops, parks &amp; landmarks pulled from Foursquare.</p>

      {list.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          No places cached yet. Run the 12h bucket on <a href="/admin">/admin</a>.
        </div>
      ) : (
        <div className="grid grid-auto" style={{ marginTop: 16 }}>
          {list.map((p) => (
            <article className="place" key={p.fsq_id}>
              <span className="name">{p.name ?? '—'}</span>
              {p.addy && <span className="addy">{p.addy}</span>}
              {p.cats && <span className="cats">{p.cats.replace(/, $/, '')}</span>}
              {p.dist != null && <span className="cats">{p.dist} m away</span>}
            </article>
          ))}
        </div>
      )}

      <div className="sources">
        Source: <a href="https://docs.foursquare.com/developer/reference/place-search" target="_blank" rel="noopener">Foursquare Places API</a>.
      </div>
    </div>
  );
}
