import Link from 'next/link';
import { getLocation } from '@/lib/location';
import { getJson, getFeeds } from '@/lib/cache';
import { relativeFromUnixSeconds } from '@/lib/time';
import type { NoaaAlertsBag, NoaaForecastPeriod, NoaaAlert } from '@/lib/types';
import StocksStrip from '@/components/StocksStrip';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MainPage() {
  const loc = getLocation();

  const [wx, alerts, forecast, feeds] = await Promise.all([
    getJson<{ current?: { temp_f?: number; condition?: { text?: string; icon?: string }; wind_mph?: number } }>('weatherAPI'),
    getJson<NoaaAlertsBag>('NOAA_alerts'),
    getJson<{ properties?: { periods?: NoaaForecastPeriod[] } }>('NOAA_gp_forecast'),
    getFeeds(3),
  ]);

  const localAlerts: NoaaAlert[] =
    alerts && typeof alerts.LOCAL === 'object' ? Object.values(alerts.LOCAL) : [];
  const today = forecast?.properties?.periods?.[0];

  return (
    <>
      <section className="hero">
        <h1>{loc.siteName}</h1>
        <p>Hyperlocal at-a-glance dashboard for {loc.name}.</p>
      </section>

      <section className="glance">

        <h2>Markets</h2>
        <StocksStrip />

        {localAlerts.length > 0 && (
          <>
            <h2>Active alerts</h2>
            <div className="stack">
              {localAlerts.slice(0, 3).map((a, i) => (
                <Link key={i} href="/weather" className="card alert local">
                  <h3 style={{ color: 'gold' }}>{a.event ?? 'Alert'}</h3>
                  {a.NWSheadline && <div className="meta">{a.NWSheadline}</div>}
                </Link>
              ))}
            </div>
          </>
        )}

        <h2>Right now</h2>
        <div className="grid grid-3">
          <div className="tile hot">
            <span className="label">Temperature</span>
            <span className="value">{wx?.current?.temp_f != null ? `${wx.current.temp_f}°F` : '—'}</span>
            <span className="sub">{wx?.current?.condition?.text ?? '—'}</span>
          </div>
          <div className="tile cool">
            <span className="label">Wind</span>
            <span className="value">{wx?.current?.wind_mph != null ? `${wx.current.wind_mph} mph` : '—'}</span>
          </div>
          <div className="tile">
            <span className="label">Today</span>
            <span className="value" style={{ fontSize: '1em' }}>{today?.shortForecast ?? '—'}</span>
            <span className="sub">{today?.temperature != null ? `High ${today.temperature}°F` : ''}</span>
          </div>
        </div>

        <h2>Latest news</h2>
        <div className="stack">
          {feeds.length === 0 ? (
            <div className="empty">No news cached yet. Run the 4h bucket on /admin.</div>
          ) : feeds.map((f) => (
            <article className="news-item" key={f.ts}>
              <h3><a href={f.link} target="_blank" rel="noopener">{f.title}</a></h3>
              <div className="meta">{relativeFromUnixSeconds(f.ts)}</div>
            </article>
          ))}
        </div>

        <h2>Sections</h2>
        <div className="grid grid-3">
          <Link className="card" href="/weather">Weather <span className="muted">— forecast, alerts, water</span></Link>
          <Link className="card" href="/events" >Events  <span className="muted">— live music nearby</span></Link>
          <Link className="card" href="/news"   >News    <span className="muted">— East Bay feeds</span></Link>
          <Link className="card" href="/places" >Places  <span className="muted">— map &amp; spots</span></Link>
          <Link className="card" href="/info"   >Info    <span className="muted">— civic links, reps</span></Link>
        </div>

      </section>
    </>
  );
}

