import { NextResponse } from 'next/server';
import { getJson } from '@/lib/cache';
import { CURRENT_AGENCY_ORIS, type CrimePayload } from '@/lib/crime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serves the cached FBI Crime Data Explorer payload populated by the
// 12h cron (src/lib/crime.ts). Previously this endpoint did a live
// fan-out of ~64 FBI API calls per request which routinely hit the
// api.data.gov rate limit and returned all zeros.
//
// If the cached payload was written under a DIFFERENT set of agency
// ORIs than the current code expects (i.e. the AGENCIES list changed,
// e.g. when we corrected Martinez PD's ORI from CA0070500 to CA0071400),
// we treat the cache as stale and ask for a refresh — otherwise the
// popup would show data tagged with the wrong agency names.
export async function GET() {
  const payload = await getJson<CrimePayload>('crime_data').catch(() => null);

  // Stale-config detection. The `agencyOris` field is the snapshot of
  // AGENCIES at write time. A missing/different value means the
  // payload predates the current code.
  const stale = payload && payload.agencyOris !== CURRENT_AGENCY_ORIS;

  if (!payload || payload.agencies.length === 0 || stale) {
    return NextResponse.json({
      empty: true,
      reason: stale
        ? 'Crime data ORIs were corrected — cache is stale. Run /admin → 12h to refresh.'
        : 'Cache not populated yet. Run /admin → 12h after Railway redeploys.',
      agency: 'Martinez Police Department',
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
