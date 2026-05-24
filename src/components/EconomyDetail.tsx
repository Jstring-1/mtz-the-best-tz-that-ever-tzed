'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { GovNationalPayload } from '@/lib/gov';

interface Props {
  label: string;
  tooltip?: string;
  data: GovNationalPayload['economy'] | null;
}

// Civic-strip popup for the U.S. economy snapshot: debt, Treasury
// yield curve, national unemployment, and CPI year-over-year.
export default function EconomyDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('econ');
  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="U.S. economy — at a glance" size="md">
        {!data ? (
          <p className="muted">Cache empty — run /admin → 4h.</p>
        ) : (
          <>
            <dl className="unemp-grid">
              <dt>Federal debt</dt>
              <dd className="big">{data.debt?.total ?? '—'}</dd>
              {data.debt?.date && <>
                <dt className="muted" style={{ fontSize: '.78em' }}>as of</dt>
                <dd className="muted" style={{ fontSize: '.78em' }}>{data.debt.date}</dd>
              </>}
              <dt>U.S. unemployment</dt>
              <dd className="big">{data.unemployment?.value ?? '—'}</dd>
              {data.unemployment?.period && <>
                <dt className="muted" style={{ fontSize: '.78em' }}>period</dt>
                <dd className="muted" style={{ fontSize: '.78em' }}>{data.unemployment.period}</dd>
              </>}
              <dt>CPI year-over-year</dt>
              <dd className="big">{data.cpiYoY?.value ?? '—'}</dd>
              {data.cpiYoY?.period && <>
                <dt className="muted" style={{ fontSize: '.78em' }}>period</dt>
                <dd className="muted" style={{ fontSize: '.78em' }}>{data.cpiYoY.period}</dd>
              </>}
            </dl>

            {data.yields.length > 0 && (
              <>
                <h3 className="rep-h" style={{ marginTop: 16 }}>Treasury yield curve</h3>
                <div className="gov-yields">
                  {data.yields.map((y) => (
                    <div key={y.maturity} className="gov-yield">
                      <div className="m">{y.maturity}</div>
                      <div className="r">{y.rate}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p style={{ marginTop: 14 }}>
              <a className="event-modal-btn primary" href="https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/" target="_blank" rel="noopener">
                Treasury Fiscal Data →
              </a>{' '}
              <a className="event-modal-btn" href="https://www.bls.gov/news.release/empsit.toc.htm" target="_blank" rel="noopener">
                BLS Employment Situation →
              </a>{' '}
              <a className="event-modal-btn" href="https://www.bls.gov/cpi/" target="_blank" rel="noopener">
                BLS CPI →
              </a>
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
