import { NextRequest, NextResponse } from 'next/server';
import { parseLegistarCalendar } from '@/lib/scrape-events';
import { upsertEvents } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Ingestion endpoint for the Contra Costa Legistar calendar.
//
// Why this exists: Granicus's WAF null-routes Railway's outbound IP
// range, so we can't fetch contra-costa.legistar.com/Calendar.aspx
// from the running app. A GitHub Actions workflow runs every 4h on a
// GitHub-hosted runner (different IP range, unblocked), downloads the
// calendar HTML, and POSTs it here as raw text/html. We then parse +
// upsert into the existing `events` table with source='cclegistar' so
// the rows flow into the Municipal tab via the same normalization the
// home page already does.
//
// Auth: shared secret in LEGISTAR_INGEST_TOKEN env. The workflow sets
// the matching value in repo secrets; mismatched → 401.

const MIN_HTML_BYTES = 1000;          // sanity floor — real calendar is ~1.3MB
const MAX_HTML_BYTES = 8 * 1024 * 1024; // 8MB ceiling so we don't blow memory

async function handle(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.LEGISTAR_INGEST_TOKEN ?? '';
  if (!expected) {
    return new NextResponse('LEGISTAR_INGEST_TOKEN not configured', { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const html = await req.text();
  if (!html || html.length < MIN_HTML_BYTES) {
    return new NextResponse(`HTML body too small (${html?.length ?? 0} bytes)`, { status: 400 });
  }
  if (html.length > MAX_HTML_BYTES) {
    return new NextResponse(`HTML body too large (${html.length} bytes)`, { status: 413 });
  }

  const events = parseLegistarCalendar(html);
  if (events.length === 0) {
    return new NextResponse(`Parsed 0 events from ${html.length} bytes — likely HTML structure changed`, { status: 422 });
  }

  // Mirror the same upsert shape `localEvents()` in cron.ts uses so
  // the rows are interchangeable with what the Railway-side scrapers
  // produce. id prefix `local-` keeps the dedupe key consistent.
  await upsertEvents(events.map((e) => ({
    id: `local-${e.id}`,
    source: e.source,
    source_label: e.source_label,
    title: e.title,
    start_at: e.start_at,
    end_at: e.end_at ?? null,
    venue: e.venue,
    city: null,
    url: e.url,
    description: e.description ?? null,
    image: e.image ?? null,
    segment: null,
    genre: null,
    please_note: null,
    payload: e,
  })));

  return NextResponse.json({
    ok: true,
    bytes: html.length,
    parsed: events.length,
    sample: events.slice(0, 3).map((e) => ({ title: e.title, start_at: e.start_at })),
  });
}

export const POST = handle;
