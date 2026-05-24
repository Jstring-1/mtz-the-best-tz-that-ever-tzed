import { NextRequest, NextResponse } from 'next/server';
import { runBucket, BUCKETS, type Bucket } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get('bucket');
  if (!bucket || !BUCKETS.includes(bucket as Bucket)) {
    return new NextResponse(`Usage: ?bucket=${BUCKETS.join('|')}\n`, { status: 400 });
  }
  try {
    const r = await runBucket(bucket as Bucket);
    const lines = [
      `OK [bucket=${bucket}] elapsed=${r.ms}ms`,
      `ran (${r.ok.length}): ${r.ok.join(', ')}`,
    ];
    // Per-job timings, slowest first — surfaces which job is dragging
    // the bucket toward Railway's ~90s HTTP-proxy timeout.
    const timingEntries = Object.entries(r.timings).sort((a, b) => b[1] - a[1]);
    if (timingEntries.length) {
      lines.push('timings (slowest first):');
      for (const [name, ms] of timingEntries) lines.push(`  ${name}: ${ms}ms`);
    }
    const errKeys = Object.keys(r.errors);
    if (errKeys.length) {
      lines.push(`errors (${errKeys.length}):`);
      for (const k of errKeys) lines.push(`  ${k}: ${r.errors[k]}`);
    }
    return new NextResponse(lines.join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (e) {
    return new NextResponse(`FAIL: ${e instanceof Error ? e.message : String(e)}\n`, { status: 500 });
  }
}

export const GET  = handle;
export const POST = handle;
