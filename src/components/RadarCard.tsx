'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import { useUrlString } from '@/lib/useUrlState';

export interface RadarImg {
  src: string;
  caption: string;
}

export default function RadarCard({ imgs }: { imgs: RadarImg[] }) {
  // Encode by index — the radar img list is server-rendered in a stable
  // order, and the captions/srcs would make for ugly URLs.
  const [idxStr, setIdxStr] = useUrlString('radar');
  const open = useMemo(() => {
    const i = idxStr ? Number(idxStr) : NaN;
    return Number.isInteger(i) && i >= 0 && i < imgs.length ? imgs[i] : null;
  }, [idxStr, imgs]);
  const setOpen = (img: RadarImg | null) => {
    if (!img) return setIdxStr(null);
    const i = imgs.indexOf(img);
    setIdxStr(i >= 0 ? String(i) : null);
  };

  return (
    <section className="card-section radar-card">
      <div className="radar-grid">
        {imgs.map((img) => (
          <button
            key={img.src}
            type="button"
            className="radar-thumb clickable"
            onClick={() => setOpen(img)}
          >
            <img src={img.src} alt={img.caption} />
            <figcaption>{img.caption}</figcaption>
          </button>
        ))}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} size="xl" title={open?.caption}>
        {open && (
          <div style={{ textAlign: 'center' }}>
            <img src={open.src} alt={open.caption} style={{ maxWidth: '100%', height: 'auto' }} />
          </div>
        )}
      </Modal>
    </section>
  );
}
