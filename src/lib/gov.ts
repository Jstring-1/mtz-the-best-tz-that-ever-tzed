// Federal / local data lookups for the GovStrip and (later) /gov page.
//
// Each helper is resilient: any API hiccup just returns null so the
// strip shows "—" instead of crashing the cron run. All formatters
// produce short, fixed-width-ish strings suitable for the top scroller.
//
// Single env var: GOV_API_TOKEN — used as the api.data.gov key for
// the FBI/Crime/EIA/Congress.gov/Recreation.gov endpoints that accept
// it. BLS and USAspending are keyless.

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': 'mtz.city/1.0 (hyperlocal dashboard; contact via github.com/Jstring-1)',
  'Accept': 'application/json',
};
const KEY = process.env.GOV_API_TOKEN ?? '';

async function safeJson<T = unknown>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { ...COMMON_HEADERS, ...(init?.headers || {}) },
      cache: 'no-store',
    });
    if (!r.ok) {
      console.warn(`[gov] ${url} → ${r.status}`);
      return null;
    }
    return await r.json() as T;
  } catch (e) {
    console.warn(`[gov] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ---- 1. BLS LAUS — Contra Costa County unemployment rate -------------

interface BlsResp {
  status?: string;
  Results?: { series?: Array<{ data?: Array<{ year: string; periodName: string; value: string }> }> };
}

async function blsUnemployment(): Promise<{ value: string; period: string } | null> {
  // LAUS area code for Contra Costa County, CA = CN0601300; measure 03 = rate.
  const seriesId = 'LAUCN060130000000003';
  const yr = new Date().getUTCFullYear();
  const r = await safeJson<BlsResp>('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid: [seriesId], startyear: String(yr - 1), endyear: String(yr) }),
  });
  const row = r?.Results?.series?.[0]?.data?.[0];
  if (!row) return null;
  return { value: `${row.value}%`, period: `${row.periodName} ${row.year}` };
}

// ---- 2. EIA — California regular gas weekly avg ----------------------

interface EiaResp { response?: { data?: Array<{ value?: number; period?: string }> } }

async function eiaCaliforniaGas(): Promise<{ value: string; period: string } | null> {
  if (!KEY) return null;
  const url =
    `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${KEY}` +
    `&frequency=weekly&data[0]=value` +
    `&facets[duoarea][]=SCA&facets[product][]=EPMR` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const j = await safeJson<EiaResp>(url);
  const row = j?.response?.data?.[0];
  if (row?.value == null) return null;
  return { value: `$${row.value.toFixed(2)}`, period: row.period ?? '' };
}

// ---- 3. USAspending — federal grants to Contra Costa County ---------

interface SpendingResp { results?: Array<{ 'Award Amount'?: number }> }

async function ccGrants(days = 90): Promise<{ total: string; count: number; days: number } | null> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const body = {
    filters: {
      time_period: [{ start_date: iso(start), end_date: iso(end) }],
      award_type_codes: ['02', '03', '04', '05'], // grants
      place_of_performance_locations: [{ country: 'USA', state: 'CA', county: '013' }],
    },
    fields: ['Award Amount'],
    page: 1,
    limit: 100,
    sort: 'Award Amount',
    order: 'desc',
  };
  const j = await safeJson<SpendingResp>('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!j?.results) return null;
  const sum = j.results.reduce((acc, r) => acc + (r['Award Amount'] ?? 0), 0);
  return { total: fmtMoney(sum), count: j.results.length, days };
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ---- 4. Congress.gov — local rep sponsored bills count --------------
// DeSaulnier (CA-10) bioguideId D000623. Update if the seat changes.

interface CongressResp { pagination?: { count?: number }; sponsoredLegislation?: Array<{ title?: string }> }

async function repSponsored(): Promise<{ count: number; latest: string; rep: string } | null> {
  if (!KEY) return null;
  const url =
    `https://api.congress.gov/v3/member/D000623/sponsored-legislation` +
    `?api_key=${KEY}&format=json&limit=1`;
  const j = await safeJson<CongressResp>(url);
  if (!j) return null;
  return {
    count: j.pagination?.count ?? (j.sponsoredLegislation?.length ?? 0),
    latest: j.sponsoredLegislation?.[0]?.title ?? '',
    rep: 'DeSaulnier',
  };
}

// ---- 5. Recreation.gov RIDB — campgrounds near Martinez -------------

interface RidbResp { RECDATA?: Array<{ RecAreaName?: string; FacilityName?: string }> }

async function nearbyCamping(): Promise<{ count: number; sample: string[] } | null> {
  if (!KEY) return null;
  const url =
    `https://ridb.recreation.gov/api/v1/facilities` +
    `?latitude=38.0194&longitude=-122.1341&radius=30&limit=25&activity=9&apikey=${KEY}`;
  // activity=9 is CAMPING in RIDB taxonomy.
  const j = await safeJson<RidbResp>(url);
  if (!j?.RECDATA) return null;
  const names = j.RECDATA.map((f) => f.FacilityName ?? f.RecAreaName ?? '').filter(Boolean);
  return { count: names.length, sample: names.slice(0, 4) };
}

// ---- 6. TSA — no public live API ------------------------------------
// TSA's MyTSA app uses an internal endpoint that's not public; the
// scraping community has stitched things together but nothing reliable.
// Show "—" with a tooltip explaining and link to the TSA site.

function tsaStub(): { value: string; note: string } {
  return {
    value: '—',
    note: 'No public real-time TSA wait API. Check tsa.gov/wait-times for live data.',
  };
}

// ---- 7. FBI CDE — Martinez PD violent crime, latest year ------------

interface FbiResp { offenses?: { actuals?: Record<string, Record<string, number>> }; actuals?: Record<string, number> }

async function martinezCrime(): Promise<{ count: number; year: number } | null> {
  if (!KEY) return null;
  // Try latest available year, walking back if no data.
  const thisYear = new Date().getUTCFullYear();
  for (const yr of [thisYear - 1, thisYear - 2, thisYear - 3]) {
    const url =
      `https://api.usa.gov/crime/fbi/cde/summarized/agency/CA0070500/violent-crime` +
      `?from=01-${yr}&to=12-${yr}&API_KEY=${KEY}`;
    const j = await safeJson<FbiResp>(url);
    // Endpoint returns offenses.actuals = { "violent-crime": { "YYYY-MM": count } } or actuals.
    let total = 0;
    const buckets = j?.offenses?.actuals ?? {};
    for (const k of Object.keys(buckets)) {
      const months = buckets[k] as Record<string, number>;
      for (const v of Object.values(months)) total += Number(v) || 0;
    }
    if (total > 0) return { count: total, year: yr };
  }
  return null;
}

// ---- public payload --------------------------------------------------

export interface GovStripItem {
  key: string;
  label: string;
  value: string;
  tooltip: string;
  href?: string;
  color?: string;     // css class
}
export interface GovLocalPayload {
  scrapedAt: string;
  items: GovStripItem[];
}

export async function fetchGovLocal(): Promise<GovLocalPayload> {
  const [unemp, gas, grants, rep, camp, crime] = await Promise.allSettled([
    blsUnemployment(),
    eiaCaliforniaGas(),
    ccGrants(90),
    repSponsored(),
    nearbyCamping(),
    martinezCrime(),
  ]);
  const v = <T>(p: PromiseSettledResult<T>): T | null =>
    p.status === 'fulfilled' ? (p.value as T) : null;
  const u = v(unemp), g = v(gas), gr = v(grants), r = v(rep), c = v(camp), cr = v(crime);
  const tsa = tsaStub();

  const items: GovStripItem[] = [
    {
      key: 'unemp',
      label: 'Unemployment',
      value: u ? u.value : '—',
      tooltip: u
        ? `Contra Costa County unemployment rate, BLS LAUS, ${u.period}`
        : 'Contra Costa County unemployment (BLS LAUS) — data unavailable',
      color: 'red',
    },
    {
      key: 'gas',
      label: 'Gas',
      value: g ? g.value : '—',
      tooltip: g
        ? `California regular gas weekly avg, EIA, week of ${g.period}`
        : 'California regular gas (EIA weekly) — data unavailable',
      color: 'peru',
    },
    {
      key: 'grants',
      label: 'Grants',
      value: gr ? `${gr.total}` : '—',
      tooltip: gr
        ? `Federal grants to Contra Costa Co. last ${gr.days}d (${gr.count} awards) — USAspending.gov`
        : 'Federal grants to Contra Costa Co. (USAspending) — data unavailable',
      color: 'green',
    },
    {
      key: 'rep',
      label: 'DeSaulnier',
      value: r ? `${r.count} bills` : '—',
      tooltip: r
        ? `Bills sponsored by Rep. Mark DeSaulnier (CA-10) this Congress${r.latest ? ` — latest: ${r.latest}` : ''}`
        : 'Rep. DeSaulnier sponsored bills (Congress.gov) — data unavailable',
      color: 'gold',
      href: 'https://www.congress.gov/member/mark-desaulnier/D000623',
    },
    {
      key: 'camp',
      label: 'Camp',
      value: c ? `${c.count} nearby` : '—',
      tooltip: c
        ? `Campgrounds within 30 mi (Recreation.gov RIDB)${c.sample.length ? ` — ${c.sample.join(', ')}` : ''}`
        : 'Campgrounds within 30 mi (Recreation.gov RIDB) — data unavailable',
      color: 'green',
    },
    {
      key: 'tsa',
      label: 'TSA SFO/OAK/SMF',
      value: tsa.value,
      tooltip: tsa.note,
      color: 'dodger',
      href: 'https://www.tsa.gov/travel/security-screening/airport',
    },
    {
      key: 'crime',
      label: 'Crime',
      value: cr ? `${cr.count}/yr` : '—',
      tooltip: cr
        ? `Martinez PD violent crime, ${cr.year} (FBI CDE)`
        : 'Martinez PD violent crime (FBI CDE) — data unavailable',
      color: 'red',
    },
  ];

  return { scrapedAt: new Date().toISOString(), items };
}
