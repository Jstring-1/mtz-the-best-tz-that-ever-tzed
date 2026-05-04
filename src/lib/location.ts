// Location config — driven entirely by env vars so a different LAT/LON/NAME
// gives you a different city site without code changes.  All optional fields
// have sane defaults so a minimal env (LAT, LON, LOCATION_NAME) gets you a
// working deployment.

export interface Location {
  siteName: string;
  name: string;          // "Martinez, CA"
  short: string;         // "Martinez"
  lat: number;
  lon: number;
  timezone: string;
  noaaBuoys: string[];
  purpleAirSensor: string | null;
  foursquareCategories: string;
  foursquareRadiusM: number;
  ticketmasterGenres: string;
  newsRssUrls: string[];
}

let cached: Location | null = null;

export function getLocation(): Location {
  if (cached) return cached;
  const env = process.env;
  const lat = Number(env.LAT ?? 38.01);
  const lon = Number(env.LON ?? -122.14);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error('LAT/LON must be numeric');
  }
  cached = {
    siteName: env.SITE_NAME?.trim() || 'mtz.city',
    name:     env.LOCATION_NAME?.trim() || 'Martinez, CA',
    short:    env.LOCATION_SHORT?.trim() || 'Martinez',
    lat,
    lon,
    timezone: env.TIMEZONE?.trim() || 'America/Los_Angeles',
    noaaBuoys:        splitCsv(env.NOAA_BUOYS),
    purpleAirSensor:  env.PURPLEAIR_SENSOR?.trim() || null,
    foursquareCategories: env.FOURSQUARE_CATEGORIES?.trim() || '10000,13000,14003,16000',
    foursquareRadiusM:    Number(env.FOURSQUARE_RADIUS_M ?? 5000),
    ticketmasterGenres:   env.TICKETMASTER_GENRES?.trim() || 'roots,blues,indie,americana,world,reggae,folk',
    newsRssUrls:          splitCsv(env.NEWS_RSS_URLS),
  };
  return cached;
}

function splitCsv(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

// Resolve NOAA gridpoint ("MTR/97,114") for the configured lat/lon at startup.
// NOAA strongly recommends caching this — gridpoint coords don't change.
let cachedGridpoint: { wfo: string; x: number; y: number } | null = null;

export async function getNoaaGridpoint(): Promise<{ wfo: string; x: number; y: number }> {
  if (cachedGridpoint) return cachedGridpoint;
  const loc = getLocation();
  const r = await fetch(`https://api.weather.gov/points/${loc.lat},${loc.lon}`, {
    headers: { 'User-Agent': `${loc.siteName} (mtz-city)`, 'Accept': 'application/ld+json' },
  });
  if (!r.ok) throw new Error(`NOAA points lookup failed: ${r.status}`);
  const j: { cwa?: string; gridX?: number; gridY?: number } = await r.json();
  if (!j.cwa || j.gridX == null || j.gridY == null) {
    throw new Error('NOAA points response missing cwa/gridX/gridY');
  }
  cachedGridpoint = { wfo: j.cwa, x: j.gridX, y: j.gridY };
  return cachedGridpoint;
}
