// Amtrak Martinez (MTZ) train status — scraped from railrat.net.
//
// railrat.net is a small hobby tracker that pulls Amtrak's Track Your
// Train Map and renders server-side HTML for each station. There's no
// JSON API, so we scrape the rendered page on a 15-minute cron.
//
// Attribution requirement: railrat.net + Amtrak (the upstream). Both
// are listed in the Sources & API credits footer popup.
//
// The page structure is simple and stable:
//
//   <h2>Arriving Trains</h2>
//   <ul>
//     <li>HH:MM <a href="/trains/<n>/">Name Number</a>[, <status>]<a>…</a>
//         <div id="aXXX" class="arriving">
//           <ul>
//             <li>Origin [CODE] &rarr; Destination [CODE]</li>
//             <li>Ar sch./est./act. HH:MM[, ...]</li>
//             <li>Dp sch./est./act. HH:MM[, ...]</li>
//           </ul>
//         </div>
//     </li>
//     ...
//   </ul>
//   <h2>Departed Trains</h2>
//   <ul>...</ul>
//
// We parse both lists, normalize status badges, and return a typed
// payload cached under apis_json key `trains_mtz`.

export interface TrainEntry {
  /** Stable per-train-run id (railrat's numeric portion of the
   *  `ReverseDisplay('aXXXX')` toggle, with the a/d prefix stripped).
   *  Same train on different days gets different ids; same train as it
   *  transitions arriving → departed should keep the same numeric id. */
  railratId: string;
  /** The main-line display time, "HH:MM" (US Pacific). For trains
   *  with no live status this is the scheduled time; with status, it
   *  is the estimated arrival. */
  time: string;
  trainNumber: string;        // e.g. "5", "528", "11"
  trainName: string;          // e.g. "California Zephyr 5"
  routeName: string;          // e.g. "California Zephyr" (name minus trailing number)
  /** Raw href on railrat.net for the per-train page, e.g. "/trains/5/". */
  trainUrl: string;
  /** Status badge text — "on tm", "1m lt", "26m er", or "" if absent. */
  status: string;
  /** Numeric minutes from status. Negative = early, positive = late, 0 = on time. */
  minutesOff: number | null;
  /** True when railrat surfaces the row inside a yellow `<span>` —
   *  their convention for significantly-delayed trains. */
  warn: boolean;
  /** Origin → destination text, decoded ("Chicago Union [CHI] → Emeryville [EMY]"). */
  route: string;
  /** Raw detail lines (Ar sch./est./act., Dp sch./est./act.). HTML decoded. */
  details: string[];
  /** Best-effort full ISO timestamp for the train's MTZ stop. Built by
   *  combining the HH:MM display time with the MM/DD found in the
   *  detail lines (defaulting to today Pacific). Null when we can't
   *  pin down a date — better than guessing. */
  scheduledAt: string | null;
}

export interface TrainsPayload {
  scrapedAt: string;          // ISO 8601 UTC
  lastUpdated: string | null; // The "Last updated …" line at the page footer
  arriving: TrainEntry[];
  departed: TrainEntry[];
  /** Per-train detail (keyed by train number) scraped from the per-train
   *  page (/trains/<n>/). One entry per unique trainNumber found in the
   *  arriving/departed lists. May be missing if the per-train fetch
   *  failed — UI should treat as optional. */
  details: Record<string, TrainDetail>;
  /** Diagnostic: HTTP status from the upstream fetch, or 0 if fetch threw. */
  httpStatus: number;
  /** Diagnostic: short error message if the fetch / parse failed. */
  error: string | null;
}

// ---- Per-train detail ---------------------------------------------------

export interface TrainStop {
  code: string;                 // 3-letter station code, e.g. "MTZ"
  name: string;                 // human-readable station name
  /** Visit status:
   *   - 'past'       — train has already departed (or arrived at terminus)
   *   - 'upcoming'   — estimated arrival/departure still in the future
   */
  state: 'past' | 'upcoming';
  /** Free-form delay text shown on the row, e.g. "on time", "6 min. late",
   *  "5 min. early". null when no delay info is shown. */
  delay: string | null;
  /** Scheduled / estimated / actual times as-shown ("06:18", "08:55"). */
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  estimatedDeparture: string | null;
  scheduledArrival: string | null;
  actualArrival: string | null;
  estimatedArrival: string | null;
  /** Coordinates pulled from the embedded L.marker() call, if available. */
  lat: number | null;
  lon: number | null;
}

