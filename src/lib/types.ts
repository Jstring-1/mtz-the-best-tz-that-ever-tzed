// Lightweight types for cached cron data.  We're loose with `unknown` in
// places — these come from third-party APIs and we'd rather render the UI
// defensively than maintain a perfect type per upstream contract.

export interface PlaceRow {
  fsq_id: string;
  name: string | null;
  addy: string | null;
  cats: string | null;
  dist: number | null;
  images: string | null;
  lat: string | null;
  lon: string | null;
}

export interface FeedRow {
  ts: string;       // unix epoch seconds, stored as text
  title: string;
  body: string;
  link: string;
}

export interface NoaaHourlyRow {
  ts: string;       // unix epoch seconds, stored as text
  json: string;     // serialized hourly period
}

export interface MiscRow {
  id: string;
  text: string | null;
  ts: string | null;
}

export interface NoaaForecastPeriod {
  name?: string;
  startTime?: string;
  endTime?: string;
  isDaytime?: boolean;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  icon?: string;
  shortForecast?: string;
  detailedForecast?: string;
  probabilityOfPrecipitation?: { value?: number | null };
  relativeHumidity?: { value?: number | null };
  dewpoint?: { value?: number | null };
}

export interface NoaaAlert {
  event?: string;
  areaDesc?: string;
  status?: string;
  severity?: string;
  certainty?: string;
  urgency?: string;
  messageType?: string;
  senderName?: string;
  headline?: string;
  description?: string;
  response?: string;
  affectedZones?: string[];
  NWSheadline?: string;
  sent?: number;
  effective?: number;
  onset?: number;
  expires?: number;
  ends?: number;
  desc_arr?: Record<string, string>;
}

export interface NoaaAlertsBag {
  LOCAL: Record<string, NoaaAlert> | string;
  'NOT-LOCAL': Record<string, NoaaAlert> | string;
}

export interface BirdRow {
  name: string;
  fancy_name: string;
  date: string;
  place: string;
  count: number | null;
  lat: string | number;
  lon: string | number;
}

export interface QuakeRow {
  magnitude: number | null;
  place: string;
  occurred_at: number;
  url: string;
}

// Raw Ticketmaster event shape (only the fields we touch — Ticketmaster
// returns more, and we preserve those untyped on `extra`).
export interface TmImage  { url?: string; ratio?: string; width?: number; height?: number }
export interface TmVenue  { name?: string; city?: { name?: string }; state?: { name?: string; stateCode?: string }; address?: { line1?: string; line2?: string }; postalCode?: string; url?: string; location?: { latitude?: string; longitude?: string } }
export interface TmClassification { primary?: boolean; segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }
export interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  pleaseNote?: string;
  info?: string;
  distance?: number;
  units?: string;
  images?: TmImage[];
  classifications?: TmClassification[];
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  sales?: {
    public?: { startDateTime?: string; endDateTime?: string };
  };
  priceRanges?: Array<{ type?: string; currency?: string; min?: number; max?: number }>;
  _embedded?: { venues?: TmVenue[]; attractions?: Array<{ name?: string; url?: string; images?: TmImage[] }> };
}

// Scraped park record. Stored under the 'local_parks' apis_json key
// as an array. Refreshed in the 12h cron bucket.
export interface Park {
  id: string;            // slug derived from URL path
  name: string;
  url: string;
  address?: string;
  description?: string;
  amenities?: string[];
  image?: string;
  // Hand-geocoded lat/lng (parks-data.ts). Used to drop pins on the
  // Leaflet map in ParksDetail. Optional so scraped-Park rows still
  // typecheck; ParksMap silently skips entries missing coords.
  lat?: number;
  lng?: number;
}

// Unified shape for scraped local-venue events. Stored under the
// 'local_events' apis_json key as an array.
export interface LocalEvent {
  id: string;             // stable string id, "source-<n>"
  source: string;         // short slug, e.g. 'delcielo', 'fivesuns_music'
  source_label: string;   // human-readable label (the venue, usually)
  title: string;
  start_at: number | null; // epoch seconds, or null if undated/recurring
  end_at?: number | null;
  venue: string;
  url: string;
  description?: string;
  image?: string;
}

export type ApisJsonId =
  | 'NOAA_alerts'
  | 'NOAA_gp_forecast'
  | 'NOAA_gp_forecast_hrly'
  | 'NOAA_aviation_SIGMETs'
  | 'weatherAPI'
  | 'weatherAPI_mrn'
  | 'weatherAPI_forecast'
  | 'OPEN_weather'
  | 'weatherStack'
  | 'eBird'
  | 'USGS_earthquakes'
  | 'four_sq'
  | 'TM_shows'
  | 'local_events'
  | 'local_parks'
  | '12D_stocks'
  | string;       // also: NOAA_Bouy_*, purple_air_*, plus future ids
