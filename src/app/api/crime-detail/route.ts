import { NextResponse } from 'next/server';
import { getJson } from '@/lib/cache';
import type { CrimePayload } from '@/lib/crime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serves the cached FBI Crime Data Explorer payload populated by the
// 12h cron (src/lib/crime.ts). Previously this endpoint did a live
// fan-out of ~64 FBI API calls per request which routinely hit the
// api.data.gov rate limit and returned all zeros.
//
// The response shape matches the legacy single-agency fields the
// CrimeDetail component already understands, with `agencies[]` added
// for multi-agency rendering.
export async function GET() {
  const payload = await getJson<CrimePayload>('crime_data').catch(() => null);
  if (!payload || payload.agencies.length === 0) {
    return NextResponse.json({
      empty: true,
      reason: 'Cache not populated yet. Run /admin → 12h after Railway redeploys.',
      // Legacy fields so the client doesn't crash on the back-compat
      // single-agency render path.
      agency: 'Martinez area PD',
      year: 0,
      rows: [],
      violent: 0,
      property: 0,
      total: 0,
      cdeUrl: 'https://cde.ucr.cjis.gov/',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const primary = payload.agencies[0];
  return NextResponse.json({
    agencies: payload.agencies,
    scrapedAt: payload.scrapedAt,
    // Legacy single-agency fields, for back-compat with the modal.
    agency: primary.name,
    year: primary.year,
    rows: primary.rows,
    violent: primary.violent,
    property: primary.property,
    total: primary.total,
    cdeUrl: primary.cdeUrl,
  }, {
    headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
  });
}
