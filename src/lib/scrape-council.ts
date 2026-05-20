// Martinez City Council vote scraper — Granicus edition.
//
// The City of Martinez publishes a Granicus RSS feed of every City
// Council meeting's minutes. Granicus also exposes per-meeting pages
// that link to the actual minutes PDF. We:
//
//   1. Pull the minutes RSS feed.
//   2. For each <item>, find the minutes-PDF URL (either from the
//      description's HTML or by following the link page).
//   3. Download the PDF, extract text via pdf-parse.
//   4. Regex out the motion + AYES/NOES/ABSENT/ABSTAIN blocks.

import { PDFParse } from 'pdf-parse';

const GRANICUS_BASE = 'https://martinez.granicus.com';
const MINUTES_RSS = `${GRANICUS_BASE}/ViewPublisherRSS.php?view_id=9&mode=minutes`;
const COUNCIL_NAME_RE = /city\s*council/i;

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const COMMON_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface CouncilVote {
  meetingDate: string;
  meetingType: string;
  itemTitle: string;
  motionText?: string;
  ayes: string[];
  noes: string[];
  absent: string[];
  abstain: string[];
  result: string;
  minutesUrl: string;
}

export interface CouncilScrapeResult {
  scrapedAt: string;
  meetings: number;
  votes: CouncilVote[];
  diag: {
    source: string;
    rssItems: number;
    councilItems: number;
    pdfsFound: number;
    pdfBytes: number;
    voteAnchors: number;
    httpFailures: Array<{ url: string; status: number; contentType: string; snippet: string; error?: string }>;
    sample?: Array<{ title: string; pdfUrl: string | null }>;
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
interface PdfFailure { url: string; status: number; contentType: string; snippet: string; error?: string }
async function fetchPdfText(url: string): Promise<{ text: string; bytes: number } | PdfFailure> {
  // Granicus's MinutesViewer.php returns a PDF stream; some servers
  // gate it on referer + accept. Provide both to be safe.
  const headers: Record<string, string> = {
    ...COMMON_HEADERS,
    'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
    'Referer': `${GRANICUS_BASE}/`,
  };
  try {
    const r = await fetch(url, { headers, cache: 'no-store', redirect: 'follow' });
    const ct = r.headers.get('content-type') ?? '';
    if (!r.ok) {
      const body = (await r.text().catch(() => '')).slice(0, 200);
      return { url, status: r.status, contentType: ct, snippet: body.replace(/\s+/g, ' ') };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    // Spot-check the magic bytes; if it's HTML/error page pdf-parse will
    // throw with an unhelpful message, so surface that ourselves.
    const head = buf.slice(0, 8).toString('latin1');
    if (!head.startsWith('%PDF')) {
      return {
        url, status: r.status, contentType: ct,
        snippet: buf.slice(0, 200).toString('utf8').replace(/\s+/g, ' '),
        error: `Response not a PDF (starts: ${head.replace(/[^\x20-\x7E]/g, '.')})`,
      };
    }
    try {
      const parser = new PDFParse({ data: buf });
      const out = await parser.getText();
      await parser.destroy();
      const text = typeof out === 'string' ? out : (out?.text ?? '');
      return { text, bytes: buf.length };
    } catch (e) {
      return {
        url, status: r.status, contentType: ct, snippet: '',
        error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      };
    }
  } catch (e) {
    return {
      url, status: 0, contentType: '', snippet: '',
      error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    };
  }
}

interface RssItem { title: string; link: string; description: string; pubDate: string }

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
      title:       tag(body, 'title'),
      link:        tag(body, 'link'),
      description: tag(body, 'description'),
      pubDate:     tag(body, 'pubDate'),
    });
  }
  return out;
}

// Granicus's `MinutesViewer.php?view_id=...&clip_id=...` URL doesn't
// serve HTML — it streams the minutes PDF directly. So the RSS item's
// <link> *is* the PDF URL; no extra resolve step is needed.

