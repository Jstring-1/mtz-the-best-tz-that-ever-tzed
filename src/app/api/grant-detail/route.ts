import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { lazyCached, TTL } from '@/lib/lazy-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// USAspending exposes per-award detail at /api/v2/awards/{id} where
// {id} is the `generated_internal_id` returned by spending_by_award.
// The response is verbose; we pick out the useful bits for a popup.

interface UsaSpendingAward {
  generated_unique_award_id?: string;
  description?: string;
  total_obligation?: number;
  total_outlay?: number;
  type_description?: string;
  category?: string;
  base_and_all_options_value?: number;
  period_of_performance?: { start_date?: string; end_date?: string; potential_end_date?: string };
  recipient?: {
    recipient_name?: string;
    business_categories?: string[];
    location?: {
      address_line1?: string; city_name?: string; state_code?: string;
      zip5?: string; country_name?: string;
    };
  };
  awarding_agency?: {
    toptier_agency?: { name?: string; abbreviation?: string };
    subtier_agency?: { name?: string };
  };
  funding_agency?: {
    toptier_agency?: { name?: string };
    subtier_agency?: { name?: string };
  };
  cfda_info?: Array<{ cfda_number?: string; cfda_title?: string; cfda_objectives?: string }>;
  executive_details?: { officers?: Array<{ name?: string; amount?: number }> };
  place_of_performance?: { city_name?: string; state_code?: string; zip5?: string };
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  // USAspending award IDs are long, so hash to keep the apis_json key
  // bounded. Awards are mostly static once made — 7-day TTL is fine.
  const cacheKey = `grant_${createHash('sha1').update(id).digest('hex').slice(0, 16)}`;
  const result = await lazyCached(cacheKey, TTL.DAYS_7, async () => {
    const url = `https://api.usaspending.gov/api/v2/awards/${encodeURIComponent(id)}/`;
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'mtz.city/1.0' },
        cache: 'no-store',
      });
      if (!r.ok) return null;
      const j = await r.json() as UsaSpendingAward;
      return {
        amount: j.total_obligation ?? j.base_and_all_options_value ?? 0,
        outlay: j.total_outlay ?? 0,
        typeLabel: j.type_description ?? '',
        category: j.category ?? '',
        description: j.description ?? '',
        periodStart: j.period_of_performance?.start_date ?? '',
        periodEnd: j.period_of_performance?.end_date ?? j.period_of_performance?.potential_end_date ?? '',
        recipientName: j.recipient?.recipient_name ?? '',
        recipientLocation: [
          j.recipient?.location?.address_line1,
          j.recipient?.location?.city_name,
          j.recipient?.location?.state_code,
          j.recipient?.location?.zip5,
        ].filter(Boolean).join(', '),
        recipientCategories: j.recipient?.business_categories ?? [],
        awardingAgency: [
          j.awarding_agency?.toptier_agency?.name,
          j.awarding_agency?.subtier_agency?.name,
        ].filter(Boolean).join(' — '),
        fundingAgency: [
          j.funding_agency?.toptier_agency?.name,
          j.funding_agency?.subtier_agency?.name,
        ].filter(Boolean).join(' — '),
        cfda: (j.cfda_info ?? []).map((c) => ({
          number: c.cfda_number ?? '', title: c.cfda_title ?? '', objectives: c.cfda_objectives ?? '',
        })),
        executiveOfficers: (j.executive_details?.officers ?? [])
          .filter((o) => o.name).slice(0, 5),
        placeOfPerformance: [
          j.place_of_performance?.city_name,
          j.place_of_performance?.state_code,
          j.place_of_performance?.zip5,
        ].filter(Boolean).join(', '),
        usaSpendingUrl: `https://www.usaspending.gov/award/${encodeURIComponent(id)}/`,
      };
    } catch (e) {
      console.warn('[grant-detail] fetch threw:', e instanceof Error ? e.message : e);
      return null;
    }
  });

  if (!result) {
    return NextResponse.json({ error: 'USAspending returned empty / unreachable' }, { status: 502 });
  }
  return NextResponse.json(result.data, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
