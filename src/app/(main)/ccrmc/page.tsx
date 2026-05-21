import { getJson, getAllJsonTimestamps } from '@/lib/cache';
import { relativeFromIso } from '@/lib/time';
import type { CcrmcPayload } from '@/lib/ccrmc';
import type { CompPayload } from '@/lib/comp';
import GrantsDetail from '@/components/GrantsDetail';
import CcrmcQuality from '@/components/CcrmcQuality';
import CcrmcCompensation from '@/components/CcrmcCompensation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'CCRMC operations dashboard',
  description:
    'Federal funding, CMS quality scores, news, budgets, public-health & workforce links for Contra Costa Regional Medical Center.',
  alternates: { canonical: '/ccrmc' },
};

// Static link tiles for sections where there's no live API. Each tile
// opens the canonical resource on the source site in a new tab.
const BUDGET_LINKS = [
  { label: 'Contra Costa County — Budget',
    url:   'https://www.contracosta.ca.gov/',
    note:  "County's main site — search 'budget' for adopted budget, ACFR, CIP, and mid-year reports." },
  { label: 'CA HCAI — Hospital financial & utilization data',
    url:   'https://hcai.ca.gov/data/',
    note:  'HCAI data hub — search "hospital financial" for annual unaudited & audited reports.' },
  { label: 'FAC.gov Single Audit search',
    url:   'https://app.fac.gov/dissemination/search/?auditee_state=CA',
    note:  "Search 'Contra Costa County' to see federal-expenditure schedules & findings." },
  { label: 'CMS Hospital Cost Reports',
    url:   'https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports/hospital-2010-form',
    note:  "CMS-published HCRIS cost reports — what CCRMC reports to Medicare each year." },
];

const PH_LINKS = [
  { label: 'CDPH — Center for Infectious Diseases',
    url:   'https://www.cdph.ca.gov/Programs/CID/',
    note:  'State surveillance, outbreak alerts, and reportable-disease guidance.' },
  { label: 'CDC NHSN — Healthcare-Associated Infections',
    url:   'https://www.cdc.gov/nhsn/',
    note:  "CDC's National Healthcare Safety Network — HAI reporting & dashboards." },
  { label: 'Contra Costa Health Services',
    url:   'https://cchealth.org/',
    note:  'County health-department homepage — public health programs, dashboards, alerts.' },
  { label: 'CDPH Licensing & Certification',
    url:   'https://www.cdph.ca.gov/Programs/CHCQ/LCP/',
    note:  'State licensing & certification — survey reports and complaint investigations.' },
];

const WORKFORCE_LINKS = [
  { label: 'HCAI — Healthcare workforce',
    url:   'https://hcai.ca.gov/workforce/',
    note:  "CA's healthcare workforce hub (RN/LVN/MD/AP counts, vacancy rates, profiles)." },
  { label: 'Cal/OSHA — Division of Occupational Safety & Health',
    url:   'https://www.dir.ca.gov/dosh/',
    note:  'State workplace safety enforcement — inspection programs and consultations.' },
  { label: 'OSHA Establishment Search (federal mirror)',
    url:   'https://www.osha.gov/ords/imis/establishment.html',
    note:  'Searchable inspection history — enter "Contra Costa Regional" + state CA.' },
  { label: 'NLRB — Case search',
    url:   'https://www.nlrb.gov/search/case',
    note:  'Labor-relations case filings — search "Contra Costa Regional" or "CNA".' },
];

const REGULATORY_LINKS = [
  { label: 'CCC Board of Supervisors',
    url:   'https://www.contracosta.ca.gov/',
    note:  'Main county site — search "Board of Supervisors" for current agendas, minutes, and live meeting feeds. Health Services items appear regularly.' },
  { label: 'The Joint Commission — Quality Check',
    url:   'https://www.qualitycheck.org/',
    note:  'Accreditation history — type "Contra Costa Regional Medical Center" into the search box on this page.' },
  { label: 'Leapfrog Hospital Safety Grade',
    url:   'https://www.hospitalsafetygrade.org/',
    note:  'Independent letter-grade hospital safety scoring — search "Contra Costa Regional".' },
  { label: 'CMS Care Compare — CCRMC profile',
    url:   `https://www.medicare.gov/care-compare/details/hospital/050276`,
    note:  "Full Care Compare profile: HAI rates, mortality, readmissions, patient experience." },
];

function LinkTile({ label, url, note }: { label: string; url: string; note: string }) {
  return (
    <a className="ccrmc-link-tile" href={url} target="_blank" rel="noopener">
      <div className="head">{label} <span className="arrow">→</span></div>
      <div className="note">{note}</div>
    </a>
  );
}

