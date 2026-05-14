import { NextRequest, NextResponse } from 'next/server';
import { listOverlays, saveOverlay, type OverlayCorner } from '@/lib/overlays';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await listOverlays();
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string;
      name?: string;
      image_data?: string;
      mime_type?: string;
      corners?: OverlayCorner[];
      opacity?: number;
      mode?: string;
    };
    if (!body.id || !body.name || !body.image_data || !Array.isArray(body.corners)) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 });
    }
    await saveOverlay({
      id: body.id,
      name: body.name,
      image_data: body.image_data,
      mime_type: body.mime_type ?? 'image/png',
      corners: body.corners,
      opacity: body.opacity ?? 0.6,
      mode: body.mode ?? 'scale',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
