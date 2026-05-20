// Martinez City Council vote scraper.
//
// Source: cityofmartinez.org runs CivicEngage; meeting minutes are
// linked from the Agenda Center as PDFs. There's no machine-readable
// vote feed — we have to download the minutes and regex out the
// motion / AYES / NOES / ABSENT / ABSTAIN blocks.
//
// The actual minutes-text format isn't guaranteed; this scraper is
// best-effort and logs what it found so we can refine the regex as we
// see real outputs in /admin's apis_json.

import { PDFParse } from 'pdf-parse';

const BASE = 'https://www.cityofmartinez.org';
const INDEX_URLS = [
  `${BASE}/AgendaCenter`,
  `${BASE}/government/city-council/agendas-minutes`,
  `${BASE}/government/city-council`,
];

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
  result: string;             // 'Passed' / 'Failed' / 'Unknown'
  minutesUrl: string;
}

export interface CouncilScrapeResult {
  scrapedAt: string;
  meetings: number;
  votes: CouncilVote[];
  // Debug info for /admin so we can see why parsing returned 0:
  diag: { source: string; minutesLinks: number; pdfBytes: number; voteAnchors: number; httpFailures: string[] };
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) {
      console.warn(`[council] HTML ${url} → ${r.status}`);
      return null;
    }
    return await r.text();
  } catch (e) {
    console.warn(`[council] HTML ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function fetchPdfText(url: string): Promise<{ text: string; bytes: number } | null> {
  try {
    const r = await fetch(url, { headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) {
      console.warn(`[council] PDF ${url} → ${r.status}`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const parser = new PDFParse({ data: buf });
    const out = await parser.getText();
    await parser.destroy();
    const text = typeof out === 'string' ? out : (out?.text ?? '');
    return { text, bytes: buf.length };
  } catch (e) {
    console.warn(`[council] PDF ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// Pull every Minutes-PDF link out of an Agenda Center page. CivicEngage
// links look like /AgendaCenter/ViewFile/Minutes/_MMDDYYYY-NNN?bidId=,
// but we also accept any *.pdf URL whose path or filename contains
// "Minutes".
function extractMinutesLinks(html: string): string[] {
  const re = /href="([^"]+)"/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (!/minutes/i.test(raw)) continue;
    if (!/\.pdf|ViewFile\/Minutes/i.test(raw)) continue;
    const full = raw.startsWith('http')
      ? raw
      : raw.startsWith('/') ? BASE + raw
      : `${BASE}/${raw}`;
    out.add(full.replace(/&amp;/g, '&'));
  }
  return [...out];
}

