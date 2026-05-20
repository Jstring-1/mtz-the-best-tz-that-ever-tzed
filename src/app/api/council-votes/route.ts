import { NextResponse } from 'next/server';
import { getJson } from '@/lib/cache';
import type { CouncilScrapeResult } from '@/lib/scrape-council';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  let payload: CouncilScrapeResult | null = null;
  try { payload = await getJson<CouncilScrapeResult>('gov_council_votes'); }
  catch { /* DB cold */ }
  return NextResponse.json(payload ?? { scrapedAt: '', meetings: 0, votes: [], diag: null });
}
