// Aggregated, politically-moderate news for the World tab.
//
// "Local" stays on the existing `feeds` table (Martinez-specific RSS).
// "World" comes from BBC's direct RSS — single trusted source, no
// Google News proxy noise.
//
// Stored in apis_json under key `news_world`.

export type NewsScope = 'world';

export interface NewsItem {
  ts: number;        // unix epoch seconds
  title: string;
  link: string;
  source: string;    // publisher name, e.g. "BBC", "Associated Press"
  body: string;      // short HTML summary (may be empty)
}

export interface NewsScopePayload {
  scope: NewsScope;
  scrapedAt: string;
  items: NewsItem[];
}

const COMMON_HEADERS = {
  'User-Agent': 'mtz.city/1.0 (news aggregator; +https://mtz.city)',
  Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.8',
};

// Feed plan. Each scope has 1-2 RSS endpoints. They're combined,
// deduped, sorted desc by pubDate. The Google News `site:` filters
// ensure we only surface AP / Reuters / BBC stories.
const FEEDS: Record<NewsScope, string[]> = {
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
  ],
};

async function safeText(url: string, timeoutMs = 10000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: COMMON_HEADERS, signal: ctrl.signal, cache: 'no-store', redirect: 'follow' });
    if (!r.ok) { console.warn(`[news] ${new URL(url).hostname} HTTP ${r.status}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[news] fetch threw for ${url}:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ');
}

function urlKey(link: string): string {
  // Google News uses redirector URLs that all look different — dedupe by
  // final article identifier when present, otherwise host+path.
  try {
    const u = new URL(link);
    if (u.hostname === 'news.google.com' && u.searchParams.has('url')) {
      const real = u.searchParams.get('url');
      if (real) return new URL(real).hostname + new URL(real).pathname;
    }
    return u.hostname + u.pathname;
  } catch { return link; }
}

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/g)];
  for (const m of blocks) {
    const block = m[0];
    const title = decodeEntities(stripCdata(extractTag(block, 'title')));
    const link  = decodeEntities(stripCdata(extractTag(block, 'link')));
    const desc  = decodeEntities(stripCdata(extractTag(block, 'description')));
    const pubDate = stripCdata(extractTag(block, 'pubDate'));
    // Google News RSS has <source>Publisher</source> per item.
    // BBC has <dc:creator> or no source tag (we infer "BBC" later).
    const sourceRaw = decodeEntities(stripCdata(extractTag(block, 'source')));
    const ms = Date.parse(pubDate);
    if (!ms || Number.isNaN(ms)) continue;
    if (!title || !link) continue;
    items.push({
      ts: Math.floor(ms / 1000),
      title,
      link,
      source: sourceRaw || '',
      body: desc,
    });
  }
  return items;
}

function inferSourceFromLink(link: string): string {
  try {
    const host = new URL(link).hostname.toLowerCase();
    if (host.endsWith('bbc.co.uk') || host.endsWith('bbc.com')) return 'BBC';
    if (host.endsWith('apnews.com')) return 'AP';
    if (host.endsWith('reuters.com')) return 'Reuters';
    return host.replace(/^www\./, '');
  } catch { return ''; }
}

export async function fetchNewsScope(scope: NewsScope): Promise<NewsScopePayload> {
  const urls = FEEDS[scope];
  const results = await Promise.all(urls.map((u) => safeText(u)));
  const all: NewsItem[] = [];
  for (const xml of results) {
    if (!xml) continue;
    for (const item of parseRss(xml)) {
      if (!item.source) item.source = inferSourceFromLink(item.link);
      all.push(item);
    }
  }
  // Dedupe by canonical URL, keep newest.
  const byKey = new Map<string, NewsItem>();
  for (const it of all) {
    const k = urlKey(it.link);
    const prev = byKey.get(k);
    if (!prev || it.ts > prev.ts) byKey.set(k, it);
  }
  // Upstream RSS feeds rarely return more than ~100 items each, so the
  // realistic ceiling here is ~200/scope even with two feeds combined.
  // The cap is just a safety bound.
  const items = [...byKey.values()].sort((a, b) => b.ts - a.ts).slice(0, 300);
  return {
    scope,
    scrapedAt: new Date().toISOString(),
    items,
  };
}
