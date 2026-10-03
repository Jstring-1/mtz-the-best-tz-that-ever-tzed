// Regional hazard feeds — everything that isn't a National Weather Service
// alert but still belongs in the chip strip under the radar: wildfires,
// power outages, road incidents, transit, air quality, hazmat / refinery.
//
// Each source is fetched independently; one failing never blanks the rest.
// A source only yields a group when it has something to say, so a quiet
// day renders no chips at all.

import { getLocation } from './location';
import { zonedEpoch } from './tz';
import { CC_BOUNDARY, CC_TOWNS } from './cc-geo';

export interface HazardItem {
  title: string;
  detail?: string;
  severity?: 'info' | 'warn' | 'alert';
  url?: string;
  at?: number; // epoch seconds
}

export interface HazardGroup {
  kind: string;      // stable id: 'wildfire' | 'pge' | ...
  label: string;     // modal title
  chip: string;      // chip text
  source: string;    // attribution line
  url?: string;      // "open source" link
  items: HazardItem[];
}

// A source that answered and has nothing to report.
export interface HazardClear {
  kind: string;
  label: string;
  note: string;
}

export interface HazardsPayload {
  fetchedAt: string;
  groups: HazardGroup[];
  clear?: HazardClear[];        // absent in payloads cached before this field existed
  failed?: string[];            // labels of sources that errored this run
  errors: Record<string, string>;
}

