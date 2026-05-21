'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import GrantDetailModal from './GrantDetailModal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';

export interface GrantRow {
  amount: number;
  recipient: string;
  description: string;
  agency: string;
  actionDate: string;
  periodStart: string;
  internalId?: string;
}

export interface FundingSourceMeta {
  key: string;
  label: string;
  description: string;
  kind?: 'usaspending' | 'subaward' | 'fac' | 'link' | 'pdf';
  linkUrl?: string;
  linkLabel?: string;
  pdfUrl?: string;
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

export default function GrantsDetail({
  label, tooltip, rows, sources = [], data = {},
  keyPrefix = '', triggerClassName = 'civic-row-btn', modalTitle,
}: {
  label: string; tooltip?: string;
  rows: GrantRow[];                                   // legacy default rows (kept as fallback)
  sources?: FundingSourceMeta[];
  data?: Record<string, GrantRow[]>;
  /** Prepended to every URL key so multiple GrantsDetail instances on
   *  the same page (e.g. civic strip + CCRMC page) stay independent. */
  keyPrefix?: string;
  triggerClassName?: string;
  modalTitle?: string;
}) {
  const k = (name: string) => `${keyPrefix}${name}`;
  const [open, setOpen] = useUrlBool(k('funding'));
  const [grantId, setGrantId] = useUrlString(k('grant'));
  const [pdfOpen, setPdfOpen] = useUrlBool(k('fpdf'));
  const defaultSort: SortKey = 'action-desc';
  const [sortRaw, setSortRaw] = useUrlString(k('fsort'));
  const sort = (SORTS.map((s) => s.key) as string[]).includes(sortRaw ?? '')
    ? (sortRaw as SortKey)
    : defaultSort;
  const setSort = (s: SortKey) => setSortRaw(s === defaultSort ? null : s);
  const defaultSourceKey = sources[0]?.key ?? 'grants';
  const [sourceKeyRaw, setSourceKeyRaw] = useUrlString(k('fsrc'));
  const sourceKey = sources.some((s) => s.key === sourceKeyRaw) ? (sourceKeyRaw as string) : defaultSourceKey;
  const setSourceKey = (k: string) => setSourceKeyRaw(k === defaultSourceKey ? null : k);

  // Lookup the active row by id (so a shared URL can deep-link a
  // specific grant). Falls back to null when the id is in the URL but
  // not in cache — the GrantDetailModal will still fetch by id.
  const allRows = useMemo(() => Object.values(data).flat().concat(rows), [data, rows]);
  const selected = useMemo<GrantRow | null>(() => {
    if (!grantId) return null;
    return allRows.find((r) => r.internalId === grantId) ?? { amount: 0, recipient: '', description: '', agency: '', actionDate: '', periodStart: '', internalId: grantId };
  }, [grantId, allRows]);
  const setSelected = (r: GrantRow | null) => setGrantId(r?.internalId ?? null);

  // If the multi-source registry is present, use it; otherwise fall back
  // to the legacy single-list rows prop.
  const hasRegistry = sources.length > 0;
  const activeRows = hasRegistry ? (data[sourceKey] ?? []) : rows;
  const activeMeta = hasRegistry ? sources.find((s) => s.key === sourceKey) : null;

  const sorted = useMemo(() => sortRows(activeRows, sort), [activeRows, sort]);

  // Show empty-cache message only when nothing at all is available
  // anywhere — otherwise the user can pick a different source.
  const haveAnything = hasRegistry
    ? Object.values(data).some((r) => r.length > 0)
    : rows.length > 0;

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={modalTitle ?? 'Federal funding — Contra Costa / Martinez'} size="lg">
        {!haveAnything ? (
          <p className="muted">No funding rows in cache. Re-run /admin → 12h.</p>
        ) : (
          <>
            <div className="grants-toolbar">
              {hasRegistry && (
                <label className="grants-source">
                  Source:{' '}
                  <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)}>
                    {sources.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}{(data[s.key]?.length ?? 0) > 0 ? ` (${data[s.key]?.length})` : ' (0)'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="grants-sort">
                Sort:{' '}
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <div className="grants-meta muted">
              {activeMeta
                ? `${activeMeta.description}${activeMeta.kind !== 'link' ? ` · ${activeRows.length} row${activeRows.length === 1 ? '' : 's'}` : ''}`
                : `Top ${activeRows.length} awards · last 90 days`}
            </div>
            {activeMeta?.kind === 'link' && activeMeta.linkUrl && (
              <p style={{ marginTop: 12 }}>
                <a
                  className="event-modal-btn primary"
                  href={activeMeta.linkUrl}
                  target="_blank"
                  rel="noopener"
                >{activeMeta.linkLabel ?? 'Open dataset →'}</a>
              </p>
            )}
            {activeMeta?.kind === 'pdf' && activeMeta.pdfUrl && (
              <p style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="event-modal-btn primary"
                  onClick={() => setPdfOpen(true)}
                >Read the PDF in-page →</button>
                {activeMeta.linkUrl && (
                  <a
                    className="event-modal-btn"
                    href={activeMeta.linkUrl}
                    target="_blank"
                    rel="noopener"
                  >{activeMeta.linkLabel ?? 'Open original →'}</a>
                )}
              </p>
            )}
            {activeMeta?.kind !== 'link' && activeMeta?.kind !== 'pdf' && activeRows.length === 0 && (
              <p className="muted" style={{ marginTop: 10 }}>
                No rows for this source. Try another source above.
              </p>
            )}
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

      {activeMeta?.kind === 'pdf' && activeMeta.pdfUrl && (
        <Modal
          open={pdfOpen}
          onClose={() => setPdfOpen(false)}
          title={activeMeta.label}
          size="xl"
        >
          <div className="council-pdf-wrap">
            <iframe
              key={activeMeta.pdfUrl}
              title={activeMeta.label}
              src={`/api/council-pdf?u=${encodeURIComponent(activeMeta.pdfUrl)}#pagemode=none`}
              className="council-pdf-frame"
              loading="lazy"
            />
            <p style={{ marginTop: 10 }}>
              <a
                className="event-modal-btn primary"
                href={activeMeta.pdfUrl}
                target="_blank"
                rel="noopener"
              >Open PDF in new tab →</a>
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
