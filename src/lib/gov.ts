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
  // RIDB only covers federal lands (NPS / USFS / BLM / USACE); state and
  // regional parks aren't in it. Most of the campgrounds within an hour
  // of Martinez (Mt Diablo, Briones, Black Diamond, etc.) are state /
  // EBRPD and won't appear here — broaden radius and drop the activity
  // filter to catch what little federal acreage is nearby (Pt Reyes,
  // Lake Berryessa, John Muir NHS, …).
  const url =
    `https://ridb.recreation.gov/api/v1/facilities` +
    `?latitude=38.0194&longitude=-122.1341&radius=75&limit=25&apikey=${KEY}`;
  const j = await safeJson<RidbResp>(url);
  if (!j?.RECDATA) return null;
  const names = j.RECDATA.map((f) => f.FacilityName ?? f.RecAreaName ?? '').filter(Boolean);
  return { count: names.length, sample: names.slice(0, 5) };
}

// (TSA: no public real-time wait API exists, so the strip drops it
// entirely. The civic card links to tsa.gov as a footer instead.)

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
      value: c && c.count > 0 ? `${c.count} nearby` : '—',
      tooltip: c && c.count > 0
        ? `Federal campgrounds within 75 mi (Recreation.gov RIDB) — ${c.sample.join(', ')}`
        : 'No federal campgrounds nearby — Mt Diablo / Briones / Black Diamond etc. are state/regional parks (not on RIDB).',
      color: 'green',
      href: 'https://www.recreation.gov/search?inventory_type=camping',
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

// =====================================================================
// Rep voting record — cached by the 4h cron so the popup is instant.
// =====================================================================
// The Congress.gov v3 API doesn't expose per-member roll-call records
// directly; we have to list recent House votes, then look up each
// vote's members list and find our rep. The 4h cadence keeps it fresh
// without hammering the API (≤ 25 calls per refresh).

const REP_BIOGUIDE = 'D000623';

export interface RepVote {
  congress: number; session: number; voteNumber: number;
  date: string;
  question: string;
  result: string;
  position: string;                  // 'Yea' / 'Nay' / 'Present' / 'Not Voting'
  billCongress?: number;
  billType?: string;                 // 'HR' / 'S' / etc.
  billNumber?: string;
  billTitle?: string;
}
export interface RepVotesPayload { scrapedAt: string; votes: RepVote[] }

interface HouseVoteListItem {
  congress?: number;
  sessionNumber?: number;
  rollCallNumber?: number;
  startDate?: string;
  voteQuestion?: string;
  result?: string;
  bill?: { congress?: number; type?: string; number?: string; title?: string };
  legislationType?: string; legislationNumber?: string;
}
interface HouseVoteList { houseRollCallVotes?: HouseVoteListItem[] }
interface HouseVoteMembers {
  houseRollCallVoteMemberVotes?: {
    results?: Array<{ bioguideID?: string; voteCast?: string }>;
  };
}

export async function fetchRepVotes(limit = 20): Promise<RepVotesPayload> {
  const out: RepVote[] = [];
  if (!KEY) return { scrapedAt: new Date().toISOString(), votes: out };

  const listUrl =
    `https://api.congress.gov/v3/house-vote?api_key=${KEY}&format=json&limit=${limit}`;
  const list = await safeJson<HouseVoteList>(listUrl);
  const items = list?.houseRollCallVotes ?? [];

  const lookups = items.slice(0, limit).map(async (it) => {
    const cg = it.congress, ss = it.sessionNumber, vn = it.rollCallNumber;
    if (!cg || !ss || !vn) return null;
    const memUrl =
      `https://api.congress.gov/v3/house-vote/${cg}/${ss}/${vn}/members` +
      `?api_key=${KEY}&format=json&limit=600`;
    const m = await safeJson<HouseVoteMembers>(memUrl);
    const me = m?.houseRollCallVoteMemberVotes?.results?.find(
      (r) => (r.bioguideID ?? '').toUpperCase() === REP_BIOGUIDE,
    );
    if (!me) return null;
    const row: RepVote = {
      congress: cg,
      session: ss,
      voteNumber: vn,
      date: (it.startDate ?? '').slice(0, 10),
      question: it.voteQuestion ?? '',
      result: it.result ?? '',
      position: me.voteCast ?? '',
      billCongress: it.bill?.congress,
      billType: it.bill?.type,
      billNumber: it.bill?.number,
      billTitle: it.bill?.title,
    };
    return row;
  });
  const settled = await Promise.allSettled(lookups);
  for (const s of settled) if (s.status === 'fulfilled' && s.value) out.push(s.value);
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { scrapedAt: new Date().toISOString(), votes: out };
}