const TIMEOUT_MS = 20000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url: string, accept = '*/*'): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: accept },
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} ${url}`);
    return r;
  } finally {
    clearTimeout(timer);
  }
}
const getJson = async <T>(url: string): Promise<T> => (await get(url, 'application/json')).json() as Promise<T>;
const getText = async (url: string): Promise<string> => (await get(url)).text();

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
const mi = (k: number) => Math.round(k * 0.621371);

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
}
const stripTags = (s: string) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---- BART ---------------------------------------------------------------
// BART's documented public demo key (api.bart.gov); service advisories only.

async function bart(): Promise<HazardGroup | null> {
  type Adv = { type?: string; description?: { '#cdata-section'?: string } | string; posted?: string };
  const j = await getJson<{ root?: { bsa?: Adv | Adv[] } }>(
    'https://api.bart.gov/api/bsa.aspx?cmd=bsa&json=y&key=MW9S-E7SL-26DU-VV8V'
  );
  const raw = j.root?.bsa;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const items: HazardItem[] = [];
  for (const a of list) {
    const desc = typeof a.description === 'string' ? a.description : a.description?.['#cdata-section'] ?? '';
    const text = desc.replace(/\s+/g, ' ').trim();
    if (!text || /^no (delays|advisories)/i.test(text)) continue;
    const ms = a.posted ? Date.parse(a.posted.replace(/^\w+\s/, '')) : NaN;
    items.push({
      title: a.type ? a.type[0] + a.type.slice(1).toLowerCase() : 'Advisory',
      detail: text,
      severity: /emergency/i.test(a.type ?? '') ? 'alert' : 'warn',
      at: Number.isNaN(ms) ? undefined : Math.floor(ms / 1000),
    });
  }
  if (!items.length) return null;
  return {
    kind: 'bart', label: 'BART service advisories', chip: 'BART',
    source: 'BART', url: 'https://www.bart.gov/schedules/advisories', items,
  };
}

// ---- Spare the Air ------------------------------------------------------

async function spareTheAir(): Promise<HazardGroup | null> {
  const xml = await getText('https://www.baaqmd.gov/Feeds/AlertRSS.aspx');
  const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
  if (!item) return null;
  const title = stripTags(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Spare the Air');
  const desc = stripTags(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
  if (!desc || /^no alert/i.test(desc)) return null;
  return {
    kind: 'spare-the-air', label: 'Spare the Air', chip: 'Spare the Air',
    source: 'Bay Area Air Quality Management District', url: 'https://www.sparetheair.org/',
    items: [{ title, detail: desc, severity: 'warn' }],
  };
}

// ---- Wildfires (NIFC / WFIGS current incidents) -------------------------
// CAL FIRE's own incident API sits behind a bot wall; WFIGS is the federal
// feed CAL FIRE reports into and is openly queryable.

async function wildfires(): Promise<HazardGroup | null> {
  const loc = getLocation();
  const qs = new URLSearchParams({
    where: "POOState='US-CA' AND IncidentTypeCategory='WF'",
    outFields: 'IncidentName,POOCounty,IncidentSize,PercentContained,FireDiscoveryDateTime,ModifiedOnDateTime_dt,FireOutDateTime,InitialLatitude,InitialLongitude,IncidentShortDescription',
    returnGeometry: 'true', outSR: '4326', f: 'json',
  });
  type A = {
    IncidentName?: string; POOCounty?: string; IncidentSize?: number | null;
    PercentContained?: number | null; FireDiscoveryDateTime?: number | null;
    ModifiedOnDateTime_dt?: number | null; FireOutDateTime?: number | null;
    InitialLatitude?: number | null; InitialLongitude?: number | null;
    IncidentShortDescription?: string | null;
  };
  const j = await getJson<{ features?: { attributes: A; geometry?: { x?: number; y?: number } }[] }>(
    `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?${qs}`
  );
  const recent = Date.now() - 4 * 86400_000;
  const rows: { km: number; item: HazardItem }[] = [];
  for (const f of j.features ?? []) {
    const a = f.attributes;
    if (a.FireOutDateTime) continue;
    if ((a.PercentContained ?? 0) >= 100) continue;
    if ((a.ModifiedOnDateTime_dt ?? 0) < recent) continue;
    const lat = a.InitialLatitude ?? f.geometry?.y;
    const lon = a.InitialLongitude ?? f.geometry?.x;
    if (lat == null || lon == null) continue;
    const d = km(loc.lat, loc.lon, lat, lon);
    if (d > 200) continue;
    const bits = [
      a.IncidentSize ? `${Math.round(a.IncidentSize).toLocaleString('en-US')} acres` : null,
      a.PercentContained != null ? `${a.PercentContained}% contained` : 'containment not reported',
      `${mi(d)} mi away`,
    ].filter(Boolean).join(' · ');
    rows.push({
      km: d,
      item: {
        title: `${a.IncidentName ?? 'Wildfire'}${a.POOCounty ? ` — ${a.POOCounty} Co.` : ''}`,
        detail: [bits, a.IncidentShortDescription].filter(Boolean).join('\n'),
        severity: d < 60 ? 'alert' : 'info',
        at: a.ModifiedOnDateTime_dt ? Math.floor(a.ModifiedOnDateTime_dt / 1000) : undefined,
        url: 'https://www.fire.ca.gov/incidents',
      },
    });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.km - b.km);
  const items = rows.slice(0, 8).map((r) => r.item);
  return {
    kind: 'wildfire', label: 'Active wildfires within ~120 mi', chip: `Wildfires (${rows.length})`,
    source: 'NIFC WFIGS (CAL FIRE / federal reports)', url: 'https://www.fire.ca.gov/incidents', items,
  };
}

// ---- PG&E outages -------------------------------------------------------

function inContraCosta(lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = CC_BOUNDARY.length - 1; i < CC_BOUNDARY.length; j = i++) {
    const [xi, yi] = CC_BOUNDARY[i];
    const [xj, yj] = CC_BOUNDARY[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// "Oakley" / "near Oakley (3 mi)" — nearest known town to a coordinate.
function placeName(lat: number, lon: number): string {
  let best = '';
  let bestKm = Infinity;
  for (const [name, tl, tg] of CC_TOWNS) {
    const d = km(lat, lon, tl, tg);
    if (d < bestKm) { bestKm = d; best = name; }
  }
  return bestKm < 2.5 ? best : `near ${best} (${Math.max(1, mi(bestKm))} mi)`;
}

async function pgeOutages(): Promise<HazardGroup | null> {
  const qs = new URLSearchParams({
    where: 'EST_CUSTOMERS >= 25',
    geometry: '-122.43,37.72,-121.53,38.10',
    geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'OUTAGE_ID,EST_CUSTOMERS,OUTAGE_CAUSE,CREW_CURRENT_STATUS,OUTAGE_START_TEXT,CURRENT_ETOR_TEXT',
    returnGeometry: 'true', outSR: '4326', f: 'json',
  });
  type A = {
    OUTAGE_ID?: string; EST_CUSTOMERS?: number | null; OUTAGE_CAUSE?: string | null;
    CREW_CURRENT_STATUS?: string | null; OUTAGE_START_TEXT?: string | null; CURRENT_ETOR_TEXT?: string | null;
  };
  const j = await getJson<{ features?: { attributes: A; geometry?: { x?: number; y?: number } }[] }>(
    `https://ags.pge.esriemcs.com/arcgis/rest/services/43/outages/MapServer/4/query?${qs}`
  );
  // The query box also overlaps Alameda/Solano; keep only points inside the
  // county line.
  const big = (j.features ?? [])
    .filter((f) => f.geometry?.x != null && f.geometry?.y != null && inContraCosta(f.geometry.y, f.geometry.x))
    .map((f) => ({ ...f.attributes, lat: f.geometry!.y as number, lon: f.geometry!.x as number }));
  if (!big.length) return null;
  big.sort((a, b) => (b.EST_CUSTOMERS ?? 0) - (a.EST_CUSTOMERS ?? 0));
  const total = big.reduce((s, a) => s + (a.EST_CUSTOMERS ?? 0), 0);
  const iso = (s?: string | null) => {
    const ms = s ? Date.parse(s) : NaN;
    return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
  };
  const items: HazardItem[] = big.slice(0, 10).map((a) => ({
    title: `${(a.EST_CUSTOMERS ?? 0).toLocaleString('en-US')} customers without power — ${placeName(a.lat, a.lon)}`,
    detail: [
      a.OUTAGE_CAUSE,
      a.CREW_CURRENT_STATUS,
      a.CURRENT_ETOR_TEXT ? `restoration est. ${new Date(a.CURRENT_ETOR_TEXT).toLocaleTimeString('en-US', { timeZone: getLocation().timezone, hour: 'numeric', minute: '2-digit' })}` : null,
    ].filter(Boolean).join(' · ') || undefined,
    severity: (a.EST_CUSTOMERS ?? 0) >= 1000 ? 'alert' : (a.EST_CUSTOMERS ?? 0) >= 100 ? 'warn' : 'info',
    at: iso(a.OUTAGE_START_TEXT),
    url: `https://www.google.com/maps?q=${a.lat.toFixed(5)},${a.lon.toFixed(5)}`,
  }));
  return {
    kind: 'pge', label: 'PG&E outages in Contra Costa', chip: `Outages (${total.toLocaleString('en-US')})`,
    source: 'PG&E outage map — outages of 25+ customers', url: 'https://pgealerts.alerts.pge.com/outage-tools/outage-map/', items,
  };
}

