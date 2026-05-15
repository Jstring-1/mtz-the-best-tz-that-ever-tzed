'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { TmEvent } from '@/lib/types';

export default function EventsCard({ events, tz }: { events: TmEvent[]; tz: string }) {
  const [open, setOpen] = useState<TmEvent | null>(null);

  return (
    <section className="card-section events-card">
      <h2>Events <span className="count">{events.length}</span></h2>
      {events.length === 0 ? (
        <p className="empty">No events cached.</p>
      ) : (
        <div className="stack-sm">
          {events.slice(0, 10).map((e, i) => {
            const ts = epochOf(e);
            const venue = e._embedded?.venues?.[0];
            return (
              <button
                key={e.id ?? i}
                type="button"
                className="event-row clickable"
                onClick={() => setOpen(e)}
              >
                <span className="when">{ts ? fmtDateShort(ts * 1000, tz) : 'TBA'}</span>
                <span className="name">{e.name ?? 'Untitled'}</span>
                <span className="venue">{venue?.name ?? ''}</span>
              </button>
            );
          })}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? 'Event'} size="lg">
        {open && (
          <>
            {(() => {
              const ts = epochOf(open);
              const venue = open._embedded?.venues?.[0];
              const seg = open.classifications?.[0]?.segment?.name;
              const genre = open.classifications?.[0]?.genre?.name;
              return (
                <>
                  {ts && (
                    <div className="meta" style={{ marginBottom: 8 }}>
                      <b>{new Date(ts * 1000).toLocaleString('en-US', {
                        timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}</b>
                    </div>
                  )}
                  {venue?.name && (
                    <div className="meta" style={{ marginBottom: 6 }}>
                      {venue.name}
                      {venue.city?.name && ` · ${venue.city.name}`}
                    </div>
                  )}
                  {(seg || genre) && (
                    <div className="meta muted" style={{ marginBottom: 12 }}>
                      {[seg, genre].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {open.pleaseNote && <p style={{ marginBottom: 10 }}>{open.pleaseNote}</p>}
                  {open.url && (
                    <a className="event-modal-btn primary" href={open.url} target="_blank" rel="noopener">
                      Get tickets &amp; full info →
                    </a>
                  )}
                </>
              );
            })()}
          </>
        )}
      </Modal>
    </section>
  );
}

function epochOf(e: TmEvent): number | null {
  const iso = e.dates?.start?.dateTime;
  if (iso) { const ms = Date.parse(iso); if (!Number.isNaN(ms)) return Math.floor(ms / 1000); }
  const ld = e.dates?.start?.localDate;
  if (ld) { const [y, m, d] = ld.split('-').map(Number); if (y && m && d) return Math.floor(Date.UTC(y, m - 1, d, 19) / 1000); }
  return null;
}
function fmtDateShort(ms: number, tz: string): string {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
}
