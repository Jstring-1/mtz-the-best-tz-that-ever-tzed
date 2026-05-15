'use client';

import { useEffect, useRef, useState } from 'react';

// Twelvedata /quote response shape (loosely typed — all numerics arrive
// as strings).
export interface TwelveQuote {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  average_volume?: string;
  is_market_open?: boolean;
  market_state?: string;
  fifty_two_week?: { low?: string; high?: string; range?: string };
  // present on errors instead of price data
  status?: string;
  code?: number;
  message?: string;
}

export interface StockEntry {
  display: string;
  name: string;
  yahooUrl: string;
  quote: TwelveQuote | null;
}

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function fmt(n: number | null, digits = 2): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function StocksClient({ stocks, compact = false }: { stocks: StockEntry[]; compact?: boolean }) {
  const dlgRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<StockEntry | null>(null);

  useEffect(() => {
    const d = dlgRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Compact: flat inline buttons designed to flow inside .wx-strip — no
  // wrapper div, no price column, just sym + colored % change.
  if (compact) {
    return (
      <>
        {stocks.map((s) => {
          const pct = num(s.quote?.percent_change);
          const trend = pct == null ? 'flat' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
          return (
            <button
              key={s.display}
              type="button"
              className={`stock-mini ${trend}`}
              onClick={() => setOpen(s)}
              title={`${s.name} — click for details`}
            >
              <span className="sym">{s.display}</span>
              <span className="pct">
                {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '·'}
                {pct == null ? '—' : `${Math.abs(pct).toFixed(2)}%`}
              </span>
            </button>
          );
        })}
        <dialog
          className="stock-modal"
          ref={dlgRef}
          onClose={() => setOpen(null)}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}
        >
          {open && <StockModalBody s={open} onClose={() => setOpen(null)} />}
        </dialog>
      </>
    );
  }

  return (
    <>
      <div className="stocks-strip" role="list">
        {stocks.map((s) => {
          const pct = num(s.quote?.percent_change);
          const close = num(s.quote?.close);
          const trend = pct == null ? 'flat' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
          return (
            <button
              key={s.display}
              type="button"
              className={`stock-cell ${trend}`}
              onClick={() => setOpen(s)}
              title={`${s.name} — click for details`}
              role="listitem"
            >
              <span className="sym">{s.display}</span>
              <span className="price">{fmt(close, close != null && close < 100 ? 2 : 0)}</span>
              <span className="pct">
                {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '·'}{' '}
                {pct == null ? '—' : `${Math.abs(pct).toFixed(2)}%`}
              </span>
            </button>
          );
        })}
      </div>

      <dialog
        className="stock-modal"
        ref={dlgRef}
        onClose={() => setOpen(null)}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}
      >
        {open && <StockModalBody s={open} onClose={() => setOpen(null)} />}
      </dialog>
    </>
  );
}

function StockModalBody({ s, onClose }: { s: StockEntry; onClose: () => void }) {
  const q = s.quote ?? {};
  const close = num(q.close);
  const prev  = num(q.previous_close);
  const change = num(q.change);
  const pct   = num(q.percent_change);
  const open  = num(q.open);
  const hi    = num(q.high);
  const lo    = num(q.low);
  const w52lo = num(q.fifty_two_week?.low);
  const w52hi = num(q.fifty_two_week?.high);
  const trend = pct == null ? 'flat' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';

  return (
    <div className="stock-modal-content">
      <button className="stock-modal-close" onClick={onClose} aria-label="Close">×</button>

      <h2 className="stock-modal-title">
        <span className="sym">{s.display}</span>
        <span className="muted">— {s.name}</span>
      </h2>

      <div className="stock-modal-price">
        <span className="now">{fmt(close)}</span>
        <span className={`change ${trend}`}>
          {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '·'}{' '}
          {change == null ? '—' : (change >= 0 ? '+' : '') + fmt(change)}{' '}
          ({pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`})
        </span>
      </div>

      <dl className="stock-modal-kv">
        {open  != null && <><dt>Open</dt>          <dd>{fmt(open)}</dd></>}
        {prev  != null && <><dt>Previous close</dt><dd>{fmt(prev)}</dd></>}
        {hi    != null && <><dt>Day high</dt>      <dd>{fmt(hi)}</dd></>}
        {lo    != null && <><dt>Day low</dt>       <dd>{fmt(lo)}</dd></>}
        {(w52lo != null || w52hi != null) && (
          <><dt>52-week range</dt><dd>{fmt(w52lo)} — {fmt(w52hi)}</dd></>
        )}
        {q.exchange && <><dt>Exchange</dt><dd>{q.exchange}{q.currency ? ` · ${q.currency}` : ''}</dd></>}
        {q.datetime && <><dt>As of</dt><dd>{q.datetime}</dd></>}
      </dl>

      <div className="stock-modal-actions">
        <a className="stock-modal-btn primary" href={s.yahooUrl} target="_blank" rel="noopener">
          Open on Yahoo Finance →
        </a>
      </div>

      {!s.quote && (
        <p className="muted" style={{ fontSize: '.85em', marginTop: 8 }}>
          No data cached yet — run <code>/api/cron?bucket=5m</code> from /admin.
        </p>
      )}
    </div>
  );
}
