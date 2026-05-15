// Local-venue event scrapers. Each function returns a normalised
// LocalEvent[] for one source; failures are logged and swallowed so
// one broken site can't take the whole job down.
//
// Strategy by platform:
//   - WordPress + The Events Calendar  → wp-json/tribe/events/v1/events
//   - Squarespace                       → ?format=json on the page
//   - Webflow / static HTML             → fetch + regex
//
// Everything fetches with a real-browser User-Agent because several of
// the sites 403 on bot UAs.

import type { LocalEvent } from './types';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ----- helpers ---------------------------------------------------------

export function stripHtml(s: string): string {
  return (s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tsFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// "May 24" / "May 24, 2026" / "5/24" / "5/24/2026" → epoch sec (assumes
// dates within ~1 year of now, picks the nearest future occurrence).
function tsFromLooseDate(s: string): number | null {
  const now = new Date();
  const yr = now.getFullYear();

  const m1 = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)?)?/i);
  if (m1) {
    const month = monthIdx(m1[1]);
    const day   = Number(m1[2]);
    const year  = m1[3] ? Number(m1[3]) : yr;
    let hour = m1[4] ? Number(m1[4]) : 19;   // default 7pm for music events
    const min  = m1[5] ? Number(m1[5]) : 0;
    const ap   = (m1[6] ?? '').toLowerCase();
    if (ap.startsWith('p') && hour < 12) hour += 12;
    if (ap.startsWith('a') && hour === 12) hour = 0;
    return rollForward(year, month, day, hour, min, m1[3] != null);
  }

  const m2 = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m2) {
    const month = Number(m2[1]) - 1;
    const day   = Number(m2[2]);
    let year    = m2[3] ? Number(m2[3]) : yr;
    if (year < 100) year += 2000;
    return rollForward(year, month, day, 19, 0, m2[3] != null);
  }

  return null;
}

function monthIdx(s: string): number {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(s.slice(0, 3).toLowerCase());
}

function rollForward(y: number, m: number, d: number, h: number, mn: number, yearExplicit: boolean): number {
  // No timezone given — interpret as local Pacific time (UTC-8/-7).
  // We approximate by treating as UTC-7 (Pacific roughly). Off by 1h
  // either side of DST but acceptable for display.
  let ts = Math.floor(Date.UTC(y, m, d, h + 7, mn) / 1000);
  if (!yearExplicit) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (ts < nowSec - 7 * 24 * 3600) ts = Math.floor(Date.UTC(y + 1, m, d, h + 7, mn) / 1000);
  }
  return ts;
}

