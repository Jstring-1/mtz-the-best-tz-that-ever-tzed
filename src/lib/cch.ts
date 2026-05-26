// Contra Costa Health (CCH) data aggregator. Pulled by the 1d cron
// bucket and cached under apis_json key `cch_health`.
//
// CCRMC = Contra Costa Regional Medical Center, the county hospital.
// Its CMS Certification Number is 050050 (California / county hospital).
// CMS publishes "Hospital Compare" data via the Socrata-style resource
// endpoint at data.cms.gov — no API key needed for low-volume reads.
//
// Anything that requires scraping a county PDF / page lives as a
// static link rather than a fetched data point. Those URLs are stable
// (CCHS landing pages) and the popup just lists them so users can
// click through to the source.

const CCRMC_CCN = '050050';

const COMMON_HEADERS = {
  'User-Agent': 'mtz.city/1.0 (CCH aggregator; +https://mtz.city)',
  Accept: 'application/json',
};

async function safeJson<T = unknown>(url: string, timeoutMs = 12000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) { console.warn(`[cch] ${url} HTTP ${r.status}`); return null; }
    return await r.json() as T;
  } catch (e) {
    console.warn(`[cch] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

// ---- shape ---------------------------------------------------------

export interface CchHcahpsMeasure {
  /** Patient-survey question shortened to a readable label. */
  label: string;
  /** "Top-box" percent (the share who answered most-positively). */
  score: string | null;
  /** Bottom-of-list state-comparison verb, e.g. "Above" / "Same" / "Below". */
  comparison?: string;
}

export interface CchTimelyMeasure {
  /** Care measure name, e.g. "ED median time admitted -> departed". */
  label: string;
  /** Score (CMS reports as raw number or minutes — kept as a string). */
  score: string | null;
  /** Date range the score covers. */
  period?: string;
}

export interface CchPayload {
  scrapedAt: string;
  /** Hospital General Information — overall rating, type, ownership. */
  general: {
    name: string | null;
    address: string | null;
    phone: string | null;
    /** Overall 1–5 star rating; null if "Not Available" / no data. */
    overallRating: string | null;
    /** "Acute Care Hospitals", "Critical Access Hospitals", etc. */
    hospitalType: string | null;
    /** "Government - Local", etc. */
    ownership: string | null;
    /** "Yes" / "No" — meets meaningful-use EHR criteria. */
    emergencyServices: string | null;
  } | null;
  /** HCAHPS — patient survey top-box scores, ~12 measures. */
  hcahps: CchHcahpsMeasure[];
  /** Timely & Effective Care — ED throughput etc. */
  timely: CchTimelyMeasure[];
  /** Per-source fetch outcome, mirrors the Outbreaks status block. */
  status: Record<string, { ok: boolean; count: number; error?: string }>;
}

// ---- CMS Hospital Compare ------------------------------------------

interface CmsGeneralRow {
  facility_id?: string;
  facility_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone_number?: string;
  hospital_overall_rating?: string;
  hospital_type?: string;
  hospital_ownership?: string;
  emergency_services?: string;
}

async function fetchGeneral(): Promise<CchPayload['general']> {
  const url = `https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0?conditions[0][property]=facility_id&conditions[0][value]=${CCRMC_CCN}&limit=1`;
  // The provider-data API returns { results: [...] } shape.
  interface ProviderDataResp { results?: CmsGeneralRow[] }
  const j = await safeJson<ProviderDataResp>(url);
  let row: CmsGeneralRow | null = j?.results?.[0] ?? null;
  // Fallback: legacy Socrata-style endpoint still mirrors the same data.
  if (!row) {
    const alt = `https://data.cms.gov/resource/xubh-q36u.json?facility_id=${CCRMC_CCN}`;
    const rows = await safeJson<CmsGeneralRow[]>(alt);
    row = Array.isArray(rows) ? rows[0] ?? null : null;
  }
  if (!row) return null;
  const addr = [row.address, row.city, row.state, row.zip_code].filter(Boolean).join(', ');
  return {
    name: row.facility_name ?? null,
    address: addr || null,
    phone: row.phone_number ?? null,
    overallRating: row.hospital_overall_rating && row.hospital_overall_rating !== 'Not Available'
      ? row.hospital_overall_rating
      : null,
    hospitalType: row.hospital_type ?? null,
    ownership: row.hospital_ownership ?? null,
    emergencyServices: row.emergency_services ?? null,
  };
}

// ---- HCAHPS Patient Survey -----------------------------------------

interface CmsHcahpsRow {
  facility_id?: string;
  hcahps_measure_id?: string;
  hcahps_question?: string;
  hcahps_answer_description?: string;
  hcahps_answer_percent?: string;
  patient_survey_star_rating?: string;
  patient_survey_star_rating_footnote?: string;
}

// HCAHPS measures we surface (the "linear mean" / "top box" rows). CMS
// has many; we cherry-pick the ones a casual reader would care about.
const HCAHPS_KEEPERS = new Set([
  'H_COMP_1_A_P',   // Nurses communication — Always
  'H_COMP_2_A_P',   // Doctors communication — Always
  'H_COMP_3_A_P',   // Got help quickly — Always
  'H_COMP_5_A_P',   // Pain management — Always
  'H_COMP_6_A_P',   // Communication about meds — Always
  'H_HSP_RATING_9_10', // Overall rating 9–10
  'H_RECMND_DY',    // Would recommend — Definitely Yes
  'H_CLEAN_HSP_A_P', // Cleanliness — Always
  'H_QUIET_HSP_A_P', // Quiet at night — Always
  'H_COMP_7_A',     // Care transition — Strongly Agree
]);

