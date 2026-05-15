'use client';

import { useState } from 'react';
import Modal from './Modal';

export interface RadarImg {
  src: string;
  caption: string;
}

export default function RadarCard({ imgs }: { imgs: RadarImg[] }) {
  const [open, setOpen] = useState<RadarImg | null>(null);

  return (
    <section className="card-section radar-card">
      <h2>Radar &amp; imagery</h2>
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
