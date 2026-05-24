'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { EonetRow } from '@/lib/gov';

interface Props {
  label: string;
  tooltip?: string;
  data: EonetRow[];
}

// Civic-strip popup for NASA EONET (Earth Observatory Natural Event
// Tracker) — active wildfires, volcanoes, storms, icebergs, etc.
export default function EonetDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('eonet');
  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="NASA EONET — open natural events" size="lg">
        {data.length === 0 ? (
          <p className="muted">No open events cached. Run /admin → 4h.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              Active natural events tracked by NASA Earth Observatory — wildfires,
              storms, volcanoes, sea/lake ice, etc.
            </p>
            <ul className="recall-list">
              {data.map((e, i) => (
                <li key={`${e.title}-${i}`} className="recall-item">
                  <div className="recall-head" style={{ cursor: 'default' }}>
                    <span className="recall-title">
                      {e.url ? <a href={e.url} target="_blank" rel="noopener">{e.title}</a> : e.title}
                    </span>
                    <span className="meta">
                      <span className="recall-src">{e.category}</span>
                      {e.date && <span> · {e.date}</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12 }}>
              <a className="event-modal-btn primary" href="https://eonet.gsfc.nasa.gov/" target="_blank" rel="noopener">
                EONET event tracker →
              </a>
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