async function safeFetch(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const r = await fetch(url, { ...init, headers: { ...COMMON_HEADERS, ...(init?.headers || {}) }, cache: 'no-store' });
    if (!r.ok) {
      console.warn(`[scrape] ${url} → ${r.status}`);
      return null;
    }
    return await r.text();
  } catch (e) {
    console.warn(`[scrape] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ----- Del Cielo Brewing (WordPress + Events Calendar) -----------------

interface TribeEvent {
  id: number;
  title: string;
  url: string;
  description?: string;
  start_date?: string;          // "2026-05-15 18:30:00"
  end_date?: string;
  utc_start_date?: string;      // "2026-05-16 01:30:00"
  utc_end_date?: string;
  venue?: { venue?: string };
  image?: { url?: string };
}

async function scrapeDelCielo(): Promise<LocalEvent[]> {
  const text = await safeFetch('https://delcielobrewing.com/wp-json/tribe/events/v1/events?per_page=50');
  if (!text) return [];
  let j: { events?: TribeEvent[] };
  try { j = JSON.parse(text); } catch { return []; }
  return (j.events ?? []).map((e) => ({
    id: `delcielo-${e.id}`,
    source: 'delcielo',
    source_label: 'Del Cielo Brewing',
    title: e.title,
    start_at: tsFromIso(e.utc_start_date ? e.utc_start_date + 'Z' : e.start_date),
    end_at:   tsFromIso(e.utc_end_date   ? e.utc_end_date   + 'Z' : e.end_date),
    venue: e.venue?.venue || 'Del Cielo Brewing',
    url: e.url,
    description: stripHtml(e.description || ''),
    image: e.image?.url,
  }));
}

// ----- Five Suns Brewing (Squarespace) ---------------------------------

interface SqsItem {
  id: string;
  title: string;
  fullUrl?: string;
  startDate?: number;           // milliseconds
  endDate?: number;
  excerpt?: string;
  body?: string;
  assetUrl?: string;
}

async function scrapeSquarespaceCollection(url: string, source: string, sourceLabel: string, venue: string): Promise<LocalEvent[]> {
  const text = await safeFetch(url + (url.includes('?') ? '&' : '?') + 'format=json');
  if (!text) return [];
  let j: { items?: SqsItem[]; collection?: { fullUrl?: string } };
  try { j = JSON.parse(text); } catch { return []; }
  const base = new URL(url).origin;
  const items = j.items ?? [];
  return items.map((it) => ({
    id: `${source}-${it.id}`,
    source,
    source_label: sourceLabel,
    title: it.title,
    start_at: it.startDate ? Math.floor(it.startDate / 1000) : null,
    end_at:   it.endDate   ? Math.floor(it.endDate   / 1000) : null,
    venue,
    url: it.fullUrl ? `${base}${it.fullUrl}` : url,
    description: stripHtml(it.excerpt || it.body || ''),
    image: it.assetUrl,
  }));
}

async function scrapeFiveSunsMusic(): Promise<LocalEvent[]> {
  return scrapeSquarespaceCollection('https://www.fivesunsbrewing.com/music-events', 'fivesuns_music', 'Five Suns Brewing', 'Five Suns Brewing');
}
async function scrapeFiveSunsFood(): Promise<LocalEvent[]> {
  return scrapeSquarespaceCollection('https://www.fivesunsbrewing.com/food-trucks', 'fivesuns_food', 'Five Suns – Food Trucks', 'Five Suns Brewing');
}

// ----- Generic HTML scrape (City of Martinez / Roxx / Slow Hand) -------
// We pull JSON-LD <script type="application/ld+json"> Event blocks first
// (lots of Webflow / WP / Squarespace exports embed these), then fall
// back to a date-pattern crawl over the cleaned-up text.

function extractJsonLdEvents(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let payload: unknown;
    try { payload = JSON.parse(m[1].trim()); } catch { continue; }
    const arr = Array.isArray(payload) ? payload : [payload];
    for (const node of arr) {
      if (!node || typeof node !== 'object') continue;
      const rec = node as Record<string, unknown>;
      const t = (rec['@type'] || rec.type) as string | string[] | undefined;
      const isEvent = (typeof t === 'string' && /event/i.test(t)) ||
                      (Array.isArray(t) && t.some((x) => /event/i.test(String(x))));
      if (isEvent) out.push(rec);
      // ItemList of events
      const items = rec['itemListElement'];
      if (Array.isArray(items)) {
        for (const li of items) {
          if (!li || typeof li !== 'object') continue;
          const item = (li as Record<string, unknown>).item;
          if (item && typeof item === 'object') {
            const r = item as Record<string, unknown>;
            const tt = (r['@type'] || r.type) as string | undefined;
            if (typeof tt === 'string' && /event/i.test(tt)) out.push(r);
          }
        }
      }
    }
  }
  return out;
}

function jsonLdToEvents(rows: Array<Record<string, unknown>>, source: string, sourceLabel: string, venue: string, fallbackUrl: string): LocalEvent[] {
  return rows.map((r, i) => {
    const name = String(r.name ?? r.headline ?? 'Event').trim();
    const start = r.startDate as string | undefined;
    const end   = r.endDate as string | undefined;
    const url   = String(r.url ?? fallbackUrl);
    const loc   = r.location as Record<string, unknown> | undefined;
    const venName = (loc?.name ? String(loc.name) : '') || venue;
    const desc  = stripHtml(String(r.description ?? ''));
    const img   = typeof r.image === 'string'
      ? r.image
      : (r.image && typeof r.image === 'object' && 'url' in (r.image as object) ? String((r.image as Record<string, unknown>).url) : undefined);
    return {
      id: `${source}-jsonld-${i}-${(start ?? name).slice(0, 24)}`,
      source,
      source_label: sourceLabel,
      title: name,
      start_at: tsFromIso(start),
      end_at:   tsFromIso(end),
      venue: venName,
      url,
      description: desc,
      image: img,
    };
  });
}

// Coarse fallback when JSON-LD is absent — scrape the body text for
// month/day patterns and treat the nearest preceding 30 chars (or a
// heading) as the title. Keeps things alive on pages that change
// layout, at the cost of occasional garbage rows.
function fallbackDateScan(html: string, source: string, sourceLabel: string, venue: string, url: string): LocalEvent[] {
  // Strip scripts/styles, replace <br>/<p>/<li>/<h*> with newlines, then
  // strip remaining tags. Now we have a roughly linearised text doc.
  const linearised = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ');
  const text = linearised.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const events: LocalEvent[] = [];
  const seen = new Set<string>();
  // Walk lines, group date-mentioning lines with the previous non-trivial line.
  for (let i = 0; i < text.length; i++) {
    const ts = tsFromLooseDate(text[i]);
    if (!ts) continue;
    // Search up to 3 lines back for a plausible title.
    let title = '';
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const candidate = text[j];
      if (candidate && candidate.length >= 4 && candidate.length <= 120 && !/^\d/.test(candidate)) {
        title = candidate;
        break;
      }
    }
    if (!title) title = text[i].slice(0, 100);
    const key = `${title}|${ts}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      id: `${source}-fb-${events.length}`,
      source,
      source_label: sourceLabel,
      title,
      start_at: ts,
      venue,
      url,
    });
    if (events.length >= 12) break;
  }
  return events;
}

