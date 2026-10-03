import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Live BART departures for the stations nearest Martinez. Uses BART's
// public demo API key (api.bart.gov); results are cached for 30s so many
// open tabs cost one upstream call set.

const KEY = process.env.BART_KEY?.trim() || 'MW9S-E7SL-26DU-VV8V';
const STATIONS: [string, string][] = [
  ['PHIL', 'Pleasant Hill'],
  ['CONC', 'Concord'],
  ['PITT', 'Pittsburg/Bay Point'],
];

export interface BartTrain { mins: number; dest: string; color: string; late: boolean }
export interface BartStation { abbr: string; name: string; north: BartTrain[]; south: BartTrain[] }
export interface BartPayload { at: number; stations: BartStation[] }

const arr = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

type Etd = { destination: string; estimate?: Est | Est[] };
type Est = { minutes: string; direction: string; hexcolor: string; delay?: string; cancelflag?: string };

async function station(abbr: string, name: string): Promise<BartStation> {
  const r = await fetch(`https://api.bart.gov/api/etd.aspx?cmd=etd&orig=${abbr}&key=${KEY}&json=y`, {
    headers: { 'User-Agent': 'mtz.city (mtz-city)' }, cache: 'no-store',
  });
  if (!r.ok) throw new Error(`BART ${abbr}: ${r.status}`);
  const j = await r.json() as { root?: { station?: { etd?: Etd | Etd[] } | { etd?: Etd | Etd[] }[] } };
  const st = arr(j.root?.station)[0];
  const trains: (BartTrain & { dir: string })[] = [];
  for (const e of arr(st?.etd)) {
    for (const est of arr(e.estimate)) {
      if (est.cancelflag === '1') continue;
      const mins = est.minutes === 'Leaving' ? 0 : Number(est.minutes);
      if (!Number.isFinite(mins)) continue;
      trains.push({ mins, dest: e.destination, color: est.hexcolor, late: Number(est.delay ?? 0) >= 120, dir: est.direction });
    }
  }
  trains.sort((a, b) => a.mins - b.mins);
  const pick = (dir: string): BartTrain[] =>
    trains.filter((t) => t.dir === dir).slice(0, 3).map(({ dir: _d, ...t }) => t);
  return { abbr, name, north: pick('North'), south: pick('South') };
}

let cache: { at: number; body: BartPayload } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 30_000) return NextResponse.json(cache.body);
  const results = await Promise.allSettled(STATIONS.map(([a, n]) => station(a, n)));
  const stations = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!stations.length) return NextResponse.json({ error: 'BART unavailable' }, { status: 502 });
  const body: BartPayload = { at: Date.now(), stations };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
