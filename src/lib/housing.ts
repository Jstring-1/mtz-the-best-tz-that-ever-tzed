// Hyperlocal housing market snapshot for Martinez. Two sources, both
// public + keyless:
//
//   Zillow Research ZORI (rents) — monthly index file at
//     files.zillowstatic.com/research/public_csvs/zori/. We pull the
//     city-level CSV (~4.5 MB), find the Martinez CA row (RegionID
//     12592 — there's also a Martinez GA we filter out), and extract
//     the most recent ~24 months as a trend + headline current value.
//
//   Census ACS 5-year — ZIP-level (94553) median home value + median
//     gross rent. The same keyless endpoint the Economy popup uses
//     for Contra Costa County, narrowed to our ZIP.
//
// Not included in V1 (probed, doesn't work for civic-dashboard scope):
//   - Redfin Data Center TSV: 946 MB gzipped — too heavy for cron
//   - Craigslist East Bay RSS: 403s on the ?format=rss path
//   - HUD Fair Market Rent API: requires a (free) HUD_API_KEY env var

const COMMON_HEADERS = {
  'User-Agent': 'mtz.city/1.0 (housing snapshot; +https://mtz.city)',
  Accept: 'text/csv, application/json, */*;q=0.8',
};

async function safeText(url: string, timeoutMs = 20000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) { console.warn(`[housing] ${url} HTTP ${r.status}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[housing] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

async function safeJson<T = unknown>(url: string, timeoutMs = 15000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) { console.warn(`[housing] ${url} HTTP ${r.status}`); return null; }
    return await r.json() as T;
  } catch (e) {
    console.warn(`[housing] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

// ---- shared types ---------------------------------------------------

export interface RentSeriesPoint {
  /** ISO date, end-of-month (e.g. "2026-04-30"). */
  date: string;
  /** Monthly rent index in dollars. */
  value: number;
}

export interface HousingPayload {
  scrapedAt: string;
  zillow: {
    /** Most recent month's rent index ($/mo, typical rental). */
    currentRent: number | null;
    /** End-of-month ISO date for currentRent. */
    asOf: string | null;
    /** % change vs 12 months earlier (positive = up). */
    yoyPct: number | null;
    /** Last 24 monthly points (oldest → newest). */
    series: RentSeriesPoint[];
  } | null;
  census: {
    /** ACS 5-year median home value for ZIP 94553. */
    medianHomeValue: number | null;
    /** ACS 5-year median gross rent for ZIP 94553. */
    medianGrossRent: number | null;
    /** Survey vintage year (e.g. 2023 — ACS publishes ~14 months behind). */
    vintage: number | null;
  } | null;
  /** Per-source per-fetch outcome — surfaced in the popup so the user
   *  can see which sources were silent vs failing. */
  status: Record<string, { ok: boolean; detail?: string }>;
}

// ---- 1. Zillow ZORI for Martinez CA ---------------------------------

const ZILLOW_ZORI_URL = 'https://files.zillowstatic.com/research/public_csvs/zori/City_zori_uc_sfrcondomfr_sm_month.csv';
// Martinez, CA city RegionID per Zillow's research files. (Martinez GA
// is 19223 — we don't want that one.)
const MARTINEZ_CA_REGION_ID = '12592';

async function fetchZillow(): Promise<HousingPayload['zillow']> {
  const csv = await safeText(ZILLOW_ZORI_URL, 30000);
  if (!csv) return null;
  // Header: RegionID,SizeRank,RegionName,RegionType,StateName,State,Metro,CountyName,YYYY-MM-DD,YYYY-MM-DD,…
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = parseCsvLine(lines[0]);
  // First 8 columns are metadata; column 9 onward is the monthly series.
  const dateCols: string[] = header.slice(8);
  if (dateCols.length === 0) return null;

  // Find Martinez CA row by RegionID — much safer than name match.
  let martinezRow: string[] | null = null;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i] || !lines[i].startsWith(MARTINEZ_CA_REGION_ID + ',')) continue;
    martinezRow = parseCsvLine(lines[i]);
    break;
  }
  if (!martinezRow) {
    console.warn(`[housing] Zillow ZORI: no row for RegionID ${MARTINEZ_CA_REGION_ID}`);
    return null;
  }

  // Pair each date column with its value; drop blanks; sort newest-last.
  const points: RentSeriesPoint[] = [];
  for (let c = 0; c < dateCols.length; c++) {
    const v = martinezRow[8 + c];
    const n = v ? Number(v) : NaN;
    if (Number.isFinite(n)) points.push({ date: dateCols[c], value: n });
  }
  if (!points.length) return null;
  // Already in chronological order since CSV columns are sorted that way.
  const series = points.slice(-24);
  const current = series[series.length - 1];
  // Pick the value from ~12 months earlier for YoY.
  const yearAgo = series.find((p, idx) => idx === series.length - 13) ?? null;
  const yoyPct = yearAgo && current
    ? ((current.value - yearAgo.value) / yearAgo.value) * 100
    : null;

  return {
    currentRent: current?.value ?? null,
    asOf: current?.date ?? null,
    yoyPct: yoyPct != null && Number.isFinite(yoyPct) ? yoyPct : null,
    series,
  };
}

