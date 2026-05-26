// Next.js boot hook. Runs once when the server starts.
// We use it to kick off in-process setInterval timers that fire each
// cron bucket directly via runBucket() — no HTTP round-trip, no
// separate Railway service. Same pattern SeaDisco uses.
//
// Disabled in dev (or set ENABLE_INSTRUMENTATION=1 to force on).
// Edge runtime can't run setInterval, so we bail there too.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production' && !process.env.ENABLE_INSTRUMENTATION) return;

  // Lazy-load so we don't pull cron's transitive deps into the Edge bundle.
  const { runBucket } = await import('@/lib/cron');

  const SCHEDULES = [
    { name: '1m',  ms: 60_000 },
    { name: '2m',  ms: 120_000 },
    { name: '5m',  ms: 300_000 },
    { name: '15m', ms: 900_000 },
    { name: '1h',  ms: 3_600_000 },
    { name: '4h',  ms: 14_400_000 },
    { name: '12h', ms: 43_200_000 },
    { name: '1d',  ms: 86_400_000 },
  ] as const;

  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const debug = process.env.MTZ_DEBUG === '1';

  async function fire(bucket: typeof SCHEDULES[number]['name']) {
    const t0 = Date.now();
    try {
      const r = await runBucket(bucket);
      const errs = Object.keys(r.errors);
      // Only log success lines when MTZ_DEBUG=1. Errors always log.
      if (debug) {
        console.log(`[${ts()}] [cron] ${bucket} ok ${Date.now() - t0}ms — ran ${r.ok.length}${errs.length ? `, ${errs.length} errors` : ''}`);
      } else if (errs.length) {
        console.log(`[${ts()}] [cron] ${bucket} ran ${r.ok.length}, ${errs.length} err`);
      }
      for (const k of errs) console.error(`  ${bucket}/${k}: ${r.errors[k]}`);
    } catch (e) {
      console.error(`[${ts()}] [cron] ${bucket} threw:`, e instanceof Error ? e.message : e);
    }
  }

  if (debug) console.log(`[${ts()}] [cron] inline scheduler online — ${SCHEDULES.length} buckets`);

  // Stagger initial fires for the short-cadence buckets so a fresh boot
  // doesn't slam every API at once. Long buckets (>1h) tick naturally.
  let delay = 5_000;
  for (const s of SCHEDULES) {
    setInterval(() => { void fire(s.name); }, s.ms);
    if (s.ms <= 5 * 60_000) {
      setTimeout(() => { void fire(s.name); }, delay);
      delay += 3_000;
    }
  }
}
