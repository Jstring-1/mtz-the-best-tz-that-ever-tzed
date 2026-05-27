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
    // Drop Livermore-location entries. The LVM marker shows up either in
    // the title ("… - LVM") or the venue name ("Del Cielo Brewery – LVM"
    // / "… Livermore"). We only want the Martinez taproom.
    .filter((e) => {
      const hay = `${e.title || ''} || ${e.venue?.venue || ''}`;
      if (/\blivermore\b/i.test(hay)) return false;
      if (/[-–—]\s*LVM\b/i.test(hay)) return false;
      if (/\bLVM\b/.test(hay) && !/\bMTZ\b/i.test(hay)) return false;
      return true;
    })
    .map((e) => ({
    id: `delcielo-${e.id}`,
    source: 'delcielo',
    source_label: 'Del Cielo Brewing',
    title: cleanDelCieloTitle(e.title),
    // utc_start_date is naive UTC ("2026-05-16 01:30:00") — append Z.
    // Fallback to start_date (naive local) without Z.
    start_at: tsFromIso(toTribeIso(e.utc_start_date, true) ?? toTribeIso(e.start_date, false)),
    end_at:   tsFromIso(toTribeIso(e.utc_end_date,   true) ?? toTribeIso(e.end_date,   false)),
    venue: decodeEntities(e.venue?.venue || 'Del Cielo Brewing'),
    url: e.url,
    description: stripHtml(e.description || ''),
    image: e.image?.url,
  }));
}

