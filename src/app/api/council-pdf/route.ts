import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Allow-list — we only proxy Martinez Granicus URLs.
const ALLOW_PREFIXES = ['https://martinez.granicus.com/'];

// Server-side proxy for Granicus minutes/agenda PDFs. Lets the browser
// embed the document in a same-origin iframe (no CORS / X-Frame issue)
// AND lets us add the Accept/Referer headers Granicus seems to want.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return new NextResponse('missing ?u=', { status: 400 });
  if (!ALLOW_PREFIXES.some((p) => u.startsWith(p))) {
    return new NextResponse('disallowed host', { status: 400 });
  }
  try {
    const r = await fetch(u, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
        'Referer': 'https://martinez.granicus.com/',
      },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!r.ok || !r.body) {
      const snippet = (await r.text().catch(() => '')).slice(0, 200);
      return new NextResponse(`upstream HTTP ${r.status}: ${snippet}`, { status: 502 });
    }
    const ct = r.headers.get('content-type') ?? 'application/pdf';
    return new NextResponse(r.body, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (e) {
    return new NextResponse(
      `fetch threw: ${e instanceof Error ? e.message : String(e)}`,
      { status: 502 },
    );
  }
}
