// Background refresh jobs.  Each function is a single API → cache write.
// Buckets group jobs by refresh cadence.  /api/cron?bucket=… runs one bucket.

import { sql } from './db';
import { getLocation, getNoaaGridpoint } from './location';
import {
  upsertJsonMany,
  upsertXmlMany,
  upsertMiscMany,
  upsertPlaces,
  upsertFeeds,
  upsertNoaaHourly,
} from './cache';

export type Bucket = '1m' | '2m' | '5m' | '15m' | '1h' | '4h' | '12h' | 'all';
export const BUCKETS: Bucket[] = ['1m', '2m', '5m', '15m', '1h', '4h', '12h', 'all'];

const NOAA_LOCAL_CODES = new Set([
  'CAC001','CAC013','CAC033','CAC041','CAC055','CAC067','CAC075','CAC077',
  'CAC081','CAC085','CAC087','CAC095','CAC097','CAC113',
  'CAZ006','CAZ017','CAZ018','CAZ019','CAZ112','CAZ113','CAZ115',
  'CAZ502','CAZ503','CAZ504','CAZ505','CAZ506','CAZ508','CAZ509',
  'CAZ510','CAZ512','CAZ513','CAZ514','CAZ515','CAZ529',
]);

interface RunResult {
  ok: string[];
  errors: Record<string, string>;
  ms: number;
}

async function safe<T>(name: string, fn: () => Promise<T>, ok: string[], errors: Record<string, string>): Promise<T | undefined> {
  try {
    const v = await fn();
    ok.push(name);
    return v;
  } catch (e) {
    errors[name] = e instanceof Error ? e.message : String(e);
    return undefined;
  }
}

// Helpers -----------------------------------------------------------------

function userAgent() {
  const loc = getLocation();
  return `${loc.siteName} (mtz-city; +https://${loc.siteName})`;
}

async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'User-Agent': userAgent(), Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} ${url}`);
  return (await r.json()) as T;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const r = await fetch(url, {
    ...init,
    headers: { 'User-Agent': userAgent(), ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} ${url}`);
  return await r.text();
}

function noaaHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOAA_TOKEN ?? ''}`,
    'User-Agent': userAgent(),
  };
}

// Bucket implementations --------------------------------------------------

async function noaaAlerts(json: Record<string, unknown>) {
  const r = await fetchJson<{ features?: { id: string; properties: Record<string, unknown> }[] }>(
    'https://api.weather.gov/alerts/active?area=CA',
    { headers: noaaHeaders() }
  );
  if (!r?.features) { json.NOAA_alerts = r; return; }
  const local: Record<string, unknown> = {};
  const notLocal: Record<string, unknown> = {};
  for (const f of r.features) {
    const zones = (f.properties?.affectedZones as string[] | undefined) ?? [];
    const isLocal = zones.some((z) => NOAA_LOCAL_CODES.has(z.slice(-6)));
    (isLocal ? local : notLocal)[f.id] = f;
  }
  const flatten = (bag: Record<string, unknown>) => {
    if (!Object.keys(bag).length) return 'No Alerts';
    const out: Record<string, unknown> = {};
    for (const [id, fAny] of Object.entries(bag)) {
      const f = fAny as { properties: Record<string, unknown> };
      const p = f.properties;
      const dates = ['sent', 'effective', 'onset', 'expires', 'ends'];
      const keys = ['areaDesc', 'status', 'messageType', 'severity', 'certainty', 'urgency', 'event', 'senderName', 'headline', 'description', 'response', 'affectedZones'];
      const o: Record<string, unknown> = {};
      for (const d of dates) {
        const raw = p[d];
        if (typeof raw === 'string') {
          const t = raw.replace('T', ' ').slice(0, 16);
          const ms = Date.parse(t);
          if (!Number.isNaN(ms)) o[d] = Math.floor(ms / 1000);
        }
      }
      for (const k of keys) o[k] = p[k] ?? null;
      const nws = (p.parameters as Record<string, string[]> | undefined)?.NWSheadline;
      o.NWSheadline = nws?.[0] ?? '';
      out[id] = o;
    }
    return out;
  };
  json.NOAA_alerts = { LOCAL: flatten(local), 'NOT-LOCAL': flatten(notLocal) };
  // Mirror into the structured alerts table.
  const alertRows: Array<{
    id: string; event: string | null; severity: string | null; urgency: string | null;
    certainty: string | null; status: string | null; headline: string | null;
    area_desc: string | null; description: string | null;
    sent_at: number | null; effective_at: number | null; expires_at: number | null;
    scope: string;
  }> = [];
  const harvest = (bag: Record<string, unknown>, scope: 'LOCAL' | 'NOT-LOCAL') => {
    for (const [id, fAny] of Object.entries(bag)) {
      const p = (fAny as { properties: Record<string, unknown> }).properties;
      const ts = (k: string) => {
        const v = p[k];
        if (typeof v !== 'string') return null;
        const ms = Date.parse(v);
        return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
      };
      const nws = (p.parameters as Record<string, string[]> | undefined)?.NWSheadline?.[0] ?? null;
      alertRows.push({
        id,
        event: (p.event as string | null) ?? null,
        severity: (p.severity as string | null) ?? null,
        urgency: (p.urgency as string | null) ?? null,
        certainty: (p.certainty as string | null) ?? null,
        status: (p.status as string | null) ?? null,
        headline: nws ?? (p.headline as string | null) ?? null,
        area_desc: (p.areaDesc as string | null) ?? null,
        description: (p.description as string | null) ?? null,
        sent_at: ts('sent'),
        effective_at: ts('effective'),
        expires_at: ts('expires'),
        scope,
      });
    }
  };
  harvest(local, 'LOCAL');
  harvest(notLocal, 'NOT-LOCAL');
  if (alertRows.length) {
    const { upsertAlerts } = await import('./store');
    await upsertAlerts(alertRows);
  }
}

async function weatherapiCurrent(json: Record<string, unknown>) {
  const key = process.env.WEATHERAPI_KEY ?? '';
  const loc = getLocation();
  const params = new URLSearchParams({ key, q: `${loc.lat},${loc.lon}`, dt: new Date().toISOString().slice(0, 10), days: '3' });
  json.weatherAPI = await fetchJson(`http://api.weatherapi.com/v1/current.json?${params}`);
}

