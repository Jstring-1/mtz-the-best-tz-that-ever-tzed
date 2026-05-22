'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { Rep, RepsPayload } from '@/lib/reps';

interface Props { label: string; tooltip?: string }

function RepCard({ r }: { r: Rep }) {
  const name = r.name?.trim() || '(name unavailable)';
  const partyColor = r.party === 'D' ? 'var(--accent-cool)'
    : r.party === 'R' ? 'var(--accent-warm)'
    : 'var(--text-muted)';
  return (
    <div className="rep-card">
      {r.photoUrl ? (
        // External thumbnails — sized via CSS so missing/oversize doesn't break layout.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photoUrl} alt="" className="rep-photo" loading="lazy" />
      ) : (
        <div className="rep-photo placeholder">{(r.name?.[0] ?? '?').toUpperCase()}</div>
      )}
      <div className="rep-body">
        <div className="rep-name">
          {r.url ? <a href={r.url} target="_blank" rel="noopener">{name}</a> : name}
          {r.party && <span className="rep-party" style={{ color: partyColor }}> · {r.party}</span>}
        </div>
        <div className="rep-office">
          {r.office}
          {r.district && <span className="muted"> · {r.district}</span>}
        </div>
        {(r.phone || r.email) && (
          <div className="rep-contact">
            {r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>}
            {r.phone && r.email && <span> · </span>}
            {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
          </div>
        )}
        {r.notes && <div className="rep-notes muted">{r.notes}</div>}
      </div>
    </div>
  );
}

function Section({ title, reps, emptyHint }: { title: string; reps: Rep[]; emptyHint?: string }) {
  return (
    <section className="reps-section">
      <h3 className="rep-h">{title} <span className="muted" style={{ fontWeight: 400, fontSize: '.78em' }}>({reps.length})</span></h3>
      {reps.length === 0 ? (
        <p className="muted">{emptyHint ?? 'No data.'}</p>
      ) : (
        <div className="reps-grid">
          {reps.map((r, i) => <RepCard key={`${r.office}-${i}`} r={r} />)}
        </div>
      )}
    </section>
  );
}

export default function RepsDetail({ label, tooltip }: Props) {
  const [open, setOpen] = useUrlBool('reps');
  const [data, setData] = useState<RepsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true); setError(null); setEmpty(null);
    fetch('/api/reps', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (j?.empty) { setEmpty(j.reason ?? 'Cache empty.'); return; }
        setData(j as RepsPayload);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading]);

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your elected reps — Martinez to D.C." size="lg">
        {loading && <p className="muted">Loading…</p>}
        {empty && <p className="muted">{empty}</p>}
        {error && <p className="muted">Couldn’t load: {error}</p>}
        {data && (
          <>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              Auto-resolved from official .gov sources (Congress.gov, OpenStates, statewide office homepages, county BOS, City of Martinez).
              Names without a parsed value link out to the official page.
            </p>

            <Section title="City — Martinez" reps={data.city}
              emptyHint="Couldn't read the city site this cycle — try the official link." />

            <Section title="County — Contra Costa BOS" reps={data.county}
              emptyHint="Couldn't read the county BOS page this cycle." />

            <Section title="State Legislature — your CA reps" reps={data.stateLegislature}
              emptyHint="OpenStates lookup empty (key missing or rate-limited)." />

            <Section title="California — statewide officers" reps={data.state}
              emptyHint="Statewide officer pages didn't parse this cycle." />

            <Section title="Federal — Congress + White House" reps={data.federal}
              emptyHint="Congress.gov lookup empty (GOV_API_TOKEN missing or rate-limited)." />

            <p className="muted" style={{ fontSize: '.72em', marginTop: 12 }}>
              Cached {new Date(data.scrapedAt).toLocaleString()}. Refreshes every 12h.
              {Object.keys(data.diag).length > 0 && (
                <> · {Object.keys(data.diag).length} source(s) had partial data</>
              )}
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
