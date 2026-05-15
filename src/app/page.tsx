import { getLocation } from '@/lib/location';
import { getJson, getFeeds, getMisc, getPlaces } from '@/lib/cache';
import type { NoaaAlertsBag, NoaaAlert, TmEvent, PlaceRow, LocalEvent, Park } from '@/lib/types';
import AlertsCard from '@/components/AlertsCard';
import NewsCard from '@/components/NewsCard';
import QuakesCard, { type QuakeRow } from '@/components/QuakesCard';
import BirdsCard, { type BirdSighting } from '@/components/BirdsCard';
import EventsCard, { type UEvent } from '@/components/EventsCard';
import PlacesCard from '@/components/PlacesCard';
import ParksCard from '@/components/ParksCard';
import RadarCard, { type RadarImg } from '@/components/RadarCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [alerts, quakesRaw, birdsRaw, tmRaw, localRaw, parksRaw, feeds, misc, places] = await Promise.all([
    getJson<NoaaAlertsBag>('NOAA_alerts'),
    getJson<Record<string, QuakeRow>>('USGS_earthquakes'),
    getJson<Record<string, BirdSighting>>('eBird'),
    getJson<TmEvent[] | unknown>('TM_shows'),
    getJson<LocalEvent[]>('local_events'),
    getJson<Park[]>('local_parks'),
    getFeeds(8),
    getMisc(),
    getPlaces(),
  ]);

  const localAlerts: NoaaAlert[] =
    alerts && typeof alerts.LOCAL === 'object' ? Object.values(alerts.LOCAL) : [];

  const quakes: QuakeRow[] = quakesRaw
    ? Object.entries(quakesRaw).map(([id, q]) => ({ id, ...q }))
        .sort((a, b) => (b.occurred_at ?? 0) - (a.occurred_at ?? 0))
    : [];

  const birds: BirdSighting[] = birdsRaw ? Object.values(birdsRaw) : [];

  // Merge Ticketmaster + locally-scraped events into one chronological list.
  const events: UEvent[] = buildUnifiedEvents(
    Array.isArray(tmRaw) ? (tmRaw as TmEvent[]) : [],
    Array.isArray(localRaw) ? localRaw : [],
  );

  const placesList: PlaceRow[] = places ?? [];
  const parksList: Park[] = Array.isArray(parksRaw) ? parksRaw : [];

  const storyImgs = misc.filter((m) => m.text === 'true' && m.id.startsWith('WeatherStory')).map((m) => m.id);
  const radarImgs: RadarImg[] = [
    ...storyImgs.map((img) => ({
      src: `https://www.weather.gov/images/mtr/WxStory/${img}`,
      caption: 'WFO Monterey Story',
    })),
    { src: 'https://radar.weather.gov/ridge/standard/KDAX_loop.gif', caption: 'KDAX radar loop' },
    { src: 'https://www.weather.gov/wwamap/png/mtr.png',              caption: 'WFO Monterey alert map' },
  ];

  return (
    <div className="dashboard">
      <NewsCard   items={feeds} />
      <EventsCard events={events}     tz={loc.timezone} />
      <PlacesCard places={placesList} />
      <ParksCard  parks={parksList} />
      <div className="col-stack">
        <AlertsCard alerts={localAlerts} tz={loc.timezone} />
        <RadarCard  imgs={radarImgs} />
        <QuakesCard quakes={quakes}    tz={loc.timezone} />
      </div>
      <BirdsCard  sightings={birds} />
    </div>
  );
}

// ---- merge + sort helpers --------------------------------------------

function buildUnifiedEvents(tm: TmEvent[], local: LocalEvent[]): UEvent[] {
  const cutoff = Math.floor(Date.now() / 1000) - 6 * 3600;
  const out: UEvent[] = [];

  for (const e of tm) {
    const ts = tmEpoch(e);
    if (ts != null && ts < cutoff) continue;
    const venue = e._embedded?.venues?.[0];
    out.push({
      id: `tm-${e.id ?? out.length}`,
      title: e.name ?? 'Untitled event',
      venue: venue?.name ?? '',
      city: venue?.city?.name,
      start_at: ts,
      url: e.url,
      source: 'ticketmaster',
      source_label: 'Ticketmaster',
      segment: e.classifications?.[0]?.segment?.name,
      genre:   e.classifications?.[0]?.genre?.name,
      pleaseNote: e.pleaseNote,
    });
  }

  for (const e of local) {
    if (e.start_at != null && e.start_at < cutoff) continue;
    out.push({
      id: `local-${e.id}`,
      title: e.title,
      venue: e.venue,
      start_at: e.start_at ?? null,
      url: e.url,
      description: e.description,
      image: e.image,
      source: 'local',
      source_label: e.source_label,
    });
  }

  return out.sort((a, b) => (a.start_at ?? Infinity) - (b.start_at ?? Infinity));
}

function tmEpoch(e: TmEvent): number | null {
  const iso = e.dates?.start?.dateTime;
  if (iso) { const ms = Date.parse(iso); if (!Number.isNaN(ms)) return Math.floor(ms / 1000); }
  const ld = e.dates?.start?.localDate;
  if (ld) {
    const [y, m, d] = ld.split('-').map(Number);
    if (y && m && d) return Math.floor(Date.UTC(y, m - 1, d, 19) / 1000);
  }
  return null;
}
