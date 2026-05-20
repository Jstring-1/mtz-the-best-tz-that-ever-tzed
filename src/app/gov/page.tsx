import { getJson } from '@/lib/cache';
import type { GovNationalPayload } from '@/lib/gov';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Gov — health of the nation',
  robots: { index: false, follow: false },   // personal-use page
};

// Standalone page — root layout has no chrome (no weather/forecast/gov
// strips or footer). All data is read from the gov_national cache that
// the 4h cron populates.
export default async function GovPage() {
  let p: GovNationalPayload | null = null;
  try { p = await getJson<GovNationalPayload>('gov_national'); }
  catch { /* DB cold */ }

  return (
    <div className="gov-page">
      <header className="gov-hdr">
        <h1>Health of the Nation</h1>
        <p className="gov-sub">
          {p?.scrapedAt ? `Updated ${fmtRel(p.scrapedAt)}` : 'No data cached — run the 4h bucket on /admin.'}
        </p>
      </header>

      <section className="gov-grid">
        <section className="gov-card">
          <h2>Economy</h2>
          {p?.economy ? <Economy data={p.economy} /> : <p className="muted">—</p>}
        </section>

        <section className="gov-card">
          <h2>Active disasters & environment</h2>
          {p?.disasters ? <Disasters data={p.disasters} /> : <p className="muted">—</p>}
        </section>

        <section className="gov-card gov-card-wide">
          <h2>Recent recalls <span className="muted">({p?.recalls?.length ?? 0})</span></h2>
          {p?.recalls?.length ? <Recalls rows={p.recalls} /> : <p className="muted">—</p>}
        </section>

        <section className="gov-card gov-card-wide">
          <h2>Public health pulse</h2>
          {p?.health ? <Health data={p.health} /> : <p className="muted">—</p>}
        </section>
      </section>

      <footer className="gov-foot">
        Sources: U.S. Treasury Fiscal Data, BLS, openFDA, CPSC, FEMA, NASA EONET. Personal-use page; not indexed.
      </footer>
    </div>
  );
}

function fmtRel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const diff = (Date.now() - ms) / 60000;
  if (diff < 60) return `${diff.toFixed(0)} min ago`;
  if (diff < 1440) return `${(diff / 60).toFixed(1)} hr ago`;
  return `${(diff / 1440).toFixed(1)} d ago`;
}

function Economy({ data }: { data: GovNationalPayload['economy'] }) {
  return (
    <div className="gov-econ">
      <dl className="kv">
        <dt>Federal debt</dt>
        <dd>{data.debt ? `${data.debt.total} (${data.debt.date})` : '—'}</dd>
        <dt>U.S. unemployment</dt>
        <dd>{data.unemployment ? `${data.unemployment.value} (${data.unemployment.period})` : '—'}</dd>
        <dt>CPI YoY (CPI-U)</dt>
        <dd>{data.cpiYoY ? `${data.cpiYoY.value} (${data.cpiYoY.period})` : '—'}</dd>
      </dl>
      {data.yields.length > 0 && (
        <>
          <h3 className="kv-h">Treasury yield curve (today)</h3>
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
    </div>
  );
}

function Recalls({ rows }: { rows: GovNationalPayload['recalls'] }) {
  return (
    <ul className="gov-list">
      {rows.map((r, i) => (
        <li key={i} className="gov-recall">
          <div className="row1">
            <span className="src">{r.source}</span>
            <span className="date">{r.date || '—'}</span>
          </div>
          <div className="title">
            {r.url ? <a href={r.url} target="_blank" rel="noopener">{r.title}</a> : r.title}
          </div>
          {r.reason && <div className="reason muted">{r.reason}</div>}
        </li>
      ))}
    </ul>
  );
}

function Health({ data }: { data: GovNationalPayload['health'] }) {
  return (
    <>
      <p className="muted">
        Recent drug recalls (FDA, ~30d): <b>{data.recentDrugRecalls}</b>.
        Detailed CDC weekly respiratory-virus activity is pending a stable public endpoint.
      </p>
      <ul className="gov-list">
        {data.topDrugRecalls.map((r, i) => (
          <li key={i} className="gov-recall">
            <div className="row1"><span className="src">{r.source}</span><span className="date">{r.date}</span></div>
            <div className="title">{r.title}</div>
            {r.reason && <div className="reason muted">{r.reason}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Disasters({ data }: { data: GovNationalPayload['disasters'] }) {
  return (
    <>
      <h3 className="kv-h">FEMA active declarations</h3>
      {data.fema.length === 0 ? <p className="muted">—</p> : (
        <ul className="gov-list">
          {data.fema.slice(0, 8).map((d, i) => (
            <li key={i} className="gov-row">
              <span className="badge">{d.state}</span>
              <span className="title">{d.title || d.type}</span>
              <span className="date">{d.declared}</span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="kv-h">NASA EONET — open natural events</h3>
      {data.eonet.length === 0 ? <p className="muted">—</p> : (
        <ul className="gov-list">
          {data.eonet.slice(0, 8).map((e, i) => (
            <li key={i} className="gov-row">
              <span className="badge">{e.category}</span>
              <span className="title">
                {e.url ? <a href={e.url} target="_blank" rel="noopener">{e.title}</a> : e.title}
              </span>
              <span className="date">{e.date}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
