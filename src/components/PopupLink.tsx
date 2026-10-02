'use client';

import type { ReactNode } from 'react';
import { writeParam } from '@/lib/useUrlState';

// A link-styled button that opens one of the civic-strip popups by setting
// the same URL params the popups themselves read (e.g. recalls=1&rtab=food).
// Lets the info column point at popups that live in CivicStrip without
// duplicating them.
export default function PopupLink({
  params, children, className = 'info-more', title,
}: {
  params: Record<string, string>;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={() => { for (const [k, v] of Object.entries(params)) writeParam(k, v); }}
    >
      {children}
    </button>
  );
}
