import { NextResponse, type NextRequest } from 'next/server';
import { getJson, upsertJson } from '@/lib/cache';
import type { DiscoveryPayload } from '@/lib/places-discovery';

export const dynamic = 'force-dynamic';

// Hide / unhide an auto-detected place so it stops showing in the public
// Places popup. IP-gated by src/middleware.ts (/api/admin/*).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { id?: string; hide?: boolean } | null;
  if (!body?.id || typeof body.hide !== 'boolean') {
    return NextResponse.json({ error: 'Expected { id, hide }' }, { status: 400 });
  }
  const cur = await getJson<DiscoveryPayload>('places_discovery');
  if (!cur) return NextResponse.json({ error: 'No discovery payload yet — run the 12h bucket.' }, { status: 404 });
  const hidden = new Set(cur.hidden ?? []);
  if (body.hide) hidden.add(body.id); else hidden.delete(body.id);
  await upsertJson('places_discovery', { ...cur, hidden: [...hidden] });
  return NextResponse.json({ ok: true, hidden: [...hidden] });
}
