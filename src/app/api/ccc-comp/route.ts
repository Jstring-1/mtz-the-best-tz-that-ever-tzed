import { NextResponse } from 'next/server';
import { getJson } from '@/lib/cache';
import type { CompPayload } from '@/lib/comp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serves the cached publicpay.ca.gov compensation payload (one row per
// employee for the most recent year available). Client-side filtering
// is fine for the ~10k-row CCC dataset; we just return the whole thing
// and let the browser slice it.
export async function GET() {
  const payload = await getJson<CompPayload>('ccc_comp').catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: 'No compensation data cached yet. Run /admin → 12h.' }, { status: 404 });
  }
  // gzip is automatic via Next/Node — we just need to return JSON.
  return NextResponse.json(payload, {
    headers: {
      // Cache hint for the client; the cron refreshes every 12h.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
