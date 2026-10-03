// Quick-glance data for the dashboard info column: tides, sports, fire
// weather, sun/moon/sky, pollen and reservoirs. All free public sources.
// Fetchers are independent (Promise.allSettled) so one failing source
// never blanks the others; the cron stores the three bundles below.

import { getLocation, getNoaaGridpoint } from './location';
import { tzOffsetMinutes, zonedDate, zonedEpoch } from './tz';

const TIMEOUT_MS = 20000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, ...headers } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} ${url}`);
    return r;
  } finally { clearTimeout(timer); }
}
const getJson = async <T>(url: string, headers?: Record<string, string>): Promise<T> =>
  (await get(url, { Accept: 'application/json', ...headers })).json() as Promise<T>;
const getText = async (url: string): Promise<string> => (await get(url)).text();

// ---- Types --------------------------------------------------------------

export interface TideEvent { at: number; v: number; type: 'H' | 'L' }
export interface TidesData {
  station: string;
  events: TideEvent[];                      // upcoming high/low, epoch seconds
  level: { at: number; v: number } | null;  // latest observed (ft above MLLW)
}

export interface SkyDay {
  date: string;                // YYYY-MM-DD (local)
  sunrise?: number; sunset?: number; dusk?: number;
  moonrise?: number; moonset?: number;
  phase: string;               // "Waning Crescent"
  illum: string;               // "47%"
}
export interface SkyData { days: SkyDay[]; phases: { phase: string; at: number }[] }

export interface PollenData {
  today: { index: number; triggers: string[] } | null;
  outlook: { date: string; index: number }[];   // today + following days
}

export interface Reservoir {
  id: string; name: string;
  storageAF: number | null; capacityAF: number | null;
  pctCapacity: number | null; pctAverage: number | null; changeAF: number | null;
}

export interface SportsTeam {
  key: string; name: string; record?: string; standing?: string;
  last?: { at: number; opp: string; home: boolean; us: number; them: number; won: boolean };
  next?: { at: number; opp: string; home: boolean; neutral?: boolean };
  live?: { opp: string; home: boolean; us: number | null; them: number | null; detail: string };
}

export interface FireWeather {
  from: number; to: number;                // window the stats cover (epoch s)
  minRh: number | null; maxGustMph: number | null; maxWindMph: number | null; maxTempF: number | null;
}

export interface GlanceLive   { fetchedAt: string; tides: TidesData | null; sports: SportsTeam[]; errors: Record<string, string> }
export interface GlanceHourly { fetchedAt: string; fire: FireWeather | null; errors: Record<string, string> }
export interface GlanceDaily  { fetchedAt: string; sky: SkyData | null; pollen: PollenData | null; reservoirs: Reservoir[]; errors: Record<string, string> }

// ---- Tides (NOAA CO-OPS, Martinez-Amorco Pier) --------------------------

const TIDE_STATION = '9415102';

async function tides(): Promise<TidesData> {
  const tz = getLocation().timezone;
  const day = (d: Date) => zonedDate(d, tz).replace(/-/g, '');
  const now = new Date();
  const base = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
  const common = `application=mtzcity&station=${TIDE_STATION}&datum=MLLW&time_zone=gmt&units=english&format=json`;
  const [pred, obs] = await Promise.allSettled([
    getJson<{ predictions?: { t: string; v: string; type: string }[] }>(
      `${base}?product=predictions&interval=hilo&begin_date=${day(now)}&end_date=${day(new Date(now.getTime() + 3 * 86400_000))}&${common}`),
    getJson<{ data?: { t: string; v: string }[] }>(`${base}?product=water_level&date=latest&${common}`),
  ]);
  if (pred.status === 'rejected') throw pred.reason;
  // time_zone=gmt so "YYYY-MM-DD HH:MM" is UTC — unambiguous across DST.
  const utc = (t: string) => Date.parse(`${t.replace(' ', 'T')}:00Z`) / 1000;
  const cutoff = now.getTime() / 1000 - 3 * 3600;
  const events: TideEvent[] = (pred.value.predictions ?? [])
    .map((p) => ({ at: utc(p.t), v: Number(p.v), type: (p.type === 'H' ? 'H' : 'L') as 'H' | 'L' }))
    .filter((e) => Number.isFinite(e.at) && Number.isFinite(e.v) && e.at >= cutoff);
  let level: TidesData['level'] = null;
  if (obs.status === 'fulfilled' && obs.value.data?.[0]) {
    const o = obs.value.data[0];
    const v = Number(o.v);
    if (Number.isFinite(v)) level = { at: utc(o.t), v };
  }
  return { station: 'Martinez-Amorco Pier', events, level };
}

// ---- Sky: sun / moon (US Naval Observatory) -----------------------------

async function sky(): Promise<SkyData> {
  const loc = getLocation();
  const tz = loc.timezone;
  const days: SkyDay[] = [];
  const hhmm = (date: string, t?: string): number | undefined => {
    const m = t?.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return undefined;
    const [y, mo, d] = date.split('-').map(Number);
    return zonedEpoch(y, mo - 1, d, Number(m[1]), Number(m[2]), tz);
  };
  type Oneday = { properties?: { data?: {
    curphase?: string; fracillum?: string;
    sundata?: { phen: string; time: string }[]; moondata?: { phen: string; time: string }[];
  } } };
  for (let i = 0; i < 3; i++) {
    const at = new Date(Date.now() + i * 86400_000);
    const date = zonedDate(at, tz);
    const off = tzOffsetMinutes(new Date(`${date}T12:00:00Z`), tz) / 60;
    const j = await getJson<Oneday>(
      `https://aa.usno.navy.mil/api/rstt/oneday?date=${date}&coords=${loc.lat},${loc.lon}&tz=${off}&dst=false`);
    const d = j.properties?.data;
    if (!d) continue;
    const find = (arr: { phen: string; time: string }[] | undefined, phen: string) => arr?.find((x) => x.phen === phen)?.time;
    days.push({
      date,
      sunrise: hhmm(date, find(d.sundata, 'Rise')),
      sunset: hhmm(date, find(d.sundata, 'Set')),
      dusk: hhmm(date, find(d.sundata, 'End Civil Twilight')),
      moonrise: hhmm(date, find(d.moondata, 'Rise')),
      moonset: hhmm(date, find(d.moondata, 'Set')),
      phase: d.curphase ?? '',
      illum: d.fracillum ?? '',
    });
  }
  // Upcoming principal phases — USNO reports these in UT.
  const ph = await getJson<{ phasedata?: { phase: string; year: number; month: number; day: number; time: string }[] }>(
    `https://aa.usno.navy.mil/api/moon/phases/date?date=${zonedDate(new Date(), tz)}&nump=8`);
  const phases = (ph.phasedata ?? []).map((p) => {
    const [h, m] = p.time.split(':').map(Number);
    return { phase: p.phase, at: Math.floor(Date.UTC(p.year, p.month - 1, p.day, h, m) / 1000) };
  });
  if (!days.length) throw new Error('USNO returned no sun/moon data');
  return { days, phases };
}

