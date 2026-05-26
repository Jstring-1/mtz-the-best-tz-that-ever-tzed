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
}

export interface TrainsPayload {
  scrapedAt: string;          // ISO 8601 UTC
  lastUpdated: string | null; // The "Last updated …" line at the page footer
  arriving: TrainEntry[];
  departed: TrainEntry[];
  /** Diagnostic: HTTP status from the upstream fetch, or 0 if fetch threw. */
  httpStatus: number;
  /** Diagnostic: short error message if the fetch / parse failed. */
  error: string | null;
}

const URL = 'https://railrat.net/stations/MTZ/';

export async function fetchTrains(): Promise<TrainsPayload> {
  const scrapedAt = new Date().toISOString();
  const empty: TrainsPayload = {
    scrapedAt, lastUpdated: null, arriving: [], departed: [],
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

  try {
    const arrSection = extractSection(html, 'Arriving Trains');
    const depSection = extractSection(html, 'Departed Trains');
    const arriving = arrSection.map(parseEntry).filter((e): e is TrainEntry => e !== null);
    const departed = depSection.map(parseEntry).filter((e): e is TrainEntry => e !== null);
    return {
      scrapedAt,
      lastUpdated: extractLastUpdated(html),
      arriving,
      departed,
      httpStatus: 200,
      error: null,
    };
  } catch (e) {
    empty.error = `parse: ${e instanceof Error ? e.message : String(e)}`;
    empty.httpStatus = 200;
    return empty;
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

  return {
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
  };
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
