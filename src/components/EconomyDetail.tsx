'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { GovNationalPayload } from '@/lib/gov';

// Yahoo-shaped quote we cache under '12D_stocks' (one entry per
// STOCK_SYMBOLS member in cron.ts). All numeric fields are strings.
interface StockQuote {
  symbol: string;
  name: string;
  close: string;
  previous_close: string;
  change: string;
  percent_change: string;
  is_market_open?: boolean;
  fifty_two_week?: { low: string; high: string };
}

interface Props {
  label: string;
  tooltip?: string;
  data: GovNationalPayload['economy'] | null;
  stocks?: Record<string, StockQuote> | null;
}

// Display order + friendly names for the major macro indexes we cache.
// Anything in STOCK_SYMBOLS that isn't listed here (GME, PSLV, ...) is
// shown under a separate "Other holdings" section.
const MACRO_INDEX_ORDER: Array<{ symbol: string; label: string; hint: string }> = [
  { symbol: '^GSPC', label: 'S&P 500',     hint: '500 large-cap U.S. stocks' },
  { symbol: '^DJI',  label: 'Dow Jones',   hint: '30 industrial blue chips' },
  { symbol: '^IXIC', label: 'NASDAQ',      hint: 'tech-heavy composite' },
  { symbol: '^RUT',  label: 'Russell 2000',hint: 'small-cap U.S. stocks' },
  { symbol: '^VIX',  label: 'VIX',         hint: 'expected S&P volatility — "fear index"' },
];

function fmtNum(s: string): string {
  const n = Number(s);
  if (!isFinite(n)) return s;
  // Big absolute values get commas; sub-100 gets two decimals.
  return n.toLocaleString('en-US', {
    minimumFractionDigits: n >= 1000 ? 0 : 2,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}
function fmtPct(s: string): string {
  const n = Number(s);
  if (!isFinite(n)) return s;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}
function direction(s: string): 'up' | 'down' | 'flat' {
  const n = Number(s);
  if (!isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

function IndexCard({ q, label, hint }: { q: StockQuote; label: string; hint: string }) {
  const d = direction(q.percent_change);
  return (
    <div className="econ-index">
      <div className="econ-index-head">
        <span className="econ-index-name" title={hint}>{label}</span>
        <span className="econ-index-sym">{q.symbol}</span>
      </div>
      <div className="econ-index-price">{fmtNum(q.close)}</div>
      <div className={`econ-index-change dir-${d}`}>
        {d === 'up' ? '▲' : d === 'down' ? '▼' : '·'} {fmtPct(q.percent_change)}
      </div>
    </div>
  );
}

export default function EconomyDetail({ label, tooltip, data, stocks }: Props) {
  const [open, setOpen] = useUrlBool('econ');

  const indexCards = MACRO_INDEX_ORDER
    .map((m) => ({ ...m, q: stocks?.[m.symbol] }))
    .filter((m): m is typeof m & { q: StockQuote } => !!m.q);

  // Treasury 10Y yield called out as a featured number — most-watched
  // single bond rate. Tries the yields array first, falls back to ^TNX
  // proxy from the stock cache if available later.
  const tenYear = data?.yields.find((y) => /^10[\s-]?(yr|year|y)/i.test(y.maturity))
    ?? data?.yields.find((y) => y.maturity.toLowerCase().includes('10'));

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="U.S. economy — at a glance" size="lg">
        {!data && !stocks ? (
          <p className="muted">Cache empty — run /admin → 4h.</p>
        ) : (
          <>
            {indexCards.length > 0 && (
              <section>
                <h3 className="rep-h" style={{ marginTop: 0 }}>Major indexes</h3>
                <div className="econ-index-grid">
                  {indexCards.map((c) => <IndexCard key={c.symbol} q={c.q} label={c.label} hint={c.hint} />)}
                </div>
                <p className="muted" style={{ fontSize: '.72em', marginTop: 4 }}>
                  Source: Yahoo Finance via the 5-minute stocks cron. Markets close ~1pm Pacific.
                </p>
              </section>
            )}

            <section style={{ marginTop: 18 }}>
              <h3 className="rep-h">Macro headlines</h3>
              <dl className="econ-kv">
                <dt>Federal debt</dt>
                <dd className="big">{data?.debt?.total ?? '—'}</dd>
                <dt>as of</dt>
                <dd className="muted">{data?.debt?.date ?? '—'}</dd>

                <dt>U.S. unemployment</dt>
                <dd className="big">{data?.unemployment?.value ?? '—'}</dd>
                <dt>period</dt>
                <dd className="muted">{data?.unemployment?.period ?? '—'}</dd>

                <dt>CPI year-over-year</dt>
                <dd className="big">{data?.cpiYoY?.value ?? '—'}</dd>
                <dt>period</dt>
                <dd className="muted">{data?.cpiYoY?.period ?? '—'}</dd>

                {tenYear && (
                  <>
                    <dt>10-year Treasury</dt>
                    <dd className="big">{tenYear.rate}</dd>
                    <dt></dt>
                    <dd className="muted">benchmark long-term rate</dd>
                  </>
                )}
              </dl>
            </section>

            {data && data.yields.length > 0 && (
              <section style={{ marginTop: 18 }}>
                <h3 className="rep-h">Treasury yield curve</h3>
                <div className="gov-yields">
                  {data.yields.map((y) => (
                    <div key={y.maturity} className="gov-yield">
                      <div className="m">{y.maturity}</div>
                      <div className="r">{y.rate}</div>
                    </div>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: '.72em', marginTop: 4 }}>
                  When short-end rates exceed long-end (an "inverted yield curve")
                  has historically preceded recessions.
                </p>
              </section>
            )}

            <div className="popup-ext-links">
              <a href="https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/" target="_blank" rel="noopener">Treasury Fiscal Data →</a>
              <a href="https://www.bls.gov/news.release/empsit.toc.htm" target="_blank" rel="noopener">BLS Employment Situation →</a>
              <a href="https://www.bls.gov/cpi/" target="_blank" rel="noopener">BLS CPI →</a>
              <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener">FRED (Fed economic data) →</a>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
