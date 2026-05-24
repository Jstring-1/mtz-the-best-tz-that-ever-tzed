import { getJson } from '@/lib/cache';
import type { GovLocalPayload, GovNationalPayload, GovStripItem } from '@/lib/gov';
import type { CouncilScrapeResult } from '@/lib/scrape-council';
import BillsDetail from './BillsDetail';
import GrantsDetail from './GrantsDetail';
import CrimeDetail from './CrimeDetail';
import CouncilDetail from './CouncilDetail';
import RepsDetail from './RepsDetail';
import UnempDetail from './UnempDetail';
import GasDetail from './GasDetail';
import RecallsDetail from './RecallsDetail';
import EconomyDetail from './EconomyDetail';
import FemaDetail from './FemaDetail';
import EonetDetail from './EonetDetail';
import ParksDetail from './ParksDetail';
import CodeDetail from './CodeDetail';

// Third top strip — sits under WeatherStrip + wx-row-2. Renders the
// civic indicators (unemployment, gas, funding total, rep, crime,
// council) inline with no labels. Each interactive value opens the
// same popup the old Civic card had, and the tooltip survives via the
// detail components' `tooltip` prop.
export default async function CivicStrip() {
  let payload: GovLocalPayload | null = null;
  let council: CouncilScrapeResult | null = null;
  let national: GovNationalPayload | null = null;
  let stocks: Record<string, unknown> | null = null;
  try {
    [payload, council, national, stocks] = await Promise.all([
      getJson<GovLocalPayload>('gov_local').catch(() => null),
      getJson<CouncilScrapeResult>('gov_council_votes').catch(() => null),
      getJson<GovNationalPayload>('gov_national').catch(() => null),
      getJson<Record<string, unknown>>('12D_stocks').catch(() => null),
    ]);
  } catch (e) { console.warn('CivicStrip cache read failed:', e); }

  const items: GovStripItem[] = payload?.items ?? [];
  if (!items.length && !council) return null;

  const grants = payload?.extras?.grants ?? [];
  const funding = payload?.extras?.funding ?? {};
  const fundingSources = payload?.extras?.fundingSources ?? [];
  const unempData = payload?.extras?.unemp ?? null;
  const gasData = payload?.extras?.gas ?? null;

  // Council slot — value-only label. Count + date moved to the tooltip
  // to keep the strip uncluttered.
  const councilCount = council?.meetings?.length ?? 0;
  const councilDate = council?.meetings?.[0]?.date ?? '';
  const councilLabelHtml = `<span class="civic-strip-val gold">Council</span>`;
  const repsLabelHtml = `<span class="civic-strip-val dodger">Reps</span>`;
  const repsTooltip = 'Your elected representatives — Martinez Council & Mayor → CCC Board of Supervisors → CA Assembly/Senate → Statewide officers → U.S. Congress → White House.';
  const recallsList = national?.recalls ?? [];
  const recallsLabelHtml = `<span class="civic-strip-val red">Recalls</span>`;
  const recallsTooltip = recallsList.length
    ? `${recallsList.length} active nationwide recalls (FDA food/drug/device + CPSC) — click to browse.`
    : 'Nationwide recalls (FDA + CPSC) — cache empty. Run /admin → 4h.';
  // U.S. economy snapshot — debt + yields + unemployment + CPI.
  const economyData = national?.economy ?? null;
  const economyLabelHtml = `<span class="civic-strip-val green">Economy</span>`;
  const economyTooltip = economyData?.debt
    ? `U.S. federal debt ${economyData.debt.total} (${economyData.debt.date}); click for yields + unemp + CPI.`
    : 'U.S. economy snapshot — cache empty. Run /admin → 4h.';
  // FEMA active disaster declarations nationwide.
  const femaList = national?.disasters?.fema ?? [];
  const femaLabelHtml = `<span class="civic-strip-val red">FEMA</span>`;
  const femaTooltip = femaList.length
    ? `${femaList.length} active FEMA disaster declarations — click to browse.`
    : 'FEMA active disaster declarations — cache empty. Run /admin → 4h.';
  // NASA EONET — open natural events (wildfires, storms, volcanoes...).
  const eonetList = national?.disasters?.eonet ?? [];
  const eonetLabelHtml = `<span class="civic-strip-val peru">EONET</span>`;
  const eonetTooltip = eonetList.length
    ? `${eonetList.length} active NASA EONET natural events — click to browse.`
    : 'NASA EONET natural events — cache empty. Run /admin → 4h.';
  // Martinez parks — static registry (src/lib/parks-data.ts). ParksDetail
  // pulls from it directly so we don't need to pass a `data` prop.
  const parksLabelHtml = `<span class="civic-strip-val green">Parks</span>`;
  const parksTooltip = 'Martinez parks — click for address and map link.';
  // Martinez Municipal Code — bundled PDF, displayed in-site via iframe.
  const codeLabelHtml = `<span class="civic-strip-val gold">Code</span>`;
  const codeTooltip = 'Martinez Municipal Code (68 pages, PDF) — click to read in-site.';
  const councilTooltip = councilCount > 0
    ? `Martinez City Council — ${councilCount} cached meetings${councilDate ? ` (latest ${councilDate})` : ''}. Click to browse agendas & minutes (read in-page).`
    : 'Council meetings — no cache yet. Run /admin → 12h.';

  // Defensive normalization: across cron generations the unemployment
  // value has shipped in multiple shapes — "CC 4.4/CA 5.1/US 3.8",
  // "CC 4.4%/CA 5.1%/US 3.8%", "4.4%%" (double %), and "4.4%". Strip
  // any "CC ..." prefix, find the first numeric run, and append exactly
  // one "%" so the strip always reads "4.4%" no matter what's cached.
  const displayValue = (it: GovStripItem): string => {
    if (it.key !== 'unemp') return it.value;
    if (it.value === '—') return it.value;
    // Prefer the CC number when present; otherwise the first number in
    // the string (covers the new short-format shape).
    const ccMatch = it.value.match(/CC\s*([\d.]+)/i);
    const num = ccMatch ? ccMatch[1] : it.value.match(/[\d.]+/)?.[0];
    return num ? `${num}%` : it.value;
  };

  return (
    <section className="civic-strip" aria-label="Civic indicators">
      {items.map((it) => {
        const shown = displayValue(it);
        const valHtml = `<span class="civic-strip-val ${it.color ?? ''}">${shown}</span>`;
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
        if (it.key === 'unemp')  return <UnempDetail key={it.key} tooltip={it.tooltip} label={valHtml} data={unempData} />;
        if (it.key === 'gas')    return <GasDetail   key={it.key} tooltip={it.tooltip} label={valHtml} data={gasData}   />;
        // Any other static items — non-interactive text with tooltip.
        const inner = <span className={`civic-strip-val ${it.color ?? ''}`}>{shown}</span>;
        return (
          <span key={it.key} className="civic-strip-item" title={it.tooltip}>
            {it.href ? <a href={it.href} target="_blank" rel="noopener">{inner}</a> : inner}
          </span>
        );
      })}
      <RecallsDetail
        tooltip={recallsTooltip}
        label={recallsLabelHtml}
        data={recallsList}
        scrapedAt={national?.scrapedAt}
      />
      <EconomyDetail
        tooltip={economyTooltip}
        label={economyLabelHtml}
        data={economyData}
        stocks={stocks as Parameters<typeof EconomyDetail>[0]['stocks']}
      />
      <FemaDetail    tooltip={femaTooltip}    label={femaLabelHtml}    data={femaList} />
      <EonetDetail   tooltip={eonetTooltip}   label={eonetLabelHtml}   data={eonetList} />
      <CouncilDetail tooltip={councilTooltip} label={councilLabelHtml} />
      <RepsDetail    tooltip={repsTooltip}    label={repsLabelHtml} />
      <ParksDetail   tooltip={parksTooltip}   label={parksLabelHtml} />
      <CodeDetail    tooltip={codeTooltip}    label={codeLabelHtml} />
    </section>
  );
}
