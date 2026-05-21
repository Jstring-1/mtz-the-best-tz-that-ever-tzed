import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { upsertJson } from '@/lib/cache';
import { parseCompCsv } from '@/lib/comp';
import type { CompPayload } from '@/lib/comp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Manual one-shot import of a GccExport-*.csv. POST the raw CSV body
// (Content-Type doesn't matter) with optional ?year=YYYY. Stores in
// apis_json under 'ccc_comp' just like the cron would.
//
// Use this when the live gcc.sco.ca.gov URL variants don't resolve
// from Railway's egress and you have the file downloaded already.

export async function POST(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year') ?? '0') || new Date().getUTCFullYear() - 1;
  const csv = await req.text();
  if (!csv || csv.length < 200) {
    return NextResponse.json({ error: 'Body must be a CSV — paste the file contents.' }, { status: 400 });
  }
  if (!/position/i.test(csv) || !/totalwages/i.test(csv.replace(/\s+/g, ''))) {
    return NextResponse.json({
      error: "CSV doesn't look like a GCC export — missing Position or TotalWages headers.",
    }, { status: 400 });
  }
  const rows = parseCompCsv(csv);
  if (rows.length < 10) {
    return NextResponse.json({ error: `Parsed only ${rows.length} rows — likely a header/format mismatch.` }, { status: 400 });
  }
  let wages = 0, retirementAndHealth = 0;
  for (const r of rows) {
    wages += r.totalWages;
    retirementAndHealth += r.totalCompensation - r.totalWages;
  }
  const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort();
  const payload: CompPayload = {
    scrapedAt: new Date().toISOString(),
    year,
    entity: 'Contra Costa County',
    sourceUrl: 'manual upload via /api/admin/import-comp',
    rows,
    departments,
    totals: {
      employees: rows.length,
      totalWages: wages,
      totalRetirementAndHealth: retirementAndHealth,
      grandTotal: wages + retirementAndHealth,
    },
  };
  await upsertJson('ccc_comp', payload);
  return NextResponse.json({
    ok: true,
    year,
    rows: rows.length,
    departments: departments.length,
    totalWages: wages,
    totalRetirementAndHealth: retirementAndHealth,
    grandTotal: wages + retirementAndHealth,
  });
}
