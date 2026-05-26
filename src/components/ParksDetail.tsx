'use client';

import { useMemo, useState } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import type { Park } from '@/lib/types';
import { MARTINEZ_PARKS } from '@/lib/parks-data';
import PinMap, { type PinPoint } from './PinMap';

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

// Civic-strip popup contents:
//   Leaflet map (one pin per park) + EBRPD PDF shortcuts + a card list
//   of every park. Cards and pins both call zoomToPark(id), which flies
//   the Leaflet map to that pin. No per-park detail modal — clicking is
//   purely a map-navigation gesture.
export default function ParksDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('parks');
  const [mapSlug, setMapSlug] = useUrlString('parkmap');
  // "Zoom to this park" request — the nonce makes re-clicking the same
  // park re-trigger the flyTo animation (useEffect deps would otherwise
  // see no change).
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const zoomToPark = (id: string) => setFocus({ id, nonce: Date.now() });

  const parks = data ?? MARTINEZ_PARKS;
  const points = useMemo<PinPoint[]>(
    () => parks
      .filter((p): p is Park & { lat: number; lng: number } =>
        typeof p.lat === 'number' && typeof p.lng === 'number')
      .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.name })),
    [parks],
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
        {/* Leaflet map with one pin per park — click a pin to zoom to it. */}
        {points.length > 0 && (
          <PinMap
            points={points}
            onSelect={zoomToPark}
            focus={focus}
            ariaLabel="Map of Martinez parks"
          />
        )}
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
            <div className="reps-grid">
              {parks.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="rep-card clickable"
                  onClick={() => zoomToPark(p.id)}
                  title="Zoom to this park on the map"
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
    </>
  );
}
