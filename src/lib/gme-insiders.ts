// GameStop insider ownership grid — directors and executive officers with
// their exact common-share holdings, read straight from SEC EDGAR Form 3/4/5
// filings, plus ownership / short-interest stats from Yahoo Finance.
//
// Why two sources of truth:
//   • Form 4 lists post-transaction COMMON holdings but not warrants (they
//     were distributed to all holders, so insiders don't file for them), and
//     RSU balances move with vesting. Warrants / unvested RSUs / pledged
//     shares therefore come from the annual proxy (PROXY below, dated) and
//     should be refreshed when the next DEF 14A lands.
//   • Everything else is recomputed from filings on every run. Parsed
//     filings are kept in the stored payload, so after the first run only
//     new accession numbers are downloaded.

const CIK = '1326380';
const CIK10 = '0001326380';
const UA = process.env.SEC_USER_AGENT?.trim() || 'mtz.city hyperlocal dashboard (https://mtz.city)';
const SINCE = '2024-01-01';

// ---- Static proxy facts (DEF 14A filed 2026-05-22, data as of 2026-05-20) ----

export const PROXY = {
  asOf: '2026-05-20',
  url: 'https://www.sec.gov/Archives/edgar/data/1326380/000119312526235130/d937376ddef14a.htm',
  people: {
    '0001767470': { name: 'Ryan Cohen',    title: 'Chairman, President & CEO',        warrants: 3_734_784, rsus: 0,      pledged: 38_347_842 },
    '0001840485': { name: 'Alan Attal',    title: 'Lead Independent Director',        warrants: 57_246,    rsus: 0,      pledged: 596_464 },
    '0001868288': { name: 'Larry Cheng',   title: 'Director',                          warrants: 8_300,     rsus: 0,      pledged: 0 },
    '0001840480': { name: 'Jim Grube',     title: 'Director',                          warrants: 2_943,     rsus: 0,      pledged: 0 },
    '0001822293': { name: 'Nat Turner',    title: 'Director',                          warrants: 0,         rsus: 0,      pledged: 0 },
    '0001990547': { name: 'Dan Moore',     title: 'Principal Financial & Accounting Officer', warrants: 1_081, rsus: 18_237, pledged: 0 },
    '0001981001': { name: 'Mark Robinson', title: 'General Counsel & Secretary',      warrants: 967,       rsus: 18_237, pledged: 0 },
  } as Record<string, { name: string; title: string; warrants: number; rsus: number; pledged: number }>,
};
const ORDER = Object.keys(PROXY.people);

// ---- Types -----------------------------------------------------------------

export interface GmeTx {
  date: string;            // transaction date (YYYY-MM-DD)
  code: string;            // SEC transaction code: P buy, S sell, A award, F tax, G gift, M exercise…
  shares: number;
  price: number | null;
  side: 'A' | 'D' | '';    // acquired / disposed
  post: number;            // shares held after the transaction
  nature: string;          // 'D' direct, 'I' indirect
  via: string;             // ownership note for indirect holdings
}

interface StoredFiling {
  filed: string;
  form: string;
  doc: string;
  owners: { cik: string; name: string; roles: string[] }[];
  txs: GmeTx[];
}

export interface GmePerson {
  cik: string;
  name: string;
  title: string;
  common: number;
  direct: number;
  indirect: number;
  indirectNote: string;
  warrants: number | null;
  rsus: number | null;
  pledged: number | null;
  pctOfOutstanding: number | null;
  netLast90d: number;      // shares bought minus sold on the open market + awards net of tax, last 90 days
  boughtLast90d: number;
  soldLast90d: number;
  lastFiled: string;
  lastAction: { date: string; code: string; shares: number; price: number | null } | null;
}

export interface GmeRecentTx {
  date: string; name: string; cik: string; code: string; shares: number; price: number | null; post: number; url: string; filed: string;
}

export interface GmeYahooStats {
  insidersPct: number | null;
  institutionsPct: number | null;
  sharesShort: number | null;
  shortPctFloat: number | null;
  shortRatio: number | null;
  floatShares: number | null;
  shortAsOf: string | null;
}