// ---- CHP incidents ------------------------------------------------------

async function chp(): Promise<HazardGroup | null> {
  const loc = getLocation();
  const xml = await getText('https://media.chp.ca.gov/sa_xml/sa.xml');
  const interesting = /SIG Alert|CLOSURE|FIRE|1179|1181|1183|20001|SPINOUT|HAZMAT|1144|1141|1125-Traffic Hazard|TADV/i;
  const rows: { km: number; item: HazardItem }[] = [];
  for (const m of xml.matchAll(/<Log ID = "[^"]*">([\s\S]*?)<\/Log>/g)) {
    const b = m[1];
    const g = (t: string) => b.match(new RegExp(`<${t}>"([^"]*)"`))?.[1]?.trim() ?? '';
    const type = g('LogType');
    if (!interesting.test(type)) continue;
    const ll = g('LATLON').split(':');
    const lat = Number(ll[0]) / 1e6;
    const lon = -Number(ll[1]) / 1e6;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    const d = km(loc.lat, loc.lon, lat, lon);
    if (d > 30) continue;
    const t = g('LogTime').match(/(\w{3})\s+(\d+)\s+(\d{4})\s+(\d+):(\d+)(AM|PM)/);
    let at: number | undefined;
    if (t) {
      const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(t[1]);
      let h = Number(t[4]) % 12;
      if (t[6] === 'PM') h += 12;
      if (mo >= 0) at = zonedEpoch(Number(t[3]), mo, Number(t[2]), h, Number(t[5]), 'America/Los_Angeles');
    }
    const detail = b.match(/<IncidentDetail>"([^"]*)"/)?.[1]?.replace(/^\[\d+\]\s*/, '').trim();
    const sig = /SIG Alert|CLOSURE|FIRE|HAZMAT/i.test(type);
    rows.push({
      km: d,
      item: {
        title: type.replace(/^[0-9A-Z]+-/, '').trim() || type,
        detail: [g('Location'), g('LocationDesc'), detail, `${mi(d)} mi away`].filter(Boolean).join(' · '),
        severity: sig ? 'alert' : 'warn',
        at,
      },
    });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.km - b.km);
  return {
    kind: 'chp', label: 'CHP incidents near you', chip: `CHP (${rows.length})`,
    source: 'California Highway Patrol live incidents', url: 'https://cad.chp.ca.gov/',
    items: rows.slice(0, 12).map((r) => r.item),
  };
}

