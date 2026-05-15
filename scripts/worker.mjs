// Long-running cron-pinger worker.
//
// Deployed as a second Railway service from this repo with start command:
//   node scripts/worker.mjs
//
// It owns the buckets GitHub Actions can't schedule (1m, 2m) and can take
// over the rest if you choose to retire the GitHub workflow entirely.
// Each tick hits the deployed site's /api/cron?bucket=<name>.
//
// Env vars:
//   SITE_URL    full origin of the deployed site (default https://mtz.city)
//   BUCKETS     comma-separated bucket names this worker should fire
//               (default: "1m,2m"). Set to e.g. "1m,2m,5m,15m,1h,4h,12h"
//               to make the worker authoritative for all schedules.

const SITE = (process.env.SITE_URL || 'https://mtz.city').replace(/\/$/, '');

const ALL_SCHEDULES = {
  '1m':  60 * 1000,
  '2m':  2 * 60 * 1000,
  '5m':  5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '4h':  4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
};

const enabled = (process.env.BUCKETS || '1m,2m')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s && s in ALL_SCHEDULES);

if (!enabled.length) {
  console.error('[worker] no valid buckets configured; exiting');
  process.exit(1);
}

async function fire(bucket) {
  const url = `${SITE}/api/cron?bucket=${bucket}`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'GET' });
    const text = await r.text();
    const ms = Date.now() - t0;
    const headLine = text.split('\n')[0] || '';
    if (!r.ok) {
      console.error(`[${ts()}] [${bucket}] HTTP ${r.status} in ${ms}ms — ${text.slice(0, 200)}`);
      return;
    }
    console.log(`[${ts()}] [${bucket}] ok ${ms}ms — ${headLine}`);
  } catch (e) {
    console.error(`[${ts()}] [${bucket}] fetch failed:`, e?.message || e);
  }
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

console.log(`[${ts()}] [worker] start  site=${SITE}  buckets=${enabled.join(',')}`);

// Stagger the initial fires so we don't slam the API on every restart.
// Skip the very-long ones (>1h) on startup — they'll tick naturally.
let delay = 5_000;
for (const bucket of enabled) {
  const ms = ALL_SCHEDULES[bucket];
  setInterval(() => { fire(bucket); }, ms);
  if (ms <= 60 * 60 * 1000) {
    setTimeout(() => { fire(bucket); }, delay);
    delay += 3_000;
  }
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[${ts()}] [worker] ${sig} — bye`);
    process.exit(0);
  });
}
