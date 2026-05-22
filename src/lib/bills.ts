// Legislation affecting Martinez / Contra Costa County / California.
//
// Combines two data sources:
//   - Congress.gov API (key: GOV_API_TOKEN)        → federal bills
//   - OpenStates v3 API (key: OPENSTATES_API_KEY)  → CA state legislature
//
// Federal coverage = sponsored + cosponsored by the four CA federal
// members whose districts overlap Contra Costa County: Reps DeSaulnier
// (CA-10) and Garamendi (CA-8), and Senators Padilla and Schiff.
//
// State coverage = current-session CA bills with "Contra Costa" in the
// text/title (OpenStates `q=` parameter), sorted by most-recent action.
//
// Refreshed every 4h from the cron and stored in apis_json under
// `affecting_bills`. The /api/affecting-bills route serves this cached
// payload to the BillsDetail modal — no live API calls on click.

const CONGRESS_KEY = process.env.GOV_API_TOKEN ?? '';
const OPENSTATES_KEY = process.env.OPENSTATES_API_KEY ?? '';
const CURRENT_CONGRESS = 119;

const HEADERS_JSON = {
  'User-Agent': 'mtz.city/1.0 (bills aggregator; contact via github.com/Jstring-1)',
  Accept: 'application/json',
};

export type Jurisdiction = 'federal' | 'state';

export interface BillRow {
  jurisdiction: Jurisdiction;
  number: string;                // e.g. "HR 1234", "S 567", "AB 100"
  type?: string;                 // "HR" | "S" | "HJRES" etc. (federal)
  congress?: number;             // federal only
  session?: string;              // state only, e.g. "20252026"
  chamber?: string;              // "House" | "Senate" | "Assembly"
  title: string;
  introduced: string;
  latestAction: string;
  latestActionDate: string;
  url: string;
  sponsor?: string;
  match?: string;                // tag describing why it's in the list
}

export interface MemberBills {
  bioguideId: string;
  name: string;
  party: string;
  role: string;                  // "Rep. (CA-10)" / "Senator (CA)"
  url: string;
  sponsored: BillRow[];
  cosponsored: BillRow[];
}

export interface AffectingBillsPayload {
  scrapedAt: string;
  congress: number;
  federalMembers: MemberBills[];
  stateBills: BillRow[];
  // OpenStates session id we queried; blank if the lookup failed.
  stateSession: string;
}

// Federal members whose districts include Contra Costa County. If a
// reapportionment changes the seat, edit this list.
const FEDERAL_MEMBERS: Array<{ bioguideId: string; name: string; party: string; role: string }> = [
  { bioguideId: 'D000623', name: 'Mark DeSaulnier', party: 'D', role: 'Rep. CA-10 (Martinez)' },
  { bioguideId: 'G000559', name: 'John Garamendi',  party: 'D', role: 'Rep. CA-08 (East CCC)' },
  { bioguideId: 'P000145', name: 'Alex Padilla',    party: 'D', role: 'Senator (CA)' },
  { bioguideId: 'S001150', name: 'Adam Schiff',     party: 'D', role: 'Senator (CA)' },
];

