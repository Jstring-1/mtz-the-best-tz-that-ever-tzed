'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { CcrmcQuality } from '@/lib/ccrmc';

// Star bar — renders an integer 1..5 as filled/empty stars. CMS's
// "Overall hospital rating" comes as a numeric string; falls back to
// "Not Available" when CMS flags the rating as undisclosable.
function Stars({ value }: { value: string }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return <span className="muted">{value || 'Not rated'}</span>;
  return (
    <span aria-label={`${n} out of 5 stars`} className="stars">
      {'★'.repeat(n)}<span className="muted">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export default function CcrmcQuality({ data }: { data: CcrmcQuality | null }) {
  const [open, setOpen] = useUrlBool('cq');

  return (
    <>
      <button
        type="button"
        className="ccrmc-section-btn"
        onClick={() => setOpen(true)}
      >
        <div className="head">CMS Quality &amp; ratings</div>
        <div className="sub">
          {data?.overallRating
            ? <>Overall: <Stars value={data.overallRating} /> · click for full breakdown</>
            : 'CMS Hospital Compare scorecard — click to open'}
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="CMS Hospital Quality — CCRMC" size="lg">
        {!data ? (
          <p className="muted">CMS quality data not in cache yet. Run /admin → 12h, then re-share the URL.</p>
        ) : (
          <div className="grant-detail">
            <dl className="bill-kv ccrmc-kv">
              {data.hospitalName        && <><dt>Facility</dt><dd>{data.hospitalName}</dd></>}
              {data.hospitalType        && <><dt>Type</dt><dd>{data.hospitalType}</dd></>}
              {data.ownership           && <><dt>Ownership</dt><dd>{data.ownership}</dd></>}
              {data.emergencyServices   && <><dt>Emergency services</dt><dd>{data.emergencyServices}</dd></>}
              <dt>Overall rating</dt>
              <dd><Stars value={data.overallRating ?? ''} />{data.ratingFootnote ? <span className="muted"> · {data.ratingFootnote}</span> : null}</dd>
            </dl>

            <h3 className="bill-h">Comparison-group results (count of measures vs. national avg)</h3>
            <dl className="bill-kv ccrmc-kv">
              <dt>Mortality</dt>     <dd>{data.mortalityComparison}</dd>
              <dt>Safety of care</dt><dd>{data.safetyComparison}</dd>
              <dt>Readmissions</dt>  <dd>{data.readmissionComparison}</dd>
              <dt>Patient experience</dt><dd>{data.experienceComparison}</dd>
              <dt>Effectiveness</dt> <dd>{data.effectivenessComparison}</dd>
              <dt>Timeliness</dt>    <dd>{data.timelinessComparison}</dd>
              <dt>Medical imaging</dt><dd>{data.imagingComparison}</dd>
            </dl>

            <p className="muted" style={{ fontSize: '.78em', marginTop: 10 }}>
              Detailed measure-level data (HCAHPS, readmission rates, infection rates, etc.) lives on CMS Care Compare.
            </p>
            <p style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="event-modal-btn primary" href="https://www.medicare.gov/care-compare/details/hospital/050075" target="_blank" rel="noopener">
                Open Care Compare profile →
              </a>
              <a className="event-modal-btn" href="https://data.cms.gov/provider-data/dataset/xubh-q36u" target="_blank" rel="noopener">
                Source dataset →
              </a>
            </p>
            <p className="muted" style={{ fontSize: '.72em', marginTop: 8 }}>
              Cache scraped {new Date(data.fetchedAt).toLocaleString()}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
