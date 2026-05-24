import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { getJson, upsertJson } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Allow-list — we only proxy from these hosts. Add new prefixes here
// when we want to embed another vendor's PDF (Granicus council minutes,
// ClearGov budget books from their S3 bucket, etc.).
const ALLOW_PREFIXES = [
  'https://martinez.granicus.com/',
  'https://cg-prod-v2.s3.us-east-2.amazonaws.com/pdfs-cache/',
];

// DB-cache PDFs as base64 — minutes don't change once published, so a
// long TTL is safe. We skip caching anything > MAX_CACHE_BYTES to keep
// the apis_json table from ballooning on unexpectedly large attachments.
const PDF_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const MAX_CACHE_BYTES = 4_000_000;             // ~5.3MB base64

interface CachedPdf {
  _ttlAt: number;
  ct: string;       // content-type
  b64: string;      // base64-encoded bytes
}

// Server-side proxy for embeddable PDFs (council minutes, budget books).
// Lets the browser embed the document in a same-origin iframe (no CORS
// / X-Frame issue) AND lets us forge the Accept/Referer headers some
// upstreams want. The endpoint is still called /api/council-pdf for
// historical reasons.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return new NextResponse('missing ?u=', { status: 400 });
  if (!ALLOW_PREFIXES.some((p) => u.startsWith(p))) {
    return new NextResponse('disallowed host', { status: 400 });
  }
  const cacheKey = `pdf_${createHash('sha1').update(u).digest('hex').slice(0, 16)}`;

  // 1. Check DB cache first.
  const hit = await getJson<CachedPdf>(cacheKey).catch(() => null);
  if (hit?.b64 && hit._ttlAt && hit._ttlAt > Date.now()) {
    const bytes = Buffer.from(hit.b64, 'base64');
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': hit.ct,
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'HIT',
      },
    });
  }

  // 2. Cache miss — fetch upstream.
  try {
    // Granicus appears to require its own Referer; S3 doesn't care, so
    // send a matching one when we recognize the host.
    const referer = u.startsWith('https://martinez.granicus.com/')
      ? 'https://martinez.granicus.com/'
      : undefined;
    const r = await fetch(u, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
        ...(referer ? { 'Referer': referer } : {}),
      },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!r.ok) {
      const snippet = (await r.text().catch(() => '')).slice(0, 200);
      return new NextResponse(`upstream HTTP ${r.status}: ${snippet}`, { status: 502 });
    }
    const ct = r.headers.get('content-type') ?? 'application/pdf';
    // Buffer the whole response so we can both cache it AND serve it.
    const arr = new Uint8Array(await r.arrayBuffer());

    // 3. Write back to cache if under size limit. Council minutes are
    //    usually 100KB-3MB; we skip anything larger to keep apis_json
    //    from bloating on rare oversized attachments.
    if (arr.byteLength <= MAX_CACHE_BYTES) {
      const b64 = Buffer.from(arr).toString('base64');
      const record: CachedPdf = { _ttlAt: Date.now() + PDF_TTL_MS, ct, b64 };
      upsertJson(cacheKey, record).catch((e) => {
        console.warn(`[council-pdf] cache write ${cacheKey} failed:`, e instanceof Error ? e.message : e);
      });
    }

    return new NextResponse(arr, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': arr.byteLength > MAX_CACHE_BYTES ? 'SKIP-TOO-LARGE' : 'MISS',
      },
    });
  } catch (e) {
    return new NextResponse(
      `fetch threw: ${e instanceof Error ? e.message : String(e)}`,
      { status: 502 },
    );
  }
}
