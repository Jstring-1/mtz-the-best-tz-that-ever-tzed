'use client';

import Modal from './Modal';
import { useUrlBool } from '@/lib/useUrlState';
import type { ReactNode } from 'react';

// Generic OpenWeather current-weather response. We only render the
// fields we care about.
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

interface Props {
  /** What the trigger button shows (text/icon — replaces the current
      static span in WeatherStrip). */
  triggerContent: ReactNode;
  /** className for the trigger button (so it visually matches the strip). */
  triggerClassName?: string;
  /** Tooltip text on hover. */
  tooltip?: string;
  openWeather: OpenWeather | null;
}

function f(n: number | undefined, suffix = ''): string {
  return n == null ? '—' : `${Math.round(n)}${suffix}`;
}
function unixToLocal(t: number | undefined): string {
  if (!t) return '—';
  const d = new Date(t * 1000);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Convert wind degrees to a 16-point compass label.
function degToCompass(deg: number | undefined): string {
  if (deg == null) return '';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}

export default function WeatherDetail({
  triggerContent, triggerClassName, tooltip, openWeather,
}: Props) {
  const [open, setOpen] = useUrlBool('wxd');
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

      <Modal open={open} onClose={() => setOpen(false)} title="Current weather — details" size="md">
        {!ow ? (
          <p className="muted">OpenWeather cache empty — run /admin → 1m.</p>
        ) : (
          <>
            <h3 className="rep-h" style={{ marginTop: 0 }}>
              {ow.name ?? 'Current conditions'}
              <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>(OpenWeather)</span>
            </h3>
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
              <dd>
                {f(ow.wind?.speed, ' mph')}
                {ow.wind?.deg != null && ` ${degToCompass(ow.wind.deg)}`}
                {ow.wind?.gust ? ` (gust ${Math.round(ow.wind.gust)})` : ''}
              </dd>

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
        )}
      </Modal>
    </>
  );
}
