import { getJson } from '@/lib/cache';
import type { GovLocalPayload, GovStripItem } from '@/lib/gov';

// Strip below the weather/forecast rows showing local civic/economy
// metrics. Pure cache read — the 12h cron populates `gov_local`.
export default async function GovStrip() {
  let payload: GovLocalPayload | null = null;
  try { payload = await getJson<GovLocalPayload>('gov_local'); }
  catch (e) { console.warn('GovStrip cache read failed:', e); }

  const items: GovStripItem[] = payload?.items ?? [];
  if (!items.length) return null;

  return (
    <section className="gov-strip" aria-label="Local civic data">
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="gov-label">{it.label}</span>{' '}
            <span className={it.color ?? ''}>{it.value}</span>
          </>
        );
        return (
          <span key={it.key} title={it.tooltip} className="gov-item">
            {i > 0 && <span className="gov-sep" aria-hidden> · </span>}
            {it.href
              ? <a href={it.href} target="_blank" rel="noopener">{inner}</a>
              : inner}
          </span>
        );
      })}
    </section>
  );
}
