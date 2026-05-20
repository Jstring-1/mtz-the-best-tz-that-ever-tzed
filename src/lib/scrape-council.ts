// Martinez City Council meetings index.
//
// Granicus exposes two RSS feeds keyed by `view_id=9`:
//   ...ViewPublisherRSS.php?view_id=9&mode=agendas
//   ...ViewPublisherRSS.php?view_id=9&mode=minutes
//
// Each item's URL contains a `clip_id` that uniquely identifies the
// meeting; the same clip_id appears in both feeds. We fetch both,
// group by clip_id, and emit a list of meetings each with an optional
// agenda PDF URL + minutes PDF URL.

const GRANICUS_BASE = 'https://martinez.granicus.com';
const AGENDAS_RSS  = `${GRANICUS_BASE}/ViewPublisherRSS.php?view_id=9&mode=agendas`;
const MINUTES_RSS  = `${GRANICUS_BASE}/ViewPublisherRSS.php?view_id=9&mode=minutes`;
const COUNCIL_NAME_RE = /city\s*council/i;

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface CouncilMeeting {
  clipId: string;
  title: string;          // e.g. "City Council Regular Session - Apr 15, 2026"
  date: string;           // ISO YYYY-MM-DD when parseable; otherwise ''
  pubDate: string;        // raw RSS pubDate (always available, for sorting)
  agendaUrl?: string;
  minutesUrl?: string;
}

export interface CouncilScrapeResult {
  scrapedAt: string;
  meetings: CouncilMeeting[];
  diag: {
    agendasItems: number;
    minutesItems: number;
    councilMeetings: number;
    httpFailures: string[];
  };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) { console.warn(`[council] ${url} → ${r.status}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[council] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

interface RssItem { title: string; link: string; pubDate: string }

function parseRss(xml: string): RssItem[] {
  const out: RssItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const stripCdata = (s: string) =>
    s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
  const tag = (body: string, name: string) => {
    const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i');
    const m = body.match(re);
    return m ? stripCdata(m[1]) : '';
  };
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const body = m[1];
    out.push({
      title:   tag(body, 'title'),
      link:    tag(body, 'link').replace(/&amp;/g, '&'),
      pubDate: tag(body, 'pubDate'),
    });
  }
  return out;
}

function clipIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]clip_id=(\d+)/);
  return m ? m[1] : null;
}

function isoDateFromTitle(title: string, pubDate: string): string {
  // Granicus titles always end with "Mon DD, YYYY" e.g. "Apr 15, 2026".
  const m = title.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i,
  );
  if (m) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mo = months[m[1].slice(0, 3).toLowerCase()];
    const d = Number(m[2]); const y = Number(m[3]);
    if (mo != null && d && y) {
      return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  if (pubDate) {
    const ms = Date.parse(pubDate);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return '';
}

export async function scrapeCouncilVotes(): Promise<CouncilScrapeResult> {
  const diag: CouncilScrapeResult['diag'] = {
    agendasItems: 0, minutesItems: 0, councilMeetings: 0, httpFailures: [],
  };
  const [agXml, miXml] = await Promise.all([
    fetchText(AGENDAS_RSS),
    fetchText(MINUTES_RSS),
  ]);
  if (!agXml) diag.httpFailures.push(AGENDAS_RSS);
  if (!miXml) diag.httpFailures.push(MINUTES_RSS);

  const agendaItems  = agXml ? parseRss(agXml) : [];
  const minutesItems = miXml ? parseRss(miXml) : [];
  diag.agendasItems = agendaItems.length;
  diag.minutesItems = minutesItems.length;

  // Build merged meetings keyed by clipId. Title from whichever feed
  // has it; if both, prefer the agenda's (they're usually identical).
  const byClip = new Map<string, CouncilMeeting>();
  const add = (it: RssItem, kind: 'agenda' | 'minutes') => {
    if (!COUNCIL_NAME_RE.test(it.title)) return;
    const clipId = clipIdFromUrl(it.link);
    if (!clipId) return;
    let m = byClip.get(clipId);
    if (!m) {
      m = {
        clipId,
        title: it.title,
        date: isoDateFromTitle(it.title, it.pubDate),
        pubDate: it.pubDate,
      };
      byClip.set(clipId, m);
    }
    if (kind === 'agenda')  m.agendaUrl  = it.link;
    if (kind === 'minutes') m.minutesUrl = it.link;
  };
  for (const it of agendaItems)  add(it, 'agenda');
  for (const it of minutesItems) add(it, 'minutes');

  const meetings = [...byClip.values()].sort((a, b) => {
    // Newest first by date; fall back to pubDate parsing.
    const da = a.date || (a.pubDate ? new Date(a.pubDate).toISOString().slice(0, 10) : '');
    const db = b.date || (b.pubDate ? new Date(b.pubDate).toISOString().slice(0, 10) : '');
    return db.localeCompare(da);
  });

  diag.councilMeetings = meetings.length;
  return {
    scrapedAt: new Date().toISOString(),
    meetings: meetings.slice(0, 40),   // cap for payload size
    diag,
  };
}
