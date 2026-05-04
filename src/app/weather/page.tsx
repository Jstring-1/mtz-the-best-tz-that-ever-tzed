import { getLocation } from '@/lib/location';
import { getJson, getMisc, getNoaaHourly, getAllJsonTimestamps } from '@/lib/cache';
import type { NoaaAlertsBag, NoaaForecastPeriod, NoaaAlert } from '@/lib/types';
import { relativeFromIso } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface WxNow {
  current?: {
    temp_f?: number; feelslike_f?: number; humidity?: number; cloud?: number;
    dewpoint_f?: number; wind_mph?: number; wind_dir?: string; gust_mph?: number;
    pressure_mb?: number; pressure_in?: number; vis_miles?: number; uv?: number;
    condition?: { text?: string; icon?: string };
  };
}
interface WxForecast { forecast?: { forecastday?: Array<{ astro?: { sunrise?: string; sunset?: string; moon_phase?: string; moon_illumination?: number | string } }> } }
interface WxMarine   { forecast?: { forecastday?: Array<{ day?: { maxtemp_f?: number; mintemp_f?: number; avgtemp_f?: number; maxwind_mph?: number; totalprecip_in?: number; avghumidity?: number; condition?: { text?: string } } }> } }
interface BuoyObs    { properties?: Record<string, { value?: number | null }> }
interface PurpleAir  { sensor?: { temperature?: number; humidity?: number; pressure?: number; 'pm2.5'?: number; visual_range?: number } }
interface Sigmets    { features?: Array<{ properties?: { phenomenon?: string; hazard?: string; rawSigmet?: string } }> }