// =====================================================================
// /gov page — "health of the nation" payload
// =====================================================================

export interface RecallRow { source: string; title: string; date: string; url?: string; reason?: string }
export interface FemaRow   { state: string; type: string; declared: string; title: string }
export interface EonetRow  { title: string; category: string; date: string; url?: string }

export interface GovNationalPayload {
  scrapedAt: string;
  economy: {
    debt: { total: string; date: string } | null;
    yields: Array<{ maturity: string; rate: string }>;
    unemployment: { value: string; period: string } | null;
    cpiYoY: { value: string; period: string } | null;
  };
  recalls: RecallRow[];
  health: { recentDrugRecalls: number; topDrugRecalls: RecallRow[] };
  disasters: { fema: FemaRow[]; eonet: EonetRow[] };
}

// ---- Treasury Fiscal Data (keyless) ----------------------------------

interface TreasuryDebt { data?: Array<{ tot_pub_debt_out_amt?: string; record_date?: string }> }
async function treasuryDebt() {
  const j = await safeJson<TreasuryDebt>(
    'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1',
  );
  const row = j?.data?.[0];
  if (!row?.tot_pub_debt_out_amt) return null;
  return { total: fmtBigMoney(Number(row.tot_pub_debt_out_amt)), date: row.record_date ?? '' };
}
function fmtBigMoney(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  return `$${n.toLocaleString()}`;
}

interface TreasuryYield { data?: Array<Record<string, string>> }
async function treasuryYields(): Promise<Array<{ maturity: string; rate: string }>> {
  const j = await safeJson<TreasuryYield>(
    'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/daily_treasury_yield_curve_rates?sort=-record_date&page[size]=1',
  );
  const row = j?.data?.[0];
  if (!row) return [];
  // Field names look like "bc_1month", "bc_3month", ..., "bc_30year".
  const order: Array<[string, string]> = [
    ['bc_1month', '1M'], ['bc_3month', '3M'], ['bc_6month', '6M'],
    ['bc_1year', '1Y'], ['bc_2year', '2Y'], ['bc_5year', '5Y'],
    ['bc_10year', '10Y'], ['bc_30year', '30Y'],
  ];
  const out: Array<{ maturity: string; rate: string }> = [];
  for (const [k, label] of order) {
    const v = row[k];
    if (v && v !== 'null') out.push({ maturity: label, rate: `${Number(v).toFixed(2)}%` });
  }
  return out;
}

// ---- BLS national unemployment + CPI ---------------------------------

async function blsNationalUnemployment() {
  // Series LNS14000000 = civilian unemployment rate, seasonally adjusted.
  const yr = new Date().getUTCFullYear();
  const r = await safeJson<BlsResp>('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid: ['LNS14000000'], startyear: String(yr - 1), endyear: String(yr) }),
  });
  const row = r?.Results?.series?.[0]?.data?.[0];
  if (!row) return null;
  return { value: `${row.value}%`, period: `${row.periodName} ${row.year}` };
}

async function blsCpiYoY() {
  // CUUR0000SA0 = CPI-U, all items, not seasonally adjusted.
  const yr = new Date().getUTCFullYear();
  const r = await safeJson<BlsResp>('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid: ['CUUR0000SA0'], startyear: String(yr - 1), endyear: String(yr) }),
  });
  const data = r?.Results?.series?.[0]?.data ?? [];
  if (data.length < 13) return null;
  const latest = data[0], yearAgo = data[12];
  const a = Number(latest.value), b = Number(yearAgo.value);
  if (!isFinite(a) || !isFinite(b) || b === 0) return null;
  return { value: `${(((a - b) / b) * 100).toFixed(1)}%`, period: `${latest.periodName} ${latest.year}` };
}

// ---- FDA / CPSC recalls ----------------------------------------------

interface FdaResp { results?: Array<{
  recall_initiation_date?: string; report_date?: string;
  product_description?: string; reason_for_recall?: string;
  openfda?: { brand_name?: string[] }; brand_name?: string;
  more_code_info?: string;
}> }

