'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';

interface CfdaProgram { number: string; title: string; objectives: string }
interface Officer { name?: string; amount?: number }
interface GrantDetail {
  amount: number;
  outlay: number;
  typeLabel: string;
  category: string;
  description: string;
  periodStart: string;
  periodEnd: string;
  recipientName: string;
  recipientLocation: string;
  recipientCategories: string[];
  awardingAgency: string;
  fundingAgency: string;
  cfda: CfdaProgram[];
  executiveOfficers: Officer[];
  placeOfPerformance: string;
  usaSpendingUrl: string;
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${(n ?? 0).toLocaleString()}`;
}

function mapsUrl(addr: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}
function AddressWithMap({ addr }: { addr: string }) {
  return (
    <>
      {addr}{' '}
      <a
        className="map-link"
        href={mapsUrl(addr)}
        target="_blank"
        rel="noopener"
        title={`Open ${addr} in Google Maps`}
        aria-label={`Open ${addr} in Google Maps`}
      >↗ map</a>
    </>
  );
}

export default function GrantDetailModal({
  open, id, fallbackRecipient, onClose,
}: { open: boolean; id: string; fallbackRecipient?: string; onClose: () => void }) {
  const [data, setData] = useState<GrantDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null); setError(null); setLoading(true);
    fetch(`/api/grant-detail?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<GrantDetail>;
      })
      .then((j) => { if (!cancelled) setData(j); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, id]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data?.recipientName || fallbackRecipient || 'Federal award'}
      size="lg"
    >
      {loading && <p className="muted">Loading award detail…</p>}
      {error && <p className="muted">Couldn’t load: {error}</p>}
      {data && (
        <div className="grant-detail">
          <dl className="bill-kv">
            {data.amount > 0       && <><dt>Total obligated</dt><dd>{fmtMoney(data.amount)}</dd></>}
            {data.outlay > 0       && <><dt>Outlaid</dt><dd>{fmtMoney(data.outlay)}</dd></>}
            {data.typeLabel        && <><dt>Award type</dt><dd>{data.typeLabel}</dd></>}
            {data.category         && <><dt>Category</dt><dd>{data.category}</dd></>}
            {data.recipientLocation && (
              <><dt>Recipient</dt><dd><AddressWithMap addr={data.recipientLocation} /></dd></>
            )}
            {data.placeOfPerformance && (
              <><dt>Place of performance</dt><dd><AddressWithMap addr={data.placeOfPerformance} /></dd></>
            )}
            {data.awardingAgency   && <><dt>Awarding agency</dt><dd>{data.awardingAgency}</dd></>}
            {data.fundingAgency && data.fundingAgency !== data.awardingAgency &&
              <><dt>Funding agency</dt><dd>{data.fundingAgency}</dd></>}
            {(data.periodStart || data.periodEnd) && (
              <><dt>Period of performance</dt><dd>{[data.periodStart, data.periodEnd].filter(Boolean).join(' — ')}</dd></>
            )}
          </dl>

          {data.description && (
            <>
              <h3 className="bill-h">Description</h3>
              <p className="grant-desc">{data.description}</p>
            </>
          )}

          {data.cfda.length > 0 && (
            <>
              <h3 className="bill-h">Federal program (CFDA)</h3>
              {data.cfda.map((c, i) => (
                <div key={i} className="grant-cfda">
                  <div className="num">{c.number} — {c.title}</div>
                  {c.objectives && <p className="objectives">{c.objectives}</p>}
                </div>
              ))}
            </>
          )}

          {data.executiveOfficers.length > 0 && (
            <>
              <h3 className="bill-h">Top compensated officers (recipient)</h3>
              <ul className="grant-officers">
                {data.executiveOfficers.map((o, i) => (
                  <li key={i}>
                    <span>{o.name}</span>
                    {o.amount != null && <span className="amt">{fmtMoney(o.amount)}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <p style={{ marginTop: 14 }}>
            <a className="event-modal-btn primary" href={data.usaSpendingUrl} target="_blank" rel="noopener">
              Full record on USAspending.gov →
            </a>
          </p>
        </div>
      )}
    </Modal>
  );
}
