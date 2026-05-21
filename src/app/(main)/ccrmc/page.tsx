import { getJson, getAllJsonTimestamps } from '@/lib/cache';
import { relativeFromIso } from '@/lib/time';
import type { CcrmcPayload } from '@/lib/ccrmc';
import GrantsDetail from '@/components/GrantsDetail';
import CcrmcQuality from '@/components/CcrmcQuality';

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
  { label: 'CCC budget book — Health Services',
    url:   'https://county-contra-costa-ca-budget-book.cleargov.com/',
    note:  "Open the county's ClearGov budget book; HSD section under departmental detail." },
  { label: 'CA HCAI — Hospital annual financial data',
    url:   'https://hcai.ca.gov/data-and-reports/hospital-annual-financial-data/',
    note:  'Every CA hospital files unaudited & audited financials annually (CCRMC included).' },
  { label: 'FAC.gov — Single Audits for CCC',
    url:   'https://app.fac.gov/dissemination/search/',
    note:  "Search auditee_name 'Contra Costa County' to pull federal-expenditure schedules and findings." },
  { label: 'Contra Costa County Open Budget',
    url:   'https://www.contracosta.ca.gov/770/Budget-Documents',
    note:  'Adopted budget, mid-year reports, CIP, and ACFR PDFs straight from the county.' },
];

const PH_LINKS = [
  { label: 'CDPH — Disease surveillance & outbreaks',
    url:   'https://www.cdph.ca.gov/Programs/CID/DCDC/Pages/Communicable-Disease-Control.aspx',
    note:  'State communicable disease surveillance, alerts, outbreak reports.' },
  { label: 'CDC — Healthcare-Associated Infections',
    url:   'https://www.cdc.gov/nhsn/datastat/index.html',
    note:  'NHSN national HAI dashboards (CAUTI, CLABSI, SSI, C. difficile, MRSA).' },
  { label: 'CCC Health — Public Health division',
    url:   'https://cchealth.org/public-health',
    note:  'County public-health programs, disease dashboards, vital records.' },
  { label: 'CDPH Hospital Onsite Survey reports',
    url:   'https://www.cdph.ca.gov/Programs/CHCQ/LCP/Pages/HospitalsCAHs.aspx',
    note:  'State licensing & certification survey reports + complaint investigations.' },
];

const WORKFORCE_LINKS = [
  { label: 'HCAI — Hospital workforce / occupational survey',
    url:   'https://hcai.ca.gov/data/healthcare-workforce/',
    note:  "CA's official hospital workforce dataset (RN/LVN/MD counts, vacancy rates)." },
  { label: 'Cal-OSHA — DIR inspection records',
    url:   'https://www.dir.ca.gov/dosh/calosha-inspections.html',
    note:  'Workplace safety inspections and citations for CCRMC operations.' },
  { label: 'NLRB — Case search',
    url:   'https://www.nlrb.gov/search/case',
    note:  'Labor-relations filings; search "Contra Costa Regional".' },
  { label: 'Transparent California — CCC employees',
    url:   'https://transparentcalifornia.com/salaries/contra-costa-county/',
    note:  'Public-records salary database for county employees.' },
];

const REGULATORY_LINKS = [
  { label: 'CCC Board of Supervisors — meetings & agendas',
    url:   'https://www.contracosta.ca.gov/4541/Calendar-of-Meetings',
    note:  'Health Services items often appear on BOS agendas (budget, contracts, policy).' },
  { label: 'Joint Commission — Accreditation status',
    url:   'https://www.qualitycheck.org/',
    note:  'Search "Contra Costa Regional Medical Center" for accreditation history.' },
  { label: 'Leapfrog Hospital Safety Grade',
    url:   'https://www.hospitalsafetygrade.org/search?findBy=hospital&hospital=Contra+Costa+Regional',
    note:  'Independent letter-grade hospital safety scoring (twice/year).' },
  { label: 'CMS HAI public reporting',
    url:   `https://www.medicare.gov/care-compare/details/hospital/050075`,
    note:  "Full Care Compare profile with measure-level HAI and other stats." },
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
  const [payload, ts] = await Promise.all([
    getJson<CcrmcPayload>('ccrmc_data').catch(() => null),
    getAllJsonTimestamps(),
  ]);
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
      <p className="muted">
        Federal funding, CMS quality, public-health alerts, budgets, workforce, and news for{' '}
        Contra Costa Regional Medical Center (Martinez). Every section is shareable — copy the URL after opening any popup.
      </p>
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
            <dt>Founded</dt><dd>{facts.founded}</dd>
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

        <div className="ccrmc-section">
          <h2>News from cchealth.org</h2>
          {payload?.news.length ? (
            <ul className="ccrmc-news">
              {payload.news.slice(0, 8).map((n, i) => (
                <li key={i}>
                  <a href={n.url} target="_blank" rel="noopener">{n.title}</a>
                  {n.date && <span className="muted"> · {n.date}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">News scrape returned nothing — cchealth.org may have changed their layout. <a href="https://cchealth.org/news" target="_blank" rel="noopener">Visit cchealth.org/news directly →</a></p>
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
