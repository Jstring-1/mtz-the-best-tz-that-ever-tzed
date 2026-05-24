'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { FemaRow } from '@/lib/gov';

interface Props {
  label: string;
  tooltip?: string;
  data: FemaRow[];
}

// Civic-strip popup for active FEMA disaster declarations nationwide,
// sourced from the gov_national cron payload (4h refresh). Each row is
// one declaration: state, incident type, declaration date, and the
// official title.
export default function FemaDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('fema');
  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="FEMA — active disaster declarations" size="lg">
        {data.length === 0 ? (
          <p className="muted">No active declarations cached. Run /admin → 4h.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              {data.length} open declaration{data.length === 1 ? '' : 's'} (incidentEndDate is null).
              Sorted newest first.
            </p>
            <ul className="recall-list">
              {data.map((d, i) => (
                <li key={`${d.state}-${d.declared}-${i}`} className="recall-item">
                  <div className="recall-head" style={{ cursor: 'default' }}>
                    <span className="recall-title">{d.title || d.type}</span>
                    <span className="meta">
                      <span className="recall-src">{d.state}</span>
                      {d.type && <span> · {d.type}</span>}
                      {d.declared && <span> · declared {d.declared}</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12 }}>
              <a className="event-modal-btn primary" href="https://www.fema.gov/disaster/declarations" target="_blank" rel="noopener">
                FEMA disaster declarations →
              </a>
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
