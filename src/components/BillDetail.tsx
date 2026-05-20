'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';

interface BillData {
  number: string;
  title: string;
  policyArea: string;
  introducedDate: string;
  sponsor: string;
  latestAction: string;
  latestActionDate: string;
  summaryHtml: string;
  summaryDate: string;
  textHtmlUrl: string;
  textPdfUrl: string;
  congressUrl: string;
}

interface Props {
  open: boolean;
  congress: number;
  billType: string;
  billNumber: string;
  onClose: () => void;
}

export default function BillDetail({ open, congress, billType, billNumber, onClose }: Props) {
  const [data, setData] = useState<BillData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null); setError(null); setLoading(true);
    fetch(`/api/bill-detail?congress=${congress}&type=${billType}&number=${billNumber}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: BillData) => { if (!cancelled) setData(j); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, congress, billType, billNumber]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data ? `${data.number} — ${data.title.slice(0, 80)}${data.title.length > 80 ? '…' : ''}` : `${billType.toUpperCase()} ${billNumber}`}
      size="lg"
    >
      {loading && <p className="muted">Loading bill…</p>}
      {error && <p className="muted">Couldn’t load: {error}</p>}
      {data && (
        <div className="bill-detail">
          <dl className="bill-kv">
            {data.policyArea       && <><dt>Policy area</dt><dd>{data.policyArea}</dd></>}
            {data.sponsor          && <><dt>Sponsor</dt><dd>{data.sponsor}</dd></>}
            {data.introducedDate   && <><dt>Introduced</dt><dd>{data.introducedDate}</dd></>}
            {data.latestAction     && <><dt>Latest action</dt><dd>{data.latestAction}{data.latestActionDate && ` (${data.latestActionDate})`}</dd></>}
          </dl>

          {data.summaryHtml ? (
            <>
              <h3 className="bill-h">Summary{data.summaryDate ? ` (${data.summaryDate.slice(0, 10)})` : ''}</h3>
              <div className="bill-summary" dangerouslySetInnerHTML={{ __html: data.summaryHtml }} />
            </>
          ) : (
            <p className="muted">No CRS summary published yet for this bill.</p>
          )}

          <div className="bill-links">
            <a className="event-modal-btn primary" href={data.congressUrl} target="_blank" rel="noopener">
              View on Congress.gov →
            </a>
            {data.textHtmlUrl && (
              <a className="event-modal-btn" href={data.textHtmlUrl} target="_blank" rel="noopener">
                Full bill text (HTML) →
              </a>
            )}
            {data.textPdfUrl && (
              <a className="event-modal-btn" href={data.textPdfUrl} target="_blank" rel="noopener">
                PDF →
              </a>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