async function safeJson<T = unknown>(url: string, init?: RequestInit, tag = 'bills', timeoutMs = 12000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { ...HEADERS_JSON, ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    if (!r.ok) {
      const body = (await r.text().catch(() => '')).slice(0, 200);
      console.warn(`[bills] ${tag}: HTTP ${r.status} ${body.replace(/\s+/g, ' ')}`);
      return null;
    }
    return await r.json() as T;
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    console.warn(`[bills] ${tag} threw:`, aborted ? `timeout after ${timeoutMs}ms` : (e instanceof Error ? e.message : String(e)));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Congress.gov ------------------------------------------------------

interface CongressBillItem {
  number?: string;
  type?: string;
  congress?: number;
  title?: string;
  introducedDate?: string;
  latestAction?: { actionDate?: string; text?: string };
}
interface CongressLegResp {
  sponsoredLegislation?: CongressBillItem[];
  cosponsoredLegislation?: CongressBillItem[];
}

function billHumanUrl(type?: string, num?: string, cg?: number): string {
  if (!type || !num || !cg) return '';
  const t = type.toLowerCase();
  const seg = t === 'hr' ? 'house-bill'
    : t === 's' ? 'senate-bill'
    : t === 'hjres' ? 'house-joint-resolution'
    : t === 'sjres' ? 'senate-joint-resolution'
    : t === 'hres' ? 'house-resolution'
    : t === 'sres' ? 'senate-resolution'
    : 'house-bill';
  const cgSuffix = cg % 100 >= 11 && cg % 100 <= 13 ? 'th'
    : cg % 10 === 1 ? 'st'
    : cg % 10 === 2 ? 'nd'
    : cg % 10 === 3 ? 'rd' : 'th';
  return `https://www.congress.gov/bill/${cg}${cgSuffix}-congress/${seg}/${num}`;
}

function mapCongressBill(b: CongressBillItem, sponsor: string): BillRow {
  const type = (b.type ?? '').toUpperCase();
  const number = `${type} ${b.number ?? ''}`.trim();
  return {
    jurisdiction: 'federal',
    number,
    type,
    congress: b.congress,
    chamber: type.startsWith('S') ? 'Senate' : 'House',
    title: b.title ?? '(untitled)',
    introduced: b.introducedDate ?? '',
    latestAction: b.latestAction?.text ?? '',
    latestActionDate: b.latestAction?.actionDate ?? '',
    url: billHumanUrl(b.type, b.number, b.congress),
    sponsor,
  };
}

async function fetchMember(m: typeof FEDERAL_MEMBERS[number]): Promise<MemberBills | null> {
  if (!CONGRESS_KEY) return null;
  const base = `https://api.congress.gov/v3/member/${m.bioguideId}`;
  // Pull 25 each — Congress.gov returns most-recent-first by default.
  const [spJson, csJson] = await Promise.all([
    safeJson<CongressLegResp>(
      `${base}/sponsored-legislation?api_key=${CONGRESS_KEY}&format=json&limit=25`,
      undefined, `member-${m.bioguideId}-sp`,
    ),
    safeJson<CongressLegResp>(
      `${base}/cosponsored-legislation?api_key=${CONGRESS_KEY}&format=json&limit=25`,
      undefined, `member-${m.bioguideId}-co`,
    ),
  ]);
  return {
    bioguideId: m.bioguideId,
    name: m.name,
    party: m.party,
    role: m.role,
    url: `https://www.congress.gov/member/${m.bioguideId}`,
    sponsored:   (spJson?.sponsoredLegislation   ?? []).map((b) => mapCongressBill(b, m.name)),
    cosponsored: (csJson?.cosponsoredLegislation ?? []).map((b) => mapCongressBill(b, m.name)),
  };
}

// ---- OpenStates --------------------------------------------------------

interface OsAction {
  date?: string;
  description?: string;
  organization?: { name?: string };
}
interface OsBill {
  identifier?: string;            // e.g. "AB 100"
  title?: string;
  session?: string;
  jurisdiction?: { name?: string };
  from_organization?: { classification?: string; name?: string };
  first_action_date?: string;
  latest_action_date?: string;
  latest_action_description?: string;
  openstates_url?: string;
  sources?: Array<{ url?: string }>;
  sponsorships?: Array<{ name?: string; primary?: boolean }>;
  actions?: OsAction[];
}
interface OsBillsResp {
  results?: OsBill[];
  pagination?: { total_items?: number };
}

function mapOsBill(b: OsBill): BillRow {
  const chamberClass = (b.from_organization?.classification ?? '').toLowerCase();
  const chamber = chamberClass === 'lower' ? 'Assembly'
    : chamberClass === 'upper' ? 'Senate'
    : (b.from_organization?.name ?? '');
  // Prefer the official leginfo.legislature.ca.gov link from sources;
  // fall back to openstates' own page.
  const legLink = b.sources?.find((s) => /leginfo\.legislature\.ca\.gov/i.test(s.url ?? ''))?.url;
  const url = legLink ?? b.openstates_url ?? '';
  const primary = b.sponsorships?.find((s) => s.primary)?.name
    ?? b.sponsorships?.[0]?.name;
  return {
    jurisdiction: 'state',
    number: b.identifier ?? '',
    chamber,
    session: b.session,
    title: b.title ?? '(untitled)',
    introduced: b.first_action_date ?? '',
    latestAction: b.latest_action_description ?? '',
    latestActionDate: b.latest_action_date ?? '',
    url,
    sponsor: primary,
    match: 'mentions "Contra Costa"',
  };
}

async function fetchStateBills(): Promise<{ bills: BillRow[]; session: string }> {
  if (!OPENSTATES_KEY) return { bills: [], session: '' };
  // OpenStates supports `q` as a full-text query across bill text +
  // metadata. We sort by most-recent action to surface what's moving.
  // include `sponsorships` so we can attribute the bill.
  const url =
    `https://v3.openstates.org/bills?jurisdiction=ca` +
    `&q=Contra+Costa` +
    `&per_page=20` +
    `&sort=latest_action_dsc` +
    `&include=sponsorships&include=sources`;
  const j = await safeJson<OsBillsResp>(url, {
    headers: { 'X-API-Key': OPENSTATES_KEY },
  }, 'openstates');
  const results = j?.results ?? [];
  const bills = results.map(mapOsBill);
  return { bills, session: results[0]?.session ?? '' };
}

// ---- Top-level fetch ---------------------------------------------------

export async function fetchAffectingBills(): Promise<AffectingBillsPayload> {
  // Parallelise across all members + state lookup. Each is independently
  // resilient (returns null/empty on failure).
  const [memberResults, state] = await Promise.all([
    Promise.all(FEDERAL_MEMBERS.map(fetchMember)),
    fetchStateBills(),
  ]);
  const federalMembers = memberResults.filter((m): m is MemberBills => m !== null);
  return {
    scrapedAt: new Date().toISOString(),
    congress: CURRENT_CONGRESS,
    federalMembers,
    stateBills: state.bills,
    stateSession: state.session,
  };
}
