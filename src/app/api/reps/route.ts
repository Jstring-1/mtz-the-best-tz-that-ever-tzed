import { NextResponse } from 'next/server';
import { getJson } from '@/lib/cache';
import type { RepsPayload } from '@/lib/reps';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serves the cached "reps for Martinez at every level" payload built by
// the 12h cron in src/lib/reps.ts.
export async function GET() {
  const payload = await getJson<RepsPayload>('reps_data').catch(() => null);
  if (!payload) {
    return NextResponse.json(
      { empty: true, reason: 'Cache not populated yet. Run /admin → 12h after Railway redeploys.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
  });
}