// ---- Caltrans lane closures --------------------------------------------

async function caltrans(): Promise<HazardGroup | null> {
  const loc = getLocation();
  type L = { lcs: {
    location: { travelFlowDirection: string; begin: Record<string, string>; end: Record<string, string> };
    closure: {
      closureID?: string; typeOfClosure?: string; lanesClosed?: string; totalExistingLanes?: string; typeOfWork?: string;
      closureTimestamp: { closureStartEpoch?: string; closureEndEpoch?: string; isClosureEndIndefinite?: string };
    };
  } };
  const j = await getJson<{ data?: L[] }>('https://cwwp2.dot.ca.gov/data/d4/lcs/lcsStatusD04.json');
  const now = Date.now() / 1000;
  // Caltrans files one record per direction of travel for the same work
  // (SR-4 EB and WB, same closure ID and endpoints) — fold those into one row.
  const byKey = new Map<string, { km: number; item: HazardItem; dirs: string[]; base: string }>();
  const dirAbbr: Record<string, string> = { East: 'EB', West: 'WB', North: 'NB', South: 'SB' };
  for (const { lcs } of j.data ?? []) {
    const b = lcs.location.begin;
    if (b.beginCounty !== 'Contra Costa' && lcs.location.end.endCounty !== 'Contra Costa') continue;
    const ts = lcs.closure.closureTimestamp;
    const start = Number(ts.closureStartEpoch);
    const end = Number(ts.closureEndEpoch);
    if (!(start <= now)) continue;
    if (ts.isClosureEndIndefinite !== 'true' && !(end >= now)) continue;
    // Multi-month construction closures are background, not news.
    if (ts.isClosureEndIndefinite === 'true' || end - start > 60 * 86400) continue;
    const lat = Number(b.beginLatitude);
    const lon = Number(b.beginLongitude);
    const d = Number.isFinite(lat) && Number.isFinite(lon) ? km(loc.lat, loc.lon, lat, lon) : 999;
    const c = lcs.closure;
    const full = /full/i.test(c.typeOfClosure ?? '') || /all/i.test(c.lanesClosed ?? '');
    // Shoulder-only work doesn't touch traffic lanes — not worth an alert.
    if (!full && /shoulder/i.test(c.lanesClosed ?? '')) continue;
    const key = [c.closureID, ...[b.beginLocationName, lcs.location.end.endLocationName].sort()].join('|');
    const dir = lcs.location.travelFlowDirection;
    const prior = byKey.get(key);
    if (prior) {
      const abbr = dirAbbr[dir] ?? dir;
      if (abbr && !prior.dirs.includes(abbr)) prior.dirs.push(abbr);
      continue;
    }
    byKey.set(key, {
      km: d,
      dirs: [dirAbbr[dir] ?? dir].filter(Boolean),
      base: `${b.beginRoute ?? 'Road'} ${full ? 'full closure' : 'lane closure'} — ${b.beginNearbyPlace || b.beginLocationName}`,
      item: {
        title: '',
        detail: [
          `${b.beginLocationName} to ${lcs.location.end.endLocationName}`,
          /^all$/i.test(c.lanesClosed ?? '') ? 'all lanes'
            : c.lanesClosed && c.totalExistingLanes ? `${c.lanesClosed} of ${c.totalExistingLanes} lanes` : null,
          c.typeOfWork,
          `until ${new Date(end * 1000).toLocaleString('en-US', {
            timeZone: loc.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}`,
        ].filter(Boolean).join(' · '),
        severity: full ? 'warn' : 'info',
        at: Number.isFinite(start) ? start : undefined,
      },
    });
  }
  const rows = [...byKey.values()];
  for (const r of rows) r.item.title = r.dirs.length ? `${r.base} (${r.dirs.join(' + ')})` : r.base;
  if (!rows.length) return null;
  rows.sort((a, b) => a.km - b.km);
  return {
    kind: 'caltrans', label: 'Caltrans closures in progress (Contra Costa)', chip: `Closures (${rows.length})`,
    source: 'Caltrans District 4 lane-closure system', url: 'https://roads.dot.ca.gov/',
    items: rows.slice(0, 15).map((r) => r.item),
  };
}

