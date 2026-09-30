'use client';

import { useMemo } from 'react';
import Modal from './Modal';
import type { NoaaAlert } from '@/lib/types';
import { useUrlString } from '@/lib/useUrlState';

export interface RadarImg {
  src: string;
  caption: string;
}

function fmtEpoch(sec?: number, tz = 'America/Los_Angeles'): string {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleString('en-US', {
    timeZone: tz, month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function RadarCard({
  imgs, regionalAlerts = [], tz = 'America/Los_Angeles',
}: {
  imgs: RadarImg[];
  regionalAlerts?: NoaaAlert[];
  tz?: string;
}) {
  // Encode by index — the radar img list is server-rendered in a stable
  // order, and the captions/srcs would make for ugly URLs.
  const [idxStr, setIdxStr] = useUrlString('radar');
  const open = useMemo(() => {
    const i = idxStr ? Number(idxStr) : NaN;
    return Number.isInteger(i) && i >= 0 && i < imgs.length ? imgs[i] : null;
  }, [idxStr, imgs]);
  const setOpen = (img: RadarImg | null) => {
    if (!img) return setIdxStr(null);
    const i = imgs.indexOf(img);
    setIdxStr(i >= 0 ? String(i) : null);
  };

  // Regional (NOT-LOCAL) NWS alert chips — one per active alert covering
  // the wider WFO Monterey area shown on the mtr.png map. Distinct URL
  // key from AlertsCard's ?alert= so LOCAL and regional don't collide.
  const [rAlertIdx, setRAlertIdx] = useUrlString('ralert');
  const openRAlert = useMemo(() => {
    const i = rAlertIdx ? Number(rAlertIdx) : NaN;
    return Number.isInteger(i) && i >= 0 && i < regionalAlerts.length ? regionalAlerts[i] : null;
  }, [rAlertIdx, regionalAlerts]);
  const setOpenRAlert = (a: NoaaAlert | null) => {
    if (!a) return setRAlertIdx(null);
    const i = regionalAlerts.indexOf(a);
    setRAlertIdx(i >= 0 ? String(i) : null);
  };

  return (
    <section className="card-section radar-card">
      <div className="radar-grid">
        {imgs.map((img) => (
          <button
            key={img.src}
            type="button"
            className="radar-thumb clickable"
            onClick={() => setOpen(img)}
          >
            <img src={img.src} alt={img.caption} />
            <figcaption>{img.caption}</figcaption>
          </button>
        ))}
      </div>

      {regionalAlerts.length > 0 && (
        <div className="event-tabs" aria-label="Regional NWS alerts" style={{ marginTop: 8 }}>
          {regionalAlerts.map((a, i) => (
            <button
              key={`ra-${i}`}
              type="button"
              className="event-tab"
              onClick={() => setOpenRAlert(a)}
              title={a.NWSheadline ?? a.event ?? 'Alert'}
            >
              {a.event ?? 'Alert'}
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} size="xl" title={open?.caption}>
        {open && (
          <div style={{ textAlign: 'center' }}>
            <img src={open.src} alt={open.caption} style={{ maxWidth: '100%', height: 'auto' }} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!openRAlert}
        onClose={() => setOpenRAlert(null)}
        title={openRAlert?.event ?? 'Alert'}
        size="lg"
      >
        {openRAlert && (
          <>
            {openRAlert.NWSheadline && <div className="meta" style={{ marginBottom: 10 }}><b>{openRAlert.NWSheadline}</b></div>}
            {openRAlert.areaDesc && <div className="meta" style={{ marginBottom: 10, lineHeight: 1.5 }}>{openRAlert.areaDesc.replace(/;/g, ', ')}</div>}
            <div className="alert-meta">
              {(['severity', 'urgency', 'certainty', 'status'] as const).map((k) =>
                openRAlert[k] ? <span key={k}><span className="k">{k}:</span> <span className="v">{String(openRAlert[k])}</span></span> : null
              )}
              {(['effective', 'expires'] as const).map((k) =>
                openRAlert[k] ? <span key={k}><span className="k">{k}:</span> <span className="v">{fmtEpoch(Number(openRAlert[k]), tz)}</span></span> : null
              )}
            </div>
            {openRAlert.description && <p style={{ whiteSpace: 'pre-line', marginTop: 14, lineHeight: 1.5 }}>{openRAlert.description}</p>}
          </>
        )}
      </Modal>
    </section>
  );
}
