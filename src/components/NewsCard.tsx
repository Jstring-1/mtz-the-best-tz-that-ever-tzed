'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import type { FeedRow } from '@/lib/types';
import type { NewsItem } from '@/lib/news-aggregator';
import { relativeFromUnixSeconds } from '@/lib/time';
import { useUrlString, useUrlEnum } from '@/lib/useUrlState';

type Tab = 'local' | 'state' | 'us' | 'world';
const TABS: Tab[] = ['local', 'state', 'us', 'world'];

interface Props {
  local: FeedRow[];
  state: NewsItem[];
  us: NewsItem[];
  world: NewsItem[];
}

// Normalised display row — bridges FeedRow (text ts, no source) and
// NewsItem (numeric ts, has source) so the render loop stays simple.
interface Row {
  key: string;
  ts: number;
  title: string;
  body: string;
  link: string;
  source?: string;
}

function toRows(tab: Tab, p: Props): Row[] {
  if (tab === 'local') {
    return p.local.map((f) => ({
      key: f.ts,
      ts: Number(f.ts),
      title: f.title,
      body: f.body,
      link: f.link,
    }));
  }
  const src = tab === 'state' ? p.state : tab === 'us' ? p.us : p.world;
  return src.map((it, i) => ({
    key: `${it.ts}-${i}`,
    ts: it.ts,
    title: it.title,
    body: it.body,
    link: it.link,
    source: it.source,
  }));
}

export default function NewsCard(props: Props) {
  const [tab, setTab] = useUrlEnum<Tab>('ntab', TABS, 'local');
  const [openKey, setOpenKey] = useUrlString('news');

  const rows = useMemo(() => toRows(tab, props), [tab, props]);
  const open = useMemo(
    () => (openKey ? rows.find((r) => r.key === openKey) ?? null : null),
    [openKey, rows],
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
            onClick={() => { setOpenKey(null); setTab(t); }}
          >
            {t === 'local' ? 'Local' : t === 'state' ? 'State' : t === 'us' ? 'US' : 'World'}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          {tab === 'local' ? 'No items cached yet.' : 'No items cached yet — run /admin → 4h.'}
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
