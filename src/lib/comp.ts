// Government Compensation in California — Contra Costa County.
//
// State Controller publishes this annually at publicpay.ca.gov. Each
// row = one employee for one year (anonymized: position + dept + pay,
// no name). We pull the canonical CSV via Raw Export, parse it, and
// cache the full dataset in apis_json for the CCRMC dashboard's
// compensation modal.
//
// The 'most recent year available' isn't 'this year' — the State
// Controller releases data ~12-18 months after the close of the
// reporting year. We walk back a few years until a populated CSV
// returns.

export interface CompRow {
  department: string;
  position: string;
  otherPositions: string;
  regularPay: number;
  overtime: number;
  lumpSum: number;
  otherPay: number;
  totalWages: number;
  pension: number;            // employer contribution
  health: number;             // health/dental/vision contribution
  totalCompensation: number;  // wages + pension + health
  employeeId: string;         // anonymized identifier
  notes: string;
}

export interface CompPayload {
  scrapedAt: string;
  year: number;
  entity: string;
  sourceUrl: string;
  rows: CompRow[];
  totals: {
    employees: number;
    totalWages: number;
    totalRetirementAndHealth: number;
    grandTotal: number;
  };
  departments: string[];      // unique dept names, sorted
}

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': 'mtz.city/1.0 (CCRMC dashboard; contact via github.com/Jstring-1)',
  Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
};

