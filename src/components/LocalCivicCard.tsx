import { getJson } from '@/lib/cache';
import type { GovLocalPayload, GovStripItem } from '@/lib/gov';
import type { CouncilScrapeResult } from '@/lib/scrape-council';
import RepDetail from './RepDetail';
import GrantsDetail from './GrantsDetail';
import CrimeDetail from './CrimeDetail';
import CouncilDetail from './CouncilDetail';

// Local civic / economy card rendered in the weather column. Reads the
// gov_local cache that the 12h cron populates — fast load, no fetches.
// Rows with detail data (rep / grants / crime) are clickable buttons
// that open a modal.
export default async function LocalCivicCard() {
  let payload: GovLocalPayload | null = null;
  let council: CouncilScrapeResult | null = null;
  try {
    [payload, council] = await Promise.all([
      getJson<GovLocalPayload>('gov_local').catch(() => null),
      getJson<CouncilScrapeResult>('gov_council_votes').catch(() => null),
    ]);
  } catch (e) { console.warn('LocalCivicCard cache read failed:', e); }

  const items: GovStripItem[] = payload?.items ?? [];
  if (!items.length && !council) return null;
  const grants = payload?.extras?.grants ?? [];

  // Council row summary (always shown when we have any cache).
  const councilCount = council?.meetings?.length ?? 0;
  const councilDate = council?.meetings?.[0]?.date ?? '';
  const councilLabelHtml =
    `<span class="civic-label">Council</span>` +
    `<span class="civic-val gold">${
      councilCount > 0
        ? `${councilCount} meetings${councilDate ? ` · ${councilDate}` : ''}`
        : '—'
    }</span>`;
  const councilTooltip = councilCount > 0
    ? `Martinez City Council meetings from Granicus — click to browse agendas & minutes (read in-page).`
    : 'Council meetings — no cache yet. Run /admin → 12h.';

  return (
    <section className="card-section civic-card">
      <h2>Civic <span className="count">{items.length + 1}</span></h2>
      <ul className="civic-list">
        {items.map((it) => {
          const labelHtml =
            `<span class="civic-label">${it.label}</span>` +
            `<span class="civic-val ${it.color ?? ''}">${it.value}</span>`;
          if (it.key === 'rep') {
            return <li key={it.key}><RepDetail tooltip={it.tooltip} label={labelHtml} /></li>;
          }
          if (it.key === 'grants') {
            return <li key={it.key}><GrantsDetail tooltip={it.tooltip} label={labelHtml} rows={grants} /></li>;
          }
          if (it.key === 'crime') {
            return <li key={it.key}><CrimeDetail tooltip={it.tooltip} label={labelHtml} /></li>;
          }
          // Static rows (unemployment, gas).
          const inner = (
            <>
              <span className="civic-label">{it.label}</span>
              <span className={`civic-val ${it.color ?? ''}`}>{it.value}</span>
            </>
          );
          return (
            <li key={it.key} title={it.tooltip}>
              {it.href
                ? <a href={it.href} target="_blank" rel="noopener" className="civic-row">{inner}</a>
                : <span className="civic-row">{inner}</span>}
            </li>
          );
        })}
        <li><CouncilDetail tooltip={councilTooltip} label={councilLabelHtml} /></li>
      </ul>
    </section>
  );
}