async function purpleair(json: Record<string, unknown>) {
  const loc = getLocation();
  if (!loc.purpleAirSensor) return;
  const id = `purple_air_${loc.purpleAirSensor}`;
  const params = new URLSearchParams({
    sensor_index: loc.purpleAirSensor,
    fields: 'temperature,humidity,pressure,pm2.5,visual_range',
  });
  json[id] = await fetchJson(`https://api.purpleair.com/v1/sensors/${loc.purpleAirSensor}?${params}`, {
    headers: { 'X-API-Key': process.env.PURPLEAIR_KEY ?? '' },
  });
}

async function noaaBuoys(json: Record<string, unknown>) {
  const loc = getLocation();
  for (const b of loc.noaaBuoys) {
    json[`NOAA_Bouy_${b}`] = await fetchJson(`https://api.weather.gov/stations/${b}/observations/latest`, { headers: noaaHeaders() });
  }
}

async function noaaForecast(json: Record<string, unknown>) {
  const gp = await getNoaaGridpoint();
  json.NOAA_gp_forecast = await fetchJson(`https://api.weather.gov/gridpoints/${gp.wfo}/${gp.x},${gp.y}/forecast`, { headers: noaaHeaders() });
}

async function noaaHourly(json: Record<string, unknown>) {
  const gp = await getNoaaGridpoint();
  type Periods = { properties?: { periods?: Array<Record<string, unknown>> } };
  const r = await fetchJson<Periods>(`https://api.weather.gov/gridpoints/${gp.wfo}/${gp.x},${gp.y}/forecast/hourly`, { headers: noaaHeaders() });
  json.NOAA_gp_forecast_hrly = r;
  const periods = r?.properties?.periods;
  if (!Array.isArray(periods)) return;
  const strip = ['startTime', 'endTime', 'temperatureTrend', 'temperatureUnit', 'isDaytime', 'name', 'number', 'relativeHumidity', 'dewpoint', 'probabilityOfPrecipitation'];
  const rows: { ts: string; json: string }[] = [];
  for (const p of periods) {
    const start = p.startTime as string | undefined;
    if (!start) continue;
    const ms = Date.parse(start);
    if (Number.isNaN(ms)) continue;
    const ts = String(Math.floor(ms / 1000));
    const row: Record<string, unknown> = { ...p };
    const probObj = p.probabilityOfPrecipitation as { value?: number } | undefined;
    const dewObj  = p.dewpoint                   as { value?: number } | undefined;
    const humObj  = p.relativeHumidity           as { value?: number } | undefined;
    row.precipitation = `${probObj?.value ?? ''}%`;
    row.dewpoint      = `${dewObj?.value ?? ''}&deg;C`;
    row.humidity      = `${humObj?.value ?? ''}%`;
    for (const k of strip) delete row[k];
    rows.push({ ts, json: JSON.stringify(row) });
  }
  if (rows.length) await upsertNoaaHourly(rows);
}

