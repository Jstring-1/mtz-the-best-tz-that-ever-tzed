'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Reusable native-dialog modal with click-outside-to-close + Esc + close
// button. Content is wrapped in a child div so the "click target === dialog"
// test works for the backdrop click only.

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      className={`detail-modal size-${size}`}
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Two-row layout: fixed header (title + close) + scrollable body.
          The split is what lets `position: sticky` on a child of the body
          actually stick — otherwise the body scrolls past the title and
          the sticky's reference is the wrong scroll container. */}
      <div className="detail-modal-content">
        <header className="detail-modal-header">
          <button className="detail-modal-close" onClick={onClose} aria-label="Close">×</button>
          {title && <h2 className="detail-modal-title">{title}</h2>}
        </header>
        <div className="detail-modal-body">{children}</div>
      </div>
    </dialog>
  );
}
