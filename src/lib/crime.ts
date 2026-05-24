// FBI Crime Data Explorer fetcher — runs in the 12h cron and stores
// the results in apis_json under `crime_data`. The /api/crime-detail
// route serves the cached payload so opening the popup doesn't fire
// dozens of live FBI requests each time (which was hitting the
// api.data.gov rate limit and showing all zeros).
//
// Auto-corrects mislabeled ORIs by surfacing whichever `agency_name`
// the FBI returns inside `offenses.actuals` (the key looks like
// "<Agency Name> Offenses"). Display label falls back to our hard-
// coded name only when the FBI response is empty.

const KEY = process.env.GOV_API_TOKEN ?? '';

const AGENCIES: Array<{ ori: string; fallbackName: string }> = [
  // ORI codes used by /api/crime-detail. CA0070500 was originally
  // labeled "Martinez Police Department" here but verification suggests
  // it's actually El Cerrito — the FBI response now provides the
  // real name and we display that.
  { ori: 'CA0070500', fallbackName: 'Martinez area PD' },
  { ori: 'CA0070000', fallbackName: 'Contra Costa County Sheriff' },
];

const OFFENSES: Array<[string, string]> = [
  ['homicide',             'Homicide'],
  ['rape',                 'Rape'],
  ['robbery',              'Robbery'],
  ['aggravated-assault',   'Aggravated assault'],
  ['burglary',             'Burglary'],
  ['larceny',              'Larceny / theft'],
  ['motor-vehicle-theft',  'Motor vehicle theft'],
  ['arson',                'Arson'],
];

interface FbiResp { offenses?: { actuals?: Record<string, Record<string, number>> } }

export interface CrimeAgencyData {
  ori: string;
  name: string;
  year: number;
  rows: Array<{ key: string; label: string; count: number }>;
  violent: number;
  property: number;
  total: number;
  cdeUrl: string;
}
export interface CrimePayload {
  scrapedAt: string;
  agencies: CrimeAgencyData[];
}

// Fetch one (ORI, offense, year) and return { count, agencyName }.
// Sums ONLY the "<Agency> Offenses" keys — skips "<Agency> Clearances"
// (which are a subset of offenses and would double-count).
async function fetchOne(ori: string, offense: string, year: number): Promise<{ count: number; agencyName: string | null }> {
  const url =
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/${offense}` +
    `?from=01-${year}&to=12-${year}&API_KEY=${KEY}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return { count: 0, agencyName: null };
    const j = await r.json() as FbiResp;
    const buckets = j.offenses?.actuals ?? {};
    let n = 0;
    let firstAgency: string | null = null;
    for (const k of Object.keys(buckets)) {
      // Only sum offense keys; skip clearances and any other dimension.
      if (!/\bOffenses?\b/i.test(k)) continue;
      if (!firstAgency) firstAgency = k.replace(/\s+Offenses?$/i, '').trim();
      for (const v of Object.values(buckets[k] as Record<string, number>)) {
        n += Number(v) || 0;
      }
    }
    return { count: n, agencyName: firstAgency };
  } catch { return { count: 0, agencyName: null }; }
}

async function fetchAgency(ori: string, fallbackName: string): Promise<CrimeAgencyData> {
  const thisYear = new Date().getUTCFullYear();
  let year = 0;
  let counts: Record<string, number> = {};
  let detectedName: string | null = null;
  // Walk back up to 4 years to find a year with real data.
  for (const candidate of [thisYear - 1, thisYear - 2, thisYear - 3, thisYear - 4]) {
    const settled = await Promise.allSettled(OFFENSES.map(([k]) => fetchOne(ori, k, candidate)));
    const tally: Record<string, number> = {};
    OFFENSES.forEach(([k], i) => {
      if (settled[i].status === 'fulfilled') {
        tally[k] = settled[i].value.count;
        if (!detectedName && settled[i].value.agencyName) detectedName = settled[i].value.agencyName;
      } else {
        tally[k] = 0;
      }
    });
    if (Object.values(tally).some((n) => n > 0)) {
      counts = tally;
      year = candidate;
      break;
    }
  }
  const rows = OFFENSES.map(([k, label]) => ({ key: k, label, count: counts[k] ?? 0 }));
  const violent  = (counts['homicide'] ?? 0) + (counts['rape'] ?? 0) + (counts['robbery'] ?? 0) + (counts['aggravated-assault'] ?? 0);
  const property = (counts['burglary'] ?? 0) + (counts['larceny'] ?? 0) + (counts['motor-vehicle-theft'] ?? 0) + (counts['arson'] ?? 0);
  return {
    ori,
    name: detectedName ?? fallbackName,
    year,
    rows,
    violent,
    property,
    total: violent + property,
    cdeUrl: `https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend/state/CA/${ori}`,
  };
}

export async function fetchCrimePayload(): Promise<CrimePayload> {
  // Fan out per-agency in parallel. Per-agency walks back through years
  // sequentially (within the agency).
  const agencies = await Promise.all(AGENCIES.map((a) => fetchAgency(a.ori, a.fallbackName)));
  return { scrapedAt: new Date().toISOString(), agencies };
}
