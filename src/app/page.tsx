import { getLocation } from '@/lib/location';
import { getJson, getFeeds, getMisc, getPlaces } from '@/lib/cache';
import type { NoaaAlertsBag, NoaaAlert, TmEvent, PlaceRow } from '@/lib/types';
import AlertsCard from '@/components/AlertsCard';
import NewsCard from '@/components/NewsCard';
import QuakesCard, { type QuakeRow } from '@/components/QuakesCard';
import BirdsCard, { type BirdSighting } from '@/components/BirdsCard';
import EventsCard from '@/components/EventsCard';
import PlacesCard from '@/components/PlacesCard';
import RadarCard, { type RadarImg } from '@/components/RadarCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [alerts, quakesRaw, birdsRaw, eventsRaw, feeds, misc, places] = await Promise.all([
    getJson<NoaaAlertsBag>('NOAA_alerts'),
    getJson<Record<string, QuakeRow>>('USGS_earthquakes'),
    getJson<Record<string, BirdSighting>>('eBird'),
    getJson<TmEvent[] | unknown>('TM_shows'),
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

  const events: TmEvent[] = Array.isArray(eventsRaw)
    ? upcomingEvents(eventsRaw as TmEvent[])
    : [];

  const placesList: PlaceRow[] = places ?? [];

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
      <AlertsCard alerts={localAlerts} tz={loc.timezone} />
      <QuakesCard quakes={quakes}     tz={loc.timezone} />
      <NewsCard   items={feeds} />
      <BirdsCard  sightings={birds} />
      <EventsCard events={events}     tz={loc.timezone} />
      <PlacesCard places={placesList} />
      <RadarCard  imgs={radarImgs} />
    </div>
  );
}

// Filter past events, allowing 6h grace for in-progress shows.
function upcomingEvents(arr: TmEvent[]): TmEvent[] {
  const cutoff = Math.floor(Date.now() / 1000) - 6 * 3600;
  return arr
    .filter((e) => {
      const iso = e.dates?.start?.dateTime;
      if (iso) { const ms = Date.parse(iso); if (!Number.isNaN(ms)) return Math.floor(ms / 1000) >= cutoff; }
      const ld = e.dates?.start?.localDate;
      if (ld) { const [y, m, d] = ld.split('-').map(Number); if (y && m && d) return Math.floor(Date.UTC(y, m - 1, d, 19) / 1000) >= cutoff; }
      return true;
    })
    .sort((a, b) => (epochOf(a) ?? 0) - (epochOf(b) ?? 0));
}
function epochOf(e: TmEvent): number | null {
  const iso = e.dates?.start?.dateTime;
  if (iso) { const ms = Date.parse(iso); if (!Number.isNaN(ms)) return Math.floor(ms / 1000); }
  const ld = e.dates?.start?.localDate;
  if (ld) { const [y, m, d] = ld.split('-').map(Number); if (y && m && d) return Math.floor(Date.UTC(y, m - 1, d, 19) / 1000); }
  return null;
}
