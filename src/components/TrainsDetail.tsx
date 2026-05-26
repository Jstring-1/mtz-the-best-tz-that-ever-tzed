'use client';

import { useState } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlEnum } from '@/lib/useUrlState';
import type { TrainsPayload, TrainEntry, TrainDetail, TrainStop } from '@/lib/trains';

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
  // railrat lists arriving descending (far-future at top, soonest at
  // bottom) — flip so the next imminent arrival is on top.
  const arrivingDisplay = [...arriving].reverse();
  const rows = tab === 'arriving' ? arrivingDisplay : departed;

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
            <div className="news-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`news-tab${tab === t ? ' active' : ''}`}
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
                          {data.details[e.trainNumber] && (
                            <TrainDetailPanel detail={data.details[e.trainNumber]} />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

          </>
        )}
      </Modal>
    </>
  );
}

// Rich detail panel — origin/destination, current location, next ETA,
// and full progress tracker pulled from railrat's per-train page.
// All fields are optional; the panel renders only whatever the scraper
// captured (so a failed sub-fetch still shows the basic times above).
function TrainDetailPanel({ detail }: { detail: TrainDetail }) {
  const nextStop = detail.progress.find((s) => s.state === 'upcoming');
  return (
    <div className="train-detail-panel">
      {(detail.origin || detail.destination) && (
        <div className="train-detail-route">
          {detail.origin ?? '?'} <span className="muted">→</span> {detail.destination ?? '?'}
          {detail.scheduledDeparture && (
            <span className="muted"> · sch. dep {detail.scheduledDeparture}</span>
          )}
        </div>
      )}
      {detail.status === 'Active' && detail.currentPosition && (
        <div className="train-detail-now">
          <strong>Now:</strong> {detail.currentPosition}
          {detail.distanceToDestination && (
            <span className="muted"> · {detail.distanceToDestination}</span>
          )}
        </div>
      )}
      {nextStop && (
        <div className="train-detail-next">
          <strong>Next:</strong> {nextStop.name} [{nextStop.code}]
          {nextStop.estimatedArrival && <> — est. {nextStop.estimatedArrival}</>}
          {nextStop.delay && <> ({nextStop.delay})</>}
        </div>
      )}
      {detail.progress.length > 0 && (
        <details className="train-progress-details">
          <summary>Full progress ({detail.progress.length} stops)</summary>
          <ol className="train-progress-list">
            {detail.progress.map((s) => (
              <ProgressRow key={s.code + (s.actualDeparture ?? s.estimatedArrival ?? '')} stop={s} />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function ProgressRow({ stop }: { stop: TrainStop }) {
  const isMtz = stop.code === 'MTZ';
  const cls = `train-stop ${stop.state}${isMtz ? ' mtz' : ''}`;
  // Past stop: "departed HH:MM (arrived HH:MM) — on time"
  // Upcoming: "est. arrival HH:MM (dep HH:MM) — N min. late"
  return (
    <li className={cls}>
      <span className="stop-code">{stop.code}</span>
      <span className="stop-name">{stop.name}</span>
      <span className="stop-times muted">
        {stop.state === 'past' ? (
          <>
            {stop.actualArrival && <>arr {stop.actualArrival}</>}
            {stop.actualArrival && stop.actualDeparture && ' · '}
            {stop.actualDeparture && <>dep {stop.actualDeparture}</>}
          </>
        ) : (
          <>
            {stop.estimatedArrival && <>est arr {stop.estimatedArrival}</>}
            {stop.estimatedArrival && stop.estimatedDeparture && ' · '}
            {stop.estimatedDeparture && <>est dep {stop.estimatedDeparture}</>}
          </>
        )}
        {stop.delay && <> · {stop.delay}</>}
      </span>
    </li>
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