// ---- Pollen (pollen.com — unofficial JSON, needs a Referer) -------------

async function pollen(): Promise<PollenData> {
  const zip = process.env.POLLEN_ZIP?.trim() || '94553';
  const ref = (kind: string) => ({ Referer: `https://www.pollen.com/forecast/${kind}/pollen/${zip}` });
  type Cur = { Location?: { periods?: { Type: string; Index: number; Triggers?: { Name: string }[] }[] } };
  type Ext = { Location?: { periods?: { Period: string; Index: number }[] } };
  const [cur, ext] = await Promise.allSettled([
    getJson<Cur>(`https://www.pollen.com/api/forecast/current/pollen/${zip}`, ref('current')),
    getJson<Ext>(`https://www.pollen.com/api/forecast/extended/pollen/${zip}`, ref('extended')),
  ]);
  if (cur.status === 'rejected' && ext.status === 'rejected') throw cur.reason;
  const today = cur.status === 'fulfilled'
    ? cur.value.Location?.periods?.find((p) => p.Type === 'Today') : undefined;
  const outlook = ext.status === 'fulfilled'
    ? (ext.value.Location?.periods ?? []).map((p) => ({ date: p.Period.slice(0, 10), index: p.Index })) : [];
  return {
    today: today ? { index: today.Index, triggers: (today.Triggers ?? []).map((t) => t.Name) } : null,
    outlook,
  };
}

// ---- Reservoirs (CDEC daily reservoir report) ---------------------------

const RESERVOIRS: [string, string][] = [
  ['SHA', 'Shasta'], ['ORO', 'Oroville'], ['FOL', 'Folsom'], ['SNL', 'San Luis'], ['PAR', 'Pardee (EBMUD)'],
];

