'use client';

import { useMemo, useState } from 'react';
import { relativeFromIso } from '@/lib/time';

interface Bucket { id: string; desc: string }

type SortKey = 'id' | 'updated';
type SortDir = 'asc' | 'desc';

// Module-level helpers — keeps the React-hooks purity lint happy
// (Date.now / new Date() are flagged inside a component body even
// when only invoked from event handlers).
const now = () => Date.now();
const freshDate = () => new Date();
const elapsedSeconds = (t0: number): string => ((now() - t0) / 1000).toFixed(1);

export default function AdminPanel({
  buckets,
  timestamps,
  counts,
}: {
  buckets: Bucket[];
  timestamps: Record<string, string>;
  counts: Record<string, number>;
}) {
  // Output accumulates across multiple runs so the user can sequentially
  // fire several buckets and see all results stacked. Newest-first.
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const run = async (bucket: string) => {
    setBusy(bucket);
    const t0 = now();
    const startedAt = freshDate();
    let entry: LogEntry;
    try {
      const r = await fetch(`/api/cron?bucket=${encodeURIComponent(bucket)}`);
      const txt = await r.text();
      entry = { bucket, startedAt, status: r.status, elapsed: elapsedSeconds(t0), body: txt };
    } catch (e) {
      entry = { bucket, startedAt, status: 0, elapsed: elapsedSeconds(t0), body: `ERROR: ${e instanceof Error ? e.message : String(e)}` };
    }
    setLog((prev) => [entry, ...prev]);
    setBusy(null);
  };

  return (
    <>
      <h2>Output</h2>
      <pre className="out">
        {log.length === 0
          ? '(idle — pick a bucket below)'
          : log.map((e, i) => formatEntry(e, i === 0)).join('\n\n')}
      </pre>
      {log.length > 0 && (
        <button type="button" className="clear-log" onClick={() => setLog([])}>
          Clear output
        </button>
      )}

      <h2>Cron buckets</h2>
      {buckets.map((b) => (
        <div className="bucket" key={b.id}>
          <b>{b.id}</b>
          <span>{b.desc}</span>
          <button disabled={busy !== null} onClick={() => run(b.id)}>
            {busy === b.id ? 'Running…' : 'Run'}
          </button>
        </div>
      ))}

      <h2>Row counts</h2>
      <table className="kv-table">
        <thead><tr><th>table</th><th>rows</th></tr></thead>
        <tbody>
          {Object.entries(counts).map(([t, c]) => (
            <tr key={t}>
              <td className="k" style={{ color: 'gold' }}>{t}</td>
              <td className="v">{c < 0 ? '—' : c}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Last updated (apis_json)</h2>
      <SortableTimestamps timestamps={timestamps} />
    </>
  );
}

interface LogEntry {
  bucket: string;
  startedAt: Date;
  status: number;
  elapsed: string;
  body: string;
}

function formatEntry(e: LogEntry, isNewest: boolean): string {
  const head = `${isNewest ? '▸' : '·'} [${e.bucket}] ${e.startedAt.toLocaleTimeString()} — ${e.status || 'fail'} in ${e.elapsed}s`;
  return `${head}\n${e.body.trim()}`;
}

function SortableTimestamps({ timestamps }: { timestamps: Record<string, string> }) {
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    const list = Object.entries(timestamps).map(([id, ts]) => ({ id, ts }));
    list.sort((a, b) => {
      const cmp = sortKey === 'id'
        ? a.id.localeCompare(b.id)
        : a.ts.localeCompare(b.ts);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [timestamps, sortKey, sortDir]);

  if (rows.length === 0) {
    return <p className="fade">No data cached yet.</p>;
  }

  const toggle = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      // Default direction per column: id asc, updated desc.
      setSortDir(k === 'id' ? 'asc' : 'desc');
    }
  };
  const arrow = (k: SortKey) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <table className="kv-table sortable">
      <thead>
        <tr>
          <th>
            <button type="button" className="sort-th" onClick={() => toggle('id')}>
              id{arrow('id')}
            </button>
          </th>
          <th>
            <button type="button" className="sort-th" onClick={() => toggle('updated')}>
              updated at{arrow('updated')}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ id, ts }) => (
          <tr key={id}>
            <td className="k" style={{ color: 'gold' }}>{id}</td>
            <td className="v">
              {relativeFromIso(ts)}{' '}
              <span className="muted" style={{ fontSize: '.8em' }}>({ts})</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
