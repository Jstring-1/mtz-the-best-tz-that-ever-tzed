import { getJson } from '@/lib/cache';
import type { GovLocalPayload, GovStripItem } from '@/lib/gov';
import type { CouncilScrapeResult } from '@/lib/scrape-council';
import BillsDetail from './BillsDetail';
import GrantsDetail from './GrantsDetail';
import CrimeDetail from './CrimeDetail';
import CouncilDetail from './CouncilDetail';

// Third top strip — sits under WeatherStrip + wx-row-2. Renders the
// civic indicators (unemployment, gas, funding total, rep, crime,
// council) inline with no labels. Each interactive value opens the
// same popup the old Civic card had, and the tooltip survives via the
// detail components' `tooltip` prop.
export default async function CivicStrip() {
  let payload: GovLocalPayload | null = null;
  let council: CouncilScrapeResult | null = null;
  try {
    [payload, council] = await Promise.all([
      getJson<GovLocalPayload>('gov_local').catch(() => null),
      getJson<CouncilScrapeResult>('gov_council_votes').catch(() => null),
    ]);
  } catch (e) { console.warn('CivicStrip cache read failed:', e); }

  const items: GovStripItem[] = payload?.items ?? [];
  if (!items.length && !council) return null;

  const grants = payload?.extras?.grants ?? [];
  const funding = payload?.extras?.funding ?? {};
  const fundingSources = payload?.extras?.fundingSources ?? [];

  // Council slot — value-only label. Count + date moved to the tooltip
  // to keep the strip uncluttered.
  const councilCount = council?.meetings?.length ?? 0;
  const councilDate = council?.meetings?.[0]?.date ?? '';
  const councilLabelHtml = `<span class="civic-strip-val gold">City Council</span>`;
  const councilTooltip = councilCount > 0
    ? `Martinez City Council — ${councilCount} cached meetings${councilDate ? ` (latest ${councilDate})` : ''}. Click to browse agendas & minutes (read in-page).`
    : 'Council meetings — no cache yet. Run /admin → 12h.';

  return (
    <section className="civic-strip" aria-label="Civic indicators">
      {items.map((it) => {
        const valHtml = `<span class="civic-strip-val ${it.color ?? ''}">${it.value}</span>`;
        if (it.key === 'rep')    return <BillsDetail key={it.key} tooltip={it.tooltip} label={valHtml} />;
        if (it.key === 'grants') return (
          <GrantsDetail
            key={it.key}
            tooltip={it.tooltip}
            label={valHtml}
            rows={grants}
            sources={fundingSources}
            data={funding}
          />
        );
        if (it.key === 'crime')  return <CrimeDetail key={it.key} tooltip={it.tooltip} label={valHtml} />;
        // Static items (unemployment, gas) — non-interactive, just text
        // with a tooltip; optionally wrapped in a link.
        const inner = <span className={`civic-strip-val ${it.color ?? ''}`}>{it.value}</span>;
        return (
          <span key={it.key} className="civic-strip-item" title={it.tooltip}>
            {it.href ? <a href={it.href} target="_blank" rel="noopener">{inner}</a> : inner}
          </span>
        );
      })}
      <CouncilDetail tooltip={councilTooltip} label={councilLabelHtml} />
    </section>
  );
}
