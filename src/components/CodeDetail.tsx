'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';

interface Props { label: string; tooltip?: string }

// Embeds the City of Martinez Municipal Code PDF (68 pages, ~6.6 MB)
// in an in-site iframe. Bundled under /public/img/ so it's served
// same-origin — no proxy needed.
const CODE_PDF = '/img/martinez-municipal-code.pdf';

export default function CodeDetail({ label, tooltip }: Props) {
  const [open, setOpen] = useUrlBool('code');
  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Martinez Municipal Code" size="xl">
        <div className="park-pdf-wrap">
          <iframe
            src={`${CODE_PDF}#pagemode=none`}
            title="Martinez Municipal Code"
            className="park-pdf-frame"
            loading="lazy"
          />
          <div className="popup-ext-links">
            <a href={CODE_PDF} target="_blank" rel="noopener">Open PDF in new tab →</a>
            <a href={CODE_PDF} download>Download PDF →</a>
          </div>
          <p className="muted" style={{ fontSize: '.78em', marginTop: 8 }}>
            Includes: General Provisions · Administration and Personnel · Revenue and Finance · Business
            Taxes and Regulations · Animals · Health and Safety · Public Peace, Morals and Welfare ·
            Vehicles and Traffic.
          </p>
        </div>
      </Modal>
    </>
  );
}
