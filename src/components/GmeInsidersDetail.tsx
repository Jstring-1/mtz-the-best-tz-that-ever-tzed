'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { GmeInsidersPayload } from '@/lib/gme-insiders';

const n0 = (n: number | null | undefined) => (typeof n === 'number' ? Math.round(n).toLocaleString('en-US') : '—');
const pct = (n: number | null | undefined, d = 2) => (typeof n === 'number' ? `${n.toFixed(d)}%` : '—');

const CODE: Record<string, string> = {
  P: 'Bought', S: 'Sold', A: 'Award', F: 'Tax withheld', G: 'Gift', M: 'Exercise', J: 'Other', D: 'Returned', C: 'Conversion',
};

function net(p: GmeInsidersPayload['people'][number]): string {
  if (p.boughtLast90d === 0 && p.soldLast90d === 0) return '—';
  const parts: string[] = [];
  if (p.boughtLast90d) parts.push(`+${n0(p.boughtLast90d)}`);
  if (p.soldLast90d) parts.push(`−${n0(p.soldLast90d)}`);
  return parts.join(' / ');
}

// Popup with the GameStop insider grid. Opened from the Markets block via
// ?gme=1. Data comes from the `gme_insiders` cache (SEC Form 3/4/5 + Yahoo).
export default function GmeInsidersDetail({ data }: { data: GmeInsidersPayload | null }) {
  const [open, setOpen] = useUrlBool('gme');
  const y = data?.yahoo ?? null;
  const out = data?.outstanding ?? null;

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="GameStop (GME) — insiders & ownership" size="xl">
      {!data ? (
        <p className="muted">Not cached yet — run /admin → 1h.</p>
      ) : (
        <>
          <ul className="gme-stats">
            {y && (
              <li>
                <b>Ownership</b>{' '}
                Insiders {pct(y.insidersPct, 1)} · Institutions {pct(y.institutionsPct, 1)} · Combined{' '}
                {pct(y.insidersPct != null && y.institutionsPct != null ? y.insidersPct + y.institutionsPct : null, 1)}
                <span className="muted"> (Yahoo Finance)</span>
              </li>
            )}
            {y && (
              <li>
                <b>Short interest</b>{' '}
                {n0(y.sharesShort)} sh · {pct(y.shortPctFloat, 1)} of float · {y.shortRatio?.toFixed(2) ?? '—'} days to cover
                {y.shortAsOf && <span className="muted"> (as of {y.shortAsOf})</span>}
              </li>
            )}
            {out && (
              <li>
                <b>Shares outstanding</b> {n0(out.shares)} <span className="muted">(10-Q cover, {out.asOf})</span>
              </li>
            )}
          </ul>

          <div className="gme-wrap">
            <table className="gme-table">
              <thead>
                <tr>
                  <th>Insider</th>
                  <th className="num">Common shares</th>
                  <th className="num">Warrants¹</th>
                  <th className="num">Unvested RSUs¹</th>
                  <th className="num">% out²</th>
                  <th className="num">Pledged¹</th>
                  <th>Last 90 days</th>
                  <th>Last filing</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.cik}>
                    <td>
                      <b>{p.name}</b>
                      <span className="gme-role">{p.title}</span>
                    </td>
                    <td className="num">
                      {n0(p.common)}
                      {p.indirect > 0 && <span className="gme-role">{p.direct > 0 ? `${n0(p.direct)} direct + ${n0(p.indirect)} via ${p.indirectNote || 'indirect'}` : `held via ${p.indirectNote || 'indirect'}`}</span>}
                    </td>
                    <td className="num">{p.warrants == null ? '—' : n0(p.warrants)}</td>
                    <td className="num">{p.rsus == null ? '—' : n0(p.rsus)}</td>
                    <td className="num">{p.pctOfOutstanding == null ? '—' : pct(p.pctOfOutstanding)}</td>
                    <td className="num">{p.pledged ? n0(p.pledged) : '—'}</td>
                    <td className={p.soldLast90d > p.boughtLast90d ? 'dir-down' : p.boughtLast90d ? 'dir-up' : ''}>{net(p)}</td>
                    <td>
                      {p.lastAction ? `${CODE[p.lastAction.code] ?? p.lastAction.code} ${n0(p.lastAction.shares)}` : '—'}
                      <span className="gme-role">{p.lastAction?.date ?? p.lastFiled}{p.lastAction?.price ? ` @ $${p.lastAction.price.toFixed(2)}` : ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><b>All listed insiders</b></td>
                  <td className="num"><b>{n0(data.totals.common)}</b></td>
                  <td className="num"><b>{n0(data.totals.warrants)}</b></td>
                  <td className="num"><b>{n0(data.totals.rsus)}</b></td>
                  <td className="num"><b>{pct(data.totals.pctOfOutstanding)}</b></td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          <h4 className="gme-h">Recent insider transactions</h4>
          <ul className="gme-tx">
            {data.recent.slice(0, 15).map((t, i) => (
              <li key={`${t.url}-${i}`}>
                <span className="gme-date">{t.date}</span>{' '}
                <b>{t.name}</b>{' '}
                <span className={t.code === 'P' ? 'dir-up' : t.code === 'S' ? 'dir-down' : ''}>{CODE[t.code] ?? t.code}</span>{' '}
                {n0(t.shares)} sh{t.price ? ` @ $${t.price.toFixed(2)}` : ''}
                <span className="muted"> → holds {n0(t.post)} · </span>
                <a href={t.url} target="_blank" rel="noopener">Form</a>
              </li>
            ))}
          </ul>

          <p className="gme-foot muted">
            Common shares are the balance after each person&apos;s latest SEC Form 3/4/5 (updated {new Date(data.fetchedAt).toLocaleDateString('en-US')}).
            ¹ Warrants, unvested RSUs and pledged shares are from the{' '}
            <a href={data.proxyUrl} target="_blank" rel="noopener">2026 proxy statement</a> (as of {data.proxyAsOf}); Form 4s don&apos;t report them.
            ² Common shares only, divided by shares outstanding.{' '}
            <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001326380&type=4&dateb=&owner=only&count=40" target="_blank" rel="noopener">All Form 4s on EDGAR →</a>
          </p>
        </>
      )}
    </Modal>
  );
}