// Clean a Del Cielo title:
//   1. Decode HTML entities the WP API doesn't pre-decode.
//   2. Strip the leading "Live Music // " (and slight variants).
//   3. Strip the trailing location tag — "– MTZ", "– LVM",
//      "– MTZ & LVM", "– LVM & MTZ" (and the full-word variants).
//      Events that are pure "– LVM" never reach this fn (they're
//      filtered out earlier); this just cleans cross-location titles
//      and the standalone "– MTZ" suffix.
function cleanDelCieloTitle(raw: string): string {
  return decodeEntities(raw || '')
    .replace(/^\s*Live\s+Music\s*(?:\/\/|[-–—:])\s*/i, '')
    .replace(
      /\s*[-–—]\s*(?:MTZ|LVM|Martinez|Livermore)(?:\s*&\s*(?:MTZ|LVM|Martinez|Livermore))?\s*$/i,
      '',
    )
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
  // Bay Area Craft Beer Fest / King of the County BBQ / Martini Shake-Off
  // are now scraped with real dates (see scrapeSingleEvent sources).
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
// Roxx on Main embeds its music calendar via an Elfsight Event Calendar
// widget — the page HTML is just a shell, so the generic scraper finds
// nothing. Elfsight's public "boot" endpoint returns the full widget
// state as JSON; the events live at
//   data.widgets[<widgetId>].data.settings.events[]
const ROXX_WIDGET_ID = '5459f63e-6530-4372-9d5a-5758c19be835';

interface ElfsightEvent {
  id: string;
  name?: string;
  start?: { date?: string; time?: string };
  end?: { date?: string; time?: string };
  description?: string;
  image?: { url?: string };
  buttonLink?: { value?: string };
  repeatPeriod?: string;
}

function elfDateToTs(date?: string, time?: string, defHour = 19): number | null {
  const m = (date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [h, mn] = (time ?? '').split(':').map((n) => Number(n));
  return ptEpoch(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number.isFinite(h) ? h : defHour,
    Number.isFinite(mn) ? mn : 0,
  );
}

async function scrapeRoxxOnMain(): Promise<LocalEvent[]> {
  const pageUrl = 'https://www.roxxonmain.com/music-events';
  const text = await safeFetch(`https://core.service.elfsight.com/p/boot/?w=${ROXX_WIDGET_ID}`);
  if (!text) return [];
  let j: { data?: { widgets?: Record<string, { data?: { settings?: { events?: ElfsightEvent[] } } }> } };
  try { j = JSON.parse(text); } catch { return []; }
  const events = j.data?.widgets?.[ROXX_WIDGET_ID]?.data?.settings?.events ?? [];
  const out: LocalEvent[] = [];
  for (const e of events) {
    const start_at = elfDateToTs(e.start?.date, e.start?.time, 19);
    if (start_at == null) continue;
    const title = (decodeEntities(e.name || 'Event')
      .replace(/^\s*ROXX\s+ON\s+MAIN\s+PRES[A-Z]*\s*:?\s*/i, '')
      .trim()) || 'Event';
    out.push({
      id: `roxxonmain-${e.id}`,
      source: 'roxxonmain',
      source_label: 'Roxx on Main',
      title,
      start_at,
      end_at: elfDateToTs(e.end?.date, e.end?.time, 22),
      venue: 'Roxx on Main',
      url: e.buttonLink?.value || pageUrl,
      description: stripHtml(e.description || ''),
      image: e.image?.url,
    });
  }
  return out;
}
// Slow Hand BBQ's /events page is a Popmenu shell that embeds Styled
// Calendar (embed.styledcalendar.com) — the static HTML has nothing.
// Their public events API returns
//   { compressedEventsAndIds: [{ compressedEvents, sourceCalendarGoogleId }] }
// where compressedEvents is an lz-string `compressToUTF16` payload of a
// JSON array of FullCalendar-shaped events.
const SLOWHAND_STYLED_CAL_ID = 'DjQzeHFtBd0HOC5xbJxP';
const SLOWHAND_PAGE = 'https://www.slowhandbbq.com/events';

interface SlowHandRaw {
  id: string;
  title?: string;
  start?: string;
  end?: string;
  extendedProps?: { location?: string; description?: string };
}

async function scrapeSlowHandBBQ(): Promise<LocalEvent[]> {
  const url = `https://embed.styledcalendar.com/api/get-styled-calendar-events-data/?styledCalendarId=${SLOWHAND_STYLED_CAL_ID}`;
  const text = await safeFetch(url);
  if (!text) return [];
  let j: { compressedEventsAndIds?: Array<{ compressedEvents?: string }> };
  try { j = JSON.parse(text); } catch { return []; }
  const groups = j.compressedEventsAndIds ?? [];
  if (!groups.length) return [];

  // Dynamic import keeps the lz-string dep out of any non-cron bundle.
  const LZ = (await import('lz-string')).default;

  const all: SlowHandRaw[] = [];
  for (const g of groups) {
    if (!g.compressedEvents) continue;
    const raw = LZ.decompressFromUTF16(g.compressedEvents);
    if (!raw) continue;
    try {
      const arr = JSON.parse(raw) as SlowHandRaw[];
      if (Array.isArray(arr)) all.push(...arr);
    } catch { /* skip */ }
  }

  return all
    // Calendar covers both Slow Hand locations; keep Martinez and skip
    // Pleasant Hill (untagged ones — title/loc undefined — are kept).
    .filter((e) => {
      const hay = `${e.title ?? ''} ${e.extendedProps?.location ?? ''}`;
      return !/\bpleasant\s*hill\b/i.test(hay);
    })
    .map((e) => {
      const title = (e.title ?? 'Event')
        .replace(/\s*@\s*Slow\s*Hand(?:[,\s]+(?:Martinez|MTZ))?\s*$/i, '')
        .trim();
      return {
        id: `slowhand-${e.id}`,
        source: 'slowhand',
        source_label: 'Slow Hand BBQ',
        title: title || 'Event',
        start_at: tsFromIso(e.start),
        end_at:   tsFromIso(e.end),
        venue: 'Slow Hand BBQ',
        url: SLOWHAND_PAGE,
        description: stripHtml(e.extendedProps?.description ?? ''),
      };
    });
}

// ----- Single annual-event landing pages -------------------------------
// Each of these sites promotes one yearly festival. We just scrape the
// first real date off the page so it auto-rolls each year, and emit a
// single LocalEvent. Fails open (skipped) if no date is found.
async function scrapeSingleEvent(
  url: string, source: string, label: string, title: string, venue: string,
): Promise<LocalEvent[]> {
  const html = await safeFetch(url);
  if (!html) return [];
  const text = stripHtml(html);
  const start_at = tsFromLooseDate(text);
  if (start_at == null) return [];
  return [{
    id: `${source}-${new Date(start_at * 1000).getUTCFullYear()}`,
    source,
    source_label: label,
    title,
    start_at,
    end_at: null,
    venue,
    url,
  }];
}

const scrapeCraftBeerFest = () => scrapeSingleEvent(
  'https://downtownmartinez.org/bay-area-craft-beer-fest',
  'baycraftbeer', 'Bay Area Craft Beer Fest',
  'Bay Area Craft Beer Festival', 'Downtown Martinez',
);
const scrapeCountyBBQ = () => scrapeSingleEvent(
  'https://countybbq.com/',
  'countybbq', 'King of the County BBQ',
  'King of the County BBQ Festival', 'Martinez, CA',
);
const scrapeMartinezMartini = () => scrapeSingleEvent(
  'https://martinezmartini.com/',
  'martinezmartini', 'Martinez Martini',
  'Martinez Martini Shake-Off', 'Martinez, CA',
);

// ----- Contra Costa County RSS calendar --------------------------------
// CivicEngage / Granicus-style RSS feed of county-wide municipal events.
// pubDate is when the item was published (often the same day), so we
// look in the title and description for the actual event date.

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

function extractRssTag(body: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = body.match(re);
  if (!m) return undefined;
  // Strip CDATA wrapping if present.
  return m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
}

function parseRssItems(xml: string): RssItem[] {
  const out: RssItem[] = [];
  // RSS 2.0 <item>
  const rssRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = rssRe.exec(xml))) {
    const body = m[1];
    out.push({
      title:       extractRssTag(body, 'title'),
      link:        extractRssTag(body, 'link'),
      description: extractRssTag(body, 'description'),
      pubDate:     extractRssTag(body, 'pubDate'),
      guid:        extractRssTag(body, 'guid'),
    });
  }
  // Atom <entry> fallback — some calendar feeds use this format.
  if (out.length === 0) {
    const atomRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((m = atomRe.exec(xml))) {
      const body = m[1];
      const linkHrefMatch = body.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
      out.push({
        title:       extractRssTag(body, 'title'),
        link:        linkHrefMatch?.[1] ?? extractRssTag(body, 'link'),
        description: extractRssTag(body, 'summary') ?? extractRssTag(body, 'content'),
        pubDate:     extractRssTag(body, 'published') ?? extractRssTag(body, 'updated'),
        guid:        extractRssTag(body, 'id'),
      });
    }
  }
  return out;
}

