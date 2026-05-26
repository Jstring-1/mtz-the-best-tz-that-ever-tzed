'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { StoredQuake } from '@/lib/store';
import PinMap, { type PinPoint } from './PinMap';

interface Props {
  label: string;
  tooltip?: string;
  data: StoredQuake[];
}

function fmtTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// Civic-strip popup for significant California earthquakes. Pulled from
// the `quakes` table (populated by the USGS significant_month feed) and
// rendered as a Leaflet pin map + a sortable-by-time list underneath.
// Clicking a pin or a list row flies the map to that quake; the row
// also opens for an inline expanded view with the USGS event-page link.
export default function QuakesDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('quakes');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const points = useMemo<PinPoint[]>(
    () => data
      .map((q): PinPoint | null => {
        if (typeof q.lat !== 'number' || typeof q.lon !== 'number') return null;
        return {
          id: q.id,
          lat: q.lat,
          lng: q.lon,
          title: `M${q.magnitude?.toFixed(1) ?? '—'} · ${q.place}`,
        };
      })
      .filter((p): p is PinPoint => p !== null),
    [data],
  );

  const onPinClick = (id: string) => {
    const idx = data.findIndex((q) => q.id === id);
    if (idx === -1) return;
    setOpenIdx(idx);
    setFocus({ id, nonce: Date.now() });
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="USGS — significant California earthquakes" size="lg">
        {data.length === 0 ? (
          <p className="muted">No quakes cached. Run /admin → 1h.</p>
        ) : (
          <>
            {points.length > 0 && (
              <PinMap
                points={points}
                onSelect={onPinClick}
                focus={focus}
                flyZoom={8}
                maxFitZoom={6}
                pinColor="#e34234"
                ariaLabel="Map of recent California earthquakes"
              />
            )}
            <ul className="recall-list">
              {data.map((q, i) => {
                const expanded = openIdx === i;
                return (
                  <li
                    key={q.id}
                    className="recall-item"
                    ref={(el) => {
                      if (el) rowRefs.current.set(q.id, el);
                      else rowRefs.current.delete(q.id);
                    }}
                  >
                    <button
                      type="button"
                      className="recall-head"
                      onClick={() => setOpenIdx(expanded ? null : i)}
                    >
                      <span className="recall-title">
                        M{q.magnitude != null ? q.magnitude.toFixed(1) : '—'} · {q.place}
                      </span>
                      <span className="meta">
                        <span className="recall-src">{fmtTime(q.occurred_at)}</span>
                        {q.lat != null && q.lon != null && (
                          <span> · {q.lat.toFixed(2)}, {q.lon.toFixed(2)}</span>
                        )}
                      </span>
                    </button>
                    {expanded && (
                      <div className="recall-reason">
                        {q.lat != null && q.lon != null && (
                          <p style={{ margin: 0 }}>
                            <strong>Epicenter:</strong> {q.lat.toFixed(3)}°, {q.lon.toFixed(3)}°
                            {' '}<a className="map-link" href="#"
                              onClick={(ev) => { ev.preventDefault(); setFocus({ id: q.id, nonce: Date.now() }); }}>
                              ↗ zoom on map
                            </a>
                          </p>
                        )}
                        {q.url && (
                          <div className="popup-ext-links">
                            <a href={q.url} target="_blank" rel="noopener">USGS event page →</a>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="popup-ext-links">
              <a href="https://earthquake.usgs.gov/earthquakes/map/" target="_blank" rel="noopener">USGS earthquake map →</a>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
