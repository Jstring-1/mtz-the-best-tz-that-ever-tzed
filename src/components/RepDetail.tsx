'use client';

import { useState } from 'react';
import Modal from './Modal';

interface Bill {
  number: string;
  title: string;
  introduced: string;
  latestAction: string;
  latestActionDate: string;
  url: string;
}
interface Rep {
  name: string;
  party: string;
  state: string;
  district: number | string;
  url: string;
  sponsored: Bill[];
  cosponsored: Bill[];
}

export default function RepDetail({ label, tooltip }: { label: string; tooltip?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Rep | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    setError(null);
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
      <button
        type="button"
        className="civic-row-btn"
        onClick={show}
        title={tooltip}
      >
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
              <a
                className="event-modal-btn primary"
                href={data.url}
                target="_blank"
                rel="noopener"
              >Full record on Congress.gov →</a>
            </p>

            <h3 className="rep-h">Sponsored legislation ({data.sponsored.length})</h3>
            {data.sponsored.length === 0 ? <p className="muted">None.</p> : (
              <ul className="rep-list">
                {data.sponsored.map((b, i) => (
                  <li key={`s-${i}`}>
                    <a href={b.url} target="_blank" rel="noopener">
                      <span className="num">{b.number}</span>
                      <span className="title">{b.title}</span>
                    </a>
                    {(b.latestAction || b.introduced) && (
                      <div className="meta muted">
                        {b.introduced && <>Introduced {b.introduced}</>}
                        {b.latestAction && <> · Latest: {b.latestAction}{b.latestActionDate && ` (${b.latestActionDate})`}</>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="rep-h">Cosponsored legislation ({data.cosponsored.length})</h3>
            {data.cosponsored.length === 0 ? <p className="muted">None.</p> : (
              <ul className="rep-list">
                {data.cosponsored.map((b, i) => (
                  <li key={`c-${i}`}>
                    <a href={b.url} target="_blank" rel="noopener">
                      <span className="num">{b.number}</span>
                      <span className="title">{b.title}</span>
                    </a>
                    {(b.latestAction || b.introduced) && (
                      <div className="meta muted">
                        {b.introduced && <>Introduced {b.introduced}</>}
                        {b.latestAction && <> · Latest: {b.latestAction}{b.latestActionDate && ` (${b.latestActionDate})`}</>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted" style={{ fontSize: '.75em', marginTop: 12 }}>
              Per-vote roll-call records are not exposed per-member by the
              Congress.gov v3 API; click the link above for the official
              voting record.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
