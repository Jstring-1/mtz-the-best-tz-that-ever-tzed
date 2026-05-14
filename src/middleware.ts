// Edge middleware. Gate restricted routes by client IP.
//
// Behind Railway (and likely Cloudflare in front of it), the real client
// IP lives in cf-connecting-ip > x-real-ip > x-forwarded-for. We try in
// that order and fall back to nothing (which fails closed).
//
// Default allowlist is hardcoded. Override at deploy time via
// OVERLAY_ALLOWED_IPS env var (comma-separated).

import { NextResponse, type NextRequest } from 'next/server';

const DEFAULT_ALLOWED = '66.234.206.36';

const allowed = (process.env.OVERLAY_ALLOWED_IPS ?? DEFAULT_ALLOWED)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function normalize(ip: string): string {
  // ::ffff:1.2.3.4 → 1.2.3.4
  return ip.replace(/^::ffff:/i, '').trim();
}

function getClientIp(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return normalize(cf);
  const real = req.headers.get('x-real-ip');
  if (real) return normalize(real);
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return normalize(xff.split(',')[0]);
  return '';
}

export function middleware(req: NextRequest) {
  const ip = getClientIp(req);
  if (!allowed.includes(ip)) {
    return new NextResponse(
      `Forbidden — /overlay is restricted.\n\nYour IP: ${ip || 'unknown'}`,
      { status: 403, headers: { 'content-type': 'text/plain' } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/overlay', '/overlay/:path*'],
};
