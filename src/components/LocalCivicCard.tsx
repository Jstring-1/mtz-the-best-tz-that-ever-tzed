import { getJson } from '@/lib/cache';
import type { GovLocalPayload, GovStripItem } from '@/lib/gov';
import RepDetail from './RepDetail';
import GrantsDetail from './GrantsDetail';
import CrimeDetail from './CrimeDetail';

// Local civic / economy card rendered in the weather column. Reads the
// gov_local cache that the 12h cron populates — fast load, no fetches.
// Rows with detail data (rep / grants / crime) are clickable buttons
// that open a modal.
export default async function LocalCivicCard() {
  let payload: GovLocalPayload | null = null;
  try { payload = await getJson<GovLocalPayload>('gov_local'); }
  catch (e) { console.warn('LocalCivicCard cache read failed:', e); }

  const items: GovStripItem[] = payload?.items ?? [];
  if (!items.length) return null;
  const grants = payload?.extras?.grants ?? [];

  return (
    <section className="card-section civic-card">
      <h2>Civic <span className="count">{items.length}</span></h2>
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
      </ul>
    </section>
  );
}
