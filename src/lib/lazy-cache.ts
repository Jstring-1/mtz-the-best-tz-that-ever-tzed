// Lazy server-side cache for per-record API responses (bill-detail,
// grant-detail, rep-detail, article-extract, etc.). The cron-populated
// payloads (gov_local, ccrmc_data, reps_data, ...) already use
// apis_json directly. This helper covers the OPPOSITE pattern: data
// that's keyed by user-supplied parameters and only worth caching once
// it's been requested.
//
// Stores each entry as { _ttlAt, data } under a caller-chosen key in
// apis_json. On read, checks _ttlAt against Date.now() and re-fetches
// when expired.

import { getJson, upsertJson } from './cache';

interface Cached<T> { _ttlAt: number; data: T }

export interface LazyResult<T> {
  data: T;
  /** true if served from cache (not refreshed this request). */
  cached: boolean;
  /** ISO timestamp when this record will expire. */
  expiresAt: string;
}

/**
 * Return the cached value at `key` if present and not yet expired.
 * Otherwise call `fresh()`, persist its result with a TTL, and return.
 *
 * `fresh()` returning null skips the cache write entirely — the next
 * request will retry. This is the right behavior for transient API
 * failures (rate limit, network hiccup) where we don't want to
 * pollute the cache with an empty placeholder.
 */
export async function lazyCached<T>(
  key: string,
  ttlMs: number,
  fresh: () => Promise<T | null>,
): Promise<LazyResult<T> | null> {
  const hit = await getJson<Cached<T>>(key).catch(() => null);
  if (hit && hit._ttlAt && hit._ttlAt > Date.now() && hit.data !== null && hit.data !== undefined) {
    return { data: hit.data, cached: true, expiresAt: new Date(hit._ttlAt).toISOString() };
  }
  const value = await fresh();
  if (value === null || value === undefined) return null;
  const expiresAtMs = Date.now() + ttlMs;
  const record: Cached<T> = { _ttlAt: expiresAtMs, data: value };
  // Don't let a DB write failure mask a successful fetch.
  await upsertJson(key, record).catch((e) => {
    console.warn(`[lazy-cache] upsert ${key} failed:`, e instanceof Error ? e.message : e);
  });
  return { data: value, cached: false, expiresAt: new Date(expiresAtMs).toISOString() };
}

// Common TTLs used across detail endpoints. Tune per endpoint as needed.
export const TTL = {
  HOURS_1:  1 * 60 * 60 * 1000,
  HOURS_6:  6 * 60 * 60 * 1000,
  HOURS_12: 12 * 60 * 60 * 1000,
  HOURS_24: 24 * 60 * 60 * 1000,
  DAYS_7:   7 * 24 * 60 * 60 * 1000,
  DAYS_30: 30 * 24 * 60 * 60 * 1000,
} as const;
