import { getLocation } from '@/lib/location';
import { getFeeds, getMisc, getPlaces } from '@/lib/cache';
import {
  listUpcomingEvents, listRecentBirds, listRecentQuakes, listParks, listActiveAlerts,
} from '@/lib/store';
import type { PlaceRow, NoaaAlert } from '@/lib/types';
import AlertsCard from '@/components/AlertsCard';
import NewsCard from '@/components/NewsCard';
import QuakesCard, { type QuakeRow } from '@/components/QuakesCard';
import BirdsCard, { type BirdSighting } from '@/components/BirdsCard';
import EventsCard, { type UEvent } from '@/components/EventsCard';
import PlacesCard from '@/components/PlacesCard';
import ParksCard from '@/components/ParksCard';
import RadarCard, { type RadarImg } from '@/components/RadarCard';
import type { Park } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [
    storedEvents, storedBirds, storedQuakes, storedParks, storedAlerts,
    feeds, misc, places,
  ] = await Promise.all([
    listUpcomingEvents(),
    listRecentBirds(60),
    listRecentQuakes(20),
    listParks(),
    listActiveAlerts(),
    getFeeds(24),
    getMisc(),
    getPlaces(),
  ]);

  // Map structured rows back into the UI shapes the cards already expect.
  const events: UEvent[] = storedEvents.map((e) => ({
    id: e.id,
    title: e.title,
    venue: e.venue ?? '',
    city: e.city ?? undefined,
    start_at: e.start_at,
    url: e.url ?? undefined,
    description: e.description ?? undefined,
    image: e.image ?? undefined,
    source: e.source === 'ticketmaster' ? 'ticketmaster' : 'local',
    source_label: e.source_label,
    segment: e.segment ?? undefined,
    genre: e.genre ?? undefined,
    pleaseNote: e.please_note ?? undefined,
  }));

  const birds: BirdSighting[] = storedBirds.map((b) => ({
    name: b.common_name,
    fancy_name: b.sci_name ?? '',
    date: b.observed_at ? new Date(b.observed_at * 1000).toISOString().slice(0, 10) : '',
    place: b.place ?? '',
    count: b.cnt ?? null,
    lat: b.lat ?? '',
    lon: b.lon ?? '',
  }));

  const quakes: QuakeRow[] = storedQuakes.map((q) => ({
    id: q.id,
    magnitude: q.magnitude ?? null,
    place: q.place,
    occurred_at: q.occurred_at,
    url: q.url ?? '',
  }));

  const parksList: Park[] = storedParks.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url ?? '',
    address: p.address ?? undefined,
    description: p.description ?? undefined,
    amenities: p.amenities ?? undefined,
    image: p.image ?? undefined,
  }));

  // Alerts: card type wants NoaaAlert shape (epoch numbers etc).
  const localAlerts: NoaaAlert[] = storedAlerts
    .filter((a) => a.scope === 'LOCAL')
    .map((a) => ({
      event: a.event ?? undefined,
      severity: a.severity ?? undefined,
      urgency: a.urgency ?? undefined,
      certainty: a.certainty ?? undefined,
      status: a.status ?? undefined,
      NWSheadline: a.headline ?? undefined,
      areaDesc: a.area_desc ?? undefined,
      description: a.description ?? undefined,
      sent: a.sent_at ?? undefined,
      effective: a.effective_at ?? undefined,
      expires: a.expires_at ?? undefined,
    }));

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
