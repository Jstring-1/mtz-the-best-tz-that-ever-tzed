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

// 24petconnect server-renders each pet as:
//   <div class="gridResult" id="Result_A1034574"
//        onclick="Details('CCASDAvailablePets','CCST','A1034574')">
//     <img src="/image/688711384" ... />
//     <span class="text_Name results">Chance</span>
//     <span class="text_Breed results">Pit Bull Terrier mix</span>
//     ... text_Age / text_Gender / text_Weight / text_Color /
//         text_BroughttotheShelter / text_Location / text_IDNumber
// Pagination is a plain GET: &index=30, &index=60, … 30 per page.

function cleanVal(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = stripHtmlInner(v).replace(/\s+/g, ' ').trim();
  if (!t || /^(-+|n\/?a|unknown|none)$/i.test(t)) return null;
  return t;
}

// Pull a `<span class="text_<Field> results">VALUE</span>` value out of
// one pet's HTML block.
function pickField(block: string, field: string): string | null {
  const m = block.match(
    new RegExp(`class="text_${field}\\b[^"]*results[^"]*">([\\s\\S]*?)<`, 'i'),
  );
  return m ? cleanVal(m[1]) : null;
}

function parsePetsFromHtml(html: string, species: string, listingUrl: string): ScrapedPet[] {
  const out: ScrapedPet[] = [];

  // Each pet is a `<div class="gridResult" ...>` container. Split on the
  // opening tag; the first chunk is page chrome before the first pet.
  const parts = html.split(/<div class="gridResult"/i).slice(1);

  for (const block of parts) {
    const idM =
         block.match(/id="Result_([A-Za-z0-9]+)"/i)
      ?? block.match(/Details\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([A-Za-z0-9]+)'\s*\)/i);
    const id = idM ? idM[1].trim() : (pickField(block, 'IDNumber') ?? '');
    if (!id) continue;

    let name = pickField(block, 'Name');
    if (!name) continue;
    // When CCAS hasn't named the pet yet, the shelter site copies the
    // ID ("A1047669") into the Name field. Detect that pattern and
    // store an empty name so the UI can fall back to "(no name)".
    if (name === id || /^A\d{6,}$/i.test(name)) name = '';

    // Photo: 24petconnect serves /image/<n>; tolerate lazy-load attrs.
    const photoMatch =
         block.match(/<img[^>]*\bsrc=["']([^"']*\/image\/\d+[^"']*)["']/i)
      ?? block.match(/<img[^>]*\bdata-src=["']([^"']*\/image\/\d+[^"']*)["']/i);
    let photo_url: string | null = null;
    if (photoMatch) {
      const path = photoMatch[1];
      photo_url = /^https?:\/\//i.test(path) ? path : `https://24petconnect.com${path.startsWith('/') ? path : '/' + path}`;
    }

    out.push({
      id,
      name,
      species,
      breed:       pickField(block, 'Breed'),
      age:         pickField(block, 'Age'),
      gender:      pickField(block, 'Gender'),
      weight:      pickField(block, 'Weight'),
      color:       pickField(block, 'Color'),
      intake_date: pickField(block, 'BroughttotheShelter'),
      location:    pickField(block, 'Location'),
      photo_url,
      description: null,
      url: `${listingUrl}#${encodeURIComponent(id)}`,
      shelter: 'Contra Costa Animal Services',
    });
  }
  return out;
}

const PAGE_SIZE = 30;
const MAX_PAGES = 10;   // safety cap (≤300 pets/species)

async function scrapeSource(baseUrl: string, species: string): Promise<ScrapedPet[]> {
  const debug = process.env.MTZ_DEBUG === '1';
  const all: ScrapedPet[] = [];
  for (let pg = 0; pg < MAX_PAGES; pg++) {
    const url = pg === 0 ? baseUrl : `${baseUrl}&index=${pg * PAGE_SIZE}`;
    const html = await safeFetch(url);
    if (!html) break;
    const pets = parsePetsFromHtml(html, species, baseUrl);
    if (debug || (pg === 0 && pets.length === 0)) {
      const blocks = (html.match(/<div class="gridResult"/gi) ?? []).length;
      console.log(`[pets] ${species} pg${pg}: parsed ${pets.length} (gridResult blocks ${blocks}, ${html.length}b)`);
    }
    if (!pets.length) break;
    all.push(...pets);
    if (pets.length < PAGE_SIZE) break;          // last page
    await new Promise((r) => setTimeout(r, 800)); // politeness
  }
  return all;
}

export async function scrapeAllPets(): Promise<ScrapedPet[]> {
  const results = await Promise.all(
    SOURCES.map(({ url, species }) =>
      scrapeSource(url, species).catch((e) => {
        console.warn(`[pets] ${species} threw:`, e instanceof Error ? e.message : e);
        return [] as ScrapedPet[];
      }),
    ),
  );
  // Dedupe by id across pages / species.
  const byId = new Map<string, ScrapedPet>();
  for (const p of results.flat()) if (!byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()];
}
