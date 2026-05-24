import { NextResponse } from 'next/server';
import { lazyCached, TTL } from '@/lib/lazy-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const KEY = process.env.GOV_API_TOKEN ?? '';

interface BillResp { bill?: {
  number?: string; type?: string; congress?: number;
  title?: string; titles?: Array<{ title?: string }>;
  introducedDate?: string;
  policyArea?: { name?: string };
  sponsors?: Array<{ fullName?: string; party?: string; state?: string }>;
  latestAction?: { actionDate?: string; text?: string };
  textVersions?: { url?: string };
} }
interface SummariesResp { summaries?: Array<{ actionDate?: string; actionDesc?: string; text?: string; updateDate?: string }> }
interface TextResp { textVersions?: Array<{ type?: string; date?: string; formats?: Array<{ url?: string; type?: string }> }> }

function billHumanUrl(cg: string, type: string, num: string): string {
  const t = type.toLowerCase();
  const seg = t === 'hr' ? 'house-bill'
    : t === 's' ? 'senate-bill'
    : t === 'hjres' ? 'house-joint-resolution'
    : t === 'sjres' ? 'senate-joint-resolution'
    : t === 'hres' ? 'house-resolution'
    : t === 'sres' ? 'senate-resolution'
    : 'house-bill';
  const n = Number(cg);
  const sfx = n % 100 >= 11 && n % 100 <= 13 ? 'th'
    : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `https://www.congress.gov/bill/${cg}${sfx}-congress/${seg}/${num}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cg = url.searchParams.get('congress');
  const type = (url.searchParams.get('type') ?? '').toLowerCase();
  const num = url.searchParams.get('number');
  if (!cg || !type || !num) {
    return NextResponse.json({ error: 'missing congress/type/number' }, { status: 400 });
  }
  if (!KEY) return NextResponse.json({ error: 'GOV_API_TOKEN not set' }, { status: 500 });

  // Cache the assembled bill detail in apis_json for 6h, keyed by
  // congress+type+number. The bill data only changes when Congress
  // takes a new action — 6h staleness is fine and saves three
  // Congress.gov API calls per popup-open.
  const cacheKey = `bill_${cg}_${type.toLowerCase()}_${num}`;
  const result = await lazyCached(cacheKey, TTL.HOURS_6, async () => {
    const headers = { Accept: 'application/json', 'User-Agent': 'mtz.city/1.0' };
    const base = `https://api.congress.gov/v3/bill/${cg}/${type}/${num}`;
    const [bRes, sRes, tRes] = await Promise.allSettled([
      fetch(`${base}?api_key=${KEY}&format=json`, { headers, cache: 'no-store' }),
      fetch(`${base}/summaries?api_key=${KEY}&format=json`, { headers, cache: 'no-store' }),
      fetch(`${base}/text?api_key=${KEY}&format=json`, { headers, cache: 'no-store' }),
    ]);
    async function pick<T>(p: PromiseSettledResult<Response>): Promise<T | null> {
      if (p.status !== 'fulfilled' || !p.value.ok) return null;
      try { return await p.value.json() as T; } catch { return null; }
    }
    const bill = (await pick<BillResp>(bRes))?.bill ?? null;
    const sums = (await pick<SummariesResp>(sRes))?.summaries ?? [];
    const texts = (await pick<TextResp>(tRes))?.textVersions ?? [];

    // Don't cache when the primary bill record came back empty — likely
    // a transient upstream issue, not a "bill doesn't exist" answer.
    if (!bill && sums.length === 0 && texts.length === 0) return null;

    // Latest summary by updateDate / actionDate.
    const latestSummary = [...sums].sort((a, b) =>
      (b.updateDate ?? b.actionDate ?? '').localeCompare(a.updateDate ?? a.actionDate ?? '')
    )[0];

    // Latest text version: prefer HTML/Formatted XML.
    const latestText = [...texts].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
    const html = latestText?.formats?.find((f) => /html|formatted/i.test(f.type ?? ''))?.url;
    const pdf = latestText?.formats?.find((f) => /pdf/i.test(f.type ?? ''))?.url;

    return {
      number: `${(bill?.type ?? type).toUpperCase()} ${bill?.number ?? num}`,
      title: bill?.title ?? bill?.titles?.[0]?.title ?? `${type.toUpperCase()} ${num}`,
      congress: Number(cg),
      policyArea: bill?.policyArea?.name ?? '',
      introducedDate: bill?.introducedDate ?? '',
      sponsor: bill?.sponsors?.[0]
        ? `${bill.sponsors[0].fullName ?? ''}${bill.sponsors[0].party ? ` (${bill.sponsors[0].party}-${bill.sponsors[0].state ?? ''})` : ''}`
        : '',
      latestAction: bill?.latestAction?.text ?? '',
      latestActionDate: bill?.latestAction?.actionDate ?? '',
      summaryHtml: latestSummary?.text ?? '',
      summaryDate: latestSummary?.updateDate ?? latestSummary?.actionDate ?? '',
      textHtmlUrl: html ?? '',
      textPdfUrl: pdf ?? '',
      congressUrl: billHumanUrl(cg, type, num),
    };
  });

  if (!result) {
    return NextResponse.json({ error: 'Congress.gov returned empty for this bill' }, { status: 404 });
  }
  return NextResponse.json(result.data, {
    headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
  });
}
