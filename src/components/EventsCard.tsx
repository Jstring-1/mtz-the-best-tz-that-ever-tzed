'use client';

import { useState } from 'react';
import Modal from './Modal';
import MiniMap from './MiniMap';

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
  source: 'ticketmaster' | 'local' | 'municipal';
  source_label: string;          // "Ticketmaster" | "Del Cielo Brewing" | "Contra Costa County" | etc.
  segment?: string;
  genre?: string;
  pleaseNote?: string;
  kind?: 'quake';                // earthquakes get a distinct date color + tag
  magnitude?: number | null;
}

type Tab = 'local' | 'municipal' | 'regional';

export default function EventsCard({ events, tz }: { events: UEvent[]; tz: string }) {
  const [open, setOpen] = useState<UEvent | null>(null);
  const [tab, setTab] = useState<Tab>('local');

  const local     = events.filter((e) => e.source === 'local');
  const municipal = events.filter((e) => e.source === 'municipal');
  const regional  = events.filter((e) => e.source === 'ticketmaster');
  const list = tab === 'local' ? local : tab === 'municipal' ? municipal : regional;
  const visible = list;

  const switchTab = (t: Tab) => setTab(t);

  return (
    <section className="card-section events-card">
      <h2>
        Events
        <span className="event-tabs" role="tablist" aria-label="Event scope">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'local'}
            className={`event-tab ${tab === 'local' ? 'on' : ''}`}
            onClick={() => switchTab('local')}
          >Local <span className="count">{local.length}</span></button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'regional'}
            className={`event-tab ${tab === 'regional' ? 'on' : ''}`}
            onClick={() => switchTab('regional')}
          >Regional <span className="count">{regional.length}</span></button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'municipal'}
            className={`event-tab ${tab === 'municipal' ? 'on' : ''}`}
            onClick={() => switchTab('municipal')}
          >Municipal <span className="count">{municipal.length}</span></button>
        </span>
      </h2>
      {list.length === 0 ? (
        <p className="empty">
          {tab === 'local'     ? 'No local events cached yet.'
            : tab === 'municipal' ? 'No municipal events cached yet.'
            : 'No Ticketmaster events cached yet.'}
        </p>
      ) : (
        <>
          <div className="stack-sm">
            {visible.map((e) => (
              <button
                key={e.id}
                type="button"
                className="event-row clickable"
                onClick={() => setOpen(e)}
              >
                <span className={`when${e.kind === 'quake' ? ' quake' : ''}`}>
                  {e.start_at ? fmtDateShort(e.start_at * 1000, tz) : 'TBA'}
                </span>
                <span className="name">
                  {e.kind === 'quake' && e.magnitude != null && (
                    <span className="quake-tag">M{e.magnitude.toFixed(1)}</span>
                  )}
                  {e.title}
                </span>
                <span className="venue">{e.source_label}{e.venue && e.venue !== e.source_label ? ` · ${e.venue}` : ''}</span>
              </button>
            ))}
          </div>
        </>
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
            {(() => {
              // Local scraped events rarely set city; default to Martinez,
              // CA so Google Maps doesn't aim at another "Luigi's Deli"
              // across the country.
              const cityFallback = open.source === 'local' ? 'Martinez, CA' : '';
              const q = [open.venue, open.city || cityFallback].filter(Boolean).join(', ');
              return q ? <MiniMap query={q} /> : null;
            })()}
            {open.url && (
              <a className="event-modal-btn primary" href={open.url} target="_blank" rel="noopener" style={{ marginTop: 14, display: 'inline-block' }}>
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
