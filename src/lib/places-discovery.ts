// Auto-discovery of "new & noteworthy" Martinez places.
//
// Two free signals, both refreshed by the 12h osmPlaces job:
//   1. OpenStreetMap: every named food / drink / shop / arts POI inside the
//      Martinez polygon that is NOT already in the curated list and is not
//      a chain. A POI is "new" when it first appears in our scan after the
//      baseline run, or when OSM says it was created in the last 120 days.
//   2. Local news: recent story titles that mention Martinez together with
//      opening language ("grand opening", "now open", "new restaurant"...).
//
// Nothing is sent anywhere; the payload is stored under `places_discovery`
// and an admin can hide individual entries from /admin.

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'mtz.city/1.0 (hyperlocal dashboard; contact via github.com/Jstring-1)';
const NEW_DAYS = 120;

export interface DiscoveredSpot {
  id: string;
  name: string;
  label: string;
  addr?: string;
  lat?: number;
  lon?: number;
  /** ISO time we first saw this POI in a scan. */
  firstSeen: string;
  /** ISO time OSM says the element was last edited (only a hint). */
  osmEdited?: string;
  osmVersion?: number;
  website?: string;
  isNew: boolean;
}

export interface NewsMention { title: string; link: string; date: string }

export interface DiscoveryPayload {
  fetchedAt: string;
  /** id -> ISO first-seen time, kept across runs. */
  seen: Record<string, string>;
  /** ids an admin has hidden. Preserved across runs. */
  hidden: string[];
  spots: DiscoveredSpot[];
  news: NewsMention[];
}

interface OsmEl {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  timestamp?: string;
  version?: number;
}

async function overpass(query: string): Promise<OsmEl[] | null> {
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        cache: 'no-store',
      });
      if (!r.ok) continue;
      return (await r.json() as { elements?: OsmEl[] }).elements ?? [];
    } catch { /* try the next mirror */ }
  }
  return null;
}

const FOOD_AMENITIES = 'restaurant|cafe|bar|pub|fast_food|ice_cream|biergarten|nightclub|food_court';
const ARTS_AMENITIES = 'theatre|cinema|arts_centre|marketplace|community_centre';

function humanize(s: string): string {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function labelFor(t: Record<string, string>): string {
  const cuisine = t.cuisine?.split(';')[0]?.replace(/_/g, ' ');
  if (t.amenity && FOOD_AMENITIES.split('|').includes(t.amenity)) {
    const base = t.amenity === 'fast_food' ? 'Fast food' : humanize(t.amenity);
    return cuisine ? `${humanize(cuisine)} ${base.toLowerCase()}` : base;
  }
  if (t.craft) return humanize(t.craft);
  if (t.shop) return `${humanize(t.shop)} shop`.replace(/ shop shop$/, ' shop');
  if (t.tourism) return humanize(t.tourism);
  if (t.amenity) return humanize(t.amenity);
  return 'Local spot';
}

function addrFor(t: Record<string, string>): string | undefined {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ').trim();
  return street || undefined;
}

// Names that are never interesting as a "discovery" (services, chains
// that slipped past the brand tag, generic placeholders).
const SKIP_NAME = /\b(vacant|for lease|atm|storage|laundromat|insurance|realty|real estate|mortgage|law office|attorney|dental|dentist|orthodont|chiropract|church|school|bank|post office|gas|chevron|shell|valero|7-eleven|mcdonald|starbucks|subway|taco bell|burger king|safeway|walmart|cvs|walgreens)\b/i;

export async function discoverSpots(
  poly: string,
  curated: RegExp[],
  prev: DiscoveryPayload | null,
): Promise<{ spots: DiscoveredSpot[]; seen: Record<string, string> } | null> {
  const q = `[out:json][timeout:40];(`
    + `nwr["name"]["amenity"~"^(${FOOD_AMENITIES}|${ARTS_AMENITIES})$"](poly:"${poly}");`
    + `nwr["name"]["craft"~"^(brewery|distillery|winery|bakery|confectionery|pottery|jeweller|photographer)$"](poly:"${poly}");`
    + `nwr["name"]["shop"](poly:"${poly}");`
    + `nwr["name"]["tourism"~"^(gallery|museum|attraction|viewpoint)$"](poly:"${poly}");`
    + `);out center tags meta;`;
  const els = await overpass(q);
  if (!els) return null;

  const now = new Date();
  const nowIso = now.toISOString();
  const baseline = !prev;                    // first ever run: don't flag everything
  const seen: Record<string, string> = { ...(prev?.seen ?? {}) };
  const spots: DiscoveredSpot[] = [];
  const cutoff = now.getTime() - NEW_DAYS * 86400_000;

  for (const el of els) {
    const t = el.tags ?? {};
    const name = (t.name ?? '').trim();
    if (!name || SKIP_NAME.test(name)) continue;
    if (t.brand || t['brand:wikidata'] || t.operator?.match(/^(McDonald|Starbucks)/i)) continue;
    if (t.shop === 'vacant' || t.disused || t['disused:shop'] || t['disused:amenity']) continue;
    if (curated.some((re) => re.test(name))) continue;

    const id = `osm-${el.type[0]}${el.id}`;
    const firstSeen = seen[id] ?? nowIso;
    seen[id] = firstSeen;
    const edited = el.timestamp ? Date.parse(el.timestamp) : NaN;
    const recentlyMapped = el.version === 1 && Number.isFinite(edited) && edited >= cutoff;
    const sawItLately = !baseline && Date.parse(firstSeen) >= cutoff;
    const website = t.website ?? t['contact:website'];

    spots.push({
      id,
      name,
      label: labelFor(t),
      addr: addrFor(t),
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
      firstSeen,
      osmEdited: el.timestamp,
      osmVersion: el.version,
      website: website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : undefined,
      isNew: recentlyMapped || sawItLately,
    });
  }

  // Forget ids that vanished from OSM (closed / deleted) so a later
  // re-add counts as new again.
  const live = new Set(spots.map((s) => s.id));
  for (const id of Object.keys(seen)) if (!live.has(id)) delete seen[id];
  return { spots, seen };
}

// ---- News mentions -------------------------------------------------------

const OPEN_RE = /\b(grand opening|grand re-?opening|now open|opens? (its |their )?(new )?doors|opening (soon|this|next)|will open|set to open|coming soon|ribbon[- ]cutting|new (restaurant|cafe|café|coffee shop|brewery|bar|shop|store|bakery|eatery|taproom|winery|gallery|business|market))\b/i;

export function newsMentions(
  rows: Array<{ ts: string; title: string; link: string }>,
  days = 90,
): NewsMention[] {
  const since = Date.now() / 1000 - days * 86400;
  const out: NewsMention[] = [];
  const seenLinks = new Set<string>();
  for (const r of rows) {
    const ts = Number(r.ts);
    if (!Number.isFinite(ts) || ts < since) continue;
    // Title must name Martinez itself — body text is too noisy (county
    // roundups that merely list a Martinez event).
    if (!/martinez/i.test(r.title) || !OPEN_RE.test(r.title)) continue;
    if (seenLinks.has(r.link)) continue;
    seenLinks.add(r.link);
    out.push({ title: r.title, link: r.link, date: new Date(ts * 1000).toISOString().slice(0, 10) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}
