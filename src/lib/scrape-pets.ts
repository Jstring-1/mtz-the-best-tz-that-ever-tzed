// Adoptable-pets scraper for Contra Costa Animal Services. CCAS publishes
// via 24petconnect.com using a server-rendered HTML template — no
// JSON-LD, no public JSON endpoint. We anchor on the photo IMG tags
// (src="/image/<id>") and extract each pet's labelled fields from the
// chunk of HTML up to the next photo.
//
// Each call hits the dog page + cat page in parallel and returns a
// flat list. Fails open per source.

import { stripHtml as stripHtmlInner } from './scrape-events';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const COMMON_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const SOURCES: Array<{ url: string; species: string }> = [
  { url: 'https://24petconnect.com/CCASDAvailablePets?at=Dog&sb=days_MaxMin', species: 'Dog' },
  { url: 'https://24petconnect.com/CCASDAvailablePets?at=Cat&sb=days_MaxMin', species: 'Cat' },
];

export interface ScrapedPet {
  id: string;                // e.g. "A1034574"
  name: string;
  species: string;
  breed: string | null;
  age: string | null;
  gender: string | null;
  weight: string | null;
  color: string | null;
  intake_date: string | null;
  location: string | null;
  photo_url: string | null;
  description: string | null;
  url: string;
  shelter: string;
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: COMMON_HEADERS, cache: 'no-store' });
    if (!r.ok) { console.warn(`[pets] ${url} → ${r.status}`); return null; }
    return await r.text();
  } catch (e) {
    console.warn(`[pets] ${url} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// Pull one labelled field out of a chunk of HTML. Tolerant of inline
// tags between the label and the value ("Breed: <span>Lab mix</span>").
function pickField(chunk: string, label: string): string | null {
  const re = new RegExp(
    `${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*:\\s*([\\s\\S]*?)(?=<\\s*\\w|\\n|$)`,
    'i',
  );
  const m = chunk.match(re);
  if (!m) return null;
  const v = stripHtmlInner(m[1]).trim();
  return v.length ? v : null;
}

function parsePetsFromHtml(html: string, species: string, listingUrl: string): ScrapedPet[] {
  const out: ScrapedPet[] = [];

  // Anchor on the shelter ID number (A1234567 / 1234567). Every pet
  // listing on 24petconnect has one; that's the most reliable anchor.
  // We slice the HTML around each ID into a "block" and extract fields
  // from that block. More forgiving than anchoring on the photo IMG.
  const idRe = /(?:ID\s*Number|ID\s*#|Animal\s*ID)\s*:\s*(?:<[^>]*>)*\s*(A?\d{4,})/gi;
  const anchors: Array<{ id: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(html))) {
    anchors.push({ id: m[1].trim(), index: m.index });
  }
  if (anchors.length === 0) return out;

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    // Block window: from halfway between prev anchor (or start) to
    // halfway to next anchor (or end).
    const prev = i > 0 ? anchors[i - 1].index : 0;
    const next = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
    const start = Math.floor((prev + a.index) / 2);
    const end = Math.floor((a.index + next) / 2);
    const chunk = html.substring(start, end);

    const name = pickField(chunk, 'Name');
    if (!name) continue;

    // Look for the pet's photo anywhere inside the block. 24petconnect
    // serves photos under /image/<n>; tolerate http(s) prefix and
    // lazy-load attributes (data-src).
    const photoMatch =
         chunk.match(/<img[^>]*\bsrc=["']([^"']*\/image\/\d+[^"']*)["']/i)
      ?? chunk.match(/<img[^>]*\bdata-src=["']([^"']*\/image\/\d+[^"']*)["']/i);
    let photo_url: string | null = null;
    if (photoMatch) {
      const path = photoMatch[1];
      photo_url = /^https?:\/\//i.test(path) ? path : `https://24petconnect.com${path.startsWith('/') ? path : '/' + path}`;
    }

    out.push({
      id: a.id,
      name,
      species,
      breed:       pickField(chunk, 'Breed'),
      age:         pickField(chunk, 'Age'),
      gender:      pickField(chunk, 'Gender'),
      weight:      pickField(chunk, 'Weight'),
      color:       pickField(chunk, 'Color'),
      intake_date: pickField(chunk, 'Brought to the Shelter'),
      location:    pickField(chunk, 'Location'),
      photo_url,
      description: null,
      url: `${listingUrl}#${encodeURIComponent(a.id)}`,
      shelter: 'Contra Costa Animal Services',
    });
  }
  return out;
}

export async function scrapeAllPets(): Promise<ScrapedPet[]> {
  const results = await Promise.all(
    SOURCES.map(async ({ url, species }) => {
      const html = await safeFetch(url);
      if (!html) { console.warn(`[pets] ${species}: fetch returned null`); return [] as ScrapedPet[]; }
      try {
        const pets = parsePetsFromHtml(html, species, url);
        const debug = process.env.MTZ_DEBUG === '1';
        if (debug || pets.length === 0) {
          const anchorCount = (html.match(/(?:ID\s*Number|ID\s*#|Animal\s*ID)\s*:/gi) ?? []).length;
          console.log(`[pets] ${species}: parsed ${pets.length} (anchors ${anchorCount}, ${html.length}b)`);
          if (anchorCount === 0 && html.length > 0) {
            console.log(`[pets] ${species} head: ${html.slice(0, 200).replace(/\s+/g, ' ')}`);
          }
        }
        return pets;
      } catch (e) {
        console.warn(`[pets] ${species} parse threw:`, e instanceof Error ? e.message : e);
        return [];
      }
    }),
  );
  // Dedupe by id (some pets show on both dog + cat pages? unlikely
  // but cheap to guard).
  const byId = new Map<string, ScrapedPet>();
  for (const p of results.flat()) if (!byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()];
}