async function noaaAviation(json: Record<string, unknown>) {
  json.NOAA_aviation_SIGMETs = await fetchJson('https://api.weather.gov/aviation/sigmets/KCCR', { headers: noaaHeaders() });
}

async function weatherapiMarine(json: Record<string, unknown>) {
  const key = process.env.WEATHERAPI_KEY ?? '';
  const loc = getLocation();
  const params = new URLSearchParams({ key, q: `${loc.lat},${loc.lon}`, dt: new Date().toISOString().slice(0, 10), days: '3' });
  json.weatherAPI_mrn = await fetchJson(`http://api.weatherapi.com/v1/marine.json?${params}`);
}

async function weatherapiForecast(json: Record<string, unknown>) {
  const key = process.env.WEATHERAPI_KEY ?? '';
  const loc = getLocation();
  const params = new URLSearchParams({ key, q: `${loc.lat},${loc.lon}`, dt: new Date().toISOString().slice(0, 10), days: '3' });
  json.weatherAPI_forecast = await fetchJson(`http://api.weatherapi.com/v1/forecast.json?${params}`);
}

async function openweather(json: Record<string, unknown>) {
  const loc = getLocation();
  const params = new URLSearchParams({ units: 'imperial', lat: String(loc.lat), lon: String(loc.lon), appid: process.env.OPENWEATHER_KEY ?? '' });
  json.OPEN_weather = await fetchJson(`https://api.openweathermap.org/data/2.5/weather?${params}`);
}

async function usgsQuakes(json: Record<string, unknown>) {
  type Q = { features?: { id: string; properties: { place?: string; mag?: number; time?: number; url?: string } }[] };
  const r = await fetchJson<Q>('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson');
  const out: Record<string, unknown> = {};
  const rows: Array<{ id: string; magnitude: number | null; place: string; occurred_at: number; url: string | null }> = [];
  for (const eq of r.features ?? []) {
    const place = eq.properties.place ?? '';
    if (!place.endsWith('CA')) continue;
    const occurred_at = Math.round((eq.properties.time ?? 0) / 1000);
    out[eq.id] = {
      magnitude: eq.properties.mag,
      place,
      occurred_at,
      url: eq.properties.url ?? '',
    };
    rows.push({
      id: eq.id,
      magnitude: eq.properties.mag ?? null,
      place,
      occurred_at,
      url: eq.properties.url ?? null,
    });
  }
  json.USGS_earthquakes = out;
  if (rows.length) {
    const { upsertQuakes } = await import('./store');
    await upsertQuakes(rows);
  }
}

async function ebird(json: Record<string, unknown>) {
  const loc = getLocation();
  type Bird = { comName: string; sciName?: string; obsDt?: string; locName?: string; howMany?: number; lat?: number; lng?: number };
  const url = `https://api.ebird.org/v2/data/obs/geo/recent/notable?lat=${loc.lat}&lng=${loc.lon}&back=30&detail=full&dist=8&hotspot=false&maxResults=10000`;
  const data = await fetchJson<Bird[]>(url, {
    headers: {
      'User-Agent': `${userAgent()} (eBird)`,
      'X-eBirdApiToken': process.env.EBIRD_TOKEN ?? '',
    },
  });
  if (!Array.isArray(data)) { json.eBird = []; return; }
  data.reverse();
  const birds: Record<string, unknown> = {};
  const rows: Array<{ id: string; common_name: string; sci_name: string | null; observed_at: number | null; place: string | null; cnt: number | null; lat: number | null; lon: number | null }> = [];
  for (const v of data) {
    if (!v.comName) continue;
    birds[v.comName] = {
      name: v.comName,
      fancy_name: v.sciName ?? '',
      date: v.obsDt ?? '',
      place: v.locName ?? '',
      count: v.howMany ?? null,
      lat: v.lat ?? '',
      lon: v.lng ?? '',
    };
    // Build a stable per-sighting id. Use the upstream date + comName + place
    // + lat/lon — same combination eBird treats as one observation.
    const observed = v.obsDt ? Math.floor(Date.parse(v.obsDt.replace(' ', 'T') + ':00') / 1000) : null;
    const id = `ebird-${slugId(`${v.comName}-${v.obsDt ?? ''}-${v.locName ?? ''}-${v.lat ?? ''}-${v.lng ?? ''}`)}`;
    rows.push({
      id,
      common_name: v.comName,
      sci_name: v.sciName ?? null,
      observed_at: Number.isFinite(observed as number) ? (observed as number) : null,
      place: v.locName ?? null,
      cnt: v.howMany ?? null,
      lat: typeof v.lat === 'number' ? v.lat : null,
      lon: typeof v.lng === 'number' ? v.lng : null,
    });
  }
  json.eBird = birds;
  if (rows.length) {
    const { upsertBirds } = await import('./store');
    await upsertBirds(rows);
  }
}

