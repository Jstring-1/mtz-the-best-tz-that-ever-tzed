// Disease / outbreak aggregator. Four sources combined into one
// `outbreaks` cache key, populated by the 4h cron bucket:
//
//   disease.sh   — global / US / California COVID snapshot (keyless)
//   CDC outbreak pages — HTML scrape of /listeria/outbreaks/,
//                  /salmonella/outbreaks/, /e-coli/outbreaks/,
//                  /campylobacter/outbreaks/, /hepatitis-a/outbreaks/.
//                  Each pathogen page lists current+recent investigations
//                  with title / description / publication date / URL.
//                  Replaces NORS Socrata, which had a 2-year publication
//                  lag (j5jx-3hes retired, 5xkq-dg7x still ~2yr behind).
//   Delphi Epidata API — CMU's flu/ILI surveillance for CA + national
//                  (keyless; optional api_key bumps quota)
//   WHO DON RSS  — Disease Outbreak News, the WHO's early-warning feed
//                  (RSS, keyless)
//
// All four fetches happen in parallel with per-request timeouts. Any
// source that fails returns null/[] so the popup still renders
// whatever else came back successfully.

const COMMON_HEADERS = {
  'User-Agent': 'mtz.city/1.0 (outbreaks aggregator; +https://mtz.city)',
  Accept: 'application/json, application/rss+xml, application/xml, text/xml, */*;q=0.8',
};