function extractMeetingDate(text: string): string | null {
  // "Tuesday, May 5, 2026" or "May 5, 2026" — pick the first.
  const m = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
  );
  if (!m) return null;
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  const mo = months[m[1].toLowerCase()];
  const d = Number(m[2]); const y = Number(m[3]);
  if (mo == null || !d || !y) return null;
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Split a name list like "Mayor Ross, Vice Mayor Zorn, Councilmembers
// Malhi, Howard, McKillop" into clean surnames-ish entries.
function splitNames(blob: string): string[] {
  return (blob || '')
    .replace(/\bAnd\b/gi, ',')
    .split(/\s*[,;]\s*/)
    .map((s) => s
      .replace(/\b(Mayor|Vice\s*Mayor|Councilmembers?|Member|Council\s*Member)\b\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim(),
    )
    .filter(Boolean)
    .filter((s) => s.toLowerCase() !== 'none')
    .slice(0, 7);  // safety cap
}

// Find each AYES anchor and pull the surrounding motion + name lists.
function parseVoteBlocks(rawText: string): Array<Omit<CouncilVote, 'meetingDate' | 'meetingType' | 'minutesUrl'>> {
  // Collapse weird PDF whitespace but keep newlines as soft breaks.
  const text = rawText.replace(/[ \t\f\v]+/g, ' ').replace(/\n{2,}/g, '\n');
  const out: Array<Omit<CouncilVote, 'meetingDate' | 'meetingType' | 'minutesUrl'>> = [];
  const ayeRe = /\bAYES?\s*[:.]/gi;
  let m: RegExpExecArray | null;
  while ((m = ayeRe.exec(text))) {
    const start = m.index;
    const win = text.slice(start, start + 800);
    const ayesM   = win.match(/^AYES?\s*[:.]\s*([\s\S]+?)(?=\b(?:NOES?|NAYS?|ABSENT|ABSTAIN|MOTION|$))/i);
    const noesM   = win.match(/\b(?:NOES?|NAYS?)\s*[:.]\s*([\s\S]+?)(?=\b(?:ABSENT|ABSTAIN|MOTION|$))/i);
    const absM    = win.match(/\bABSENT\s*[:.]\s*([\s\S]+?)(?=\b(?:ABSTAIN|MOTION|$))/i);
    const abstM   = win.match(/\bABSTAIN[A-Z]*\s*[:.]\s*([\s\S]+?)(?=\b(?:MOTION|$))/i);
    const ayes = splitNames(ayesM?.[1] ?? '');
    if (ayes.length === 0) continue;
    const noes    = splitNames(noesM?.[1] ?? '');
    const absent  = splitNames(absM?.[1] ?? '');
    const abstain = splitNames(abstM?.[1] ?? '');

    // Title: look back ~800 chars for the nearest numbered/headed item.
    const back = text.slice(Math.max(0, start - 800), start);
    // Try patterns like "5.A. TITLE" or "6. TITLE" at line start, or
    // "ITEM 5.A — Title", with a fallback to the nearest ALL-CAPS line.
    const itemM =
         back.match(/(?:^|\n)\s*([0-9]+\.?[A-Z]?\.?\s+[^\n]{6,140})\s*\n/g)
      ?? back.match(/\b(?:ITEM|Agenda Item)\s+[0-9]+\.?[A-Z]?\.?\s*[—-]?\s*([^\n]{6,140})/i);
    let title = '';
    if (Array.isArray(itemM)) {
      const last = itemM[itemM.length - 1];
      title = last.replace(/^\s*\n?/, '').trim();
    } else if (itemM && typeof itemM === 'object' && 'index' in itemM) {
      const r = itemM as unknown as RegExpMatchArray;
      title = (r[1] ?? r[0] ?? '').trim();
    }
    if (!title) {
      // Fallback: take the last non-blank line of `back`.
      const lines = back.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      title = (lines[lines.length - 1] ?? '').slice(0, 140);
    }

    // Motion: a line above containing "Motion by"/"Motion was made".
    const motionM = back.match(/(Motion\s+(?:was\s+)?(?:made\s+)?by[\s\S]{0,200}?)(?=AYES|NOES|$)/i);
    const motionText = motionM ? motionM[1].replace(/\s+/g, ' ').trim() : undefined;

    // Result heuristic: noes/absent/abstain emptiness + magic words.
    const tally = `${noes.length}-${absent.length}-${abstain.length}`;
    let result = 'Unknown';
    if (/motion\s+carried|passed|adopted|approved/i.test(win)) result = 'Passed';
    else if (/motion\s+failed|failed|denied/i.test(win)) result = 'Failed';
    else if (ayes.length >= 3 && noes.length === 0) result = 'Passed';
    void tally;

    out.push({ itemTitle: title.slice(0, 240), motionText, ayes, noes, absent, abstain, result });
  }
  return out;
}

export async function scrapeCouncilVotes(): Promise<CouncilScrapeResult> {
  const diag: CouncilScrapeResult['diag'] = {
    source: '', minutesLinks: 0, pdfBytes: 0, voteAnchors: 0, httpFailures: [],
  };
  let html: string | null = null;
  let source = '';
  for (const u of INDEX_URLS) {
    html = await fetchHtml(u);
    if (html) { source = u; break; }
    diag.httpFailures.push(u);
  }
  diag.source = source;
  if (!html) {
    return { scrapedAt: new Date().toISOString(), meetings: 0, votes: [], diag };
  }
  const links = extractMinutesLinks(html).slice(0, 8);   // last 8 meetings
  diag.minutesLinks = links.length;
  const votes: CouncilVote[] = [];
  let anchors = 0;
  for (const url of links) {
    const pdfRes = await fetchPdfText(url);
    if (!pdfRes) { diag.httpFailures.push(url); continue; }
    diag.pdfBytes += pdfRes.bytes;
    const blocks = parseVoteBlocks(pdfRes.text);
    anchors += blocks.length;
    const meetingDate = extractMeetingDate(pdfRes.text) ?? '';
    for (const b of blocks) {
      votes.push({
        ...b,
        meetingDate,
        meetingType: 'City Council',
        minutesUrl: url,
      });
    }
  }
  diag.voteAnchors = anchors;
  // Most-recent meetings first.
  votes.sort((a, b) => (b.meetingDate || '').localeCompare(a.meetingDate || ''));
  return { scrapedAt: new Date().toISOString(), meetings: links.length, votes, diag };
}
