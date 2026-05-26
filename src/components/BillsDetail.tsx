'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import BillDetail from './BillDetail';
import { useUrlBool, useUrlEnum, useUrlString } from '@/lib/useUrlState';
import type { AffectingBillsPayload, BillRow } from '@/lib/bills';

type Tab = 'federal' | 'state';
const TABS: Tab[] = ['federal', 'state'];

// "Latest action" verbs that indicate a real floor vote — used to tag
// rows the casual viewer should actually care about (most introduced
// bills never make it out of committee).
const VOTED_RE = /\b(passed|agreed\s+to|failed|became\s+(?:public\s+)?law|enacted|signed)\b/i;

// Congress.gov's latestAction strings always carry one or more
// citation parentheticals like "(consideration: CR S2160; text: CR
// S2180-2181)" or "(Roll no. 123)". Strip them out of the main verb so
// the lead line stays readable, and surface them on a second line in
// a lighter shade.
function splitLatestAction(s: string): { main: string; refs: string } {
  const refs: string[] = [];
  const main = s
    .replace(/\([^)]*\)/g, (m) => { refs.push(m); return ''; })
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;]+$/, '');
  return { main, refs: refs.join(' ') };
}

// Parse a federal bill row back into a {congress, type, number} ref
// for the nested BillDetail modal.
function parseFedRef(b: BillRow): { congress: number; type: string; number: string } | null {
  if (b.jurisdiction !== 'federal' || !b.congress || !b.type) return null;
  const m = /^([A-Z]+)\s+(\d+)$/i.exec(b.number);
  if (!m) return null;
  return { congress: b.congress, type: m[1].toUpperCase(), number: m[2] };
}

function billDate(b: BillRow): string {
  return b.latestActionDate || b.introduced || '';
}

function BillRowItem({ b, kind, onOpenFed }: {
  b: BillRow;
  kind?: 'Sp' | 'Co';
  onOpenFed: (ref: { congress: number; type: string; number: string }) => void;
}) {
  const fedRef = parseFedRef(b);
  const trigger = fedRef ? (
    <button type="button" className="bill-trigger" onClick={() => onOpenFed(fedRef)}>
      <span className="num">{b.number}</span>
    </button>
  ) : b.url ? (
    <a className="bill-trigger" href={b.url} target="_blank" rel="noopener">
      <span className="num">{b.number}</span>
    </a>
  ) : (
    <span className="bill-trigger"><span className="num">{b.number}</span></span>
  );
  return (
    <li>
      <div className="bill-row">
        {kind && (
          <span className={`kind kind-${kind.toLowerCase()}`} title={kind === 'Sp' ? 'Primary sponsor' : 'Cosponsor'}>
            {kind}
          </span>
        )}
        {trigger}
        <span className="bill-title-text">{b.title}</span>
      </div>
      {(b.latestAction || b.introduced) && (() => {
        const split = b.latestAction ? splitLatestAction(b.latestAction) : { main: '', refs: '' };
        const voted = !!b.latestAction && VOTED_RE.test(b.latestAction);
        return (
          <div className="bill-meta">
            <div className="bill-meta-line">
              {b.sponsor && <>Sponsor: {b.sponsor} · </>}
              {b.introduced && <>Introduced {b.introduced}</>}
              {split.main && <>{' · Latest: '}{split.main}</>}
              {voted && <span className="voted-tag">voted</span>}
            </div>
            {(split.refs || b.latestActionDate) && (
              <div className="bill-meta-refs">
                {split.refs}
                {split.refs && b.latestActionDate && ' · '}
                {b.latestActionDate && b.latestActionDate}
              </div>
            )}
          </div>
        );
      })()}
    </li>
  );
}

interface Props { label: string; tooltip?: string }

