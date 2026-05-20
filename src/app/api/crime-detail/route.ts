import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const KEY = process.env.GOV_API_TOKEN ?? '';
const ORI = 'CA0070500'; // Martinez Police Department

// FBI CDE summarized endpoints return:
//   { offenses: { actuals: { "<offense-key>": { "YYYY-MM": count, ... } } } }
// We fetch each offense category for the latest year that has data
// (FBI data tends to lag 1–2 years).
interface FbiResp { offenses?: { actuals?: Record<string, Record<string, number>> } }

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

async function fetchOne(offense: string, year: number) {
  const url =
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}` +
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

export async function GET() {
  if (!KEY) return NextResponse.json({ error: 'GOV_API_TOKEN not set' }, { status: 500 });

  // Find the most-recent year that has any data (try 4 years back).
  const thisYear = new Date().getUTCFullYear();
  let year = 0;
  let counts: Record<string, number> = {};
  for (const candidate of [thisYear - 1, thisYear - 2, thisYear - 3, thisYear - 4]) {
    const settled = await Promise.allSettled(OFFENSES.map(([k]) => fetchOne(k, candidate)));
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
  const violent   = (counts['homicide'] ?? 0) + (counts['rape'] ?? 0) + (counts['robbery'] ?? 0) + (counts['aggravated-assault'] ?? 0);
  const property  = (counts['burglary'] ?? 0) + (counts['larceny'] ?? 0) + (counts['motor-vehicle-theft'] ?? 0) + (counts['arson'] ?? 0);
  return NextResponse.json({
    agency: 'Martinez Police Department',
    year,
    rows,
    violent,
    property,
    total: violent + property,
    cdeUrl: `https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend/state/CA/${ORI}`,
  });
}
