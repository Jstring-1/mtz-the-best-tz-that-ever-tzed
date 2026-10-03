'use client';

import { useEffect, useState } from 'react';
import { TRAFFIC_CAMS } from '@/lib/cameras';

// Live Caltrans camera stills. The image URL is re-requested every 5 minutes
// (Caltrans' own refresh rate) with a cache-busting query so the browser
// doesn't keep showing the first frame.
export default function TrafficCams() {
  const [tick, setTick] = useState(0);
  const [bad, setBad] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setTick((t) => t + 1); }, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <ul className="info-list">
      {TRAFFIC_CAMS.map((c) => (
        <li key={c.id} className="cam">
          {bad[c.id] ? (
            <p className="info-empty">Camera temporarily unavailable.</p>
          ) : (
            <a href={c.img} target="_blank" rel="noopener" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="cam-img"
                src={`${c.img}?t=${tick}`}
                alt={c.name}
                loading="lazy"
                onError={() => setBad((b) => ({ ...b, [c.id]: true }))}
              />
            </a>
          )}
          <div className="info-note">{c.name} · {c.id}</div>
        </li>
      ))}
    </ul>
  );
}
