'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import PinMap, { type PinPoint } from './PinMap';
import type { PlaceRow } from '@/lib/types';

interface Props {
  label: string;
  tooltip?: string;
  data: PlaceRow[];
}

// Category string is stored as "<group>|<human label>" by the scraper.
// Strip the group prefix for display; tolerate legacy rows without it.
function parseCatLabel(cat: string | null): string {
  if (!cat) return '';
  const m = cat.match(/^(food|parks|rec|retail)\|([\s\S]*)$/i);
  return (m ? m[2] : cat).split(',')[0].replace(/,\s*$/, '').trim();
}

function shortAddr(a: string | null): string {
  if (!a) return '';
  const i = a.search(/\bMartinez\b/i);
  const head = i >= 0 ? a.slice(0, i) : a;
  return head.replace(/[,\s]+$/, '').trim();
}

// Civic-strip Places popup. Pulls from the Foursquare-fed `places`
// table — one pin per row that has lat/lon, plus an expandable list
// underneath. Click a pin OR a row to fly the map to it; the row
// also expands inline with category + distance + address.
export default function PlacesDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('places');
  const [openId, setOpenId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const points = useMemo<PinPoint[]>(
    () => data
      .map((p): PinPoint | null => {
        const lat = p.lat != null ? Number(p.lat) : NaN;
        const lng = p.lon != null ? Number(p.lon) : NaN;
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return { id: p.fsq_id, lat, lng, title: p.name ?? p.fsq_id };
      })
      .filter((p): p is PinPoint => p !== null),
    [data],
  );

  const onPinClick = (id: string) => {
    setOpenId(id);
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
      <Modal open={open} onClose={() => setOpen(false)} title="Places — Martinez area (Foursquare)" size="lg">
        {data.length === 0 ? (
          <p className="muted">No places cached. Run /admin → 12h.</p>
        ) : (
          <>
            {points.length > 0 && (
              <PinMap
                points={points}
                onSelect={onPinClick}
                focus={focus}
                flyZoom={17}
                pinColor="#c084fc"
                ariaLabel="Map of cached Martinez places"
              />
            )}
            <ul className="recall-list">
              {data.map((p) => {
                const expanded = openId === p.fsq_id;
                const catLabel = parseCatLabel(p.cats);
                const addr = shortAddr(p.addy);
                const hasCoords = p.lat != null && p.lon != null;
                return (
                  <li
                    key={p.fsq_id}
                    className="recall-item"
                    ref={(el) => {
                      if (el) rowRefs.current.set(p.fsq_id, el);
                      else rowRefs.current.delete(p.fsq_id);
                    }}
                  >
                    <button
                      type="button"
                      className="recall-head"
                      onClick={() => setOpenId(expanded ? null : p.fsq_id)}
                    >
                      <span className="recall-title">{p.name ?? '—'}</span>
                      <span className="meta">
                        {catLabel && <span className="recall-src">{catLabel}</span>}
                        {addr && <span> · {addr}</span>}
                        {p.dist != null && <span> · {p.dist} m</span>}
                      </span>
                    </button>
                    {expanded && (
                      <div className="recall-reason">
                        {p.addy && (
                          <p style={{ margin: 0 }}><strong>Address:</strong> {p.addy}</p>
                        )}
                        {hasCoords && (
                          <p style={{ marginTop: 6 }}>
                            <strong>Coords:</strong> {Number(p.lat).toFixed(4)}, {Number(p.lon).toFixed(4)}
                            {' '}<a className="map-link" href="#"
                              onClick={(ev) => { ev.preventDefault(); setFocus({ id: p.fsq_id, nonce: Date.now() }); }}>
                              ↗ zoom on map
                            </a>
                          </p>
                        )}
                        <div className="popup-ext-links">
                          <a href={`https://foursquare.com/v/${encodeURIComponent(p.fsq_id)}`} target="_blank" rel="noopener">
                            View on Foursquare →
                          </a>
                          {hasCoords && (
                            <a href={`https://www.google.com/maps/?q=${p.lat},${p.lon}`} target="_blank" rel="noopener">
                              Open in Google Maps →
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="popup-ext-links">
              <a href="https://foursquare.com/explore?ll=37.974,-122.130&q=Martinez" target="_blank" rel="noopener">Foursquare — explore Martinez →</a>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