function slugForId(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 80);
}

async function scrapeContraCosta(): Promise<LocalEvent[]> {
  const url = 'https://www.contracosta.ca.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml';
  const xml = await safeFetch(url);
  if (!xml) { console.warn('[contracosta] fetch returned null'); return []; }
  const items = parseRssItems(xml);
  if (items.length === 0) {
    console.log(`[contracosta] bytes=${xml.length}, items=0, head: ${xml.slice(0, 200).replace(/\s+/g, ' ')}`);
  } else if (process.env.MTZ_DEBUG === '1') {
    console.log(`[contracosta] bytes=${xml.length}, items=${items.length}`);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  return items.map((it, i) => {
    const title = decodeEntities(it.title || 'Event');
    const description = stripHtml(it.description || '');
    // pubDate is when the item was published (almost always the past),
    // NOT the event date. Prefer dates parsed out of the title or
    // description text; fall back to pubDate only if it's actually in
    // the future. Otherwise leave start_at null — the item still shows
    // in the list under TBA.
    const fromTitle = tsFromLooseDate(title);
    const fromDesc  = tsFromLooseDate(description);
    const fromPub   = it.pubDate ? tsFromIso(it.pubDate) : null;
    const futureish = (t: number | null) => (t != null && t >= nowSec - 6 * 3600 ? t : null);
    const start_at = futureish(fromTitle)
      ?? futureish(fromDesc)
      ?? futureish(fromPub)
      ?? null;
    const idSeed = it.guid || it.link || `${title}-${start_at ?? i}`;
    return {
      id: `contracosta-${slugForId(idSeed)}`,
      source: 'contracosta',
      source_label: 'Contra Costa County',
      title,
      start_at,
      venue: 'Contra Costa County',
      url: it.link || url,
      description,
    };
  });
}

// ----- Luigi's Deli — recurring weekly residencies ---------------------
// These don't need scraping. The slots are the same every week; we
// just need to project the next N weeks of Monday and Tuesday dates
// and emit LocalEvent rows with stable per-date ids.

const LUIGI_WEEKS_AHEAD = 8;
const LUIGI_VENUE = "Luigi's Deli & Market";

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

// ----- Martinez Farmers Market — recurring weekly ----------------------
// Year-round Sunday market on Main St, 9 AM–1 PM. Project the next N
// Sundays (same as the Luigi recurring approach).
const FARMERS_WEEKS_AHEAD = 8;
async function farmersMarketRecurring(): Promise<LocalEvent[]> {
  const out: LocalEvent[] = [];
  const todayPT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  for (let w = 0; w < FARMERS_WEEKS_AHEAD; w++) {
    const sun = nextWeekday(todayPT, 0, w);   // Sundays
    out.push({
      id: `farmers-${ymd(sun)}`,
      source: 'farmers',
      source_label: 'Martinez Farmers Market',
      title: 'Martinez Farmers Market',
      start_at: ptEpoch(sun.getFullYear(), sun.getMonth(), sun.getDate(), 9, 0),
      end_at:   ptEpoch(sun.getFullYear(), sun.getMonth(), sun.getDate(), 13, 0),
      venue: 'Main Street, Martinez, CA',
      url: 'https://www.pcfma.org/martinez',
      description: 'Year-round Sunday farmers market on Main Street, 9 AM – 1 PM.',
    });
  }
  return out;
}

// ----- Martinez Chamber of Commerce calendar (ChamberMaster) -----------
// ASP.NET WebForms calendar grid. Each event start day is a
// <div id="ccaId_divEvtInfo<MMDD>_<evtid>" class="… ccaFromDate …">
// block containing the title link + a time; the year comes from the
// adjacent btnEvtDate<YYYYMMDD> day buttons. Continuation days
// (ccaContinuedDate) are skipped so multi-day events aren't duplicated.
const CHAMBER_URL = 'https://cca.martinezchamber.com/EvtListingMainSearch.aspx?dbid2=CAMART&class=B';

function parseClock(s: string): { h: number; m: number } | null {
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]/);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/p/i.test(m[3])) h += 12;
  return { h, m: m[2] ? Number(m[2]) : 0 };
}

