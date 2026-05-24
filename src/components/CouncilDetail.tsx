'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import RepBioModal from './RepBioModal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import { councilOrdered, bioToRep } from '@/lib/reps-bios';

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
  const [open, setOpen] = useUrlBool('council');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Council member bio popup (shared URL state with RepsDetail — both
  // modals render the same RepBioModal when ?rbio=<slug> is set).
  const [bioSlug, setBioSlug] = useUrlString('rbio');
  const bioRep = useMemo(() => {
    if (!bioSlug) return null;
    const entry = councilOrdered().find((c) => c.slug === bioSlug);
    return entry ? bioToRep(entry.slug, entry.bio) : null;
  }, [bioSlug]);
  // Encode the nested PDF viewer as "<clipId>.<kind>" where kind is
  // "agenda" or "minutes".
  const [pdfStr, setPdfStr] = useUrlString('cpdf');
  const pdf = useMemo<PdfRef | null>(() => {
    if (!pdfStr || !data) return null;
    const dot = pdfStr.lastIndexOf('.');
    if (dot < 0) return null;
    const clipId = pdfStr.slice(0, dot);
    const kindRaw = pdfStr.slice(dot + 1).toLowerCase();
    const m = data.meetings.find((x) => x.clipId === clipId);
    if (!m) return null;
    if (kindRaw === 'agenda'  && m.agendaUrl)  return { kind: 'Agenda',  url: m.agendaUrl,  meeting: m };
    if (kindRaw === 'minutes' && m.minutesUrl) return { kind: 'Minutes', url: m.minutesUrl, meeting: m };
    return null;
  }, [pdfStr, data]);
  const setPdf = (p: PdfRef | null) =>
    setPdfStr(p ? `${p.meeting.clipId}.${p.kind.toLowerCase()}` : null);

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
        {/* Council member strip — Mayor + 4 council members. Click any
            face to open the same bio modal that RepsDetail uses. */}
        <div className="council-strip">
          {councilOrdered().map(({ slug, bio }) => (
            <button
              key={slug}
              type="button"
              className="council-strip-item"
              onClick={() => setBioSlug(slug)}
              title={`${bio.fullName} — ${bio.office}`}
            >
              {bio.photoFile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/img/${bio.photoFile}`} alt={bio.fullName} className="council-strip-photo" />
              ) : (
                <div className="council-strip-photo placeholder">
                  {bio.fullName[0]}
                </div>
              )}
              <div className="council-strip-name">{bio.fullName}</div>
              <div className="council-strip-office">{bio.office}{bio.district ? ` · ${bio.district}` : ''}</div>
            </button>
          ))}
        </div>

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

      {bioRep && <RepBioModal rep={bioRep} onClose={() => setBioSlug(null)} />}

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
