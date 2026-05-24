'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import type { Park } from '@/lib/types';
import { MARTINEZ_PARKS } from '@/lib/parks-data';

interface Props {
  label: string;
  tooltip?: string;
  /** Optional override — defaults to the hand-maintained MARTINEZ_PARKS
   *  registry. Caller can pass an alternate source if needed. */
  data?: Park[];
}

// East Bay Regional Park District PDF maps — bundled in /public/img/
// so they're served same-origin and can be embedded directly in an
// <iframe> (no proxy needed). When a map is selected, the nested modal
// opens with the PDF embedded for in-page reading.
const EBRPD_MAPS: Array<{ slug: string; label: string; file: string; note: string }> = [
  { slug: 'district',     label: 'EBRPD — District Map',         file: '/img/eastbayparksdistrictmap.pdf',
    note: 'Overview map of all East Bay Regional Park District parks (21 pages).' },
  { slug: 'parksbycity',  label: 'EBRPD — Parks by City',        file: '/img/eastbayparksdistrictparksbycity.pdf',
    note: 'Per-city listing of every EBRPD park, with addresses and amenities (90 pages).' },
  { slug: 'wardmap',      label: 'EBRPD — Ward Map',             file: '/img/eastbayparkswardmap.pdf',
    note: 'EBRPD board-of-directors ward boundaries and member assignments (109 pages).' },
];

// Two-level civic-strip popup:
//   Level 1: a list of all Martinez parks (cards with thumbnail + name)
//            plus quick-links to the three EBRPD district map PDFs.
//   Level 2: click a card → nested modal with the park's address,
//            description, amenities, image, and a Google Maps link.
//   Level 2 (map): click an EBRPD map link → nested modal with the
//            PDF embedded inline.
export default function ParksDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('parks');
  const [parkId, setParkId] = useUrlString('park');
  const [mapSlug, setMapSlug] = useUrlString('parkmap');

  const parks = data ?? MARTINEZ_PARKS;
  const focused = useMemo<Park | null>(
    () => (parkId ? parks.find((p) => p.id === parkId) ?? null : null),
    [parkId, parks],
  );
  const focusedMap = useMemo(
    () => (mapSlug ? EBRPD_MAPS.find((m) => m.slug === mapSlug) ?? null : null),
    [mapSlug],
  );

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Martinez parks" size="lg">
        {/* EBRPD district map shortcuts — embedded PDFs from /public/img/. */}
        <div className="park-map-links">
          {EBRPD_MAPS.map((m) => (
            <button
              key={m.slug}
              type="button"
              className="event-modal-btn"
              onClick={() => setMapSlug(m.slug)}
              title={m.note}
            >
              📄 {m.label}
            </button>
          ))}
        </div>

        {parks.length === 0 ? (
          <p className="muted">No parks registered.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              {parks.length} Martinez parks. Click any card for address, amenities,
              and a map link.
            </p>
            <div className="reps-grid">
              {parks.map((p) => (
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

      {focusedMap && (
        <Modal open={true} onClose={() => setMapSlug(null)} title={focusedMap.label} size="xl">
          <div className="park-pdf-wrap">
            <iframe
              key={focusedMap.file}
              src={`${focusedMap.file}#pagemode=none`}
              title={focusedMap.label}
              className="park-pdf-frame"
              loading="lazy"
            />
            <div className="popup-ext-links">
              <a href={focusedMap.file} target="_blank" rel="noopener">Open PDF in new tab →</a>
              <a href={focusedMap.file} download>Download PDF →</a>
            </div>
          </div>
        </Modal>
      )}

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
            <div className="popup-ext-links">
              {focused.url && (
                <a href={focused.url} target="_blank" rel="noopener">Park page on cityofmartinez.org →</a>
              )}
              {focused.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(focused.address)}`}
                   target="_blank" rel="noopener">
                  Open in Google Maps →
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
