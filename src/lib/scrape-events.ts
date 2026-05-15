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

// Decode the common named entities plus the entire numeric range
// (&#8211; → "–", &#8217; → "’", etc.) — WordPress / The Events
// Calendar both emit these heavily in titles and descriptions.
export function decodeEntities(s: string): string {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; }
    });
}

export function stripHtml(s: string): string {
  return decodeEntities(
    (s || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ''),
  ).replace(/\s+/g, ' ').trim();
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
  return (j.events ?? [])
    // Drop the Livermore-location entries (titles suffixed with "- LVM").
    // We only care about the Martinez taproom; "- MTZ" entries pass.
    .filter((e) => !/[-–—]\s*LVM\s*$/i.test(e.title || ''))
    .map((e) => ({
    id: `delcielo-${e.id}`,
    source: 'delcielo',
    source_label: 'Del Cielo Brewing',
    title: cleanDelCieloTitle(e.title),
    // utc_start_date is naive UTC ("2026-05-16 01:30:00") — append Z.
    // Fallback to start_date (naive local) without Z.
    start_at: tsFromIso(toTribeIso(e.utc_start_date, true) ?? toTribeIso(e.start_date, false)),
    end_at:   tsFromIso(toTribeIso(e.utc_end_date,   true) ?? toTribeIso(e.end_date,   false)),
    venue: e.venue?.venue || 'Del Cielo Brewing',
    url: e.url,
    description: stripHtml(e.description || ''),
    image: e.image?.url,
  }));
}

// Strip the leading "Live Music // " (and slight variants) that Del
// Cielo prepends to most music events, and decode HTML entities the
// WP API doesn't pre-decode.
function cleanDelCieloTitle(raw: string): string {
  return decodeEntities(raw || '')
    .replace(/^\s*Live\s+Music\s*(?:\/\/|[-–—:])\s*/i, '')
    .trim();
}

