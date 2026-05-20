import { NextResponse } from 'next/server';
import { getJson } from '@/lib/cache';
import type { RepVotesPayload } from '@/lib/gov';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Rep we care about (CA-10 — Martinez). Hard-coded for now; update the
// bioguideId here if the seat changes.
const BIOGUIDE = 'D000623';

const KEY = process.env.GOV_API_TOKEN ?? '';

interface BillItem {
  number?: string;
  type?: string;
  congress?: number;
  title?: string;
  introducedDate?: string;
  latestAction?: { actionDate?: string; text?: string };
}

function billHumanUrl(b: BillItem): string {
  const cg = b.congress, t = (b.type ?? '').toLowerCase(), n = b.number;
  if (!cg || !t || !n) return `https://www.congress.gov/member/${BIOGUIDE}`;
  const seg = t === 'hr' ? 'house-bill'
    : t === 's' ? 'senate-bill'
    : t === 'hjres' ? 'house-joint-resolution'
    : t === 'sjres' ? 'senate-joint-resolution'
    : t === 'hres' ? 'house-resolution'
    : t === 'sres' ? 'senate-resolution'
    : 'house-bill';
  const suffix = cg === 1 ? 'st' : cg === 2 ? 'nd' : cg === 3 ? 'rd' : 'th';
  return `https://www.congress.gov/bill/${cg}${suffix}-congress/${seg}/${n}`;
}

interface MemberResp { member?: {
  directOrderName?: string;
  firstName?: string; lastName?: string;
  state?: string; district?: number;
  partyHistory?: Array<{ partyName?: string; partyAbbreviation?: string }>;
} }
interface LegResp { sponsoredLegislation?: BillItem[]; cosponsoredLegislation?: BillItem[]; pagination?: { count?: number } }

export async function GET() {
  if (!KEY) {
    return NextResponse.json({ error: 'GOV_API_TOKEN env var not set' }, { status: 500 });
  }
  const headers = { Accept: 'application/json', 'User-Agent': 'mtz.city/1.0' };
  const [memRes, spRes, csRes] = await Promise.allSettled([
    fetch(`https://api.congress.gov/v3/member/${BIOGUIDE}?api_key=${KEY}&format=json`, { headers, cache: 'no-store' }),
    fetch(`https://api.congress.gov/v3/member/${BIOGUIDE}/sponsored-legislation?api_key=${KEY}&format=json&limit=12`, { headers, cache: 'no-store' }),
    fetch(`https://api.congress.gov/v3/member/${BIOGUIDE}/cosponsored-legislation?api_key=${KEY}&format=json&limit=12`, { headers, cache: 'no-store' }),
  ]);
  async function pick<T>(p: PromiseSettledResult<Response>): Promise<T | null> {
    if (p.status !== 'fulfilled' || !p.value.ok) return null;
    try { return await p.value.json() as T; } catch { return null; }
  }
  const member = (await pick<MemberResp>(memRes))?.member ?? null;
  const spJson = await pick<LegResp>(spRes);
  const csJson = await pick<LegResp>(csRes);

  // Cached vote-by-vote positions (populated by the 4h `rep_votes` cron).
  let votesPayload: RepVotesPayload | null = null;
  try { votesPayload = await getJson<RepVotesPayload>('gov_rep_votes'); }
  catch { /* DB cold */ }
  const votes = votesPayload?.votes ?? [];

  const mapBill = (b: BillItem) => ({
    number: `${b.type ?? ''} ${b.number ?? ''}`.trim(),
    title: b.title ?? '(untitled)',
    introduced: b.introducedDate ?? '',
    latestAction: b.latestAction?.text ?? '',
    latestActionDate: b.latestAction?.actionDate ?? '',
    url: billHumanUrl(b),
  });

  return NextResponse.json({
    name: member?.directOrderName ?? 'Mark DeSaulnier',
    party: member?.partyHistory?.[member.partyHistory.length - 1]?.partyAbbreviation
        ?? member?.partyHistory?.[0]?.partyAbbreviation ?? '',
    state: member?.state ?? 'California',
    district: member?.district ?? 10,
    url: `https://www.congress.gov/member/mark-desaulnier/${BIOGUIDE}`,
    sponsored: (spJson?.sponsoredLegislation ?? []).slice(0, 12).map(mapBill),
    cosponsored: (csJson?.cosponsoredLegislation ?? []).slice(0, 12).map(mapBill),
    votes,
    votesScrapedAt: votesPayload?.scrapedAt ?? null,
  });
}
