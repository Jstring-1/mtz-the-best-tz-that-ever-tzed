'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TmEvent, TmImage } from '@/lib/types';

interface Props {
  events: TmEvent[];
  timezone: string;
}

const CITY_SHORT: Record<string, string> = {
  'San Francisco': 'SF',
  Sacramento: 'Sac',
  'San Jose': 'SJ',
  'Santa Cruz': 'SC',
  Oakland: 'Oak',
  Berkeley: 'Brkly',
  'San Leandro': 'SLndro',
};

export default function EventsList({ events, timezone }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const dlgRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<TmEvent | null>(null);

  // Drop anything that's already in the past.  Defensive — the cron should
  // already be filtering on startDateTime — but cache rows can outlive a
  // schedule change.  Allow 6 hours of grace so events still in progress
  // tonight don't disappear at midnight UTC.
  const upcoming = useMemo(() => {
    const cutoff = Math.floor(Date.now() / 1000) - 6 * 3600;
    return events.filter((e) => {
      const ts = toEpoch(e);
      return ts == null || ts >= cutoff;
    });
  }, [events]);

  // Derive the set of segments that actually have events so we only render
  // filter buttons for categories present in the data.
  const segments = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of upcoming) {
      const s = primarySegment(e) || 'Other';
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [upcoming]);

  const filtered = useMemo(() => {
    const list = filter === 'all' ? upcoming : upcoming.filter((e) => (primarySegment(e) || 'Other') === filter);
    return [...list].sort((a, b) => (toEpoch(a) ?? 0) - (toEpoch(b) ?? 0));
  }, [upcoming, filter]);

  // Group by month label.
  const groups = useMemo(() => {
    const out = new Map<string, TmEvent[]>();
    for (const e of filtered) {
      const ts = toEpoch(e);
      const label = ts
        ? new Date(ts * 1000).toLocaleDateString('en-US', { timeZone: timezone, month: 'long', year: 'numeric' })
        : 'TBA';
      if (!out.has(label)) out.set(label, []);
      out.get(label)!.push(e);
    }
    return [...out.entries()];
  }, [filtered, timezone]);

  useEffect(() => {
    if (open && dlgRef.current && !dlgRef.current.open) dlgRef.current.showModal();
    if (!open && dlgRef.current && dlgRef.current.open) dlgRef.current.close();
  }, [open]);

  return (
    <>
      <div className="event-filters" role="tablist" aria-label="Event categories">
        <button
          className={`event-filter ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All <span className="count">{upcoming.length}</span>
        </button>
        {segments.map(([seg, count]) => (
          <button
            key={seg}
            className={`event-filter ${filter === seg ? 'active' : ''}`}
            onClick={() => setFilter(seg)}
          >
            {seg} <span className="count">{count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          No events match this filter.
        </div>
      ) : groups.map(([month, items]) => (
        <section key={month}>
          <h2>{month}</h2>
          <div className="stack">
            {items.map((e, i) => (
              <EventCard key={e.id ?? i} ev={e} tz={timezone} onOpen={() => setOpen(e)} />
            ))}
          </div>
        </section>
      ))}

      <dialog
        className="event-modal"
        ref={dlgRef}
        onClose={() => setOpen(null)}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}
      >
        {open && <EventModalBody ev={open} tz={timezone} onClose={() => setOpen(null)} />}
      </dialog>
    </>
  );
}

function EventCard({ ev, tz, onOpen }: { ev: TmEvent; tz: string; onOpen: () => void }) {
  const ts = toEpoch(ev);
  const venue = ev._embedded?.venues?.[0];
  const cityName = venue?.city?.name ?? '';
  const city = CITY_SHORT[cityName] ?? cityName;
  return (
    <article
      className="event"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${ev.name ?? 'event'}`}
    >
      <div className="date">
        {ts ? (
          <>
            <span className="d">{new Date(ts * 1000).toLocaleDateString('en-US', { timeZone: tz, day: 'numeric' })}</span>
            <span>{new Date(ts * 1000).toLocaleDateString('en-US', { timeZone: tz, month: 'short' })}</span>
            <span style={{ color: 'var(--text-muted)' }}>{new Date(ts * 1000).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' })}</span>
          </>
        ) : (
          <span className="d">—</span>
        )}
      </div>
      <div>
        <div className="name">{ev.name ?? 'Untitled event'}</div>
        <div className="venue">
          {venue?.name ?? ''}
          {city ? ` · ${city}` : ''}
        </div>
        <div className="dist" style={{ marginTop: 2 }}>
          {primarySegment(ev) || 'Event'}
          {primaryGenre(ev) ? ` · ${primaryGenre(ev)}` : ''}
        </div>
      </div>
      {typeof ev.distance === 'number' && (
        <div className="dist">{Math.round(ev.distance)} {ev.units === 'KM' ? 'km' : 'mi'}</div>
      )}
    </article>
  );
}