export interface PositionPing {
  /** "HH:MM" Pacific time, as railrat displays it. */
  time: string;
  /** Free-form description: "0 mi SW of Suisun–Fairfield [SUI]". */
  description: string;
  /** Best-guess station code parsed from the description (e.g. "SUI"). */
  nearStation: string | null;
  /** Speed in mph + heading ("39 mph N"). null if stationary or stripped. */
  speed: string | null;
  /** Coordinates pulled from the matching L.circleMarker() call. */
  lat: number | null;
  lon: number | null;
}

export interface TrainDetail {
  /** Train number we used for the lookup ("524"). */
  trainNumber: string;
  /** Route name from the page header ("Capitol Corridor"). null if absent. */
  routeName: string | null;
  /** Page "Latest status … updated HH:MM on MM/DD" string. */
  updated: string | null;
  /** "San Jose Diridon, CA" or similar. */
  origin: string | null;
  destination: string | null;
  /** Scheduled departure from origin, e.g. "06:18 PT 05/26". */
  scheduledDeparture: string | null;
  /** "Active" / "Departed" / etc. */
  status: string | null;
  /** Current location description ("0 mi SW of Suisun–Fairfield [SUI], 39 mph N"). */
  currentPosition: string | null;
  /** Free-form "38 miles SW of Sacramento". */
  distanceToDestination: string | null;
  distanceFromOrigin: string | null;
  /** Live coordinates of the train pulled from the blue marker on the
   *  embedded map. null when the train is not currently tracked (e.g.
   *  finished trip or hasn't departed). */
  currentLat: number | null;
  currentLon: number | null;
  /** Every station stop, in order, with sched/est/actual times + delay
   *  + lat/lon from the embedded markers. */
  progress: TrainStop[];
  /** Last ~15 GPS pings, newest first. */
  positions: PositionPing[];
  /** Diagnostics. */
  httpStatus: number;
  error: string | null;
}

const URL = 'https://railrat.net/stations/MTZ/';

