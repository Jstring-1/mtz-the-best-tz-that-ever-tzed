'use client';

import Modal from './Modal';
import { useUrlBool, useUrlEnum } from '@/lib/useUrlState';
import type { ReactNode } from 'react';

// Generic OpenWeather current-weather response. We only render the
// fields we care about — extras are passed through to the Raw tab.
interface OpenWeather {
  weather?: Array<{ description?: string; icon?: string; main?: string }>;
  main?: {
    temp?: number; feels_like?: number; temp_min?: number; temp_max?: number;
    pressure?: number; humidity?: number;
  };
  visibility?: number;
  wind?: { speed?: number; deg?: number; gust?: number };
  clouds?: { all?: number };
  rain?: { '1h'?: number; '3h'?: number };
  snow?: { '1h'?: number; '3h'?: number };
  dt?: number;
  sys?: { sunrise?: number; sunset?: number; country?: string };
  name?: string;
  cod?: number;
}

interface WaterRss {
  key: string;        // raw cache key, e.g. 'NOAA_w_d_st'
  label: string;      // human label
  url: string;        // upstream live URL (link out)
  xml: string | null; // raw RSS XML, parsed inline
}

interface Props {
  /** What the trigger button shows (text/icon — replaces the current
      static span in WeatherStrip). */
  triggerContent: ReactNode;
  /** className for the trigger button (so it visually matches the strip). */
  triggerClassName?: string;
  /** Tooltip text on hover. */
  tooltip?: string;
  openWeather: OpenWeather | null;
  weatherStoryHtml: string | null;
  weatherStoryImages: number[];
  waterRss: WaterRss[];
}

type Tab = 'now' | 'story' | 'water' | 'raw';
const TABS: Tab[] = ['now', 'story', 'water', 'raw'];
const TAB_LABEL: Record<Tab, string> = {
  now: 'Now',
  story: 'NWS forecast',
  water: 'Water levels',
  raw: 'Raw',
};

