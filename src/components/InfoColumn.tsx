import { getJson } from '@/lib/cache';
import { listRecentQuakes, type StoredQuake } from '@/lib/store';
import type { GovLocalPayload, GovNationalPayload, RecallRow } from '@/lib/gov';
import type { OutbreaksPayload } from '@/lib/outbreaks';
import type { TrainsPayload } from '@/lib/trains';
import type { HousingPayload } from '@/lib/housing';
import { relativeFromUnixSeconds } from '@/lib/time';
import TrainsMini from './TrainsMini';
import PopupLink from './PopupLink';

interface StockQuote {
  symbol: string;
  close: string;
  percent_change: string;
}

// Index order shown in the Markets block.
const MARKETS: { symbol: string; label: string }[] = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^DJI',  label: 'Dow' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^RUT',  label: 'Russell 2000' },
  { symbol: '^VIX',  label: 'VIX' },
];

function fmtPrice(s: string): string {
  const n = Number(s);
  if (!isFinite(n)) return s;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: n >= 1000 ? 0 : 2,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

function pctClass(s: string): 'up' | 'down' | 'flat' {
  const n = Number(s);
  if (!isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

function fmtPct(s: string): string {
  const n = Number(s);
  if (!isFinite(n)) return s;
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function dollars(n: number | null | undefined): string | null {
  return typeof n === 'number' && isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : null;
}

function quakeClass(m: number | null): string {
  if (m == null) return 'minor';
  return m >= 6 ? 'major' : m >= 4.5 ? 'moderate' : 'minor';
}

// Fourth dashboard column — short, glanceable versions of things that
// otherwise live behind civic-strip popups. Each block's heading opens the
// matching popup for the full view.
export default async function InfoColumn() {
  const [trains, stocks, national, local, housing, outbreaks, quakes] = await Promise.all([
    getJson<TrainsPayload>('trains_mtz').catch(() => null),
    getJson<Record<string, StockQuote>>('12D_stocks').catch(() => null),
    getJson<GovNationalPayload>('gov_national').catch(() => null),
    getJson<GovLocalPayload>('gov_local').catch(() => null),
    getJson<HousingPayload>('housing').catch(() => null),
    getJson<OutbreaksPayload>('outbreaks').catch(() => null),
    listRecentQuakes(6).catch((): StoredQuake[] => []),
  ]);

  const econ = national?.economy ?? null;
  const tenYear = econ?.yields?.find((y) => /^10[\s-]?(yr|year|y)/i.test(y.maturity))
    ?? econ?.yields?.find((y) => y.maturity.toLowerCase().includes('10'));
  const marketRows = MARKETS
    .map((m) => ({ ...m, q: stocks?.[m.symbol] }))
    .filter((m): m is typeof m & { q: StockQuote } => !!m.q);

  const gas = local?.extras?.gas ?? null;
  const rent = dollars(housing?.zillow?.currentRent);
  const rentYoy = housing?.zillow?.yoyPct;
  const homeValue = dollars(housing?.census?.medianHomeValue);
  const indicatorRows: { label: string; value: string; note?: string }[] = [
    ...(gas ? [{ label: 'CA gas (regular)', value: gas.value, note: gas.period }] : []),
    ...(econ?.unemploymentCC ? [{ label: 'Contra Costa unemployment', value: econ.unemploymentCC.value, note: econ.unemploymentCC.period }] : []),
    ...(econ?.cpiBA ? [{ label: 'Bay Area CPI YoY', value: econ.cpiBA.value, note: econ.cpiBA.period }] : []),
    ...(rent ? [{
      label: 'Martinez typical rent', value: `${rent}/mo`,
      note: typeof rentYoy === 'number' ? `${rentYoy > 0 ? '+' : ''}${rentYoy.toFixed(1)}% YoY` : undefined,
    }] : []),
    ...(homeValue ? [{ label: 'Median home value (94553)', value: homeValue }] : []),
    ...(econ?.ccMedianIncome ? [{ label: 'CCC median household income', value: econ.ccMedianIncome.value, note: econ.ccMedianIncome.year }] : []),
  ];

  // Food recalls: newest five (FDA "food" source rows).
  const foodRecalls: RecallRow[] = (national?.recalls ?? [])
    .filter((r) => r.source.toLowerCase().includes('food'))
    .map((r, i) => ({ r, i, t: Date.parse(r.date) }))
    .sort((a, b) => (Number.isNaN(b.t) ? -Infinity : b.t) - (Number.isNaN(a.t) ? -Infinity : a.t) || a.i - b.i)
    .slice(0, 5)
    .map((x) => x.r);

  const foodOutbreaks = (outbreaks?.cdcFood ?? []).slice(0, 5);

  return (
    <div className="col-stack info-col">
      <section className="card-section info-block">
        <h3><PopupLink params={{ trains: '1' }} className="info-h">Next trains at Martinez</PopupLink></h3>
        {trains ? <TrainsMini arriving={trains.arriving ?? []} /> : <p className="info-empty">Train data not cached yet.</p>}
      </section>

      {(marketRows.length > 0 || tenYear) && (
        <section className="card-section info-block">
          <h3><PopupLink params={{ indicators: '1', itab: 'economy' }} className="info-h">Markets</PopupLink></h3>
          <ul className="info-list">
            {marketRows.map((m) => (
              <li key={m.symbol} className="info-row">
                <span className="info-main">{m.label}</span>
                <span className="info-side">
                  {fmtPrice(m.q.close)}{' '}
                  <span className={`dir-${pctClass(m.q.percent_change)}`}>{fmtPct(m.q.percent_change)}</span>
                </span>
              </li>
            ))}
            {tenYear && (
              <li className="info-row">
                <span className="info-main">10-yr Treasury</span>
                <span className="info-side">{tenYear.rate}</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {indicatorRows.length > 0 && (
        <section className="card-section info-block">
          <h3><PopupLink params={{ indicators: '1', itab: 'housing' }} className="info-h">Local &amp; housing</PopupLink></h3>
          <ul className="info-list">
            {indicatorRows.map((r) => (
              <li key={r.label} className="info-row">
                <span className="info-main">{r.label}</span>
                <span className="info-side"><b>{r.value}</b>{r.note && <span className="info-note"> {r.note}</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-section info-block">
        <h3><PopupLink params={{ recalls: '1', rtab: 'food' }} className="info-h">Food recalls</PopupLink></h3>
        {foodRecalls.length === 0 ? <p className="info-empty">No food recalls cached.</p> : (
          <ul className="info-list">
            {foodRecalls.map((r, i) => (
              <li key={`${r.date}-${i}`} className="info-item">
                {r.url
                  ? <a href={r.url} target="_blank" rel="noopener" className="info-title">{r.title}</a>
                  : <span className="info-title">{r.title}</span>}
                <span className="info-note">{r.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section info-block">
        <h3><PopupLink params={{ outbreaks: '1', otab: 'food' }} className="info-h">Food outbreaks</PopupLink></h3>
        {foodOutbreaks.length === 0 ? <p className="info-empty">No outbreaks cached.</p> : (
          <ul className="info-list">
            {foodOutbreaks.map((o, i) => (
              <li key={`${o.id}-${i}`} className="info-item">
                {o.url
                  ? <a href={o.url} target="_blank" rel="noopener" className="info-title">{o.title}</a>
                  : <span className="info-title">{o.title}</span>}
                <span className="info-note">{[o.region, o.category, o.date].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section info-block">
        <h3><PopupLink params={{ quakes: '1' }} className="info-h">Recent quakes</PopupLink></h3>
        {quakes.length === 0 ? <p className="info-empty">No quakes cached.</p> : (
          <ul className="info-list">
            {quakes.map((q) => (
              <li key={q.id} className="info-row">
                <span className="info-main">
                  <b className={`quake-mag ${quakeClass(q.magnitude)}`}>M{q.magnitude != null ? q.magnitude.toFixed(1) : '—'}</b>{' '}
                  {q.place}
                </span>
                <span className="info-side">{relativeFromUnixSeconds(q.occurred_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
