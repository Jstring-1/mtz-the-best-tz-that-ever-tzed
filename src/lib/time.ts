// Format helpers shared across pages.

export function relativeFromIso(iso: string | undefined | null, now: number = Date.now()): string {
  if (!iso) return '';
  // The cache stores timestamps as "YYYY-MM-DDTHH:mm:ss" without a timezone.
  // Treat them as UTC (which is what the cron runner records) so the relative
  // calculation lands on the right side of zero.
  const ms = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(ms)) return '';
  return relativeFromMs(ms, now);
}

export function relativeFromUnixSeconds(sec: number | string | undefined | null, now: number = Date.now()): string {
  const n = Number(sec);
  if (!n) return '';
  return relativeFromMs(n * 1000, now);
}

export function relativeFromMs(ms: number, now: number = Date.now()): string {
  const diff = Math.round((now - ms) / 1000);
  if (diff < 0)         return 'just now';
  if (diff < 45)        return `${diff} seconds ago`;
  if (diff < 90)        return '1 minute ago';
  if (diff < 3600)      return `${Math.round(diff / 60)} minutes ago`;
  if (diff < 5400)      return '1 hour ago';
  if (diff < 86400)     return `${Math.round(diff / 3600)} hours ago`;
  if (diff < 172800)    return '1 day ago';
  if (diff < 2592000)   return `${Math.round(diff / 86400)} days ago`;
  if (diff < 5184000)   return '1 month ago';
  if (diff < 31536000)  return `${Math.round(diff / 2592000)} months ago`;
  return `${Math.round(diff / 31536000)} years ago`;
}
