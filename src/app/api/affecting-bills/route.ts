import { NextResponse } from 'next/server';
import { getJson } from '@/lib/cache';
import type { AffectingBillsPayload } from '@/lib/bills';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serves the cached "bills affecting Contra Costa Co. / CA" payload.
// Populated by the 4h cron from src/lib/bills.ts.
export async function GET() {
  const payload = await getJson<AffectingBillsPayload>('affecting_bills').catch(() => null);
  if (!payload) {
    return NextResponse.json(
      { empty: true, reason: 'Cache not populated yet. Run /admin → 4h after Railway redeploys.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
  });
}
