'use client';

import { useState } from 'react';
import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { FemaRow } from '@/lib/gov';

interface Props {
  label: string;
  tooltip?: string;
  data: FemaRow[];
}

const DECLARATION_TYPE_NAMES: Record<string, string> = {
  DR: 'Major Disaster Declaration',
  EM: 'Emergency Declaration',
  FM: 'Fire Management Assistance',
};

function femaUrl(d: FemaRow): string {
  return d.disasterNumber
    ? `https://www.fema.gov/disaster/${d.disasterNumber}`
    : 'https://www.fema.gov/disaster/declarations';
}

export default function FemaDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('fema');
  // Click a row to expand its details in-place.
  const [openIdx, setOpenIdx] = useState<number | null>(null);

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
            <ul className="recall-list">
              {data.map((d, i) => {
                const expanded = openIdx === i;
                const typeLabel = d.declarationType
                  ? (DECLARATION_TYPE_NAMES[d.declarationType] ?? d.declarationType)
                  : d.type;
                return (
                  <li key={`${d.state}-${d.declared}-${i}`} className="recall-item">
                    <button
                      type="button"
                      className="recall-head"
                      onClick={() => setOpenIdx(expanded ? null : i)}
                    >
                      <span className="recall-title">{d.title || d.type}</span>
                      <span className="meta">
                        <span className="recall-src">{d.state}</span>
                        {d.disasterNumber && <span> · DR-{d.disasterNumber}</span>}
                        {d.type && <span> · {d.type}</span>}
                        {d.declared && <span> · declared {d.declared}</span>}
                      </span>
                    </button>
                    {expanded && (
                      <div className="recall-reason">
                        <dl className="fema-kv">
                          {d.disasterNumber && <>
                            <dt>Disaster #</dt>
                            <dd>DR-{d.disasterNumber}</dd>
                          </>}
                          {d.declarationType && <>
                            <dt>Type</dt>
                            <dd>{typeLabel}</dd>
                          </>}
                          {d.designatedArea && <>
                            <dt>Designated area</dt>
                            <dd>{d.designatedArea}</dd>
                          </>}
                          {d.state && <>
                            <dt>State</dt>
                            <dd>{d.state}</dd>
                          </>}
                          {d.type && <>
                            <dt>Incident</dt>
                            <dd>{d.type}</dd>
                          </>}
                          {d.declared && <>
                            <dt>Declared</dt>
                            <dd>{d.declared}</dd>
                          </>}
                          {d.fyDeclared && <>
                            <dt>Fiscal year</dt>
                            <dd>FY{d.fyDeclared}</dd>
                          </>}
                        </dl>
                        <div className="popup-ext-links">
                          <a href={femaUrl(d)} target="_blank" rel="noopener">View on FEMA.gov →</a>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="popup-ext-links">
              <a href="https://www.fema.gov/disaster/declarations" target="_blank" rel="noopener">All FEMA declarations →</a>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