export default async function CcrmcPage() {
  const [payload, comp, ts] = await Promise.all([
    getJson<CcrmcPayload>('ccrmc_data').catch(() => null),
    getJson<CompPayload>('ccc_comp').catch(() => null),
    getAllJsonTimestamps(),
  ]);
  // Lightweight summary stats for the trigger card — full dataset is
  // lazy-fetched via /api/ccc-comp when the user opens the modal.
  const compHint = comp ? {
    year: comp.year,
    employees: comp.totals.employees,
    grandTotal: comp.totals.grandTotal,
  } : undefined;
  const facts = payload?.facts;
  const funding = payload?.funding ?? { sources: [], data: {} };
  const totalFunding = Object.values(funding.data).flat().reduce((acc, r) => acc + r.amount, 0);
  const fundingLabelHtml =
    `<span class="ccrmc-section-btn-head">Federal funding</span>` +
    `<span class="ccrmc-section-btn-sub">${
      payload
        ? `${fmtMoney(totalFunding)} across ${funding.sources.filter((s) => s.kind !== 'link').length} sources · click to browse`
        : 'cache empty — run /admin → 12h'
    }</span>`;

  return (
    <div className="page ccrmc">
      <h1>CCRMC Operations</h1>
      {ts['ccrmc_data'] && (
        <p className="muted" style={{ fontSize: '.78em', marginTop: 4 }}>
          Live data refreshed {relativeFromIso(ts['ccrmc_data'])}
        </p>
      )}

      {/* Facility overview */}
      {facts && (
        <section className="ccrmc-facts">
          <dl>
            <dt>Address</dt><dd>{facts.address}, {facts.city}, {facts.state} {facts.zip} <a className="map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${facts.address}, ${facts.city}, ${facts.state} ${facts.zip}`)}`} target="_blank" rel="noopener">↗ map</a></dd>
            <dt>Phone</dt><dd>{facts.phone}</dd>
            <dt>Beds</dt><dd>{facts.beds}</dd>
            <dt>CMS CCN</dt><dd><code>{facts.ccn}</code></dd>
            <dt>Parent</dt><dd>{facts.parentSystem}</dd>
            <dt>Website</dt><dd><a href={facts.website} target="_blank" rel="noopener">{facts.website.replace(/^https?:\/\//, '')}</a></dd>
          </dl>
        </section>
      )}

      {/* Data cards: each opens a modal via URL-state */}
      <section className="ccrmc-cards">
        <GrantsDetail
          keyPrefix="c"
          triggerClassName="ccrmc-section-btn"
          modalTitle="CCRMC-relevant federal funding"
          tooltip="USAspending awards naming CCC Health, CFDA Community Health Centers, HHS in 94553"
          label={fundingLabelHtml}
          rows={[]}
          sources={funding.sources}
          data={funding.data}
        />

        <CcrmcQuality data={payload?.quality ?? null} />

        <CcrmcCompensation totalsHint={compHint} />

        <div className="ccrmc-section-card ccrmc-news-card">
          <div className="head">Recent news (Google News)</div>
          {payload?.news.length ? (
            <ul className="ccrmc-news">
              {payload.news.slice(0, 6).map((n, i) => (
                <li key={i}>
                  <a href={n.url} target="_blank" rel="noopener">{n.title}</a>
                  <span className="muted">
                    {n.source ? ` · ${n.source}` : ''}
                    {n.date ? ` · ${n.date}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: '.85em' }}>
              No news cached yet — run /admin → 12h. Or{' '}
              <a href="https://news.google.com/search?q=%22Contra+Costa+Regional+Medical+Center%22" target="_blank" rel="noopener">search Google News →</a>
            </p>
          )}
        </div>
      </section>

      {/* Link sections — no API for these, just curated jump-off points */}
      <section className="ccrmc-section">
        <h2>Budgets &amp; financial disclosures</h2>
        <div className="ccrmc-link-grid">
          {BUDGET_LINKS.map((l) => <LinkTile key={l.url} {...l} />)}
        </div>
      </section>

      <section className="ccrmc-section">
        <h2>Public health &amp; outbreaks</h2>
        <div className="ccrmc-link-grid">
          {PH_LINKS.map((l) => <LinkTile key={l.url} {...l} />)}
        </div>
      </section>

      <section className="ccrmc-section">
        <h2>Workforce, labor &amp; safety</h2>
        <div className="ccrmc-link-grid">
          {WORKFORCE_LINKS.map((l) => <LinkTile key={l.url} {...l} />)}
        </div>
      </section>

      <section className="ccrmc-section">
        <h2>Regulatory, accreditation &amp; oversight</h2>
        <div className="ccrmc-link-grid">
          {REGULATORY_LINKS.map((l) => <LinkTile key={l.url} {...l} />)}
        </div>
      </section>

      <div className="sources" style={{ marginTop: 24 }}>
        Sources: <a href="https://api.usaspending.gov" target="_blank" rel="noopener">USAspending</a>,
        {' '}<a href="https://data.cms.gov/provider-data/" target="_blank" rel="noopener">CMS Provider Data</a>,
        {' '}<a href="https://cchealth.org" target="_blank" rel="noopener">cchealth.org</a>,
        {' '}HCAI, FAC.gov, CDPH, CDC.
      </div>
    </div>
  );
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