export default function BillsDetail({ label, tooltip }: Props) {
  const [open, setOpen] = useUrlBool('bills');
  const [tab, setTab] = useUrlEnum<Tab>('btab', TABS, 'federal');
  const [data, setData] = useState<AffectingBillsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nested federal-bill detail modal — same URL state key as RepDetail
  // uses so a deep-linked `?bill=...` still works.
  const [billRefStr, setBillRefStr] = useUrlString('bill');
  const billRef = useMemo(() => {
    if (!billRefStr) return null;
    const m = /^(\d+)\.([a-z]+)\.(\d+)$/i.exec(billRefStr);
    if (!m) return null;
    return { congress: Number(m[1]), type: m[2].toUpperCase(), number: m[3] };
  }, [billRefStr]);
  const setBillRef = (r: { congress: number; type: string; number: string } | null) =>
    setBillRefStr(r ? `${r.congress}.${r.type.toLowerCase()}.${r.number}` : null);

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true); setError(null); setEmpty(null);
    fetch('/api/affecting-bills', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (j?.empty) { setEmpty(j.reason ?? 'Cache empty.'); return; }
        setData(j as AffectingBillsPayload);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading]);

  const totalFederal = data?.federalMembers.reduce(
    (n, m) => n + m.sponsored.length + m.cosponsored.length, 0,
  ) ?? 0;
  const totalState = data?.stateBills.length ?? 0;

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bills affecting Contra Costa County"
        size="lg"
      >
        {loading && <p className="muted">Loading…</p>}
        {empty && (
          <p className="muted">
            {empty} (4h cron runs <code>news_aggregated</code> / <code>affecting_bills</code> together.)
          </p>
        )}
        {error && <p className="muted">Couldn’t load: {error}</p>}

        {data && (
          <>
            {/* Header block: legend + prefix key + cached timestamp.
                Sits at the top so first-time readers can decode the
                badges/prefixes before they scroll into the list. */}
            <div className="bills-header">
              <p className="muted bills-legend">
                Only bills with real floor action shown (Passed / Agreed to / Failed /
                Became Law / Reported out of committee).{' '}
                <span className="kind kind-sp">Sp</span> = primary sponsor;{' '}
                <span className="kind kind-co">Co</span> = cosponsor.
              </p>
              <details className="bills-prefix-details">
                <summary className="muted">What do the bill prefixes mean? (HR, S, HRES…)</summary>
                <dl className="bill-prefix-key">
                  <dt>HR</dt>
                  <dd>
                    <strong>House Bill.</strong> The most common form of federal
                    legislation — numbered 1, 2, 3… each new Congress. Becomes
                    law if both chambers pass it and the President signs (or
                    Congress overrides a veto).
                  </dd>
                  <dt>S</dt>
                  <dd>
                    <strong>Senate Bill.</strong> Same legal path as HR; just
                    originated in the Senate first.
                  </dd>
                  <dt>HJRES / SJRES</dt>
                  <dd>
                    <strong>Joint Resolution.</strong> Has the same legal
                    effect as a bill — also becomes law if both chambers
                    pass and the President signs. Used for declarations of
                    war, continuing appropriations, and proposing
                    constitutional amendments (which skip the President and
                    go straight to the states).
                  </dd>
                  <dt>HCONRES / SCONRES</dt>
                  <dd>
                    <strong>Concurrent Resolution.</strong> Requires both
                    chambers but does <em>not</em> become law. Used for the
                    federal budget framework, adjournments, and joint
                    expressions of opinion that don&rsquo;t bind anyone.
                  </dd>
                  <dt>HRES / SRES</dt>
                  <dd>
                    <strong>Simple Resolution.</strong> One chamber only.
                    Internal rules, leadership elections, committee
                    assignments, and &ldquo;sense of the House/Senate&rdquo;
                    statements live here.
                  </dd>
                </dl>
              </details>
              <p className="muted bills-cached">
                Cached {new Date(data.scrapedAt).toLocaleString()}.
              </p>
            </div>

            <div className="news-tabs">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`news-tab${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t === 'federal' ? 'Federal' : 'California'}{' '}
                  <span className="count">{t === 'federal' ? totalFederal : totalState}</span>
                </button>
              ))}
            </div>

            {tab === 'federal' && (
              <div className="bills-federal">
                {(() => {
                  // Flatten all members' sponsored + cosponsored into one
                  // chronological list. Already pre-filtered to bills
                  // with floor action by bills.ts.
                  const flat: Array<BillRow & { kind: 'Sp' | 'Co'; member: string }> = [];
                  for (const m of data.federalMembers) {
                    for (const b of m.sponsored)   flat.push({ ...b, kind: 'Sp', member: m.name });
                    for (const b of m.cosponsored) flat.push({ ...b, kind: 'Co', member: m.name });
                  }
                  // De-dupe by bill # (keep sponsored over cosponsored).
                  const dedup = new Map<string, typeof flat[number]>();
                  for (const b of flat) {
                    const k = b.number.replace(/\s+/g, '');
                    const prev = dedup.get(k);
                    if (!prev || (prev.kind === 'Co' && b.kind === 'Sp')) dedup.set(k, b);
                  }
                  const sorted = [...dedup.values()].sort((a, b) =>
                    billDate(b).localeCompare(billDate(a)),
                  );
                  if (sorted.length === 0) {
                    return <p className="muted">No federal bills with floor action cached.</p>;
                  }
                  return (
                    <ul className="rep-list">
                      {sorted.map((b, i) => (
                        <BillRowItem key={`fed-${i}`} b={b} kind={b.kind} onOpenFed={setBillRef} />
                      ))}
                    </ul>
                  );
                })()}
              </div>
            )}

            {tab === 'state' && (
              <div className="bills-state">
                <p className="muted" style={{ fontSize: '.78em' }}>
                  California {data.stateSession ? `(${data.stateSession.replace(/(\d{4})(\d{4})/, '$1–$2')} session) ` : ''}
                  bills sponsored by Martinez&rsquo;s state legislators (SD-9 Grayson + AD-15 Farías).
                  Newest action first.
                </p>
                {data.stateBills.length === 0 ? (
                  <p className="muted">No matching state bills.</p>
                ) : (
                  <ul className="rep-list">
                    {data.stateBills.map((b, i) => (
                      <BillRowItem key={`s-${i}`} b={b} onOpenFed={() => { /* state bills open externally */ }} />
                    ))}
                  </ul>
                )}
              </div>
            )}

          </>
        )}
      </Modal>

      {billRef && (
        <BillDetail
          open={!!billRef}
          congress={billRef.congress}
          billType={billRef.type}
          billNumber={billRef.number}
          onClose={() => setBillRef(null)}
        />
      )}
    </>
  );
}
