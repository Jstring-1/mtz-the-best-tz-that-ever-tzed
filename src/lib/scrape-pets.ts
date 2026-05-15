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
  // Each pet's HTML chunk starts at its IMG src="/image/<n>" and runs
  // until the next such IMG (or end of doc). The path /image/<n>
  // numerically maps to a backing photo asset on 24petconnect.
  const re = /<img[^>]*\bsrc=["'](\/image\/(\d+))["'][^>]*>([\s\S]*?)(?=<img[^>]*\bsrc=["']\/image\/\d+["']|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const photoPath = m[1];
    const photoId = m[2];
    const chunk = m[3];

    // Anchor on the shelter ID number — required to be a stable pet id.
    const idMatch = chunk.match(/\bID Number\s*:\s*([\s\S]*?)(?=<\s*\w|\n|$)/i);
    const id = idMatch ? stripHtmlInner(idMatch[1]).trim() : '';
    if (!id || !/^A?\d+$/i.test(id)) continue;

    const name        = pickField(chunk, 'Name')                       ?? '';
    if (!name) continue;
    const age         = pickField(chunk, 'Age');
    const gender      = pickField(chunk, 'Gender');
    const breed       = pickField(chunk, 'Breed');
    const color       = pickField(chunk, 'Color');
    const weight      = pickField(chunk, 'Weight');
    const intake_date = pickField(chunk, 'Brought to the Shelter');
    const location    = pickField(chunk, 'Location');

    out.push({
      id,
      name,
      species,
      breed,
      age,
      gender,
      weight,
      color,
      intake_date,
      location,
      photo_url: `https://24petconnect.com${photoPath}`,
      description: null,
      url: `${listingUrl}#${encodeURIComponent(id)}`,
      shelter: 'Contra Costa Animal Services',
    });
    void photoId; // keep for future use if 24petconnect changes paths
  }
  return out;
}

export async function scrapeAllPets(): Promise<ScrapedPet[]> {
  const results = await Promise.all(
    SOURCES.map(async ({ url, species }) => {
      const html = await safeFetch(url);
      if (!html) return [] as ScrapedPet[];
      try {
        const pets = parsePetsFromHtml(html, species, url);
        console.log(`[pets] ${species}: parsed ${pets.length} pets (${html.length} bytes)`);
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
