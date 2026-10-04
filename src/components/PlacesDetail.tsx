'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import PinMap, { type PinPoint } from './PinMap';
import type { PlaceRow } from '@/lib/types';
import { EBRPD_MAPS, PARK_EXT_LINKS } from '@/lib/park-maps-data';
import type { DiscoveredSpot, NewsMention } from '@/lib/places-discovery';
import type { VenueEvent } from '@/lib/place-events';

interface Props {
  label: string;
  tooltip?: string;
  data: PlaceRow[];
  /** Auto-detected new spots + opening news (see places-discovery.ts). */
  discovery?: { spots: DiscoveredSpot[]; news: NewsMention[] } | null;
  /** Upcoming events keyed by place id. */
  venueEvents?: Record<string, VenueEvent[]>;
}

interface PlaceDetails {
  hours?: string;
  phone?: string;
  website?: string;
  cuisine?: string[];
  tags?: string[];
  checked?: string;
}

function parseDetails(raw: string | null | undefined): PlaceDetails | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as PlaceDetails; } catch { return null; }
}

// OSM opening_hours is terse ("Mo-Fr 11:00-21:00; Sa,Su 09:00-22:00").
// Not a full parser — just make the common cases readable.
const DAYS: Record<string, string> = { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun', PH: 'holidays' };
function prettyHours(h: string): string[] {
  return h.split(';').map((part) => part.trim()).filter(Boolean).map((part) =>
    part
      .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d] ?? d)
      .replace(/,/g, ', ')
      .replace(/(\d{1,2}):(\d{2})/g, (_m, hh: string, mm: string) => {
        const n = Number(hh);
        const suffix = n >= 12 && n < 24 ? 'pm' : 'am';
        const h12 = n % 12 === 0 ? 12 : n % 12;
        return mm === '00' ? `${h12}${suffix}` : `${h12}:${mm}${suffix}`;
      })
      .replace(/-/g, '–'),
  );
}

function fmtWhen(sec: number): string {
  return new Date(sec * 1000).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  });
}

function daysAgo(iso?: string): string {
  if (!iso) return '';
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (!Number.isFinite(d) || d < 0) return '';
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
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

// Civic-strip Places popup. Combines OSM-fed curated places + the
// hand-maintained Martinez city parks registry (merged in by the
// parent server component). Bundled EBRPD park-map PDFs are available
// via a dropdown at the top.
//
// Click a pin or a row to fly the map to it; the row expands inline
// with category + distance + address.
export default function PlacesDetail({ label, tooltip, data, discovery, venueEvents }: Props) {
  const [open, setOpen] = useUrlBool('places');
  const [openId, setOpenId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [mapSlug, setMapSlug] = useUrlString('parkmap');
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

  const focusedMap = useMemo(
    () => (mapSlug ? EBRPD_MAPS.find((m) => m.slug === mapSlug) ?? null : null),
    [mapSlug],
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
      <Modal open={open} onClose={() => setOpen(false)} title="Places — Martinez area" size="lg">
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
                maxFitZoom={15}
                pinColor="#c084fc"
                ariaLabel="Map of cached Martinez places"
              />
            )}

            {discovery && (discovery.spots.length > 0 || discovery.news.length > 0) && (
              <div className="place-new">
                <div className="meta muted place-new-head">New &amp; noteworthy <span title="Found automatically from OpenStreetMap edits and local news headlines — may be incomplete or wrong.">(auto-detected)</span></div>
                <ul className="place-new-list">
                  {discovery.spots.map((x) => (
                    <li key={x.id}>
                      <a
                        href={x.lat != null && x.lon != null
                          ? `https://www.google.com/maps/?q=${x.lat},${x.lon}`
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.name}, Martinez, CA`)}`}
                        target="_blank" rel="noopener"
                      >{x.name}</a>
                      <span className="muted"> · {x.label}{x.addr ? ` · ${x.addr}` : ''}{daysAgo(x.osmEdited) ? ` · added to map ${daysAgo(x.osmEdited)}` : ''}</span>
                    </li>
                  ))}
                  {discovery.news.map((n) => (
                    <li key={n.link}>
                      <a href={n.link} target="_blank" rel="noopener">{n.title}</a>
                      <span className="muted"> · news {n.date}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Park maps & guides — bundled EBRPD PDFs surfaced via a
                native <select> dropdown. Selection opens a nested PDF
                modal; the URL state (?parkmap=<slug>) makes the open
                viewer shareable. */}
            <div className="park-maps-dropdown">
              <label htmlFor="park-pdf-select">
                Park maps &amp; guides:
              </label>
              <select
                id="park-pdf-select"
                value={mapSlug ?? ''}
                onChange={(e) => setMapSlug(e.target.value || null)}
              >
                <option value="">— Open a PDF —</option>
                {EBRPD_MAPS.map((m) => (
                  <option key={m.slug} value={m.slug} title={m.note}>{m.label}</option>
                ))}
              </select>
              {PARK_EXT_LINKS.map((l) => (
                <a key={l.url} className="ftr-link" href={l.url} target="_blank" rel="noopener">
                  {l.label} →
                </a>
              ))}
            </div>

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
                        {(() => {
                          const d = parseDetails(p.details);
                          const evs = venueEvents?.[p.fsq_id] ?? [];
                          if (!d && !evs.length) return null;
                          return (
                            <div className="place-extra">
                              {d?.cuisine && d.cuisine.length > 0 && <p style={{ margin: 0 }}><strong>Cuisine:</strong> {d.cuisine.join(', ')}</p>}
                              {d?.hours && (
                                <p style={{ margin: '6px 0 0' }}>
                                  <strong>Hours:</strong>
                                  {prettyHours(d.hours).map((line) => <span key={line} style={{ display: 'block' }}>{line}</span>)}
                                  <span className="muted" style={{ fontSize: '.8em' }}>from OpenStreetMap{d.checked ? `, checked ${d.checked}` : ''} — confirm before you go</span>
                                </p>
                              )}
                              {d?.phone && <p style={{ margin: '6px 0 0' }}><strong>Phone:</strong> <a href={`tel:${d.phone.replace(/[^+\d]/g, '')}`}>{d.phone}</a></p>}
                              {d?.website && <p style={{ margin: '6px 0 0' }}><a href={d.website} target="_blank" rel="noopener">Website →</a></p>}
                              {d?.tags && d.tags.length > 0 && <p className="muted" style={{ margin: '6px 0 0' }}>{d.tags.join(' · ')}</p>}
                              {evs.length > 0 && (
                                <div style={{ margin: '8px 0 0' }}>
                                  <strong>Coming up here:</strong>
                                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                    {evs.map((e) => (
                                      <li key={`${e.start_at}-${e.title}`}>
                                        {e.url ? <a href={e.url} target="_blank" rel="noopener">{e.title}</a> : e.title}
                                        <span className="muted"> · {fmtWhen(e.start_at)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
                        {hasCoords && (
                          <div className="popup-ext-links">
                            <a href={`https://www.google.com/maps/?q=${p.lat},${p.lon}`} target="_blank" rel="noopener">
                              Open in Google Maps →
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
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
            <p className="pdf-search-hint muted">
              Tip: click into the PDF and press <kbd>Ctrl</kbd>+<kbd>F</kbd> (<kbd>⌘</kbd>+<kbd>F</kbd> on Mac) to search.
            </p>
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
