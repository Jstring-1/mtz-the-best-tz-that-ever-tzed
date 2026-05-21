'use client';

import { useState } from 'react';
import Modal from './Modal';
import BillDetail from './BillDetail';

interface Bill {
  number: string;
  title: string;
  introduced: string;
  latestAction: string;
  latestActionDate: string;
  url: string;
}
interface Vote {
  congress: number; session: number; voteNumber: number;
  date: string; question: string; result: string; position: string;
  billCongress?: number; billType?: string; billNumber?: string; billTitle?: string;
}
interface Rep {
  name: string; party: string; state: string; district: number | string;
  url: string;
  sponsored: Bill[];
  cosponsored: Bill[];
  votes: Vote[];
  votesScrapedAt: string | null;
}

// Pull the {congress, type, number} out of a Bill row (its `number`
// field looks like "HR 1234"). Returns null if it doesn't parse — then
// the row falls back to a plain link to Congress.gov.
function parseBillRef(b: Bill, urlFallback: string): { congress: number; type: string; number: string } | null {
  const m = /^(HR|S|HJRES|SJRES|HRES|SRES)\s+(\d+)$/i.exec(b.number.trim());
  if (!m) return null;
  // Bill's congress isn't on the row — pull it from the human URL.
  const cgMatch = /\/bill\/(\d+)(?:st|nd|rd|th)-congress\//i.exec(urlFallback);
  if (!cgMatch) return null;
  return { congress: Number(cgMatch[1]), type: m[1], number: m[2] };
}

function BillButton({ b, onOpen, kind }: {
  b: Bill;
  onOpen: (ref: { congress: number; type: string; number: string }) => void;
  kind?: 'Sp' | 'Co';
}) {
  const ref = parseBillRef(b, b.url);
  const trigger = !ref ? (
    <a className="bill-trigger" href={b.url} target="_blank" rel="noopener">
      {kind && <span className={`kind kind-${kind.toLowerCase()}`}>{kind}</span>}
      <span className="num">{b.number}</span>
    </a>
  ) : (
    <button type="button" className="bill-trigger" onClick={() => onOpen(ref)}>
      {kind && <span className={`kind kind-${kind.toLowerCase()}`}>{kind}</span>}
      <span className="num">{b.number}</span>
    </button>
  );
  return (
    <div className="bill-row">
      {trigger}
      <span className="bill-title-text">{b.title}</span>
    </div>
  );
}

// Date used for sorting. Prefer the most recent action; fall back to
// introduction date.
function billOrderDate(b: Bill): string {
  return (b.latestActionDate || b.introduced || '');
}
// Crude indicator of vote activity — Congress.gov "Latest action"
// strings include phrases like "Passed/agreed to", "Failed", "Became
// Public Law", etc.
const VOTED_RE = /\b(passed|agreed\s+to|failed|became\s+(?:public\s+)?law|enacted|signed)\b/i;

export default function RepDetail({ label, tooltip }: { label: string; tooltip?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Rep | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billRef, setBillRef] = useState<{ congress: number; type: string; number: string } | null>(null);

  async function show() {
    setOpen(true);
    if (data || loading) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/rep-detail', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={show} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={data ? `${data.name} (${data.party || '—'} · ${data.state} ${data.district ? `CA-${data.district}` : ''})` : 'Representative'}
        size="lg"
      >
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="muted">Couldn’t load: {error}</p>}
        {data && (
          <div className="rep-detail">
            <p>
              <a className="event-modal-btn primary" href={data.url} target="_blank" rel="noopener">
                Full record on Congress.gov →
              </a>
            </p>

            <h3 className="rep-h">Recent votes ({data.votes.length})</h3>
            {data.votes.length === 0 ? (
              <p className="muted">
                No cached votes yet. Run the 4h bucket on /admin, or this rep
                may not have voted recently.
              </p>
            ) : (
              <ul className="rep-votes">
                {data.votes.map((v, i) => {
                  const billRefV = v.billType && v.billNumber && v.billCongress
                    ? { congress: v.billCongress, type: v.billType, number: v.billNumber }
                    : null;
                  return (
                    <li key={`v-${i}`}>
                      <div className="row1">
                        <span className={`pos pos-${v.position.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                          {v.position || '—'}
                        </span>
                        <span className="date">{v.date}</span>
                        <span className="result">{v.result}</span>
                      </div>
                      <div className="question">{v.question}</div>
                      {billRefV && (
                        <div className="bill-row">
                          <button type="button" className="bill-trigger small" onClick={() => setBillRef(billRefV)}>
                            <span className="num">{v.billType?.toUpperCase()} {v.billNumber}</span>
                          </button>
                          {v.billTitle && <span className="bill-title-text">{v.billTitle}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {(() => {
              const merged: Array<Bill & { kind: 'Sp' | 'Co' }> = [
                ...data.sponsored.map((b) => ({ ...b, kind: 'Sp' as const })),
                ...data.cosponsored.map((b) => ({ ...b, kind: 'Co' as const })),
              ];
              // De-dupe (rare: same bill in both lists) by number+kind
              // shouldn't collapse, but if number repeats prefer Sp.
              const dedup = new Map<string, typeof merged[number]>();
              for (const b of merged) {
                const k = b.number.replace(/\s+/g, '');
                if (!dedup.has(k) || (dedup.get(k)!.kind === 'Co' && b.kind === 'Sp')) dedup.set(k, b);
              }
              const sorted = [...dedup.values()].sort((a, b) =>
                billOrderDate(b).localeCompare(billOrderDate(a)),
              );
              return (
                <>
                  <h3 className="rep-h">Legislation — sponsored &amp; cosponsored ({sorted.length})</h3>
                  {sorted.length === 0 ? <p className="muted">None.</p> : (
                    <ul className="rep-list">
                      {sorted.map((b, i) => (
                        <li key={`b-${i}`}>
                          <BillButton b={b} onOpen={setBillRef} kind={b.kind} />
                          {(b.latestAction || b.introduced) && (
                            <div className="meta muted">
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
                      ))}
                    </ul>
                  )}
                  <p className="muted" style={{ fontSize: '.75em', marginTop: 6 }}>
                    Most introduced bills never reach a floor vote. Look for the
                    “voted” tag (or “Passed/Agreed to/Failed” in the latest
                    action) for ones that did.
                  </p>
                </>
              );
            })()}

            {data.votesScrapedAt && (
              <p className="muted" style={{ fontSize: '.72em', marginTop: 12 }}>
                Votes cached {new Date(data.votesScrapedAt).toLocaleString()}
              </p>
            )}
          </div>
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
