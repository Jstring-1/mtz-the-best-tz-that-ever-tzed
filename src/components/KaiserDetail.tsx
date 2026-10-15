'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import { useUrlBool, useUrlString } from '@/lib/useUrlState';
import {
  KAISER_PLAN_YEAR, KAISER_PLANS, KAISER_TABLE, KAISER_TABLE_NOTE, KAISER_CHANGES_2027,
  KAISER_ENROLLMENT, KAISER_CONTACTS, KAISER_DOCS,
} from '@/lib/kaiser-data';

interface Props { label: string; tooltip?: string }

// Civic-strip popup for Kaiser Permanente coverage as offered to Contra Costa
// County employees. Static content (county benefits guide) + bundled PDFs that
// open in a nested viewer with Ctrl+F support, same as the CCH popup.
export default function KaiserDetail({ label, tooltip }: Props) {
  const [open, setOpen] = useUrlBool('kaiser');
  const [docSlug, setDocSlug] = useUrlString('kdoc');
  const focusedDoc = useMemo(() => (docSlug ? KAISER_DOCS.find((d) => d.slug === docSlug) ?? null : null), [docSlug]);
  const groups = useMemo(() => [...new Set(KAISER_DOCS.map((d) => d.group))], []);

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Kaiser Permanente — County employee plans (${KAISER_PLAN_YEAR})`} size="xl">
        <section>
          <h3 className="rep-h" style={{ marginTop: 0 }}>Open enrollment</h3>
          <dl className="econ-kv">
            <dt>Opens</dt><dd>{KAISER_ENROLLMENT.opens}</dd>
            <dt>Closes</dt><dd>{KAISER_ENROLLMENT.closes}</dd>
            <dt>Enroll at</dt>
            <dd><a href={KAISER_ENROLLMENT.whereUrl} target="_blank" rel="noopener">{KAISER_ENROLLMENT.where} →</a></dd>
          </dl>
        </section>

        <section style={{ marginTop: 18 }}>
          <h3 className="rep-h">What&apos;s changing for {KAISER_PLAN_YEAR}</h3>
          <ul className="kp-list">
            {KAISER_CHANGES_2027.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>

        <section style={{ marginTop: 18 }}>
          <h3 className="rep-h">Plan comparison</h3>
          <div className="gme-wrap">
            <table className="kp-table">
              <thead>
                <tr>
                  <th />
                  {KAISER_PLANS.map((p) => <th key={p}>{p}</th>)}
                </tr>
              </thead>
              {KAISER_TABLE.map((sec) => (
                <tbody key={sec.title}>
                  <tr className="kp-sec"><th colSpan={5}>{sec.title}</th></tr>
                  {sec.rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      {r.cells.map((c, i) => <td key={i}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="muted" style={{ fontSize: '.78em', marginTop: 6 }}>
            {KAISER_TABLE_NOTE} Summary from the County&apos;s {KAISER_PLAN_YEAR} Employee Benefits Guide (pp. 18–21). Which plans you can pick depends on your
            bargaining unit — see &ldquo;Enrollment Options&rdquo; in the guide. If anything here differs from Kaiser&apos;s Evidence of Coverage, the EOC wins.
          </p>
        </section>

        <section style={{ marginTop: 18 }}>
          <h3 className="rep-h">Contacts &amp; links</h3>
          <dl className="econ-kv">
            {KAISER_CONTACTS.map((c) => (
              <div key={c.label} style={{ display: 'contents' }}>
                <dt>{c.label}</dt>
                <dd>{c.href ? <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener">{c.value}</a> : c.value}</dd>
              </div>
            ))}
          </dl>
          <div className="popup-ext-links">
            <a href={KAISER_ENROLLMENT.pageUrl} target="_blank" rel="noopener">County 2027 open enrollment page →</a>
          </div>
        </section>

        <section style={{ marginTop: 18 }}>
          <h3 className="rep-h">Documents</h3>
          <p className="muted" style={{ fontSize: '.78em', marginTop: -2 }}>Click a document to read it here; press Ctrl+F inside the viewer to search. The County hasn&apos;t posted 2027 plan documents yet, so the plan files are the 2026 versions (Teamsters: March 2026 – February 2027).</p>
          {groups.map((g) => (
            <div key={g} className="cch-doc-group">
              <h4 className="cch-doc-group-h">{g}</h4>
              <div className="park-map-links">
                {KAISER_DOCS.filter((d) => d.group === g).map((d) => (
                  <button key={d.slug} type="button" className="event-modal-btn" onClick={() => setDocSlug(d.slug)} title={d.note}>
                    📄 {d.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </Modal>

      {focusedDoc && (
        <Modal open={true} onClose={() => setDocSlug(null)} title={focusedDoc.label} size="xl">
          <div className="park-pdf-wrap">
            <iframe key={focusedDoc.file} src={`${focusedDoc.file}#pagemode=none`} title={focusedDoc.label} className="park-pdf-frame" loading="lazy" />
            <p className="pdf-search-hint muted">
              Tip: click into the PDF and press <kbd>Ctrl</kbd>+<kbd>F</kbd> (<kbd>⌘</kbd>+<kbd>F</kbd> on Mac) to search.
            </p>
            <p className="muted" style={{ fontSize: '.85em' }}>{focusedDoc.note}</p>
            <div className="popup-ext-links">
              <a href={focusedDoc.file} target="_blank" rel="noopener">Open PDF in new tab →</a>
              <a href={focusedDoc.file} download>Download PDF →</a>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
