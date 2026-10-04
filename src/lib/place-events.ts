// Match upcoming events to curated places by venue name so a place's
// popup can say what's on there next. Pure helpers, usable on the server.

export interface VenueEvent { title: string; start_at: number; url: string | null }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// First two words of a place name are distinctive enough ("del cielo",
// "five suns", "slow hand", "luigis deli", "roxx on") and tolerate the
// suffix wobble between sources ("Brewing Co" / "Brewing", "& Market").
function key(name: string): string {
  return norm(name).split(' ').slice(0, 2).join(' ');
}

export function eventsByPlace(
  places: Array<{ fsq_id: string; name: string | null }>,
  events: Array<{ source: string; title: string; start_at: number | null; venue: string | null; url: string | null }>,
  perPlace = 4,
): Record<string, VenueEvent[]> {
  const out: Record<string, VenueEvent[]> = {};
  const now = Date.now() / 1000;
  for (const p of places) {
    if (!p.name) continue;
    const k = key(p.name);
    if (k.split(' ').length < 2 && k.length < 5) continue;
    const hits: VenueEvent[] = [];
    for (const e of events) {
      if (e.start_at == null || e.start_at < now - 3 * 3600) continue;
      // Council meetings etc. are never "at" a place; Foopee lists SF/East Bay clubs.
      if (e.source === 'cclegistar' || !e.venue) continue;
      if (norm(e.venue).startsWith(k)) hits.push({ title: e.title, start_at: e.start_at, url: e.url });
      if (hits.length >= perPlace) break;
    }
    if (hits.length) out[p.fsq_id] = hits;
  }
  return out;
}
