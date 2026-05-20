import { getJson } from '@/lib/cache';
import type { GovLocalPayload, GovStripItem } from '@/lib/gov';
import RepDetail from './RepDetail';

// Local civic / economy card rendered in the weather column. Reads the
// gov_local cache that the 12h cron populates.
export default async function LocalCivicCard() {
  let payload: GovLocalPayload | null = null;
  try { payload = await getJson<GovLocalPayload>('gov_local'); }
  catch (e) { console.warn('LocalCivicCard cache read failed:', e); }

  const items: GovStripItem[] = payload?.items ?? [];
  if (!items.length) return null;

  return (
    <section className="card-section civic-card">
      <h2>Civic <span className="count">{items.length}</span></h2>
      <ul className="civic-list">
        {items.map((it) => {
          const value = (
            <>
              <span className="civic-label">{it.label}</span>
              <span className={`civic-val ${it.color ?? ''}`}>{it.value}</span>
            </>
          );
          if (it.key === 'rep') {
            // Clickable — opens a modal with sponsored / cosponsored
            // bills + a link to the full Congress.gov record.
            return (
              <li key={it.key}>
                <RepDetail
                  tooltip={it.tooltip}
                  label={`<span class="civic-label">${it.label}</span><span class="civic-val ${it.color ?? ''}">${it.value}</span>`}
                />
              </li>
            );
          }
          return (
            <li key={it.key} title={it.tooltip}>
              {it.href
                ? <a href={it.href} target="_blank" rel="noopener" className="civic-row">{value}</a>
                : <span className="civic-row">{value}</span>}
            </li>
          );
        })}
      </ul>
      <a
        className="civic-tsa"
        href="https://www.tsa.gov/travel/security-screening/airport"
        target="_blank"
        rel="noopener"
        title="There's no public real-time TSA wait-time API — this links to TSA.gov's airport list."
      >TSA wait times (live, off-site) →</a>
    </section>
  );
}