function slugId(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 100);
}

async function localEvents(json: Record<string, unknown>) {
  const { scrapeAllLocalEvents } = await import('./scrape-events');
  const events = await scrapeAllLocalEvents();
  json['local_events'] = events;
  // Housekeeping: purge any Del Cielo Livermore-location entries that
  // were stored before the LVM filter landed. Scraper now drops them,
  // so they'd otherwise sit until their end_at aged past 90 days.
  await sql`DELETE FROM events WHERE source = 'delcielo' AND title LIKE '%LVM'`;
  // And the calendar-widget garbage rows the generic City of Martinez
  // scraper produced before we switched to the hand-curated list.
  // Old ids matched "martinez-fb-*" / "martinez-jsonld-*"; the new
  // curated rows use "martinez-sig-<slug>".
  await sql`DELETE FROM events WHERE source = 'martinez' AND id NOT LIKE 'martinez-sig-%'`;
  // Mirror into the structured events table.
  const { upsertEvents } = await import('./store');
  await upsertEvents(events.map((e) => ({
    id: `local-${e.id}`,
    source: e.source,
    source_label: e.source_label,
    title: e.title,
    start_at: e.start_at,
    end_at: e.end_at ?? null,
    venue: e.venue,
    city: null,
    url: e.url,
    description: e.description ?? null,
    image: e.image ?? null,
    segment: null,
    genre: null,
    please_note: null,
    payload: e,
  })));
}

async function localParks(json: Record<string, unknown>) {
  const { scrapeAllParks } = await import('./scrape-parks');
  const parks = await scrapeAllParks();
  json['local_parks'] = parks;
  // Mirror into the structured parks table.
  const { upsertParks } = await import('./store');
  await upsertParks(parks.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url ?? null,
    address: p.address ?? null,
    description: p.description ?? null,
    amenities: p.amenities ?? null,
    image: p.image ?? null,
  })));
}

async function purgeStores() {
  const { purgeOldRows } = await import('./store');
  const r = await purgeOldRows();
  console.log(`[cron] purge: events ${r.events}, birds ${r.birds}, quakes ${r.quakes}, alerts ${r.alerts}`);
}

async function weatherStory(misc: Record<string, string>) {
  const html = await fetchText('https://www.weather.gov/mtr/');
  for (let n = 0; n <= 9; n++) {
    misc[`WeatherStory${n}.png`] = new RegExp(`WeatherStory${n}\\.png`).test(html) ? 'true' : 'false';
  }
  const after = html.split('<div id="wfomap_rtcol_bot">');
  if (after.length < 2) return;
  const before = after[1].split('</table>');
  let xx = before[0] + '</table>';
  xx = xx.replace(/width="150" /g, '').replace(/[\t\n\r]/g, '');
  xx = xx.replace(/<img src="\/\/forecast\.weather\.gov\/wwamap\/gif\/spacer\.gif"[^>]*>/g, '');
  xx = xx.replace(/ width="2"|width="125"|width="20"| valign="top"/g, '');
  misc['NOAA_key'] = xx;
}

