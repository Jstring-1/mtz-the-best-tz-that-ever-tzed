'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlEnum } from '@/lib/useUrlState';
import type { OutbreaksPayload, OutbreakItem, OutbreakSnapshot } from '@/lib/outbreaks';

interface Props {
  label: string;
  tooltip?: string;
  data: OutbreaksPayload | null;
}

type Tab = 'all' | 'snapshot' | 'food' | 'flu' | 'who';
const TABS: Tab[] = ['all', 'snapshot', 'food', 'flu', 'who'];
const TAB_LABEL: Record<Tab, string> = {
  all: 'All events',
  snapshot: 'Snapshot',
  food: 'Food',
  flu: 'Flu',
  who: 'WHO',
};
const SOURCE_LABEL: Record<string, string> = {
  NORS: 'CDC NORS',
  WHO: 'WHO DON',
};

// Build a normalized key for cross-source dedupe: lowercased,
// alphanumeric-only, dropping connector words. NORS + WHO DON rarely
// describe the same incident with identical wording, but when they do
// (e.g. both list the same Salmonella outbreak), we collapse to one.
function dedupKey(it: OutbreakItem): string {
  return (it.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an|of|in|on|and|or|outbreak|disease)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Civic-strip Outbreaks popup. Tabs across four data layers:
//   Snapshot — disease.sh (global / US / CA COVID counts)
//   Food     — CDC NORS recent foodborne outbreaks
//   Flu      — Delphi Epidata fluview (ILI percent for US + CA)
//   WHO      — WHO Disease Outbreak News RSS items
// Each tab gracefully handles "no data" so a single failing source
// doesn't blank the popup.
export default function OutbreaksDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('outbreaks');
  const [tab, setTab] = useUrlEnum<Tab>('otab', TABS, 'all');
  const [openItem, setOpenItem] = useState<string | null>(null);

  // Merge NORS + WHO DON into a single deduplicated chronological event
  // list. Snapshot + Flu are aggregate stats, not events, so they're
  // intentionally NOT merged in — they show in their own tabs.
  const allEvents = useMemo<OutbreakItem[]>(() => {
    if (!data) return [];
    const merged: OutbreakItem[] = [
      ...data.cdcFood.map((r) => ({ ...r, category: r.category || 'NORS' })),
      ...data.whoDon.map((r) => ({ ...r, category: r.category || 'WHO' })),
    ];
    // Dedupe — keep whichever variant has the longer body (more detail).
    const byKey = new Map<string, OutbreakItem>();
    for (const it of merged) {
      const k = dedupKey(it);
      if (!k) continue;
      const prev = byKey.get(k);
      if (!prev) { byKey.set(k, it); continue; }
      const prevLen = prev.body?.length ?? 0;
      const curLen = it.body?.length ?? 0;
      if (curLen > prevLen) byKey.set(k, it);
    }
    // Sort newest first. Mix of full ISO dates and "YYYY-MM" + "YYYY"
    // strings — string-compare-desc happens to work for all three.
    return [...byKey.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [data]);

  const counts = {
    all: allEvents.length,
    snapshot: [data?.snapshots?.global, data?.snapshots?.unitedStates, data?.snapshots?.california].filter(Boolean).length,
    food: data?.cdcFood?.length ?? 0,
    flu: data?.flu?.length ?? 0,
    who: data?.whoDon?.length ?? 0,
  };

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Outbreaks — disease surveillance" size="lg">
        {!data ? (
          <p className="muted">No outbreaks cache. Run /admin → 4h.</p>
        ) : (
          <>
            <p className="muted bills-legend" style={{ margin: 0 }}>
              Layered surveillance from{' '}
              <a href="https://disease.sh" target="_blank" rel="noopener">disease.sh</a>{' '}(snapshot),{' '}
              <a href="https://data.cdc.gov/" target="_blank" rel="noopener">CDC Open Data</a>{' '}(food),{' '}
              <a href="https://delphi.cmu.edu/epidata/" target="_blank" rel="noopener">Delphi Epidata</a>{' '}(flu),{' '}
              and{' '}<a href="https://www.who.int/emergencies/disease-outbreak-news" target="_blank" rel="noopener">WHO DON</a>{' '}(early warnings).
            </p>
            <p className="bills-cached muted">
              Cached {new Date(data.scrapedAt).toLocaleString()}.
            </p>

            <div className="news-tabs" style={{ marginTop: 12 }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`news-tab${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABEL[t]} <span className="count">{counts[t]}</span>
                </button>
              ))}
            </div>

            {tab === 'all' && (
              <section>
                {allEvents.length === 0 ? (
                  <p className="muted">No event records cached — CDC NORS + WHO DON were both empty.</p>
                ) : (
                  <ul className="recall-list">
                    {allEvents.map((row) => {
                      const expanded = openItem === row.id;
                      const src = row.category && SOURCE_LABEL[row.category]
                        ? SOURCE_LABEL[row.category]
                        : (row.category ?? '');
                      return (
                        <li key={row.id} className="recall-item">
                          <button
                            type="button"
                            className="recall-head"
                            onClick={() => setOpenItem(expanded ? null : row.id)}
                          >
                            <span className="recall-title">{row.title}</span>
                            <span className="meta">
                              {src && <span className="recall-src">{src}</span>}
                              {row.region && <span> · {row.region}</span>}
                              {row.date && <span> · {row.date}</span>}
                            </span>
                          </button>
                          {expanded && (
                            <div className="recall-reason">
                              {row.category === 'WHO' && row.url ? (
                                <ArticleBody url={row.url} fallback={row.body} />
                              ) : (
                                row.body && <p style={{ margin: 0 }}>{row.body}</p>
                              )}
                              {row.url && (
                                <div className="popup-ext-links">
                                  <a href={row.url} target="_blank" rel="noopener">
                                    {row.category === 'WHO' ? 'Full DON post →' : 'CDC NORS dashboard →'}
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="muted" style={{ fontSize: '.72em', marginTop: 8 }}>
                  Unified, deduplicated event feed combining CDC NORS foodborne
                  records and WHO Disease Outbreak News. Snapshot + Flu tabs
                  carry aggregate stats and don&rsquo;t merge in here.
                </p>
              </section>
            )}

            {tab === 'snapshot' && (
              <section className="outbreak-snapshot">
                <SnapshotCard snap={data.snapshots.global} hint="disease.sh /all" />
                <SnapshotCard snap={data.snapshots.unitedStates} hint="disease.sh /countries/USA" />
                <SnapshotCard snap={data.snapshots.california} hint="disease.sh /states/California" />
                {!data.snapshots.global && !data.snapshots.unitedStates && !data.snapshots.california && (
                  <p className="muted">disease.sh returned no data this run.</p>
                )}
                <p className="muted" style={{ fontSize: '.72em', marginTop: 8 }}>
                  COVID surveillance has decayed since many states stopped daily
                  reporting; treat snapshot deltas as directional, not exact.
                </p>
              </section>
            )}

            {tab === 'food' && (
              <section>
                {data.cdcFood.length === 0 ? (
                  <p className="muted">No CDC NORS rows cached.</p>
                ) : (
                  <ul className="recall-list">
                    {data.cdcFood.map((row) => {
                      const expanded = openItem === row.id;
                      return (
                        <li key={row.id} className="recall-item">
                          <button
                            type="button"
                            className="recall-head"
                            onClick={() => setOpenItem(expanded ? null : row.id)}
                          >
                            <span className="recall-title">{row.title}</span>
                            <span className="meta">
                              {row.region && <span className="recall-src">{row.region}</span>}
                              {row.date && <span> · {row.date}</span>}
                              {row.category && <span> · {row.category}</span>}
                            </span>
                          </button>
                          {expanded && (
                            <div className="recall-reason">
                              {row.body && <p style={{ margin: 0 }}>{row.body}</p>}
                              {row.url && (
                                <div className="popup-ext-links">
                                  <a href={row.url} target="_blank" rel="noopener">CDC NORS dashboard →</a>
                                </div>
                              )}
                            </div>
                          )}
                          {/* NORS rows all share the same dashboard URL,
                              so article extraction wouldn't help. */}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {tab === 'flu' && (
              <section>
                {data.flu.length === 0 ? (
                  <p className="muted">Delphi Epidata returned no rows. (Pub lag can be 1–2 weeks.)</p>
                ) : (
                  <>
                    <dl className="econ-kv">
                      {data.flu.map((row) => {
                        const v = row.wili ?? row.ili;
                        return (
                          <div key={row.region} style={{ display: 'contents' }}>
                            <dt>{row.region === 'NAT' ? 'United States' : row.region} — ILI%</dt>
                            <dd className="big">{v != null ? `${v.toFixed(2)}%` : '—'}</dd>
                            <dt>epiweek</dt>
                            <dd className="muted">{formatEpiweek(row.epiweek)}</dd>
                          </div>
                        );
                      })}
                    </dl>
                    <p className="muted" style={{ fontSize: '.72em', marginTop: 6 }}>
                      ILI = outpatient visits for influenza-like illness, as a
                      percent of total visits (CDC FluView via Delphi). National
                      values are weighted; state values may be unweighted.
                    </p>
                  </>
                )}
              </section>
            )}

            {tab === 'who' && (
              <section>
                {data.whoDon.length === 0 ? (
                  <p className="muted">WHO DON feed returned no items.</p>
                ) : (
                  <ul className="recall-list">
                    {data.whoDon.map((row) => {
                      const expanded = openItem === row.id;
                      return (
                        <li key={row.id} className="recall-item">
                          <button
                            type="button"
                            className="recall-head"
                            onClick={() => setOpenItem(expanded ? null : row.id)}
                          >
                            <span className="recall-title">{row.title}</span>
                            <span className="meta">
                              {row.date && <span className="recall-src">{row.date}</span>}
                            </span>
                          </button>
                          {expanded && (
                            <div className="recall-reason">
                              {row.url ? (
                                <ArticleBody url={row.url} fallback={row.body} />
                              ) : (
                                row.body && <p style={{ margin: 0 }}>{row.body}</p>
                              )}
                              {row.url && (
                                <div className="popup-ext-links">
                                  <a href={row.url} target="_blank" rel="noopener">Full DON post →</a>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            <details style={{ marginTop: 14 }}>
              <summary className="muted" style={{ fontSize: '.78em', cursor: 'pointer' }}>
                Data freshness — per source
              </summary>
              <dl className="econ-kv" style={{ marginTop: 6 }}>
                {Object.entries(data.status).map(([k, s]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd className={s.ok ? 'big' : 'muted'} style={{ textAlign: 'left' }}>
                      {s.ok ? `${s.count} rows` : (s.error ?? 'failed')}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        )}
      </Modal>
    </>
  );
}

// On-demand article extraction via /api/article-extract (Mozilla
// Readability + 30-day server cache). Renders the extracted body
// when available, otherwise falls back to the RSS summary, otherwise
// a discreet "couldn't pull" note. In-memory cache keyed by URL so
// re-opening the same item doesn't refetch.
const ARTICLE_MEMO = new Map<string, ExtractedArticle | null>();

interface ExtractedArticle {
  title?: string;
  byline?: string;
  content?: string;   // sanitized HTML from Readability
  excerpt?: string;
  empty?: boolean;
}

function ArticleBody({ url, fallback }: { url: string; fallback?: string }) {
  const [article, setArticle] = useState<ExtractedArticle | null>(() => ARTICLE_MEMO.get(url) ?? null);
  const [loading, setLoading] = useState<boolean>(() => !ARTICLE_MEMO.has(url));
  const [failed, setFailed] = useState<boolean>(() => ARTICLE_MEMO.get(url) === null && ARTICLE_MEMO.has(url));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (ARTICLE_MEMO.has(url)) {
      const hit = ARTICLE_MEMO.get(url) ?? null;
      setArticle(hit); setFailed(hit == null && ARTICLE_MEMO.get(url) === null); setLoading(false);
      return;
    }
    setLoading(true); setFailed(false); setArticle(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetch(`/api/article-extract?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || j.empty) {
          ARTICLE_MEMO.set(url, null);
          setFailed(true);
        } else {
          ARTICLE_MEMO.set(url, j as ExtractedArticle);
          setArticle(j as ExtractedArticle);
        }
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          ARTICLE_MEMO.set(url, null);
          setFailed(true);
        }
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [url]);

  if (loading) {
    return <p className="muted" style={{ margin: 0, fontSize: '.85em' }}>Loading article…</p>;
  }
  if (article?.content) {
    return (
      <div
        className="article-extracted news-body"
        style={{ lineHeight: 1.55, fontSize: '.92em' }}
        // Readability-sanitized HTML — safe to inline (same pattern as NewsCard).
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    );
  }
  if (fallback) {
    return (
      <>
        <p style={{ margin: 0 }}>{fallback}</p>
        {failed && (
          <p className="muted" style={{ fontSize: '.78em', marginTop: 6 }}>
            Couldn&rsquo;t pull the full article (paywall or blocked) — showing the RSS summary.
          </p>
        )}
      </>
    );
  }
  if (failed) {
    return (
      <p className="muted" style={{ fontSize: '.85em', margin: 0 }}>
        Couldn&rsquo;t pull the full article — click the link below to read on the publisher&rsquo;s site.
      </p>
    );
  }
  return null;
}

// Render one disease.sh snapshot panel — Global / US / CA, in that order.
function SnapshotCard({ snap, hint }: { snap: OutbreakSnapshot | null; hint?: string }) {
  if (!snap) return null;
  return (
    <div className="outbreak-snap-card">
      <div className="outbreak-snap-head">
        <strong>{snap.scope}</strong>
        {hint && <span className="muted" style={{ fontSize: '.7em' }}>{hint}</span>}
      </div>
      <dl className="econ-kv">
        {snap.todayCases && (
          <>
            <dt>Today&rsquo;s reported cases</dt>
            <dd className="big">{snap.todayCases}</dd>
          </>
        )}
        {snap.todayDeaths && (
          <>
            <dt>Today&rsquo;s reported deaths</dt>
            <dd className="big">{snap.todayDeaths}</dd>
          </>
        )}
        {snap.active && (
          <>
            <dt>Active cases</dt>
            <dd>{snap.active}</dd>
          </>
        )}
        {snap.cases && (
          <>
            <dt>Cumulative cases</dt>
            <dd className="muted">{snap.cases}</dd>
          </>
        )}
        {snap.deaths && (
          <>
            <dt>Cumulative deaths</dt>
            <dd className="muted">{snap.deaths}</dd>
          </>
        )}
        {snap.updated && (
          <>
            <dt>Updated</dt>
            <dd className="muted">{new Date(snap.updated).toLocaleString()}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// Epiweek 202345 -> "Week 45, 2023". Falls back to raw if parse fails.
function formatEpiweek(ew: string): string {
  if (!/^\d{6}$/.test(ew)) return ew;
  return `Week ${Number(ew.slice(4))}, ${ew.slice(0, 4)}`;
}