async function fdaRecalls(kind: 'food' | 'drug' | 'device'): Promise<RecallRow[]> {
  const url = `https://api.fda.gov/${kind}/enforcement.json?sort=recall_initiation_date:desc&limit=8`;
  const j = await safeJson<FdaResp>(url);
  if (!j?.results) return [];
  return j.results.map((r) => ({
    source: `FDA ${kind}`,
    title: pickFdaTitle(r),
    date: fmtFdaDate(r.recall_initiation_date),
    reason: (r.reason_for_recall ?? '').slice(0, 220),
    url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts',
  }));
}
function pickFdaTitle(r: NonNullable<FdaResp['results']>[number]): string {
  const brand = r.openfda?.brand_name?.[0] ?? r.brand_name;
  const desc = (r.product_description ?? '').replace(/\s+/g, ' ').trim();
  return brand ? `${brand} — ${desc.slice(0, 120)}` : desc.slice(0, 140);
}
function fmtFdaDate(s?: string): string {
  if (!s) return '';
  // openFDA returns YYYYMMDD.
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

interface CpscRow { RecallNumber?: string; RecallDate?: string; Title?: string; Description?: string; URL?: string }
async function cpscRecalls(): Promise<RecallRow[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=Json&RecallDateStart=${since}`;
  const j = await safeJson<CpscRow[] | { Recalls?: CpscRow[] }>(url);
  // CPSC sometimes returns a bare array, sometimes wraps it.
  const list: CpscRow[] = Array.isArray(j) ? j : (j?.Recalls ?? []);
  return list.slice(0, 10).map((r) => ({
    source: 'CPSC',
    title: r.Title ?? 'Recall',
    date: (r.RecallDate ?? '').slice(0, 10),
    reason: (r.Description ?? '').slice(0, 220),
    url: r.URL ?? 'https://www.cpsc.gov/Recalls',
  }));
}

// ---- FEMA + NASA EONET ------------------------------------------------

interface FemaResp { DisasterDeclarationsSummaries?: Array<{ state?: string; incidentType?: string; declarationDate?: string; declarationTitle?: string; incidentEndDate?: string | null }> }
async function femaActive(): Promise<FemaRow[]> {
  const url =
    'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries' +
    '?$top=15&$orderby=declarationDate desc&$filter=incidentEndDate eq null';
  const j = await safeJson<FemaResp>(url);
  return (j?.DisasterDeclarationsSummaries ?? []).map((d) => ({
    state: d.state ?? '',
    type: d.incidentType ?? '',
    declared: (d.declarationDate ?? '').slice(0, 10),
    title: d.declarationTitle ?? '',
  }));
}

interface EonetResp { events?: Array<{ title?: string; categories?: Array<{ title?: string }>; geometry?: Array<{ date?: string }>; sources?: Array<{ url?: string }> }> }
async function eonetActive(): Promise<EonetRow[]> {
  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=14';
  const j = await safeJson<EonetResp>(url);
  return (j?.events ?? []).slice(0, 15).map((e) => ({
    title: e.title ?? '',
    category: e.categories?.[0]?.title ?? '',
    date: (e.geometry?.[e.geometry.length - 1]?.date ?? '').slice(0, 10),
    url: e.sources?.[0]?.url,
  }));
}

// ---- top-level fetcher -----------------------------------------------

export async function fetchGovNational(): Promise<GovNationalPayload> {
  const [
    debt, yields, unemp, cpi,
    fdaFood, fdaDrug, fdaDevice, cpsc,
    fema, eonet,
  ] = await Promise.allSettled([
    treasuryDebt(),
    treasuryYields(),
    blsNationalUnemployment(),
    blsCpiYoY(),
    fdaRecalls('food'),
    fdaRecalls('drug'),
    fdaRecalls('device'),
    cpscRecalls(),
    femaActive(),
    eonetActive(),
  ]);
  const v = <T>(p: PromiseSettledResult<T>, d: T): T => (p.status === 'fulfilled' ? p.value : d);

  const drugRecalls = v(fdaDrug, []);
  const allRecalls = [
    ...v(fdaFood, []), ...drugRecalls, ...v(fdaDevice, []), ...v(cpsc, []),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    scrapedAt: new Date().toISOString(),
    economy: {
      debt: v(debt, null),
      yields: v(yields, []),
      unemployment: v(unemp, null),
      cpiYoY: v(cpi, null),
    },
    recalls: allRecalls.slice(0, 30),
    health: {
      recentDrugRecalls: drugRecalls.length,
      topDrugRecalls: drugRecalls.slice(0, 5),
    },
    disasters: {
      fema: v(fema, []),
      eonet: v(eonet, []),
    },
  };
}