async function newsFeeds() {
  const loc = getLocation();
  if (!loc.newsRssUrls.length) return;
  const replacements: Array<[string | RegExp, string]> = [
    [/\r/g, ' '], [/\n/g, '<br/>'], [/\t/g, ' '], [/  +/g, ' '],
    [/ :::: /g, '<br/>'], [/<br\/><br\/><br\/>/g, '<br/><br/>'],
  ];
  const items: Record<string, { title: string; body: string; link: string }> = {};
  for (const url of loc.newsRssUrls) {
    let xml: string;
    try { xml = await fetchText(url); } catch { continue; }
    const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/g)];
    for (const m of itemBlocks) {
      const block = m[0];
      const title = stripCdata(extractTag(block, 'title')).trim();
      const desc  = stripTags(stripCdata(extractTag(block, 'description')), ['p']);
      const cnt   = stripTags(stripCdata(extractTag(block, 'content:encoded')), ['p']);
      const link  = stripCdata(extractTag(block, 'link')).trim();
      const pubDate = stripCdata(extractTag(block, 'pubDate')).trim();
      const ms = Date.parse(pubDate);
      if (!ms || Number.isNaN(ms)) continue;
      const ts = String(Math.floor(ms / 1000));
      let body = `${desc} :::: ${cnt}`;
      for (const [s, r] of replacements) body = body.replace(s, r as string);
      items[ts] = { title, body, link };
    }
  }
  const sorted = Object.entries(items).sort((a, b) => Number(a[0]) - Number(b[0])).map(([ts, item]) => ({ ts, ...item }));
  if (sorted.length) await upsertFeeds(sorted);
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}
function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
function stripTags(s: string, allow: string[]): string {
  const allowed = new Set(allow.map((t) => t.toLowerCase()));
  return s.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag) => allowed.has(String(tag).toLowerCase()) ? m : '');
}

async function noaaWaterRss(xmlBag: Record<string, string>) {
  const urls: Record<string, string> = {
    NOAA_w_d_st: 'https://water.weather.gov/ahps2/rss/obs/albc1.rss',
    NOAA_w_mrna: 'https://water.weather.gov/ahps2/rss/obs/nezc1.rss',
    NOAA_w_tbl_hrly: 'https://forecast.weather.gov/MapClick.php?lat=38.0117&lon=-122.1372&FcstType=digitalDWML',
  };
  for (const [k, url] of Object.entries(urls)) {
    try { xmlBag[k] = await fetchText(url); } catch { /* skip */ }
  }
}

// Stocks: every 5 minutes, all day, every day.
// Provider: Yahoo Finance's public chart endpoint — no API key, supports
// indices (^GSPC / ^DJI / ^IXIC) which Twelvedata's free tier gates
// behind a paid plan, and returns the last-close datapoint after hours
// instead of going dark. Cache key stays "12D_stocks" so the UI is
// unchanged. The TWELVEDATA_KEY env var is now unused; leave or remove.
const STOCK_SYMBOLS = ['^GSPC', '^DJI', '^IXIC', 'GME', 'PSLV'];

interface YahooChartMeta {
  symbol?: string;
  shortName?: string;
  longName?: string;
  exchangeName?: string;
  currency?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketTime?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketState?: string;     // REGULAR | CLOSED | PRE | POST
}

function fmtEpochAsEt(sec: number): string {
  try {
    const d = new Date(sec * 1000);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d) + ' ET';
  } catch { return ''; }
}

async function fetchYahooQuote(sym: string): Promise<unknown | null> {
  try {
    // range=1d → chartPreviousClose is yesterday's regular close, which
    // is what we actually want for "today's change". With a longer range,
    // chartPreviousClose is the close before the *window*, not yesterday,
    // and the percent change comes out drastically wrong.
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mtz-city/1.0)' },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const j = await r.json() as { chart?: { result?: Array<{ meta?: YahooChartMeta }> } };
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const close = Number(meta.regularMarketPrice ?? 0);
    // Prefer previousClose (yesterday's regular close) over
    // chartPreviousClose. With range=1d they line up, but if Yahoo ever
    // omits one, previousClose is the safer field.
    const prev  = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
    const change = prev ? close - prev : 0;
    const percent = prev ? (change / prev) * 100 : 0;
    return {
      symbol: sym,
      name: meta.shortName ?? meta.longName ?? sym,
      exchange: meta.exchangeName ?? '',
      currency: meta.currency ?? 'USD',
      datetime: meta.regularMarketTime ? fmtEpochAsEt(meta.regularMarketTime) : '',
      open:  String(meta.regularMarketOpen   ?? ''),
      high:  String(meta.regularMarketDayHigh ?? ''),
      low:   String(meta.regularMarketDayLow  ?? ''),
      close: String(close),
      previous_close: String(prev),
      change: change.toFixed(4),
      percent_change: percent.toFixed(4),
      is_market_open: meta.marketState === 'REGULAR',
      market_state: meta.marketState ?? '',
      fifty_two_week: {
        low:  String(meta.fiftyTwoWeekLow  ?? ''),
        high: String(meta.fiftyTwoWeekHigh ?? ''),
      },
    };
  } catch {
    return null;
  }
}

