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
}

export default function PlacesCard({ spots }: { spots: Spot[] }) {
  const [open, setOpen] = useState<Spot | null>(null);

  return (
    <section className="card-section places-card">
      <h2>Places <span className="count">{spots.length}</span></h2>
      {spots.length === 0 ? (
        <p className="empty">No places cached.</p>
      ) : (
        <>
        <div className="stack-sm">
          {spots.map((s) => (
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
                {s.address ?? ''}
                {s.category
                  ? `${s.address ? ' · ' : ''}${(s.category.split(',')[0] ?? '').trim()}`
                  : ''}
                {s.kind === 'park' && s.amenities && s.amenities.length
                  ? `${s.address ? ' · ' : ''}${s.amenities.length} amenities`
                  : ''}
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
            {open.address && <MiniMap query={open.address} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {open.url && (
                <a className="event-modal-btn primary" href={open.url} target="_blank" rel="noopener">
                  Open park page →
                </a>
              )}
              {open.address && (
                <a
                  className="event-modal-btn"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(open.address)}`}
                  target="_blank"
                  rel="noopener"
                >
                  Open in Maps →
                </a>
              )}
            </div>
          </>
        )}
        {open && open.kind === 'place' && (
          <>
            {open.address && <div className="meta" style={{ marginBottom: 8 }}>{open.address}</div>}
            {open.category && <div className="meta muted" style={{ marginBottom: 12 }}>{open.category.replace(/,\s*$/, '')}</div>}
            {open.address && <MiniMap query={open.address} />}
            {open.address && (
              <p style={{ marginTop: 14 }}>
                <a
                  className="event-modal-btn primary"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(open.address)}`}
                  target="_blank"
                  rel="noopener"
                >
                  Open in Maps →
                </a>
              </p>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