async function safeText(url: string, tag: string, timeoutMs = 8000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: COMMON_HEADERS, signal: ctrl.signal, cache: 'no-store',
      redirect: 'follow',
    });
    if (!r.ok) { console.warn(`[comp] ${tag}: HTTP ${r.status} from ${new URL(url).hostname}`); return null; }
    const ct = r.headers.get('content-type') ?? '';
    const body = await r.text();
    // Early reject when an upstream returns an HTML error/login page
    // instead of a CSV — saves us scanning a 100KB shell.
    if (ct.includes('text/html') || body.startsWith('<')) {
      console.warn(`[comp] ${tag}: got HTML (${body.length}b, ct=${ct}) — likely blocked or wrong URL`);
      return null;
    }
    return body;
  } catch (e) {
    console.warn(`[comp] ${tag} threw:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

// CSV with quoted fields containing commas + escaped quotes.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function toNum(s: string | undefined): number {
  if (!s) return 0;
  // Strip $, commas, parens; treat (123.45) as -123.45.
  const t = s.replace(/[$,]/g, '').replace(/\(([\d.]+)\)/, '-$1').trim();
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function headerIndex(headers: string[], ...needles: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const needle of needles) {
    const n = needle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const i = norm.findIndex((h) => h === n || h.startsWith(n) || h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseCompCsv(csv: string): CompRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = {
    // Modern GCC export header naming (no separators in column names).
    dept:          headerIndex(header, 'departmentorsubdivision', 'departmentsubdivision', 'department'),
    pos:           headerIndex(header, 'position'),
    other:         headerIndex(header, 'otherpositions'),
    reg:           headerIndex(header, 'regularpay'),
    ot:            headerIndex(header, 'overtimepay'),
    lump:          headerIndex(header, 'lumpsumpay'),
    otherPay:      headerIndex(header, 'otherpay'),
    wages:         headerIndex(header, 'totalwages'),
    // Employer-paid defined-benefit pension contribution (main pension).
    pension:       headerIndex(header, 'definedbenefitplancontribution', 'definedbenefitpensioncontribution'),
    // Health + dental + vision benefits.
    health:        headerIndex(header, 'healthdentalvision'),
    // Authoritative "all retirement + health" sum from CMS — preferred
    // when present because it also includes EmployeesRetirementCostCovered
    // + DeferredCompensationPlan that we don't surface separately.
    totalBenefits: headerIndex(header, 'totalretirementandhealthcontribution', 'totalretirementandhealth'),
    eid:           headerIndex(header, 'employeeidentifier', 'employeeid'),
    notes:         headerIndex(header, 'notes'),
  };
  const out: CompRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const totalWages = toNum(cols[idx.wages]);
    const pension    = toNum(cols[idx.pension]);
    const health     = toNum(cols[idx.health]);
    const benefits   = idx.totalBenefits >= 0 ? toNum(cols[idx.totalBenefits]) : (pension + health);
    out.push({
      department:    (cols[idx.dept] ?? '').trim(),
      position:      (cols[idx.pos] ?? '').trim(),
      otherPositions:(cols[idx.other] ?? '').trim(),
      regularPay:    toNum(cols[idx.reg]),
      overtime:      toNum(cols[idx.ot]),
      lumpSum:       toNum(cols[idx.lump]),
      otherPay:      toNum(cols[idx.otherPay]),
      totalWages,
      pension,
      health,
      totalCompensation: totalWages + benefits,
      employeeId:    idx.eid >= 0 ? (cols[idx.eid] ?? '').trim() : '',
      notes:         idx.notes >= 0 ? (cols[idx.notes] ?? '').trim() : '',
    });
  }
  return out;
}

function computeTotals(rows: CompRow[]): CompPayload['totals'] {
  let wages = 0, retirementAndHealth = 0;
  for (const r of rows) {
    wages += r.totalWages;
    retirementAndHealth += r.pension + r.health;
  }
  return {
    employees: rows.length,
    totalWages: wages,
    totalRetirementAndHealth: retirementAndHealth,
    grandTotal: wages + retirementAndHealth,
  };
}

// State Controller's "Government Compensation in California" portal —
// the canonical URL pattern is on gcc.sco.ca.gov, indexed by a numeric
// `entityid`. Contra Costa County is entityid=7.
const ENTITY = 'Contra Costa County';
const ENTITY_ID = 7;          // CCC's gcc.sco.ca.gov entityid
const ENTITY_TYPE = 'Counties';

async function tryYear(year: number): Promise<{ csv: string; url: string } | null> {
  // Verified URL pattern from the browser's "Download CSV" link:
  // /Reports/GetReport.aspx?reportName=ExpEmployees&fileType=csv
  // &parameterList=Year:YYYY;EntityID:N;
  // The parameterList uses ':' / ';' delimiters; we leave them
  // un-encoded because that's the format the server expects.
  const params = `parameterList=Year:${year};EntityID:${ENTITY_ID};`;
  const variants = [
    `https://gcc.sco.ca.gov/Reports/GetReport.aspx?reportName=ExpEmployees&fileType=csv&${params}`,
    `https://gcc.sco.ca.gov/Reports/GetReport.aspx?reportName=ExpEmployees&fileType=CSV&${params}`,
  ];
  for (const url of variants) {
    const csv = await safeText(url, `gcc-${year}`);
    if (csv && csv.length > 1000 && /position/i.test(csv) && /totalwages/i.test(csv.replace(/\s+/g, ''))) {
      return { csv, url };
    }
  }
  return null;
}

export async function fetchCccCompensation(): Promise<CompPayload | null> {
  // State Controller publishes ~12-18 months after year close. Walk
  // back only 2 years to keep the cron under Railway's HTTP proxy
  // budget — 2 years × 3 URLs × 8s ≈ 48s worst case.
  const thisYear = new Date().getUTCFullYear();
  for (const year of [thisYear - 1, thisYear - 2]) {
    const hit = await tryYear(year);
    if (!hit) continue;
    const rows = parseCompCsv(hit.csv);
    if (rows.length < 10) continue;       // sanity check
    const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort();
    return {
      scrapedAt: new Date().toISOString(),
      year, entity: ENTITY,
      sourceUrl: hit.url,
      rows, departments,
      totals: computeTotals(rows),
    };
  }
  console.warn('[comp] no populated year found');
  return null;
}