async function twelvedataStocks(json: Record<string, unknown>) {
  const entries = await Promise.all(
    STOCK_SYMBOLS.map(async (sym) => [sym, await fetchYahooQuote(sym)] as const),
  );
  const map: Record<string, unknown> = {};
  for (const [sym, q] of entries) if (q) map[sym] = q;
  json['12D_stocks'] = map;
}

async function foursquarePlaces(json: Record<string, unknown>) {
  // Foursquare retired the legacy v3 OAuth-style API in 2024.  Service API keys
  // require the new endpoint, "Bearer" auth prefix, and X-Places-Api-Version header.
  // Reference: github.com/foursquare/foursquare-places-mcp (official MCP sample).
  const loc = getLocation();
  const qs = `ll=${loc.lat},${loc.lon}&radius=${loc.foursquareRadiusM}&categories=${loc.foursquareCategories}&exclude_all_chains=true&sort=RATING&limit=50`;
  const headers = {
    Authorization: `Bearer ${process.env.FOURSQUARE_KEY ?? ''}`,
    'X-Places-Api-Version': '2025-02-05',
    Accept: 'application/json',
  };
  const text = await fetchText(`https://places-api.foursquare.com/places/search?${qs}`, { headers });
  json.four_sq = text;
  type FsqPlace = {
    fsq_place_id?: string;        // new API
    fsq_id?: string;              // legacy fallback
    name?: string;
    location?: { formatted_address?: string; address?: string };
    categories?: Array<{ name?: string; icon?: { prefix?: string; suffix?: string } }>;
    distance?: number;
  };
  type FsqResp = { results?: FsqPlace[] };
  let parsed: FsqResp;
  try { parsed = JSON.parse(text) as FsqResp; } catch { return; }
  if (!parsed.results) return;
  const places = [];
  for (const v of parsed.results) {
    const id = v.fsq_place_id ?? v.fsq_id;
    if (!id) continue;
    let cats = '', images = '';
    for (const c of v.categories ?? []) {
      cats += `${c.name ?? ''}, `;
      images += `${c.icon?.prefix ?? ''}${c.icon?.suffix ?? ''}, `;
    }
    places.push({
      fsq_id: id,
      name: v.name ?? 'No Name Given',
      addy: v.location?.formatted_address ?? v.location?.address ?? '',
      cats,
      dist: v.distance ?? null,
      images,
    });
  }
  if (places.length) await upsertPlaces(places);
}