export interface GmeInsidersPayload {
  fetchedAt: string;
  outstanding: { shares: number; asOf: string } | null;
  people: GmePerson[];
  totals: { common: number; warrants: number; rsus: number; pctOfOutstanding: number | null };
  recent: GmeRecentTx[];
  yahoo: GmeYahooStats | null;
  proxyAsOf: string;
  proxyUrl: string;
  /** Parsed filings keyed by accession number (so reruns only fetch new ones). */
  filings: Record<string, StoredFiling>;
  errors: Record<string, string>;
}

// ---- HTTP helpers ----------------------------------------------------------

async function secGet(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ---- Form 3/4/5 XML parsing (regex; the schema is small and stable) --------

function first(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`));
  return m ? m[1].trim() : '';
}
// <tag><value>x</value></tag>
function val(block: string, tag: string): string {
  const inner = first(block, tag);
  return inner ? first(inner, 'value') || inner.replace(/<[^>]+>/g, '').trim() : '';
}
function blocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'))].map((m) => m[0]);
}
const bool = (s: string) => s === '1' || s.toLowerCase() === 'true';
const num = (s: string): number | null => { const n = Number(s.replace(/,/g, '')); return s !== '' && Number.isFinite(n) ? n : null; };

function parseOwnershipXml(xml: string): { owners: StoredFiling['owners']; txs: GmeTx[] } {
  const owners = blocks(xml, 'reportingOwner').map((ro) => {
    const roles: string[] = [];
    const rel = first(ro, 'reportingOwnerRelationship');
    if (bool(first(rel, 'isDirector'))) roles.push('Director');
    if (bool(first(rel, 'isOfficer'))) roles.push(first(rel, 'officerTitle') || 'Officer');
    if (bool(first(rel, 'isTenPercentOwner'))) roles.push('10% owner');
    if (bool(first(rel, 'isOther'))) roles.push(first(rel, 'otherText') || 'Other');
    return { cik: first(ro, 'rptOwnerCik'), name: first(ro, 'rptOwnerName'), roles };
  });
  const txs: GmeTx[] = [];
  const rows = [...blocks(xml, 'nonDerivativeTransaction'), ...blocks(xml, 'nonDerivativeHolding')];
  for (const b of rows) {
    const post = num(val(b, 'sharesOwnedFollowingTransaction'));
    if (post == null) continue;
    const isTx = b.startsWith('<nonDerivativeTransaction>');
    const side = val(b, 'transactionAcquiredDisposedCode');
    txs.push({
      date: val(b, 'transactionDate'),
      code: first(first(b, 'transactionCoding'), 'transactionCode'),
      shares: isTx ? num(val(b, 'transactionShares')) ?? 0 : 0,
      price: num(val(b, 'transactionPricePerShare')),
      side: side === 'A' || side === 'D' ? side : '',
      post,
      nature: val(b, 'directOrIndirectOwnership') || 'D',
      via: val(b, 'natureOfOwnership'),
    });
  }
  return { owners, txs };
}

// ---- Build the grid from stored filings ------------------------------------

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

function buildPeople(filings: Record<string, StoredFiling>, outstanding: number | null) {
  const now = Date.now();
  const cut90 = iso(new Date(now - 90 * 86400_000));
  const byOwner = new Map<string, { name: string; roles: Set<string>; entries: { f: StoredFiling; acc: string }[] }>();
  for (const [acc, f] of Object.entries(filings)) {
    for (const o of f.owners) {
      const e = byOwner.get(o.cik) ?? { name: o.name, roles: new Set<string>(), entries: [] };
      o.roles.forEach((r) => e.roles.add(r));
      e.name = o.name;
      e.entries.push({ f, acc });
      byOwner.set(o.cik, e);
    }
  }

  const people: GmePerson[] = [];
  const recent: GmeRecentTx[] = [];
  for (const [cik, e] of byOwner) {
    // Latest filing wins per holding slot (direct / each indirect vehicle);
    // within a filing the last row is the final balance.
    const ordered = [...e.entries].sort((a, b) => a.f.filed.localeCompare(b.f.filed) || a.acc.localeCompare(b.acc));
    const slots = new Map<string, { post: number; via: string; nature: string }>();
    let last: GmeTx | null = null;
    let lastFiled = '';
    let bought = 0, sold = 0, withheld = 0;
    for (const { f, acc } of ordered) {
      for (const t of f.txs) {
        slots.set(`${t.nature}|${t.via}`, { post: t.post, via: t.via, nature: t.nature });
        if (t.shares > 0) { last = t; lastFiled = f.filed; }
        else if (!lastFiled) lastFiled = f.filed;
        const when = t.date || f.filed;
        if (when >= cut90 && t.shares > 0) {
          if (t.code === 'P') bought += t.shares;
          else if (t.code === 'S') sold += t.shares;
          else if (t.code === 'F') withheld += t.shares;
          recent.push({
            date: when, name: PROXY.people[cik]?.name ?? e.name, cik, code: t.code, shares: t.shares, price: t.price, post: t.post, filed: f.filed,
            url: `https://www.sec.gov/Archives/edgar/data/${CIK}/${acc.replace(/-/g, '')}/${f.doc}`,
          });
        }
      }
    }
    let direct = 0, indirect = 0;
    const notes: string[] = [];
    for (const s of slots.values()) {
      if (s.nature === 'I') { indirect += s.post; if (s.post > 0 && s.via) notes.push(s.via.replace(/^by\s+/i, '')); } else direct += s.post;
    }
    const known = PROXY.people[cik];
    const common = direct + indirect;
    people.push({
      cik,
      name: known?.name ?? e.name.split(' ').slice(1).concat(e.name.split(' ')[0]).join(' '),
      title: known?.title ?? ([...e.roles].filter((r) => r !== 'Director').join(', ') || [...e.roles].join(', ') || 'Insider'),
      common, direct, indirect, indirectNote: notes.join('; '),
      warrants: known ? known.warrants : null,
      rsus: known ? known.rsus : null,
      pledged: known ? known.pledged : null,
      pctOfOutstanding: outstanding ? (common / outstanding) * 100 : null,
      netLast90d: bought - sold - withheld,
      boughtLast90d: bought,
      soldLast90d: sold,
      lastFiled,
      lastAction: last ? { date: last.date, code: last.code, shares: last.shares, price: last.price } : null,
    });
  }

  // Current insiders only: the proxy roster, plus anyone else who filed
  // in the last year (a new director or officer not yet in PROXY).
  const yearAgo = iso(new Date(now - 365 * 86400_000));
  const shown = people.filter((p) => ORDER.includes(p.cik) || p.lastFiled >= yearAgo);
  shown.sort((a, b) => {
    const ia = ORDER.indexOf(a.cik), ib = ORDER.indexOf(b.cik);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });
  recent.sort((a, b) => b.date.localeCompare(a.date));
  return { people: shown, recent: recent.filter((r) => shown.some((p) => p.cik === r.cik)).slice(0, 30) };
}

