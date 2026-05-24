'use client';

import Modal from './Modal';
import type { Rep } from '@/lib/reps';

// Reusable bio popup — shared between RepsDetail (the full reps modal)
// and CouncilDetail (the council-meetings modal's top-strip). Takes a
// fully-resolved Rep so the parent decides where it came from (cron
// cache vs. the static reps-bios.ts registry).

function partyColor(p?: string): string {
  return p === 'D' ? 'var(--accent-cool)'
    : p === 'R' ? 'var(--accent-warm)'
    : 'var(--text-muted)';
}

export default function RepBioModal({ rep, onClose }: { rep: Rep; onClose: () => void }) {
  const title = `${rep.name} — ${rep.office}`;
  return (
    <Modal open={true} onClose={onClose} title={title} size="md">
      <div className="rep-bio-detail">
        <div className="rep-bio-head">
          {rep.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rep.photoUrl} alt={rep.name} className="rep-bio-photo" />
          ) : (
            <div className="rep-bio-photo placeholder">{(rep.name?.[0] ?? '?').toUpperCase()}</div>
          )}
          <div className="rep-bio-meta">
            {rep.party && <div className="rep-party" style={{ color: partyColor(rep.party) }}>{rep.party}</div>}
            {rep.district && <div className="muted">{rep.district}</div>}
            {rep.electedDate && <div className="muted">Elected {rep.electedDate}</div>}
            {rep.appointedDate && <div className="muted">Appointed {rep.appointedDate}</div>}
            {rep.termExpires && <div className="muted">Term expires {rep.termExpires}</div>}
          </div>
        </div>

        {rep.bio && (
          <div className="rep-bio-text">
            {rep.bio.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}

        <div className="rep-bio-links">
          {rep.url && (
            <a className="event-modal-btn primary" href={rep.url} target="_blank" rel="noopener">
              Official page →
            </a>
          )}
          {rep.email && (
            <a className="event-modal-btn" href={`mailto:${rep.email}`}>
              Email {rep.name.split(/\s+/)[0]} →
            </a>
          )}
          {rep.phone && (
            <a className="event-modal-btn" href={`tel:${rep.phone}`}>
              Call {rep.phone} →
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