async function ticketmasterEvents(json: Record<string, unknown>) {
  // We cache the raw event array verbatim — every field Ticketmaster returns
  // is preserved so the UI can extract whatever it needs (image, ticket URL,
  // venue address, sales window, classification, etc.) at render time.
  // No classification filter; we want every category (music + sports +
  // arts + comedy + …) so the client can offer a filter bar.
  const loc = getLocation();
  // Future events only.  Use today's UTC date at 00:00 — Ticketmaster
  // accepts ISO 8601 with seconds + Z, no millis.
  const startDateTime = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const params = new URLSearchParams({
    apikey: process.env.TICKETMASTER_KEY ?? '',
    size: '200',
    geoPoint: `${loc.lat},${loc.lon}`,
    sort: 'date,asc',
    startDateTime,
  });
  type TM = { _embedded?: { events?: Array<Record<string, unknown>> } };
  const r = await fetchJson<TM>(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  const events = r._embedded?.events ?? [];
  json.TM_shows = events;
  // Mirror into the structured events table.
  const { upsertEvents } = await import('./store');
  await upsertEvents(events.map((e) => {
    const tm = e as {
      id?: string; name?: string; url?: string; pleaseNote?: string;
      images?: Array<{ url?: string; ratio?: string; width?: number }>;
      dates?: { start?: { localDate?: string; dateTime?: string } };
      classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>;
      _embedded?: { venues?: Array<{ name?: string; city?: { name?: string } }> };
    };
    const iso = tm.dates?.start?.dateTime;
    const ld  = tm.dates?.start?.localDate;
    let start_at: number | null = null;
    if (iso) { const ms = Date.parse(iso); if (!Number.isNaN(ms)) start_at = Math.floor(ms / 1000); }
    else if (ld) {
      const [y, m, d] = ld.split('-').map(Number);
      if (y && m && d) start_at = Math.floor(Date.UTC(y, m - 1, d, 19) / 1000);
    }
    const venue = tm._embedded?.venues?.[0];
    const hero = [...(tm.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    return {
      id: `tm-${tm.id ?? Math.random().toString(36).slice(2)}`,
      source: 'ticketmaster',
      source_label: 'Ticketmaster',
      title: tm.name ?? 'Untitled event',
      start_at,
      end_at: null,
      venue: venue?.name ?? null,
      city: venue?.city?.name ?? null,
      url: tm.url ?? null,
      description: null,
      image: hero?.url ?? null,
      segment: tm.classifications?.[0]?.segment?.name ?? null,
      genre:   tm.classifications?.[0]?.genre?.name ?? null,
      please_note: tm.pleaseNote ?? null,
      payload: e,
    };
  }));
}

// ---- Public dispatcher --------------------------------------------------

export async function runBucket(bucket: Bucket): Promise<RunResult> {
  const start = Date.now();
  const ok: string[] = [];
  const errors: Record<string, string> = {};
  const json: Record<string, unknown> = {};
  const xmlBag: Record<string, string> = {};
  const miscBag: Record<string, string> = {};
  const all = bucket === 'all';

  // 1m: hot live data we want as fresh as the source allows. Requires an
  //     external pinger to truly fire every minute (GitHub Actions floors
  //     cron schedules at 5 min).
  if (bucket === '1m' || all) {
    await safe('weatherapi_current', () => weatherapiCurrent(json), ok, errors);
    await safe('openweather',        () => openweather(json),       ok, errors);
  }

  // 2m: AQI — sensor refreshes ~every 2 min.
  if (bucket === '2m' || all) {
    await safe('purpleair', () => purpleair(json), ok, errors);
  }

  if (bucket === '5m' || all) {
    await safe('noaa_alerts',        () => noaaAlerts(json),        ok, errors);
    await safe('twelvedata_stocks',  () => twelvedataStocks(json),  ok, errors);
  }

  if (bucket === '15m' || all) {
    await safe('noaa_buoys', () => noaaBuoys(json), ok, errors);
  }

  if (bucket === '1h' || all) {
    await safe('noaa_forecast',       () => noaaForecast(json),       ok, errors);
    await safe('noaa_hourly',         () => noaaHourly(json),         ok, errors);
    await safe('noaa_aviation',       () => noaaAviation(json),       ok, errors);
    await safe('weatherapi_marine',   () => weatherapiMarine(json),   ok, errors);
    await safe('weatherapi_forecast', () => weatherapiForecast(json), ok, errors);
    await safe('usgs_quakes',         () => usgsQuakes(json),         ok, errors);
    await safe('ebird',               () => ebird(json),              ok, errors);
  }

  if (bucket === '4h' || all) {
    await safe('news_feeds',     () => newsFeeds(),                ok, errors);
    await safe('noaa_water_rss', () => noaaWaterRss(xmlBag),       ok, errors);
    await safe('weather_story',  () => weatherStory(miscBag),      ok, errors);
    await safe('local_events',   () => localEvents(json),          ok, errors);
  }

  if (bucket === '12h' || all) {
    await safe('foursquare_places',  () => foursquarePlaces(json),   ok, errors);
    await safe('ticketmaster_events',() => ticketmasterEvents(json), ok, errors);
    await safe('local_parks',        () => localParks(json),         ok, errors);
    await safe('purge_stores',       () => purgeStores(),             ok, errors);
  }

  if (Object.keys(json).length)    await upsertJsonMany(json);
  if (Object.keys(xmlBag).length)  await upsertXmlMany(xmlBag);
  if (Object.keys(miscBag).length) await upsertMiscMany(miscBag);

  return { ok, errors, ms: Date.now() - start };
}
