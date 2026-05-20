'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { NoaaAlert } from '@/lib/types';
import { relativeFromUnixSeconds } from '@/lib/time';

export interface QuakeLite {
  id?: string;
  magnitude: number | null;
  place: string;
  occurred_at: number;
  url: string;
}

function fmtEpoch(sec?: number, tz = 'America/Los_Angeles'): string {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleString('en-US', {
    timeZone: tz, month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function AlertsCard({
  alerts, quakes = [], tz,
}: { alerts: NoaaAlert[]; quakes?: QuakeLite[]; tz: string }) {
  const [open, setOpen] = useState<NoaaAlert | null>(null);
  const [openQuake, setOpenQuake] = useState<QuakeLite | null>(null);
  const total = alerts.length + quakes.length;

  // Hide the card entirely when there's nothing to show.
  if (total === 0) return null;

  return (
    <section className="card-section alerts-card">
      <h2>Active alerts <span className="count">{total}</span></h2>
      {total === 0 ? (
        <p className="empty">No active local alerts.</p>
      ) : (
        <div className="stack-sm">
          {alerts.map((a, i) => (
            <button
              key={`a-${i}`}
              type="button"
              className="card alert local clickable"
              onClick={() => setOpen(a)}
            >
              <h3 style={{ color: 'gold' }}>{a.event ?? 'Alert'}</h3>
              {a.NWSheadline && <div className="meta alert-headline">{a.NWSheadline}</div>}
            </button>
          ))}
          {quakes.map((q, i) => (
            <button
              key={`q-${q.id ?? i}`}
              type="button"
              className="card alert local clickable"
              onClick={() => setOpenQuake(q)}
            >
              <h3 style={{ color: 'gold' }}>
                M{q.magnitude != null ? q.magnitude.toFixed(1) : '—'} Earthquake
              </h3>
              <div className="meta alert-headline">
                {q.place} · {relativeFromUnixSeconds(q.occurred_at)}
              </div>
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

      <Modal
        open={!!openQuake}
        onClose={() => setOpenQuake(null)}
        title={openQuake ? `M${openQuake.magnitude != null ? openQuake.magnitude.toFixed(1) : '—'} earthquake` : 'Earthquake'}
        size="lg"
      >
        {openQuake && (
          <>
            <div className="meta" style={{ marginBottom: 10 }}><b>{openQuake.place}</b></div>
            <div className="meta" style={{ marginBottom: 10 }}>
              {fmtEpoch(openQuake.occurred_at, tz)} · {relativeFromUnixSeconds(openQuake.occurred_at)}
            </div>
            {openQuake.url && (
              <a
                className="event-modal-btn primary"
                href={openQuake.url}
                target="_blank"
                rel="noopener"
                style={{ marginTop: 14, display: 'inline-block' }}
              >USGS event page →</a>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