function extractMeetingDate(item: RssItem, text: string): string {
  // Granicus titles often have "5/7/2025" or "May 7, 2025".
  const mNumeric = item.title.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (mNumeric) {
    const [_, mm, dd, yy] = mNumeric;
    const y = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const mNamed = (item.title + ' ' + text).match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
  );
  if (mNamed) {
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };
    const mo = months[mNamed[1].toLowerCase()];
    const d = Number(mNamed[2]); const y = Number(mNamed[3]);
    if (mo != null && d && y) return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (item.pubDate) {
    const ms = Date.parse(item.pubDate);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return '';
}

// Strip honorifics + extra whitespace from a parenthetical list of names
// like "Zorn, Howard, Young, Malhi, McKillop".
function splitNames(blob: string): string[] {
  return (blob || '')
    .replace(/\bAnd\b/gi, ',')
    .split(/\s*[,;]\s*|\s+and\s+/i)
    .map((s) => s
      .replace(/\b(Mayor|Vice\s*Mayor|Councilmembers?|Member|Council\s*Member|CMR|VM)\b\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim(),
    )
    .filter(Boolean)
    .filter((s) => s.toLowerCase() !== 'none')
    .slice(0, 7);
}

// Pull "(Names)" out of a phrase like "Five Ayes (Zorn, Howard, …)".
function tally(window: string, kind: RegExp): string[] {
  const m = window.match(kind);
  return m ? splitNames(m[1]) : [];
}

// Martinez minutes use a "Motion by X seconded by Y, to <action>. Motion
// carried; Five Ayes (Names). One Nay (Name). Abstain (Name). Absent
// (Name)." structure. We anchor on each `Motion … Motion carried/failed`
// pair and parse the surrounding tallies.
function parseVoteBlocks(rawText: string): Array<Omit<CouncilVote, 'meetingDate' | 'meetingType' | 'minutesUrl'>> {
  const text = rawText.replace(/[ \t\f\v]+/g, ' ').replace(/\n{2,}/g, '\n');
  const out: Array<Omit<CouncilVote, 'meetingDate' | 'meetingType' | 'minutesUrl'>> = [];

  const motionRe = /Motion\s+by\s+([^,.]{0,80}?)\s+seconded\s+by\s+([^,.]{0,80}?)\s*,?\s*to\s+([\s\S]{1,400}?)\.\s*Motion\s+(carried|failed|adopted|approved|denied)/gi;
  let m: RegExpExecArray | null;
  while ((m = motionRe.exec(text))) {
    const start = m.index;
    const win = text.slice(start, Math.min(text.length, start + 600));

    const ayes    = tally(win, /(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+)\s+Ayes?\s*\(([^)]+)\)/i);
    const noes    = tally(win, /(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+)\s+Nay(?:s)?\s*\(([^)]+)\)/i);
    const abstain = tally(win, /Abstain(?:ing|ed)?\s*\(([^)]+)\)/i);
    const absent  = tally(win, /Absent\s*\(([^)]+)\)/i);

    const mover     = (m[1] ?? '').replace(/\b(CMR|VM|Mayor|Councilmember)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
    const seconder  = (m[2] ?? '').replace(/\b(CMR|VM|Mayor|Councilmember)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
    const motionAction = m[3].replace(/\s+/g, ' ').trim();
    const result = /carried|adopted|approved/i.test(m[4]) ? 'Passed' : 'Failed';

    // Item title: nearest preceding "N. Title" header.
    const back = text.slice(Math.max(0, start - 600), start);
    const itemMatches = [...back.matchAll(/(?:^|\n|\s\.\s)\s*(\d{1,3}\.\s+[A-Z][^.\n]{6,200})/g)];
    const title = itemMatches.length
      ? (itemMatches[itemMatches.length - 1][1] ?? '').trim().slice(0, 240)
      : motionAction.slice(0, 240);

    out.push({
      itemTitle: title,
      motionText: `Motion by ${mover}, seconded by ${seconder}: ${motionAction}`,
      ayes, noes, absent, abstain, result,
    });
  }
  return out;
}

export async function scrapeCouncilVotes(): Promise<CouncilScrapeResult> {
  const diag: CouncilScrapeResult['diag'] = {
    source: MINUTES_RSS,
    rssItems: 0, councilItems: 0, pdfsFound: 0, pdfBytes: 0, voteAnchors: 0,
    httpFailures: [], sample: [],
  };
  const xml = await fetchText(MINUTES_RSS);
  if (!xml) {
    diag.httpFailures.push({ url: MINUTES_RSS, status: 0, contentType: '', snippet: '', error: 'RSS fetch failed' });
    return { scrapedAt: new Date().toISOString(), meetings: 0, votes: [], diag };
  }
  const items = parseRss(xml);
  diag.rssItems = items.length;
  // view_id=9 *should* be City Council only, but be defensive.
  const councilItems = items.filter((it) => !it.title || COUNCIL_NAME_RE.test(it.title));
  diag.councilItems = councilItems.length;
  const recent = councilItems.slice(0, 8);

  const votes: CouncilVote[] = [];
  for (const it of recent) {
    const pdfUrl = (it.link || '').replace(/&amp;/g, '&');
    diag.sample!.push({ title: it.title.slice(0, 80), pdfUrl: pdfUrl || null });
    if (!pdfUrl) continue;
    const pdfRes = await fetchPdfText(pdfUrl);
    if (!('text' in pdfRes)) {
      diag.httpFailures.push(pdfRes);
      continue;
    }
    diag.pdfsFound++;
    diag.pdfBytes += pdfRes.bytes;
    const meetingDate = extractMeetingDate(it, pdfRes.text);
    const blocks = parseVoteBlocks(pdfRes.text);
    diag.voteAnchors += blocks.length;
    for (const b of blocks) {
      votes.push({
        ...b,
        meetingDate,
        meetingType: 'City Council',
        minutesUrl: pdfUrl,
      });
    }
  }
  votes.sort((a, b) => (b.meetingDate || '').localeCompare(a.meetingDate || ''));
  return {
    scrapedAt: new Date().toISOString(),
    meetings: diag.pdfsFound,
    votes,
    diag,
  };
}
