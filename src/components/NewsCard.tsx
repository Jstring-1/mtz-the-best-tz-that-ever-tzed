'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import type { FeedRow } from '@/lib/types';
import type { NewsItem } from '@/lib/news-aggregator';
import { relativeFromUnixSeconds } from '@/lib/time';
import { useUrlString, useUrlEnum } from '@/lib/useUrlState';

// 'all' = merged & sorted. Default lands on 'local' so the page leads
// with neighborhood news; users can flip to All or World from the
// chip row.
type Tab = 'all' | 'local' | 'world';
const TABS: Tab[] = ['all', 'local', 'world'];

// Decode HTML entities (named + numeric, hex + decimal) so headlines
// like "Smith &amp; Jones break out &#8212; what next" render as
// "Smith & Jones break out — what next" in the plain-text <h3> title.
// RSS feeds often double-encode entities in <title>; the modal body
// uses dangerouslySetInnerHTML so decoding is automatic there.
function decodeEntities(s: string): string {
  if (!s) return '';
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“');
}

interface Props {
  local: FeedRow[];
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

interface ExtractedArticle {
  url: string;
  title: string;
  byline: string | null;
  excerpt: string | null;
  content: string;
  textLength: number;
  siteName: string | null;
  source: string;
}

function mapLocal(rows: FeedRow[]): Row[] {
  return rows.map((f) => ({
    key: `local-${f.ts}`,
    ts: Number(f.ts),
    title: decodeEntities(f.title),
    body: f.body,
    link: f.link,
    scope: 'local',
  }));
}

function mapWire(scope: Exclude<Tab, 'all' | 'local'>, items: NewsItem[]): Row[] {
  return items.map((it, i) => ({
    key: `${scope}-${it.ts}-${i}`,
    ts: it.ts,
    title: decodeEntities(it.title),
    body: it.body,
    link: it.link,
    source: it.source,
    scope,
  }));
}

const SCOPE_LABEL: Record<Exclude<Tab, 'all'>, string> = {
  local: 'Local',
  world: 'World',
};

export default function NewsCard(props: Props) {
  const [tab, setTab] = useUrlEnum<Tab>('ntab', TABS, 'local');
  const [openKey, setOpenKey] = useUrlString('news');

  // Build all rows once, then filter — keeps the counts in chip
  // labels accurate regardless of which tab is active.
  const allRows = useMemo<Row[]>(() => {
    const merged: Row[] = [
      ...mapLocal(props.local),
      ...mapWire('world', props.world),
    ];
    merged.sort((a, b) => b.ts - a.ts);
    return merged;
  }, [props]);

  const counts = useMemo(() => {
    const c: Record<Exclude<Tab, 'all'>, number> = { local: 0, world: 0 };
    for (const r of allRows) c[r.scope]++;
    return c;
  }, [allRows]);

  const rows = useMemo(() => {
    if (tab === 'all') return allRows.slice(0, 1000);
    return allRows.filter((r) => r.scope === tab);
  }, [tab, allRows]);

  const open = useMemo(
    () => (openKey ? allRows.find((r) => r.key === openKey) ?? null : null),
    [openKey, allRows],
  );
  const setOpen = (r: Row | null) => setOpenKey(r ? r.key : null);

  // Lazy article-extraction state. Keyed by row.key so reopening the
  // same article hits the in-memory cache instead of the server.
  const [article, setArticle] = useState<ExtractedArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractFailed, setExtractFailed] = useState(false);
  const cacheRef = useRef<Map<string, ExtractedArticle | null>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setArticle(null); setExtractFailed(false); setLoading(false);
      abortRef.current?.abort();
      return;
    }
    // Hit local memo cache first.
    if (cacheRef.current.has(open.key)) {
      const hit = cacheRef.current.get(open.key) ?? null;
      setArticle(hit); setExtractFailed(hit == null); setLoading(false);
      return;
    }
    // Otherwise fetch from /api/article-extract.
    setArticle(null); setExtractFailed(false); setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetch(`/api/article-extract?url=${encodeURIComponent(open.link)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || j.empty) {
          cacheRef.current.set(open.key, null);
          setExtractFailed(true);
        } else {
          cacheRef.current.set(open.key, j as ExtractedArticle);
          setArticle(j as ExtractedArticle);
        }
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') {
          cacheRef.current.set(open.key, null);
          setExtractFailed(true);
        }
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open]);

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
              <> <span className="count">{counts[t]}</span></>
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
              {(article?.siteName || open.source) ? `${article?.siteName ?? open.source} · ` : ''}
              {article?.byline ? `${article.byline} · ` : ''}
              {relativeFromUnixSeconds(String(open.ts))}
            </div>

            {loading && (
              <p className="muted" style={{ fontSize: '.85em', fontStyle: 'italic' }}>
                Extracting article…
              </p>
            )}

            {!loading && article?.content && (
              <div
                className="news-body article-extracted"
                style={{ lineHeight: 1.55, fontSize: '.95em' }}
                // Readability-sanitized HTML — safe to inline.
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            )}

            {!loading && !article?.content && open.body && (
              <>
                <div
                  className="news-body"
                  style={{ lineHeight: 1.55, fontSize: '.95em' }}
                  // Fall back to the RSS summary when extraction failed.
                  dangerouslySetInnerHTML={{ __html: open.body }}
                />
                {extractFailed && (
                  <p className="muted" style={{ fontSize: '.78em', marginTop: 10 }}>
                    Couldn&rsquo;t pull the full article (paywall or blocked) — showing the RSS summary.
                  </p>
                )}
              </>
            )}

            {!loading && !article?.content && !open.body && extractFailed && (
              <p className="muted" style={{ fontSize: '.85em' }}>
                No preview available — click below to read on the publisher&rsquo;s site.
              </p>
            )}

            <p style={{ marginTop: 16 }}>
              <a className="event-modal-btn primary" href={article?.url ?? open.link} target="_blank" rel="noopener">Read full article →</a>
            </p>
          </>
        )}
      </Modal>
    </section>
  );
}