async function fetchHcahps(): Promise<CchHcahpsMeasure[]> {
  const url = `https://data.cms.gov/provider-data/api/1/datastore/query/dgck-syfz/0?conditions[0][property]=facility_id&conditions[0][value]=${CCRMC_CCN}&limit=100`;
  interface Resp { results?: CmsHcahpsRow[] }
  const j = await safeJson<Resp>(url);
  let rows: CmsHcahpsRow[] = j?.results ?? [];
  if (!rows.length) {
    const alt = `https://data.cms.gov/resource/dgck-syfz.json?facility_id=${CCRMC_CCN}&$limit=100`;
    rows = (await safeJson<CmsHcahpsRow[]>(alt)) ?? [];
  }
  return rows
    .filter((r) => r.hcahps_measure_id && HCAHPS_KEEPERS.has(r.hcahps_measure_id))
    .map((r): CchHcahpsMeasure => ({
      label: shortenHcahpsLabel(r.hcahps_measure_id ?? '', r.hcahps_question, r.hcahps_answer_description),
      score: r.hcahps_answer_percent && r.hcahps_answer_percent !== 'Not Available'
        ? `${r.hcahps_answer_percent}%`
        : null,
    }));
}

function shortenHcahpsLabel(measureId: string, question?: string, answer?: string): string {
  // CMS's verbose labels make the popup unreadable. Use the measure id
  // to drive a short, human label. Falls back to the question text.
  const map: Record<string, string> = {
    H_COMP_1_A_P:        'Nurses communicated well',
    H_COMP_2_A_P:        'Doctors communicated well',
    H_COMP_3_A_P:        'Got help quickly',
    H_COMP_5_A_P:        'Pain managed well',
    H_COMP_6_A_P:        'Staff explained meds',
    H_HSP_RATING_9_10:   'Rated hospital 9 or 10',
    H_RECMND_DY:         'Would recommend hospital',
    H_CLEAN_HSP_A_P:     'Room was clean',
    H_QUIET_HSP_A_P:     'Room was quiet at night',
    H_COMP_7_A:          'Felt prepared at discharge',
  };
  return map[measureId] ?? (question ?? answer ?? measureId);
}

// ---- Timely & Effective Care ---------------------------------------

interface CmsTimelyRow {
  facility_id?: string;
  measure_id?: string;
  measure_name?: string;
  score?: string;
  start_date?: string;
  end_date?: string;
}

// A few representative measures — ED throughput, sepsis bundle.
const TIMELY_KEEPERS = new Set([
  'OP_18b',   // Median time from ED arrival to ED departure (admitted)
  'OP_22',    // Patients who left ED without being seen
  'SEP_1',    // Severe sepsis / septic shock care bundle
  'IMM_3',    // Healthcare workers given influenza vaccination
]);

async function fetchTimely(): Promise<CchTimelyMeasure[]> {
  const url = `https://data.cms.gov/provider-data/api/1/datastore/query/yv7e-xc69/0?conditions[0][property]=facility_id&conditions[0][value]=${CCRMC_CCN}&limit=100`;
  interface Resp { results?: CmsTimelyRow[] }
  const j = await safeJson<Resp>(url);
  let rows: CmsTimelyRow[] = j?.results ?? [];
  if (!rows.length) {
    const alt = `https://data.cms.gov/resource/yv7e-xc69.json?facility_id=${CCRMC_CCN}&$limit=100`;
    rows = (await safeJson<CmsTimelyRow[]>(alt)) ?? [];
  }
  return rows
    .filter((r) => r.measure_id && TIMELY_KEEPERS.has(r.measure_id))
    .map((r): CchTimelyMeasure => ({
      label: shortenTimelyLabel(r.measure_id ?? '', r.measure_name),
      score: r.score && r.score !== 'Not Available' ? r.score : null,
      period: r.start_date && r.end_date ? `${r.start_date} – ${r.end_date}` : undefined,
    }));
}

function shortenTimelyLabel(id: string, name?: string): string {
  const map: Record<string, string> = {
    OP_18b: 'Median ED time (admitted patients), minutes',
    OP_22:  'Left ED without being seen, %',
    SEP_1:  'Severe sepsis bundle compliance, %',
    IMM_3:  'Healthcare workers given flu shot, %',
  };
  return map[id] ?? (name ?? id);
}

// ---- top-level fetcher ---------------------------------------------

export async function fetchCch(): Promise<CchPayload> {
  const [g, h, t] = await Promise.allSettled([
    fetchGeneral(),
    fetchHcahps(),
    fetchTimely(),
  ]);
  const status: CchPayload['status'] = {};
  const get = <T>(r: PromiseSettledResult<T>, label: string, count: (v: T) => number): T | null => {
    if (r.status === 'fulfilled') {
      status[label] = { ok: true, count: count(r.value) };
      return r.value;
    }
    status[label] = { ok: false, count: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    return null;
  };
  const general = get(g, 'cms_general', (v) => v ? 1 : 0);
  const hcahps  = get(h, 'cms_hcahps',  (v) => v.length) ?? [];
  const timely  = get(t, 'cms_timely',  (v) => v.length) ?? [];
  return {
    scrapedAt: new Date().toISOString(),
    general,
    hcahps,
    timely,
    status,
  };
}
