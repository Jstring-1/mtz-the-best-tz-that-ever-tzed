import { getLocation } from '@/lib/location';
import { getFeeds, getMisc, getJson } from '@/lib/cache';
import type { NewsScopePayload } from '@/lib/news-aggregator';
import type { HazardsPayload } from '@/lib/hazards';
import { listUpcomingEvents, listActiveAlerts } from '@/lib/store';
import type { NoaaAlert } from '@/lib/types';
import AlertsCard from '@/components/AlertsCard';
import InfoColumn from '@/components/InfoColumn';
import NewsCard from '@/components/NewsCard';
import EventsCard, { type UEvent } from '@/components/EventsCard';
import RadarCard, { type RadarImg } from '@/components/RadarCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [
    storedEvents, storedAlerts,
    feeds, misc,
    newsWorld, hazards,
  ] = await Promise.all([
    listUpcomingEvents(),
    listActiveAlerts(),
    getFeeds(1000),
    getMisc(),
    getJson<NewsScopePayload>('news_world').catch(() => null),
    getJson<HazardsPayload>('regional_hazards').catch(() => null),
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
           : (e.source === 'contracosta' || e.source === 'cclegistar') ? 'municipal'
           : e.source === 'foopee' ? 'regional'
           : 'local',
    source_label: e.source_label,
    segment: e.segment ?? undefined,
    genre: e.genre ?? undefined,
    pleaseNote: e.please_note ?? undefined,
  }));


  // Alerts: card type wants NoaaAlert shape (epoch numbers etc). Only
  // alerts for Contra Costa / Martinez (scope LOCAL) are shown; the rest
  // of the WFO's alerts stay in the table but off the page.
  const toNoaaAlert = (a: (typeof storedAlerts)[number]): NoaaAlert => ({
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
  });
  const localAlerts: NoaaAlert[] = storedAlerts.filter((a) => a.scope === 'LOCAL').map(toNoaaAlert);

  const storyImgs = misc.filter((m) => m.text === 'true' && m.id.startsWith('WeatherStory')).map((m) => m.id);
  // Radar loop leads (shown full-width); the NWS alert map is gone — the
  // alerts panel covers that.
  const radarImgs: RadarImg[] = [
    { src: 'https://radar.weather.gov/ridge/standard/KDAX_loop.gif', caption: 'KDAX radar loop' },
    ...storyImgs.map((img) => ({
      src: `https://www.weather.gov/images/mtr/WxStory/${img}`,
      caption: 'WFO Monterey Story',
    })),
  ];

  return (
    <div className="dashboard">
      <EventsCard events={events} tz={loc.timezone} />
      <NewsCard
        local={feeds}
        world={newsWorld?.items ?? []}
      />
      <div className="col-stack">
        <RadarCard imgs={radarImgs} />
        <AlertsCard
          alerts={localAlerts}
          hazards={hazards?.groups ?? []}
          clear={hazards?.clear ?? []}
          unavailable={hazards?.failed ?? []}
          tz={loc.timezone}
        />
      </div>
      <InfoColumn />
    </div>
  );
}
