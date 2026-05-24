import { getLocation } from '@/lib/location';
import { getFeeds, getMisc, getJson } from '@/lib/cache';
import type { NewsScopePayload } from '@/lib/news-aggregator';
import {
  listUpcomingEvents, listActiveAlerts,
  listAvailablePets, listRecentQuakes,
} from '@/lib/store';
import type { NoaaAlert } from '@/lib/types';
import AlertsCard, { type QuakeLite } from '@/components/AlertsCard';
import NewsCard from '@/components/NewsCard';
import EventsCard, { type UEvent } from '@/components/EventsCard';
import PetsCard from '@/components/PetsCard';
import RadarCard, { type RadarImg } from '@/components/RadarCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [
    storedEvents, storedAlerts,
    storedPets, storedQuakes, feeds, misc,
    newsWorld,
  ] = await Promise.all([
    listUpcomingEvents(),
    listActiveAlerts(),
    listAvailablePets(),
    listRecentQuakes(10),
    getFeeds(1000),
    getMisc(),
    getJson<NewsScopePayload>('news_world').catch(() => null),
  ]);

  // Quakes only from the last 7 days; AlertsCard hides itself when empty.
  const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const quakeAlerts: QuakeLite[] = storedQuakes
    .filter((q) => q.occurred_at >= oneWeekAgo)
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
      <NewsCard
        local={feeds}
        world={newsWorld?.items ?? []}
      />
      <PetsCard   pets={storedPets} />
      <div className="col-stack">
        <AlertsCard alerts={localAlerts} quakes={quakeAlerts} tz={loc.timezone} />
        <RadarCard  imgs={radarImgs} />
      </div>
    </div>
  );
}
