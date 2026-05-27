// Disease / outbreak aggregator. Four sources combined into one
// `outbreaks` cache key, populated by the 4h cron bucket:
//
//   disease.sh   — global / US / California COVID snapshot (keyless)
//   data.cdc.gov — CDC Open Data via Socrata; we pull NORS foodborne
//                  outbreaks (keyless; optional X-App-Token bumps quota)
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

// ---- 2. CDC Open Data — NORS foodborne outbreaks ---------------------

interface NorsRow {
  year?: string;
  month?: string;
  state?: string;
  primary_mode?: string;
  etiology?: string;
  illnesses?: string;
  hospitalizations?: string;
  deaths?: string;
  food_vehicle?: string;
  setting?: string;
}

// NORS dataset on data.cdc.gov. CDC retired the foodborne-only dataset
// `j5jx-3hes` and replaced it with the broader `5xkq-dg7x` ("NORS")
// which includes all transmission modes (foodborne + person-to-person
// + waterborne + animal contact + environmental + unknown). We sort by
// year+month desc and keep the 25 most recent.
//
// Publication lag is ~2 years — the newest rows are typically Dec 2023
// as of this comment. That's normal; NORS is a slow surveillance feed,
// not a real-time signal.
async function fetchCdcFood(): Promise<OutbreakItem[]> {
  const token = process.env.CDC_APP_TOKEN ?? '';
  const url = 'https://data.cdc.gov/resource/5xkq-dg7x.json'
    + '?$order=year DESC,month DESC&$limit=25';
  const init: RequestInit = token ? { headers: { 'X-App-Token': token } } : {};
  const rows = await safeJson<NorsRow[]>(url, 12000, init);
  if (!Array.isArray(rows)) return [];
  return rows.map((r, i): OutbreakItem => {
    const etiology = (r.etiology ?? '').trim() || 'Unknown agent';
    const food = (r.food_vehicle ?? '').trim();
    const setting = (r.setting ?? '').trim();
    const ill = r.illnesses ? Number(r.illnesses) : 0;
    const hosp = r.hospitalizations ? Number(r.hospitalizations) : 0;
    const deaths = r.deaths ? Number(r.deaths) : 0;
    const counts = [
      ill > 0 ? `${ill} ill` : '',
      hosp > 0 ? `${hosp} hosp.` : '',
      deaths > 0 ? `${deaths} died` : '',
    ].filter(Boolean).join(' · ');
    return {
      id: `nors-${r.year ?? '?'}-${r.month ?? '?'}-${i}`,
      title: food ? `${etiology} — ${food}` : etiology,
      category: 'NORS',
      date: r.year ? (r.month ? `${r.year}-${String(r.month).padStart(2, '0')}` : r.year) : undefined,
      region: r.state,
      body: [counts, setting && `Setting: ${setting}`].filter(Boolean).join(' — ') || undefined,
      url: 'https://wwwn.cdc.gov/norsdashboard/',
    };
  });
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
async function fetchDelphiIli(): Promise<DelphiIliRow[]> {
  const apiKey = process.env.DELPHI_API_KEY ?? '';
  const now = new Date();
  const y = now.getUTCFullYear();
  // Crude prior-15-week window: take this year minus 1 -> this year.
  // The API accepts arbitrary date ranges; tighter math is unnecessary.
  const range = `${y - 1}40-${y}52`;
  const qs = new URLSearchParams({
    regions: 'nat,ca',
    epiweeks: range,
  });
  if (apiKey) qs.set('api_key', apiKey);
  const j = await safeJson<DelphiResp>(`https://api.delphi.cmu.edu/epidata/fluview/?${qs.toString()}`);
  if (!j || !Array.isArray(j.epidata) || j.epidata.length === 0) return [];
  // Group by region, keep newest week only.
  const newest = new Map<string, DelphiIliRow>();
  for (const r of j.epidata) {
    const region = r.region.toUpperCase();
    const epiweek = String(r.epiweek);
    const prev = newest.get(region);
    if (!prev || epiweek > prev.epiweek) {
      newest.set(region, {
        region,
        epiweek,
        wili: r.wili ?? null,
        ili: r.ili ?? null,
      });
    }
  }
  return [...newest.values()];
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
