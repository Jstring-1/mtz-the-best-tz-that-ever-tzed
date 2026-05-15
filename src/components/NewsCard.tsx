'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { FeedRow } from '@/lib/types';
import { relativeFromUnixSeconds } from '@/lib/time';

const PAGE = 12;

export default function NewsCard({ items }: { items: FeedRow[] }) {
  const [open, setOpen] = useState<FeedRow | null>(null);
  const [shown, setShown] = useState(PAGE);
  const remaining = Math.max(0, items.length - shown);

  return (
    <section className="card-section news-card">
      <h2>News <span className="count">{items.length}</span></h2>
      {items.length === 0 ? (
        <p className="empty">No items cached yet.</p>
      ) : (
        <>
          <div className="stack-sm">
            {items.slice(0, shown).map((f) => (
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
          {remaining > 0 && (
            <button
              type="button"
              className="load-more"
              onClick={() => setShown((n) => n + PAGE)}
            >Load more ({remaining})</button>
          )}
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
