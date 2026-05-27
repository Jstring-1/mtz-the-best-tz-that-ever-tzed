'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { HousingPayload, RentSeriesPoint } from '@/lib/housing';

interface Props {
  label: string;
  tooltip?: string;
  data: HousingPayload | null;
}

// Body-only view — used inside the consolidated Indicators popup. The
// default export below wraps this in a standalone Modal + chip for any
// direct embedders that still want the old behavior.
export function HousingBody({ data }: { data: HousingPayload | null }) {
  if (!data) return <p className="muted">No housing cache. Run /admin → 1d.</p>;
  return (
    <>
            <p className="muted bills-legend" style={{ margin: 0 }}>
              Rent index from{' '}
              <a href="https://www.zillow.com/research/data/" target="_blank" rel="noopener">Zillow Research (ZORI)</a>{' '}and
              ZIP-level survey data from the{' '}
              <a href="https://www.census.gov/programs-surveys/acs/" target="_blank" rel="noopener">U.S. Census Bureau ACS</a>.
            </p>
            <p className="bills-cached muted">
              Cached {new Date(data.scrapedAt).toLocaleString()}.
            </p>

            {data.zillow ? (
              <section className="housing-panel">
                <div className="housing-head">
                  <strong>Typical rent — Martinez</strong>
                  <span className="muted" style={{ fontSize: '.78em' }}>
                    Zillow ZORI · all home types
                  </span>
                </div>
                <div className="housing-headline">
                  <span className="housing-big">{fmtMoney(data.zillow.currentRent)}</span>
                  <span className="muted">/ mo</span>
                  {data.zillow.yoyPct != null && (
                    <span className={`housing-delta ${data.zillow.yoyPct >= 0 ? 'up' : 'down'}`}>
                      {data.zillow.yoyPct >= 0 ? '↑' : '↓'} {Math.abs(data.zillow.yoyPct).toFixed(1)}% YoY
                    </span>
                  )}
                </div>
                {data.zillow.asOf && (
                  <div className="muted" style={{ fontSize: '.85em' }}>
                    As of {fmtMonth(data.zillow.asOf)}
                  </div>
                )}
                {data.zillow.series.length > 1 && (
                  <RentSparkline series={data.zillow.series} />
                )}
              </section>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>
                Zillow ZORI returned no data this run.
              </p>
            )}

            {data.census ? (
              <section className="housing-panel">
                <div className="housing-head">
                  <strong>ZIP 94553 — Census ACS 5-year</strong>
                  {data.census.vintage && (
                    <span className="muted" style={{ fontSize: '.78em' }}>
                      vintage {data.census.vintage}
                    </span>
                  )}
                </div>
                <dl className="econ-kv">
                  {data.census.medianHomeValue != null && (
                    <>
                      <dt>Median home value</dt>
                      <dd className="big">{fmtMoney(data.census.medianHomeValue)}</dd>
                    </>
                  )}
                  {data.census.medianGrossRent != null && (
                    <>
                      <dt>Median gross rent</dt>
                      <dd className="big">{fmtMoney(data.census.medianGrossRent)}<span className="muted"> / mo</span></dd>
                    </>
                  )}
                </dl>
                <p className="muted" style={{ fontSize: '.78em', marginTop: 4 }}>
                  ACS 5-year estimates lag ~14 months — they smooth across the
                  most recent 5 survey years and reflect what residents
                  actually pay, not asking-price.
                </p>
              </section>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>
                {(() => {
                  const detail = data.status.census_acs_zip?.detail ?? '';
                  if (detail === 'CENSUS_API_KEY not set') {
                    return <>Census ACS needs a free API key. Sign up at <a href="https://api.census.gov/data/key_signup.html" target="_blank" rel="noopener">api.census.gov</a>, set <code>CENSUS_API_KEY</code> in Railway env, then re-run <code>/admin → 1d</code>.</>;
                  }
                  if (/Invalid Key/i.test(detail)) {
                    return <>Census rejected the API key as <strong>Invalid Key</strong>. Check your email from <code>census.data@census.gov</code> for the activation link — Census keys don&rsquo;t work until you click it. Also verify the env var has no whitespace and is the full 40-char hex string.</>;
                  }
                  return `Census ACS returned no ZIP 94553 row this run${detail ? ` (${detail})` : ''}.`;
                })()}
              </p>
            )}

            <details style={{ marginTop: 14 }}>
              <summary className="muted" style={{ fontSize: '.78em', cursor: 'pointer' }}>
                Data freshness — per source
              </summary>
              <dl className="econ-kv" style={{ marginTop: 6 }}>
                {Object.entries(data.status).map(([k, s]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd className={s.ok ? 'big' : 'muted'} style={{ textAlign: 'left' }}>
                      {s.ok ? 'ok' : (s.detail ?? 'failed')}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
    </>
  );
}

// Legacy standalone civic-bar chip — wraps HousingBody inside a Modal.
export default function HousingDetail({ label, tooltip, data }: Props) {
  const [open, setOpen] = useUrlBool('housing');
  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Housing — Martinez market" size="md">
        <HousingBody data={data} />
      </Modal>
    </>
  );
}

// 24-month rent sparkline — same SVG pattern as the Flu tab.
function RentSparkline({ series }: { series: RentSeriesPoint[] }) {
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 240, H = 36, P = 2;
  const pts = series.map((p, i) => {
    const x = P + (i / (series.length - 1)) * (W - 2 * P);
    const y = H - P - ((p.value - min) / span) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div className="housing-spark">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="24-month rent trend">
        <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="muted" style={{ fontSize: '.72em' }}>
        last {series.length}mo · range ${Math.round(min).toLocaleString()}–${Math.round(max).toLocaleString()}
      </span>
    </div>
  );
}

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