// ---- Shares outstanding (SEC XBRL cover-page fact) -------------------------

async function fetchOutstanding(): Promise<{ shares: number; asOf: string } | null> {
  const t = await secGet(`https://data.sec.gov/api/xbrl/companyconcept/CIK${CIK10}/dei/EntityCommonStockSharesOutstanding.json`);
  const rows = (JSON.parse(t) as { units?: { shares?: { end: string; val: number }[] } }).units?.shares ?? [];
  const latest = [...rows].sort((a, b) => a.end.localeCompare(b.end)).pop();
  return latest ? { shares: latest.val, asOf: latest.end } : null;
}

// ---- Yahoo Finance: insider %, institutions %, short interest --------------

async function fetchYahoo(): Promise<GmeYahooStats | null> {
  const ua = 'Mozilla/5.0 (compatible; mtz-city/1.0)';
  const c = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': ua }, redirect: 'manual', cache: 'no-store' });
  const cookie = (c.headers.getSetCookie?.() ?? []).map((s) => s.split(';')[0]).join('; ');
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': ua, Cookie: cookie }, cache: 'no-store' });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes('<')) throw new Error('yahoo crumb unavailable');
  const r = await fetch(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/GME?modules=majorHoldersBreakdown,defaultKeyStatistics&crumb=${encodeURIComponent(crumb)}`,
    { headers: { 'User-Agent': ua, Cookie: cookie }, cache: 'no-store' },
  );
  if (!r.ok) throw new Error(`yahoo quoteSummary ${r.status}`);
  type Raw = { raw?: number } | undefined;
  const j = await r.json() as { quoteSummary?: { result?: { majorHoldersBreakdown?: Record<string, Raw>; defaultKeyStatistics?: Record<string, Raw> }[] } };
  const res = j.quoteSummary?.result?.[0];
  if (!res) return null;
  const m = res.majorHoldersBreakdown ?? {}, k = res.defaultKeyStatistics ?? {};
  const pct = (x: Raw) => (typeof x?.raw === 'number' ? x.raw * 100 : null);
  const n = (x: Raw) => (typeof x?.raw === 'number' ? x.raw : null);
  const dsi = n(k.dateShortInterest);
  return {
    insidersPct: pct(m.insidersPercentHeld),
    institutionsPct: pct(m.institutionsPercentHeld),
    sharesShort: n(k.sharesShort),
    shortPctFloat: pct(k.shortPercentOfFloat),
    shortRatio: n(k.shortRatio),
    floatShares: n(k.floatShares),
    shortAsOf: dsi ? iso(new Date(dsi * 1000)) : null,
  };
}

// ---- Public entry ----------------------------------------------------------

export async function fetchGmeInsiders(prev: GmeInsidersPayload | null): Promise<GmeInsidersPayload> {
  const errors: Record<string, string> = {};
  const filings: Record<string, StoredFiling> = { ...(prev?.filings ?? {}) };

  // 1) list ownership filings (Forms 3/4/5) since 2024
  const sub = JSON.parse(await secGet(`https://data.sec.gov/submissions/CIK${CIK10}.json`)) as {
    filings: { recent: Cols; files?: { name: string }[] };
  };
  type Cols = { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] };
  const pages: Cols[] = [sub.filings.recent];
  for (const f of sub.filings.files ?? []) {
    try { pages.push(JSON.parse(await secGet(`https://data.sec.gov/submissions/${f.name}`)) as Cols); await sleep(120); }
    catch (e) { errors['submissions-page'] = e instanceof Error ? e.message : String(e); }
  }
  const want: { acc: string; form: string; filed: string; doc: string }[] = [];
  for (const p of pages) {
    p.form.forEach((form, i) => {
      if (!['3', '3/A', '4', '4/A', '5', '5/A'].includes(form)) return;
      if (p.filingDate[i] < SINCE) return;
      want.push({ acc: p.accessionNumber[i], form, filed: p.filingDate[i], doc: p.primaryDocument[i].split('/').pop() ?? '' });
    });
  }

  // 2) download only filings we haven't parsed yet
  let fetched = 0;
  for (const w of want) {
    if (filings[w.acc]) continue;
    try {
      const xml = await secGet(`https://www.sec.gov/Archives/edgar/data/${CIK}/${w.acc.replace(/-/g, '')}/${w.doc}`);
      const { owners, txs } = parseOwnershipXml(xml);
      filings[w.acc] = { filed: w.filed, form: w.form, doc: w.doc, owners, txs };
      fetched++;
      await sleep(120);                       // stay well under SEC's 10 req/s
    } catch (e) {
      errors[w.acc] = e instanceof Error ? e.message : String(e);
    }
  }

  // 3) side data (each failure just leaves that bit blank / stale)
  let outstanding = prev?.outstanding ?? null;
  try { outstanding = await fetchOutstanding() ?? outstanding; } catch (e) { errors.outstanding = e instanceof Error ? e.message : String(e); }
  let yahoo = prev?.yahoo ?? null;
  try { yahoo = await fetchYahoo() ?? yahoo; } catch (e) { errors.yahoo = e instanceof Error ? e.message : String(e); }

  const { people, recent } = buildPeople(filings, outstanding?.shares ?? null);
  const common = people.reduce((s, p) => s + p.common, 0);
  const totals = {
    common,
    warrants: people.reduce((s, p) => s + (p.warrants ?? 0), 0),
    rsus: people.reduce((s, p) => s + (p.rsus ?? 0), 0),
    pctOfOutstanding: outstanding ? (common / outstanding.shares) * 100 : null,
  };
  if (!people.length) throw new Error(`gme_insiders: no ownership data (${fetched} fetched) ${JSON.stringify(errors)}`);
  return {
    fetchedAt: new Date().toISOString(), outstanding, people, totals, recent, yahoo,
    proxyAsOf: PROXY.asOf, proxyUrl: PROXY.url, filings, errors,
  };
}