export async function fetchTrains(): Promise<TrainsPayload> {
  const scrapedAt = new Date().toISOString();
  const empty: TrainsPayload = {
    scrapedAt, lastUpdated: null, arriving: [], departed: [], details: {},
    httpStatus: 0, error: null,
  };

  let html = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const r = await fetch(URL, {
      headers: {
        'User-Agent': 'mtz.city (hyperlocal dashboard; +https://mtz.city)',
        'Accept': 'text/html',
      },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    empty.httpStatus = r.status;
    if (!r.ok) {
      empty.error = `${r.status} ${r.statusText}`;
      return empty;
    }
    html = await r.text();
  } catch (e) {
    empty.error = e instanceof Error ? e.message : String(e);
    return empty;
  }

  let arriving: TrainEntry[] = [];
  let departed: TrainEntry[] = [];
  try {
    const arrSection = extractSection(html, 'Arriving Trains');
    const depSection = extractSection(html, 'Departed Trains');
    arriving = arrSection.map(parseEntry).filter((e): e is TrainEntry => e !== null);
    departed = depSection.map(parseEntry).filter((e): e is TrainEntry => e !== null);
  } catch (e) {
    empty.error = `parse: ${e instanceof Error ? e.message : String(e)}`;
    empty.httpStatus = 200;
    return empty;
  }

  // Fetch per-train detail pages for every unique train number we saw.
  // Concurrency-3 with 250ms gaps between batch starts keeps us polite
  // (railrat.net is a small hobby site).
  const uniqueNumbers = Array.from(
    new Set([...arriving, ...departed].map((e) => e.trainNumber).filter(Boolean)),
  );
  const details = await fetchTrainDetails(uniqueNumbers);

  return {
    scrapedAt,
    lastUpdated: extractLastUpdated(html),
    arriving,
    departed,
    details,
    httpStatus: 200,
    error: null,
  };
}

// ---- Per-train detail page fetch + parse --------------------------------

const TRAIN_FETCH_CONCURRENCY = 3;
const TRAIN_FETCH_GAP_MS = 250;

async function fetchTrainDetails(numbers: string[]): Promise<Record<string, TrainDetail>> {
  const out: Record<string, TrainDetail> = {};
  if (!numbers.length) return out;
  // Process in batches of TRAIN_FETCH_CONCURRENCY with a small gap
  // between batches so we don't slam railrat.net.
  for (let i = 0; i < numbers.length; i += TRAIN_FETCH_CONCURRENCY) {
    const batch = numbers.slice(i, i + TRAIN_FETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((n) => fetchTrainDetail(n)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      const num = batch[j];
      if (r.status === 'fulfilled' && r.value) out[num] = r.value;
    }
    if (i + TRAIN_FETCH_CONCURRENCY < numbers.length) {
      await new Promise((res) => setTimeout(res, TRAIN_FETCH_GAP_MS));
    }
  }
  return out;
}

export async function fetchTrainDetail(trainNumber: string): Promise<TrainDetail | null> {
  const base: TrainDetail = {
    trainNumber,
    routeName: null,
    updated: null,
    origin: null,
    destination: null,
    scheduledDeparture: null,
    status: null,
    currentPosition: null,
    distanceToDestination: null,
    distanceFromOrigin: null,
    currentLat: null,
    currentLon: null,
    progress: [],
    positions: [],
    httpStatus: 0,
    error: null,
  };
  let html = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(`https://railrat.net/trains/${encodeURIComponent(trainNumber)}/`, {
      headers: {
        'User-Agent': 'mtz.city (hyperlocal dashboard; +https://mtz.city)',
        'Accept': 'text/html',
      },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    base.httpStatus = r.status;
    if (!r.ok) { base.error = `${r.status} ${r.statusText}`; return base; }
    html = await r.text();
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }
  try {
    parseTrainDetailInto(html, base);
    return base;
  } catch (e) {
    base.error = `parse: ${e instanceof Error ? e.message : String(e)}`;
    return base;
  }
}

function parseTrainDetailInto(html: string, out: TrainDetail): void {
  // Route name + train number from the heading.
  const headM = html.match(/<h1>\s*(?:<a[^>]*>([^<]+)<\/a>)?\s*Train\s+(\d+)\s*<\/h1>/i);
  if (headM) {
    out.routeName = headM[1] ? decode(headM[1]).trim() : null;
  }
  // "updated 08:54 on 05/26" line.
  const updM = html.match(/updated\s+([0-9:]+)\s*(?:&nbsp;|\s)*on\s*(?:&nbsp;|\s)*(\d{1,2}\/\d{1,2})/i);
  if (updM) out.updated = `${updM[1]} on ${updM[2]}`;

  // ---- Train Status block: origin / destination / status / position
  const statusBlockM = html.match(/<div\s+id="train_status">([\s\S]*?)<\/div>/i);
  if (statusBlockM) {
    const block = statusBlockM[1];
    // Origin / Destination — prefer the viewport-1 (verbose) span text.
    const originM = block.match(/<span\s+class="viewport-1">\s*Origin:\s*([^<]+?)<\/span>/i);
    const destM   = block.match(/<span\s+class="viewport-1">\s*Destination:\s*([^<]+?)<\/span>/i);
    if (originM) {
      const text = decode(originM[1]).trim();
      // Split off the ", sch. departure …" tail if present.
      const schM = text.match(/^(.*?),\s*sch\.?\s*departure\s+(.+)$/i);
      if (schM) { out.origin = schM[1].trim(); out.scheduledDeparture = schM[2].trim(); }
      else out.origin = text;
    }
    if (destM) out.destination = decode(destM[1]).trim();
    // Status: Active / Departed / etc.
    const stM = block.match(/<li>\s*Status:\s*([^<]+?)<\/li>/i);
    if (stM) out.status = decode(stM[1]).trim();
    // Current position is the first <b>…</b> inside the nested <ul>.
    const posM = block.match(/<li>\s*<b>([\s\S]*?)<\/b>\s*<\/li>/i);
    if (posM) out.currentPosition = decode(stripTags(posM[1])).replace(/\s+/g, ' ').trim();
    // The two miles-to/from siblings.
    const lis = [...block.matchAll(/<li>\s*([^<]+?)\s*<\/li>/gi)].map((m) => decode(m[1]).trim());
    for (const t of lis) {
      if (/^\d+\s+miles?\s+.*\s+of\s+/i.test(t)) {
        if (out.distanceToDestination == null) out.distanceToDestination = t;
        else if (out.distanceFromOrigin == null) out.distanceFromOrigin = t;
      }
    }
  }

  // ---- Progress tracker: ordered list of every station stop
  const progM = html.match(/<div\s+id="train_progress">([\s\S]*?)<\/div>/i);
  if (progM) {
    const olM = progM[1].match(/<ol>([\s\S]*?)<\/ol>/i);
    if (olM) {
      // Each station <li> in the <ol>. railrat doesn't always close
      // the <li> tags, so split on lookahead.
      const items = olM[1].split(/(?=<li>)/i).map((s) => s.replace(/^<li>/i, '').trim()).filter(Boolean);
      for (const raw of items) {
        const stop = parseStop(raw);
        if (stop) out.progress.push(stop);
      }
    }
  }

  // ---- Position updates
  const posBlockM = html.match(/<div\s+id="train_position_updates[^"]*">([\s\S]*?)<\/div>/i);
  if (posBlockM) {
    const ulM = posBlockM[1].match(/<ul>([\s\S]*?)<\/ul>/i);
    if (ulM) {
      const items = [...ulM[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
      for (const raw of items) {
        const ping = parsePing(raw);
        if (ping) out.positions.push(ping);
      }
    }
  }

  // ---- Lat/lon extraction from the embedded Leaflet JS
  // Stations: L.marker([lat,lon],{icon:marker_grey_sm,...}).addTo(mymap).bindPopup("<b>Name, ST [CODE]</b>...
  // Current train: L.marker([lat,lon],{icon:marker_blue_med,...})
  // Position pings: L.circleMarker([lat,lon],blueCircle).addTo(mymap).bindPopup("<b>... HH:MM ...
  attachStationCoords(html, out.progress);
  attachPingCoords(html, out.positions);
  const blueM = html.match(/L\.marker\(\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\][^)]*marker_blue_med/);
  if (blueM) {
    out.currentLat = parseFloat(blueM[1]);
    out.currentLon = parseFloat(blueM[2]);
  }
}

function parseStop(raw: string): TrainStop | null {
  // raw is e.g.
  //   <a href="/stations/SUI/" title="...">SUI</a>, est. arrival 08:55,
  //   8 min. late<span class="viewport-1"><i>, est. departure 08:56,
  //   8 min. late (Suisun–Fairfield)</i></span>.
  const codeM = raw.match(/<a\s+href="\/stations\/([A-Z]+)\/"/i);
  if (!codeM) return null;
  const code = codeM[1].toUpperCase();
  // Station name from the inline (...) inside the viewport-1 span.
  const nameM = raw.match(/<i>[^(]*\(([^)]+?)\)<\/i>/i);
  const name = nameM ? decode(nameM[1]).trim() : code;

  const flat = decode(stripTags(raw)).replace(/\s+/g, ' ').trim();

  const stop: TrainStop = {
    code, name, state: 'upcoming', delay: null,
    scheduledDeparture: null, actualDeparture: null, estimatedDeparture: null,
    scheduledArrival: null, actualArrival: null, estimatedArrival: null,
    lat: null, lon: null,
  };

  // Past stops use "<b>departed</b> HH:MM[…], <delay>" form. Future stops
  // use "est. arrival HH:MM, <delay>" + ", est. departure HH:MM, <delay>".
  const past = /\bdeparted\b/i.test(raw);
  stop.state = past ? 'past' : 'upcoming';

  if (past) {
    // departed 06:18 PT[, arrived 06:24]
    const depM = flat.match(/departed\s+(\d{1,2}:\d{2})/i);
    if (depM) stop.actualDeparture = depM[1];
    const arrM = flat.match(/arrived\s+(\d{1,2}:\d{2})/i);
    if (arrM) stop.actualArrival = arrM[1];
  } else {
    // est. arrival 08:55[, est. departure 08:56]
    const arrM = flat.match(/est\.\s*arrival\s+(\d{1,2}:\d{2})/i);
    if (arrM) stop.estimatedArrival = arrM[1];
    const depM = flat.match(/est\.\s*departure\s+(\d{1,2}:\d{2})/i);
    if (depM) stop.estimatedDeparture = depM[1];
  }
  // Delay text is one of "on time" or "N min. (late|early)" — extract
  // independently of the time. The first occurrence wins (matches the
  // primary departed/arrival event; a subsequent departure delay shows
  // up later in the line).
  const delayM = flat.match(/(?:on\s+time|\d+\s+min\.\s+(?:late|early))/i);
  if (delayM) stop.delay = delayM[0].replace(/\s+/g, ' ').trim();
  return stop;
}

function parsePing(raw: string): PositionPing | null {
  // <li>08:54 - 0 mi SW of Suisun–Fairfield [<a ...>SUI</a>], 39 mph N</li>
  const flat = decode(stripTags(raw)).replace(/\s+/g, ' ').trim();
  const timeM = flat.match(/^(\d{1,2}:\d{2})\s*-\s*(.+)$/);
  if (!timeM) return null;
  const time = timeM[1];
  let rest = timeM[2];
  // Try to split off "<speed> mph <heading>" tail.
  let speed: string | null = null;
  const spM = rest.match(/,\s*(\d+\s*mph\s*[A-Z]*)\s*$/i);
  if (spM) { speed = spM[1].replace(/\s+/g, ' ').trim(); rest = rest.slice(0, spM.index).trim(); }
  // "0 mi SW of Suisun–Fairfield [SUI]"
  const stnM = rest.match(/\[([A-Z]+)\]\s*$/i);
  return {
    time,
    description: rest,
    nearStation: stnM ? stnM[1].toUpperCase() : null,
    speed,
    lat: null,
    lon: null,
  };
}

function attachStationCoords(html: string, stops: TrainStop[]): void {
  // Walk every L.marker([lat,lon], …).bindPopup("<b>Name, ST [CODE]</b>…")
  // call, pull the code from the popup, and stitch back to the stop.
  const re = /L\.marker\(\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\][^)]*\)\.addTo\(mymap\)\.bindPopup\("([^"]*)"/g;
  const byCode = new Map<string, { lat: number; lon: number }>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const popup = m[3];
    const codeM = popup.match(/\[([A-Z]+)\]/);
    if (!codeM) continue;
    byCode.set(codeM[1].toUpperCase(), { lat: parseFloat(m[1]), lon: parseFloat(m[2]) });
  }
  for (const s of stops) {
    const c = byCode.get(s.code);
    if (c) { s.lat = c.lat; s.lon = c.lon; }
  }
}

