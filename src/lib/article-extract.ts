// Server-side article extraction via Mozilla Readability + jsdom.
//
// Why: RSS descriptions vary wildly. BBC gives a usable 1-2 sentence
// summary; Google News returns thin source-attribution snippets like
// "Story from APNews · Reuters". To show real content in the modal we
// fetch the article HTML and run Readability — the same algorithm
// Firefox's Reader View uses.
//
// Cache: extracted articles land in apis_json under `article_<sha1>`,
// keyed by the canonical article URL (after following Google News
// redirects). 30-day TTL is enforced lazily on read.
//
// Failure modes (all return null + UI falls back to RSS summary):
//   - paywalled sites where article body is gated server-side
//   - SPAs that only inject content client-side (rare for news)
//   - sites blocking non-browser User-Agents
//   - jsdom-incompatible HTML (very rare)

import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { getJson, upsertJson } from './cache';

export interface ExtractedArticle {
  url: string;            // canonical (post-redirect) article URL
  title: string;
  byline: string | null;
  excerpt: string | null; // ~ first paragraph, plain text
  content: string;        // sanitized HTML
  textLength: number;
  siteName: string | null;
  scrapedAt: string;
  source: string;         // host name (e.g. "bbc.com")
}

const COMMON_HEADERS = {
  // Use a realistic UA — many news sites cloak on UA detection.
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TTL_MS = 30 * 24 * 60 * 60 * 1000;       // 30 days
const MAX_BYTES = 2_500_000;                    // 2.5MB cap on raw HTML
const FETCH_TIMEOUT_MS = 12_000;

function hashKey(url: string): string {
  return 'article_' + createHash('sha1').update(url).digest('hex').slice(0, 16);
}

// Google News links are tracker redirectors — we want the final article
// URL both for clean dedupe (the same story across days) and so the
// extracted content's <base> resolution doesn't break relative links.
async function resolveCanonicalUrl(url: string, signal: AbortSignal): Promise<string> {
  try {
    const u = new URL(url);
    if (u.hostname !== 'news.google.com') return url;
    // Google News /rss/articles/<base64> redirects when followed.
    const r = await fetch(url, { redirect: 'follow', signal, headers: COMMON_HEADERS });
    if (r.url && r.url !== url) return r.url;
  } catch { /* fall through */ }
  return url;
}

async function fetchHtml(url: string, signal: AbortSignal): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const r = await fetch(url, { signal, redirect: 'follow', headers: COMMON_HEADERS });
    if (!r.ok) {
      console.warn(`[extract] HTTP ${r.status} from ${new URL(url).hostname}`);
      return null;
    }
    const ct = r.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(ct)) {
      console.warn(`[extract] non-HTML content-type "${ct}" from ${url}`);
      return null;
    }
    // Stream-read up to MAX_BYTES so a giant page can't OOM the worker.
    const reader = r.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) { await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    return { html, finalUrl: r.url || url };
  } catch (e) {
    console.warn(`[extract] fetch threw for ${url}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

function runReadability(html: string, baseUrl: string): {
  title: string;
  byline: string | null;
  excerpt: string | null;
  content: string;
  textLength: number;
  siteName: string | null;
} | null {
  try {
    const dom = new JSDOM(html, { url: baseUrl });
    // Strip noisy injections before Readability scores nodes.
    const doc = dom.window.document;
    doc.querySelectorAll('script,style,noscript,iframe,svg,form').forEach((n) => n.remove());
    const reader = new Readability(doc, { charThreshold: 200 });
    const article = reader.parse();
    if (!article || !article.content) return null;
    return {
      title: article.title || '',
      byline: article.byline ?? null,
      excerpt: article.excerpt ?? null,
      content: article.content,
      textLength: article.length ?? (article.textContent?.length ?? 0),
      siteName: article.siteName ?? null,
    };
  } catch (e) {
    console.warn('[extract] Readability threw:', e instanceof Error ? e.message : e);
    return null;
  }
}

interface CachedRecord extends ExtractedArticle { _ttlAt?: number }

export async function extractArticle(rawUrl: string): Promise<ExtractedArticle | null> {
  // Look up cache by ORIGINAL URL first — saves resolving the
  // redirector when we already have a hit.
  const cacheKey = hashKey(rawUrl);
  const cached = await getJson<CachedRecord>(cacheKey).catch(() => null);
  if (cached && cached._ttlAt && cached._ttlAt > Date.now()) {
    return cached;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const canonical = await resolveCanonicalUrl(rawUrl, ctrl.signal);
    const fetched = await fetchHtml(canonical, ctrl.signal);
    if (!fetched) return null;
    const parsed = runReadability(fetched.html, fetched.finalUrl);
    if (!parsed) return null;

    const host = (() => { try { return new URL(fetched.finalUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const article: ExtractedArticle = {
      url: fetched.finalUrl,
      title: parsed.title,
      byline: parsed.byline,
      excerpt: parsed.excerpt,
      content: parsed.content,
      textLength: parsed.textLength,
      siteName: parsed.siteName,
      scrapedAt: new Date().toISOString(),
      source: host,
    };
    const record: CachedRecord = { ...article, _ttlAt: Date.now() + TTL_MS };
    await upsertJson(cacheKey, record);
    return article;
  } finally {
    clearTimeout(timer);
  }
}
