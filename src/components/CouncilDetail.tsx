'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';

interface Meeting {
  clipId: string;
  title: string;
  date: string;
  pubDate: string;
  agendaUrl?: string;
  minutesUrl?: string;
}
interface Payload {
  scrapedAt: string;
  meetings: Meeting[];
  diag?: {
    agendasItems?: number;
    minutesItems?: number;
    councilMeetings?: number;
    httpFailures?: string[];
  };
}

interface PdfRef { kind: 'Agenda' | 'Minutes'; url: string; meeting: Meeting }

function proxiedUrl(directUrl: string): string {
  // #pagemode=none asks the embedded PDF viewer (Chrome PDFium / Firefox
  // PDF.js) to open without the thumbnail sidebar so the page itself
  // gets the full width.
  return `/api/council-pdf?u=${encodeURIComponent(directUrl)}#pagemode=none`;
}

export default function CouncilDetail({ label, tooltip }: { label: string; tooltip?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfRef | null>(null);

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true); setError(null);
    fetch('/api/council-votes', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Payload>;
      })
      .then((j) => setData(j))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading]);

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Martinez City Council — meetings" size="lg">
        {loading && <p className="muted">Loading meetings…</p>}
        {error   && <p className="muted">Couldn’t load: {error}</p>}
        {data && data.meetings.length === 0 && (
          <p className="muted">No meetings cached yet. Re-run /admin → 12h.</p>
        )}
        {data && data.meetings.length > 0 && (
          <>
            <p className="muted" style={{ fontSize: '.85em', marginBottom: 10 }}>
              {data.meetings.length} meetings from the city's Granicus feed.
              Click <b>Agenda</b> or <b>Minutes</b> to read the PDF in-page.
            </p>
            <ul className="council-meetings">
              {data.meetings.map((m) => (
                <li key={m.clipId}>
                  <div className="meeting-head">
                    <span className="title">{m.title}</span>
                    {m.date && <span className="date">{m.date}</span>}
                  </div>
                  <div className="meeting-links">
                    {m.agendaUrl ? (
                      <button
                        type="button"
                        className="event-modal-btn"
                        onClick={() => setPdf({ kind: 'Agenda', url: m.agendaUrl!, meeting: m })}
                      >Agenda →</button>
                    ) : <span className="missing">no agenda</span>}
                    {m.minutesUrl ? (
                      <button
                        type="button"
                        className="event-modal-btn"
                        onClick={() => setPdf({ kind: 'Minutes', url: m.minutesUrl!, meeting: m })}
                      >Minutes →</button>
                    ) : <span className="missing">no minutes yet</span>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {data?.scrapedAt && (
          <p className="muted" style={{ fontSize: '.72em', marginTop: 12 }}>
            Cache scraped {new Date(data.scrapedAt).toLocaleString()}
          </p>
        )}
      </Modal>

      <Modal
        open={!!pdf}
        onClose={() => setPdf(null)}
        title={pdf ? `${pdf.kind} — ${pdf.meeting.title}` : ''}
        size="xl"
      >
        {pdf && (
          <div className="council-pdf-wrap">
            <iframe
              key={pdf.url}
              title={`${pdf.kind} for ${pdf.meeting.title}`}
              src={proxiedUrl(pdf.url)}
              className="council-pdf-frame"
              loading="lazy"
            />
            <p style={{ marginTop: 10 }}>
              <a
                className="event-modal-btn primary"
                href={pdf.url}
                target="_blank"
                rel="noopener"
              >Open original on Granicus →</a>
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