// Minimal RFC 4180 CSV line parser (Zillow's CSV is straightforward —
// no quoted commas in the rows we care about — but quote-safe anyway).
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ---- 2. Census ACS 5-year for ZIP 94553 -----------------------------

const ZIP_94553 = '94553';

async function fetchCensus(): Promise<{ data: HousingPayload['census']; diag: string | null }> {
  // Census ACS started enforcing API keys on every request — the old
  // "500 free reads / day / IP" allowance is gone, and unauth'd calls
  // silently 302 to a "Missing Key" HTML page. Bail fast if the key
  // isn't configured rather than retrying every vintage × ~10s each.
  const apiKey = process.env.CENSUS_API_KEY ?? '';
  if (!apiKey) {
    console.warn('[housing] CENSUS_API_KEY missing — skipping ZIP 94553 ACS panel');
    return { data: null, diag: 'CENSUS_API_KEY not set' };
  }
  const thisYear = new Date().getUTCFullYear();
  // Per-attempt diagnostic — what each vintage actually returned. Lets
  // us see "401 invalid key" vs "ZCTA unsupported" vs "data not yet
  // published" in the freshness panel without server log access.
  const attempts: string[] = [];
  for (let vintage = thisYear - 1; vintage >= thisYear - 3; vintage--) {
    const url =
      `https://api.census.gov/data/${vintage}/acs/acs5` +
      `?get=NAME,B25077_001E,B25064_001E` +
      `&for=zip%20code%20tabulation%20area:${ZIP_94553}` +
      `&key=${apiKey}`;
    const r = await rawFetch(url, 8000);
    if (!r) { attempts.push(`${vintage}: fetch threw`); continue; }
    if (!r.ok) {
      const snippet = r.body.slice(0, 120).replace(/\s+/g, ' ').trim();
      attempts.push(`${vintage}: HTTP ${r.status} — ${snippet}`);
      continue;
    }
    let j: unknown;
    try { j = JSON.parse(r.body); }
    catch {
      // Most common failure mode: 200 with HTML "invalid key" page after
      // a silent redirect. Capture the first ~120 chars so we can see it.
      const snippet = r.body.slice(0, 120).replace(/\s+/g, ' ').trim();
      attempts.push(`${vintage}: non-JSON body — ${snippet}`);
      continue;
    }
    if (!Array.isArray(j) || j.length < 2) {
      attempts.push(`${vintage}: empty or malformed JSON (${JSON.stringify(j).slice(0, 80)})`);
      continue;
    }
    const row = (j as string[][])[1];
    // Header order: [NAME, B25077_001E (median home value),
    //                B25064_001E (median gross rent), zip-tab-area]
    const homeVal = Number(row[1]);
    const grossRent = Number(row[2]);
    if (!Number.isFinite(homeVal) && !Number.isFinite(grossRent)) {
      attempts.push(`${vintage}: row had no numeric values (${JSON.stringify(row).slice(0, 80)})`);
      continue;
    }
    return {
      data: {
        medianHomeValue: Number.isFinite(homeVal) && homeVal > 0 ? homeVal : null,
        medianGrossRent: Number.isFinite(grossRent) && grossRent > 0 ? grossRent : null,
        vintage,
      },
      diag: null,
    };
  }
  if (attempts.length) console.warn(`[housing] Census ACS all vintages failed:\n  ${attempts.join('\n  ')}`);
  return { data: null, diag: attempts[0] ?? 'no attempts made' };
}

interface RawResponse { ok: boolean; status: number; body: string }
async function rawFetch(url: string, timeoutMs = 8000): Promise<RawResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: COMMON_HEADERS, cache: 'no-store' });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    console.warn(`[housing] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

// ---- top-level fetcher ----------------------------------------------

export async function fetchHousing(): Promise<HousingPayload> {
  const [zResult, cResult] = await Promise.allSettled([fetchZillow(), fetchCensus()]);
  const status: HousingPayload['status'] = {};

  // Zillow: simple ok/no-data.
  if (zResult.status === 'fulfilled') {
    status['zillow_zori'] = zResult.value ? { ok: true } : { ok: false, detail: 'no data' };
  } else {
    status['zillow_zori'] = { ok: false, detail: zResult.reason instanceof Error ? zResult.reason.message : String(zResult.reason) };
  }

  // Census: pull the diagnostic string from the structured result.
  let censusData: HousingPayload['census'] = null;
  if (cResult.status === 'fulfilled') {
    censusData = cResult.value.data;
    status['census_acs_zip'] = censusData
      ? { ok: true }
      : { ok: false, detail: cResult.value.diag ?? 'no data' };
  } else {
    status['census_acs_zip'] = { ok: false, detail: cResult.reason instanceof Error ? cResult.reason.message : String(cResult.reason) };
  }

  return {
    scrapedAt: new Date().toISOString(),
    zillow: zResult.status === 'fulfilled' ? zResult.value : null,
    census: censusData,
    status,
  };
}
