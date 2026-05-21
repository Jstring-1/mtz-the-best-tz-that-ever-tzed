'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import type { FeedRow } from '@/lib/types';
import { relativeFromUnixSeconds } from '@/lib/time';
import { useUrlString } from '@/lib/useUrlState';

export default function NewsCard({ items }: { items: FeedRow[] }) {
  const [newsTs, setNewsTs] = useUrlString('news');
  const open = useMemo(
    () => (newsTs ? items.find((f) => String(f.ts) === newsTs) ?? null : null),
    [newsTs, items],
  );
  const setOpen = (f: FeedRow | null) => setNewsTs(f ? String(f.ts) : null);

  return (
    <section className="card-section news-card">
      {items.length === 0 ? (
        <p className="empty">No items cached yet.</p>
      ) : (
        <>
          <div className="stack-sm">
            {items.map((f) => (
              <button
                key={f.ts}
                type="button"
                className="news-item clickable"
                onClick={() => setOpen(f)}
              >
                <h3>{f.title}</h3>
                <div className="meta">{relativeFromUnixSeconds(f.ts)}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title} size="lg">
        {open && (
          <>
            <div className="meta" style={{ marginBottom: 10 }}>{relativeFromUnixSeconds(open.ts)}</div>
            {open.body && (
              <div
                className="news-body"
                style={{ lineHeight: 1.55, fontSize: '.95em' }}
                // RSS bodies are HTML; render trusted feed sources verbatim.
                dangerouslySetInnerHTML={{ __html: open.body }}
              />
            )}
            <p style={{ marginTop: 16 }}>
              <a className="event-modal-btn primary" href={open.link} target="_blank" rel="noopener">Read full article →</a>
            </p>
          </>
        )}
      </Modal>
    </section>
  );
}
