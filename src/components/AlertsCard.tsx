'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { NoaaAlert } from '@/lib/types';

function fmtEpoch(sec?: number, tz = 'America/Los_Angeles'): string {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleString('en-US', {
    timeZone: tz, month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function AlertsCard({ alerts, tz }: { alerts: NoaaAlert[]; tz: string }) {
  const [open, setOpen] = useState<NoaaAlert | null>(null);

  return (
    <section className="card-section alerts-card">
      <h2>Active alerts <span className="count">{alerts.length}</span></h2>
      {alerts.length === 0 ? (
        <p className="empty">No active local alerts.</p>
      ) : (
        <div className="stack-sm">
          {alerts.map((a, i) => (
            <button
              key={i}
              type="button"
              className="card alert local clickable"
              onClick={() => setOpen(a)}
            >
              <h3 style={{ color: 'gold' }}>{a.event ?? 'Alert'}</h3>
              {a.NWSheadline && <div className="meta">{a.NWSheadline}</div>}
              {a.severity && <div className="meta muted">{a.severity}{a.urgency ? ` · ${a.urgency}` : ''}</div>}
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.event ?? 'Alert'} size="lg">
        {open && (
          <>
            {open.NWSheadline && <div className="meta" style={{ marginBottom: 10 }}><b>{open.NWSheadline}</b></div>}
            {open.areaDesc && <div className="meta" style={{ marginBottom: 10, lineHeight: 1.5 }}>{open.areaDesc.replace(/;/g, ', ')}</div>}
            <div className="alert-meta">
              {(['severity', 'urgency', 'certainty', 'status'] as const).map((k) =>
                open[k] ? <span key={k}><span className="k">{k}:</span> <span className="v">{String(open[k])}</span></span> : null
              )}
              {(['effective', 'expires'] as const).map((k) =>
                open[k] ? <span key={k}><span className="k">{k}:</span> <span className="v">{fmtEpoch(Number(open[k]), tz)}</span></span> : null
              )}
            </div>
            {open.description && <p style={{ whiteSpace: 'pre-line', marginTop: 14, lineHeight: 1.5 }}>{open.description}</p>}
          </>
        )}
      </Modal>
    </section>
  );
}
