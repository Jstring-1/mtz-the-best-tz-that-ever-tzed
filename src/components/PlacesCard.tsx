'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { PlaceRow } from '@/lib/types';

export default function PlacesCard({ places }: { places: PlaceRow[] }) {
  const [open, setOpen] = useState<PlaceRow | null>(null);

  return (
    <section className="card-section places-card">
      <h2>Places nearby <span className="count">{places.length}</span></h2>
      {places.length === 0 ? (
        <p className="empty">No places cached.</p>
      ) : (
        <div className="stack-sm">
          {places.slice(0, 12).map((p) => (
            <button
              key={p.fsq_id}
              type="button"
              className="place-row clickable"
              onClick={() => setOpen(p)}
            >
              <span className="name">{p.name ?? 'Unnamed'}</span>
              <span className="sub">
                {p.dist != null ? `${Math.round(p.dist)} m` : ''}
                {p.cats ? ` · ${(p.cats.split(',')[0] ?? '').trim()}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? 'Place'}>
        {open && (
          <>
            {open.addy && <div className="meta" style={{ marginBottom: 8 }}>{open.addy}</div>}
            {open.cats && <div className="meta muted">{open.cats.replace(/,\s*$/, '')}</div>}
            {open.dist != null && <div className="meta" style={{ marginTop: 6 }}>~{Math.round(open.dist)} m away</div>}
          </>
        )}
      </Modal>
    </section>
  );
}