async function safeJson<T = unknown>(url: string, timeoutMs = 12000, init?: RequestInit): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { ...COMMON_HEADERS, ...(init?.headers || {}) },
      cache: 'no-store',
    });
    if (!r.ok) { console.warn(`[outbreaks] ${url} HTTP ${r.status}`); return null; }
    return await r.json() as T;
  } catch (e) {
    console.warn(`[outbreaks] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

async function safeText(url: string, timeoutMs = 12000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: COMMON_HEADERS,
      cache: 'no-store',
    });
    if (!r.ok) { console.warn(`[outbreaks] ${url} HTTP ${r.status}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[outbreaks] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

// ---- shared payload shape -------------------------------------------

export interface OutbreakSnapshot {
  /** "Global", "United States", "California", etc. */
  scope: string;
  /** Total cumulative — usually huge; render as context, not headline. */
  cases?: string;
  deaths?: string;
  /** Newest-day deltas — the "what's happening now" number. */
  todayCases?: string;
  todayDeaths?: string;
  active?: string;
  /** Best-effort timestamp from upstream ("updated" field). */
  updated?: string;
}

export interface OutbreakItem {
  /** Stable id within the source so the UI can key by it. */
  id: string;
  title: string;
  /** Optional category badge (e.g. NORS etiology, WHO region). */
  category?: string;
  /** Optional ISO date or epiweek. */
  date?: string;
  /** One- or two-sentence summary. */
  body?: string;
  url?: string;
  /** State name for NORS rows etc. */
  region?: string;
}

export interface DelphiIliRow {
  region: string;     // 'CA' or 'US'
  epiweek: string;    // '202345'
  /** Weighted ILI percent — "% of outpatient visits for flu-like illness". */
  wili: number | null;
  /** Unweighted ILI percent (regions without weights use this). */
  ili: number | null;
}

export interface OutbreaksPayload {
  scrapedAt: string;
  /** disease.sh — three snapshots at decreasing scope. */
  snapshots: {
    global: OutbreakSnapshot | null;
    unitedStates: OutbreakSnapshot | null;
    california: OutbreakSnapshot | null;
  };
  /** CDC Open Data NORS — foodborne outbreaks, most-recent year first. */
  cdcFood: OutbreakItem[];
  /** Delphi Epidata fluview — most recent week available for CA + US. */
  flu: DelphiIliRow[];
  /** WHO DON RSS — early-warning items (10 newest). */
  whoDon: OutbreakItem[];
  /** Source-by-source per-fetch outcome for the popup's "data freshness"
   *  panel; lets users see which feeds were silent vs failing. */
  status: Record<string, { ok: boolean; count: number; error?: string }>;
}

// ---- 1. disease.sh ---------------------------------------------------

interface DiseaseShRow {
  cases?: number; deaths?: number; recovered?: number; active?: number;
  todayCases?: number; todayDeaths?: number; todayRecovered?: number;
  population?: number; updated?: number;
}

function fmtCount(n: number | undefined): string | undefined {
  if (n == null || !isFinite(n)) return undefined;
  return n.toLocaleString('en-US');
}

function toSnapshot(scope: string, r: DiseaseShRow | null): OutbreakSnapshot | null {
  if (!r) return null;
  return {
    scope,
    cases: fmtCount(r.cases),
    deaths: fmtCount(r.deaths),
    todayCases: fmtCount(r.todayCases),
    todayDeaths: fmtCount(r.todayDeaths),
    active: fmtCount(r.active),
    updated: r.updated ? new Date(r.updated).toISOString() : undefined,
  };
}

async function fetchDiseaseSh(): Promise<{
  global: OutbreakSnapshot | null;
  unitedStates: OutbreakSnapshot | null;
  california: OutbreakSnapshot | null;
}> {
  const [gAll, gUs, gCa] = await Promise.all([
    safeJson<DiseaseShRow>('https://disease.sh/v3/covid-19/all'),
    safeJson<DiseaseShRow>('https://disease.sh/v3/covid-19/countries/USA?strict=true'),
    safeJson<DiseaseShRow>('https://disease.sh/v3/covid-19/states/California'),
  ]);
  return {
    global:       toSnapshot('Global',         gAll),
    unitedStates: toSnapshot('United States',  gUs),
    california:   toSnapshot('California',     gCa),
  };
}

// ---- 2. CDC foodborne outbreaks CSV — all pathogens, current ---------
//
// CDC's foodborne outbreaks hub (cdc.gov/foodborne-outbreaks/outbreaks/)
// renders its table from a CSV at a fixed path, and that CSV is the
// freshest authoritative list: every active and recent investigation
// across all pathogens (Salmonella, E. coli, Listeria, Botulism, Hep A,
// Cyclospora, …), pre-sorted newest-first, refreshed by CDC within days
// of each new investigation.
//
// Replaces the per-pathogen-page scrape, which only worked for Listeria
// (the other pathogen pages have a different structure that surfaces no
// individual outbreak links in the static HTML).
//
// CSV shape (3 columns):
//   Contaminated Food, Germ, Year
//   "<a href=""/ecoli/outbreaks/rawcheese-03-26/index.html"">Raw Dairy</a>",<em>E. coli</em> O157:H7,2026
const CDC_FOODBORNE_CSV = 'https://www.cdc.gov/foodborne-outbreaks/media/files/2024/04/full-outbreak-list.csv';

async function fetchCdcFood(): Promise<OutbreakItem[]> {
  const csv = await safeText(CDC_FOODBORNE_CSV);
  if (!csv) return [];
  const lines = csv.split(/\r?\n/);
  const out: OutbreakItem[] = [];
  // Skip header (index 0). Each subsequent row → one outbreak.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const item = parseCdcFoodborneRow(line);
    if (item) out.push(item);
  }
  // CSV is already sorted newest-first by year, but within-year order
  // is whatever CDC publishes. Resort by our slug-derived YYYY-MM key
  // (falling back to year) so months sort correctly.
  out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return out.slice(0, 60);
}

function parseCdcFoodborneRow(line: string): OutbreakItem | null {
  const fields = parseCsvLine(line);
  if (fields.length < 3) return null;
  const [foodHtml, germHtml, year] = fields;
  // foodHtml: `<a href="/ecoli/outbreaks/rawcheese-03-26/index.html">Raw Dairy</a>`
  const linkM = foodHtml.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (!linkM) return null;
  const href = linkM[1];
  const title = decodeBasic(stripTagsLocal(linkM[2])).replace(/\s+/g, ' ').trim();
  if (!title) return null;
  // germHtml: `<em>E. coli</em> O157:H7` → strip italics, keep full strain.
  const germ = decodeBasic(stripTagsLocal(germHtml)).replace(/\s+/g, ' ').trim();
  // Slug-derived ID + date.
  const slug = href.replace(/\/index\.html$/, '').split('/').filter(Boolean).slice(-1)[0] ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const date = dateFromSlug(href, year.trim());
  return {
    id: `cdc-fb-${slug}`,
    title,
    category: shortPathogen(germ) || germ || 'Foodborne',
    date,
    // body intentionally undefined — ArticleBody fetches the full CDC
    // page via Readability when the row is expanded.
    body: germ && germ !== shortPathogen(germ) ? germ : undefined,
    url: href.startsWith('http') ? href : `https://www.cdc.gov${href}`,
  };
}

// Pull the short pathogen name out of a longer strain description.
// "Salmonella Newport" → "Salmonella". "E. coli O157:H7" → "E. coli".
// "Clostridium botulinum" → "Botulism" (more familiar civic-dashboard
// term). Returns the input unchanged if no rule matches.
function shortPathogen(germ: string): string {
  if (!germ) return germ;
  const g = germ.toLowerCase();
  if (g.startsWith('salmonella'))           return 'Salmonella';
  if (g.startsWith('e. coli') || g.startsWith('escherichia'))       return 'E. coli';
  if (g.startsWith('listeria'))             return 'Listeria';
  if (g.startsWith('campylobacter'))        return 'Campylobacter';
  if (g.startsWith('hepatitis a'))          return 'Hepatitis A';
  if (g.startsWith('cyclospora'))           return 'Cyclospora';
  if (g.startsWith('clostridium botulinum') || g.startsWith('botulism')) return 'Botulism';
  if (g.startsWith('norovirus'))            return 'Norovirus';
  if (g.startsWith('vibrio'))               return 'Vibrio';
  if (g.startsWith('shigella'))             return 'Shigella';
  return germ;
}

// Extract a YYYY-MM date from the URL slug if possible (CDC uses
// `-MM-YY` or `-mmm-YYYY` suffixes consistently). Falls back to year.
const MONTH_SHORT: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
function dateFromSlug(href: string, year: string): string | undefined {
  const csvYr = /^\d{4}$/.test(year) ? Number(year) : NaN;
  const yearOnly = Number.isFinite(csvYr) ? String(csvYr) : undefined;
  // -MM-YY or -M-YY at the end of the slug (most common): "rawcheese-03-26"
  const m1 = href.match(/-(\d{1,2})-(\d{2})\/index\.html$/i);
  if (m1) {
    const mo = Number(m1[1]);
    const slugYr = Number(m1[2]) + (Number(m1[2]) > 50 ? 1900 : 2000);
    // Only trust the slug-derived YY when it matches the CSV year (±1
    // for the occasional year-end / January edge case). Without this
    // guard, old URL slugs like `/2013/A1b-03-31/` get mis-parsed as
    // year 2031 because `-31` looks like a year suffix.
    if (mo >= 1 && mo <= 12 && Number.isFinite(csvYr) && Math.abs(slugYr - csvYr) <= 1) {
      return `${csvYr}-${String(mo).padStart(2, '0')}`;
    }
  }
  // Or full 4-digit year: "infant-formula-nov-2025"
  const m2 = href.match(/-([a-z]{3,9})-(\d{4})\/index\.html$/i);
  if (m2) {
    const mo = MONTH_SHORT[m2[1].slice(0, 3).toLowerCase()];
    const slugYr = Number(m2[2]);
    if (mo && Number.isFinite(csvYr) && Math.abs(slugYr - csvYr) <= 1) {
      return `${csvYr}-${String(mo).padStart(2, '0')}`;
    }
    if (mo && !Number.isFinite(csvYr)) {
      return `${slugYr}-${String(mo).padStart(2, '0')}`;
    }
  }
  return yearOnly;
}

// Minimal RFC 4180 CSV line parser — handles "double-doubled" quote
// escaping and unquoted fields. We only need single-line parsing because
// the CDC CSV doesn't embed newlines in any field.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += c; }
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') { inQuotes = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

function stripTagsLocal(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function decodeBasic(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ---- 3. Delphi Epidata API — fluview ILI -----------------------------

interface DelphiResp {
  result?: number;
  message?: string;
  epidata?: Array<{
    epiweek: number;
    region: string;
    wili?: number | null;
    ili?: number | null;
  }>;
}

// fluview's "region" arg uses lowercase short codes: `ca` for the
// California state, `nat` for the national line. We ask for the past
// ~15 epiweeks so we always have data even when the latest week hasn't
// posted yet (publication usually lags ~1 week).
//
// Delphi migrated from query-param routing (`?source=fluview&…`) to
// path-based routing (`/fluview/?…`) — the old URL now returns the API
// landing-page HTML which fails JSON parse silently. Path-based form
// also no longer returns a top-level `result` field, just `epidata`.
//
// We keep the latest 8 weeks per region (not just the newest) so the
// UI can show trend / week-over-week change without a separate fetch.
async function fetchDelphiIli(): Promise<DelphiIliRow[]> {
  const apiKey = process.env.DELPHI_API_KEY ?? '';
  const now = new Date();
  const y = now.getUTCFullYear();
  const range = `${y - 1}40-${y}52`;
  const qs = new URLSearchParams({ regions: 'nat,ca', epiweeks: range });
  if (apiKey) qs.set('api_key', apiKey);
  const j = await safeJson<DelphiResp>(`https://api.delphi.cmu.edu/epidata/fluview/?${qs.toString()}`);
  if (!j || !Array.isArray(j.epidata) || j.epidata.length === 0) return [];
  // Group by region, sort newest-first, take 8 weeks each.
  const byRegion = new Map<string, DelphiIliRow[]>();
  for (const r of j.epidata) {
    const region = r.region.toUpperCase();
    const list = byRegion.get(region) ?? [];
    list.push({
      region,
      epiweek: String(r.epiweek),
      wili: r.wili ?? null,
      ili: r.ili ?? null,
    });
    byRegion.set(region, list);
  }
  const out: DelphiIliRow[] = [];
  for (const list of byRegion.values()) {
    list.sort((a, b) => b.epiweek.localeCompare(a.epiweek));
    out.push(...list.slice(0, 8));
  }
  return out;
}

// ---- 4. WHO Disease Outbreak News (RSS) ------------------------------

// Inline RSS parser — small enough not to be worth importing or
// generalizing across modules. Returns most-recent items first.
function parseRss(xml: string, srcLabel: string, limit = 10): OutbreakItem[] {
  const items: OutbreakItem[] = [];
  const blocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/g)];
  for (const m of blocks) {
    const block = m[0];
    const title = decodeEntities(stripCdata(tag(block, 'title')));
    const link  = decodeEntities(stripCdata(tag(block, 'link')));
    const desc  = decodeEntities(stripCdata(tag(block, 'description')));
    const pubDate = stripCdata(tag(block, 'pubDate'));
    if (!title || !link) continue;
    const ms = Date.parse(pubDate);
    items.push({
      id: `${srcLabel}-${ms || link}`,
      title,
      date: ms ? new Date(ms).toISOString().slice(0, 10) : undefined,
      body: desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
      url: link,
      category: srcLabel,
    });
    if (items.length >= limit) break;
  }
  return items;
}
function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  return block.match(re)?.[1] ?? '';
}
function stripCdata(s: string): string { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(); }
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function fetchWhoDon(): Promise<OutbreakItem[]> {
  // WHO's Disease Outbreak News feed. They occasionally rotate the URL;
  // both paths below have worked historically — try them in order.
  const candidates = [
    'https://www.who.int/feeds/entity/csr/don/en/rss.xml',
    'https://www.who.int/rss-feeds/news-english.xml',
  ];
  for (const url of candidates) {
    const xml = await safeText(url);
    if (!xml) continue;
    const items = parseRss(xml, 'WHO', 12);
    if (items.length) return items;
  }
  return [];
}

// ---- top-level fetcher -----------------------------------------------

export async function fetchOutbreaks(): Promise<OutbreaksPayload> {
  const [snapsR, foodR, fluR, whoR] = await Promise.allSettled([
    fetchDiseaseSh(),
    fetchCdcFood(),
    fetchDelphiIli(),
    fetchWhoDon(),
  ]);
  const status: OutbreaksPayload['status'] = {};
  const get = <T>(r: PromiseSettledResult<T>, label: string, count: (v: T) => number): T | null => {
    if (r.status === 'fulfilled') {
      status[label] = { ok: true, count: count(r.value) };
      return r.value;
    }
    status[label] = { ok: false, count: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    return null;
  };
  const snaps = get(snapsR, 'disease.sh', (v) => Object.values(v).filter(Boolean).length) ?? {
    global: null, unitedStates: null, california: null,
  };
  const food  = get(foodR, 'cdc_nors', (v) => v.length) ?? [];
  const flu   = get(fluR,  'delphi_ili', (v) => v.length) ?? [];
  const who   = get(whoR,  'who_don', (v) => v.length) ?? [];

  return {
    scrapedAt: new Date().toISOString(),
    snapshots: snaps,
    cdcFood: food,
    flu,
    whoDon: who,
    status,
  };
}
