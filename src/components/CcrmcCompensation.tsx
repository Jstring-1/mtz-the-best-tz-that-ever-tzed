'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import type { CompPayload, CompRow } from '@/lib/comp';

type SortKey = 'comp-desc' | 'comp-asc' | 'wages-desc' | 'wages-asc' | 'pos-asc' | 'dept-asc';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'comp-desc',  label: 'Total comp — highest first' },
  { key: 'comp-asc',   label: 'Total comp — lowest first' },
  { key: 'wages-desc', label: 'Total wages — highest first' },
  { key: 'wages-asc',  label: 'Total wages — lowest first' },
  { key: 'pos-asc',    label: 'Position A→Z' },
  { key: 'dept-asc',   label: 'Department A→Z' },
];

const PAGE = 100;

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function compareNum(a: number, b: number): number { return a - b; }
function compareStr(a: string, b: string): number { return a.localeCompare(b); }

export default function CcrmcCompensation({ totalsHint }: { totalsHint?: { year?: number; employees?: number; grandTotal?: number } }) {
  const [open, setOpen] = useUrlBool('ccomp');
  const [q, setQ] = useUrlString('ccq');
  const [dept, setDept] = useUrlString('ccd');
  const [sortRaw, setSortRaw] = useUrlString('ccs');
  const [pageRaw, setPageRaw] = useUrlString('ccp');

  const sort: SortKey = ((SORTS.map((s) => s.key) as string[]).includes(sortRaw ?? '') ? sortRaw : 'comp-desc') as SortKey;
  const page = Math.max(1, Number(pageRaw ?? '1') || 1);
  const search = (q ?? '').trim().toLowerCase();
  const deptFilter = (dept ?? '').trim();

  const [data, setData] = useState<CompPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track whether we've already attempted a fetch this open-session.
  // Without this, an `empty`-or-`error` response leaves `data` null
  // and the effect would keep re-firing every time `loading` flips.
  const [tried, setTried] = useState(false);

  // Lazy-fetch on first open (works for shared URLs too).
  useEffect(() => {
    if (!open) { setTried(false); return; }   // re-arm on close
    if (data || loading || tried) return;
    setLoading(true); setTried(true); setError(null); setEmpty(null);
    fetch('/api/ccc-comp', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: CompPayload & { empty?: boolean; reason?: string }) => {
        if (j.empty) setEmpty(j.reason ?? 'No compensation data cached yet.');
        else setData(j);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading, tried]);

  // Filter + sort happens on the full ~10k-row dataset. Memoized so
  // typing is responsive.
  const filtered = useMemo<CompRow[]>(() => {
    if (!data) return [];
    let rows = data.rows;
    if (deptFilter) rows = rows.filter((r) => r.department === deptFilter);
    if (search) {
      rows = rows.filter((r) =>
        r.position.toLowerCase().includes(search) ||
        r.department.toLowerCase().includes(search) ||
        r.otherPositions.toLowerCase().includes(search),
      );
    }
    const sorted = rows.slice();
    switch (sort) {
      case 'comp-desc':  sorted.sort((a, b) => compareNum(b.totalCompensation, a.totalCompensation)); break;
      case 'comp-asc':   sorted.sort((a, b) => compareNum(a.totalCompensation, b.totalCompensation)); break;
      case 'wages-desc': sorted.sort((a, b) => compareNum(b.totalWages, a.totalWages)); break;
      case 'wages-asc':  sorted.sort((a, b) => compareNum(a.totalWages, b.totalWages)); break;
      case 'pos-asc':    sorted.sort((a, b) => compareStr(a.position, b.position)); break;
      case 'dept-asc':   sorted.sort((a, b) => compareStr(a.department, b.department) || compareStr(a.position, b.position)); break;
    }
    return sorted;
  }, [data, search, deptFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * PAGE, pageClamped * PAGE);

  // Reset page when filter/search/sort changes (URL only — don't write
  // when it's already absent).
  const resetPage = () => { if ((pageRaw ?? '1') !== '1') setPageRaw(null); };

  const subLabel = totalsHint
    ? `${totalsHint.employees?.toLocaleString() ?? '—'} employees · ${fmtMoney(totalsHint.grandTotal ?? 0)} total comp${totalsHint.year ? ` · FY ${totalsHint.year}` : ''}`
    : 'CCC employee comp from State Controller — click to browse';

  return (
    <>
      <button
        type="button"
        className="ccrmc-section-btn"
        onClick={() => setOpen(true)}
      >
        <div className="head">Employee compensation (CCC, all)</div>
        <div className="sub">{subLabel}</div>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={data ? `CCC employee compensation — FY ${data.year}` : 'CCC employee compensation'}
        size="xl"
      >
        {loading && !empty && !error && !data && (
          <p className="muted">Loading {totalsHint?.employees ? `${totalsHint.employees.toLocaleString()} rows` : '~10k rows'}…</p>
        )}
        {empty && (
          <div>
            <p className="muted">{empty}</p>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 8 }}>
              The cron pulls the full CSV from <a href="https://publicpay.ca.gov" target="_blank" rel="noopener">publicpay.ca.gov</a>{' '}
              (or its mirror at <code>bythenumbers.sco.ca.gov</code>). First fetch typically takes 30–60s. If subsequent runs still
              come up empty, the source URL pattern may have changed — open the Railway logs and look for <code>[comp] publicpay-YYYY</code> warnings.
            </p>
          </div>
        )}
        {error && <p className="muted">Couldn’t load: {error}</p>}

        {data && (
          <>
            <p className="muted" style={{ fontSize: '.85em', marginBottom: 10 }}>
              Source: <a href={data.sourceUrl} target="_blank" rel="noopener">publicpay.ca.gov</a> ·{' '}
              {data.totals.employees.toLocaleString()} employees ·{' '}
              total wages {fmtMoney(data.totals.totalWages)} +{' '}
              retirement&amp;health {fmtMoney(data.totals.totalRetirementAndHealth)} ={' '}
              <b>{fmtMoney(data.totals.grandTotal)}</b> ·{' '}
              cached {new Date(data.scrapedAt).toLocaleDateString()}
            </p>
            <p className="muted" style={{ fontSize: '.75em', marginBottom: 12 }}>
              Per State Controller anonymization, rows show position + department but not the employee’s name.
            </p>

            <div className="comp-toolbar">
              <label className="comp-filter">
                Search:{' '}
                <input
                  type="search"
                  value={q ?? ''}
                  onChange={(e) => { setQ(e.target.value || null); resetPage(); }}
                  placeholder="position or dept…"
                />
              </label>
              <label className="comp-filter">
                Dept:{' '}
                <select value={dept ?? ''} onChange={(e) => { setDept(e.target.value || null); resetPage(); }}>
                  <option value="">All ({data.rows.length.toLocaleString()})</option>
                  {data.departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="comp-filter">
                Sort:{' '}
                <select value={sort} onChange={(e) => { setSortRaw(e.target.value === 'comp-desc' ? null : e.target.value); resetPage(); }}>
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>

            <div className="comp-meta muted" style={{ marginBottom: 6 }}>
              {filtered.length.toLocaleString()} row{filtered.length === 1 ? '' : 's'} match
              {totalPages > 1 ? ` · page ${pageClamped} of ${totalPages}` : ''}
            </div>

            <div className="comp-table-wrap">
              <table className="comp-table">
                <thead>
                  <tr>
                    <th className="dept">Department</th>
                    <th className="pos">Position</th>
                    <th className="num">Regular</th>
                    <th className="num">OT</th>
                    <th className="num">Total wages</th>
                    <th className="num">Pension</th>
                    <th className="num">Health</th>
                    <th className="num total">Total comp</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={`${r.employeeId}-${i}`}>
                      <td className="dept">{r.department}</td>
                      <td className="pos">{r.position}{r.otherPositions ? <span className="muted"> · {r.otherPositions}</span> : null}</td>
                      <td className="num">{fmtMoney(r.regularPay)}</td>
                      <td className="num">{fmtMoney(r.overtime)}</td>
                      <td className="num">{fmtMoney(r.totalWages)}</td>
                      <td className="num">{fmtMoney(r.pension)}</td>
                      <td className="num">{fmtMoney(r.health)}</td>
                      <td className="num total">{fmtMoney(r.totalCompensation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="comp-pager">
                <button
                  type="button"
                  disabled={pageClamped <= 1}
                  onClick={() => setPageRaw(pageClamped - 1 === 1 ? null : String(pageClamped - 1))}
                >← Prev</button>
                <span className="muted">page {pageClamped} of {totalPages}</span>
                <button
                  type="button"
                  disabled={pageClamped >= totalPages}
                  onClick={() => setPageRaw(String(pageClamped + 1))}
                >Next →</button>
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
