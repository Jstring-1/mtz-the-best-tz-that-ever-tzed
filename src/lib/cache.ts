// Read/write helpers for the cron-populated cache tables.

import { sql } from './db';
import type {
  ApisJsonId,
  PlaceRow,
  FeedRow,
  NoaaHourlyRow,
  MiscRow,
} from './types';

// ---- READ ---------------------------------------------------------------

export async function getJson<T = unknown>(id: ApisJsonId): Promise<T | null> {
  const rows = await sql<{ json: string | null }[]>`
    SELECT json FROM apis_json WHERE id = ${id}
  `;
  if (!rows.length || rows[0].json == null) return null;
  try {
    return JSON.parse(rows[0].json) as T;
  } catch {
    return null;
  }
}

export async function getAllJsonTimestamps(): Promise<Record<string, string>> {
  const rows = await sql<{ id: string; ts: string }[]>`
    SELECT id, ts FROM apis_json ORDER BY id
  `;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.ts;
  return out;
}

export async function getXml(id: string): Promise<string | null> {
  const rows = await sql<{ xml: string | null }[]>`
    SELECT xml FROM apis_xml WHERE id = ${id}
  `;
  return rows.length ? rows[0].xml : null;
}

export async function getMisc(): Promise<MiscRow[]> {
  return await sql<MiscRow[]>`SELECT id, "text", ts FROM misc ORDER BY id`;
}

export async function getPlaces(): Promise<PlaceRow[]> {
  return await sql<PlaceRow[]>`
    SELECT fsq_id, name, addy, cats, dist, images, lat, lon
    FROM places
    ORDER BY dist ASC NULLS LAST
  `;
}

export async function getFeeds(limit = 80): Promise<FeedRow[]> {
  return await sql<FeedRow[]>`
    SELECT ts, title, body, link
    FROM feeds
    ORDER BY ts DESC
    LIMIT ${limit}
  `;
}

export async function getNoaaHourly(): Promise<NoaaHourlyRow[]> {
  return await sql<NoaaHourlyRow[]>`
    SELECT ts, json FROM noaa_hrly ORDER BY ts ASC
  `;
}

export async function getRowCounts(): Promise<Record<string, number>> {
  const tables = ['apis_json', 'apis_xml', 'misc', 'places', 'places_json', 'noaa_hrly', 'feeds'] as const;
  const out: Record<string, number> = {};
  for (const t of tables) {
    try {
      // table name is from a fixed allow-list above so identifier interpolation is safe
      const rows = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM ${sql(t)}`;
      out[t] = rows[0]?.c ?? 0;
    } catch {
      out[t] = -1;
    }
  }
  return out;
}

// ---- WRITE --------------------------------------------------------------

export async function upsertJson(id: ApisJsonId, payload: unknown): Promise<void> {
  const ts = new Date().toISOString().slice(0, 19);
  const json = JSON.stringify(payload ?? null);
  await sql`
    INSERT INTO apis_json (id, json, ts) VALUES (${id}, ${json}, ${ts})
    ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, ts = EXCLUDED.ts
  `;
}

export async function upsertJsonMany(records: Record<string, unknown>): Promise<void> {
  const ts = new Date().toISOString().slice(0, 19);
  const entries = Object.entries(records);
  if (!entries.length) return;
  for (const [id, payload] of entries) {
    const json = JSON.stringify(payload ?? null);
    await sql`
      INSERT INTO apis_json (id, json, ts) VALUES (${id}, ${json}, ${ts})
      ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, ts = EXCLUDED.ts
    `;
  }
}

export async function upsertXmlMany(records: Record<string, string>): Promise<void> {
  const ts = new Date().toISOString().slice(0, 19);
  const entries = Object.entries(records);
  if (!entries.length) return;
  for (const [id, xml] of entries) {
    await sql`
      INSERT INTO apis_xml (id, xml, ts) VALUES (${id}, ${xml}, ${ts})
      ON CONFLICT (id) DO UPDATE SET xml = EXCLUDED.xml, ts = EXCLUDED.ts
    `;
  }
}

export async function upsertMiscMany(records: Record<string, string>): Promise<void> {
  const ts = new Date().toISOString().slice(0, 19);
  const entries = Object.entries(records);
  if (!entries.length) return;
  for (const [id, text] of entries) {
    await sql`
      INSERT INTO misc (id, "text", ts) VALUES (${id}, ${text}, ${ts})
      ON CONFLICT (id) DO UPDATE SET "text" = EXCLUDED."text", ts = EXCLUDED.ts
    `;
  }
}

let placesLastSeenEnsured = false;
async function ensurePlacesLastSeen(): Promise<void> {
  if (placesLastSeenEnsured) return;
  await sql`ALTER TABLE places ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW()`;
  await sql`ALTER TABLE places ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`;
  await sql`ALTER TABLE places ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION`;
  placesLastSeenEnsured = true;
}

export type PlaceUpsert =
  Omit<PlaceRow, 'lat' | 'lon'> & { lat?: number | null; lon?: number | null };

export async function upsertPlaces(places: PlaceUpsert[]): Promise<void> {
  await ensurePlacesLastSeen();
  for (const p of places) {
    await sql`
      INSERT INTO places (fsq_id, name, addy, cats, dist, images, lat, lon, last_seen)
      VALUES (${p.fsq_id}, ${p.name}, ${p.addy}, ${p.cats}, ${p.dist}, ${p.images}, ${p.lat ?? null}, ${p.lon ?? null}, NOW())
      ON CONFLICT (fsq_id) DO UPDATE SET
        name      = EXCLUDED.name,
        addy      = EXCLUDED.addy,
        cats      = EXCLUDED.cats,
        dist      = EXCLUDED.dist,
        images    = EXCLUDED.images,
        lat       = EXCLUDED.lat,
        lon       = EXCLUDED.lon,
        last_seen = NOW()
    `;
  }
}

export async function upsertFeeds(items: FeedRow[]): Promise<void> {
  for (const f of items) {
    await sql`
      INSERT INTO feeds (ts, title, body, link)
      VALUES (${f.ts}, ${f.title}, ${f.body}, ${f.link})
      ON CONFLICT (ts) DO UPDATE SET
        title = EXCLUDED.title,
        body  = EXCLUDED.body,
        link  = EXCLUDED.link
    `;
  }
}

export async function upsertNoaaHourly(rows: { ts: string; json: string }[]): Promise<void> {
  // Drop rows older than 4 hours. `ts` is stored as TEXT but the values
  // are unix epoch seconds (e.g. "1777921200"), so `ts::timestamp` was
  // crashing every cleanup with "date/time field value out of range".
  // Convert via to_timestamp(epoch) and guard against any legacy ISO
  // rows by limiting to pure-digit strings.
  try {
    await sql`
      DELETE FROM noaa_hrly
      WHERE ts ~ '^[0-9]+$'
        AND to_timestamp(ts::bigint) < NOW() - INTERVAL '4 hours'
    `;
  } catch (e) {
    console.warn('[cache] noaa_hrly purge failed:', e instanceof Error ? e.message : e);
  }
  for (const r of rows) {
    await sql`
      INSERT INTO noaa_hrly (ts, json) VALUES (${r.ts}, ${r.json})
      ON CONFLICT (ts) DO NOTHING
    `;
  }
}
