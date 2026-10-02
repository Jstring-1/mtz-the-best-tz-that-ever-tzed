import { NextResponse } from 'next/server';
import { listAvailablePets } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Adoptable-pet list for the nav popup (loaded on first open, not with the
// home page).
export async function GET() {
  const pets = await listAvailablePets().catch(() => []);
  return NextResponse.json(pets, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
