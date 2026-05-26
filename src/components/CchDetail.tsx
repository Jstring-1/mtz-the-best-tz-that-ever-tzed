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

// Bundled CCHP (Contra Costa Health Plan) documents. Grouped so the
// popup can render section headings between document groups. Click
// any entry → nested modal embeds the PDF with Ctrl+F search support.
//
// Why bundled, not linked: cchealth.org landing pages don't expose
// these documents at stable URLs (they rotate through wp-content
// paths), and Ctrl+F search only works when a PDF is open in a viewer
// — bundling sidesteps both problems.
type DocGroup = 'coverage' | 'directories' | 'pharmacy' | 'forms' | 'privacy' | 'outreach';
const GROUP_LABEL: Record<DocGroup, string> = {
  coverage:    'Health-plan coverage',
  directories: 'Provider directories',
  pharmacy:    'Pharmacy',
  forms:       'Forms',
  privacy:     'Privacy + member rights',
  outreach:    'Outreach brochures',
};

const CCH_DOCS: Array<{ slug: string; group: DocGroup; label: string; file: string; note: string }> = [
  // ---- Health-plan coverage (Evidence of Coverage, member handbooks)
  { slug: 'medi-cal-eoc',         group: 'coverage', label: 'Medi-Cal — Evidence of Coverage (2026)',
    file: '/img/cch/medi-cal-eoc-2026.pdf',
    note: 'Full member handbook for CCHP Medi-Cal coverage.' },
  { slug: 'care-plus-handbook',   group: 'coverage', label: 'Care Plus — Member Handbook (2026)',
    file: '/img/cch/care-plus-member-handbook-2026.pdf',
    note: 'CCHP Care Plus plan: benefits, copays, how to use the plan.' },
  { slug: 'county-emp-eoc',       group: 'coverage', label: 'County Employee Plan A/B — Evidence of Coverage',
    file: '/img/cch/county-employee-plan-ab-eoc.pdf',
    note: 'Coverage details for the county-employee CCHP plan (A/B).' },
  { slug: 'ihss-eoc',             group: 'coverage', label: 'IHSS Plan A2 — Evidence of Coverage',
    file: '/img/cch/ihss-plan-a2-eoc.pdf',
    note: 'In-Home Supportive Services workers — Plan A2 coverage details.' },

  // ---- Provider directories
  { slug: 'provider-directory',   group: 'directories', label: 'Medical Provider Directory (large font)',
    file: '/img/cch/medical-provider-directory.pdf',
    note: 'Comprehensive CCHP provider directory — every PCP, specialist, clinic.' },
  { slug: 'pd-rmc-network',       group: 'directories', label: 'Provider Directory — RMC Network (large font)',
    file: '/img/cch/provider-directory-rmc-network.pdf',
    note: 'Regional Medical Center network providers only.' },
  { slug: 'pd-rmc-cpn',           group: 'directories', label: 'Provider Directory — RMC + CPN (large font)',
    file: '/img/cch/provider-directory-rmc-cpn.pdf',
    note: 'RMC Network plus Community Provider Network (broader).' },

  // ---- Pharmacy
  { slug: 'pdl-commercial',       group: 'pharmacy', label: 'Preferred Drug List (Commercial)',
    file: '/img/cch/preferred-drug-list-commercial.pdf',
    note: 'CCHP formulary for the Commercial plan — covered drugs by tier.' },

  // ---- Forms
  { slug: 'advance-directive',    group: 'forms', label: 'Advance Directive (2019)',
    file: '/img/cch/advance-directive-2019.pdf',
    note: 'End-of-life care wishes + naming a health-care agent.' },
  { slug: 'dmr-form',             group: 'forms', label: 'Designated Member Representative (DMR) form',
    file: '/img/cch/dmr-form.pdf',
    note: 'Authorize someone to act on your behalf with CCHP.' },
  { slug: 'reimbursement-form',   group: 'forms', label: 'Member Reimbursement Form (2025)',
    file: '/img/cch/member-reimbursement-form-2025.pdf',
    note: 'Submit covered out-of-pocket expenses for reimbursement.' },

  // ---- Privacy + rights
  { slug: 'hipaa-notice',         group: 'privacy', label: 'HIPAA Notice of Privacy Practices',
    file: '/img/cch/hipaa-notice.pdf',
    note: 'How CCHP uses + discloses your protected health information.' },
  { slug: 'medi-cal-rights',      group: 'privacy', label: 'Medi-Cal — Member Rights Letter',
    file: '/img/cch/medi-cal-rights-letter.pdf',
    note: 'Your rights as a Medi-Cal member: language access, grievances, appeals.' },

  // ---- Outreach
  { slug: 'wellcare-child',       group: 'outreach', label: 'WellCare Brochure — Children',
    file: '/img/cch/wellcare-brochure-child.pdf',
    note: 'Well-child visit schedule, vaccines, screenings.' },
  { slug: 'wellcare-teens',       group: 'outreach', label: 'WellCare Brochure — Teens',
    file: '/img/cch/wellcare-brochure-teens.pdf',
    note: 'Teen well-visit topics: mental health, sexual health, screenings.' },
];

// Stable group display order — drives the section headings in render.
const GROUP_ORDER: DocGroup[] = ['coverage', 'directories', 'pharmacy', 'forms', 'privacy', 'outreach'];

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
              <h3 className="rep-h">CCHP documents</h3>
              <p className="muted" style={{ fontSize: '.78em', marginTop: -2 }}>
                Click any document to read in-page with Ctrl+F search.
              </p>
              {GROUP_ORDER.map((g) => {
                const docs = CCH_DOCS.filter((d) => d.group === g);
                if (!docs.length) return null;
                return (
                  <div key={g} className="cch-doc-group">
                    <h4 className="cch-doc-group-h">{GROUP_LABEL[g]}</h4>
                    <div className="park-map-links">
                      {docs.map((d) => (
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
                  </div>
                );
              })}
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
