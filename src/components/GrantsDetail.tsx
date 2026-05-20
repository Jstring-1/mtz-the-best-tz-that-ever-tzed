'use client';

import { useState } from 'react';
import Modal from './Modal';
import GrantDetailModal from './GrantDetailModal';

export interface GrantRow {
  amount: number;
  recipient: string;
  description: string;
  agency: string;
  awardDate: string;
  internalId?: string;
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function GrantsDetail({ label, tooltip, rows }: {
  label: string; tooltip?: string; rows: GrantRow[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<GrantRow | null>(null);

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Federal grants — Contra Costa County (last 90 days)" size="lg">
        {rows.length === 0 ? (
          <p className="muted">No recent grants in cache. Re-run /admin → 12h.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.85em', marginBottom: 10 }}>
              Top {rows.length} awards by amount — click any row for full detail. Source: USAspending.gov.
            </p>
            <ul className="grants-list">
              {rows.map((r, i) => {
                const head = (
                  <>
                    <div className="row1">
                      <span className="amt">{fmtMoney(r.amount)}</span>
                      <span className="recipient">{r.recipient || '(unnamed recipient)'}</span>
                      {r.awardDate && <span className="date">{r.awardDate}</span>}
                    </div>
                    {r.agency && <div className="meta muted">via {r.agency}</div>}
                    {r.description && <div className="desc">{r.description}</div>}
                  </>
                );
                return (
                  <li key={i}>
                    {r.internalId
                      ? (
                        <button
                          type="button"
                          className="grant-trigger"
                          onClick={() => setSelected(r)}
                        >{head}</button>
                      )
                      : head}
                  </li>
                );
              })}
            </ul>
            <p style={{ marginTop: 12 }}>
              <a
                className="event-modal-btn primary"
                href="https://www.usaspending.gov/search"
                target="_blank"
                rel="noopener"
              >Search USAspending.gov →</a>
            </p>
          </>
        )}
      </Modal>

      {selected?.internalId && (
        <GrantDetailModal
          open={!!selected}
          id={selected.internalId}
          fallbackRecipient={selected.recipient}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
