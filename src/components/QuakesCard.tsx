'use client';

import { useState } from 'react';
import Modal from './Modal';
import { relativeFromUnixSeconds } from '@/lib/time';

export interface QuakeRow {
  id?: string;
  magnitude: number | null;
  place: string;
  occurred_at: number;
  url: string;
}

export default function QuakesCard({ quakes, tz }: { quakes: QuakeRow[]; tz: string }) {
  const [open, setOpen] = useState<QuakeRow | null>(null);

  return (
    <section className="card-section quakes-card">
      <h2>Earthquakes <span className="count">{quakes.length}</span></h2>
      {quakes.length === 0 ? (
        <p className="empty">No recent significant CA quakes.</p>
      ) : (
        <div className="stack-sm">
          {quakes.slice(0, 10).map((q, i) => (
            <button
              key={q.id ?? i}
              type="button"
              className="quake-row clickable"
              onClick={() => setOpen(q)}
            >
              <span className={`mag ${magClass(q.magnitude)}`}>{q.magnitude != null ? q.magnitude.toFixed(1) : '—'}</span>
              <span className="place">{q.place}</span>
              <span className="when">{relativeFromUnixSeconds(q.occurred_at)}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `M${open.magnitude?.toFixed(1) ?? '—'} earthquake` : ''}>
        {open && (
          <>
            <div className="meta" style={{ marginBottom: 10 }}><b>{open.place}</b></div>
            <div className="meta">{new Date(open.occurred_at * 1000).toLocaleString('en-US', { timeZone: tz })} — {relativeFromUnixSeconds(open.occurred_at)}</div>
            {open.url && (
              <p style={{ marginTop: 16 }}>
                <a className="event-modal-btn primary" href={open.url} target="_blank" rel="noopener">USGS event page →</a>
              </p>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}

function magClass(m: number | null): string {
  if (m == null) return '';
  if (m >= 6) return 'severe';
  if (m >= 4) return 'moderate';
  return 'minor';
}
