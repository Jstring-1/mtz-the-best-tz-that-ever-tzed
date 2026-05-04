'use client';

import { useState } from 'react';

export default function AdminButtons({ buckets }: { buckets: { id: string; desc: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string>('(idle)');

  const run = async (bucket: string) => {
    setBusy(true);
    setOut(`Running ${bucket}…`);
    const t0 = performance.now();
    try {
      const r = await fetch(`/api/cron?bucket=${encodeURIComponent(bucket)}`);
      const txt = await r.text();
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      setOut(`[${r.status} in ${elapsed}s]\n${txt}`);
    } catch (e) {
      setOut(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  return (
    <>
      {buckets.map((b) => (
        <div className="bucket" key={b.id}>
          <b>{b.id}</b>
          <span>{b.desc}</span>
          <button disabled={busy} onClick={() => run(b.id)}>Run</button>
        </div>
      ))}
      <h2>Output</h2>
      <pre className="out">{out}</pre>
    </>
  );
}
