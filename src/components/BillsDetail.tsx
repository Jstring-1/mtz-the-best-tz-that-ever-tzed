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

function BillRowItem({ b, onOpenFed }: {
  b: BillRow;
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
        {trigger}
        <span className="bill-title-text">{b.title}</span>
      </div>
      {(b.latestAction || b.introduced) && (
        <div className="meta muted">
          {b.sponsor && <>Sponsor: {b.sponsor} · </>}
          {b.introduced && <>Introduced {b.introduced}</>}
          {b.latestAction && (
            <>
              {' · Latest: '}{b.latestAction}
              {b.latestActionDate && ` (${b.latestActionDate})`}
              {VOTED_RE.test(b.latestAction) && <span className="voted-tag">voted</span>}
            </>
          )}
        </div>
      )}
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
                        <li key={`fed-${i}`} style={{ position: 'relative' }}>
                          <span className={`kind kind-${b.kind.toLowerCase()}`} style={{
                            position: 'absolute', left: -22, top: 4, fontSize: '.7em', color: 'var(--text-muted)',
                          }}>{b.kind}</span>
                          <BillRowItem b={b} onOpenFed={setBillRef} />
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                <p className="muted" style={{ fontSize: '.75em', marginTop: 12 }}>
                  Only bills with real floor action shown (Passed / Agreed to / Failed /
                  Became Law / Reported out of committee).{' '}
                  <span className="kind kind-sp">Sp</span> = primary sponsor;{' '}
                  <span className="kind kind-co">Co</span> = cosponsor.
                </p>
                <details style={{ marginTop: 6 }}>
                  <summary className="muted" style={{ fontSize: '.75em', cursor: 'pointer' }}>
                    What do the bill prefixes mean? (HR, S, HRES…)
                  </summary>
                  <dl className="bill-prefix-key">
                    <dt>HR</dt><dd>House Bill — becomes law if Senate concurs and the President signs.</dd>
                    <dt>S</dt><dd>Senate Bill — same path, originated in the Senate.</dd>
                    <dt>HJRES / SJRES</dt><dd>Joint Resolution — used interchangeably with bills; also the form for constitutional amendments.</dd>
                    <dt>HCONRES / SCONRES</dt><dd>Concurrent Resolution — passes both chambers but isn&rsquo;t law (Congress&rsquo;s internal/expressive measures).</dd>
                    <dt>HRES / SRES</dt><dd>Simple Resolution — single chamber only; rules, internal procedure, or expressing the sense of that chamber.</dd>
                  </dl>
                </details>
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

            <p className="muted" style={{ fontSize: '.72em', marginTop: 12 }}>
              Cached {new Date(data.scrapedAt).toLocaleString()}.
            </p>
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
