// Contra Costa Regional Medical Center (CCRMC) dashboard data.
// Cached every 12h by the cron under `ccrmc_data`. The /ccrmc page
// renders entirely from this cache so a page load is instant.
//
// Sources:
//   - USAspending     — federal awards naming CCC Health / CCRMC, plus
//                       Community Health Center CFDA programs
//   - CMS Provider    — Hospital General Information (overall rating)
//   - cchealth.org    — recent news (best-effort HTML scrape)
//
// Failure mode: every helper returns `null` / `[]` on any error so a
// dead upstream just leaves that section empty rather than blowing up
// the whole cron run.

import type { GrantRow, FundingSourceMeta } from './gov';

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': 'mtz.city/1.0 (CCRMC dashboard; contact via github.com/Jstring-1)',
  'Accept': 'application/json',
};

// Per-request timeout to keep the cron under Railway's HTTP proxy
// window even when an upstream is slow.
async function safeJson<T = unknown>(
  url: string,
  init?: RequestInit,
  tag = new URL(url).hostname,
  timeoutMs = 12000,
): Promise<T | null> {
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
      console.warn(`[ccrmc] ${tag}: HTTP ${r.status}`);
      return null;
    }
    return await r.json() as T;
  } catch (e) {
    console.warn(`[ccrmc] ${tag} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

async function safeText(url: string, init?: RequestInit, tag = new URL(url).hostname, timeoutMs = 12000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { ...COMMON_HEADERS, Accept: 'text/html,application/rss+xml,*/*', ...(init?.headers || {}) },
      cache: 'no-store',
    });
    if (!r.ok) { console.warn(`[ccrmc] ${tag}: HTTP ${r.status}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[ccrmc] ${tag} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

// ---- Static facility info -------------------------------------------

// CCRMC is the only public hospital in Contra Costa County, operated
// by Contra Costa Health Services. CCN per CMS Hospital Compare.
export interface CcrmcFacts {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  ccn: string;                  // CMS Certification Number
  beds: number;
  founded: number;
  website: string;
  parentSystem: string;
}
const FACTS: CcrmcFacts = {
  name: 'Contra Costa Regional Medical Center',
  address: '2500 Alhambra Ave',
  city: 'Martinez',
  state: 'CA',
  zip: '94553',
  phone: '(925) 370-5000',
  ccn: '050276',                          // verified via CMS Hospital Compare
  beds: 166,
  founded: 1953,
  website: 'https://cchealth.org/medical-center',
  parentSystem: 'Contra Costa Health Services',
};

// ---- USAspending — CCRMC-relevant federal funding -------------------
//
// We reuse the GrantRow / FundingSourceMeta types from lib/gov.ts so
// the existing GrantsDetail UI component works unchanged.

type AwardCategory = 'grants' | 'contracts' | 'loans' | 'direct';
const CATEGORY_TYPES: Record<AwardCategory, string[]> = {
  grants:    ['02', '03', '04', '05'],
  contracts: ['A', 'B', 'C', 'D'],
  loans:     ['07', '08'],
  direct:    ['06', '10'],
};
const ASSIST_FIELDS = [
  'Award Amount', 'Recipient Name', 'Award Description',
  'Awarding Agency', 'Awarding Sub Agency', 'Start Date', 'Action Date',
];
const CONTRACT_FIELDS = [
  'Award Amount', 'Recipient Name', 'Description',
  'Awarding Agency', 'Awarding Sub Agency',
  'Period of Performance Start Date', 'Action Date',
];

interface SpendingResp { results?: Array<{
  'Award Amount'?: number;
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

interface CcrmcSourceFilter {
  categories: AwardCategory[];
  programNumbers?: string[];          // CFDA
  recipientSearchText?: string[];     // free-text recipient match
  agency?: string;                    // toptier agency name
  zip?: string;                       // recipient zip
  days: number;
}
type CcrmcSourceConfig =
  | (FundingSourceMeta & { kind: 'usaspending'; filter: CcrmcSourceFilter })
  | (FundingSourceMeta & { kind: 'link' });

// Curated list of "CCRMC-relevant" funding lenses. Each source pulls
// 30 most-recent + largest awards in the past N days.
const CCRMC_SOURCES: CcrmcSourceConfig[] = [
  { kind: 'usaspending', key: 'cchs-grants', label: 'CCC Health Services — all federal grants',
    description: 'Federal grants where the recipient name includes "Contra Costa Health" (Health Services Dept, including CCRMC operations)',
    filter: { categories: ['grants'], recipientSearchText: ['Contra Costa Health'], days: 730 } },
  { kind: 'usaspending', key: 'cchs-contracts', label: 'CCC Health Services — contracts',
    description: 'Federal contracts to Contra Costa Health',
    filter: { categories: ['contracts'], recipientSearchText: ['Contra Costa Health'], days: 730 } },
  { kind: 'usaspending', key: 'cchc-fqhc', label: 'Community Health Centers (CFDA 93.224)',
    description: 'HRSA Community Health Center grants in 94553 — funds the CCHS clinic network',
    filter: { categories: ['grants'], programNumbers: ['93.224', '93.527'], zip: '94553', days: 730 } },
  { kind: 'usaspending', key: 'cdc-immunization', label: 'CDC Immunization & Vaccines',
    description: 'CDC 93.268 / 93.539 — Immunization & vaccines for children, place-of-performance 94553',
    filter: { categories: ['grants'], programNumbers: ['93.268', '93.539'], zip: '94553', days: 730 } },
  { kind: 'usaspending', key: 'hrsa-rural-comm', label: 'HRSA Rural / Community programs',
    description: 'Various HRSA grants in 94553 (rural health, maternal-child, etc.)',
    filter: { categories: ['grants'], programNumbers: ['93.110', '93.211', '93.912', '93.928'], zip: '94553', days: 1095 } },
  { kind: 'usaspending', key: 'mh-substance', label: 'Mental health & SAMHSA (CFDA 93.243/93.958)',
    description: 'SAMHSA & community mental health grants in 94553',
    filter: { categories: ['grants'], programNumbers: ['93.243', '93.958', '93.959'], zip: '94553', days: 1095 } },
  { kind: 'usaspending', key: 'covid-arpa', label: 'COVID / ARPA public health (CFDA 21.027 / 93.354)',
    description: 'ARPA State & Local Fiscal Recovery + CDC pandemic supplements in 94553',
    filter: { categories: ['grants'], programNumbers: ['21.027', '93.354', '93.323'], zip: '94553', days: 1825 } },
  { kind: 'usaspending', key: 'hhs-94553', label: 'All HHS funding in 94553',
    description: 'Every HHS grant + contract in the Martinez ZIP — broadest CCRMC-area health-funding view',
    filter: { categories: ['grants', 'contracts'], agency: 'Department of Health and Human Services', zip: '94553', days: 730 } },
  // Link-outs (no API rows).
  { kind: 'link', key: 'link-cms-care-compare', label: 'CCRMC on CMS Care Compare',
    description: "CMS's public hospital scorecard — quality, safety, patient experience.",
    linkUrl: `https://www.medicare.gov/care-compare/details/hospital/${FACTS.ccn}`,
    linkLabel: 'Open Care Compare profile →' },
  { kind: 'link', key: 'link-hcai-financials', label: 'CA HCAI annual financial disclosures',
    description: "California's Health Care Access & Information dept — every hospital files annual unaudited & audited financials.",
    linkUrl: 'https://hcai.ca.gov/data-and-reports/hospital-annual-financial-data/',
    linkLabel: 'Open HCAI financial reports →' },
  { kind: 'link', key: 'link-fac-cchealth', label: 'Federal Audit Clearinghouse — CCC',
    description: 'Single Audits (FAC) for Contra Costa County — federal expenditures, findings, corrective actions.',
    linkUrl: 'https://app.fac.gov/dissemination/search/',
    linkLabel: 'Search FAC for Contra Costa →' },
];

function buildFilters(filter: CcrmcSourceFilter, types: string[]): Record<string, unknown> {
  const end = new Date();
  const start = new Date(end.getTime() - filter.days * 24 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const f: Record<string, unknown> = {
    time_period: [{ start_date: iso(start), end_date: iso(end) }],
    award_type_codes: types,
  };
  if (filter.programNumbers) f.program_numbers = filter.programNumbers;
  if (filter.recipientSearchText) f.recipient_search_text = filter.recipientSearchText;
  if (filter.zip) f.recipient_locations = [{ country: 'USA', state: 'CA', zip: filter.zip }];
  if (filter.agency) f.agencies = [{ type: 'awarding', tier: 'toptier', name: filter.agency }];
  return f;
}

async function fetchSourceCategory(
  key: string, filter: CcrmcSourceFilter, category: AwardCategory,
): Promise<GrantRow[]> {
  const fields = category === 'contracts' ? CONTRACT_FIELDS : ASSIST_FIELDS;
  const body = {
    filters: buildFilters(filter, CATEGORY_TYPES[category]),
    fields, page: 1, limit: 25, sort: 'Award Amount', order: 'desc',
  };
  const j = await safeJson<SpendingResp>(
    'https://api.usaspending.gov/api/v2/search/spending_by_award/',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    `usa:ccrmc:${key}:${category}`,
  );
  if (!j?.results) return [];
  return j.results.map((r) => ({
    amount: r['Award Amount'] ?? 0,
    recipient: r['Recipient Name'] ?? '',
    description: r['Award Description'] ?? r['Description'] ?? '',
    agency: r['Awarding Sub Agency'] || r['Awarding Agency'] || '',
    actionDate: (r['Action Date'] ?? '').slice(0, 10),
    periodStart: (r['Start Date'] ?? r['Period of Performance Start Date'] ?? '').slice(0, 10),
    internalId: r.generated_internal_id,
  }));
}

async function fetchOneCcrmcSource(cfg: CcrmcSourceConfig): Promise<GrantRow[]> {
  if (cfg.kind !== 'usaspending') return [];
  const results = await Promise.allSettled(
    cfg.filter.categories.map((cat) => fetchSourceCategory(cfg.key, cfg.filter, cat)),
  );
  const merged: GrantRow[] = [];
  for (const r of results) if (r.status === 'fulfilled') merged.push(...r.value);
  merged.sort((a, b) => b.amount - a.amount);
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

// ---- CMS Hospital General Information -------------------------------
// data.cms.gov dataset xubh-q36u — overall hospital rating, ownership,
// ER status, emergency services flag, type, etc.

export interface CcrmcQuality {
  hospitalName?: string;
  ownership?: string;
  emergencyServices?: string;
  hospitalType?: string;
  overallRating?: string;
  ratingFootnote?: string;
  mortalityComparison?: string;
  safetyComparison?: string;
  readmissionComparison?: string;
  experienceComparison?: string;
  effectivenessComparison?: string;
  timelinessComparison?: string;
  imagingComparison?: string;
  // HCAHPS patient survey — per-measure star ratings (only present when
  // the upstream dataset returns rows). Empty array when unavailable.
  hcahpsStars: Array<{ measure: string; stars: string; footnote?: string }>;
  // Top-line linear-score percentages (e.g. "% who reported nurses
  // communicated well"). Useful supplement to the star rating.
  hcahpsLinear: Array<{ measure: string; value: string }>;
  fetchedAt: string;
}

interface CmsRow {
  facility_id?: string;
  facility_name?: string;
  hospital_ownership?: string;
  emergency_services?: string;
  hospital_type?: string;
  hospital_overall_rating?: string;
  hospital_overall_rating_footnote?: string;
  mort_group_measure_count?: string;
  count_of_facility_mort_measures?: string;
  count_of_mort_measures_better?: string;
  count_of_mort_measures_no_different?: string;
  count_of_mort_measures_worse?: string;
  mort_group_footnote?: string;
  safety_group_measure_count?: string;
  count_of_facility_safety_measures?: string;
  count_of_safety_measures_better?: string;
  count_of_safety_measures_no_different?: string;
  count_of_safety_measures_worse?: string;
  safety_group_footnote?: string;
  readm_group_measure_count?: string;
  count_of_facility_readm_measures?: string;
  count_of_readm_measures_better?: string;
  count_of_readm_measures_no_different?: string;
  count_of_readm_measures_worse?: string;
  readm_group_footnote?: string;
  pt_exp_group_measure_count?: string;
  count_of_facility_pt_exp_measures?: string;
  pt_exp_group_footnote?: string;
  te_group_measure_count?: string;
  count_of_facility_te_measures?: string;
  te_group_footnote?: string;
}

function bucket(row: CmsRow, better?: string, same?: string, worse?: string): string {
  const b = Number(better ?? '0'), s = Number(same ?? '0'), w = Number(worse ?? '0');
  if (!b && !s && !w) return '—';
  return `${b} above national avg, ${s} same, ${w} below`;
}

// HCAHPS measure IDs → friendly labels. CMS uses cryptic codes (H_COMP_1
// etc.); we map only the ones with a "STAR_RATING" / "LINEAR_SCORE"
// variant since the raw "always/usually/sometimes" answer breakdowns
// would balloon the popup.
const HCAHPS_STAR_LABELS: Record<string, string> = {
  'H_COMP_1_STAR_RATING':     'Nurse communication',
  'H_COMP_2_STAR_RATING':     'Doctor communication',
  'H_COMP_3_STAR_RATING':     'Staff responsiveness',
  'H_COMP_5_STAR_RATING':     'Communication about medicines',
  'H_COMP_6_STAR_RATING':     'Discharge information',
  'H_COMP_7_STAR_RATING':     'Care transition',
  'H_CLEAN_HSP_STAR_RATING':  'Cleanliness',
  'H_QUIET_HSP_STAR_RATING':  'Quietness',
  'H_HSP_RATING_STAR_RATING': 'Overall hospital rating (patients)',
  'H_RECMND_STAR_RATING':     'Would recommend',
  'H_STAR_RATING':            'HCAHPS summary star',
};
const HCAHPS_LINEAR_LABELS: Record<string, string> = {
  'H_COMP_1_LINEAR_SCORE':     'Nurse communication',
  'H_COMP_2_LINEAR_SCORE':     'Doctor communication',
  'H_COMP_3_LINEAR_SCORE':     'Staff responsiveness',
  'H_COMP_5_LINEAR_SCORE':     'Communication about medicines',
  'H_COMP_6_LINEAR_SCORE':     'Discharge information',
  'H_COMP_7_LINEAR_SCORE':     'Care transition',
  'H_CLEAN_HSP_LINEAR_SCORE':  'Cleanliness',
  'H_QUIET_HSP_LINEAR_SCORE':  'Quietness',
  'H_HSP_RATING_LINEAR_SCORE': 'Overall hospital rating',
  'H_RECMND_LINEAR_SCORE':     'Would recommend',
};

interface HcahpsRow {
  facility_id?: string;
  hcahps_measure_id?: string;
  hcahps_question?: string;
  hcahps_answer_description?: string;
  hcahps_answer_percent?: string;
  patient_survey_star_rating?: string;
  patient_survey_star_rating_footnote?: string;
  hcahps_linear_mean_value?: string;
}

async function fetchHcahps(ccn: string): Promise<HcahpsRow[]> {
  // Patient Survey (HCAHPS) — Hospital. dgck-syfz is the canonical
  // dataset id under CMS Provider Data DKAN.
  const url =
    `https://data.cms.gov/provider-data/api/1/datastore/query/dgck-syfz/0` +
    `?conditions[0][resource]=t&conditions[0][property]=facility_id&conditions[0][operator]==&conditions[0][value]=${ccn}` +
    `&limit=200`;
  const j = await safeJson<{ results?: HcahpsRow[] }>(url, undefined, 'cms-hcahps');
  return j?.results ?? [];
}

async function fetchCmsQuality(): Promise<CcrmcQuality | null> {
  // CMS DKAN datastore endpoint. Try by CCN first; if the CCN doesn't
  // resolve we fall back to a name search so a wrong CCN constant
  // doesn't permanently break the page.
  const byCcn = `https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0` +
    `?conditions[0][resource]=t&conditions[0][property]=facility_id&conditions[0][operator]==&conditions[0][value]=${FACTS.ccn}` +
    `&limit=1`;
  let row = (await safeJson<{ results?: CmsRow[] }>(byCcn, undefined, 'cms-hospitals-ccn'))?.results?.[0];
  if (!row) {
    const byName = `https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0` +
      `?conditions[0][resource]=t&conditions[0][property]=facility_name&conditions[0][operator]=LIKE&conditions[0][value]=%CONTRA%COSTA%REGIONAL%` +
      `&conditions[1][resource]=t&conditions[1][property]=state&conditions[1][operator]==&conditions[1][value]=CA` +
      `&limit=1`;
    row = (await safeJson<{ results?: CmsRow[] }>(byName, undefined, 'cms-hospitals-name'))?.results?.[0];
  }
  if (!row) return null;

  // Use the resolved facility_id from the general-info row (may differ
  // from FACTS.ccn if the name fallback matched a different CCN).
  const resolvedCcn = row.facility_id ?? FACTS.ccn;
  const hcahpsRows = await fetchHcahps(resolvedCcn);
  const hcahpsStars: CcrmcQuality['hcahpsStars'] = [];
  const hcahpsLinear: CcrmcQuality['hcahpsLinear'] = [];
  for (const r of hcahpsRows) {
    const id = r.hcahps_measure_id ?? '';
    if (HCAHPS_STAR_LABELS[id] && r.patient_survey_star_rating) {
      hcahpsStars.push({
        measure: HCAHPS_STAR_LABELS[id],
        stars: r.patient_survey_star_rating,
        footnote: r.patient_survey_star_rating_footnote,
      });
    }
    if (HCAHPS_LINEAR_LABELS[id] && r.hcahps_linear_mean_value) {
      hcahpsLinear.push({
        measure: HCAHPS_LINEAR_LABELS[id],
        value: r.hcahps_linear_mean_value,
      });
    }
  }

  return {
    hospitalName:        row.facility_name,
    ownership:           row.hospital_ownership,
    emergencyServices:   row.emergency_services,
    hospitalType:        row.hospital_type,
    overallRating:       row.hospital_overall_rating,
    ratingFootnote:      row.hospital_overall_rating_footnote,
    mortalityComparison:    bucket(row, row.count_of_mort_measures_better,    row.count_of_mort_measures_no_different,    row.count_of_mort_measures_worse),
    safetyComparison:       bucket(row, row.count_of_safety_measures_better,  row.count_of_safety_measures_no_different,  row.count_of_safety_measures_worse),
    readmissionComparison:  bucket(row, row.count_of_readm_measures_better,   row.count_of_readm_measures_no_different,   row.count_of_readm_measures_worse),
    experienceComparison:   hcahpsStars.length > 0 ? `${hcahpsStars.length} HCAHPS star ratings (see below)` : '(see Care Compare)',
    effectivenessComparison:row.te_group_footnote ? '—' : '(see Care Compare)',
    timelinessComparison:   '(see Care Compare)',
    imagingComparison:      '(see Care Compare)',
    hcahpsStars,
    hcahpsLinear,
    fetchedAt: new Date().toISOString(),
  };
}

// ---- News — Google News RSS for CCRMC -------------------------------
// Google News RSS is far more reliable than scraping cchealth.org's
// Drupal pages (which load articles via JS in places). It also covers
// regional news outlets that mention CCRMC, not just the org's own
// press releases.

export interface CcrmcNewsItem { title: string; url: string; date: string; source: string }

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fetchCchealthNews(): Promise<CcrmcNewsItem[]> {
  const query = encodeURIComponent('"Contra Costa Regional Medical Center" OR "CCRMC" OR "Contra Costa Health Services"');
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await safeText(url, undefined, 'gnews-ccrmc');
  if (!xml) return [];
  const out: CcrmcNewsItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && out.length < 15) {
    const body = m[1];
    const title = decodeEntities(
      (body.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
        .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim(),
    );
    const link  = (body.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '').trim();
    const pub   = (body.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '').trim();
    // Google News titles look like "Headline - Publisher"; split it.
    const dash = title.lastIndexOf(' - ');
    const headline = dash > 0 ? title.slice(0, dash) : title;
    const source   = dash > 0 ? title.slice(dash + 3) : '';
    let date = '';
    if (pub) {
      const ms = Date.parse(pub);
      if (!Number.isNaN(ms)) date = new Date(ms).toISOString().slice(0, 10);
    }
    if (!headline || !link) continue;
    out.push({ title: headline, url: link, date, source });
  }
  return out;
}

// ---- Top-level payload ----------------------------------------------

export interface CcrmcPayload {
  scrapedAt: string;
  facts: CcrmcFacts;
  funding: {
    sources: FundingSourceMeta[];
    data: Record<string, GrantRow[]>;
  };
  quality: CcrmcQuality | null;
  news: CcrmcNewsItem[];
}

export async function fetchCcrmcData(): Promise<CcrmcPayload> {
  const [fundingResults, quality, news] = await Promise.all([
    Promise.all(CCRMC_SOURCES.map(async (cfg) => [cfg.key, await fetchOneCcrmcSource(cfg)] as const)),
    fetchCmsQuality(),
    fetchCchealthNews(),
  ]);
  const data: Record<string, GrantRow[]> = {};
  for (const [k, rows] of fundingResults) data[k] = rows;
  const sources: FundingSourceMeta[] = CCRMC_SOURCES.map(({ key, label, description, kind, linkUrl, linkLabel }) =>
    ({ key, label, description, kind, linkUrl, linkLabel }));
  return {
    scrapedAt: new Date().toISOString(),
    facts: FACTS,
    funding: { sources, data },
    quality,
    news,
  };
}