// Pull a first item's title + summary out of a NOAA water RSS feed
// without a real XML parser — we just want a quick "latest stage X ft"
// summary line per station.
function extractFirstFromRss(xml: string | null): { title: string; summary: string } | null {
  if (!xml) return null;
  const titleM = xml.match(/<title>([^<]+)<\/title>/);
  const descM = xml.match(/<description>([\s\S]*?)<\/description>/);
  if (!titleM && !descM) return null;
  const title = (titleM?.[1] ?? '').trim();
  const summary = (descM?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { title, summary };
}

function f(n: number | undefined, suffix = ''): string {
  return n == null ? '—' : `${Math.round(n)}${suffix}`;
}
function unixToLocal(t: number | undefined): string {
  if (!t) return '—';
  const d = new Date(t * 1000);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function WeatherDetail({
  triggerContent, triggerClassName, tooltip,
  openWeather, weatherStoryHtml, weatherStoryImages, waterRss,
}: Props) {
  const [open, setOpen] = useUrlBool('wxd');
  const [tab, setTab] = useUrlEnum<Tab>('wxtab', TABS, 'now');
  const ow = openWeather;

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? 'cond gold'}
        onClick={() => setOpen(true)}
        title={tooltip}
      >
        {triggerContent}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Current weather — details" size="lg">
        <div className="news-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`news-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {tab === 'now' && (
          ow ? (
            <>
              <h3 className="rep-h">{ow.name ?? 'Current conditions'} <span className="muted" style={{ fontWeight: 400 }}>(OpenWeather)</span></h3>
              <dl className="unemp-grid">
                <dt>Conditions</dt>
                <dd className="big">{ow.weather?.[0]?.description ?? '—'}</dd>
                <dt>Temperature</dt>
                <dd className="big">{f(ow.main?.temp, '°F')}</dd>
                <dt>Feels like</dt>
                <dd>{f(ow.main?.feels_like, '°F')}</dd>
                <dt>Hi / Lo</dt>
                <dd>{f(ow.main?.temp_max, '°F')} / {f(ow.main?.temp_min, '°F')}</dd>
                <dt>Humidity</dt>
                <dd>{f(ow.main?.humidity, '%')}</dd>
                <dt>Pressure</dt>
                <dd>{f(ow.main?.pressure, ' mb')}</dd>
                <dt>Wind</dt>
                <dd>{f(ow.wind?.speed, ' mph')}{ow.wind?.gust ? ` (gust ${Math.round(ow.wind.gust)})` : ''}</dd>
                <dt>Cloud cover</dt>
                <dd>{f(ow.clouds?.all, '%')}</dd>
                {ow.visibility != null && <>
                  <dt>Visibility</dt>
                  <dd>{(ow.visibility / 1609).toFixed(1)} mi</dd>
                </>}
                {ow.rain?.['1h'] != null && <>
                  <dt>Rain (1h)</dt>
                  <dd>{ow.rain['1h']} mm</dd>
                </>}
                {ow.snow?.['1h'] != null && <>
                  <dt>Snow (1h)</dt>
                  <dd>{ow.snow['1h']} mm</dd>
                </>}
                <dt>Sunrise</dt>
                <dd>{unixToLocal(ow.sys?.sunrise)}</dd>
                <dt>Sunset</dt>
                <dd>{unixToLocal(ow.sys?.sunset)}</dd>
                <dt>Observed</dt>
                <dd>{unixToLocal(ow.dt)}</dd>
              </dl>
            </>
          ) : <p className="muted">OpenWeather cache empty — run /admin → 1m.</p>
        )}

        {tab === 'story' && (
          <>
            <h3 className="rep-h">NWS Weather Story <span className="muted" style={{ fontWeight: 400 }}>(MTR forecast office)</span></h3>
            {weatherStoryImages.length === 0 && !weatherStoryHtml && (
              <p className="muted">No story images cached — run /admin → 4h.</p>
            )}
            {weatherStoryImages.length > 0 && (
              <div className="wx-story-images">
                {weatherStoryImages.map((n) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={n}
                    src={`https://www.weather.gov/images/mtr/wxstory/WeatherStory${n}.png`}
                    alt={`NWS Weather Story ${n}`}
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            {weatherStoryHtml && (
              <>
                <h3 className="rep-h" style={{ marginTop: 16 }}>Legend / key</h3>
                <div className="wx-story-html" dangerouslySetInnerHTML={{ __html: weatherStoryHtml }} />
              </>
            )}
            <p style={{ marginTop: 12 }}>
              <a className="event-modal-btn primary" href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">
                NWS Bay Area &amp; Monterey →
              </a>
            </p>
          </>
        )}

        {tab === 'water' && (
          <>
            <h3 className="rep-h">NOAA water levels — local stations</h3>
            <p className="muted" style={{ fontSize: '.82em', marginTop: 0 }}>
              Latest reading from each station's RSS feed.
            </p>
            {waterRss.length === 0 ? (
              <p className="muted">No water RSS cached — run /admin → 4h.</p>
            ) : (
              <ul className="recall-list">
                {waterRss.map((s) => {
                  const parsed = extractFirstFromRss(s.xml);
                  return (
                    <li key={s.key} className="recall-item">
                      <div className="recall-head" style={{ cursor: 'default' }}>
                        <span className="recall-title">{parsed?.title || s.label}</span>
                        <span className="meta">
                          <span className="recall-src">{s.label}</span>
                          {!parsed && <span> · no data</span>}
                        </span>
                      </div>
                      {parsed?.summary && (
                        <div className="recall-reason">{parsed.summary}</div>
                      )}
                      <p style={{ marginTop: 6 }}>
                        <a className="event-modal-btn" href={s.url} target="_blank" rel="noopener">
                          Live station page →
                        </a>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'raw' && (
          <>
            <h3 className="rep-h">OpenWeather raw payload</h3>
            <p className="muted" style={{ fontSize: '.82em' }}>
              Last fetched: {unixToLocal(ow?.dt)}.
            </p>
            <pre style={{ maxHeight: 360, overflow: 'auto', fontSize: '.78em', background: 'var(--bg-elev-2)', padding: 10, borderRadius: 4 }}>
              {JSON.stringify(ow, null, 2)}
            </pre>
          </>
        )}
      </Modal>
    </>
  );
}
