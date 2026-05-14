// CRUD helpers for saved image overlays. The table is created on
// demand so we don't need a separate migration step.

import { sql } from './db';

export interface OverlayCorner { lat: number; lng: number }

export interface OverlayRecord {
  id: string;
  name: string;
  image_data: string;        // base64-encoded image bytes (no data: prefix)
  mime_type: string;
  corners: OverlayCorner[];  // four points: NW, NE, SW, SE per the plugin
  opacity: number;
  mode: string;
  created_at: string;
}
export type OverlaySummary = Omit<OverlayRecord, 'image_data'>;

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS overlays (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      image_data  TEXT NOT NULL,
      mime_type   TEXT NOT NULL DEFAULT 'image/png',
      corners     JSONB NOT NULL,
      opacity     REAL NOT NULL DEFAULT 0.6,
      mode        TEXT NOT NULL DEFAULT 'scale',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  ensured = true;
}

export async function listOverlays(): Promise<OverlaySummary[]> {
  await ensureTable();
  const rows = await sql<OverlaySummary[]>`
    SELECT id, name, mime_type, corners, opacity, mode, created_at
    FROM overlays
    ORDER BY created_at DESC
  `;
  return rows;
}

export async function getOverlay(id: string): Promise<OverlayRecord | null> {
  await ensureTable();
  const rows = await sql<OverlayRecord[]>`
    SELECT id, name, image_data, mime_type, corners, opacity, mode, created_at
    FROM overlays WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export async function saveOverlay(rec: Omit<OverlayRecord, 'created_at'>): Promise<void> {
  await ensureTable();
  await sql`
    INSERT INTO overlays (id, name, image_data, mime_type, corners, opacity, mode)
    VALUES (
      ${rec.id}, ${rec.name}, ${rec.image_data}, ${rec.mime_type},
      ${JSON.stringify(rec.corners)}::jsonb, ${rec.opacity}, ${rec.mode}
    )
    ON CONFLICT (id) DO UPDATE SET
      name       = EXCLUDED.name,
      image_data = EXCLUDED.image_data,
      mime_type  = EXCLUDED.mime_type,
      corners    = EXCLUDED.corners,
      opacity    = EXCLUDED.opacity,
      mode       = EXCLUDED.mode
  `;
}

export async function deleteOverlay(id: string): Promise<void> {
  await ensureTable();
  await sql`DELETE FROM overlays WHERE id = ${id}`;
}