async function scrapeGenericPage(url: string, source: string, sourceLabel: string, venue: string): Promise<LocalEvent[]> {
  const html = await safeFetch(url);
  if (!html) return [];
  const jsonLd = extractJsonLdEvents(html);
  if (jsonLd.length) return jsonLdToEvents(jsonLd, source, sourceLabel, venue, url);
  return fallbackDateScan(html, source, sourceLabel, venue, url);
}

async function scrapeCityOfMartinez(): Promise<LocalEvent[]> {
  return scrapeGenericPage('https://www.cityofmartinez.org/our-city/signature-city-events', 'martinez', 'City of Martinez', 'Martinez, CA');
}
async function scrapeRoxxOnMain(): Promise<LocalEvent[]> {
  return scrapeGenericPage('https://www.roxxonmain.com/music-events', 'roxxonmain', 'Roxx on Main', 'Roxx on Main');
}
async function scrapeSlowHandBBQ(): Promise<LocalEvent[]> {
  return scrapeGenericPage('https://www.slowhandbbq.com/events', 'slowhand', 'Slow Hand BBQ', 'Slow Hand BBQ');
}

// ----- public entry ----------------------------------------------------

const SCRAPERS: Array<[string, () => Promise<LocalEvent[]>]> = [
  ['delcielo',       scrapeDelCielo],
  ['fivesuns_music', scrapeFiveSunsMusic],
  ['fivesuns_food',  scrapeFiveSunsFood],
  ['martinez',       scrapeCityOfMartinez],
  ['roxxonmain',     scrapeRoxxOnMain],
  ['slowhand',       scrapeSlowHandBBQ],
];

export async function scrapeAllLocalEvents(): Promise<LocalEvent[]> {
  const results = await Promise.all(
    SCRAPERS.map(async ([name, fn]) => {
      try { return await fn(); }
      catch (e) {
        console.warn(`[scrape] ${name} threw:`, e instanceof Error ? e.message : e);
        return [];
      }
    }),
  );
  const flat = results.flat();
  // Drop past events (>6h ago), dedupe by id, sort ascending by start.
  const cutoff = Math.floor(Date.now() / 1000) - 6 * 3600;
  const byId = new Map<string, LocalEvent>();
  for (const e of flat) {
    if (e.start_at != null && e.start_at < cutoff) continue;
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => (a.start_at ?? Infinity) - (b.start_at ?? Infinity));
}
