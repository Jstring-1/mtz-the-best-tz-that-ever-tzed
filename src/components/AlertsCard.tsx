'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import type { NoaaAlert } from '@/lib/types';
import type { HazardGroup, HazardClear } from '@/lib/hazards';
import { useUrlString } from '@/lib/useUrlState';

function fmtEpoch(sec?: number, tz = 'America/Los_Angeles'): string {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleString('en-US', {
    timeZone: tz, month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// "Thu 8:00 PM" for anything inside the next few days, full date beyond.
function fmtUntil(sec: number, tz: string): string {
  const far = sec - Date.now() / 1000 > 5 * 86400;
  return new Date(sec * 1000).toLocaleString('en-US', far
    ? { timeZone: tz, month: 'short', day: 'numeric' }
    : { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

const SEV_RANK: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };

// NWS issues one alert per zone group, so a single heat wave shows up as
// a dozen near-identical "Extreme Heat Warning" rows. Fold them into one
// row per event, and fold identical texts inside the popup.
interface AlertGroup {
  key: string;
  event: string;
  alerts: NoaaAlert[];
  areas: string[];
  until?: number;
  headline?: string;
  severity?: string;
}

function areasOf(a: NoaaAlert): string[] {
  return (a.areaDesc ?? '').split(';').map((s) => s.trim()).filter(Boolean);
}

function groupAlerts(alerts: NoaaAlert[]): AlertGroup[] {
  const by = new Map<string, AlertGroup>();
  for (const a of alerts) {
    const event = a.event ?? 'Alert';
    const key = event;
    let g = by.get(key);
    if (!g) {
      g = { key, event, alerts: [], areas: [], severity: a.severity ?? undefined, headline: a.NWSheadline ?? undefined };
      by.set(key, g);
    }
    g.alerts.push(a);
    for (const ar of areasOf(a)) if (!g.areas.includes(ar)) g.areas.push(ar);
    const exp = a.expires ? Number(a.expires) : 0;
    if (exp && (!g.until || exp > g.until)) g.until = exp;
    if (!g.headline && a.NWSheadline) g.headline = a.NWSheadline;
  }
  return [...by.values()].sort((x, y) =>
    (SEV_RANK[x.severity ?? ''] ?? 9) - (SEV_RANK[y.severity ?? ''] ?? 9) || x.event.localeCompare(y.event));
}

// Within a group, alerts with the same text are one message sent to many
// zones — show the text once with all of its areas.
interface AlertBucket { headline?: string; description?: string; areas: string[]; alert: NoaaAlert; until?: number }

function bucketize(g: AlertGroup): AlertBucket[] {
  const by = new Map<string, AlertBucket>();
  for (const a of g.alerts) {
    const k = `${a.NWSheadline ?? ''}\u0000${a.description ?? ''}`;
    let b = by.get(k);
    if (!b) {
      b = { headline: a.NWSheadline ?? undefined, description: a.description ?? undefined, areas: [], alert: a };
      by.set(k, b);
    }
    for (const ar of areasOf(a)) if (!b.areas.includes(ar)) b.areas.push(ar);
    const exp = a.expires ? Number(a.expires) : 0;
    if (exp && (!b.until || exp > b.until)) b.until = exp;
  }
  return [...by.values()];
}

export default function AlertsCard({
  alerts, hazards = [], clear = [], unavailable = [], tz,
}: {
  alerts: NoaaAlert[];
  hazards?: HazardGroup[];
  clear?: HazardClear[];
  unavailable?: string[];
  tz: string;
}) {
  const [alertKey, setAlertKey] = useUrlString('alert');
  const [hazKind, setHazKind] = useUrlString('hazard');

  const groups = useMemo(() => groupAlerts(alerts), [alerts]);
  const open = useMemo(() => (alertKey ? groups.find((g) => g.key === alertKey) ?? null : null), [alertKey, groups]);
  const buckets = useMemo(() => (open ? bucketize(open) : []), [open]);
  const openHaz = useMemo(
    () => (hazKind ? hazards.find((g) => g.kind === hazKind) ?? null : null),
    [hazKind, hazards],
  );
  const total = groups.length + hazards.length;

  // Everything that checked in and has nothing to report. NWS comes from
  // our own table; the rest from the hazards payload.
  const allClear: { label: string; note: string }[] = [
    ...(groups.length === 0 ? [{ label: 'Weather alerts', note: 'none for Contra Costa County' }] : []),
    ...clear,
  ];

  return (
    <section className="card-section alerts-card">
      <div className="stack-sm">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              className="card alert local clickable"
              onClick={() => setAlertKey(g.key)}
            >
              <h3>{g.event}</h3>
              {g.headline && <div className="meta alert-headline">{g.headline}</div>}
              {g.until ? <div className="meta alert-foot"><span>until {fmtUntil(g.until, tz)}</span></div> : null}
            </button>
          ))}
          {hazards.map((g) => {
            const first = g.items[0];
            const hot = g.items.some((i) => i.severity === 'alert');
            return (
              <button
                key={`hz-${g.kind}`}
                type="button"
                className={`card alert ${hot ? 'local' : 'not-local'} clickable`}
                onClick={() => setHazKind(g.kind)}
              >
                <h3>{g.chip}</h3>
                {first && <div className="meta alert-headline">{first.title}{first.detail ? ` — ${first.detail}` : ''}</div>}
                <div className="meta alert-foot">
                  <span className="tag">{g.label}</span>
                  {g.items.length > 1 ? <span>{g.items.length} items</span> : null}
                </div>
              </button>
            );
          })}
          {(allClear.length > 0 || unavailable.length > 0) && (
            <div className="card all-clear">
              <h3>{total === 0 ? 'All clear' : 'Also checked — all clear'}</h3>
              <ul>
                {allClear.map((c) => (
                  <li key={c.label}><span className="what">{c.label}</span> <span className="note">{c.note}</span></li>
                ))}
              </ul>
              {unavailable.length > 0 && (
                <p className="meta unavailable">Couldn’t check right now: {unavailable.join(', ')}</p>
              )}
            </div>
          )}
        </div>

      <Modal open={!!open} onClose={() => setAlertKey(null)} title={open?.event ?? 'Alert'} size="lg">
        {open && (
          <>
            {open.severity && (
              <div className="alert-meta" style={{ marginBottom: 10 }}>
                <span><span className="k">severity:</span> <span className="v">{open.severity}</span></span>
              </div>
            )}
            {buckets.map((b, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                {b.headline && <div className="meta" style={{ marginBottom: 6 }}><b>{b.headline}</b></div>}
                {b.areas.length > 0 && <div className="meta" style={{ marginBottom: 6, lineHeight: 1.5 }}>{b.areas.join(', ')}</div>}
                <div className="alert-meta">
                  {(['urgency', 'certainty'] as const).map((k) =>
                    b.alert[k] ? <span key={k}><span className="k">{k}:</span> <span className="v">{String(b.alert[k])}</span></span> : null
                  )}
                  {b.alert.effective ? <span><span className="k">effective:</span> <span className="v">{fmtEpoch(Number(b.alert.effective), tz)}</span></span> : null}
                  {b.until ? <span><span className="k">expires:</span> <span className="v">{fmtEpoch(b.until, tz)}</span></span> : null}
                </div>
                {b.description && (
                  buckets.length === 1
                    ? <p style={{ whiteSpace: 'pre-line', marginTop: 12, lineHeight: 1.5 }}>{b.description}</p>
                    : (
                      <details style={{ marginTop: 8 }}>
                        <summary className="muted" style={{ cursor: 'pointer', fontSize: '.85em' }}>Full text</summary>
                        <p style={{ whiteSpace: 'pre-line', marginTop: 8, lineHeight: 1.5 }}>{b.description}</p>
                      </details>
                    )
                )}
              </div>
            ))}
          </>
        )}
      </Modal>

      <Modal open={!!openHaz} onClose={() => setHazKind(null)} title={openHaz?.label ?? ''} size="lg">
        {openHaz && (
          <>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {openHaz.items.map((it, i) => (
                <li key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <b>{it.title}</b>
                    {it.at ? <span className="muted" style={{ marginLeft: 8, fontSize: '.85em' }}>{fmtEpoch(it.at, tz)}</span> : null}
                  </div>
                  {it.detail && <div className="meta" style={{ whiteSpace: 'pre-line', lineHeight: 1.45, marginTop: 2 }}>{it.detail}</div>}
                  {it.url && <a href={it.url} target="_blank" rel="noopener" style={{ fontSize: '.85em' }}>Details →</a>}
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: '.78em', marginTop: 12 }}>
              Source: {openHaz.source}
              {openHaz.url && <> · <a href={openHaz.url} target="_blank" rel="noopener">open source</a></>}
            </p>
          </>
        )}
      </Modal>
    </section>
  );
}
