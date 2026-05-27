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

// Body-only view of the Crime stats panel — used inside the consolidated
// Indicators popup. Handles its own lazy fetch when first mounted, so
// the cost is paid only when the user activates the Crime tab. The
// `active` prop gates the fetch so the body is cheap to render outside
// its own tab too (though we currently only mount it when active).
export function CrimeBody({ active = true }: { active?: boolean }) {
  const [data, setData] = useState<CrimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || data || loading) return;
    setLoading(true); setError(null);
    fetch('/api/crime-detail', { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => setData(j))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [active, data, loading]);

  if (loading) return <p className="muted">Loading…</p>;
  if (error)   return <p className="muted">Couldn’t load: {error}</p>;
  if (!data)   return null;

  return (
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
          <div className="popup-ext-links">
            <a href={a.cdeUrl} target="_blank" rel="noopener">{a.name} on FBI CDE →</a>
          </div>
        </section>
      ))}
      <p className="muted" style={{ fontSize: '.75em', marginTop: 10 }}>
        FBI CDE data typically lags by 1–2 years. CCC Sheriff covers unincorporated Contra Costa County (not all city PDs).
      </p>
    </div>
  );
}

// Legacy standalone civic-bar chip — kept for any direct embedders.
// Internally just wraps CrimeBody inside a Modal. The consolidated
// Indicators popup uses CrimeBody directly.
export default function CrimeDetail({ label, tooltip }: { label: string; tooltip?: string }) {
  const [open, setOpen] = useUrlBool('crime');
  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Crime stats — Martinez & Contra Costa Co."
        size="lg"
      >
        <CrimeBody active={open} />
      </Modal>
    </>
  );
}
