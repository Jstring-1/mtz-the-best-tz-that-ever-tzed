import { NextRequest, NextResponse } from 'next/server';
import { getOverlay, deleteOverlay } from '@/lib/overlays';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rec = await getOverlay(id);
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rec);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteOverlay(id);
  return NextResponse.json({ ok: true });
}
