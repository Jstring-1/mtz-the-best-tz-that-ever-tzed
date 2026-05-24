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
const BLS_KEY = process.env.BLS_API_KEY ?? '';   // optional — bumps quota 25/day -> 500/day

// Last-failure tracker — populated by safeJson and surfaced in the
// gov_local payload as a `debug` map so we can see which fetcher
// returned nothing without trawling Railway logs.
const lastFail: Record<string, string> = {};

async function safeJson<T = unknown>(url: string, init?: RequestInit, tag?: string, timeoutMs = 12000): Promise<T | null> {
  const t = tag ?? new URL(url).hostname;
  // Per-request abort so a single slow upstream can't stall the whole
  // cron run past Railway's HTTP proxy timeout.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { ...COMMON_HEADERS, ...(init?.headers || {}) },
      cache: 'no-store',
    });
    if (!r.ok) {
      const body = (await r.text().catch(() => '')).slice(0, 200);
      const msg = `HTTP ${r.status}${body ? ` — ${body.replace(/\s+/g, ' ')}` : ''}`;
      console.warn(`[gov] ${t}: ${msg}`);
      lastFail[t] = msg;
      return null;
    }
    return await r.json() as T;
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    const msg = aborted ? `timeout after ${timeoutMs}ms` : (e instanceof Error ? e.message : String(e));
    console.warn(`[gov] ${t} threw:`, msg);
    lastFail[t] = msg;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 1. BLS LAUS — Contra Costa County unemployment rate -------------

interface BlsResp {
  status?: string;
  message?: string[];
  Results?: { series?: Array<{ seriesID?: string; data?: Array<{ year: string; periodName: string; value: string }> }> };
}