async function reservoirs(): Promise<Reservoir[]> {
  const html = await getText('https://cdec.water.ca.gov/reportapp/javareports?name=RES');
  const num = (s: string | undefined) => {
    const n = Number((s ?? '').replace(/,/g, ''));
    return s && /\d/.test(s) && Number.isFinite(n) ? n : null;
  };
  const byId = new Map<string, string[]>();
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map((c) => c[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (cells.length >= 9) byId.set(cells[1], cells);
  }
  const out: Reservoir[] = [];
  for (const [id, name] of RESERVOIRS) {
    const c = byId.get(id);
    if (!c) continue;
    out.push({
      id, name,
      capacityAF: num(c[2]), storageAF: num(c[4]), changeAF: num(c[5]),
      pctCapacity: num(c[6]), pctAverage: num(c[8]),
    });
  }
  if (!out.length) throw new Error('CDEC reservoir table not found');
  return out;
}

// ---- Sports (ESPN public site API) --------------------------------------

const TEAMS: { key: string; name: string; sport: string; slug: string }[] = [
  { key: 'sf-giants',  name: 'Giants',   sport: 'baseball/mlb',     slug: 'sf' },
  { key: 'oak-ath',    name: "A's",      sport: 'baseball/mlb',     slug: 'ath' },
  { key: 'gs-warriors', name: 'Warriors', sport: 'basketball/nba',  slug: 'gs' },
  { key: 'sf-49ers',   name: '49ers',    sport: 'football/nfl',     slug: 'sf' },
  { key: 'sj-sharks',  name: 'Sharks',   sport: 'hockey/nhl',       slug: 'sj' },
];

interface EspnComp {
  competitors?: { id?: string; homeAway?: string; winner?: boolean; team?: { id?: string; abbreviation?: string };
    score?: { displayValue?: string; value?: number } | string }[];
  neutralSite?: boolean;
  status?: { type?: { completed?: boolean; state?: string; shortDetail?: string } };
}
interface EspnEvent { id?: string; date: string; competitions?: EspnComp[] }

const scoreOf = (s: EspnComp['competitors'] extends (infer C)[] | undefined ? C : never): number | null => {
  const sc = (s as { score?: { displayValue?: string; value?: number } | string }).score;
  const n = typeof sc === 'string' ? Number(sc) : Number(sc?.displayValue ?? sc?.value);
  return Number.isFinite(n) ? n : null;
};

async function team(t: (typeof TEAMS)[number]): Promise<SportsTeam> {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${t.sport}/teams/${t.slug}`;
  const [info, s0, s2] = await Promise.allSettled([
    getJson<{ team?: { id?: string; record?: { items?: { summary?: string }[] }; standingSummary?: string; nextEvent?: EspnEvent[] } }>(base),
    getJson<{ events?: EspnEvent[] }>(`${base}/schedule`),
    getJson<{ events?: EspnEvent[] }>(`${base}/schedule?seasontype=2`),
  ]);
  if (info.status === 'rejected') throw info.reason;
  const tm = info.value.team ?? {};
  const myId = tm.id;
  const out: SportsTeam = { key: t.key, name: t.name, record: tm.record?.items?.[0]?.summary, standing: tm.standingSummary };

  const me = (c: NonNullable<EspnComp['competitors']>[number]) => (c.team?.id ?? c.id) === myId;
  const describe = (e: EspnEvent) => {
    const comp = e.competitions?.[0];
    const mine = comp?.competitors?.find(me);
    const opp = comp?.competitors?.find((c) => !me(c));
    return { comp, mine, opp, at: Math.floor(Date.parse(e.date) / 1000) };
  };

  // Most recent completed game across the current and regular-season schedules.
  const events = new Map<string, EspnEvent>();
  for (const r of [s0, s2]) if (r.status === 'fulfilled') for (const e of r.value.events ?? []) events.set(e.id ?? e.date, e);
  const done = [...events.values()]
    .filter((e) => e.competitions?.[0]?.status?.type?.completed)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const lastEv = done[done.length - 1];
  if (lastEv) {
    const { mine, opp, at } = describe(lastEv);
    const us = mine ? scoreOf(mine) : null;
    const them = opp ? scoreOf(opp) : null;
    if (mine && opp && us != null && them != null) {
      out.last = { at, opp: opp.team?.abbreviation ?? '?', home: mine.homeAway === 'home', us, them, won: us > them };
    }
  }

  // team.nextEvent: only trust it while upcoming or in progress (it lingers
  // on the final game of a finished season).
  const ne = tm.nextEvent?.[0];
  if (ne) {
    const { comp, mine, opp, at } = describe(ne);
    const state = comp?.status?.type?.state;
    if (state === 'pre' && opp) out.next = { at, opp: opp.team?.abbreviation ?? '?', home: mine?.homeAway === 'home', neutral: comp?.neutralSite || undefined };
    if (state === 'in' && opp) {
      out.live = {
        opp: opp.team?.abbreviation ?? '?', home: mine?.homeAway === 'home',
        us: mine ? scoreOf(mine) : null, them: scoreOf(opp), detail: comp?.status?.type?.shortDetail ?? 'Live',
      };
    }
  }
  return out;
}

async function sports(): Promise<SportsTeam[]> {
  const results = await Promise.allSettled(TEAMS.map(team));
  const out = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!out.length) throw new Error('ESPN returned nothing for any team');
  return out;
}

// ---- Fire weather (NWS gridpoint) ---------------------------------------
// The MTR office doesn't publish the grassland fire-danger / Haines grids,
// so we summarize the inputs that drive red-flag criteria for the next 24h.

async function fireWeather(): Promise<FireWeather> {
  const gp = await getNoaaGridpoint();
  const headers: Record<string, string> = { Accept: 'application/geo+json' };
  if (process.env.NOAA_TOKEN) headers.Authorization = `Bearer ${process.env.NOAA_TOKEN}`;
  type Series = { uom?: string; values?: { validTime: string; value: number | null }[] };
  const j = await getJson<{ properties?: Record<string, Series> }>(
    `https://api.weather.gov/gridpoints/${gp.wfo}/${gp.x},${gp.y}`, headers);
  const p = j.properties ?? {};
  const from = Math.floor(Date.now() / 1000);
  const to = from + 24 * 3600;
  const within = (name: string): number[] =>
    (p[name]?.values ?? []).flatMap((v) => {
      const start = Date.parse(v.validTime.split('/')[0]) / 1000;
      return v.value != null && start >= from - 3600 && start <= to ? [v.value] : [];
    });
  const kmhToMph = (n: number) => n * 0.621371;
  const stat = (name: string, f: (xs: number[]) => number, conv: (n: number) => number = (n) => n): number | null => {
    const xs = within(name);
    return xs.length ? Math.round(conv(f(xs))) : null;
  };
  return {
    from, to,
    minRh: stat('relativeHumidity', (xs) => Math.min(...xs)),
    maxGustMph: stat('windGust', (xs) => Math.max(...xs), kmhToMph),
    maxWindMph: stat('windSpeed', (xs) => Math.max(...xs), kmhToMph),
    maxTempF: stat('temperature', (xs) => Math.max(...xs), (c) => c * 9 / 5 + 32),
  };
}

// ---- Bundles ------------------------------------------------------------

function settle<T>(r: PromiseSettledResult<T>, id: string, errors: Record<string, string>): T | null {
  if (r.status === 'fulfilled') return r.value;
  errors[id] = r.reason instanceof Error ? r.reason.message : String(r.reason);
  return null;
}

export async function fetchGlanceLive(): Promise<GlanceLive> {
  const errors: Record<string, string> = {};
  const [t, s] = await Promise.allSettled([tides(), sports()]);
  return { fetchedAt: new Date().toISOString(), tides: settle(t, 'tides', errors), sports: settle(s, 'sports', errors) ?? [], errors };
}

export async function fetchGlanceHourly(): Promise<GlanceHourly> {
  const errors: Record<string, string> = {};
  const [f] = await Promise.allSettled([fireWeather()]);
  return { fetchedAt: new Date().toISOString(), fire: settle(f, 'fire', errors), errors };
}

export async function fetchGlanceDaily(): Promise<GlanceDaily> {
  const errors: Record<string, string> = {};
  const [s, p, r] = await Promise.allSettled([sky(), pollen(), reservoirs()]);
  return {
    fetchedAt: new Date().toISOString(),
    sky: settle(s, 'sky', errors), pollen: settle(p, 'pollen', errors), reservoirs: settle(r, 'reservoirs', errors) ?? [],
    errors,
  };
}