export default async function WeatherPage() {
  const loc = getLocation();
  const buoyIds = loc.noaaBuoys;

  const [
    wxNow, wxForecast, wxMarine, alerts, forecast, hourly, misc,
    sigmets, purpleAir, ts, ...buoys
  ] = await Promise.all([
    getJson<WxNow>('weatherAPI'),
    getJson<WxForecast>('weatherAPI_forecast'),
    getJson<WxMarine>('weatherAPI_mrn'),
    getJson<NoaaAlertsBag>('NOAA_alerts'),
    getJson<{ properties?: { periods?: NoaaForecastPeriod[] } }>('NOAA_gp_forecast'),
    getNoaaHourly(),
    getMisc(),
    getJson<Sigmets>('NOAA_aviation_SIGMETs'),
    loc.purpleAirSensor ? getJson<PurpleAir>(`purple_air_${loc.purpleAirSensor}`) : Promise.resolve(null),
    getAllJsonTimestamps(),
    ...buoyIds.map((b) => getJson<BuoyObs>(`NOAA_Bouy_${b}`)),
  ]);

  const cur = wxNow?.current ?? null;
  const astro = wxForecast?.forecast?.forecastday?.[0]?.astro ?? null;
  const mrn   = wxMarine?.forecast?.forecastday?.[0]?.day ?? null;
  const pa    = purpleAir?.sensor ?? null;

  const localAlerts: NoaaAlert[] =
    alerts && typeof alerts.LOCAL === 'object' ? Object.values(alerts.LOCAL) : [];
  const otherAlerts: NoaaAlert[] =
    alerts && typeof alerts['NOT-LOCAL'] === 'object' ? Object.values(alerts['NOT-LOCAL']) : [];
  const days = forecast?.properties?.periods ?? [];

  const storyImgs = misc.filter((m) => m.text === 'true' && m.id.startsWith('WeatherStory')).map((m) => m.id);

  // Build hourly cells (next 48h, plus previous hour)
  const now = Math.floor(Date.now() / 1000);
  const hCells = hourly.map((r) => {
    const ts = Number(r.ts);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.json); } catch { parsed = {}; }
    return { ts, p: parsed };
  }).filter(({ ts }) => ts >= now - 3600 && ts <= now + 48 * 3600).slice(0, 56);

  return (
    <>
      <section className="wx-strip">
        <span className="clock">{new Date().toLocaleString('en-US', { timeZone: loc.timezone, weekday: 'short', month: 'short', day: 'numeric' })}</span>
        {cur && cur.condition?.icon && <img src={`https:${cur.condition.icon}`} alt={cur.condition.text ?? ''} />}
        {cur?.condition?.text && <span className="gold">{cur.condition.text}</span>}
        {cur?.temp_f != null && <span className="red">{cur.temp_f}°F</span>}
        {cur?.wind_mph != null && <span className="dodger">Wind {cur.wind_mph}mph {cur.wind_dir ?? ''}</span>}
        {cur?.humidity != null && <span className="green">Humidity {cur.humidity}%</span>}
        {pa?.['pm2.5'] != null && <span className="blue">AQI {pa['pm2.5']}</span>}
        {cur?.pressure_mb != null && <span className="peru">{Math.round(cur.pressure_mb)} mb</span>}
        {astro?.sunrise && <span className="gold">Sunrise {astro.sunrise}</span>}
        {astro?.sunset && <span className="violet">Sunset {astro.sunset}</span>}
      </section>

      <div className="page">

        {/* ---- Active local alerts ---- */}
        {localAlerts.length > 0 && (
          <>
            <h2>Active alerts (local)
              {ts['NOAA_alerts'] && <span className="ts">· checked {relativeFromIso(ts['NOAA_alerts'])}</span>}
            </h2>
            <div className="stack">
              {localAlerts.map((a, i) => (
                <div key={i} className="card alert local">
                  <h3 style={{ color: 'gold' }}>{a.event ?? 'Alert'}</h3>
                  {a.NWSheadline && <div className="meta"><b>{a.NWSheadline}</b></div>}
                  {a.areaDesc && <div className="meta" style={{ lineHeight: 1.5 }}>{a.areaDesc.replace(/;/g, ', ')}</div>}
                  <div className="alert-meta">
                    {(['severity', 'urgency', 'certainty', 'status'] as const).map((k) =>
                      a[k] ? <span key={k}><span className="k">{cap(k)}:</span> <span className="v">{String(a[k])}</span></span> : null
                    )}
                    {(['effective', 'expires'] as const).map((k) =>
                      a[k] ? <span key={k}><span className="k">{cap(k)}:</span> <span className="v">{fmtTime(Number(a[k]) * 1000, loc.timezone)}</span></span> : null
                    )}
                  </div>
                  {a.description && <div className="alert-desc"><p>{a.description}</p></div>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- Right now ---- */}
        <h2>Right now in {loc.short}
          {ts['weatherAPI'] && <span className="ts">· checked {relativeFromIso(ts['weatherAPI'])}</span>}
        </h2>
        <div className="grid grid-auto-sm">
          <Tile cls="hot" label="Temperature" value={cur?.temp_f != null ? `${cur.temp_f}°F` : '—'} sub={cur?.feelslike_f != null ? `Feels like ${cur.feelslike_f}°F` : ''} />
          <Tile          label="Conditions"  value={cur?.condition?.text ?? '—'} sub={cur?.cloud != null ? `${cur.cloud}% cloud` : ''} />
          <Tile cls="green" label="Humidity" value={cur?.humidity != null ? `${cur.humidity}%` : '—'} sub={cur?.dewpoint_f != null ? `Dewpoint ${cur.dewpoint_f}°F` : ''} />
          <Tile cls="cool"  label="Wind"     value={cur?.wind_mph != null ? `${cur.wind_mph} mph` : '—'} sub={cur?.wind_dir ? `${cur.wind_dir}${cur.gust_mph != null ? ` · gust ${cur.gust_mph}` : ''}` : ''} />
          <Tile          label="Pressure"   value={cur?.pressure_mb != null ? `${Math.round(cur.pressure_mb)} mb` : '—'} sub={cur?.pressure_in != null ? `${cur.pressure_in} inHg` : ''} />
          <Tile          label="Visibility" value={cur?.vis_miles != null ? `${cur.vis_miles} mi` : '—'} sub="" />
          <Tile          label="UV index"   value={cur?.uv != null ? String(cur.uv) : '—'} sub="" />
          {pa?.['pm2.5'] != null && <Tile cls="green" label="Air quality (PM2.5)" value={String(pa['pm2.5'])} sub="PurpleAir" />}
          {astro?.sunrise && <Tile          label="Sunrise" value={astro.sunrise} sub="" />}
          {astro?.sunset  && <Tile cls="violet" label="Sunset" value={astro.sunset} sub="" />}
          {astro?.moon_phase && <Tile label="Moon" value={astro.moon_phase} sub={astro.moon_illumination != null ? `${astro.moon_illumination}% lit` : ''} />}
        </div>

        {/* ---- 7-day forecast ---- */}
        {days.length > 0 && (
          <>
            <h2>7-day forecast
              {ts['NOAA_gp_forecast'] && <span className="ts">· NOAA · checked {relativeFromIso(ts['NOAA_gp_forecast'])}</span>}
            </h2>
            <div className="grid grid-auto">
              {days.map((d, i) => (
                <div key={i} className="wx-day" title={d.detailedForecast ?? ''}>
                  <span className="name">{d.name}</span>
                  <div className="row">
                    {d.icon && <img src={d.icon} alt="" />}
                    <span className="temp">{d.temperature != null ? `${d.temperature}°F` : '—'}</span>
                  </div>
                  <div className="short">{d.shortForecast}</div>
                  <div className="sub">
                    Wind {d.windSpeed ?? '—'} {d.windDirection ?? ''}
                    {d.probabilityOfPrecipitation?.value != null && d.probabilityOfPrecipitation.value !== 0 && (
                      <> · {d.probabilityOfPrecipitation.value}% precip</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- Next 48 hours ---- */}
        {hCells.length > 0 && (
          <>
            <h2>Next 48 hours <span className="ts">· NOAA gridpoint hourly</span></h2>
            <div className="wx-hourly">
              {hCells.map(({ ts: tsec, p }) => {
                const isNow = tsec <= now && now < tsec + 3600;
                return (
                  <div key={tsec} className={`wx-hourly-cell ${isNow ? 'now' : ''}`} title={String(p['shortForecast'] ?? '')}>
                    <span className="hour">{fmtHour(tsec * 1000, loc.timezone)}</span>
                    <span className="day">{fmtDay(tsec * 1000, loc.timezone)}</span>
                    <span className="temp">{String(p['temperature'] ?? '')}</span>
                    <span className="extra">{String(p['windSpeed'] ?? '')}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ---- Buoys ---- */}
        {buoyIds.length > 0 && (
          <>
            <h2>Water &amp; bay <span className="ts">· NOAA buoys</span></h2>
            <div className="grid grid-2">
              {buoyIds.map((bId, i) => {
                const b = (buoys[i] as BuoyObs | null)?.properties ?? null;
                return (
                  <div className="card" key={bId}>
                    <h3>{bId}</h3>
                    {!b ? <div className="fade">No data cached.</div> : (
                      <table className="kv-table">
                        <tbody>
                          {BUOY_FIELDS.map(([f, lbl, unit]) => {
                            const v = b[f]?.value;
                            if (v == null) return null;
                            return (
                              <tr key={f}><td className="k">{lbl}</td><td className="v">{Number(v).toFixed(2)} {unit}</td></tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ---- Marine summary ---- */}
        {mrn && (
          <div className="card" style={{ marginTop: 12 }}>
            <h3>Marine summary <span className="muted" style={{ fontWeight: 400 }}>(WeatherAPI)</span></h3>
            <div className="row" style={{ fontSize: '.85em' }}>
              {mrn.condition?.text && <span className="gold">{mrn.condition.text}</span>}
              <KV label="Max temp"  v={mrn.maxtemp_f != null ? `${mrn.maxtemp_f}°F` : null} />
              <KV label="Min temp"  v={mrn.mintemp_f != null ? `${mrn.mintemp_f}°F` : null} />
              <KV label="Max wind"  v={mrn.maxwind_mph != null ? `${mrn.maxwind_mph} mph` : null} />
              <KV label="Precip"    v={mrn.totalprecip_in != null ? `${mrn.totalprecip_in} in` : null} />
              <KV label="Humidity"  v={mrn.avghumidity != null ? `${mrn.avghumidity}%` : null} />
            </div>
          </div>
        )}

        {/* ---- Aviation ---- */}
        {sigmets && (sigmets.features?.length ?? 0) > 0 && (
          <>
            <h2>Aviation SIGMETs <span className="ts">· KCCR</span></h2>
            <div className="card">
              {sigmets.features!.map((f, i) => (
                <div key={i}>
                  <h3>{f.properties?.phenomenon ?? 'SIGMET'} <span className="muted" style={{ fontWeight: 400, fontSize: '.85em' }}>{f.properties?.hazard ?? ''}</span></h3>
                  <p className="body">{f.properties?.rawSigmet ?? ''}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- Radar / imagery ---- */}
        <h2>Radar &amp; imagery</h2>
        <div className="wx-radar">
          {storyImgs.map((img) => (
            <figure key={img}>
              <img src={`https://www.weather.gov/images/mtr/WxStory/${img}`} alt="" />
              <figcaption>WFO Monterey Story</figcaption>
            </figure>
          ))}
          <figure>
            <img src="https://radar.weather.gov/ridge/standard/KDAX_loop.gif" alt="KDAX radar loop" />
            <figcaption>KDAX radar loop</figcaption>
          </figure>
          <figure>
            <img src="https://www.weather.gov/wwamap/png/mtr.png" alt="WFO Monterey alert map" />
            <figcaption>WFO Monterey alert map</figcaption>
          </figure>
        </div>

        {/* ---- Other CA alerts ---- */}
        {otherAlerts.length > 0 && (
          <>
            <h2>Other CA alerts <span className="ts">· not in our county</span></h2>
            <details>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: '.9em', padding: '6px 0' }}>
                Show {otherAlerts.length} non-local alert{otherAlerts.length === 1 ? '' : 's'}
              </summary>
              <div className="stack" style={{ marginTop: 8 }}>
                {otherAlerts.map((a, i) => (
                  <div key={i} className="card alert not-local">
                    <h3 style={{ color: 'gold' }}>{a.event ?? 'Alert'}</h3>
                    {a.areaDesc && <div className="meta">{a.areaDesc.replace(/;/g, ', ')}</div>}
                    {a.NWSheadline && <div className="body">{a.NWSheadline}</div>}
                  </div>
                ))}
              </div>
            </details>
          </>
        )}

        <div className="sources">
          Sources:&nbsp;
          <a href="https://api.weather.gov" target="_blank" rel="noopener">NOAA api.weather.gov</a> ·{' '}
          <a href="https://www.weather.gov/mtr" target="_blank" rel="noopener">WFO Monterey</a> ·{' '}
          <a href="https://www.weatherapi.com" target="_blank" rel="noopener">WeatherAPI</a> ·{' '}
          <a href="https://www2.purpleair.com" target="_blank" rel="noopener">PurpleAir</a> ·{' '}
          <a href="https://openweathermap.org" target="_blank" rel="noopener">OpenWeatherMap</a> ·{' '}
          <a href="https://weatherstack.com" target="_blank" rel="noopener">WeatherStack</a>.
          Background refreshes via <a href="/admin">/admin</a>.
        </div>

      </div>
    </>
  );
}

const BUOY_FIELDS: Array<[string, string, string]> = [
  ['temperature',                'Surface temp',    'C'],
  ['dewpoint',                   'Dewpoint',        'C'],
  ['barometricPressure',         'Barometric pressure', 'Pa'],
  ['seaLevelPressure',           'Sea-level pressure',  'Pa'],
  ['windSpeed',                  'Wind speed',     'km/h'],
  ['windGust',                   'Wind gust',      'km/h'],
  ['windDirection',              'Wind direction', 'deg'],
  ['visibility',                 'Visibility',     'm'],
  ['precipitationLast3Hours',    'Precip last 3h', 'mm'],
  ['relativeHumidity',           'Humidity',       '%'],
  ['maxTemperatureLast24Hours',  'Max temp 24h',   'C'],
  ['minTemperatureLast24Hours',  'Min temp 24h',   'C'],
  ['windChill',                  'Wind chill',     'C'],
  ['heatIndex',                  'Heat index',     'C'],
];

function Tile({ cls = '', label, value, sub }: { cls?: string; label: string; value: string; sub: string }) {
  return (
    <div className={`tile ${cls}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}
function KV({ label, v }: { label: string; v: string | null }) {
  if (!v) return null;
  return (<><span className="muted">{label}:</span> <span className="gold">{v}</span></>);
}
function fmtHour(ms: number, tz: string) {
  return new Date(ms).toLocaleString('en-US', { timeZone: tz, hour: 'numeric' });
}
function fmtDay(ms: number, tz: string) {
  return new Date(ms).toLocaleString('en-US', { timeZone: tz, weekday: 'short' });
}
function fmtTime(ms: number, tz: string) {
  return new Date(ms).toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', month: 'numeric', day: 'numeric' });
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
