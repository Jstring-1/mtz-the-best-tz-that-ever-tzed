import { getLocation } from '@/lib/location';
import { getFeeds, getMisc, getPlaces } from '@/lib/cache';
import {
  listUpcomingEvents, listRecentBirds, listRecentQuakes, listParks, listActiveAlerts,
  listAvailablePets,
} from '@/lib/store';
import type { PlaceRow, NoaaAlert } from '@/lib/types';
import AlertsCard from '@/components/AlertsCard';
import NewsCard from '@/components/NewsCard';
import QuakesCard, { type QuakeRow } from '@/components/QuakesCard';
import BirdsCard, { type BirdSighting } from '@/components/BirdsCard';
import EventsCard, { type UEvent } from '@/components/EventsCard';
import PlacesCard, { type Spot } from '@/components/PlacesCard';
import PetsCard from '@/components/PetsCard';
import RadarCard, { type RadarImg } from '@/components/RadarCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [
    storedEvents, storedBirds, storedQuakes, storedParks, storedAlerts,
    storedPets, feeds, misc, places,
  ] = await Promise.all([
    listUpcomingEvents(),
    listRecentBirds(60),
    listRecentQuakes(20),
    listParks(),
    listActiveAlerts(),
    listAvailablePets(),
    getFeeds(120),
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
    source: e.source === 'ticketmaster' ? 'ticketmaster'
           : e.source === 'contracosta'  ? 'municipal'
           : 'local',
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
    wiki_description: b.wiki_description ?? null,
    wiki_extract:     b.wiki_extract ?? null,
    wiki_thumbnail:   b.wiki_thumbnail ?? null,
    wiki_url:         b.wiki_url ?? null,
  }));

  const quakes: QuakeRow[] = storedQuakes.map((q) => ({
    id: q.id,
    magnitude: q.magnitude ?? null,
    place: q.place,
    occurred_at: q.occurred_at,
    url: q.url ?? '',
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
    ...placeRows.map((p): Spot => ({
      id: `fsq-${p.fsq_id}`,
      kind: 'place',
      name: p.name ?? 'Unnamed',
      address: p.addy ?? undefined,
      category: p.cats ?? undefined,
      distance: p.dist ?? undefined,
    })),
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
      <NewsCard   items={feeds} />
      <EventsCard events={events}     tz={loc.timezone} />
      <PlacesCard spots={spots} />
      <div className="col-stack">
        <AlertsCard alerts={localAlerts} tz={loc.timezone} />
        <RadarCard  imgs={radarImgs} />
        <QuakesCard quakes={quakes}    tz={loc.timezone} />
      </div>
      <BirdsCard  sightings={birds} />
      <PetsCard   pets={storedPets} />
    </div>
  );
}
