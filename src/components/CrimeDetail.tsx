'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';

interface AgencyData {
  ori: string;
  name: string;
  year: number;
  rows: Array<{ key: string; label: string; count: number }>;
  violent: number;
  property: number;
  total: number;
  cdeUrl: string;
}
interface CrimeData {
  agencies?: AgencyData[];
  // Legacy single-agency fields (still returned for back-compat).
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
        title="Crime stats — Martinez & Contra Costa Co."
        size="lg"
      >
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="muted">Couldn’t load: {error}</p>}
        {data && (
          <div className="crime-detail">
            {(data.agencies ?? [{
              ori: '',
              name: data.agency,
              year: data.year,
              rows: data.rows,
              violent: data.violent,
              property: data.property,
              total: data.total,
              cdeUrl: data.cdeUrl,
            }]).map((a) => (
              <section key={a.ori || a.name} className="crime-agency">
                <h3 className="bill-h">{a.name}{a.year ? ` — ${a.year}` : ''}</h3>
                <dl className="bill-kv ccrmc-kv">
                  <dt>Total offenses</dt><dd>{a.total.toLocaleString()}</dd>
                  <dt>Violent</dt><dd>{a.violent.toLocaleString()}</dd>
                  <dt>Property</dt><dd>{a.property.toLocaleString()}</dd>
                </dl>
                <ul className="crime-list">
                  {a.rows.map((r) => (
                    <li key={r.key}>
                      <span className="label">{r.label}</span>
                      <span className="count">{r.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: 6 }}>
                  <a className="event-modal-btn" href={a.cdeUrl} target="_blank" rel="noopener">
                    {a.name} on FBI CDE →
                  </a>
                </p>
              </section>
            ))}
            <p className="muted" style={{ fontSize: '.75em', marginTop: 10 }}>
              FBI CDE data typically lags by 1–2 years. CCC Sheriff covers unincorporated Contra Costa County (not all city PDs).
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
