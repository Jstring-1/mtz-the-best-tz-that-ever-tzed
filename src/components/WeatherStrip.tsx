import { getJson } from '@/lib/cache';
import { getLocation } from '@/lib/location';

// Top-of-page weather summary, rendered on every page above the site header.
// Reads from cache only — no fetches on render.

interface WxNow {
  current?: {
    temp_f?: number; humidity?: number;
    wind_mph?: number; wind_dir?: string;
    pressure_mb?: number;
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
  try {
    [wxNow, wxForecast, purpleAir] = await Promise.all([
      getJson<WxNow>('weatherAPI'),
      getJson<WxForecast>('weatherAPI_forecast'),
      loc.purpleAirSensor ? getJson<PurpleAir>(`purple_air_${loc.purpleAirSensor}`) : Promise.resolve(null),
    ]);
  } catch (e) {
    console.error('WeatherStrip cache read failed:', e);
  }

  const cur = wxNow?.current ?? null;
  const astro = wxForecast?.forecast?.forecastday?.[0]?.astro ?? null;
  const pa = purpleAir?.sensor ?? null;

  return (
    <section className="wx-strip">
      <span className="clock">
        {new Date().toLocaleString('en-US', { timeZone: loc.timezone, weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      {cur?.condition?.icon && <img src={`https:${cur.condition.icon}`} alt={cur.condition.text ?? ''} />}
      {cur?.condition?.text && <span className="gold">{cur.condition.text}</span>}
      {cur?.temp_f != null && <span className="red">{cur.temp_f}°F</span>}
      {cur?.wind_mph != null && <span className="dodger">Wind {cur.wind_mph}mph {cur.wind_dir ?? ''}</span>}
      {cur?.humidity != null && <span className="green">Humidity {cur.humidity}%</span>}
      {pa?.['pm2.5'] != null && <span className="blue">AQI {pa['pm2.5']}</span>}
      {cur?.pressure_mb != null && <span className="peru">{Math.round(cur.pressure_mb)} mb</span>}
      {astro?.sunrise && <span className="gold">Sunrise {astro.sunrise}</span>}
      {astro?.sunset && <span className="violet">Sunset {astro.sunset}</span>}
    </section>
  );
}
