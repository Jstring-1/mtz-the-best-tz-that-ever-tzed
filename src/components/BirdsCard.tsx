'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';

export interface BirdSighting {
  name: string;          // common name, e.g. "Black-throated Gray Warbler"
  fancy_name?: string;   // scientific name
  date?: string;
  place?: string;
  count?: number | null;
  lat?: string | number;
  lon?: string | number;
  // Pre-fetched Wikipedia summary (joined from bird_wiki in store.ts).
  // Populated by the eBird cron — null until the backfill has run.
  wiki_description?: string | null;
  wiki_extract?: string | null;
  wiki_thumbnail?: string | null;
  wiki_url?: string | null;
}

interface WikiSummary {
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

export default function BirdsCard({ sightings }: { sightings: BirdSighting[] }) {
  const [open, setOpen] = useState<BirdSighting | null>(null);
  const [wiki, setWiki] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setWiki(null); setError(null); return; }
    // If the cron backfill already cached the summary, use it directly.
    if (open.wiki_extract || open.wiki_description) {
      setWiki({
        title: open.name,
        description: open.wiki_description ?? undefined,
        extract: open.wiki_extract ?? undefined,
        thumbnail: open.wiki_thumbnail ? { source: open.wiki_thumbnail } : undefined,
        content_urls: open.wiki_url ? { desktop: { page: open.wiki_url } } : undefined,
      });
      setLoading(false);
      return;
    }
    // Fallback: cache miss (new species the cron hasn't picked up yet).
    // Hit Wikipedia live just this once.
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(open.name)}`);
        if (!r.ok) throw new Error(`Wikipedia ${r.status}`);
        const j = await r.json() as WikiSummary;
        if (!cancelled) setWiki(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  return (
    <section className="card-section birds-card">
      <h2>Bird sightings <span className="count">{sightings.length}</span></h2>
      {sightings.length === 0 ? (
        <p className="empty">No recent notable sightings.</p>
      ) : (
        <div className="stack-sm">
          {sightings.slice(0, 12).map((b, i) => (
            <button
              key={`${b.name}-${i}`}
              type="button"
              className="bird-row clickable"
              onClick={() => setOpen(b)}
            >
              <span className="name">{b.name}</span>
              <span className="sub">
                {b.place ?? ''}{b.count ? ` · ${b.count}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name} size="lg">
        {open && (
          <>
            {open.fancy_name && <div className="meta" style={{ fontStyle: 'italic', marginBottom: 8 }}>{open.fancy_name}</div>}
            <div className="meta">
              {open.place ?? ''}{open.date ? ` · ${open.date}` : ''}{open.count ? ` · ${open.count} seen` : ''}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />

            {loading && <p className="muted">Looking up on Wikipedia…</p>}
            {error && <p className="muted" style={{ color: 'indianred' }}>Couldn&apos;t reach Wikipedia: {error}</p>}
            {wiki && (
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {wiki.thumbnail?.source && (
                  <img
                    src={wiki.thumbnail.source}
                    alt=""
                    style={{ width: 140, height: 'auto', borderRadius: 4, flex: '0 0 auto' }}
                  />
                )}
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  {wiki.description && <div className="meta" style={{ marginBottom: 6 }}>{wiki.description}</div>}
                  {wiki.extract && <p style={{ lineHeight: 1.55, fontSize: '.95em' }}>{wiki.extract}</p>}
                  {wiki.content_urls?.desktop?.page && (
                    <p style={{ marginTop: 12 }}>
                      <a className="event-modal-btn primary" href={wiki.content_urls.desktop.page} target="_blank" rel="noopener">
                        Read on Wikipedia →
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
