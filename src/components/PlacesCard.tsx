'use client';

import { useState } from 'react';
import Modal from './Modal';
import MiniMap from './MiniMap';

// Unified shape — both Foursquare places and scraped Martinez parks
// share this card now. `kind` discriminates the modal layout.
export interface Spot {
  id: string;
  kind: 'park' | 'place';
  name: string;
  address?: string;
  category?: string;          // Foursquare cat string
  distance?: number;          // meters
  amenities?: string[];       // parks
  description?: string;       // parks
  image?: string;             // parks
  url?: string;               // parks
  lat?: number;               // OSM places
  lon?: number;
}

type Group = 'all' | 'food' | 'parks' | 'retail' | 'rec';

// Bucket a spot into a filter group from its kind + category tag text.
// The Overpass scraper only ever pulls 3 kinds of place (food amenities,
// rec/culture, retail shops) plus scraped parks — so we positively match
// parks / retail / rec and treat *everything else* (incl. arbitrary
// cuisine values like "spanish", "donut", "hot_dog") as food.
function classify(s: Spot): Exclude<Group, 'all'> {
  if (s.kind === 'park') return 'parks';
  const c = (s.category ?? '').toLowerCase();
  if (/\b(park|garden|nature.?reserve|playground|dog.?park|picnic)\b/.test(c)) return 'parks';
  if (/shop|store|supermarket|greengrocer|book|cloth|gift|florist|jewel|hardware|bicycle|\bwine\b|market|second.?hand|variety|grocery|pharmacy|boutique|antique/.test(c)) return 'retail';
  if (/museum|gallery|\bart\b|artwork|library|theat(re|er)|arts?.?cent|community.?cent|attraction|viewpoint|fitness|sports?.?cent|leisure.?cent|cinema|aquarium|\bzoo\b|monument|memorial|tourism|tourist/.test(c)) return 'rec';
  return 'food';
}

// Drop the ", Martinez, CA, 94553" city/state/zip tail — only the
// street line is useful.
function shortAddr(a?: string): string {
  if (!a) return '';
  const i = a.search(/\bMartinez\b/i);
  const head = i >= 0 ? a.slice(0, i) : a;
  return head.replace(/[,\s]+$/, '').trim();
}

// Many scraped parks (and some OSM places) have no street address. Fall
// back to "<Name>, Martinez, CA" so the map and Maps link still work.
function mapQuery(s: Spot): string {
  // Exact OSM coordinates are the most reliable; then a real street
  // address; then a name lookup as a last resort.
  if (s.lat != null && s.lon != null) return `${s.lat},${s.lon}`;
  if (s.address && s.address.trim()) return s.address;
  return `${s.name}, Martinez, CA`;
}

export default function PlacesCard({ spots }: { spots: Spot[] }) {
  const [open, setOpen] = useState<Spot | null>(null);
  const [group, setGroup] = useState<Group>('all');

  const shown = group === 'all' ? spots : spots.filter((s) => classify(s) === group);
  const count = (g: Group) =>
    g === 'all' ? spots.length : spots.filter((s) => classify(s) === g).length;

  return (
    <section className="card-section places-card">
      <h2>Places <span className="count">{spots.length}</span></h2>
      <span className="event-tabs reg-filter" role="tablist" aria-label="Places category">
        {(['all', 'food', 'parks', 'retail', 'rec'] as Group[]).map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={group === g}
            className={`event-tab ${group === g ? 'on' : ''}`}
            onClick={() => setGroup(g)}
          >
            {g[0].toUpperCase() + g.slice(1)} <span className="count">{count(g)}</span>
          </button>
        ))}
      </span>
      {shown.length === 0 ? (
        <p className="empty">{spots.length === 0 ? 'No places cached.' : 'No places in this category.'}</p>
      ) : (
        <>
        <div className="stack-sm">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              className="place-row clickable"
              onClick={() => setOpen(s)}
            >
              <span className="name">
                {s.kind === 'park' && <span className="tag tag-park">park</span>}
                {s.name}
              </span>
              <span className="sub">
                {[
                  s.category ? (s.category.split(',')[0] ?? '').trim() : '',
                  shortAddr(s.address),
                  s.kind === 'park' && s.amenities && s.amenities.length
                    ? `${s.amenities.length} amenities`
                    : '',
                ].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? 'Place'} size="lg">
        {open && open.kind === 'park' && (
          <>
            {open.image && (
              <img
                src={open.image}
                alt=""
                style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 4, marginBottom: 12 }}
              />
            )}
            {open.address && <div className="meta" style={{ marginBottom: 8 }}><b>{open.address}</b></div>}
            {open.description && <p style={{ lineHeight: 1.55, marginBottom: 12 }}>{open.description}</p>}
            {open.amenities && open.amenities.length > 0 && (
              <>
                <div className="meta muted" style={{ textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
                  Amenities
                </div>
                <ul className="park-amenities" style={{ marginBottom: 12 }}>
                  {open.amenities.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </>
            )}
            <MiniMap query={mapQuery(open)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {open.url && (
                <a className="event-modal-btn primary" href={open.url} target="_blank" rel="noopener">
                  Open park page →
                </a>
              )}
              <a
                className="event-modal-btn"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(open))}`}
                target="_blank"
                rel="noopener"
              >
                Open in Maps →
              </a>
            </div>
          </>
        )}
        {open && open.kind === 'place' && (
          <>
            {open.address && <div className="meta" style={{ marginBottom: 8 }}>{open.address}</div>}
            {open.category && <div className="meta muted" style={{ marginBottom: 12 }}>{open.category.replace(/,\s*$/, '')}</div>}
            <MiniMap query={mapQuery(open)} />
            <p style={{ marginTop: 14 }}>
              <a
                className="event-modal-btn primary"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(open))}`}
                target="_blank"
                rel="noopener"
              >
                Open in Maps →
              </a>
            </p>
          </>
        )}
      </Modal>
    </section>
  );
}