// ---- Contra Costa Community Warning System ------------------------------
// The CWS site renders "Current Alerts" into the page body only while an
// alert is active (empty script shell otherwise). We read the WordPress page
// JSON and surface any text between the intro line and the explainer rule.

async function cws(): Promise<HazardGroup | null> {
  const j = await getJson<{ content?: { rendered?: string } }>('https://cwsalerts.com/wp-json/wp/v2/pages/2');
  const html = j.content?.rendered ?? '';
  // Everything after the intro paragraph (which ends "...instructions
  // provided.") up to the horizontal rule / explainer heading.
  const intro = html.search(/instructions provided\.?/i);
  if (intro < 0) return null;
  const afterIntro = html.slice(intro);
  const introEnd = afterIntro.indexOf('</p>');
  const rest = introEnd >= 0 ? afterIntro.slice(introEnd + 4) : '';
  const stop = rest.search(/<hr|Understanding the CWS Alert/i);
  const region = rest.slice(0, stop >= 0 ? stop : undefined);
  // initAll() is an empty shell when nothing is active.
  const initBody = region.match(/function\s+initAll\s*\(\)\s*\{([\s\S]*?)\}\s*;?\s*<\/script>/)?.[1]?.trim() ?? '';
  const text = stripTags(region.replace(/<script[\s\S]*?<\/script>/g, ' '));
  if (!initBody && !text) return null;
  return {
    kind: 'cws', label: 'Community Warning System', chip: 'CWS alert',
    source: 'Contra Costa County Community Warning System', url: 'https://cwsalerts.com/',
    items: [{
      title: 'Active Community Warning System alert',
      detail: text || 'An alert is listed on the CWS site — open it for details and protective actions.',
      severity: 'alert',
    }],
  };
}

