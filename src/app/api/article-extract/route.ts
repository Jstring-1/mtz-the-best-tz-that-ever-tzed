import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractArticle } from '@/lib/article-extract';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// On-demand article body extraction for the News modal. The client
// passes the article URL; we fetch, run Mozilla Readability, and return
// a clean HTML excerpt. Results are cached server-side for 30 days.
//
// The endpoint is intentionally cautious about which URLs it'll touch:
// only http(s), no localhost / RFC1918 / IPv6 link-local, no file://.

const BLOCK_HOST_RE = /(^|\.)(localhost|local|internal)$|^(127\.|10\.|192\.168\.|169\.254\.|0\.)|^(::1|fe80:)/i;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')?.trim();
  if (!raw) {
    return NextResponse.json({ error: 'url query param required' }, { status: 400 });
  }
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { return NextResponse.json({ error: 'invalid url' }, { status: 400 }); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'only http(s) urls allowed' }, { status: 400 });
  }
  if (BLOCK_HOST_RE.test(parsed.hostname)) {
    return NextResponse.json({ error: 'blocked host' }, { status: 400 });
  }

  try {
    const article = await extractArticle(parsed.toString());
    if (!article) {
      return NextResponse.json(
        { empty: true, reason: 'Could not extract a readable article from this URL.' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(article, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  } catch (e) {
    console.warn('[article-extract] threw:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'extraction failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
