'use client';

import { useMemo, useState } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import type { StoredBird } from '@/lib/store';
import PinMap, { type PinPoint } from './PinMap';

interface Props {
  label: string;
  tooltip?: string;
  data: StoredBird[];
}

// Slugify a common name for URL-state matching ("Spotted Towhee" →
// "spotted-towhee"). Tolerant of punctuation.
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fmtDate(unixSec: number | null): string {
  if (!unixSec) return '';
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function BirdsDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('birds');
  const [focusSlug, setFocusSlug] = useUrlString('bird');
  // "Fly to this sighting" trigger for the embedded PinMap. Nonce makes
  // repeat-clicks of the same species re-trigger the animation.
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const zoomToBird = (slug: string) => {
    setFocusSlug(null);   // close any open species modal
    setFocus({ id: slug, nonce: Date.now() });
  };

  // The store query already deduplicates by common_name (DISTINCT ON) and
  // returns newest first, but be defensive in case caller passes raw data.
  const unique = useMemo<StoredBird[]>(() => {
    const seen = new Set<string>();
    const out: StoredBird[] = [];
    for (const b of data) {
      const k = b.common_name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return out;
  }, [data]);

  const focused = useMemo<StoredBird | null>(
    () => (focusSlug ? unique.find((b) => slugify(b.common_name) === focusSlug) ?? null : null),
    [focusSlug, unique],
  );

  // One pin per unique sighting that has coords. Pin id = slug so the
  // species detail modal can route by it; click flies to the pin AND
  // opens the species detail.
  const points = useMemo<PinPoint[]>(
    () => unique
      .map((b): PinPoint | null => {
        const lat = typeof b.lat === 'number' ? b.lat : null;
        const lng = typeof b.lon === 'number' ? b.lon : null;
        if (lat == null || lng == null) return null;
        return { id: slugify(b.common_name), lat, lng, title: b.common_name };
      })
      .filter((p): p is PinPoint => p !== null),
    [unique],
  );

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Recent bird sightings — Martinez area" size="lg">
        {unique.length === 0 ? (
          <p className="muted">No sightings cached. Run /admin → 1h.</p>
        ) : (
          <>
            {points.length > 0 && (
              <PinMap
                points={points}
                onSelect={setFocusSlug}
                focus={focus}
                flyZoom={13}
                pinColor="#4ea2d9"
                ariaLabel="Map of recent bird sightings"
              />
            )}
            <ul className="recall-list bird-list">
              {unique.map((b) => {
                const slug = slugify(b.common_name);
                return (
                  <li key={b.id} className="recall-item bird-item">
                    <button
                      type="button"
                      className="recall-head bird-head"
                      onClick={() => setFocusSlug(slug)}
                    >
                      {b.wiki_thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.wiki_thumbnail} alt="" className="bird-thumb" loading="lazy" />
                      ) : (
                        <span className="bird-thumb placeholder" aria-hidden="true">🐦</span>
                      )}
                      <span className="bird-head-text">
                        <span className="recall-title">{b.common_name}</span>
                        <span className="meta">
                          {b.sci_name && <span className="recall-src" style={{ fontStyle: 'italic' }}>{b.sci_name}</span>}
                          {b.observed_at && <span> · {fmtDate(b.observed_at)}</span>}
                          {b.place && <span> · {b.place}</span>}
                          {b.cnt != null && b.cnt > 1 && <span> · {b.cnt} seen</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="popup-ext-links">
              <a href="https://ebird.org/region/US-CA-013/recent" target="_blank" rel="noopener">eBird — Contra Costa County recent →</a>
            </div>
          </>
        )}
      </Modal>

      {focused && (
        <Modal open={true} onClose={() => setFocusSlug(null)} title={focused.common_name} size="md">
          <div className="rep-bio-detail">
            <div className="rep-bio-head">
              {focused.wiki_thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={focused.wiki_thumbnail} alt={focused.common_name} className="rep-bio-photo" />
              ) : (
                <div className="rep-bio-photo placeholder">🐦</div>
              )}
              <div className="rep-bio-meta">
                {focused.sci_name && <div className="muted" style={{ fontStyle: 'italic' }}>{focused.sci_name}</div>}
                {focused.wiki_description && <div className="muted">{focused.wiki_description}</div>}
                {focused.observed_at && <div className="muted">Last seen {fmtDate(focused.observed_at)}</div>}
                {focused.place && <div className="muted">{focused.place}</div>}
                {focused.cnt != null && focused.cnt > 1 && <div className="muted">{focused.cnt} seen</div>}
              </div>
            </div>

            {focused.wiki_extract && (
              <div className="rep-bio-text">
                {focused.wiki_extract.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
              </div>
            )}
            {!focused.wiki_extract && (
              <p className="muted">
                Wikipedia summary not yet cached for this species — will populate on the next eBird cron run.
              </p>
            )}

            <div className="popup-ext-links">
              {focused.wiki_url && (
                <a href={focused.wiki_url} target="_blank" rel="noopener">Read on Wikipedia →</a>
              )}
              {focused.lat != null && focused.lon != null && (
                <a href="#"
                   onClick={(e) => { e.preventDefault(); zoomToBird(slugify(focused.common_name)); }}>
                  Zoom to sighting on the map →
                </a>
              )}
              <a href={`https://ebird.org/species/${encodeURIComponent(focused.common_name)}`} target="_blank" rel="noopener">
                eBird species page →
              </a>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
