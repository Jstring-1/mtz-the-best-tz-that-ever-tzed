'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';

// Strip any existing '%' and append exactly one. Handles both the new
// raw-numeric BLS shape ("4.4") and the old already-suffixed cache
// shape ("4.4%") without producing double %.
function fmtPct(v: string | null | undefined): string {
  if (!v) return '—';
  const num = v.match(/[\d.]+/)?.[0];
  return num ? `${num}%` : '—';
}

interface Props {
  label: string;
  tooltip?: string;
  data: {
    county: string | null;
    state: string | null;
    nation: string | null;
    period: string;
  } | null;
}

// Civic-strip popup for the unemployment rate. The strip shows just
// the county number ("4.4%"); this popup carries the full CC / CA / US
// breakdown plus methodology.
export default function UnempDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('unemp');

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Unemployment rate" size="md">
        {!data ? (
          <p className="muted">Cache empty — run /admin → 12h.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '.85em', marginTop: 0 }}>
              Latest reporting period: <b>{data.period}</b>
            </p>
            <dl className="unemp-grid">
              <dt>Contra Costa County</dt>
              <dd className="big">{fmtPct(data.county)}</dd>
              <dt>California</dt>
              <dd className="big">{fmtPct(data.state)}</dd>
              <dt>United States</dt>
              <dd className="big">{fmtPct(data.nation)}</dd>
            </dl>
            <h3 className="rep-h" style={{ marginTop: 18 }}>About this number</h3>
            <p style={{ fontSize: '.9em', lineHeight: 1.5 }}>
              The unemployment rate is the share of the labor force (people working or actively
              looking for work) who are unemployed. It does <i>not</i> include people who&rsquo;ve
              stopped looking, or those working part-time who want full-time hours — those show
              up in the broader U-6 measure.
            </p>
            <p style={{ fontSize: '.9em', lineHeight: 1.5 }}>
              The county and California rates come from BLS LAUS (Local Area Unemployment
              Statistics, not seasonally adjusted). The U.S. rate uses BLS LNS (Current
              Population Survey, seasonally adjusted) — the headline number you hear on the news.
            </p>
            <p style={{ marginTop: 14 }}>
              <a className="event-modal-btn primary" href="https://www.bls.gov/lau/" target="_blank" rel="noopener">
                BLS LAUS dashboard →
              </a>{' '}
              <a className="event-modal-btn" href="https://data.bls.gov/timeseries/LASST060000000000003" target="_blank" rel="noopener">
                California series →
              </a>{' '}
              <a className="event-modal-btn" href="https://data.bls.gov/timeseries/LAUCN060130000000003" target="_blank" rel="noopener">
                Contra Costa series →
              </a>
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
