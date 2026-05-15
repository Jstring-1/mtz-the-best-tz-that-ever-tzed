'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { Park } from '@/lib/types';

export default function ParksCard({ parks }: { parks: Park[] }) {
  const [open, setOpen] = useState<Park | null>(null);

  return (
    <section className="card-section parks-card">
      <h2>Parks <span className="count">{parks.length}</span></h2>
      {parks.length === 0 ? (
        <p className="empty">No parks scraped yet.</p>
      ) : (
        <div className="stack-sm">
          {parks.map((p) => (
            <button
              key={p.id}
              type="button"
              className="park-row clickable"
              onClick={() => setOpen(p)}
            >
              <span className="name">{p.name}</span>
              <span className="sub">
                {p.address ?? ''}
                {p.amenities && p.amenities.length
                  ? `${p.address ? ' · ' : ''}${p.amenities.length} amenities`
                  : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? 'Park'} size="lg">
        {open && (
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
                <ul className="park-amenities">
                  {open.amenities.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <a className="event-modal-btn primary" href={open.url} target="_blank" rel="noopener">
                Open park page →
              </a>
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
      </Modal>
    </section>
  );
}
