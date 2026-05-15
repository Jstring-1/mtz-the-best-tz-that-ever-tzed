// Martinez parks scraper.
//
// Strategy:
//   1. Fetch the index page  /departments/recreation/parks
//   2. Find every <a href> matching /departments/recreation/parks/<slug>
//      (children only — skip the index itself, skip anchors).
//   3. For each unique path, fetch the detail page and pull:
//        - title    (h1, fallback to link text)
//        - address  (regex "<digits> <words> St/Ave/Rd/...")
//        - image    (first content <img>, skipping logos/icons)
//        - amenities (list items mentioning common park-feature words,
//                     plus a generic "anything inside the first <ul>
//                     under a heading that says Amenities/Features")
//        - description (meta description, fallback to first long <p>)
//
// Fails open: any individual park that breaks just gets skipped.

import type { Park } from './types';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const BASE = 'https://www.cityofmartinez.org';
const INDEX_URL = `${BASE}/departments/recreation/parks`;
const PATH_RE = /\/departments\/recreation\/parks\/[A-Za-z0-9_-]+\/?$/;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) { console.warn(`[parks] ${url} → ${r.status}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[parks] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

function stripHtml(s: string): string {
  return (s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function absUrl(href: string): string | null {
  if (!href) return null;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/'))  return BASE + href;
  if (/^https?:/i.test(href)) return href;
  return null;
}

function slugFromUrl(url: string): string {
  const m = url.match(/parks\/([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1] : url.replace(/[^A-Za-z0-9]+/g, '-').slice(-40);
}

// ----- index page ------------------------------------------------------

interface ParkLink { url: string; linkText: string }

function extractParkLinks(html: string): ParkLink[] {
  const seen = new Map<string, string>();
  const re = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    const url = absUrl(raw);
    if (!url) continue;
    // Strip query/hash before matching
    const path = url.replace(/[?#].*$/, '');
    if (!PATH_RE.test(new URL(path).pathname)) continue;
    if (new URL(path).pathname === '/departments/recreation/parks') continue;
    const text = stripHtml(m[2]);
    if (!seen.has(path)) seen.set(path, text || slugFromUrl(path));
  }
  return [...seen.entries()].map(([url, linkText]) => ({ url, linkText }));
}

// ----- detail page parsers --------------------------------------------

function pickTitle(html: string, fallback: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = stripHtml(h1[1]);
    if (t && t.length > 1) return t;
  }
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (og) return og[1].trim();
  return fallback;
}

function pickDescription(html: string): string | undefined {
  const meta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
            ?? html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (meta) {
    const t = stripHtml(meta[1]);
    if (t.length > 20) return t;
  }
  // Fallback: first paragraph with >= 60 chars of real text.
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(html))) {
    const t = stripHtml(m[1]);
    if (t.length >= 60) return t.length > 400 ? t.slice(0, 400) + '…' : t;
  }
  return undefined;
}

function pickAddress(html: string): string | undefined {
  // Direct <address> element
  const addr = html.match(/<address[^>]*>([\s\S]*?)<\/address>/i);
  if (addr) {
    const t = stripHtml(addr[1]);
    if (t.length > 4) return t;
  }
  // Heuristic: "<num> <words> (Ave|St|Rd|Way|Lane|Dr|Blvd|Court|Ct|Drive|Street|Avenue|Place|Pl)..., Martinez"
  const text = stripHtml(html);
  const re = /\b(\d{1,5}\s+[A-Z][A-Za-z0-9.\- ']{1,40}\s+(?:Ave(?:nue)?|St(?:reet)?|Rd|Road|Way|Lane|Ln|Dr(?:ive)?|Blvd|Boulevard|Court|Ct|Place|Pl|Trail|Tr)\.?\s*(?:,\s*Martinez(?:,\s*CA)?)?)/;
  const m = text.match(re);
  if (m) return m[1].trim();
  return undefined;
}

function pickImage(html: string, pageUrl: string): string | undefined {
  // Prefer og:image
  const og = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) return absUrl(og[1]) ?? og[1];
  // Then any reasonable content <img>, skipping obvious chrome
  const imgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const src = m[1];
    if (/logo|icon|sprite|pixel|spacer|favicon/i.test(src)) continue;
    const abs = absUrl(src);
    if (!abs) continue;
    return abs;
  }
  void pageUrl;
  return undefined;
}

const AMENITY_KEYWORDS = [
  'playground', 'play structure', 'restroom', 'bathroom', 'picnic', 'BBQ', 'barbecue',
  'grill', 'tennis', 'basketball', 'baseball', 'softball', 'soccer', 'pickleball',
  'volleyball', 'horseshoe', 'bocce', 'skate', 'dog park', 'off-leash', 'shelter',
  'gazebo', 'trail', 'walking path', 'jogging', 'bike path', 'bench', 'parking',
  'water fountain', 'fishing', 'pier', 'dock', 'boat launch', 'amphitheater',
  'pool', 'splash pad', 'spray', 'gardens', 'community garden', 'wifi', 'lights',
];

function pickAmenities(html: string): string[] {
  const set = new Set<string>();

  // 1. Find any <ul>/<ol> following a heading that mentions "amenities" or "features".
  const sectionRe = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>[\s\S]*?<(ul|ol)[^>]*>([\s\S]*?)<\/\2>/gi;
  let s: RegExpExecArray | null;
  while ((s = sectionRe.exec(html))) {
    const head = stripHtml(s[1]).toLowerCase();
    if (!/amenit|features|facilit/.test(head)) continue;
    const list = s[3];
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let li: RegExpExecArray | null;
    while ((li = liRe.exec(list))) {
      const t = stripHtml(li[1]);
      if (t.length >= 2 && t.length <= 80) set.add(t);
    }
  }

  // 2. Keyword sweep over plain text — captures parks that don't use lists.
  const text = stripHtml(html).toLowerCase();
  for (const kw of AMENITY_KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(text)) {
      // Normalise display (title case)
      set.add(kw.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }

  return [...set].slice(0, 20);
}

// ----- main entrypoint -------------------------------------------------

export async function scrapeAllParks(): Promise<Park[]> {
  const indexHtml = await fetchText(INDEX_URL);
  if (!indexHtml) return [];
  const links = extractParkLinks(indexHtml);
  if (!links.length) { console.warn('[parks] no park links found on index'); return []; }

  const out: Park[] = [];
  for (const { url, linkText } of links) {
    const html = await fetchText(url);
    if (!html) {
      // Still add a stub so the park appears with at least a link.
      out.push({ id: slugFromUrl(url), name: linkText || slugFromUrl(url), url });
      continue;
    }
    const name = pickTitle(html, linkText || slugFromUrl(url));
    out.push({
      id: slugFromUrl(url),
      name,
      url,
      address: pickAddress(html),
      description: pickDescription(html),
      amenities: pickAmenities(html),
      image: pickImage(html, url),
    });
    // Small politeness pause between detail-page hits.
    await new Promise((res) => setTimeout(res, 200));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
