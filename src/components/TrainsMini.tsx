'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TrainEntry } from '@/lib/trains';

// Next few Amtrak arrivals at MTZ. Client component only so the relative
// labels ("in 12 min") keep ticking between the 15-minute scrapes.
export default function TrainsMini({ arriving, limit = 5 }: { arriving: TrainEntry[]; limit?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // railrat lists arrivals furthest-first; flip so the soonest is on top and
  // drop trains whose time passed more than 2 minutes ago.
  const rows = useMemo(() => {
    const list = [...arriving].reverse().filter((e) => {
      const t = e.scheduledAt ? Date.parse(e.scheduledAt) : NaN;
      return Number.isNaN(t) || t >= now - 2 * 60_000;
    });
    return list.slice(0, limit);
  }, [arriving, now, limit]);

  if (rows.length === 0) return <p className="info-empty">No upcoming arrivals listed.</p>;

  return (
    <ul className="info-list">
      {rows.map((e) => {
        const t = e.scheduledAt ? Date.parse(e.scheduledAt) : NaN;
        const mins = Number.isNaN(t) ? null : Math.round((t - now) / 60_000);
        const rel = mins == null ? null
          : mins <= 0 ? 'now'
          : mins >= 90 ? `in ${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`
          : `in ${mins} min`;
        let cls = 'train-status';
        if (e.minutesOff === 0) cls += ' on';
        else if (e.minutesOff != null && e.minutesOff < 0) cls += ' early';
        else if (e.warn) cls += ' warn';
        else if (e.minutesOff != null && e.minutesOff > 0) cls += ' late';
        return (
          <li key={e.railratId || `${e.trainNumber}-${e.time}`} className="info-row">
            <span className="info-main">
              <b>{e.time}</b> {e.routeName || e.trainName}
              {e.status && <> <span className={cls}>{e.status}</span></>}
            </span>
            {rel && <span className="info-side">{rel}</span>}
          </li>
        );
      })}
    </ul>
  );
}