// ---- BAAQMD refinery / air-quality incident reports ---------------------
// The incident table is lazy-loaded from a Sitecore table API; we read the
// current-year table's ids off the page, then query its data endpoint.

async function refineryReports(): Promise<HazardGroup | null> {
  const page = 'https://www.baaqmd.gov/en/About-Air-Quality/Incidents-and-Advisories';
  const html = await getText(page);
  const m = html.match(/new TableBlock\("([^"]+)",\s*"[^"]+",\s*"([^"]+)",\s*(-?\d+)/);
  if (!m) throw new Error('BAAQMD incident table not found on page');
  const ds = Buffer.from(m[2]).toString('base64');
  const data = await getJson<{ Data?: { Date?: string; DocumentFile?: string }[] }>(
    `https://www.baaqmd.gov/en/api/admin/table/data/${m[1]}/${ds}/${m[3]}?limit=20&offset=0`
  );
  const cutoff = Date.now() - 90 * 86400_000;
  const items: HazardItem[] = [];
  for (const r of data.Data ?? []) {
    const doc = r.DocumentFile ?? '';
    const href = doc.match(/href="([^"]+)"/)?.[1];
    const name = stripTags(doc.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? 'Incident report');
    const posted = doc.match(/posted (\d+)\/(\d+)\/(\d{4})/);
    const ms = posted ? Date.UTC(Number(posted[3]), Number(posted[1]) - 1, Number(posted[2]))
      : r.Date ? Date.parse(r.Date) : NaN;
    if (Number.isNaN(ms) || ms < cutoff) continue;
    items.push({
      title: name,
      detail: r.Date ? `Incident date ${new Date(r.Date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}` : undefined,
      severity: 'warn',
      url: href ? new URL(decode(href), 'https://www.baaqmd.gov').toString() : undefined,
      at: Math.floor(ms / 1000),
    });
  }
  if (!items.length) return null;
  return {
    kind: 'refinery', label: 'Refinery / air-quality incident reports', chip: `Refinery reports (${items.length})`,
    source: 'Bay Area Air Quality Management District — posted in the last 90 days', url: page, items,
  };
}

// ---- Public entry -------------------------------------------------------

// [id, label, "all clear" note, fetcher]. A source that responds with
// nothing to report is listed in the panel's All clear card; one that
// fails is listed as unavailable rather than silently looking clear.
const SOURCES: [string, string, string, () => Promise<HazardGroup | null>][] = [
  ['cws',           'Community Warning System', 'no active alerts',                    cws],
  ['refinery',      'Refinery incident reports', 'none posted in the last 90 days',    refineryReports],
  ['wildfire',      'Wildfires',                 'none active within ~120 mi',         wildfires],
  ['spare-the-air', 'Spare the Air',             'no alert today',                     spareTheAir],
  ['pge',           'PG&E outages',              'no outages over 25 customers',       pgeOutages],
  ['chp',           'CHP incidents',             'no notable incidents nearby',        chp],
  ['caltrans',      'Caltrans closures',         'no short-term closures in progress', caltrans],
  ['bart',          'BART',                      'no service advisories',              bart],
];

export const SOURCE_COUNT = SOURCES.length;

export async function fetchRegionalHazards(): Promise<HazardsPayload> {
  const results = await Promise.allSettled(SOURCES.map(([, , , fn]) => fn()));
  const groups: HazardGroup[] = [];
  const clear: HazardClear[] = [];
  const failed: string[] = [];
  const errors: Record<string, string> = {};
  results.forEach((r, i) => {
    const [id, label, note] = SOURCES[i];
    if (r.status === 'rejected') {
      errors[id] = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failed.push(label);
    } else if (r.value) groups.push(r.value);
    else clear.push({ kind: id, label, note });
  });
  return { fetchedAt: new Date().toISOString(), groups, clear, failed, errors };
}
