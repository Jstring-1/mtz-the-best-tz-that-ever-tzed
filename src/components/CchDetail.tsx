'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { CchPayload } from '@/lib/cch';

interface Props {
  label: string;
  tooltip?: string;
  data: CchPayload | null;
}

// Static reference links — these don't need a fetch. CCHS publishes
// them at stable landing URLs and they update yearly at most. The
// popup just exposes them so users can click through.
const REF_LINKS: Array<{ label: string; url: string; hint: string }> = [
  { label: 'Contra Costa Health — landing page',
    url: 'https://cchealth.org/',
    hint: 'The county Health Services umbrella site.' },
  { label: 'Strategic plan + annual reports',
    url: 'https://cchealth.org/about/strategic-plan',
    hint: 'Strategic priorities, organizational structure, recent annual reports.' },
  { label: 'Community Health Needs Assessment (CHNA)',
    url: 'https://cchealth.org/medical-center/cchs-community-health-needs-assessment',
    hint: 'IRS-required hospital needs assessment; full PDF refreshed every 3 years.' },
  { label: 'CCRMC — Contra Costa Regional Medical Center',
    url: 'https://cchealth.org/medical-center',
    hint: 'The county hospital itself: services, patient info, locations.' },
  { label: 'CDPH All-Facility Letters (current)',
    url: 'https://www.cdph.ca.gov/Programs/CHCQ/LCP/Pages/AFLs.aspx',
    hint: 'CDPH advisories CCRMC + every CA hospital must comply with.' },
  { label: 'Cal Hospital Compare',
    url: 'https://calhospitalcompare.org/',
    hint: 'Public-facing scorecards for every California hospital.' },
  { label: 'CMS Hospital Compare (federal)',
    url: 'https://www.medicare.gov/care-compare/?providerType=Hospital',
    hint: 'Federal hospital quality + safety database, source of the data above.' },
  { label: 'Title 22 — CA hospital licensing regs',
    url: 'https://govt.westlaw.com/calregs/Browse/Home/California/CaliforniaCodeofRegulations?guid=I83BD0BA0D44811DEB97CF67CD0B99467',
    hint: 'The state code section that defines hospital licensing requirements.' },
];

export default function CchDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('cch');

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
                  Source: CMS Hospital Compare patient-survey (HCAHPS) data.
                  &ldquo;Top-box&rdquo; = the share of patients who picked the
                  most-positive response.
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
              <h3 className="rep-h">Reference documents</h3>
              <div className="popup-ext-links">
                {REF_LINKS.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener" title={l.hint}>
                    {l.label} →
                  </a>
                ))}
              </div>
              <p className="muted" style={{ fontSize: '.72em', marginTop: 6 }}>
                For internal Policy &amp; Procedure manuals not posted publicly,
                file a California Public Records Act request with CCHS Communications.
              </p>
            </section>

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
    </>
  );
}
