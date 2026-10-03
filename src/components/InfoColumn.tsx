import { getJson } from '@/lib/cache';
import { getLocation } from '@/lib/location';
import { listRecentQuakes, listActiveAlerts, type StoredQuake } from '@/lib/store';
import type { GovLocalPayload, GovNationalPayload, RecallRow } from '@/lib/gov';
import type { OutbreaksPayload } from '@/lib/outbreaks';
import type { TrainsPayload } from '@/lib/trains';
import type { HousingPayload } from '@/lib/housing';
import type { GlanceLive, GlanceHourly, GlanceDaily, SportsTeam } from '@/lib/glance';
import { relativeFromUnixSeconds } from '@/lib/time';
import { zonedDate } from '@/lib/tz';
import TrainsMini from './TrainsMini';
import BartMini from './BartMini';
import TrafficCams from './TrafficCams';
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
const OTHER_QUOTES: { symbol: string; label: string }[] = [
  { symbol: 'BTC-USD', label: 'Bitcoin' },
  { symbol: 'ETH-USD', label: 'Ethereum' },
  { symbol: 'GME',     label: 'GameStop (GME)' },
];

// Annual meteor-shower peaks [name, month 1-12, day].
const SHOWERS: [string, number, number][] = [
  ['Quadrantids', 1, 3], ['Lyrids', 4, 22], ['Eta Aquariids', 5, 6], ['Delta Aquariids', 7, 30],
  ['Perseids', 8, 12], ['Orionids', 10, 21], ['Taurids', 11, 5], ['Leonids', 11, 17],
  ['Geminids', 12, 14], ['Ursids', 12, 22],
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

// pollen.com 0–12 scale.
function pollenLevel(i: number): string {
  return i < 2.5 ? 'Low' : i < 4.9 ? 'Low-medium' : i < 7.3 ? 'Medium' : i < 9.7 ? 'Medium-high' : 'High';
}

// Next meteor shower peaking within 60 days (wraps the year).
function nextShower(now: Date): { name: string; days: number } | null {
  let best: { name: string; days: number } | null = null;
  for (const [name, m, d] of SHOWERS) {
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
      const days = Math.ceil((Date.UTC(y, m - 1, d, 23) - now.getTime()) / 86400_000);
      if (days >= 0 && days <= 60 && (!best || days < best.days)) best = { name, days };
    }
  }
  return best;
}

// Fourth dashboard column — short, glanceable versions of things that
// otherwise live behind civic-strip popups, plus the quick-glance feeds
// (tides, sky, fire weather, pollen, scores, reservoirs). Block headings
// that map to a popup open it.
async function load() {
  const [trains, stocks, national, local, housing, outbreaks, quakes, live, hourly, daily, alerts] = await Promise.all([
    getJson<TrainsPayload>('trains_mtz').catch(() => null),
    getJson<Record<string, StockQuote>>('12D_stocks').catch(() => null),
    getJson<GovNationalPayload>('gov_national').catch(() => null),
    getJson<GovLocalPayload>('gov_local').catch(() => null),
    getJson<HousingPayload>('housing').catch(() => null),
    getJson<OutbreaksPayload>('outbreaks').catch(() => null),
    listRecentQuakes(6).catch((): StoredQuake[] => []),
    getJson<GlanceLive>('glance_live').catch(() => null),
    getJson<GlanceHourly>('glance_hourly').catch(() => null),
    getJson<GlanceDaily>('glance_daily').catch(() => null),
    listActiveAlerts().catch(() => []),
  ]);
  return { trains, stocks, national, local, housing, outbreaks, quakes, live, hourly, daily, alerts };
}

export type InfoData = Awaited<ReturnType<typeof load>>;

export default async function InfoColumn() {
  return <InfoView {...await load()} />;
}

