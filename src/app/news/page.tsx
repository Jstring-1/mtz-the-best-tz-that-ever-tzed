import { getFeeds } from '@/lib/cache';
import { getLocation } from '@/lib/location';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NewsPage() {
  const loc = getLocation();
  const feeds = await getFeeds(80);

  return (
    <div className="page">
      <h1>News</h1>
      <p className="muted">{loc.short} &amp; East Bay headlines, refreshed from RSS feeds every 4 hours.</p>

      {feeds.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          No news cached yet. Run the 4h bucket on <a href="/admin">/admin</a>.
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {feeds.map((f) => (
            <article className="news-item" key={f.ts}>
              <h3><a href={f.link} target="_blank" rel="noopener">{f.title}</a></h3>
              <div className="meta">{relativeTime(f.ts)} · {hostOf(f.link)}</div>
              <div className="body" dangerouslySetInnerHTML={{ __html: f.body }} />
            </article>
          ))}
        </div>
      )}

      <div className="sources">
        Sources: configured RSS feeds (set via the <code>NEWS_RSS_URLS</code> env var).
      </div>
    </div>
  );
}

function relativeTime(ts: string): string {
  const sec = Number(ts);
  if (!sec) return '';
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60)     return `${diff}s ago`;
  if (diff < 3600)   return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400)  return `${Math.round(diff / 3600)} hr ago`;
  return `${Math.round(diff / 86400)} d ago`;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
