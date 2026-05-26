'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import type { CchPayload } from '@/lib/cch';

interface Props {
  label: string;
  tooltip?: string;
  data: CchPayload | null;
}

// Bundled CCHS documents. Drop PDFs in /public/img/cch/ and add an
// entry here — they'll appear as click-to-open viewers (same nested-
// modal + Ctrl+F search pattern as the EBRPD park maps).
//
// Why bundled, not linked: cchealth.org landing pages don't expose
// the documents directly — they bounce through wp-content URLs that
// rotate when the site is reorganized, and Ctrl+F search only works
// when the PDF is open in a viewer (not the wrapper HTML page).
// Bundling sidesteps both problems.
const CCH_DOCS: Array<{ slug: string; label: string; file: string; note: string }> = [
  // Examples — replace `file` with real paths once PDFs are dropped
  // into /public/img/cch/. These will render an "Not bundled yet"
  // notice until the file exists, since /public assets 404 silently
  // in the iframe.
  //
  // { slug: 'chna',     label: 'CCHS — Community Health Needs Assessment',
  //   file: '/img/cch/cchs-chna.pdf',
  //   note: 'IRS-required hospital needs assessment (~80 pages, refreshed every 3 years).' },
  // { slug: 'strategic-plan', label: 'CCHS — Strategic Plan',
  //   file: '/img/cch/cchs-strategic-plan.pdf',
  //   note: 'Department-wide strategic priorities + organizational structure.' },
  // { slug: 'annual',  label: 'CCHS — Annual Report',
  //   file: '/img/cch/cchs-annual-report.pdf',
  //   note: 'Department highlights, key metrics, financial summary.' },
];

export default function CchDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('cch');
  const [docSlug, setDocSlug] = useUrlString('cchdoc');

  const focusedDoc = useMemo(
    () => (docSlug ? CCH_DOCS.find((d) => d.slug === docSlug) ?? null : null),
    [docSlug],
  );

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Contra Costa Health — at a glance" size="lg">
        {!data ? (
          <p className="muted">Cache empty — run /admin → 1d.</p>
        ) : (
          <>
            {data.general && (
              <section>
                <h3 className="rep-h" style={{ marginTop: 0 }}>
                  {data.general.name ?? 'Contra Costa Regional Medical Center'}
                </h3>
                <dl className="econ-kv">
                  {data.general.overallRating && (
                    <>
                      <dt>CMS overall rating</dt>
                      <dd className="big">{data.general.overallRating} / 5 ★</dd>
                    </>
                  )}
                  {data.general.hospitalType && (
                    <>
                      <dt>Hospital type</dt>
                      <dd>{data.general.hospitalType}</dd>
                    </>
                  )}
                  {data.general.ownership && (
                    <>
                      <dt>Ownership</dt>
                      <dd>{data.general.ownership}</dd>
                    </>
                  )}
                  {data.general.emergencyServices && (
                    <>
                      <dt>Emergency services</dt>
                      <dd>{data.general.emergencyServices}</dd>
                    </>
                  )}
                  {data.general.address && (
                    <>
                      <dt>Address</dt>
                      <dd className="muted">{data.general.address}</dd>
                    </>
                  )}
                  {data.general.phone && (
                    <>
                      <dt>Phone</dt>
                      <dd className="muted">{data.general.phone}</dd>
                    </>
                  )}
                </dl>
              </section>
            )}

            {data.hcahps.length > 0 && (
              <section style={{ marginTop: 18 }}>
                <h3 className="rep-h">Patient experience (HCAHPS top-box %)</h3>
                <dl className="econ-kv">
                  {data.hcahps.map((m) => (
                    <div key={m.label} style={{ display: 'contents' }}>
                      <dt>{m.label}</dt>
                      <dd className="big">{m.score ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
                <p className="muted" style={{ fontSize: '.72em', marginTop: 4 }}>
                  Source: CMS Hospital Compare HCAHPS survey. &ldquo;Top-box&rdquo;
                  is the share of patients who chose the most-positive response.
                </p>
              </section>
            )}

            {data.timely.length > 0 && (
              <section style={{ marginTop: 18 }}>
                <h3 className="rep-h">Timely &amp; effective care</h3>
                <dl className="econ-kv">
                  {data.timely.map((m) => (
                    <div key={m.label} style={{ display: 'contents' }}>
                      <dt>{m.label}</dt>
                      <dd className="big">{m.score ?? '—'}</dd>
                      {m.period && (
                        <>
                          <dt>period</dt>
                          <dd className="muted">{m.period}</dd>
                        </>
                      )}
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section style={{ marginTop: 18 }}>
              <h3 className="rep-h">CCHS documents</h3>
              {CCH_DOCS.length === 0 ? (
                <p className="muted" style={{ fontSize: '.85em' }}>
                  No CCHS PDFs bundled yet. Drop files into{' '}
                  <code>/public/img/cch/</code> and register them in{' '}
                  <code>src/components/CchDetail.tsx</code> (<code>CCH_DOCS</code> array)
                  — they&rsquo;ll appear here as click-to-open viewers with Ctrl+F search.
                </p>
              ) : (
                <div className="park-map-links">
                  {CCH_DOCS.map((d) => (
                    <button
                      key={d.slug}
                      type="button"
                      className="event-modal-btn"
                      onClick={() => setDocSlug(d.slug)}
                      title={d.note}
                    >
                      📄 {d.label}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <div className="popup-ext-links" style={{ marginTop: 18 }}>
              <a href="https://www.medicare.gov/care-compare/details/hospital/050050"
                 target="_blank" rel="noopener">
                CCRMC on Medicare.gov Care Compare (source of the data above) →
              </a>
              <a href="https://calhospitalcompare.org/" target="_blank" rel="noopener">
                Cal Hospital Compare →
              </a>
            </div>

            <details style={{ marginTop: 14 }}>
              <summary className="muted" style={{ fontSize: '.78em', cursor: 'pointer' }}>
                Data freshness — per source
              </summary>
              <dl className="econ-kv" style={{ marginTop: 6 }}>
                {Object.entries(data.status).map(([k, s]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd className={s.ok ? 'big' : 'muted'} style={{ textAlign: 'left' }}>
                      {s.ok ? `${s.count} rows` : (s.error ?? 'failed')}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="muted" style={{ fontSize: '.72em', marginTop: 4 }}>
                Cached {new Date(data.scrapedAt).toLocaleString()}.
              </p>
            </details>
          </>
        )}
      </Modal>

      {focusedDoc && (
        <Modal open={true} onClose={() => setDocSlug(null)} title={focusedDoc.label} size="xl">
          <div className="park-pdf-wrap">
            <iframe
              key={focusedDoc.file}
              src={`${focusedDoc.file}#pagemode=none`}
              title={focusedDoc.label}
              className="park-pdf-frame"
              loading="lazy"
            />
            <p className="pdf-search-hint muted">
              Tip: click into the PDF and press <kbd>Ctrl</kbd>+<kbd>F</kbd> (<kbd>⌘</kbd>+<kbd>F</kbd> on Mac) to search.
            </p>
            <p className="muted" style={{ fontSize: '.85em' }}>{focusedDoc.note}</p>
            <div className="popup-ext-links">
              <a href={focusedDoc.file} target="_blank" rel="noopener">Open PDF in new tab →</a>
              <a href={focusedDoc.file} download>Download PDF →</a>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
