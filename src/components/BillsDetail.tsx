'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import BillDetail from './BillDetail';
import { useUrlBool, useUrlEnum, useUrlString } from '@/lib/useUrlState';
import type { AffectingBillsPayload, BillRow, MemberBills } from '@/lib/bills';

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

function MemberSection({ m, onOpenFed }: {
  m: MemberBills;
  onOpenFed: (ref: { congress: number; type: string; number: string }) => void;
}) {
  // Merge sponsored + cosponsored with a tag so we can show them in one
  // list sorted by most-recent action.
  const merged = useMemo(() => {
    const arr: Array<BillRow & { kind: 'Sp' | 'Co' }> = [
      ...m.sponsored.map((b) => ({ ...b, kind: 'Sp' as const })),
      ...m.cosponsored.map((b) => ({ ...b, kind: 'Co' as const })),
    ];
    // De-dupe: if the same bill appears in both buckets, keep sponsored.
    const dedup = new Map<string, typeof arr[number]>();
    for (const b of arr) {
      const k = b.number.replace(/\s+/g, '');
      if (!dedup.has(k) || (dedup.get(k)!.kind === 'Co' && b.kind === 'Sp')) dedup.set(k, b);
    }
    return [...dedup.values()].sort((a, b) => billDate(b).localeCompare(billDate(a)));
  }, [m]);

  return (
    <div className="bills-member">
      <h3 className="rep-h">
        <a href={m.url} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>
          {m.name}
        </a>{' '}
        <span className="muted" style={{ fontWeight: 400 }}>· {m.role}{m.party ? ` · ${m.party}` : ''}</span>
        <span className="muted" style={{ fontWeight: 400, fontSize: '.8em', marginLeft: 8 }}>
          ({merged.length})
        </span>
      </h3>
      {merged.length === 0 ? (
        <p className="muted">No recent bills.</p>
      ) : (
        <ul className="rep-list">
          {merged.map((b, i) => (
            <li key={`m-${m.bioguideId}-${i}`} style={{ position: 'relative' }}>
              <span className={`kind kind-${b.kind.toLowerCase()}`} style={{
                position: 'absolute', left: -22, top: 4, fontSize: '.7em', color: 'var(--text-muted)',
              }}>{b.kind}</span>
              <BillRowItem b={b} onOpenFed={onOpenFed} />
            </li>
          ))}
        </ul>
      )}
    </div>
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
                {data.federalMembers.length === 0 ? (
                  <p className="muted">No federal data cached.</p>
                ) : data.federalMembers.map((m) => (
                  <MemberSection key={m.bioguideId} m={m} onOpenFed={setBillRef} />
                ))}
                <p className="muted" style={{ fontSize: '.75em', marginTop: 8 }}>
                  <span className="kind kind-sp">Sp</span> = primary sponsor.{' '}
                  <span className="kind kind-co">Co</span> = cosponsor. Most bills never reach a floor
                  vote — look for the &ldquo;voted&rdquo; tag.
                </p>
              </div>
            )}

            {tab === 'state' && (
              <div className="bills-state">
                <p className="muted" style={{ fontSize: '.78em' }}>
                  California {data.stateSession ? `(${data.stateSession.replace(/(\d{4})(\d{4})/, '$1–$2')} session) ` : ''}
                  bills with &ldquo;Contra Costa&rdquo; in the text. Source: OpenStates → leginfo.legislature.ca.gov.
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