function attachPingCoords(html: string, pings: PositionPing[]): void {
  // L.circleMarker([lat,lon],blueCircle).addTo(mymap).bindPopup("<b>...
  //   </b><small><br>HH:MM <description>, <speed></small>")
  // Match the time inside the popup back to the ping list.
  const re = /L\.circleMarker\(\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\][^)]*\)\.addTo\(mymap\)\.bindPopup\("([^"]*)"/g;
  const byTime = new Map<string, { lat: number; lon: number }>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const popup = m[3];
    const tM = popup.match(/<br>(\d{1,2}:\d{2})\b/);
    if (!tM) continue;
    // Keep the FIRST occurrence — railrat doesn't repeat times within
    // the visible window.
    if (!byTime.has(tM[1])) byTime.set(tM[1], { lat: parseFloat(m[1]), lon: parseFloat(m[2]) });
  }
  for (const p of pings) {
    const c = byTime.get(p.time);
    if (c) { p.lat = c.lat; p.lon = c.lon; }
  }
}

// ---- Parsing helpers ----------------------------------------------------

// Pull the <li>…</li> blocks under the `<ul>` that immediately follows
// the given `<h2>HEADING</h2>`. Each <li> contains a nested <ul> inside
// its detail <div>, so a non-greedy `</ul>` match would terminate at the
// FIRST nested </ul>. We walk <ul>/</ul> tags depth-aware to find the
// matching outer close.
function extractSection(html: string, heading: string): string[] {
  const headRe = new RegExp(`<h2>\\s*${escapeRegex(heading)}\\s*</h2>\\s*<ul[^>]*>`, 'i');
  const startM = html.match(headRe);
  if (!startM || startM.index === undefined) return [];
  const ulStart = startM.index + startM[0].length;
  // Walk forward through <ul>/</ul> with depth tracking. We just opened
  // the outer <ul>, so we start at depth 1.
  const re = /<ul\b[^>]*>|<\/ul>/gi;
  re.lastIndex = ulStart;
  let depth = 1;
  let m: RegExpExecArray | null;
  let ulEnd = -1;
  while ((m = re.exec(html)) !== null) {
    if (m[0].toLowerCase().startsWith('</ul')) {
      depth--;
      if (depth === 0) { ulEnd = m.index; break; }
    } else {
      depth++;
    }
  }
  if (ulEnd === -1) return [];
  return splitTopLevelLi(html.slice(ulStart, ulEnd));
}

