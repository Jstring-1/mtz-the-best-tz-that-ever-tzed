'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import type { Park } from '@/lib/types';

interface Props {
  label: string;
  tooltip?: string;
  data: Park[];
}

// Two-level civic-strip popup:
//   Level 1: a list of all Martinez parks (cards with thumbnail + name).
//   Level 2: click a card → nested modal with the park's address,
//            description, amenities, image, and a Google Maps link.
export default function ParksDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('parks');
  const [parkId, setParkId] = useUrlString('park');

  const focused = useMemo<Park | null>(
    () => (parkId ? data.find((p) => p.id === parkId) ?? null : null),
    [parkId, data],
  );

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Martinez parks" size="lg">
        {data.length === 0 ? (
          <p className="muted">No parks cached yet — run /admin → 12h.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              {data.length} parks scraped from cityofmartinez.org. Click any card for address,
              amenities, and a map link.
            </p>
            <div className="reps-grid">
              {data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="rep-card clickable"
                  onClick={() => setParkId(p.id)}
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="rep-photo" loading="lazy" />
                  ) : (
                    <div className="rep-photo placeholder">⛲</div>
                  )}
                  <div className="rep-body">
                    <div className="rep-name">{p.name}</div>
                    {p.address && <div className="rep-office">{p.address}</div>}
                    {p.amenities && p.amenities.length > 0 && (
                      <div className="rep-notes muted">
                        {p.amenities.slice(0, 3).join(' · ')}
                        {p.amenities.length > 3 ? ` · +${p.amenities.length - 3}` : ''}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>

      {focused && (
        <Modal open={true} onClose={() => setParkId(null)} title={focused.name} size="md">
          <div className="rep-bio-detail">
            {focused.image && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={focused.image} alt={focused.name} className="park-detail-photo" />
              </>
            )}
            {focused.address && (
              <p style={{ margin: 0 }}>
                <strong>Address: </strong>{focused.address}
                {' '}<a className="map-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(focused.address)}`}
                  target="_blank" rel="noopener">↗ map</a>
              </p>
            )}
            {focused.description && (
              <p style={{ lineHeight: 1.55, fontSize: '.92em' }}>{focused.description}</p>
            )}
            {focused.amenities && focused.amenities.length > 0 && (
              <>
                <h3 className="rep-h">Amenities</h3>
                <ul className="park-amen-list">
                  {focused.amenities.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </>
            )}
            <p className="rep-bio-links" style={{ marginTop: 8 }}>
              {focused.url && (
                <a className="event-modal-btn primary" href={focused.url} target="_blank" rel="noopener">
                  Park page on cityofmartinez.org →
                </a>
              )}
              {focused.address && (
                <a className="event-modal-btn"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(focused.address)}`}
                  target="_blank" rel="noopener">
                  Open in Google Maps →
                </a>
              )}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
