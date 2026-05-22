'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import type { FeedRow } from '@/lib/types';
import type { NewsItem } from '@/lib/news-aggregator';
import { relativeFromUnixSeconds } from '@/lib/time';
import { useUrlString, useUrlEnum } from '@/lib/useUrlState';

// 'all' = merged & sorted (default). Others act as exclusive filters.
type Tab = 'all' | 'local' | 'state' | 'us' | 'world';
const TABS: Tab[] = ['all', 'local', 'state', 'us', 'world'];

interface Props {
  local: FeedRow[];
  state: NewsItem[];
  us: NewsItem[];
  world: NewsItem[];
}

// Normalised display row — bridges FeedRow (text ts, no source) and
// NewsItem (numeric ts, has source). `scope` lets us render a badge
// in the merged view and key-stably across tabs.
interface Row {
  key: string;
  ts: number;
  title: string;
  body: string;
  link: string;
  source?: string;
  scope: Exclude<Tab, 'all'>;
}

function mapLocal(rows: FeedRow[]): Row[] {
  return rows.map((f) => ({
    key: `local-${f.ts}`,
    ts: Number(f.ts),
    title: f.title,
    body: f.body,
    link: f.link,
    scope: 'local',
  }));
}

function mapWire(scope: Exclude<Tab, 'all' | 'local'>, items: NewsItem[]): Row[] {
  return items.map((it, i) => ({
    key: `${scope}-${it.ts}-${i}`,
    ts: it.ts,
    title: it.title,
    body: it.body,
    link: it.link,
    source: it.source,
    scope,
  }));
}

const SCOPE_LABEL: Record<Exclude<Tab, 'all'>, string> = {
  local: 'Local',
  state: 'State',
  us: 'US',
  world: 'World',
};

export default function NewsCard(props: Props) {
  const [tab, setTab] = useUrlEnum<Tab>('ntab', TABS, 'all');
  const [openKey, setOpenKey] = useUrlString('news');

  // Build all rows once, then filter — keeps the counts in chip
  // labels accurate regardless of which tab is active.
  const allRows = useMemo<Row[]>(() => {
    const merged: Row[] = [
      ...mapLocal(props.local),
      ...mapWire('state', props.state),
      ...mapWire('us', props.us),
      ...mapWire('world', props.world),
    ];
    merged.sort((a, b) => b.ts - a.ts);
    return merged;
  }, [props]);

  const counts = useMemo(() => {
    const c: Record<Exclude<Tab, 'all'>, number> = { local: 0, state: 0, us: 0, world: 0 };
    for (const r of allRows) c[r.scope]++;
    return c;
  }, [allRows]);

  const rows = useMemo(() => {
    if (tab === 'all') return allRows.slice(0, 80);
    return allRows.filter((r) => r.scope === tab);
  }, [tab, allRows]);

  const open = useMemo(
    () => (openKey ? allRows.find((r) => r.key === openKey) ?? null : null),
    [openKey, allRows],
  );
  const setOpen = (r: Row | null) => setOpenKey(r ? r.key : null);

  return (
    <section className="card-section news-card">
      <div className="news-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`news-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'all' ? 'All' : SCOPE_LABEL[t]}
            {t !== 'all' && (
              <span className="news-tab-count">{counts[t]}</span>
            )}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          {tab === 'local' || tab === 'all'
            ? 'No items cached yet.'
            : 'No items cached yet — run /admin → 4h.'}
        </p>
      ) : (
        <div className="stack-sm">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              className="news-item clickable"
              onClick={() => setOpen(r)}
            >
              <h3>{r.title}</h3>
              <div className="meta">
                {tab === 'all' && (
                  <span className={`news-scope-badge scope-${r.scope}`}>{SCOPE_LABEL[r.scope]}</span>
                )}
                {r.source ? `${r.source} · ` : ''}{relativeFromUnixSeconds(String(r.ts))}
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title} size="lg">
        {open && (
          <>
            <div className="meta" style={{ marginBottom: 10 }}>
              <span className={`news-scope-badge scope-${open.scope}`}>{SCOPE_LABEL[open.scope]}</span>
              {open.source ? `${open.source} · ` : ''}{relativeFromUnixSeconds(String(open.ts))}
            </div>
            {open.body && (
              <div
                className="news-body"
                style={{ lineHeight: 1.55, fontSize: '.95em' }}
                // RSS bodies are HTML; render trusted feed sources verbatim.
                dangerouslySetInnerHTML={{ __html: open.body }}
              />
            )}
            <p style={{ marginTop: 16 }}>
              <a className="event-modal-btn primary" href={open.link} target="_blank" rel="noopener">Read full article →</a>
            </p>
          </>
        )}
      </Modal>
    </section>
  );
}
