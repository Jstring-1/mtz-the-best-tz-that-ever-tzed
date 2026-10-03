'use client';

import { useEffect, useState } from 'react';
import type { BartPayload, BartTrain } from '@/app/api/bart/route';

// Live BART departures from the three stations closest to Martinez.
// Polls /api/bart every minute while the tab is visible.
export default function BartMini() {
  const [data, setData] = useState<BartPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/bart')
        .then((r) => (r.ok ? (r.json() as Promise<BartPayload>) : Promise.reject(new Error(String(r.status)))))
        .then((j) => { if (alive) { setData(j); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    };
    load();
    const id = setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', load); };
  }, []);

  if (!data) return <p className="info-empty">{failed ? 'BART times unavailable right now.' : 'Loading BART times…'}</p>;

  const times = (list: BartTrain[]) =>
    list.map((t, i) => (
      <span key={i} className="bart-t" title={`${t.dest}${t.late ? ' (delayed)' : ''}`}>
        <i className="bart-dot" style={{ background: t.color }} />
        {t.mins === 0 ? 'now' : t.mins}{t.late ? '*' : ''}
        {i < list.length - 1 ? ', ' : ''}
      </span>
    ));

  return (
    <ul className="info-list">
      {data.stations.map((s) => (
        <li key={s.abbr} className="bart-station">
          <div className="bart-name">{s.name}</div>
          {s.south.length > 0 && (
            <div className="info-row"><span className="info-main">to SF</span><span className="info-side">{times(s.south)} min</span></div>
          )}
          {s.north.length > 0 && (
            <div className="info-row"><span className="info-main">to Antioch</span><span className="info-side">{times(s.north)} min</span></div>
          )}
          {s.south.length === 0 && s.north.length === 0 && <div className="info-empty">No departures listed.</div>}
        </li>
      ))}
    </ul>
  );
}
