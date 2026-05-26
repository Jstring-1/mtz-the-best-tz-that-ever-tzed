'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { EonetRow } from '@/lib/gov';
import PinMap, { type PinPoint } from './PinMap';

interface Props {
  label: string;
  tooltip?: string;
  data: EonetRow[];
}

// Sources EONET cites are often CSV downloads, IRWIN logins, or other
// non-browsable bureau URLs. Label them so users know what to expect
// before clicking.
function sourceHint(source: { id: string; url: string }): string {
  const id = source.id.toLowerCase();
  const url = source.url.toLowerCase();
  if (id.includes('inciweb'))    return 'wildfire incident page';
  if (id.includes('mrr'))        return 'NIFC media briefing';
  if (id.includes('nasa_dis'))   return 'NASA wildfire data';
  if (id.includes('si_volcano')) return 'Smithsonian volcano page';
  if (id.includes('avo'))        return 'Alaska Volcano Observatory';
  if (id.includes('cima'))       return 'CIMA satellite imagery';
  if (id.includes('usgs'))       return 'USGS event page';
  if (id.includes('noaa') || id.includes('nhc')) return 'NOAA storm advisory';
  if (id.includes('irwin'))      return 'IRWIN (login required)';
  if (url.endsWith('.csv') || url.endsWith('.xls') || url.endsWith('.xlsx')) return 'data download';
  return 'source page';
}

function isLikelyBrowsable(source: { id: string; url: string }): boolean {
  const id = source.id.toLowerCase();
  const url = source.url.toLowerCase();
  if (id.includes('irwin')) return false;
  if (url.endsWith('.csv') || url.endsWith('.xls') || url.endsWith('.xlsx') || url.endsWith('.zip')) return false;
  return true;
}

// Pretty-format coordinates EONET returns as [lng, lat].
function fmtCoords(c?: [number, number]): string {
  if (!c) return '';
  const [lng, lat] = c;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export default function EonetDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('eonet');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // "Fly to this pin" trigger — nonce makes re-clicks of the same pin
  // re-run the animation. We also use the pin click to expand the
  // matching list row inline.
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // EONET stores coords as [lng, lat]. Index id is the array position so
  // pin -> row mapping works even if events lack a stable id.
  const points = useMemo<PinPoint[]>(
    () => data
      .map((e, i): PinPoint | null => {
        if (!e.latestCoords) return null;
        const [lng, lat] = e.latestCoords;
        return { id: String(i), lat, lng, title: e.title };
      })
      .filter((p): p is PinPoint => p !== null),
    [data],
  );

  const onPinClick = (id: string) => {
    const idx = Number(id);
    setOpenIdx(idx);
    setFocus({ id, nonce: Date.now() });
    // Scroll the matching list row into view after the modal repaints.
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="NASA EONET — open natural events" size="lg">
        {data.length === 0 ? (
          <p className="muted">No open events cached. Run /admin → 4h.</p>
        ) : (
          <>
            {points.length > 0 && (
              <PinMap
                points={points}
                onSelect={onPinClick}
                focus={focus}
                flyZoom={5}
                pinColor="#e34234"
                ariaLabel="Map of active NASA EONET events"
              />
            )}
            <ul className="recall-list">
              {data.map((e, i) => {
                const expanded = openIdx === i;
                const coords = fmtCoords(e.latestCoords);
                const pinId = String(i);
                return (
                  <li
                    key={`${e.id ?? e.title}-${i}`}
                    className="recall-item"
                    ref={(el) => {
                      if (el) rowRefs.current.set(pinId, el);
                      else rowRefs.current.delete(pinId);
                    }}
                  >
                    <button
                      type="button"
                      className="recall-head"
                      onClick={() => setOpenIdx(expanded ? null : i)}
                    >
                      <span className="recall-title">{e.title}</span>
                      <span className="meta">
                        <span className="recall-src">{e.category}</span>
                        {e.date && <span> · {e.date}</span>}
                        {coords && <span> · {coords}</span>}
                      </span>
                    </button>
                    {expanded && (
                      <div className="recall-reason">
                        {e.description ? (
                          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{e.description}</p>
                        ) : (
                          <p className="muted" style={{ margin: 0 }}>
                            NASA EONET didn&rsquo;t provide a description for this event.
                          </p>
                        )}
                        {coords && (
                          <p style={{ marginTop: 8 }}>
                            <strong>Latest position:</strong> {coords}
                            {' '}<a className="map-link" href="#"
                              onClick={(ev) => { ev.preventDefault(); setFocus({ id: pinId, nonce: Date.now() }); }}>
                              ↗ zoom on map
                            </a>
                          </p>
                        )}
                        {e.sources && e.sources.length > 0 && (
                          <>
                            <p style={{ marginTop: 8, marginBottom: 4 }}>
                              <strong>Sources cited by NASA:</strong>
                            </p>
                            <ul style={{ paddingLeft: 18, fontSize: '.85em', lineHeight: 1.6 }}>
                              {e.sources.map((s, si) => (
                                <li key={si}>
                                  {isLikelyBrowsable(s) ? (
                                    <a href={s.url} target="_blank" rel="noopener">
                                      {s.id || 'source'}
                                    </a>
                                  ) : (
                                    <span>{s.id || 'source'} <span className="muted">({sourceHint(s)})</span></span>
                                  )}
                                  {' '}<span className="muted">— {sourceHint(s)}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="popup-ext-links">
              <a href="https://eonet.gsfc.nasa.gov/" target="_blank" rel="noopener">EONET event tracker →</a>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