function EventModalBody({ ev, tz, onClose }: { ev: TmEvent; tz: string; onClose: () => void }) {
  const ts = toEpoch(ev);
  const venue = ev._embedded?.venues?.[0];
  const heroImg = pickHeroImage(ev.images);
  const segment = primarySegment(ev);
  const genre = primaryGenre(ev);
  const subgenre = primarySubGenre(ev);
  const sales = ev.sales?.public;
  const status = ev.dates?.status?.code;
  const price = ev.priceRanges?.[0];
  const fmtDateTime = (epochSec: number) =>
    new Date(epochSec * 1000).toLocaleString('en-US', {
      timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  return (
    <div className="event-modal-content">
      <button className="event-modal-close" onClick={onClose} aria-label="Close">×</button>

      {heroImg && <img className="event-modal-hero" src={heroImg.url} alt="" />}

      <h2 className="event-modal-title">{ev.name ?? 'Untitled event'}</h2>

      <div className="event-modal-meta">
        {segment && <span className="badge">{segment}</span>}
        {genre &&   <span className="badge subtle">{genre}</span>}
        {subgenre && <span className="badge subtle">{subgenre}</span>}
        {status && status !== 'onsale' && <span className="badge warn">{status}</span>}
      </div>

      <dl className="event-modal-kv">
        {ts && <><dt>When</dt><dd>{fmtDateTime(ts)}</dd></>}
        {venue?.name && (
          <>
            <dt>Where</dt>
            <dd>
              {venue.name}
              {venue.address?.line1 && <><br />{venue.address.line1}</>}
              {(venue.city?.name || venue.state?.stateCode || venue.postalCode) && (
                <>
                  <br />
                  {venue.city?.name ?? ''}
                  {venue.state?.stateCode ? `, ${venue.state.stateCode}` : ''}
                  {venue.postalCode ? ` ${venue.postalCode}` : ''}
                </>
              )}
              {venue.url && <><br /><a href={venue.url} target="_blank" rel="noopener">Venue page →</a></>}
            </dd>
          </>
        )}
        {typeof ev.distance === 'number' && <><dt>Distance</dt><dd>{ev.distance} {ev.units === 'KM' ? 'km' : 'mi'}</dd></>}
        {price && (
          <>
            <dt>Price range</dt>
            <dd>${price.min}{price.max != null && price.min !== price.max ? `–$${price.max}` : ''} {price.currency ?? 'USD'}</dd>
          </>
        )}
        {sales?.startDateTime && (
          <>
            <dt>On sale</dt>
            <dd>
              {new Date(sales.startDateTime).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })}
              {sales.endDateTime ? ` — ${new Date(sales.endDateTime).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })}` : ''}
            </dd>
          </>
        )}
        {ev.pleaseNote && <><dt>Note</dt><dd>{ev.pleaseNote}</dd></>}
        {ev.info && <><dt>Info</dt><dd>{ev.info}</dd></>}
      </dl>

      <div className="event-modal-actions">
        {ev.url && (
          <a className="event-modal-btn primary" href={ev.url} target="_blank" rel="noopener">Get tickets &amp; full info →</a>
        )}
        {venue?.url && venue.url !== ev.url && (
          <a className="event-modal-btn" href={venue.url} target="_blank" rel="noopener">Venue page</a>
        )}
      </div>
    </div>
  );
}

// ---- helpers ----

function primarySegment(e: TmEvent): string {
  return e.classifications?.[0]?.segment?.name ?? '';
}
function primaryGenre(e: TmEvent): string {
  return e.classifications?.[0]?.genre?.name ?? '';
}
function primarySubGenre(e: TmEvent): string {
  return e.classifications?.[0]?.subGenre?.name ?? '';
}

function toEpoch(e: TmEvent): number | null {
  // Prefer the full ISO dateTime if present, otherwise build noon-local from localDate.
  const iso = e.dates?.start?.dateTime;
  if (iso) {
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  const ld = e.dates?.start?.localDate;
  if (ld) {
    const [y, m, d] = ld.split('-').map(Number);
    if (y && m && d) return Math.floor(Date.UTC(y, m - 1, d, 19, 0, 0) / 1000);  // noon UTC-ish
  }
  return null;
}

function pickHeroImage(images?: TmImage[]): TmImage | null {
  if (!images?.length) return null;
  // Prefer 16:9 large landscape, fall back to widest available.
  const wide = images.filter((i) => i.ratio === '16_9');
  const pool = wide.length ? wide : images;
  return [...pool].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0] ?? null;
}