function splitTopLevelLi(inner: string): string[] {
  const out: string[] = [];
  // Find every occurrence of <li ... > / </li> with a tiny tokenizer.
  const re = /<li\b[^>]*>|<\/li>/gi;
  let depth = 0;
  let start = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(inner)) !== null) {
    const tag = match[0].toLowerCase();
    if (tag.startsWith('</li')) {
      depth--;
      if (depth === 0 && start !== -1) {
        out.push(inner.slice(start, match.index));
        start = -1;
      }
    } else {
      if (depth === 0) start = match.index + match[0].length;
      depth++;
    }
  }
  return out;
}

const STATUS_RE = /,\s*(?:<span[^>]*>)?\s*((?:\d+m\s*(?:&nbsp;)?(?:lt|er))|(?:on\s*(?:&nbsp;)?tm))\s*(?:<\/span>)?/i;
const ANCHOR_RE = /<a\s+href="(\/trains\/(\d+)\/)"[^>]*>([^<]+)<\/a>/i;
const LEADING_TIME_RE = /^\s*(\d{1,2}:\d{2})\b/;

function parseEntry(liInner: string): TrainEntry | null {
  // Pull railrat's per-instance id from the detail-div's id (or the
  // ReverseDisplay toggle target) BEFORE we strip JS anchors.
  const railratM = liInner.match(/<div\s+id="([ad])(\d+)"\s+class="(?:arriving|departed)"/i);
  // Strip out the "more_vert" toggle link so the comma-status regex
  // doesn't trip over it.
  const cleaned = liInner.replace(/<a\s+href="javascript:[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');

  const timeM = cleaned.match(LEADING_TIME_RE);
  const anchorM = cleaned.match(ANCHOR_RE);
  if (!timeM || !anchorM) return null;
  const trainName = decode(anchorM[3]).trim();
  // The train name string is "Route Name 5" / "Capitol Corridor 528"
  // etc. Strip trailing digits to get the bare route.
  const routeName = trainName.replace(/\s+\d+$/, '');

  const statusM = cleaned.match(STATUS_RE);
  const status = statusM ? normalizeStatus(statusM[1]) : '';
  const warn = /<span\s+class="yellow">/i.test(cleaned);

  // Drill into the detail <div> for route + Ar/Dp lines.
  const detailM = cleaned.match(/<div\s+id="[^"]+"\s+class="(?:arriving|departed)"[^>]*>([\s\S]*?)<\/div>/i);
  let route = '';
  const details: string[] = [];
  if (detailM) {
    const inner = detailM[1];
    const nestedLi = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => decode(stripTags(m[1])).trim());
    if (nestedLi.length) {
      route = nestedLi[0];
      for (let i = 1; i < nestedLi.length; i++) {
        details.push(nestedLi[i]);
      }
    }
  }

  const railratId = railratM ? railratM[2] : '';
  // Fallback: if we couldn't capture railrat's id (page format drifted),
  // synthesize a key from train_number + display_time. Better than
  // dropping the row.
  const id = railratId || `${anchorM[2]}-${timeM[1]}`;

  return {
    railratId: id,
    time: timeM[1],
    trainNumber: anchorM[2],
    trainName,
    routeName,
    trainUrl: `https://railrat.net${anchorM[1]}`,
    status,
    minutesOff: statusToMinutes(status),
    warn,
    route,
    details,
    scheduledAt: buildScheduledAt(timeM[1], details),
  };
}

