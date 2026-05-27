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

// ---- 2. CDC pathogen pages — current foodborne outbreaks --------------

const CDC_PATHOGENS: Array<{ slug: string; label: string }> = [
  { slug: 'listeria',      label: 'Listeria' },
  { slug: 'salmonella',    label: 'Salmonella' },
  { slug: 'e-coli',        label: 'E. coli' },
  { slug: 'campylobacter', label: 'Campylobacter' },
  { slug: 'hepatitis-a',   label: 'Hepatitis A' },
];

// Each pathogen's `/outbreaks/index.html` page lists current and recent
// outbreak investigations as `.dfe-curated-link` blocks containing the
// outbreak page link, a short description, and a `<time>` with the CDC
// publication date. Pages are updated within days of each investigation
// starting or evolving — orders of magnitude fresher than NORS, which
// has a ~2-year publication lag and is no good for a "current" view.
//
// We scrape all five pathogens in parallel, merge + sort newest-first,
// and cap to 50 rows so the popup stays readable.
async function fetchCdcFood(): Promise<OutbreakItem[]> {
  const results = await Promise.allSettled(
    CDC_PATHOGENS.map((p) => fetchPathogenOutbreaks(p.slug, p.label)),
  );
  const merged: OutbreakItem[] = [];
  for (const r of results) if (r.status === 'fulfilled') merged.push(...r.value);
  // Sort newest first by ISO date string (parse failure → empty string →
  // sinks to bottom).
  merged.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return merged.slice(0, 50);
}

async function fetchPathogenOutbreaks(slug: string, label: string): Promise<OutbreakItem[]> {
  const url = `https://www.cdc.gov/${slug}/outbreaks/index.html`;
  const html = await safeText(url);
  if (!html) return [];
  const out: OutbreakItem[] = [];
  // Each curated link block:
  //   <div class="dfe-curated-link …">
  //     …
  //     <a class="cdc-block-link" href="/<slug>/outbreaks/<event>/index.html">TITLE</a>
  //     <div class="dfe-curated-link__desc">DESC</div>
  //     …
  //     <time class="dfe-curated-link__date">Apr 10, 2024</time>
  //   </div>
  // We grab from the opening `dfe-curated-link` div up to the matching
  // `</time>` — there's exactly one `<time>` per block.
  const blockRe = /<div class="dfe-curated-link[^"]*"[\s\S]*?<\/time>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[0];
    const linkM = block.match(/<a class="cdc-block-link" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkM) continue;
    const href = linkM[1];
    // Skip self-links back to the index (e.g. "View all outbreaks").
    if (!href.includes('/outbreaks/') || href.endsWith('/outbreaks/index.html')) continue;
    const title = decodeBasic(stripTagsLocal(linkM[2])).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const descM = block.match(/<div class="dfe-curated-link__desc">([\s\S]*?)<\/div>/);
    const desc = descM
      ? decodeBasic(stripTagsLocal(descM[1])).replace(/\s+/g, ' ').trim() || undefined
      : undefined;
    const timeM = block.match(/<time[^>]*class="dfe-curated-link__date"[^>]*>([^<]+)<\/time>/);
    const rawDate = timeM ? timeM[1].trim() : '';
    const iso = parseCdcDate(rawDate);
    // Slug from URL serves as a stable id within this pathogen.
    const eventSlug = href.replace(/\/index\.html$/, '').split('/').filter(Boolean).slice(-1)[0];
    out.push({
      id: `cdc-${slug}-${eventSlug ?? Math.random().toString(36).slice(2)}`,
      title,
      category: label,
      date: iso ?? rawDate ?? undefined,
      body: desc,
      url: `https://www.cdc.gov${href}`,
    });
  }
  return out;
}

function parseCdcDate(s: string): string | null {
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
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
