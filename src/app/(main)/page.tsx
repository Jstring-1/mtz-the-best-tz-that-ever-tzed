import { getLocation } from '@/lib/location';
import { getFeeds, getMisc, getPlaces } from '@/lib/cache';
import {
  listUpcomingEvents, listParks, listActiveAlerts,
  listAvailablePets, listRecentQuakes,
} from '@/lib/store';
import type { PlaceRow, NoaaAlert } from '@/lib/types';
import AlertsCard, { type QuakeLite } from '@/components/AlertsCard';
import LocalCivicCard from '@/components/LocalCivicCard';
import NewsCard from '@/components/NewsCard';
import EventsCard, { type UEvent } from '@/components/EventsCard';
import PlacesCard, { type Spot } from '@/components/PlacesCard';
import PetsCard from '@/components/PetsCard';
import RadarCard, { type RadarImg } from '@/components/RadarCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [
    storedEvents, storedParks, storedAlerts,
    storedPets, storedQuakes, feeds, misc, places,
  ] = await Promise.all([
    listUpcomingEvents(),
    listParks(),
    listActiveAlerts(),
    listAvailablePets(),
    listRecentQuakes(10),
    getFeeds(120),
    getMisc(),
    getPlaces(),
  ]);

  const quakeAlerts: QuakeLite[] = storedQuakes
    .slice()
    .sort((a, b) => b.occurred_at - a.occurred_at)
    .map((q) => ({
      id: q.id,
      magnitude: q.magnitude ?? null,
      place: q.place,
      occurred_at: q.occurred_at,
      url: q.url ?? '',
    }));

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
    source: e.source === 'ticketmaster' ? 'ticketmaster'
           : e.source === 'contracosta'  ? 'municipal'
           : 'local',
    source_label: e.source_label,
    segment: e.segment ?? undefined,
    genre: e.genre ?? undefined,
    pleaseNote: e.please_note ?? undefined,
  }));


  // Merge: parks first (alphabetical), then Foursquare places by distance.
  const placeRows: PlaceRow[] = places ?? [];
  const spots: Spot[] = [
    ...storedParks.map((p): Spot => ({
      id: `park-${p.id}`,
      kind: 'park',
      name: p.name,
      address: p.address ?? undefined,
      description: p.description ?? undefined,
      amenities: p.amenities ?? undefined,
      image: p.image ?? undefined,
      url: p.url ?? undefined,
    })),
    ...placeRows.map((p): Spot => {
      const lat = p.lat != null ? Number(p.lat) : undefined;
      const lon = p.lon != null ? Number(p.lon) : undefined;
      return {
        id: `fsq-${p.fsq_id}`,
        kind: 'place',
        name: p.name ?? 'Unnamed',
        address: p.addy ?? undefined,
        category: p.cats ?? undefined,
        distance: p.dist ?? undefined,
        lat: lat != null && Number.isFinite(lat) ? lat : undefined,
        lon: lon != null && Number.isFinite(lon) ? lon : undefined,
      };
    }),
  ];

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
      <EventsCard events={events} tz={loc.timezone} />
      <NewsCard   items={feeds} />
      <PlacesCard spots={spots} />
      <PetsCard   pets={storedPets} />
      <div className="col-stack">
        <AlertsCard alerts={localAlerts} quakes={quakeAlerts} tz={loc.timezone} />
        <LocalCivicCard />
        <RadarCard  imgs={radarImgs} />
      </div>
    </div>
  );
}