// Combine the leading HH:MM with any "MM/DD" we find in the detail
// lines (e.g. "Ar est. 15:47 05/27") into a full UTC ISO timestamp.
// Train times are Pacific; we convert to UTC for storage.
//
// Heuristic: pick the latest MM/DD that appears in any detail line —
// that's usually the actual stop date (departed entries show today's
// or yesterday's date; future arrivals show tomorrow's). If nothing
// is found, assume today in America/Los_Angeles.
function buildScheduledAt(hhmm: string, details: string[]): string | null {
  const hhmmM = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!hhmmM) return null;
  const hh = Number(hhmmM[1]);
  const mm = Number(hhmmM[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  // Scan detail lines for MM/DD tokens.
  const candidates: Array<[number, number]> = [];
  for (const d of details) {
    const re = /\b(\d{1,2})\/(\d{1,2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) {
      const mo = Number(m[1]); const da = Number(m[2]);
      if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) candidates.push([mo, da]);
    }
  }

  // Pacific "today" in MM/DD form, so we can pick a year sensibly when
  // the MM/DD straddles year boundaries (e.g. scrape on 01/02 sees 12/31).
  const nowPt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const ptYear  = Number(nowPt.find((p) => p.type === 'year')?.value);
  const ptMonth = Number(nowPt.find((p) => p.type === 'month')?.value);
  const ptDay   = Number(nowPt.find((p) => p.type === 'day')?.value);

  let mo = ptMonth, da = ptDay;
  if (candidates.length) {
    // Pick the latest (largest) candidate date in calendar order.
    candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    [mo, da] = candidates[candidates.length - 1];
  }

  // Year resolution: assume current Pacific year, but if the candidate
  // is much earlier than today (>6mo) treat it as next year, and if
  // much later (>6mo) treat it as last year. Handles both rollover
  // directions defensively.
  let yr = ptYear;
  const diff = (mo - ptMonth) * 31 + (da - ptDay);
  if (diff < -180) yr += 1;
  else if (diff > 180) yr -= 1;

  // Convert Pacific local wall-clock to UTC. Easiest correct way: build
  // a Date as if the wall-clock were UTC, then ask Intl what offset
  // Pacific would have at that instant, and shift.
  const naive = Date.UTC(yr, mo - 1, da, hh, mm);
  // Get the Pacific offset (in minutes) at the naive instant.
  const ptFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = ptFmt.formatToParts(new Date(naive));
  const pYr = Number(parts.find((p) => p.type === 'year')?.value);
  const pMo = Number(parts.find((p) => p.type === 'month')?.value);
  const pDa = Number(parts.find((p) => p.type === 'day')?.value);
  const pHr = Number(parts.find((p) => p.type === 'hour')?.value);
  const pMi = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(pYr)) return null;
  const ptUtc = Date.UTC(pYr, pMo - 1, pDa, pHr, pMi);
  // Difference = Pacific-as-UTC minus actual UTC instant; subtract to
  // shift the naive UTC into real UTC.
  const offsetMs = ptUtc - naive;
  return new Date(naive - offsetMs).toISOString();
}

function normalizeStatus(raw: string): string {
  // Collapse &nbsp; + whitespace so callers see consistent text.
  return raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function statusToMinutes(status: string): number | null {
  if (!status) return null;
  if (/^on\s*tm$/i.test(status)) return 0;
  const m = status.match(/^(\d+)m\s*(lt|er)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2].toLowerCase() === 'er' ? -n : n;
}

function extractLastUpdated(html: string): string | null {
  const m = html.match(/Last updated\s+([^<]+?)\s*<\/small>/i);
  return m ? decode(m[1]).trim() : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function decode(s: string): string {
  return s
    .replace(/&rarr;/g, '→')
    .replace(/&larr;/g, '←')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&hellip;/g, '…');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
