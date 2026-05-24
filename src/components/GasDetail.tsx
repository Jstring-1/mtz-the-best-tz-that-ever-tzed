'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';

interface Props {
  label: string;
  tooltip?: string;
  data: { value: string; period: string } | null;
}

// Civic-strip popup for the California weekly retail gas price. Source
// is EIA's PET_PRI_GND_DCUS_SCA_W series (regular all formulations,
// average dollars per gallon).
export default function GasDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('gas');

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="California gas — weekly average" size="md">
        {!data ? (
          <p className="muted">Cache empty — run /admin → 12h.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.85em', marginTop: 0 }}>
              Reporting week ending: <b>{data.period}</b>
            </p>
            <dl className="unemp-grid">
              <dt>California, regular, all formulations</dt>
              <dd className="big">{data.value}</dd>
            </dl>
            <h3 className="rep-h" style={{ marginTop: 18 }}>About this number</h3>
            <p style={{ fontSize: '.9em', lineHeight: 1.5 }}>
              Published by the U.S. Energy Information Administration (EIA) every Monday —
              an average of self-reported retail prices from ~340 gas stations across California
              the prior week. Includes all taxes.
            </p>
            <div className="popup-ext-links">
              <a href="https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EMM_EPMR_PTE_SCA_DPG&f=W" target="_blank" rel="noopener">
                EIA weekly series →
              </a>
              <a href="https://gasprices.aaa.com/?state=CA" target="_blank" rel="noopener">
                AAA daily averages →
              </a>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
