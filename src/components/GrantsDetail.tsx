'use client';

import { useState, useMemo } from 'react';
import Modal from './Modal';
import GrantDetailModal from './GrantDetailModal';

export interface GrantRow {
  amount: number;
  recipient: string;
  description: string;
  agency: string;
  actionDate: string;
  periodStart: string;
  internalId?: string;
}

type SortKey = 'action-desc' | 'action-asc' | 'amount-desc' | 'amount-asc' | 'period-desc' | 'period-asc';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'action-desc', label: 'Most recent action' },
  { key: 'action-asc',  label: 'Oldest action' },
  { key: 'amount-desc', label: 'Largest amount' },
  { key: 'amount-asc',  label: 'Smallest amount' },
  { key: 'period-desc', label: 'Newest period start' },
  { key: 'period-asc',  label: 'Oldest period start' },
];

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function sortRows(rows: GrantRow[], key: SortKey): GrantRow[] {
  const out = rows.slice();
  switch (key) {
    case 'action-desc': return out.sort((a, b) => (b.actionDate || '').localeCompare(a.actionDate || ''));
    case 'action-asc':  return out.sort((a, b) => (a.actionDate || '').localeCompare(b.actionDate || ''));
    case 'amount-desc': return out.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':  return out.sort((a, b) => a.amount - b.amount);
    case 'period-desc': return out.sort((a, b) => (b.periodStart || '').localeCompare(a.periodStart || ''));
    case 'period-asc':  return out.sort((a, b) => (a.periodStart || '').localeCompare(b.periodStart || ''));
  }
}

export default function GrantsDetail({ label, tooltip, rows }: {
  label: string; tooltip?: string; rows: GrantRow[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<GrantRow | null>(null);
  const [sort, setSort] = useState<SortKey>('action-desc');

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Federal grants — Contra Costa County" size="lg">
        {rows.length === 0 ? (
          <p className="muted">No recent grants in cache. Re-run /admin → 12h.</p>
        ) : (
          <>
            <div className="grants-toolbar">
              <span className="muted">
                Top {rows.length} awards · USAspending.gov · action date in the last 90 days
              </span>
              <label className="grants-sort">
                Sort:{' '}
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <ul className="grants-list">
              {sorted.map((r, i) => {
                const samePeriod = r.periodStart && r.periodStart === r.actionDate;
                const head = (
                  <>
                    <div className="row1">
                      <span className="amt">{fmtMoney(r.amount)}</span>
                      <span className="recipient">{r.recipient || '(unnamed recipient)'}</span>
                      <span className="date">
                        {r.actionDate || '—'}
                        {!samePeriod && r.periodStart && (
                          <span className="muted"> · period from {r.periodStart}</span>
                        )}
                      </span>
                    </div>
                    {r.agency && <div className="meta muted">via {r.agency}</div>}
                    {r.description && <div className="desc">{r.description}</div>}
                  </>
                );
                return (
                  <li key={i}>
                    {r.internalId
                      ? <button type="button" className="grant-trigger" onClick={() => setSelected(r)}>{head}</button>
                      : head}
                  </li>
                );
              })}
            </ul>
            <p className="muted" style={{ fontSize: '.75em', marginTop: 8 }}>
              “Action date” is when the award/modification was signed. “Period from” is when the
              funded work began — older dates here are typical for ongoing multi-year grants.
            </p>
            <p style={{ marginTop: 8 }}>
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
