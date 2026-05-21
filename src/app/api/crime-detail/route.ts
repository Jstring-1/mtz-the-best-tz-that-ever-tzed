import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const KEY = process.env.GOV_API_TOKEN ?? '';

// FBI CDE summarized endpoints return:
//   { offenses: { actuals: { "<offense-key>": { "YYYY-MM": count, ... } } } }
interface FbiResp { offenses?: { actuals?: Record<string, Record<string, number>> } }

const AGENCIES: Array<{ ori: string; name: string }> = [
  { ori: 'CA0070500', name: 'Martinez Police Department' },
  { ori: 'CA0070000', name: 'Contra Costa County Sheriff' },
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

async function fetchOne(ori: string, offense: string, year: number) {
  const url =
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/${offense}` +
    `?from=01-${year}&to=12-${year}&API_KEY=${KEY}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return 0;
    const j = await r.json() as FbiResp;
    const buckets = j.offenses?.actuals ?? {};
    let n = 0;
    for (const k of Object.keys(buckets)) {
      for (const v of Object.values(buckets[k] as Record<string, number>)) {
        n += Number(v) || 0;
      }
    }
    return n;
  } catch { return 0; }
}

async function fetchAgency(ori: string, name: string) {
  const thisYear = new Date().getUTCFullYear();
  let year = 0;
  let counts: Record<string, number> = {};
  for (const candidate of [thisYear - 1, thisYear - 2, thisYear - 3, thisYear - 4]) {
    const settled = await Promise.allSettled(OFFENSES.map(([k]) => fetchOne(ori, k, candidate)));
    const tally: Record<string, number> = {};
    OFFENSES.forEach(([k], i) => {
      tally[k] = settled[i].status === 'fulfilled' ? settled[i].value : 0;
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
    ori, name, year, rows, violent, property, total: violent + property,
    cdeUrl: `https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend/state/CA/${ori}`,
  };
}

export async function GET() {
  if (!KEY) return NextResponse.json({ error: 'GOV_API_TOKEN not set' }, { status: 500 });
  // Fan out per-agency in parallel.
  const results = await Promise.all(AGENCIES.map((a) => fetchAgency(a.ori, a.name)));
  // Keep the legacy single-agency shape too so older clients don't
  // break — populate it from the first agency (Martinez PD).
  const primary = results[0];
  return NextResponse.json({
    agencies: results,
    // Legacy single-agency fields (Martinez PD), for back-compat.
    agency: primary.name,
    year: primary.year,
    rows: primary.rows,
    violent: primary.violent,
    property: primary.property,
    total: primary.total,
    cdeUrl: primary.cdeUrl,
  });
}
