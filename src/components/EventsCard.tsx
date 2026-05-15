'use client';

import { useState } from 'react';
import Modal from './Modal';

// Unified event row used inside the card. We convert both Ticketmaster
// events and locally-scraped venue events into this shape in page.tsx.
export interface UEvent {
  id: string;
  title: string;
  venue: string;
  city?: string;
  start_at: number | null;
  url?: string;
  description?: string;
  image?: string;
  source: 'ticketmaster' | 'local';
  source_label: string;          // "Ticketmaster" | "Del Cielo Brewing" | etc.
  segment?: string;
  genre?: string;
  pleaseNote?: string;
}

export default function EventsCard({ events, tz }: { events: UEvent[]; tz: string }) {
  const [open, setOpen] = useState<UEvent | null>(null);

  return (
    <section className="card-section events-card">
      <h2>Events <span className="count">{events.length}</span></h2>
      {events.length === 0 ? (
        <p className="empty">No events cached.</p>
      ) : (
        <div className="stack-sm">
          {events.slice(0, 12).map((e) => (
            <button
              key={e.id}
              type="button"
              className="event-row clickable"
              onClick={() => setOpen(e)}
            >
              <span className="when">{e.start_at ? fmtDateShort(e.start_at * 1000, tz) : 'TBA'}</span>
              <span className="name">{e.title}</span>
              <span className="venue">{e.source_label}{e.venue && e.venue !== e.source_label ? ` · ${e.venue}` : ''}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? 'Event'} size="lg">
        {open && (
          <>
            {open.image && (
              <img
                src={open.image}
                alt=""
                style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 4, marginBottom: 12 }}
              />
            )}
            {open.start_at && (
              <div className="meta" style={{ marginBottom: 8 }}>
                <b>{new Date(open.start_at * 1000).toLocaleString('en-US', {
                  timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}</b>
              </div>
            )}
            {open.venue && (
              <div className="meta" style={{ marginBottom: 6 }}>
                {open.venue}
                {open.city && ` · ${open.city}`}
              </div>
            )}
            {(open.segment || open.genre) && (
              <div className="meta muted" style={{ marginBottom: 12 }}>
                {[open.segment, open.genre].filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="meta muted" style={{ marginBottom: 12 }}>via {open.source_label}</div>
            {open.pleaseNote && <p style={{ marginBottom: 10 }}>{open.pleaseNote}</p>}
            {open.description && (
              <p style={{ lineHeight: 1.5, marginBottom: 12 }}>{open.description}</p>
            )}
            {open.url && (
              <a className="event-modal-btn primary" href={open.url} target="_blank" rel="noopener">
                {open.source === 'ticketmaster' ? 'Get tickets →' : `View on ${open.source_label} →`}
              </a>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}

function fmtDateShort(ms: number, tz: string): string {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
}