export function InfoView(d: InfoData) {
  const loc = getLocation();
  const tz = loc.timezone;
  const { trains, stocks, national, local, housing, outbreaks, quakes, live, hourly, daily, alerts } = d;

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const time = (sec: number | undefined) =>
    sec ? new Date(sec * 1000).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) : '—';
  const dayTime = (sec: number) =>
    new Date(sec * 1000).toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const shortDate = (sec: number) =>
    new Date(sec * 1000).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });

  const econ = national?.economy ?? null;
  const tenYear = econ?.yields?.find((y) => /^10[\s-]?(yr|year|y)/i.test(y.maturity))
    ?? econ?.yields?.find((y) => y.maturity.toLowerCase().includes('10'));
  const quoteRows = (list: { symbol: string; label: string }[]) =>
    list.map((m) => ({ ...m, q: stocks?.[m.symbol] })).filter((m): m is typeof m & { q: StockQuote } => !!m.q);
  const marketRows = quoteRows(MARKETS);
  const otherRows = quoteRows(OTHER_QUOTES);

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

  // ---- Tides ----
  const tideEvents = (live?.tides?.events ?? []).filter((e) => e.at >= nowSec).slice(0, 4);
  const tideLevel = live?.tides?.level ?? null;
  const rising = tideEvents[0]?.type === 'H';

  // ---- Sky ----
  const todayKey = zonedDate(new Date(nowMs), tz);
  const skyDay = daily?.sky?.days.find((d) => d.date === todayKey) ?? null;
  const phases = (daily?.sky?.phases ?? []).filter((p) => p.at >= nowSec);
  const nextFull = phases.find((p) => p.phase === 'Full Moon');
  const nextNew = phases.find((p) => p.phase === 'New Moon');
  const shower = nextShower(new Date(nowMs));

  // ---- Fire weather ----
  const fire = hourly?.fire ?? null;
  const redFlag = alerts.filter((a) =>
    a.scope === 'LOCAL' && /red flag|fire weather|extreme fire/i.test(a.event ?? ''));
  const nearCriteria = !!fire && fire.minRh != null && fire.maxGustMph != null && fire.minRh <= 20 && fire.maxGustMph >= 25;

  // ---- Pollen ----
  const pollen = daily?.pollen ?? null;

  // ---- Grid / space / drought ----
  const grid = live?.grid ?? null;
  const gridPct = grid?.demandMW != null && grid.peakForecastMW ? Math.round((grid.demandMW / grid.peakForecastMW) * 100) : null;
  const space = hourly?.space ?? null;
  const kpLabel = (kp: number) => (kp < 4 ? 'quiet' : kp < 5 ? 'unsettled' : kp < 7 ? 'storm — aurora possible up north' : 'strong storm — aurora possible here');
  const nextIss = (space?.issPasses ?? []).find((p) => p.start >= nowSec) ?? null;
  const drought = daily?.drought ?? null;

  // ---- Scores ----
  const teams: SportsTeam[] = live?.sports ?? [];

  return (
    <div className="col-stack info-col">
      <section className="card-section info-block">
        <h3><PopupLink params={{ trains: '1' }} className="info-h">Next trains at Martinez</PopupLink></h3>
        {trains ? <TrainsMini arriving={trains.arriving ?? []} /> : <p className="info-empty">Train data not cached yet.</p>}
      </section>

      <section className="card-section info-block">
        <h3>BART <span className="info-note">min · live · * late</span></h3>
        <BartMini />
      </section>

      <section className="card-section info-block">
        <h3>Traffic cam <span className="info-note">Caltrans · every 5 min</span></h3>
        <TrafficCams />
      </section>

      <section className="card-section info-block">
        <h3>Tides <span className="info-note">Martinez pier</span></h3>
        {tideEvents.length === 0 ? <p className="info-empty">Tide data not cached yet.</p> : (
          <ul className="info-list">
            {tideLevel && (
              <li className="info-row">
                <span className="info-main">Now</span>
                <span className="info-side"><b>{tideLevel.v.toFixed(1)} ft</b> <span className="info-note">{rising ? 'rising' : 'falling'}</span></span>
              </li>
            )}
            {tideEvents.map((e) => (
              <li key={e.at} className="info-row">
                <span className="info-main">{e.type === 'H' ? 'High' : 'Low'} · {dayTime(e.at)}</span>
                <span className="info-side">{e.v.toFixed(1)} ft</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section info-block">
        <h3>Sun &amp; sky</h3>
        {!skyDay ? <p className="info-empty">Sky data not cached yet.</p> : (
          <ul className="info-list">
            <li className="info-row"><span className="info-main">Sunrise / sunset</span><span className="info-side">{time(skyDay.sunrise)} / {time(skyDay.sunset)}</span></li>
            {skyDay.sunset && (
              <li className="info-row"><span className="info-main">Golden hour</span><span className="info-side">{time(skyDay.sunset - 3600)}–{time(skyDay.sunset)}</span></li>
            )}
            <li className="info-row">
              <span className="info-main">Moon</span>
              <span className="info-side">{skyDay.phase}{skyDay.illum ? ` · ${skyDay.illum}` : ''}</span>
            </li>
            <li className="info-row">
              <span className="info-main">Moonrise / set</span>
              <span className="info-side">{skyDay.moonrise ? time(skyDay.moonrise) : '—'} / {skyDay.moonset ? time(skyDay.moonset) : '—'}</span>
            </li>
            {nextNew && <li className="info-row"><span className="info-main">Next new moon</span><span className="info-side">{shortDate(nextNew.at)}</span></li>}
            {nextFull && <li className="info-row"><span className="info-main">Next full moon</span><span className="info-side">{shortDate(nextFull.at)}</span></li>}
            {shower && (
              <li className="info-row">
                <span className="info-main">Meteors</span>
                <span className="info-side">{shower.name} {shower.days === 0 ? 'peak tonight' : `peak in ${shower.days} d`}</span>
              </li>
            )}
          </ul>
        )}
      </section>

      {space && (space.kp != null || space.issPasses.length > 0) && (
        <section className="card-section info-block">
          <h3>Space</h3>
          <ul className="info-list">
            {space.kp != null && (
              <li className="info-row">
                <span className="info-main">Geomagnetic Kp</span>
                <span className="info-side"><b>{space.kp.toFixed(1)}</b> <span className="info-note">{kpLabel(space.kp)}</span></span>
              </li>
            )}
            <li className="info-row">
              <span className="info-main">Next visible ISS pass</span>
              <span className="info-side">
                {nextIss
                  ? <>{dayTime(nextIss.start)} <span className="info-note">{nextIss.maxEl}° · {nextIss.from}→{nextIss.to}</span></>
                  : <span className="info-note">none in 2 weeks</span>}
              </span>
            </li>
          </ul>
        </section>
      )}

      {grid && (
        <section className="card-section info-block">
          <h3>Power grid <span className="info-note">CAISO</span></h3>
          <ul className="info-list">
            <li className="info-row">
              <span className="info-main">Status</span>
              <span className="info-side">{/^normal$/i.test(grid.status) ? <b>Normal</b> : <b className="info-hot">{grid.status}</b>}</span>
            </li>
            {grid.demandMW != null && (
              <li className="info-row">
                <span className="info-main">Demand now</span>
                <span className="info-side">{Math.round(grid.demandMW).toLocaleString('en-US')} MW{gridPct != null && <span className="info-note"> {gridPct}% of today&apos;s peak fcst</span>}</span>
              </li>
            )}
            {grid.reserveMW != null && (
              <li className="info-row"><span className="info-main">Reserves</span><span className="info-side">{Math.round(grid.reserveMW).toLocaleString('en-US')} MW</span></li>
            )}
            {grid.renewablesPct != null && (
              <li className="info-row"><span className="info-main">Renewables</span><span className="info-side">{grid.renewablesPct}%</span></li>
            )}
          </ul>
        </section>
      )}

      <section className="card-section info-block">
        <h3>Fire weather <span className="info-note">next 24 h</span></h3>
        {!fire ? <p className="info-empty">Fire-weather data not cached yet.</p> : (
          <ul className="info-list">
            <li className="info-row">
              <span className="info-main">Red Flag / fire weather alerts</span>
              <span className="info-side">{redFlag.length ? <b className="info-hot">{redFlag[0].event}</b> : 'none'}</span>
            </li>
            <li className="info-row"><span className="info-main">Lowest humidity</span><span className="info-side">{fire.minRh != null ? `${fire.minRh}%` : '—'}</span></li>
            <li className="info-row"><span className="info-main">Max wind / gust</span><span className="info-side">{fire.maxWindMph ?? '—'} / {fire.maxGustMph ?? '—'} mph</span></li>
            <li className="info-row"><span className="info-main">High temp</span><span className="info-side">{fire.maxTempF != null ? `${fire.maxTempF}°F` : '—'}</span></li>
            {nearCriteria && redFlag.length === 0 && (
              <li className="info-note">Humidity and gusts are near typical red-flag levels.</li>
            )}
          </ul>
        )}
      </section>

      <section className="card-section info-block">
        <h3>Pollen <span className="info-note">ZIP 94553</span></h3>
        {!pollen?.today ? <p className="info-empty">Pollen data not available.</p> : (
          <ul className="info-list">
            <li className="info-row">
              <span className="info-main">Today</span>
              <span className="info-side"><b>{pollenLevel(pollen.today.index)}</b> <span className="info-note">{pollen.today.index.toFixed(1)}/12</span></span>
            </li>
            {pollen.today.triggers.length > 0 && (
              <li className="info-row"><span className="info-main">Main triggers</span><span className="info-side">{pollen.today.triggers.slice(0, 3).join(', ')}</span></li>
            )}
            {pollen.outlook.length > 1 && (
              <li className="info-row">
                <span className="info-main">Next days</span>
                <span className="info-side">
                  {pollen.outlook.filter((o) => o.date > todayKey).slice(0, 3)
                    .map((o) => `${new Date(`${o.date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })} ${o.index.toFixed(1)}`)
                    .join(' · ')}
                </span>
              </li>
            )}
          </ul>
        )}
      </section>

      {(marketRows.length > 0 || tenYear || otherRows.length > 0) && (
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
            {otherRows.map((m) => (
              <li key={m.symbol} className="info-row">
                <span className="info-main">{m.label}</span>
                <span className="info-side">
                  ${fmtPrice(m.q.close)}{' '}
                  <span className={`dir-${pctClass(m.q.percent_change)}`}>{fmtPct(m.q.percent_change)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teams.length > 0 && (
        <section className="card-section info-block">
          <h3>Bay Area teams</h3>
          <ul className="info-list">
            {teams.map((t) => (
              <li key={t.key} className="info-item">
                <span className="info-row">
                  <span className="info-main"><b>{t.name}</b>{t.record ? <span className="info-note"> {t.record}</span> : null}</span>
                  {t.live
                    ? <span className="info-side"><b className="info-hot">LIVE</b> {t.live.us ?? '–'}–{t.live.them ?? '–'} {t.live.home ? 'vs' : '@'} {t.live.opp}</span>
                    : t.last
                      ? <span className="info-side"><b className={t.last.tie ? '' : t.last.won ? 'dir-up' : 'dir-down'}>{t.last.tie ? 'T' : t.last.won ? 'W' : 'L'}</b> {t.last.us}–{t.last.them} {t.last.home ? 'vs' : '@'} {t.last.opp}</span>
                      : <span className="info-side info-note">no games yet</span>}
                </span>
                {t.live ? <span className="info-note">{t.live.detail}</span>
                  : t.next ? <span className="info-note">next: {t.next.neutral ? 'vs' : t.next.home ? 'vs' : '@'} {t.next.opp}, {dayTime(t.next.at)}</span>
                  : t.last ? <span className="info-note">last game {shortDate(t.last.at)}{t.standing ? ` · ${t.standing}` : ''}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {((daily?.reservoirs?.length ?? 0) > 0 || drought) && (
        <section className="card-section info-block">
          <h3>Water &amp; drought <span className="info-note">% full · % of avg</span></h3>
          <ul className="info-list">
            {(daily?.reservoirs ?? []).map((r) => (
              <li key={r.id} className="info-item">
                <span className="info-row">
                  <span className="info-main">{r.name}</span>
                  <span className="info-side"><b>{r.pctCapacity ?? '—'}%</b> <span className="info-note">· {r.pctAverage ?? '—'}% avg</span></span>
                </span>
                {r.pctCapacity != null && (
                  <span className="res-bar" aria-hidden><span style={{ width: `${Math.min(100, r.pctCapacity)}%` }} /></span>
                )}
              </li>
            ))}
            {drought && (
              <li className="info-row">
                <span className="info-main">Drought (Contra Costa)</span>
                <span className="info-side">
                  {drought.worst === 'None'
                    ? <b>None</b>
                    : <><b className="info-hot">{drought.worst}</b> <span className="info-note">{drought.pctInDrought > 0 ? `${Math.round(drought.pctInDrought)}% of county in drought` : `${Math.round(drought.pctAbnormallyDry)}% abnormally dry`}</span></>}
                </span>
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
