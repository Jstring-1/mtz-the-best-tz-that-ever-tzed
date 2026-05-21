'use client';

import { useCallback, useEffect, useState } from 'react';

// Reads/writes URL query params without triggering a Next.js route
// change — uses window.history.replaceState so other components don't
// have to re-render, and the server-rendered page doesn't have to
// re-execute. Components subscribe via a custom 'urlstate' event so
// multi-key updates stay in sync.
//
// Design choices:
//   - default value is *omitted* from the URL so the canonical share
//     URL stays short ("/" with nothing means everything default).
//   - on initial render we read directly from window.location to avoid
//     a useSearchParams-induced re-render. Safe in client components
//     (we still guard typeof window).

function readParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

function writeParam(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (value == null || value === '') url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState({}, '', url.toString());
  window.dispatchEvent(new CustomEvent('urlstate', { detail: { key } }));
}

/** Plain string param. null = absent from URL. */
export function useUrlString(
  key: string,
  initial: string | null = null,
): [string | null, (v: string | null) => void] {
  const [value, setValue] = useState<string | null>(() => readParam(key) ?? initial);

  useEffect(() => {
    const sync = () => setValue(readParam(key) ?? initial);
    window.addEventListener('popstate', sync);
    window.addEventListener('urlstate', sync as EventListener);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('urlstate', sync as EventListener);
    };
  }, [key, initial]);

  const set = useCallback((v: string | null) => {
    setValue(v);
    writeParam(key, v);
  }, [key]);

  return [value, set];
}

/** Boolean param — encoded as "1" when true, absent when false. */
export function useUrlBool(key: string): [boolean, (v: boolean) => void] {
  const [raw, setRaw] = useUrlString(key);
  return [!!raw, (v) => setRaw(v ? '1' : null)];
}

/** Enum param — falls back to the default when missing or invalid.
 *  When set to the default, the param is removed from the URL. */
export function useUrlEnum<T extends string>(
  key: string,
  options: readonly T[],
  defaultValue: T,
): [T, (v: T) => void] {
  const [raw, setRaw] = useUrlString(key);
  const value = (options as readonly string[]).includes(raw ?? '') ? (raw as T) : defaultValue;
  const set = useCallback((v: T) => setRaw(v === defaultValue ? null : v), [defaultValue, setRaw]);
  return [value, set];
}
