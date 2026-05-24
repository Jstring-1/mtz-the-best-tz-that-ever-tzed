'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import RepBioModal from './RepBioModal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import type { Rep, RepsPayload } from '@/lib/reps';

interface Props { label: string; tooltip?: string }

// Stable per-rep key for URL-state. Uses bioKey (last-name slug) when
// the rep has one — those have curated bios so they're worth sharing.
// Falls back to a generated slug for everyone else.
function repSlug(r: Rep): string {
  if (r.bioKey) return r.bioKey;
  const base = `${r.level}-${r.name || r.office}`.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'unknown';
}

function partyColor(p?: string): string {
  return p === 'D' ? 'var(--accent-cool)'
    : p === 'R' ? 'var(--accent-warm)'
    : 'var(--text-muted)';
}

function RepCard({ r, onOpen }: { r: Rep; onOpen: (r: Rep) => void }) {
  const name = r.name?.trim() || '(name unavailable)';
  // Clickable if there's anything to show in the popup — bio text,
  // contact info, term dates, or even just an official-page link.
  const hasMore = !!(r.bio || r.phone || r.email || r.notes || r.electedDate || r.termExpires || r.url || r.photoUrl);
  const inner = (
    <>
      {r.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photoUrl} alt="" className="rep-photo" loading="lazy" />
      ) : (
        <div className="rep-photo placeholder">{(r.name?.[0] ?? '?').toUpperCase()}</div>
      )}
      <div className="rep-body">
        <div className="rep-name">
          {name}
          {r.party && <span className="rep-party" style={{ color: partyColor(r.party) }}> · {r.party}</span>}
        </div>
        <div className="rep-office">
          {r.office}
          {r.district && !r.office.includes(r.district) && <span className="muted"> · {r.district}</span>}
        </div>
        {(r.phone || r.email) && (
          <div className="rep-contact">
            {r.phone}
            {r.phone && r.email && <span> · </span>}
            {r.email}
          </div>
        )}
        {r.notes && <div className="rep-notes muted">{r.notes}</div>}
      </div>
    </>
  );
  if (!hasMore) {
    return <div className="rep-card">{inner}</div>;
  }
  return (
    <button type="button" className="rep-card clickable" onClick={() => onOpen(r)}>
      {inner}
    </button>
  );
}

function Section({ title, reps, onOpen, emptyHint, headerExtra }: {
  title: string;
  reps: Rep[];
  onOpen: (r: Rep) => void;
  emptyHint?: string;
  /** Optional inline content rendered after the section title — e.g.
      a Map button next to the County header. */
  headerExtra?: React.ReactNode;
}) {
  return (
    <section className="reps-section">
      <h3 className="rep-h">
        {title} <span className="muted" style={{ fontWeight: 400, fontSize: '.78em' }}>({reps.length})</span>
        {headerExtra && <span className="rep-h-extra" style={{ marginLeft: 8 }}>{headerExtra}</span>}
      </h3>
      {reps.length === 0 ? (
        <p className="muted">{emptyHint ?? 'No data.'}</p>
      ) : (
        <div className="reps-grid">
          {reps.map((r) => <RepCard key={repSlug(r)} r={r} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  );
}

export default function RepsDetail({ label, tooltip }: Props) {
  const [open, setOpen] = useUrlBool('reps');
  const [bioSlug, setBioSlug] = useUrlString('rbio');
  // Map viewer for the CCC District 5 boundary image (img/district5map.jpg).
  // URL-state'd so a link to ?reps=1&d5map=1 opens straight into it.
  const [d5MapOpen, setD5MapOpen] = useUrlBool('d5map');
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

  // Resolve the deep-linked bio (`?rbio=zorn`) once data lands.
  const bioRep = useMemo<Rep | null>(() => {
    if (!data || !bioSlug) return null;
    const all = [...data.city, ...data.county, ...data.stateLegislature, ...data.state, ...data.federal];
    return all.find((r) => repSlug(r) === bioSlug) ?? null;
  }, [data, bioSlug]);

  const openBio = (r: Rep) => setBioSlug(repSlug(r));

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your elected reps — Martinez" size="lg">
        {loading && <p className="muted">Loading…</p>}
        {empty && <p className="muted">{empty}</p>}
        {error && <p className="muted">Couldn’t load: {error}</p>}
        {data && (
          <>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              Click any card for a bio &amp; contact info. Auto-resolved from official .gov sources
              (Congress.gov, OpenStates, gov.ca.gov, county BOS, City of Martinez).
            </p>

            <Section title="City — Martinez Council & Mayor" reps={data.city} onOpen={openBio}
              emptyHint="Couldn't read the city site this cycle — try the official link." />

            <Section title="County — Supervisor, District 5" reps={data.county} onOpen={openBio}
              headerExtra={
                <button
                  type="button"
                  className="rep-h-link"
                  onClick={() => setD5MapOpen(true)}
                  title="District 5 boundary map"
                >
                  map →
                </button>
              }
              emptyHint="Couldn't read the county BOS page this cycle." />

            <Section title="State Legislature — Senate Dist 9 + Assembly Dist 15" reps={data.stateLegislature} onOpen={openBio}
              emptyHint="OpenStates lookup empty (key missing or rate-limited)." />

            <Section title="California — Statewide officers" reps={data.state} onOpen={openBio}
              emptyHint="Ballotpedia state-officials table didn't parse this cycle." />

            <Section title="Federal — CA Senators + House CA-08" reps={data.federal} onOpen={openBio}
              emptyHint="Congress.gov lookup empty (GOV_API_TOKEN missing or rate-limited)." />

            <p className="muted" style={{ fontSize: '.72em', marginTop: 12 }}>
              Cached {new Date(data.scrapedAt).toLocaleString()}. Refreshes every 12h.
            </p>
            {Object.keys(data.diag).length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="muted" style={{ fontSize: '.72em', cursor: 'pointer' }}>
                  Diagnostics ({Object.keys(data.diag).length} source notes)
                </summary>
                <ul className="muted" style={{ fontSize: '.7em', marginTop: 4 }}>
                  {Object.entries(data.diag).map(([k, v]) => (
                    <li key={k}><code>{k}</code>: {v}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Modal>

      {bioRep && <RepBioModal rep={bioRep} onClose={() => setBioSlug(null)} />}

      <Modal open={d5MapOpen} onClose={() => setD5MapOpen(false)} title="CCC Board of Supervisors — District 5" size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/district5map.jpg" alt="Contra Costa County District 5 boundary map" className="d5-map-img" />
        <p style={{ marginTop: 10 }}>
          <a className="event-modal-btn" href="/img/district5map.jpg" target="_blank" rel="noopener">
            Open full-size in new tab →
          </a>
        </p>
      </Modal>
    </>
  );
}
