// Structured tables for events, birds, quakes, parks, alerts.
//
// One table per kind. Each has a stable string primary key derived from
// the upstream source so upserts are idempotent. first_seen / last_seen
// give us a small audit trail and let the purge job drop old rows.
//
// All tables are created on demand on first call — no separate
// migration step is needed for fresh databases.

import { sql } from './db';

let ensured = false;
async function ensureTables(): Promise<void> {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id            TEXT PRIMARY KEY,
      source        TEXT NOT NULL,
      source_label  TEXT NOT NULL,
      title         TEXT NOT NULL,
      start_at      BIGINT,
      end_at        BIGINT,
      venue         TEXT,
      city          TEXT,
      url           TEXT,
      description   TEXT,
      image         TEXT,
      segment       TEXT,
      genre         TEXT,
      please_note   TEXT,
      payload       JSONB,
      first_seen    TIMESTAMPTZ DEFAULT NOW(),
      last_seen     TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS events_start_at_idx ON events (start_at)`;
  await sql`CREATE INDEX IF NOT EXISTS events_source_idx   ON events (source)`;

  await sql`
    CREATE TABLE IF NOT EXISTS birds (
      id            TEXT PRIMARY KEY,
      common_name   TEXT NOT NULL,
      sci_name      TEXT,
      observed_at   BIGINT,
      place         TEXT,
      cnt           INT,
      lat           DOUBLE PRECISION,
      lon           DOUBLE PRECISION,
      first_seen    TIMESTAMPTZ DEFAULT NOW(),
      last_seen     TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS birds_observed_at_idx ON birds (observed_at)`;

  // Wikipedia summary per species — fetched in the background by the
  // eBird cron job so the UI never has to wait on the Wikipedia API
  // when a row is clicked.
  await sql`
    CREATE TABLE IF NOT EXISTS bird_wiki (
      common_name   TEXT PRIMARY KEY,
      description   TEXT,
      extract       TEXT,
      thumbnail_url TEXT,
      content_url   TEXT,
      fetched_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS quakes (
      id            TEXT PRIMARY KEY,
      magnitude     REAL,
      place         TEXT,
      occurred_at   BIGINT,
      url           TEXT,
      first_seen    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS quakes_occurred_at_idx ON quakes (occurred_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS parks (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      url           TEXT,
      address       TEXT,
      description   TEXT,
      amenities     JSONB,
      image         TEXT,
      first_seen    TIMESTAMPTZ DEFAULT NOW(),
      last_seen     TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS alerts (
      id            TEXT PRIMARY KEY,
      event         TEXT,
      severity      TEXT,
      urgency       TEXT,
      certainty     TEXT,
      status        TEXT,
      headline      TEXT,
      area_desc     TEXT,
      description   TEXT,
      sent_at       BIGINT,
      effective_at  BIGINT,
      expires_at    BIGINT,
      scope         TEXT,
      first_seen    TIMESTAMPTZ DEFAULT NOW(),
      last_seen     TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS alerts_expires_at_idx ON alerts (expires_at)`;

  ensured = true;
}

function jsonify(v: unknown): string { return JSON.stringify(v ?? null); }

// ---------- Events ----------------------------------------------------

export interface StoredEvent {
  id: string;
  source: string;
  source_label: string;
  title: string;
  start_at: number | null;
  end_at: number | null;
  venue: string | null;
  city: string | null;
  url: string | null;
  description: string | null;
  image: string | null;
  segment: string | null;
  genre: string | null;
  please_note: string | null;
  payload?: unknown;
}

export async function upsertEvents(rows: StoredEvent[]): Promise<void> {
  if (!rows.length) return;
  await ensureTables();
  for (const r of rows) {
    await sql`
      INSERT INTO events (
        id, source, source_label, title, start_at, end_at, venue, city,
        url, description, image, segment, genre, please_note, payload,
        last_seen
      ) VALUES (
        ${r.id}, ${r.source}, ${r.source_label}, ${r.title},
        ${r.start_at}, ${r.end_at}, ${r.venue}, ${r.city},
        ${r.url}, ${r.description}, ${r.image},
        ${r.segment}, ${r.genre}, ${r.please_note},
        ${jsonify(r.payload)}::jsonb, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        source       = EXCLUDED.source,
        source_label = EXCLUDED.source_label,
        title        = EXCLUDED.title,
        start_at     = EXCLUDED.start_at,
        end_at       = EXCLUDED.end_at,
        venue        = EXCLUDED.venue,
        city         = EXCLUDED.city,
        url          = EXCLUDED.url,
        description  = EXCLUDED.description,
        image        = EXCLUDED.image,
        segment      = EXCLUDED.segment,
        genre        = EXCLUDED.genre,
        please_note  = EXCLUDED.please_note,
        payload      = EXCLUDED.payload,
        last_seen    = NOW()
    `;
  }
}

// Upcoming + recently-finished events (cutoff = now - 6h grace).
export async function listUpcomingEvents(maxAheadDays = 365): Promise<StoredEvent[]> {
  await ensureTables();
  const cutoff = Math.floor(Date.now() / 1000) - 6 * 3600;
  const horizon = Math.floor(Date.now() / 1000) + maxAheadDays * 86400;
  const rows = await sql<StoredEvent[]>`
    SELECT id, source, source_label, title, start_at, end_at, venue, city,
           url, description, image, segment, genre, please_note
    FROM events
    WHERE start_at IS NULL OR (start_at >= ${cutoff} AND start_at <= ${horizon})
    ORDER BY COALESCE(start_at, 9999999999) ASC
  `;
  return rows;
}

// ---------- Birds -----------------------------------------------------

export interface StoredBird {
  id: string;
  common_name: string;
  sci_name: string | null;
  observed_at: number | null;
  place: string | null;
  cnt: number | null;
  lat: number | null;
  lon: number | null;
  // Joined from bird_wiki — null until the cron's backfill runs.
  wiki_description?: string | null;
  wiki_extract?: string | null;
  wiki_thumbnail?: string | null;
  wiki_url?: string | null;
}

export async function upsertBirds(rows: StoredBird[]): Promise<void> {
  if (!rows.length) return;
  await ensureTables();
  for (const r of rows) {
    await sql`
      INSERT INTO birds (id, common_name, sci_name, observed_at, place, cnt, lat, lon, last_seen)
      VALUES (${r.id}, ${r.common_name}, ${r.sci_name}, ${r.observed_at}, ${r.place}, ${r.cnt}, ${r.lat}, ${r.lon}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        common_name = EXCLUDED.common_name,
        sci_name    = EXCLUDED.sci_name,
        observed_at = EXCLUDED.observed_at,
        place       = EXCLUDED.place,
        cnt         = EXCLUDED.cnt,
        lat         = EXCLUDED.lat,
        lon         = EXCLUDED.lon,
        last_seen   = NOW()
    `;
  }
}

export async function listRecentBirds(limit = 60): Promise<StoredBird[]> {
  await ensureTables();
  return await sql<StoredBird[]>`
    SELECT b.id, b.common_name, b.sci_name, b.observed_at, b.place, b.cnt, b.lat, b.lon,
           w.description   AS wiki_description,
           w.extract       AS wiki_extract,
           w.thumbnail_url AS wiki_thumbnail,
           w.content_url   AS wiki_url
    FROM birds b
    LEFT JOIN bird_wiki w ON w.common_name = b.common_name
    ORDER BY b.observed_at DESC NULLS LAST
    LIMIT ${limit}
  `;
}

// Backfill Wikipedia summaries for any species we haven't seen yet
// (or last fetched > 90 days ago). Called from the eBird cron after
// the sightings upsert. Rate-limited at 200ms per call.
export async function backfillBirdWikis(commonNames: string[]): Promise<{ fetched: number; skipped: number; failed: number }> {
  await ensureTables();
  const unique = Array.from(new Set(commonNames.filter(Boolean)));
  if (!unique.length) return { fetched: 0, skipped: 0, failed: 0 };

  // Pull the set of species already cached recently.
  const cached = await sql<{ common_name: string }[]>`
    SELECT common_name
    FROM bird_wiki
    WHERE common_name = ANY(${unique})
      AND fetched_at > NOW() - INTERVAL '90 days'
  `;
  const have = new Set(cached.map((r) => r.common_name));
  const todo = unique.filter((n) => !have.has(n));

  let fetched = 0, failed = 0;
  for (const name of todo) {
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`, {
        headers: { 'User-Agent': 'mtz-city/1.0 (bird wiki backfill)' },
      });
      if (!r.ok) { failed++; continue; }
      const j = await r.json() as {
        description?: string; extract?: string;
        thumbnail?: { source?: string };
        content_urls?: { desktop?: { page?: string } };
      };
      await sql`
        INSERT INTO bird_wiki (common_name, description, extract, thumbnail_url, content_url, fetched_at)
        VALUES (${name}, ${j.description ?? null}, ${j.extract ?? null},
                ${j.thumbnail?.source ?? null}, ${j.content_urls?.desktop?.page ?? null}, NOW())
        ON CONFLICT (common_name) DO UPDATE SET
          description   = EXCLUDED.description,
          extract       = EXCLUDED.extract,
          thumbnail_url = EXCLUDED.thumbnail_url,
          content_url   = EXCLUDED.content_url,
          fetched_at    = NOW()
      `;
      fetched++;
    } catch { failed++; }
    // Politeness pause — Wikipedia REST has generous limits but we're
    // not in a hurry. 200ms × 60 species = 12s, still fine inside one
    // cron tick.
    await new Promise((res) => setTimeout(res, 200));
  }
  return { fetched, skipped: have.size, failed };
}

// ---------- Quakes ----------------------------------------------------

export interface StoredQuake {
  id: string;
  magnitude: number | null;
  place: string;
  occurred_at: number;
  url: string | null;
}

export async function upsertQuakes(rows: StoredQuake[]): Promise<void> {
  if (!rows.length) return;
  await ensureTables();
  for (const r of rows) {
    await sql`
      INSERT INTO quakes (id, magnitude, place, occurred_at, url)
      VALUES (${r.id}, ${r.magnitude}, ${r.place}, ${r.occurred_at}, ${r.url})
      ON CONFLICT (id) DO UPDATE SET
        magnitude   = EXCLUDED.magnitude,
        place       = EXCLUDED.place,
        occurred_at = EXCLUDED.occurred_at,
        url         = EXCLUDED.url
    `;
  }
}

export async function listRecentQuakes(limit = 40): Promise<StoredQuake[]> {
  await ensureTables();
  return await sql<StoredQuake[]>`
    SELECT id, magnitude, place, occurred_at, url
    FROM quakes
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `;
}

// ---------- Parks -----------------------------------------------------

export interface StoredPark {
  id: string;
  name: string;
  url: string | null;
  address: string | null;
  description: string | null;
  amenities: string[] | null;
  image: string | null;
}

export async function upsertParks(rows: StoredPark[]): Promise<void> {
  if (!rows.length) return;
  await ensureTables();
  for (const r of rows) {
    await sql`
      INSERT INTO parks (id, name, url, address, description, amenities, image, last_seen)
      VALUES (${r.id}, ${r.name}, ${r.url}, ${r.address}, ${r.description},
              ${jsonify(r.amenities)}::jsonb, ${r.image}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name        = EXCLUDED.name,
        url         = EXCLUDED.url,
        address     = EXCLUDED.address,
        description = EXCLUDED.description,
        amenities   = EXCLUDED.amenities,
        image       = EXCLUDED.image,
        last_seen   = NOW()
    `;
  }
}

export async function listParks(): Promise<StoredPark[]> {
  await ensureTables();
  const rows = await sql<Array<Omit<StoredPark, 'amenities'> & { amenities: unknown }>>`
    SELECT id, name, url, address, description, amenities, image
    FROM parks
    ORDER BY name ASC
  `;
  return rows.map((r) => ({
    ...r,
    amenities: normAmenities(r.amenities),
  }));
}

function normAmenities(v: unknown): string[] | null {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try { const j = JSON.parse(v); return Array.isArray(j) ? j as string[] : null; }
    catch { return null; }
  }
  return null;
}

// ---------- Alerts ----------------------------------------------------

export interface StoredAlert {
  id: string;
  event: string | null;
  severity: string | null;
  urgency: string | null;
  certainty: string | null;
  status: string | null;
  headline: string | null;
  area_desc: string | null;
  description: string | null;
  sent_at: number | null;
  effective_at: number | null;
  expires_at: number | null;
  scope: string;          // 'LOCAL' or 'NOT-LOCAL'
}

export async function upsertAlerts(rows: StoredAlert[]): Promise<void> {
  if (!rows.length) return;
  await ensureTables();
  for (const r of rows) {
    await sql`
      INSERT INTO alerts (
        id, event, severity, urgency, certainty, status, headline,
        area_desc, description, sent_at, effective_at, expires_at,
        scope, last_seen
      ) VALUES (
        ${r.id}, ${r.event}, ${r.severity}, ${r.urgency}, ${r.certainty},
        ${r.status}, ${r.headline}, ${r.area_desc}, ${r.description},
        ${r.sent_at}, ${r.effective_at}, ${r.expires_at}, ${r.scope}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        event        = EXCLUDED.event,
        severity     = EXCLUDED.severity,
        urgency      = EXCLUDED.urgency,
        certainty    = EXCLUDED.certainty,
        status       = EXCLUDED.status,
        headline     = EXCLUDED.headline,
        area_desc    = EXCLUDED.area_desc,
        description  = EXCLUDED.description,
        sent_at      = EXCLUDED.sent_at,
        effective_at = EXCLUDED.effective_at,
        expires_at   = EXCLUDED.expires_at,
        scope        = EXCLUDED.scope,
        last_seen    = NOW()
    `;
  }
}

export async function listActiveAlerts(): Promise<StoredAlert[]> {
  await ensureTables();
  const now = Math.floor(Date.now() / 1000);
  return await sql<StoredAlert[]>`
    SELECT id, event, severity, urgency, certainty, status, headline,
           area_desc, description, sent_at, effective_at, expires_at, scope
    FROM alerts
    WHERE expires_at IS NULL OR expires_at >= ${now}
    ORDER BY sent_at DESC NULLS LAST
  `;
}

// ---------- Purge -----------------------------------------------------

// Drop rows older than the per-table TTL. Run from the 12h cron bucket.
export async function purgeOldRows(): Promise<Record<string, number>> {
  await ensureTables();
  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 86400;
  const yearAgo       = Math.floor(Date.now() / 1000) - 365 * 86400;

  const e = await sql<{ c: string }[]>`
    WITH del AS (
      DELETE FROM events
      WHERE COALESCE(end_at, start_at, 0) < ${ninetyDaysAgo}
      RETURNING id
    ) SELECT COUNT(*)::text AS c FROM del
  `;
  const b = await sql<{ c: string }[]>`
    WITH del AS (
      DELETE FROM birds
      WHERE observed_at IS NOT NULL AND observed_at < ${ninetyDaysAgo}
      RETURNING id
    ) SELECT COUNT(*)::text AS c FROM del
  `;
  const q = await sql<{ c: string }[]>`
    WITH del AS (
      DELETE FROM quakes
      WHERE occurred_at < ${yearAgo}
      RETURNING id
    ) SELECT COUNT(*)::text AS c FROM del
  `;
  const a = await sql<{ c: string }[]>`
    WITH del AS (
      DELETE FROM alerts
      WHERE expires_at IS NOT NULL AND expires_at < ${ninetyDaysAgo}
      RETURNING id
    ) SELECT COUNT(*)::text AS c FROM del
  `;
  return {
    events: Number(e[0]?.c ?? 0),
    birds:  Number(b[0]?.c ?? 0),
    quakes: Number(q[0]?.c ?? 0),
    alerts: Number(a[0]?.c ?? 0),
  };
}