// Shared BLS fetcher — batches an array of series IDs into one POST
// (BLS allows up to 50). Pass registrationkey when available to push
// the quota from 25/day to 500/day.
async function blsSeries(seriesIds: string[]): Promise<BlsResp | null> {
  const yr = new Date().getUTCFullYear();
  const body: Record<string, unknown> = {
    seriesid: seriesIds,
    startyear: String(yr - 1),
    endyear: String(yr),
  };
  if (BLS_KEY) body.registrationkey = BLS_KEY;
  const r = await safeJson<BlsResp>('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'bls');
  // BLS returns 200 even on quota errors — surface its own status string.
  if (r?.status && r.status !== 'REQUEST_SUCCEEDED') {
    lastFail['bls'] = `${r.status}${(r.message ?? []).join(' ').slice(0, 200)}`;
    return null;
  }
  return r;
}

// BLS series IDs:
//   LAUCN060130000000003 — Contra Costa County (LAUS, NSA)
//   LASST060000000000003 — California statewide (LAUS state, NSA)
//   LNS14000000          — U.S. civilian unemployment (national, SA)
async function blsUnemployment(): Promise<{
  county: string | null; state: string | null; nation: string | null;
  period: string;
} | null> {
  const r = await blsSeries([
    'LAUCN060130000000003',
    'LASST060000000000003',
    'LNS14000000',
  ]);
  const series = r?.Results?.series ?? [];
  if (!series.length) return null;
  const byId = new Map(series.map((s) => [s.seriesID, s.data?.[0] ?? null]));
  const cc = byId.get('LAUCN060130000000003');
  const ca = byId.get('LASST060000000000003');
  const us = byId.get('LNS14000000');
  // Period taken from whichever is freshest (county usually lags).
  const newest = [cc, ca, us]
    .filter((d): d is { year: string; periodName: string; value: string } => !!d)
    .sort((a, b) => (b.year + b.periodName).localeCompare(a.year + a.periodName))[0];
  // Return RAW numeric strings (e.g. "4.4") — consumers append the
  // '%' when displaying. Avoids the double-% bug where this function
  // appended '%' AND callers appended another.
  return {
    county: cc ? `${cc.value}` : null,
    state:  ca ? `${ca.value}` : null,
    nation: us ? `${us.value}` : null,
    period: newest ? `${newest.periodName} ${newest.year}` : '',
  };
}

// ---- 2. EIA — California regular gas weekly avg ----------------------

interface EiaResp { response?: { data?: Array<{ value?: number; period?: string }> } }

// California regular conventional retail gas, weekly average,
// dollars/gallon — the legacy series ID served through EIA's v2
// seriesid endpoint. Much more stable than the facets endpoint.
const EIA_GAS_SERIES = 'PET.EMM_EPMR_PTE_SCA_DPG.W';

async function eiaCaliforniaGas(): Promise<{ value: string; period: string } | null> {
  if (!KEY) { lastFail['eia'] = 'GOV_API_TOKEN not set'; return null; }
  const url =
    `https://api.eia.gov/v2/seriesid/${EIA_GAS_SERIES}` +
    `?api_key=${encodeURIComponent(KEY)}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const j = await safeJson<EiaResp>(url, undefined, 'eia');
  const row = j?.response?.data?.[0];
  if (row?.value == null) {
    if (!lastFail['eia']) lastFail['eia'] = 'no rows returned';
    return null;
  }
  return { value: `$${row.value.toFixed(2)}`, period: row.period ?? '' };
}

// ---- 3. USAspending — federal funding to Contra Costa County / Martinez

export interface GrantRow {
  amount: number;
  recipient: string;
  description: string;
  agency: string;
  actionDate: string;     // date of this transaction (what USAspending filters on)
  periodStart: string;    // period-of-performance start (can be old for ongoing grants)
  internalId?: string;    // generated_internal_id for /api/v2/awards/{id} lookups
}
interface SpendingResp { results?: Array<{
  'Award Amount'?: number;
  'Loan Value'?: number;
  'Subsidy Cost'?: number;
  'Recipient Name'?: string;
  'Award Description'?: string;
  'Description'?: string;
  'Awarding Agency'?: string;
  'Awarding Sub Agency'?: string;
  'Start Date'?: string;
  'Action Date'?: string;
  'Period of Performance Start Date'?: string;
  generated_internal_id?: string;
}> }

// USAspending's spending_by_award endpoint validates that award_type_codes
// stay within ONE award category per call (grants vs contracts vs loans
// vs direct). So we split a source's "grants + contracts" filter into
// two API calls and merge the results.
type AwardCategory = 'grants' | 'contracts' | 'loans' | 'direct';
const CATEGORY_TYPES: Record<AwardCategory, string[]> = {
  grants:    ['02', '03', '04', '05'],
  contracts: ['A', 'B', 'C', 'D'],
  loans:     ['07', '08'],
  direct:    ['06', '10'],
};
const ASSIST_FIELDS = [
  'Award Amount', 'Recipient Name', 'Award Description',
  'Awarding Agency', 'Awarding Sub Agency',
  'Start Date', 'Action Date',
];
const CONTRACT_FIELDS = [
  'Award Amount', 'Recipient Name', 'Description',
  'Awarding Agency', 'Awarding Sub Agency',
  'Period of Performance Start Date', 'Action Date',
];
// Loans use 'Loan Value' (the principal) — 'Award Amount' is not a
// valid field or sort key on the Loan Award mapping.
const LOAN_FIELDS = [
  'Loan Value', 'Subsidy Cost', 'Recipient Name', 'Description',
  'Awarding Agency', 'Awarding Sub Agency',
  'Action Date', 'Period of Performance Start Date',
];
const FIELDS_FOR: Record<AwardCategory, string[]> = {
  grants:    ASSIST_FIELDS,
  contracts: CONTRACT_FIELDS,
  loans:     LOAN_FIELDS,
  direct:    ASSIST_FIELDS,
};
const SORT_FIELD_FOR: Record<AwardCategory, string> = {
  grants:    'Award Amount',
  contracts: 'Award Amount',
  loans:     'Loan Value',
  direct:    'Award Amount',
};

const CCC_LOC      = [{ country: 'USA', state: 'CA', county: '013' }];
const MARTINEZ_LOC = [{ country: 'USA', state: 'CA', city: 'MARTINEZ' }];

export type FundingSourceKind = 'usaspending' | 'subaward' | 'fac' | 'link' | 'pdf';

export interface FundingSourceMeta {
  key: string;
  label: string;
  description: string;
  kind: FundingSourceKind;
  linkUrl?: string;             // present for kind='link' (and as a hint for other kinds)
  linkLabel?: string;           // optional button text for link sources
  pdfUrl?: string;              // present for kind='pdf' — proxied through /api/council-pdf
}
interface SourceFilter {
  categories: AwardCategory[];          // one API call per category, merged
  place?: 'ccc-county' | 'martinez-city';
  recipientPlace?: 'ccc-county';
  programNumbers?: string[];            // CFDA program numbers
  agency?: string;                      // toptier agency name
}
interface FacQuery {
  cities: string[];                     // PostgREST in.() filter
  yearsBack: number;                    // most recent N audit years
}
type SourceConfig =
  | (FundingSourceMeta & { kind: 'usaspending'; filter: SourceFilter })
  | (FundingSourceMeta & { kind: 'subaward';    filter: SourceFilter })
  | (FundingSourceMeta & { kind: 'fac';         fac: FacQuery })
  | (FundingSourceMeta & { kind: 'link' })
  | (FundingSourceMeta & { kind: 'pdf';         pdfUrl: string });

// Contra Costa County incorporated cities for the FAC auditee-city filter.
// (Excludes unincorporated CDPs; auditees there file under county-level
// entities anyway.)
const CCC_CITIES = [
  'MARTINEZ', 'CONCORD', 'WALNUT CREEK', 'PLEASANT HILL', 'PITTSBURG', 'ANTIOCH',
  'BRENTWOOD', 'OAKLEY', 'RICHMOND', 'SAN PABLO', 'EL CERRITO', 'HERCULES', 'PINOLE',
  'LAFAYETTE', 'MORAGA', 'ORINDA', 'DANVILLE', 'SAN RAMON', 'CLAYTON',
];

// 24 sources — all scoped to Martinez or Contra Costa County in some
// way. Order matters: the first one (`grants`) is the default shown and
// also feeds the civic-strip Funding summary.
const FUNDING_SOURCES: SourceConfig[] = [
  { kind: 'usaspending', key: 'grants',         label: 'All grants — Contra Costa Co.',
    description: 'All federal grants in CCC, last 90 days',
    filter: { categories: ['grants'], place: 'ccc-county' } },
  { kind: 'usaspending', key: 'contracts',      label: 'Contracts — Contra Costa Co.',
    description: 'Federal contracts in CCC, last 90 days',
    filter: { categories: ['contracts'], place: 'ccc-county' } },
  { kind: 'usaspending', key: 'loans',          label: 'Loans — Contra Costa Co.',
    description: 'Federal loans in CCC, last 90 days',
    filter: { categories: ['loans'], place: 'ccc-county' } },
  { kind: 'usaspending', key: 'direct',         label: 'Direct payments — Contra Costa Co.',
    description: 'Federal direct payments in CCC, last 90 days',
    filter: { categories: ['direct'], place: 'ccc-county' } },
  { kind: 'usaspending', key: 'martinez-all',   label: 'All federal $ — City of Martinez',
    description: 'All award types, place-of-performance = Martinez',
    filter: { categories: ['grants', 'contracts', 'loans', 'direct'], place: 'martinez-city' } },
  { kind: 'subaward',    key: 'subaward-ccc',   label: 'Sub-awards (passthrough) — CCC',
    description: 'Sub-award totals grouped by prime award — captures state→local passthroughs USAspending prime awards miss',
    filter: { categories: ['grants'], place: 'ccc-county' } },
  { kind: 'fac',         key: 'fac-local',      label: 'Single Audits (FAC.gov) — CCC cities',
    description: 'Federal Audit Clearinghouse: every entity in a CCC city that filed a Single Audit (federal expenditures ≥ $750K)',
    fac: { cities: CCC_CITIES, yearsBack: 3 } },
  // Agency-scoped, in CCC.
  { kind: 'usaspending', key: 'agency-va',      label: 'Veterans Affairs — CCC',
    description: 'VA awards (grants + contracts) in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Veterans Affairs' } },
  { kind: 'usaspending', key: 'agency-dod',     label: 'Defense (DoD) — CCC',
    description: 'DoD awards (grants + contracts) in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Defense' } },
  { kind: 'usaspending', key: 'agency-doe',     label: 'Energy (DOE) — CCC',
    description: 'DOE awards (grants + contracts) in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Energy' } },
  { kind: 'usaspending', key: 'agency-epa',     label: 'EPA — CCC',
    description: 'EPA awards (grants + contracts) in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Environmental Protection Agency' } },
  { kind: 'usaspending', key: 'agency-dot',     label: 'Transportation (DOT) — CCC',
    description: 'DOT awards (highway/transit) in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Transportation' } },
  { kind: 'usaspending', key: 'agency-usda',    label: 'Agriculture (USDA) — CCC',
    description: 'USDA awards (grants + contracts + direct) in CCC',
    filter: { categories: ['grants', 'contracts', 'direct'], place: 'ccc-county', agency: 'Department of Agriculture' } },
  { kind: 'usaspending', key: 'agency-hhs',     label: 'Health & Human Services — CCC',
    description: 'HHS awards (Medicare/Medicaid/CDC/etc.) in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Health and Human Services' } },
  { kind: 'usaspending', key: 'agency-sba',     label: 'Small Business (SBA) — CCC',
    description: 'SBA awards + loans in CCC',
    filter: { categories: ['grants', 'loans'], place: 'ccc-county', agency: 'Small Business Administration' } },
  { kind: 'usaspending', key: 'agency-ed',      label: 'Education — CCC',
    description: 'Dept of Education awards in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Education' } },
  { kind: 'usaspending', key: 'agency-hud',     label: 'Housing (HUD) — CCC',
    description: 'HUD awards in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Housing and Urban Development' } },
  { kind: 'usaspending', key: 'agency-dhs',     label: 'Homeland Security — CCC',
    description: 'DHS awards in CCC',
    filter: { categories: ['grants', 'contracts'], place: 'ccc-county', agency: 'Department of Homeland Security' } },
  { kind: 'usaspending', key: 'cfda-head-start', label: 'Head Start (CFDA 93.600) — CCC',
    description: 'Head Start/Early Head Start grants, place-of-performance CCC',
    filter: { categories: ['grants'], place: 'ccc-county', programNumbers: ['93.600'] } },
  { kind: 'usaspending', key: 'cfda-childcare', label: 'Childcare CCDF — CCC',
    description: 'CCDF block grants (CFDA 93.575 / 93.596) in CCC',
    filter: { categories: ['grants'], place: 'ccc-county', programNumbers: ['93.575', '93.596'] } },
  // Link-out sources — datasets with no live JSON API. Open the
  // canonical resource in a new tab.
  { kind: 'link',        key: 'link-hud-cpd',   label: 'HUD CDBG/HOME profile — Martinez',
    description: 'HUD entitlement allocations for City of Martinez. No live JSON API — opens HUD CPD Profiles.',
    linkUrl: 'https://www.hud.gov/program_offices/comm_planning/budget',
    linkLabel: 'Open HUD CPD allocations page →' },
  { kind: 'link',        key: 'link-sba-loans', label: 'SBA 7(a) / 504 loans dataset',
    description: 'SBA FOIA dataset — small-business loan recipients nationwide. Filter by BorrCity=Martinez, BorrState=CA after CSV download.',
    linkUrl: 'https://data.sba.gov/en/dataset/7-a-504-foia',
    linkLabel: 'Open SBA 7(a) / 504 dataset →' },
  { kind: 'pdf',         key: 'pdf-martinez-budget',  label: 'City of Martinez — FY2026 budget book',
    description: "Martinez's adopted FY2026 operating budget (full ClearGov PDF). Opens in-page.",
    // Filename includes a ClearGov cache-buster — update annually when
    // the new fiscal year's book is published.
    pdfUrl: 'https://cg-prod-v2.s3.us-east-2.amazonaws.com/pdfs-cache/dbb/253/2026_dbb_city_of_martinez_1773017650466.pdf',
    linkUrl: 'https://city-martinez-ca-budget-book.cleargov.com/',
    linkLabel: 'Open the interactive book on ClearGov →' },
  { kind: 'link',        key: 'link-ccc-budget', label: 'Contra Costa County budget book',
    description: "Contra Costa County's annual budget on ClearGov. HTML/JS budget book — no public data API.",
    linkUrl: 'https://county-contra-costa-ca-budget-book.cleargov.com/',
    linkLabel: 'Open CCC budget book →' },
];

function buildFilters(filter: SourceFilter, types: string[], iso: { start: string; end: string }): Record<string, unknown> {
  const f: Record<string, unknown> = {
    time_period: [{ start_date: iso.start, end_date: iso.end }],
    award_type_codes: types,
  };
  if (filter.place === 'ccc-county') f.place_of_performance_locations = CCC_LOC;
  if (filter.place === 'martinez-city') f.place_of_performance_locations = MARTINEZ_LOC;
  if (filter.recipientPlace === 'ccc-county') f.recipient_locations = CCC_LOC;
  if (filter.programNumbers) f.program_numbers = filter.programNumbers;
  if (filter.agency) f.agencies = [{ type: 'awarding', tier: 'toptier', name: filter.agency }];
  return f;
}

async function fetchSourceCategory(
  cfgKey: string, filter: SourceFilter, category: AwardCategory, iso: { start: string; end: string },
): Promise<GrantRow[]> {
  const body = {
    filters: buildFilters(filter, CATEGORY_TYPES[category], iso),
    fields: FIELDS_FOR[category],
    page: 1, limit: 25,
    sort: SORT_FIELD_FOR[category],
    order: 'desc',
  };
  const j = await safeJson<SpendingResp>(
    'https://api.usaspending.gov/api/v2/search/spending_by_award/',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    `usa:${cfgKey}:${category}`,
  );
  if (!j?.results) return [];
  return j.results.map((r) => ({
    // Loans report 'Loan Value' (principal) instead of 'Award Amount'.
    amount:      r['Award Amount'] ?? r['Loan Value'] ?? 0,
    recipient:   r['Recipient Name'] ?? '',
    description: (r['Award Description'] ?? r['Description'] ?? ''),
    agency:      r['Awarding Sub Agency'] || r['Awarding Agency'] || '',
    actionDate:  (r['Action Date'] ?? '').slice(0, 10),
    periodStart: (r['Start Date'] ?? r['Period of Performance Start Date'] ?? '').slice(0, 10),
    internalId:  r.generated_internal_id,
  }));
}

// ---- USAspending sub-awards (grouped by prime award) -----------------
// The /spending_by_subaward_grouped endpoint returns aggregate sub-award
// dollars grouped by the prime award (no per-sub-recipient detail). It's
// the best signal we have for state→local pass-through funding without
// hitting a separate /awards/{id}/sub_awards/ call per row.

interface SubawardGroupResp {
  results?: Array<{
    award_id?: string;
    award_generated_internal_id?: string;
    subaward_count?: number;
    subaward_obligation?: number;
  }>;
}

async function fetchSubawardSource(cfgKey: string, filter: SourceFilter, days: number): Promise<GrantRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const iso = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  const merged: GrantRow[] = [];
  for (const cat of filter.categories) {
    const body = {
      filters: buildFilters(filter, CATEGORY_TYPES[cat], iso),
      page: 1, limit: 50, sort: 'subaward_obligation', order: 'desc',
    };
    const j = await safeJson<SubawardGroupResp>(
      'https://api.usaspending.gov/api/v2/search/spending_by_subaward_grouped/',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      `usa-sub:${cfgKey}:${cat}`,
    );
    if (!j?.results) continue;
    for (const r of j.results) {
      merged.push({
        amount:      r.subaward_obligation ?? 0,
        recipient:   r.award_id ? `Prime award ${r.award_id}` : '(unknown prime)',
        description: `${r.subaward_count ?? 0} sub-awards obligated under this prime — click for sub-recipients`,
        agency:      '',
        actionDate:  '',
        periodStart: '',
        internalId:  r.award_generated_internal_id,
      });
    }
  }
  merged.sort((a, b) => b.amount - a.amount);
  return merged.slice(0, 30);
}

// ---- Federal Audit Clearinghouse -------------------------------------
// PostgREST endpoint at api.fac.gov. Single Audit data for any entity
// that expended ≥ $750K of federal funds in a fiscal year (cities,
// counties, school districts, nonprofits). Captures pass-through
// funding USAspending misses.

interface FacRow {
  report_id?: string;
  auditee_name?: string;
  auditee_city?: string;
  auditee_state?: string;
  audit_year?: number;
  audit_type?: string;
  total_amount_expended?: number;
  fac_accepted_date?: string;
  audit_period_covered?: string;
}

async function fetchFacSource(cfgKey: string, q: FacQuery): Promise<GrantRow[]> {
  // Recent N years. FAC's audit_year is the entity's fiscal year.
  const thisYr = new Date().getUTCFullYear();
  const years = Array.from({ length: q.yearsBack }, (_, i) => thisYr - 1 - i);
  const cityList = q.cities.map((c) => c.replace(/\s/g, '%20')).join(',');
  const yearList = years.join(',');
  const url =
    `https://api.fac.gov/general` +
    `?auditee_state=eq.CA` +
    `&auditee_city=in.(${cityList})` +
    `&audit_year=in.(${yearList})` +
    `&select=report_id,auditee_name,auditee_city,audit_year,audit_type,total_amount_expended,fac_accepted_date,audit_period_covered` +
    `&order=total_amount_expended.desc.nullslast` +
    `&limit=60`;
  // FAC requires an X-Api-Key header (api.data.gov key works).
  const j = await safeJson<FacRow[]>(
    url,
    KEY ? { headers: { 'X-Api-Key': KEY } } : undefined,
    `fac:${cfgKey}`,
  );
  if (!Array.isArray(j)) return [];
  return j.map((r) => ({
    amount:      r.total_amount_expended ?? 0,
    recipient:   r.auditee_name ?? '(unnamed)',
    description: `Single Audit FY${r.audit_year ?? '?'}${r.audit_type ? ` — ${r.audit_type}` : ''}${r.auditee_city ? ` · ${r.auditee_city}` : ''}`,
    agency:      '',
    actionDate:  (r.fac_accepted_date ?? '').slice(0, 10),
    periodStart: (r.audit_period_covered ?? '').slice(0, 10),
    // No drill-down on our side (FAC has its own dissemination URL). We
    // skip internalId so the row isn't a clickable button.
    internalId:  undefined,
  })).filter((row) => row.amount > 0);
}

async function fetchUsaspendingSource(cfgKey: string, filter: SourceFilter, days: number): Promise<GrantRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const iso = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  const results = await Promise.allSettled(
    filter.categories.map((cat) => fetchSourceCategory(cfgKey, filter, cat, iso)),
  );
  const merged: GrantRow[] = [];
  for (const r of results) if (r.status === 'fulfilled') merged.push(...r.value);
  merged.sort((a, b) => b.amount - a.amount);
  // De-dupe by internalId (or by recipient+amount+date when missing).
  const seen = new Set<string>();
  const out: GrantRow[] = [];
  for (const row of merged) {
    const k = row.internalId || `${row.recipient}|${row.amount}|${row.actionDate}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out.slice(0, 30);
}

// Dispatch a single source to the right fetcher based on `kind`.
async function fetchOneSource(cfg: SourceConfig, days: number): Promise<GrantRow[]> {
  switch (cfg.kind) {
    case 'usaspending': return fetchUsaspendingSource(cfg.key, cfg.filter, days);
    case 'subaward':    return fetchSubawardSource(cfg.key, cfg.filter, days);
    case 'fac':         return fetchFacSource(cfg.key, cfg.fac);
    case 'link':        return [];   // link-out sources have no rows
    case 'pdf':         return [];   // pdf sources render an inline viewer, no rows
  }
}

// Strip private filter/fac fields so the cache payload only carries
// what the client actually needs.
function metaFromConfig(cfg: SourceConfig): FundingSourceMeta {
  return {
    key: cfg.key, label: cfg.label, description: cfg.description, kind: cfg.kind,
    linkUrl: cfg.linkUrl, linkLabel: cfg.linkLabel,
    pdfUrl: cfg.kind === 'pdf' ? cfg.pdfUrl : undefined,
  };
}

async function fetchFundingAll(days = 90): Promise<{
  sources: FundingSourceMeta[];
  data: Record<string, GrantRow[]>;
}> {
  // Bound concurrency: 24 sources × up to 4 category calls each is too
  // many parallel HTTP requests for USAspending under load (the cron
  // started 502'ing once we crossed ~50 in-flight calls). Six at a
  // time keeps wall-clock low while staying polite.
  const BATCH = 6;
  const data: Record<string, GrantRow[]> = {};
  for (let i = 0; i < FUNDING_SOURCES.length; i += BATCH) {
    const slice = FUNDING_SOURCES.slice(i, i + BATCH);
    const results = await Promise.allSettled(slice.map((cfg) => fetchOneSource(cfg, days)));
    slice.forEach((cfg, j) => {
      const r = results[j];
      data[cfg.key] = r.status === 'fulfilled' ? r.value : [];
    });
  }
  const sources: FundingSourceMeta[] = FUNDING_SOURCES.map(metaFromConfig);
  return { sources, data };
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

// (Removed: campground lookup — RIDB is federal-only, almost no nearby
// matches in Martinez. TSA — no public real-time API.)

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
  extras?: {
    grants?: GrantRow[];                          // legacy: alias for funding['grants']
    funding?: Record<string, GrantRow[]>;         // 20-source funding registry
    fundingSources?: FundingSourceMeta[];         // dropdown metadata
    // Raw breakdowns surfaced to detail-popup components in the civic
    // strip. Kept here (not in items[]) so the strip stays compact and
    // the popup has the full data.
    unemp?: { county: string | null; state: string | null; nation: string | null; period: string } | null;
    gas?:   { value: string; period: string } | null;
  };
  debug?: Record<string, string>;   // per-source success/failure for /admin troubleshooting
}

export async function fetchGovLocal(): Promise<GovLocalPayload> {
  // Reset per-run debug tracker so old failures don't linger.
  for (const k of Object.keys(lastFail)) delete lastFail[k];
  // Load the previous cache so an upstream's transient failure (BLS
  // quota miss, EIA hiccup, etc.) falls back to the last known value
  // instead of clearing the strip. Lazy-import to keep ./cache out of
  // any client bundling.
  const { getJson } = await import('./cache');
  const prev = await getJson<GovLocalPayload>('gov_local').catch(() => null);
  const prevItem = (key: string): GovStripItem | undefined =>
    prev?.items?.find((it) => it.key === key);
  const [unemp, gas, funding, rep, crime] = await Promise.allSettled([
    blsUnemployment(),
    eiaCaliforniaGas(),
    fetchFundingAll(90),
    repSponsored(),
    martinezCrime(),
  ]);
  const v = <T>(p: PromiseSettledResult<T>): T | null =>
    p.status === 'fulfilled' ? (p.value as T) : null;
  const u = v(unemp), g = v(gas), f = v(funding), r = v(rep), cr = v(crime);
  // Default-source rows (used as the legacy `extras.grants` payload).
  const grantsRows = f?.data?.['grants'] ?? [];
  // Total across ALL sources, deduped by internalId so awards that
  // appear in multiple sources (e.g. an HHS grant also showing up under
  // the Head Start CFDA source) aren't double-counted.
  let totalAmount = 0;
  let totalCount = 0;
  if (f) {
    const seen = new Set<string>();
    for (const rows of Object.values(f.data)) {
      for (const row of rows) {
        const k = row.internalId || `${row.recipient}|${row.amount}|${row.actionDate}`;
        if (seen.has(k)) continue;
        seen.add(k);
        totalAmount += row.amount;
        totalCount += 1;
      }
    }
  }
  const gr = totalCount > 0
    ? { total: fmtMoney(totalAmount), count: totalCount, days: 90, rows: grantsRows }
    : null;

  const items: GovStripItem[] = [
    {
      key: 'unemp',
      label: 'Unemployment',
      // Compact: just the county rate. Full CC/CA/US breakdown lives
      // in the UnempDetail popup (extras.unemp).
      value: u?.county ? `${u.county}%` : '—',
      tooltip: u
        ? `Contra Costa unemployment ${u.county ?? '—'}% (BLS LAUS, ${u.period}). Click for CA + US.`
        : 'Unemployment (BLS) — data unavailable',
      color: 'red',
    },
    {
      key: 'gas',
      label: 'Gas',
      value: g ? g.value : '—',
      tooltip: g
        ? `California regular gas weekly avg ${g.value} (EIA, week of ${g.period}). Click for more.`
        : 'California regular gas (EIA weekly) — data unavailable',
      color: 'peru',
    },
    {
      key: 'grants',
      label: 'Funding',
      // Strip is uncluttered: show just the word. Tooltip carries the $.
      value: 'Funding',
      tooltip: gr
        ? `Federal funding to Martinez / Contra Costa Co. last ${gr.days}d — ${gr.total} across ${gr.count} unique awards · ${FUNDING_SOURCES.length} sources (USAspending.gov)`
        : 'Federal funding to Martinez / Contra Costa Co. (USAspending) — data unavailable',
      color: 'green',
    },
    {
      key: 'rep',
      label: 'Bills',
      value: 'Bills',
      tooltip: r
        ? `Bills affecting Contra Costa Co. — incl. Rep. DeSaulnier (CA-10) sponsored & cosponsored this Congress${r.latest ? ` (latest: ${r.latest})` : ''}`
        : 'Bills affecting Contra Costa Co. (Congress.gov) — data unavailable',
      color: 'gold',
    },
    {
      key: 'crime',
      label: 'Crime',
      value: 'Crime',
      tooltip: cr
        ? `Martinez PD + CCC Sheriff violent crime, ${cr.year} (FBI CDE) — ${cr.count} reported`
        : 'Crime — Martinez PD + CCC Sheriff (FBI CDE)',
      color: 'red',
    },
  ];

  // Stale-data fallback: when an upstream couldn't be reached this run,
  // substitute the value from the previous cached payload so the strip
  // doesn't flash "—" between fetches. Tooltip gets a "(cached)" tag
  // so the staleness is visible on hover.
  //
  // STRIP any prior "· cached — current fetch unavailable" before re-
  // appending — otherwise consecutive failed runs stack the suffix
  // (e.g. "...cached — current fetch unavailable · cached — current
  // fetch unavailable · ..." after N misses).
  const CACHE_SUFFIX_RE = /(?:\s*·\s*cached\s+—\s+current fetch unavailable)+\s*$/i;
  for (let i = 0; i < items.length; i++) {
    if (items[i].value !== '—') continue;
    const old = prevItem(items[i].key);
    if (old && old.value && old.value !== '—') {
      const baseTooltip = (old.tooltip ?? '').replace(CACHE_SUFFIX_RE, '');
      items[i] = {
        ...items[i],
        value: old.value,
        tooltip: `${baseTooltip} · cached — current fetch unavailable`,
      };
    }
  }

  // Per-source result/error so we can debug "—" rows from /admin's
  // apis_json viewer without re-running the cron.
  const debug: Record<string, string> = {
    bls: u
      ? `ok (cc=${u.county ?? '?'} ca=${u.state ?? '?'} us=${u.nation ?? '?'})`
      : (lastFail['bls'] ?? 'no data'),
    eia: g ? 'ok' : (lastFail['eia'] ?? 'no data'),
    usaspending: f
      ? `ok (${Object.values(f.data).reduce((a, rows) => a + rows.length, 0)} rows across ${f.sources.length} sources)`
      : (lastFail['api.usaspending.gov'] ?? 'no data'),
    congress: r ? `ok (${r.count} bills)` : (lastFail['api.congress.gov'] ?? 'no data'),
    fbi: cr ? `ok (${cr.year})` : (lastFail['api.usa.gov'] ?? 'no data'),
  };
  // Per-source row counts for the debug payload — easy way to see which
  // funding feeds returned nothing.
  if (f) {
    for (const src of f.sources) {
      debug[`usa:${src.key}`] = `${f.data[src.key]?.length ?? 0} rows`;
    }
  }

  // Fall back the funding popup data too — if all 24 USAspending
  // sources came back empty this run, keep showing the previous
  // payload so the popup isn't a blank state.
  const fundingEmpty = !f || Object.values(f.data).every((rows) => rows.length === 0);
  const fundingExtras = fundingEmpty && prev?.extras
    ? { grants: prev.extras.grants, funding: prev.extras.funding, fundingSources: prev.extras.fundingSources }
    : {
        grants: gr?.rows ?? [],
        funding: f?.data ?? {},
        fundingSources: f?.sources ?? [],
      };
  // Same stale-data fallback for unemp / gas — these power the new
  // detail popups. If this run's fetch failed, surface the last known
  // values so the popup isn't blank.
  const extras = {
    ...fundingExtras,
    unemp: u ?? prev?.extras?.unemp ?? null,
    gas:   g ?? prev?.extras?.gas   ?? null,
  };

  return {
    scrapedAt: new Date().toISOString(),
    items,
    extras,
    debug,
  };
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
  updateDate?: string;
}
interface HouseVoteList { houseRollCallVotes?: HouseVoteListItem[] }
interface HouseVoteMetaResp {
  houseRollCallVote?: {
    congress?: number; sessionNumber?: number; rollCallNumber?: number;
    startDate?: string;
    voteQuestion?: string;
    result?: string;
    legislationType?: string; legislationNumber?: string;
  };
}
interface HouseVoteMembers {
  houseRollCallVoteMemberVotes?: {
    results?: Array<{ bioguideID?: string; voteCast?: string }>;
  };
}

// Current Congress (119th = Jan 2025 – Jan 2027). Update on the next
// new Congress.
const CURRENT_CONGRESS = 119;

export async function fetchRepVotes(limit = 20): Promise<RepVotesPayload> {
  const out: RepVote[] = [];
  if (!KEY) return { scrapedAt: new Date().toISOString(), votes: out };

  // Scope to the current Congress and sort by updateDate desc so we
  // actually get *recent* votes (the default ordering returns the
  // earliest votes of the dataset).
  const listUrl =
    `https://api.congress.gov/v3/house-vote/${CURRENT_CONGRESS}` +
    `?api_key=${KEY}&format=json&limit=${limit}&sort=updateDate+desc`;
  const list = await safeJson<HouseVoteList>(listUrl);
  const items = list?.houseRollCallVotes ?? [];

  // For each list item we have to fetch BOTH the vote metadata
  // (question/result/bill) AND the per-member tally — the list
  // endpoint doesn't include any of that.
  const lookups = items.slice(0, limit).map(async (it) => {
    const cg = it.congress, ss = it.sessionNumber, vn = it.rollCallNumber;
    if (!cg || !ss || !vn) return null;
    const base = `https://api.congress.gov/v3/house-vote/${cg}/${ss}/${vn}`;
    const [metaJ, memJ] = await Promise.all([
      safeJson<HouseVoteMetaResp>(`${base}?api_key=${KEY}&format=json`),
      safeJson<HouseVoteMembers>(`${base}/members?api_key=${KEY}&format=json&limit=600`),
    ]);
    const meta = metaJ?.houseRollCallVote;
    const me = memJ?.houseRollCallVoteMemberVotes?.results?.find(
      (r) => (r.bioguideID ?? '').toUpperCase() === REP_BIOGUIDE,
    );
    if (!me) return null;
    const billType = meta?.legislationType;
    const billNumber = meta?.legislationNumber;
    // Resolve the bill's official title so the vote row shows what was
    // actually voted on, not just "HR 1234".
    let billTitle: string | undefined;
    if (billType && billNumber) {
      const billJ = await safeJson<{ bill?: { title?: string; titles?: Array<{ title?: string }> } }>(
        `https://api.congress.gov/v3/bill/${cg}/${billType.toLowerCase()}/${billNumber}` +
        `?api_key=${KEY}&format=json`,
      );
      billTitle = billJ?.bill?.title ?? billJ?.bill?.titles?.[0]?.title;
    }
    const row: RepVote = {
      congress: cg,
      session: ss,
      voteNumber: vn,
      date: (meta?.startDate ?? it.startDate ?? '').slice(0, 10),
      question: meta?.voteQuestion ?? '',
      result: meta?.result ?? '',
      position: me.voteCast ?? '',
      billCongress: billType && billNumber ? cg : undefined,
      billType,
      billNumber,
      billTitle,
    };
    return row;
  });
  const settled = await Promise.allSettled(lookups);
  for (const s of settled) if (s.status === 'fulfilled' && s.value) out.push(s.value);
  // Belt-and-suspenders sort in case the API doesn't honor sort param.
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

// Batched: one BLS call returns national unemployment + CPI series.
async function blsNationalSnapshot() {
  const r = await blsSeries(['LNS14000000', 'CUUR0000SA0']);
  const series = r?.Results?.series ?? [];
  const byId = new Map(series.map((s) => [s.seriesID, s.data ?? []]));
  const unempData = byId.get('LNS14000000') ?? [];
  const cpiData   = byId.get('CUUR0000SA0') ?? [];
  let unemp: { value: string; period: string } | null = null;
  let cpi:   { value: string; period: string } | null = null;
  if (unempData.length) {
    const row = unempData[0];
    unemp = { value: `${row.value}%`, period: `${row.periodName} ${row.year}` };
  }
  if (cpiData.length >= 13) {
    const latest = cpiData[0], yearAgo = cpiData[12];
    const a = Number(latest.value), b = Number(yearAgo.value);
    if (isFinite(a) && isFinite(b) && b !== 0) {
      cpi = { value: `${(((a - b) / b) * 100).toFixed(1)}%`, period: `${latest.periodName} ${latest.year}` };
    }
  }
  return { unemp, cpi };
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
    debt, yields, blsBatch,
    fdaFood, fdaDrug, fdaDevice, cpsc,
    fema, eonet,
  ] = await Promise.allSettled([
    treasuryDebt(),
    treasuryYields(),
    blsNationalSnapshot(),
    fdaRecalls('food'),
    fdaRecalls('drug'),
    fdaRecalls('device'),
    cpscRecalls(),
    femaActive(),
    eonetActive(),
  ]);
  const v = <T>(p: PromiseSettledResult<T>, d: T): T => (p.status === 'fulfilled' ? p.value : d);

  const blsBatched = v(blsBatch, { unemp: null, cpi: null });
  const drugRecalls = v(fdaDrug, []);
  const allRecalls = [
    ...v(fdaFood, []), ...drugRecalls, ...v(fdaDevice, []), ...v(cpsc, []),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    scrapedAt: new Date().toISOString(),
    economy: {
      debt: v(debt, null),
      yields: v(yields, []),
      unemployment: blsBatched.unemp,
      cpiYoY: blsBatched.cpi,
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