// Tribe returns "YYYY-MM-DD HH:MM:SS" (space, no T, no zone). Normalise
// to ISO 8601 — if isUtc, mark as Z; otherwise leave naive (treated as
// local by Date.parse).
function toTribeIso(s: string | undefined, isUtc: boolean): string | null {
  if (!s) return null;
  const t = s.includes('T') ? s : s.replace(' ', 'T');
  return isUtc && !/[Zz]|[+-]\d\d:?\d\d$/.test(t) ? t + 'Z' : t;
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
  // Event-type Squarespace collections return entries in `upcoming` / `past`
  // (not `items` like regular collections). Try both shapes.
  let j: { items?: SqsItem[]; upcoming?: SqsItem[]; past?: SqsItem[] };
  try { j = JSON.parse(text); } catch { return []; }
  const base = new URL(url).origin;
  const items: SqsItem[] = j.upcoming ?? j.items ?? [];
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
    const name = decodeEntities(String(r.name ?? r.headline ?? 'Event')).trim();
    const start = r.startDate as string | undefined;
    const end   = r.endDate as string | undefined;
    const url   = String(r.url ?? fallbackUrl);
    const loc   = r.location as Record<string, unknown> | undefined;
    const venName = (loc?.name ? decodeEntities(String(loc.name)) : '') || venue;
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

// City of Martinez "Signature Events" is an accordion of 11 annual
// community events. Trying to parse it generically gave us a useless
// "MAY 2026" row from the page's calendar widget, so we hand-curate.
// For events with firm calendar dates (4th of July, Juneteenth, etc.)
// we project the next occurrence; the rest get start_at=null and a
// "(typically <season>)" hint in the description.

interface SigEvent { title: string; month?: number; day?: number; desc: string }

const MARTINEZ_SIGNATURE_EVENTS: SigEvent[] = [
  { title: 'Lunar New Year Celebration',                                desc: 'Annual community Lunar New Year celebration (typically late January / early February).' },
  { title: 'John Muir Birthday – Earth Day Celebration',  month: 4, day: 21, desc: 'Honoring naturalist John Muir and celebrating Earth Day in his hometown.' },
  { title: 'Bay Area Craft Beer Festival',                              desc: 'Craft beer festival featuring local Bay Area brewers (typically spring).' },
  { title: 'King of the County BBQ',                                    desc: 'BBQ competition crowning the best in Contra Costa County (typically summer).' },
  { title: 'Martinez Juneteenth',                          month: 6, day: 19, desc: 'Annual Juneteenth celebration.' },
  { title: '4th of July Parade & Fireworks',               month: 7, day: 4,  desc: 'Independence Day parade and fireworks display.' },
  { title: 'Beaver Festival',                                           desc: 'Celebrating Martinez’s famous beavers and creek wildlife (typically late summer).' },
  { title: 'Art in the Park',                                           desc: 'Local artists showcase work in Martinez parks (typically fall).' },
  { title: 'Martinez Pride',                               month: 6,           desc: 'Annual Pride celebration in Martinez (typically June).' },
  { title: 'Martini Shake-Off',                                         desc: 'Annual martini competition — Martinez is the claimed birthplace of the martini (typically fall).' },
  { title: 'Holiday Frolic',                               month: 12, day: 5, desc: 'Holiday season celebration with lights, music, and family activities.' },
];

async function scrapeCityOfMartinez(): Promise<LocalEvent[]> {
  const url = 'https://www.cityofmartinez.org/our-city/signature-city-events';
  return MARTINEZ_SIGNATURE_EVENTS.map((e) => ({
    id: `martinez-sig-${slugify(e.title)}`,
    source: 'martinez',
    source_label: 'City of Martinez',
    title: e.title,
    start_at: nextOccurrenceTs(e.month, e.day),
    end_at: null,
    venue: 'Martinez, CA',
    url,
    description: e.desc,
  }));
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Return the next occurrence of (month, day) at local noon, expressed
// as epoch seconds. If either is missing, return null.
function nextOccurrenceTs(month?: number, day?: number): number | null {
  if (!month) return null;
  const useDay = day ?? 15;
  const now = new Date();
  const y = now.getFullYear();
  const thisYear = ptEpoch(y, month - 1, useDay, 12, 0);
  if (thisYear * 1000 >= Date.now() - 24 * 3600 * 1000) return thisYear;
  return ptEpoch(y + 1, month - 1, useDay, 12, 0);
}
async function scrapeRoxxOnMain(): Promise<LocalEvent[]> {
  return scrapeGenericPage('https://www.roxxonmain.com/music-events', 'roxxonmain', 'Roxx on Main', 'Roxx on Main');
}
async function scrapeSlowHandBBQ(): Promise<LocalEvent[]> {
  return scrapeGenericPage('https://www.slowhandbbq.com/events', 'slowhand', 'Slow Hand BBQ', 'Slow Hand BBQ');
}

// ----- Luigi's Deli — recurring weekly residencies ---------------------
// These don't need scraping. The slots are the same every week; we
// just need to project the next N weeks of Monday and Tuesday dates
// and emit LocalEvent rows with stable per-date ids.

const LUIGI_WEEKS_AHEAD = 8;
const LUIGI_VENUE = "Luigi's Deli";

async function luigiRecurring(): Promise<LocalEvent[]> {
  const out: LocalEvent[] = [];
  // Iterate from today, walk forward week-by-week. Pacific time is what
  // people care about — use the local PT offset by computing from a
  // formatted "today" string in America/Los_Angeles.
  const todayPT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  for (let w = 0; w < LUIGI_WEEKS_AHEAD; w++) {
    const monday  = nextWeekday(todayPT, 1, w);          // Mondays
    const tuesday = nextWeekday(todayPT, 2, w);          // Tuesdays
    out.push(makeLuigiEvent(monday, 18, 0, {
      id: `luigi-mon-${ymd(monday)}`,
      title: 'Open Mic Night',
      description: 'Hosted by Roy Jeans with sound by Jay Olson. Sign-ups 5:30 PM, music starts 6:00 PM.',
      url: 'https://luigismartinezmusic.weebly.com/monday-open-mic.html',
    }));
    out.push(makeLuigiEvent(tuesday, 18, 30, {
      id: `luigi-tue-${ymd(tuesday)}`,
      title: 'Nob Hill Billies',
      description: 'Live music with the Nob Hill Billies, 6:30–8:30 PM.',
      url: 'https://luigismartinezmusic.weebly.com/tuesday---nob-hill-billies.html',
    }, 20, 30),
    );
  }
  return out;
}

function makeLuigiEvent(
  date: Date,
  hour: number, minute: number,
  extras: { id: string; title: string; description: string; url: string },
  endHour?: number, endMinute?: number,
): LocalEvent {
  // Build the event start moment in Pacific time → epoch sec.
  const start = ptEpoch(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  const end   = endHour != null
    ? ptEpoch(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute ?? 0)
    : null;
  return {
    id: extras.id,
    source: 'luigi',
    source_label: LUIGI_VENUE,
    title: extras.title,
    start_at: start,
    end_at: end,
    venue: LUIGI_VENUE,
    url: extras.url,
    description: extras.description,
  };
}

// Returns Pacific-time epoch seconds for the given local date/time.
// Approximates PDT (UTC-7) most of the year; off by 1h during PST
// (Nov–Mar). Good enough for display.
function ptEpoch(y: number, m: number, d: number, h: number, mn: number): number {
  // Determine whether the date falls in DST (rough US rule: 2nd Sun Mar
  // through 1st Sun Nov). For accuracy across the year, use Intl to
  // ask "what's UTC offset at America/Los_Angeles for this date?"
  const test = new Date(Date.UTC(y, m, d, h, mn));
  const offsetMin = ptOffsetMinutes(test);
  return Math.floor((Date.UTC(y, m, d, h, mn) - offsetMin * 60_000) / 1000);
}
function ptOffsetMinutes(d: Date): number {
  // Look up the formatted offset string like "GMT-7" or "GMT-8".
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset',
  }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-8';
  const m = s.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!m) return -8 * 60;
  return (Number(m[1]) * 60) - (m[1].startsWith('-') ? (Number(m[2] ?? 0)) : -Number(m[2] ?? 0));
}

// Returns a Date at midnight on the next occurrence of `weekday`
// (0=Sun..6=Sat), offset by `weekOffset` additional weeks.
function nextWeekday(from: Date, weekday: number, weekOffset: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = ((weekday - d.getDay()) + 7) % 7;
  d.setDate(d.getDate() + diff + weekOffset * 7);
  return d;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ----- public entry ----------------------------------------------------

const SCRAPERS: Array<[string, () => Promise<LocalEvent[]>]> = [
  ['delcielo',       scrapeDelCielo],
  ['fivesuns_music', scrapeFiveSunsMusic],
  ['fivesuns_food',  scrapeFiveSunsFood],
  ['martinez',       scrapeCityOfMartinez],
  ['roxxonmain',     scrapeRoxxOnMain],
  ['slowhand',       scrapeSlowHandBBQ],
  ['luigi',          luigiRecurring],
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
