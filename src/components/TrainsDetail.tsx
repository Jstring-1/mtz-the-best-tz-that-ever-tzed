'use client';

import { useState } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlEnum } from '@/lib/useUrlState';
import type { TrainsPayload, TrainEntry } from '@/lib/trains';

interface Props {
  label: string;
  tooltip?: string;
  data: TrainsPayload | null;
}

type Tab = 'arriving' | 'departed';
const TABS: Tab[] = ['arriving', 'departed'];
const TAB_LABEL: Record<Tab, string> = {
  arriving: 'Arriving',
  departed: 'Departed',
};

// Civic-strip "Trains" popup. Lists Amtrak arrivals + departures for
// Martinez (MTZ) scraped from railrat.net, refreshed every 15min.
//
// Each row: time · train name · status badge · route. Click a row to
// expand the raw Ar/Dp scheduled/estimated/actual lines.
export default function TrainsDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('trains');
  const [tab, setTab] = useUrlEnum<Tab>('ttab', TABS, 'arriving');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const arriving = data?.arriving ?? [];
  const departed = data?.departed ?? [];
  const rows = tab === 'arriving' ? arriving : departed;

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Amtrak — Martinez (MTZ)" size="lg">
        {!data ? (
          <p className="muted">No data cached yet. Run /admin → 15m.</p>
        ) : (
          <>
            <div className="popup-ext-links" style={{ marginTop: 0, marginBottom: 6 }}>
              <a href="https://asm.transitdocs.com/map?sta=MTZ" target="_blank" rel="noopener">
                TransitDocs — live MTZ map →
              </a>
            </div>
            <div className="trains-meta">
              <span>
                <strong>{arriving.length}</strong> arriving · <strong>{departed.length}</strong> departed
              </span>
              {data.lastUpdated && (
                <span className="muted"> · upstream: {data.lastUpdated}</span>
              )}
            </div>

            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`tab ${tab === t ? 'active' : ''}`}
                  onClick={() => { setTab(t); setOpenKey(null); }}
                >
                  {TAB_LABEL[t]} ({(t === 'arriving' ? arriving : departed).length})
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                {tab === 'arriving'
                  ? 'No upcoming arrivals listed.'
                  : 'No recent departures listed.'}
              </p>
            ) : (
              <ul className="recall-list">
                {rows.map((e, i) => {
                  const key = `${tab}-${i}-${e.trainNumber}-${e.time}`;
                  const expanded = openKey === key;
                  return (
                    <li key={key} className="recall-item">
                      <button
                        type="button"
                        className="recall-head"
                        onClick={() => setOpenKey(expanded ? null : key)}
                      >
                        <span className="recall-title">
                          <span className="train-time">{e.time}</span>
                          {' '}
                          <span className="train-name">{e.trainName}</span>
                          {' '}
                          {e.status && <StatusBadge entry={e} />}
                        </span>
                        <span className="meta">
                          <span className="recall-src">{e.route}</span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="recall-reason">
                          {e.details.length > 0 && (
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {e.details.map((d, j) => (
                                <li key={j} style={{ marginBottom: 2 }}>{d}</li>
                              ))}
                            </ul>
                          )}
                          <div className="popup-ext-links" style={{ marginTop: 8 }}>
                            <a href={e.trainUrl} target="_blank" rel="noopener">
                              railrat.net — Train {e.trainNumber} →
                            </a>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="popup-ext-links">
              <a href="https://railrat.net/stations/MTZ/" target="_blank" rel="noopener">
                railrat.net — MTZ station page →
              </a>
              {' · '}
              <a href="https://www.amtrak.com/stations/mtz" target="_blank" rel="noopener">
                Amtrak — MTZ station →
              </a>
            </div>
            <p className="muted" style={{ fontSize: '0.85em', marginTop: 6 }}>
              Source: railrat.net (Amtrak Track Your Train Map). Scraped every 15min;
              don&rsquo;t rely on this for time-critical departures.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}

function StatusBadge({ entry }: { entry: TrainEntry }) {
  const { status, minutesOff, warn } = entry;
  // Three visual classes — on-time, early (slightly green-ish), late
  // (yellow when warn flag set by railrat's <span class="yellow">,
  // otherwise a softer tone).
  let cls = 'train-status';
  if (minutesOff === 0) cls += ' on';
  else if (minutesOff != null && minutesOff < 0) cls += ' early';
  else if (warn) cls += ' warn';
  else if (minutesOff != null && minutesOff > 0) cls += ' late';
  return <span className={cls}>{status}</span>;
}
