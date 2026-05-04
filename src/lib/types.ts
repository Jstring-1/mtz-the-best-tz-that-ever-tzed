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

export interface ShowRow {
  date: number;
  band: string;
  venue: string;
  city: string;
  distance: string;
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
  | '12D_stocks'
  | string;       // also: NOAA_Bouy_*, purple_air_*, plus future ids
