'use client';

import { useState } from 'react';
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

function IndexCard({ q, label, hint, active, onToggle }: {
  q: StockQuote;
  label: string;
  hint: string;
  active: boolean;
  onToggle: () => void;
}) {
  const d = direction(q.percent_change);
  return (
    <button
      type="button"
      className={`econ-index clickable${active ? ' active' : ''}`}
      onClick={onToggle}
      aria-expanded={active}
      title={hint}
    >
      <div className="econ-index-head">
        <span className="econ-index-name">{label}</span>
        <span className="econ-index-sym">{q.symbol}</span>
      </div>
      <div className="econ-index-price">{fmtNum(q.close)}</div>
      <div className={`econ-index-change dir-${d}`}>
        {d === 'up' ? '▲' : d === 'down' ? '▼' : '·'} {fmtPct(q.percent_change)}
      </div>
    </button>
  );
}

// Drawer shown below the index grid when one is selected. Pulls out
// the remaining StockQuote fields (previous close, 52w range, market
// status) — most of which we already cache but never previously
// surfaced.
function IndexDrawer({ q, label, hint }: { q: StockQuote; label: string; hint: string }) {
  const d = direction(q.percent_change);
  const change = Number(q.change);
  const close = Number(q.close);
  const prev = Number(q.previous_close);
  const low = q.fifty_two_week ? Number(q.fifty_two_week.low) : NaN;
  const high = q.fifty_two_week ? Number(q.fifty_two_week.high) : NaN;
  // Position of current price within the 52w range — used to render a
  // little progress-bar style indicator.
  const rangePos = (isFinite(low) && isFinite(high) && high > low)
    ? Math.max(0, Math.min(1, (close - low) / (high - low)))
    : null;
  return (
    <section className="econ-drawer">
      <div className="econ-drawer-head">
        <div>
          <strong>{label}</strong> <span className="muted">{q.symbol}</span>
        </div>
        <span className={`econ-drawer-status ${q.is_market_open ? 'open' : 'closed'}`}>
          {q.is_market_open ? 'Market open' : 'Market closed'}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 4, fontSize: '.85em' }}>{hint}</p>
      <dl className="econ-drawer-kv">
        <dt>Last price</dt>
        <dd className={`big dir-${d}`}>{fmtNum(q.close)}</dd>
        <dt>Change</dt>
        <dd className={`dir-${d}`}>
          {isFinite(change) ? (change > 0 ? '+' : '') + fmtNum(q.change) : q.change}
          {' '}({fmtPct(q.percent_change)})
        </dd>
        <dt>Previous close</dt>
        <dd>{isFinite(prev) ? fmtNum(q.previous_close) : '—'}</dd>
        {q.fifty_two_week && (
          <>
            <dt>52-week low</dt>
            <dd>{isFinite(low) ? fmtNum(q.fifty_two_week.low) : '—'}</dd>
            <dt>52-week high</dt>
            <dd>{isFinite(high) ? fmtNum(q.fifty_two_week.high) : '—'}</dd>
          </>
        )}
      </dl>
      {rangePos != null && (
        <div className="econ-drawer-range" title="Position within 52-week range">
          <div className="bar"><div className="dot" style={{ left: `${rangePos * 100}%` }} /></div>
          <div className="ends">
            <span>{fmtNum(String(low))}</span>
            <span>{fmtNum(String(high))}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export default function EconomyDetail({ label, tooltip, data, stocks }: Props) {
  const [open, setOpen] = useUrlBool('econ');
  // Which index card has its drawer expanded (click-to-toggle).
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);

  const indexCards = MACRO_INDEX_ORDER
    .map((m) => ({ ...m, q: stocks?.[m.symbol] }))
    .filter((m): m is typeof m & { q: StockQuote } => !!m.q);
  const activeCard = openSymbol
    ? indexCards.find((c) => c.symbol === openSymbol) ?? null
    : null;

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
                  {indexCards.map((c) => (
                    <IndexCard
                      key={c.symbol}
                      q={c.q}
                      label={c.label}
                      hint={c.hint}
                      active={openSymbol === c.symbol}
                      onToggle={() => setOpenSymbol(openSymbol === c.symbol ? null : c.symbol)}
                    />
                  ))}
                </div>
                {activeCard && (
                  <IndexDrawer q={activeCard.q} label={activeCard.label} hint={activeCard.hint} />
                )}
                <p className="muted" style={{ fontSize: '.72em', marginTop: 4 }}>
                  Source: Yahoo Finance via the 5-minute stocks cron. Markets close ~1pm Pacific.
                  Click an index for more detail.
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
