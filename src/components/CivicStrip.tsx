import { getJson, getPlaces } from '@/lib/cache';
import { listRecentBirds, listRecentQuakes, type StoredBird, type StoredQuake } from '@/lib/store';
import type { PlaceRow } from '@/lib/types';
import type { GovLocalPayload, GovNationalPayload, GovStripItem } from '@/lib/gov';
import type { CouncilScrapeResult } from '@/lib/scrape-council';
import BillsDetail from './BillsDetail';
import GrantsDetail from './GrantsDetail';
import CrimeDetail from './CrimeDetail';
import CouncilDetail from './CouncilDetail';
import RepsDetail from './RepsDetail';
import RecallsDetail from './RecallsDetail';
import EconomyDetail from './EconomyDetail';
import FemaDetail from './FemaDetail';
import EonetDetail from './EonetDetail';
import ParksDetail from './ParksDetail';
import PlacesDetail from './PlacesDetail';
import CodeDetail from './CodeDetail';
import BirdsDetail from './BirdsDetail';
import QuakesDetail from './QuakesDetail';
import OutbreaksDetail from './OutbreaksDetail';
import type { OutbreaksPayload } from '@/lib/outbreaks';
import CchDetail from './CchDetail';
import type { CchPayload } from '@/lib/cch';
import TrainsDetail from './TrainsDetail';
import type { TrainsPayload } from '@/lib/trains';
import HousingDetail from './HousingDetail';
import type { HousingPayload } from '@/lib/housing';

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
  let birds: StoredBird[] = [];
  let quakes: StoredQuake[] = [];
  let places: PlaceRow[] = [];
  let outbreaks: OutbreaksPayload | null = null;
  let cch: CchPayload | null = null;
  let trains: TrainsPayload | null = null;
  let housing: HousingPayload | null = null;
  try {
    [payload, council, national, stocks, birds, quakes, places, outbreaks, cch, trains, housing] = await Promise.all([
      getJson<GovLocalPayload>('gov_local').catch(() => null),
      getJson<CouncilScrapeResult>('gov_council_votes').catch(() => null),
      getJson<GovNationalPayload>('gov_national').catch(() => null),
      getJson<Record<string, unknown>>('12D_stocks').catch(() => null),
      // listRecentBirds already deduplicates by common_name via
      // DISTINCT ON, returning newest first.
      listRecentBirds(80).catch(() => []),
      // Significant CA quakes (USGS significant_month feed), newest first.
      listRecentQuakes(40).catch(() => []),
      // Foursquare-fed places table, nearest-first.
      getPlaces().catch(() => []),
      // Disease surveillance bundle (disease.sh / CDC outbreak pages / Delphi / WHO DON).
      getJson<OutbreaksPayload>('outbreaks').catch(() => null),
      // Contra Costa Health — CCRMC scorecards + CCHS reference links.
      getJson<CchPayload>('cch_health').catch(() => null),
      // Amtrak MTZ train arrivals + departures (railrat.net scrape).
      getJson<TrainsPayload>('trains_mtz').catch(() => null),
      // Martinez housing — Zillow ZORI rent + Census ACS ZIP 94553.
      getJson<HousingPayload>('housing').catch(() => null),
    ]);
  } catch (e) { console.warn('CivicStrip cache read failed:', e); }

  const items: GovStripItem[] = payload?.items ?? [];
  if (!items.length && !council) return null;

  const grants = payload?.extras?.grants ?? [];
  const funding = payload?.extras?.funding ?? {};
  const fundingSources = payload?.extras?.fundingSources ?? [];
  // Gas price flows into the Economy popup now (Unemployment lives
  // there too, sourced from gov_national). Both used to be civic-bar
  // chips of their own; both were redundant with the Economy popup.
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
  // Recent bird sightings (eBird) — deduped to unique species, newest first.
  const birdsLabelHtml = `<span class="civic-strip-val dodger">Birds</span>`;
  const birdsTooltip = birds.length
    ? `${birds.length} unique species recently reported in the Martinez radius (eBird).`
    : 'Bird sightings — cache empty. Run /admin → 1h.';
  // Significant California earthquakes — pinned on a Leaflet map.
  const quakesLabelHtml = `<span class="civic-strip-val red">Quakes</span>`;
  const quakesTooltip = quakes.length
    ? `${quakes.length} significant CA earthquakes cached (USGS significant_month).`
    : 'CA earthquakes — cache empty. Run /admin → 1h.';
  // Foursquare-cached places (restaurants, shops, landmarks).
  const placesLabelHtml = `<span class="civic-strip-val peru">Places</span>`;
  const placesTooltip = places.length
    ? `${places.length} cached Foursquare places near Martinez — click for map + list.`
    : 'Places — cache empty. Run /admin → 12h.';
  // Disease surveillance — disease.sh + CDC + Delphi + WHO DON layered.
  const outbreaksLabelHtml = `<span class="civic-strip-val red">Outbreaks</span>`;
  const outbreaksTooltip = outbreaks
    ? `Disease surveillance: ${outbreaks.cdcFood.length} CDC outbreaks, ${outbreaks.flu.length} flu signals, ${outbreaks.whoDon.length} WHO DON items.`
    : 'Outbreaks — cache empty. Run /admin → 4h.';
  // Contra Costa Health — county hospital scorecards + CCHS docs.
  const cchLabelHtml = `<span class="civic-strip-val green">CCH</span>`;
  const cchTooltip = cch?.general?.overallRating
    ? `CCRMC CMS overall rating: ${cch.general.overallRating}/5 ★. Click for scorecards + CCHS docs.`
    : 'Contra Costa Health — CCRMC scorecards (CMS Hospital Compare) + reference docs.';
  // Amtrak — MTZ arrivals + departures (railrat.net, refreshed 15min).
  const trainsLabelHtml = `<span class="civic-strip-val dodger">Trains</span>`;
  const trainsTooltip = trains
    ? `Amtrak MTZ — ${trains.arriving.length} arriving, ${trains.departed.length} departed${trains.lastUpdated ? ` (upstream ${trains.lastUpdated})` : ''}.`
    : 'Amtrak — Martinez arrivals & departures. Cache empty. Run /admin → 15m.';
  // Martinez housing — Zillow ZORI rent + Census ACS ZIP 94553.
  const housingLabelHtml = `<span class="civic-strip-val peru">Housing</span>`;
  const housingTooltip = housing?.zillow?.currentRent
    ? `Martinez typical rent: $${Math.round(housing.zillow.currentRent).toLocaleString()}/mo (Zillow ZORI). Click for more.`
    : 'Martinez housing — rent index + median home value. Cache empty. Run /admin → 1d.';
  const councilTooltip = councilCount > 0
    ? `Martinez City Council — ${councilCount} cached meetings${councilDate ? ` (latest ${councilDate})` : ''}. Click to browse agendas & minutes (read in-page).`
    : 'Council meetings — no cache yet. Run /admin → 12h.';

  // Helpers — look up each gov_local items[] entry by key, render the
  // matching detail component. Returning null when the cache is empty
  // (cron hasn't run yet) keeps the strip from blowing up.
  const byKey = (key: string): GovStripItem | undefined => items.find((it) => it.key === key);
  const valHtmlFor = (it: GovStripItem): string =>
    `<span class="civic-strip-val ${it.color ?? ''}">${it.value}</span>`;

  const fundingChip = () => {
    const it = byKey('grants');
    return it ? (
      <GrantsDetail tooltip={it.tooltip} label={valHtmlFor(it)}
        rows={grants} sources={fundingSources} data={funding} />
    ) : null;
  };
  const billsChip = () => {
    const it = byKey('rep');
    return it ? <BillsDetail tooltip={it.tooltip} label={valHtmlFor(it)} /> : null;
  };
  const crimeChip = () => {
    const it = byKey('crime');
    return it ? <CrimeDetail tooltip={it.tooltip} label={valHtmlFor(it)} /> : null;
  };

  // Civic-strip ordering (user-specified):
  //   Parks · Places · Trains · Birds · Council · Code · Funding · Bills ·
  //   Reps · Crime · CCH · Economy · Recalls · Outbreaks · FEMA · EONET · Quakes
  // Trains sits next to Places — both are "what's around right now"
  // local items. CCH stays next to Crime in the local civic-services
  // cluster. Unemployment + Gas were removed from the strip — both
  // live inside the Economy popup now.
  return (
    <section className="civic-strip" aria-label="Civic indicators">
      <ParksDetail   tooltip={parksTooltip}   label={parksLabelHtml} />
      <PlacesDetail  tooltip={placesTooltip}  label={placesLabelHtml} data={places} />
      <TrainsDetail  tooltip={trainsTooltip}  label={trainsLabelHtml}  data={trains} />
      <BirdsDetail   tooltip={birdsTooltip}   label={birdsLabelHtml} data={birds} />
      <CouncilDetail tooltip={councilTooltip} label={councilLabelHtml} />
      <CodeDetail    tooltip={codeTooltip}    label={codeLabelHtml} />
      {fundingChip()}
      {billsChip()}
      <RepsDetail    tooltip={repsTooltip}    label={repsLabelHtml} />
      {crimeChip()}
      <CchDetail     tooltip={cchTooltip}     label={cchLabelHtml}     data={cch} />
      <HousingDetail tooltip={housingTooltip} label={housingLabelHtml} data={housing} />
      <EconomyDetail
        tooltip={economyTooltip}
        label={economyLabelHtml}
        data={economyData}
        stocks={stocks as Parameters<typeof EconomyDetail>[0]['stocks']}
        gas={gasData}
      />
      <RecallsDetail
        tooltip={recallsTooltip}
        label={recallsLabelHtml}
        data={recallsList}
        scrapedAt={national?.scrapedAt}
      />
      <OutbreaksDetail tooltip={outbreaksTooltip} label={outbreaksLabelHtml} data={outbreaks} />
      <FemaDetail    tooltip={femaTooltip}    label={femaLabelHtml}    data={femaList} />
      <EonetDetail   tooltip={eonetTooltip}   label={eonetLabelHtml}   data={eonetList} />
      <QuakesDetail  tooltip={quakesTooltip}  label={quakesLabelHtml}  data={quakes} />
    </section>
  );
}