async function scrapeMartinezChamber(): Promise<LocalEvent[]> {
  const html = await safeFetch(CHAMBER_URL);
  if (!html) return [];
  const dateMap = new Map<string, string>();   // "MMDD" -> "YYYYMMDD"
  const dRe = /btnEvtDate(\d{4})(\d{2})(\d{2})/g;
  let dm: RegExpExecArray | null;
  while ((dm = dRe.exec(html))) dateMap.set(dm[2] + dm[3], dm[1] + dm[2] + dm[3]);

  const out: LocalEvent[] = [];
  const seen = new Set<string>();
  const parts = html.split(/<div id="ccaId_divEvtInfo(\d{2})(\d{2})_(\d+)"/);
  for (let i = 1; i + 3 < parts.length; i += 4) {
    const mm = parts[i], dd = parts[i + 1], evtid = parts[i + 2];
    const block = parts[i + 3].slice(0, 1500);
    if (!/^[^>]*ccaFromDate/.test(block)) continue;   // start day only
    if (seen.has(evtid)) continue;
    const a = block.match(/ccaEvtName[^>]*>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const ymdStr = dateMap.get(mm + dd);
    if (!ymdStr) continue;
    const y = Number(ymdStr.slice(0, 4));
    const mo = Number(ymdStr.slice(4, 6)) - 1;
    const da = Number(ymdStr.slice(6, 8));
    const tm = block.match(/ccaEvtTime[^>]*>([^<]*)</i);
    const clock = parseClock(tm ? tm[1] : '');
    const href = a[1].replace(/&amp;/g, '&');
    const url = /^https?:/i.test(href)
      ? href
      : `https://cca.martinezchamber.com/${href.replace(/^\//, '')}`;
    const title = stripHtml(a[2]);
    if (!title) continue;
    seen.add(evtid);
    out.push({
      id: `martinezchamber-${evtid}`,
      source: 'martinezchamber',
      source_label: 'Martinez Chamber',
      title,
      start_at: ptEpoch(y, mo, da, clock?.h ?? 9, clock?.m ?? 0),
      end_at: null,
      venue: 'Martinez, CA',
      url,
    });
  }
  return out;
}

// ----- Contra Costa County Legistar — Board / committee meetings -------
//
// contra-costa.legistar.com/Calendar.aspx is the authoritative source
// for Contra Costa County Board of Supervisors, committee, and advisory
// body meetings. Legistar's public iCal/RSS endpoints are 410'd or
// require auth, so we scrape the HTML calendar page. Each meeting row
// is a `<tr class="rgRow|rgAltRow">` with stable ASP.NET-generated cell
// IDs that survive minor template changes.

async function scrapeContraCostaLegistar(): Promise<LocalEvent[]> {
  const url = 'https://contra-costa.legistar.com/Calendar.aspx';
  const html = await safeFetch(url);
  if (!html) { console.warn('[cclegistar] fetch returned null'); return []; }

  // Split out each meeting row. Both grids on the page (upcoming +
  // calendar) share the same rgRow/rgAltRow structure.
  const rowRe = /<tr\s+class="(?:rgRow|rgAltRow)"[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRe) ?? [];
  if (rows.length === 0) {
    console.warn('[cclegistar] no rows matched');
    return [];
  }

  const out: LocalEvent[] = [];
  for (const row of rows) {
    const event = parseLegistarRow(row);
    if (event) out.push(event);
  }
  if (process.env.MTZ_DEBUG === '1') {
    console.log(`[cclegistar] rows=${rows.length}, parsed=${out.length}`);
  }
  return out;
}

function parseLegistarRow(row: string): LocalEvent | null {
  // Body name from `<a id="...hypBody">TEXT</a>`
  const bodyM = row.match(/<a\s+id="[^"]*hypBody"[^>]*>([\s\S]*?)<\/a>/i);
  if (!bodyM) return null;
  const body = decodeEntities(stripHtml(bodyM[1])).trim();
  if (!body) return null;

  // Date from `<td class="rgSorted">M/D/YYYY</td>`
  const dateM = row.match(/<td\s+class="rgSorted">\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<\/td>/i);
  if (!dateM) return null;

  // Time from `<span id="...lblTime">10:00 AM</span>`
  const timeM = row.match(/<span\s+id="[^"]*lblTime"[^>]*>\s*([0-9:]+\s*(?:AM|PM))\s*<\/span>/i);
  const startEpoch = pacificDateTimeToEpoch(dateM[1], timeM ? timeM[1] : '12:00 PM');
  if (startEpoch == null) return null;

  // Meeting detail URL (when public — otherwise the link has class
  // `meeting_NotViewable` and no href).
  const detailM = row.match(/<a\s+id="[^"]*hypMeetingDetail"[^>]*\s+href="([^"]+)"/i);
  // Agenda PDF URL (when available — otherwise class `meetingAgendaNotAvailbleLink`).
  const agendaM = row.match(/<a\s+id="[^"]*hypAgenda"[^>]*\s+href="([^"]+)"/i);
  // Extract meeting ID from any of the available URLs for a stable row id.
  const idFromUrl = [detailM?.[1], agendaM?.[1]]
    .map((u) => u && /ID=(\d+)/.exec(u)?.[1])
    .find(Boolean);

  // Location cell — anchored on the END of the time cell so we don't
  // accidentally capture the iCal-export cell that precedes it. Pull
  // everything between `</span></td>` (close of time) and the meeting-
  // detail link cell, then clean up the embedded Zoom/dial-in HTML.
  const locM = row.match(/<span\s+id="[^"]*lblTime"[^>]*>[^<]*<\/span>\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>\s*<a\s+id="[^"]*hypMeetingDetail"/i);
  const locationRaw = locM ? locM[1] : '';
  const venue = cleanLegistarLocation(locationRaw);

  // Build the meeting detail URL (relative → absolute).
  const detailHref = detailM?.[1] ?? '';
  const fullUrl = detailHref
    ? `https://contra-costa.legistar.com/${detailHref.replace(/&amp;/g, '&')}`
    : 'https://contra-costa.legistar.com/Calendar.aspx';
  const agendaUrl = agendaM?.[1]
    ? `https://contra-costa.legistar.com/${agendaM[1].replace(/&amp;/g, '&')}`
    : null;

  const idSeed = idFromUrl ?? slugForId(`${body}-${dateM[1]}-${timeM?.[1] ?? ''}`);
  const description = agendaUrl
    ? `Agenda available — ${agendaUrl}`
    : 'No agenda posted yet.';

  return {
    id: `cclegistar-${idSeed}`,
    source: 'cclegistar',
    source_label: 'Contra Costa County (Legistar)',
    title: body,
    start_at: startEpoch,
    venue,
    url: fullUrl,
    description,
  };
}

// Strip Legistar's location cell down to a readable single line — drop
// embedded Zoom URLs, "Dial: 855-…" lines, and the trailing italic
// notes, but keep the in-person address.
function cleanLegistarLocation(raw: string): string {
  let s = stripHtml(raw);
  s = decodeEntities(s);
  // Cut at the first occurrence of any common phone/zoom marker.
  // No LEADING `\b` on Zoom variants — Legistar often glues "Zoom" onto
  // an address (e.g. "…CA 94513Zoom link:") with no whitespace, so a
  // leading word-boundary anchor never fires. Trailing `\b` is fine.
  const cutMarkers = [
    /Zoom\b/i,
    /Dial[:]?\s*1[-.\s]?\d/i,
    /\bMeeting ID\b/i,
    /\bcall in\b/i,
    /https?:\/\//i,
  ];
  let cutAt = s.length;
  for (const m of cutMarkers) {
    const found = s.search(m);
    if (found >= 0 && found < cutAt) cutAt = found;
  }
  s = s.slice(0, cutAt).replace(/[\s|]+$/, '').trim();
  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ');
  return s || 'Contra Costa County';
}

// Combine a Pacific-local date + time into a UTC unix-epoch second.
// Handles PT/PDT automatically by asking Intl what Pacific reads as
// when we pretend the wall-clock is UTC, then shifting by the diff.
function pacificDateTimeToEpoch(dateStr: string, timeStr: string): number | null {
  const dm = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dm) return null;
  const month = Number(dm[1]);
  const day   = Number(dm[2]);
  const year  = Number(dm[3]);
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!tm) return null;
  let hour = Number(tm[1]) % 12;
  if (tm[3].toUpperCase() === 'PM') hour += 12;
  const minute = Number(tm[2]);
  // Pretend the wall-clock is UTC, then find Pacific's reading of that
  // instant, then shift by the difference to land on the real UTC.
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const ptFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = ptFmt.formatToParts(new Date(naive));
  const ptYr = Number(parts.find((p) => p.type === 'year')?.value);
  const ptMo = Number(parts.find((p) => p.type === 'month')?.value);
  const ptDa = Number(parts.find((p) => p.type === 'day')?.value);
  const ptHr = Number(parts.find((p) => p.type === 'hour')?.value);
  const ptMi = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(ptYr)) return null;
  const ptUtc = Date.UTC(ptYr, ptMo - 1, ptDa, ptHr, ptMi);
  const offsetMs = ptUtc - naive;
  return Math.floor((naive - offsetMs) / 1000);
}

// ----- public entry ----------------------------------------------------

const SCRAPERS: Array<[string, () => Promise<LocalEvent[]>]> = [
  ['delcielo',       scrapeDelCielo],
  ['fivesuns_music', scrapeFiveSunsMusic],
  ['fivesuns_food',  scrapeFiveSunsFood],
  ['martinez',       scrapeCityOfMartinez],
  ['roxxonmain',     scrapeRoxxOnMain],
  ['slowhand',       scrapeSlowHandBBQ],
  ['baycraftbeer',   scrapeCraftBeerFest],
  ['countybbq',      scrapeCountyBBQ],
  ['martinezmartini', scrapeMartinezMartini],
  ['luigi',          luigiRecurring],
  ['farmers',        farmersMarketRecurring],
  ['martinezchamber', scrapeMartinezChamber],
  ['contracosta',    scrapeContraCosta],
  ['cclegistar',     scrapeContraCostaLegistar],
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
