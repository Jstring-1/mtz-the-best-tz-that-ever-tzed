'use client';

import Modal from './Modal';
import { useMemo, useState } from 'react';
import { useUrlBool, useUrlEnum } from '@/lib/useUrlState';
import type { RecallRow } from '@/lib/gov';

type SourceFilter = 'all' | 'food' | 'drug' | 'device' | 'cpsc';
const FILTERS: SourceFilter[] = ['all', 'food', 'drug', 'device', 'cpsc'];

interface Props {
  label: string;
  tooltip?: string;
  data: RecallRow[];
  scrapedAt?: string;
}

const SOURCE_LABEL: Record<SourceFilter, string> = {
  all: 'All',
  food: 'Food',
  drug: 'Drug',
  device: 'Device',
  cpsc: 'CPSC',
};

// Map a row's `source` string (e.g. "FDA food", "FDA drug", "CPSC") to
// our filter buckets. CPSC covers consumer products (toys, appliances,
// etc.); FDA breaks into food / drug / device.
function bucketOf(r: RecallRow): Exclude<SourceFilter, 'all'> {
  const s = r.source.toLowerCase();
  if (s.includes('food'))    return 'food';
  if (s.includes('drug'))    return 'drug';
  if (s.includes('device'))  return 'device';
  return 'cpsc';
}

export default function RecallsDetail({ label, tooltip, data, scrapedAt }: Props) {
  const [open, setOpen] = useUrlBool('recalls');
  const [tab, setTab] = useUrlEnum<SourceFilter>('rtab', FILTERS, 'all');
  // Track which row has its full reason expanded — single string ID
  // rather than per-row state, so URL deep-link could later be added.
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filtered = tab === 'all' ? data : data.filter((r) => bucketOf(r) === tab);
    return filtered;
  }, [tab, data]);

  const counts = useMemo(() => {
    const c: Record<Exclude<SourceFilter, 'all'>, number> = { food: 0, drug: 0, device: 0, cpsc: 0 };
    for (const r of data) c[bucketOf(r)]++;
    return c;
  }, [data]);

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Recalls — nationwide" size="lg">
        {data.length === 0 ? (
          <p className="muted">Cache empty — run /admin → 4h.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              Most-recent recalls from FDA (food, drugs, medical devices) and
              CPSC (consumer products). Sorted newest first; click a row to
              read the reason.
            </p>

            <div className="news-tabs">
              {FILTERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`news-tab${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {SOURCE_LABEL[t]}
                  {t !== 'all' && <> <span className="count">{counts[t]}</span></>}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="muted">No recalls in this category right now.</p>
            ) : (
              <ul className="recall-list">
                {rows.map((r, i) => {
                  const id = `${r.source}-${r.date}-${i}`;
                  const expanded = openId === id;
                  return (
                    <li key={id} className="recall-item">
                      <button
                        type="button"
                        className="recall-head"
                        onClick={() => setOpenId(expanded ? null : id)}
                      >
                        <span className="recall-title">{r.title}</span>
                        <span className="meta">
                          <span className={`recall-src src-${bucketOf(r)}`}>{r.source}</span>
                          {r.date && <span> · {r.date}</span>}
                        </span>
                      </button>
                      {expanded && r.reason && (
                        <div className="recall-reason">{r.reason}</div>
                      )}
                      {expanded && r.url && (
                        <p style={{ marginTop: 6 }}>
                          <a className="event-modal-btn" href={r.url} target="_blank" rel="noopener">
                            Source page →
                          </a>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {scrapedAt && (
              <p className="muted" style={{ fontSize: '.72em', marginTop: 12 }}>
                Cached {new Date(scrapedAt).toLocaleString()}. Refreshes every 4h.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
