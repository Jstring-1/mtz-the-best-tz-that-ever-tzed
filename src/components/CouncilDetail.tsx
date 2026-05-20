'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';

interface CouncilVote {
  meetingDate: string;
  meetingType: string;
  itemTitle: string;
  motionText?: string;
  ayes: string[];
  noes: string[];
  absent: string[];
  abstain: string[];
  result: string;
  minutesUrl: string;
}
interface Payload {
  scrapedAt: string;
  meetings: number;
  votes: CouncilVote[];
  diag?: { source?: string; minutesLinks?: number; pdfBytes?: number; voteAnchors?: number; httpFailures?: string[] };
}

function groupByMeeting(votes: CouncilVote[]): Array<{ date: string; url: string; votes: CouncilVote[] }> {
  const m = new Map<string, { date: string; url: string; votes: CouncilVote[] }>();
  for (const v of votes) {
    const k = `${v.meetingDate}|${v.minutesUrl}`;
    if (!m.has(k)) m.set(k, { date: v.meetingDate, url: v.minutesUrl, votes: [] });
    m.get(k)!.votes.push(v);
  }
  return [...m.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export default function CouncilDetail({ label, tooltip }: { label: string; tooltip?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true); setError(null);
    fetch('/api/council-votes', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: Payload) => setData(j))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading]);

  const meetings = data?.votes ? groupByMeeting(data.votes) : [];

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Martinez City Council — recent votes" size="lg">
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="muted">Couldn’t load: {error}</p>}
        {data && meetings.length === 0 && (
          <>
            <p className="muted">
              No parseable votes from the most recent {data.meetings} minutes PDF
              {data.meetings === 1 ? '' : 's'} yet.
              {data.diag?.voteAnchors === 0 && ' The parser found no AYES/NOES anchors — minutes may use a different format than expected.'}
            </p>
            {data.diag && (
              <details className="rep-h" style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer' }} className="muted">Scraper diagnostics</summary>
                <pre style={{ fontSize: '.75em', whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
                  {JSON.stringify(data.diag, null, 2)}
                </pre>
              </details>
            )}
          </>
        )}
        {meetings.map((mt) => (
          <div key={mt.url} className="council-meeting">
            <h3 className="rep-h">
              {mt.date || 'Date unknown'}{' '}
              <a className="muted" href={mt.url} target="_blank" rel="noopener" style={{ fontSize: '.85em' }}>
                minutes PDF →
              </a>
            </h3>
            <ul className="council-list">
              {mt.votes.map((v, i) => (
                <li key={i}>
                  <div className="title">{v.itemTitle || '(item)'}</div>
                  {v.motionText && <div className="meta muted">{v.motionText}</div>}
                  <div className="tally">
                    {v.ayes.length > 0 && <span className="t-ayes"><b>Aye:</b> {v.ayes.join(', ')}</span>}
                    {v.noes.length > 0 && <span className="t-noes"><b>No:</b> {v.noes.join(', ')}</span>}
                    {v.abstain.length > 0 && <span className="t-abst"><b>Abstain:</b> {v.abstain.join(', ')}</span>}
                    {v.absent.length > 0 && <span className="t-absent"><b>Absent:</b> {v.absent.join(', ')}</span>}
                    <span className={`t-result t-result-${v.result.toLowerCase()}`}>{v.result}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {data?.scrapedAt && (
          <p className="muted" style={{ fontSize: '.72em', marginTop: 12 }}>
            Last scraped {new Date(data.scrapedAt).toLocaleString()}
          </p>
        )}
      </Modal>
    </>
  );
}
