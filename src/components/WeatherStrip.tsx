import { getJson } from '@/lib/cache';
import { getLocation } from '@/lib/location';
import WeatherDetail from './WeatherDetail';

// Top-of-page weather summary, rendered on every page above the site header.
// Reads from cache only — no fetches on render.

interface WxNow {
  current?: {
    temp_f?: number; feelslike_f?: number; humidity?: number;
    wind_mph?: number; wind_dir?: string; gust_mph?: number;
    pressure_mb?: number; uv?: number; vis_miles?: number;
    precip_in?: number; cloud?: number;
    condition?: { text?: string; icon?: string };
  };
}
interface WxForecast {
  forecast?: { forecastday?: Array<{ astro?: { sunrise?: string; sunset?: string } }> };
}
interface PurpleAir { sensor?: { 'pm2.5'?: number } }

export default async function WeatherStrip() {
  const loc = getLocation();
  // Defensive: never let a DB hiccup blank out the strip on every page.
  let wxNow: WxNow | null = null;
  let wxForecast: WxForecast | null = null;
  let purpleAir: PurpleAir | null = null;
  let openWeather: unknown = null;
  try {
    [wxNow, wxForecast, purpleAir, openWeather] = await Promise.all([
      getJson<WxNow>('weatherAPI'),
      getJson<WxForecast>('weatherAPI_forecast'),
      loc.purpleAirSensor ? getJson<PurpleAir>(`purple_air_${loc.purpleAirSensor}`) : Promise.resolve(null),
      getJson('OPEN_weather'),
    ]);
  } catch (e) {
    console.error('WeatherStrip cache read failed:', e);
  }

  const cur = wxNow?.current ?? null;
  const astro = wxForecast?.forecast?.forecastday?.[0]?.astro ?? null;
  const pa = purpleAir?.sensor ?? null;

  return (
    <section className="wx-strip">
      <span className="clock" title="Current local date">
        {new Date().toLocaleString('en-US', { timeZone: loc.timezone, weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      {(cur?.condition?.text || cur?.temp_f != null) && (
        <WeatherDetail
          triggerClassName="cond gold"
          tooltip={`Current conditions${cur?.condition?.text ? `: ${cur.condition.text}` : ''}${cur?.temp_f != null ? ` — air temperature ${Math.round(cur.temp_f)}°F` : ''}. Click for full OpenWeather snapshot.`}
          openWeather={openWeather as Parameters<typeof WeatherDetail>[0]['openWeather']}
          triggerContent={
            <>
              {cur?.condition?.icon && <img src={`https:${cur.condition.icon}`} alt={cur.condition.text ?? ''} />}
              {[cur?.condition?.text, cur?.temp_f != null ? `${Math.round(cur.temp_f)}°F` : null]
                .filter(Boolean).join(' ')}
            </>
          }
        />
      )}
      {cur?.feelslike_f != null && (
        <span className="red" title={`Feels-like temperature (heat index / wind chill): ${Math.round(cur.feelslike_f)}°F`}>Feels {Math.round(cur.feelslike_f)}°F</span>
      )}
      {cur?.wind_mph != null && (
        <span
          className="dodger"
          title={`Wind ${Math.round(cur.wind_mph)} mph${cur.wind_dir ? ` from ${cur.wind_dir}` : ''}${cur.gust_mph != null ? `, gusting to ${Math.round(cur.gust_mph)} mph` : ''}`}
        >
          {Math.round(cur.wind_mph)}mph {cur.wind_dir ?? ''}
          {cur.gust_mph != null ? ` g${Math.round(cur.gust_mph)}` : ''}
        </span>
      )}
      {cur?.humidity != null && (
        <span className="green" title={`Relative humidity: ${cur.humidity}%`}>{cur.humidity}%</span>
      )}
      {pa?.['pm2.5'] != null && (
        <span className="blue" title={`Air quality — PM2.5 fine-particulate reading from the nearest PurpleAir sensor: ${Math.round(pa['pm2.5'])}`}>AQI {Math.round(pa['pm2.5'])}</span>
      )}
      {cur?.uv != null && (
        <span className="violet" title={`UV index: ${Math.round(cur.uv)} (0–2 low, 3–5 moderate, 6–7 high, 8–10 very high, 11+ extreme)`}>UV {Math.round(cur.uv)}</span>
      )}
      {cur?.vis_miles != null && (
        <span className="peru" title={`Visibility: ${cur.vis_miles} miles`}>{cur.vis_miles}mi vis</span>
      )}
      {cur?.precip_in != null && cur.precip_in > 0 && (
        <span className="dodger" title={`Precipitation so far: ${cur.precip_in} inches`}>{cur.precip_in}in</span>
      )}
      {cur?.cloud != null && (
        <span className="green" title={`Cloud cover: ${cur.cloud}%`}>{cur.cloud}% cloud</span>
      )}
      {cur?.pressure_mb != null && (
        <span className="peru" title={`Barometric pressure: ${Math.round(cur.pressure_mb)} millibars`}>{Math.round(cur.pressure_mb)} mb</span>
      )}
      {astro?.sunrise && (
        <span className="gold" title={`Sunrise: ${astro.sunrise}`}>↑{astro.sunrise}</span>
      )}
      {astro?.sunset && (
        <span className="violet" title={`Sunset: ${astro.sunset}`}>↓{astro.sunset}</span>
      )}
    </section>
  );
}
