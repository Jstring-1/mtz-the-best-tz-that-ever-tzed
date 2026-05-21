'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';

interface CrimeData {
  agency: string;
  year: number;
  rows: Array<{ key: string; label: string; count: number }>;
  violent: number;
  property: number;
  total: number;
  cdeUrl: string;
}

export default function CrimeDetail({ label, tooltip }: { label: string; tooltip?: string }) {
  const [open, setOpen] = useUrlBool('crime');
  const [data, setData] = useState<CrimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch lazily on first open (whether the open was triggered by a
  // click or by a shared URL on initial load).
  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true); setError(null);
    fetch('/api/crime-detail', { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => setData(j))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading]);
  const show = () => setOpen(true);

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={show} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={data ? `${data.agency} — ${data.year}` : 'Crime stats'}
        size="lg"
      >
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="muted">Couldn’t load: {error}</p>}
        {data && (
          <div className="crime-detail">
            <dl className="bill-kv">
              <dt>Total offenses</dt><dd>{data.total.toLocaleString()}</dd>
              <dt>Violent</dt><dd>{data.violent.toLocaleString()}</dd>
              <dt>Property</dt><dd>{data.property.toLocaleString()}</dd>
            </dl>
            <h3 className="bill-h">Breakdown by offense</h3>
            <ul className="crime-list">
              {data.rows.map((r) => (
                <li key={r.key}>
                  <span className="label">{r.label}</span>
                  <span className="count">{r.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12 }}>
              <a className="event-modal-btn primary" href={data.cdeUrl} target="_blank" rel="noopener">
                Open FBI Crime Data Explorer →
              </a>
            </p>
            <p className="muted" style={{ fontSize: '.75em', marginTop: 10 }}>
              FBI CDE data typically lags by 1–2 years; this is the most recent year with reported data.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
