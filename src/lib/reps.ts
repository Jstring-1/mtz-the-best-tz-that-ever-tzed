// Elected representatives for Martinez — narrow scope, only the
// offices that actually represent us:
//   - City of Martinez Council & Mayor
//   - Contra Costa BOS, District 5
//   - CA State Senate, District 9
//   - CA State Assembly, District 15
//   - CA Governor
//   - U.S. House, CA-08
//   - U.S. Senate (both CA senators)
//
// Each tier has its own fetcher; the top-level builder calls them in
// parallel and emits a single typed payload. The /api/reps route serves
// the cached blob and the RepsDetail modal renders it.
//
// Data sources (no static-name hardcoding except for stable .gov URLs):
//   - Federal House + Senate    → Congress.gov (GOV_API_TOKEN)
//   - CA legislature            → OpenStates v3 by org_classification + district
//   - Governor                  → gov.ca.gov scrape
//   - CCC Board of Supervisors  → contracosta.ca.gov scrape (D5 only)
//   - Martinez Mayor + Council  → cityofmartinez.org scrape
//
// All scrapes are resilient: a section that fails parsing emits a single
// link-only row pointing at the canonical official page so the user
// always has something actionable.

const CONGRESS_KEY = process.env.GOV_API_TOKEN ?? '';
const OPENSTATES_KEY = process.env.OPENSTATES_API_KEY ?? '';

// Districts that include / represent Martinez (as specified):
//   US House:           CA-08
//   CA State Senate:    SD-9
//   CA State Assembly:  AD-15
//   CCC Board of Sup:   District 5
const US_HOUSE_DISTRICT = 8;
const CA_SENATE_DISTRICT = '9';
const CA_ASSEMBLY_DISTRICT = '15';
const COUNTY_BOS_DISTRICT = 5;

const COMMON_HEADERS = {
  // Use a realistic Chrome UA — many .gov sites cloak on UA detection.
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const JSON_HEADERS = {
  'User-Agent': 'mtz.city/1.0 (reps lookup)',
  Accept: 'application/json',
};

// Tight per-request timeout — the 12h bucket has ~8 other jobs, and
// Railway's HTTP proxy kills the connection at ~90s. Keep this small.
async function safeFetch(url: string, init?: RequestInit, timeoutMs = 5000): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store', redirect: 'follow' });
    if (!r.ok) { console.warn(`[reps] HTTP ${r.status} ${url}`); return null; }
    return r;
  } catch (e) {
    console.warn(`[reps] fetch threw for ${url}:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

async function safeJson<T = unknown>(url: string, init?: RequestInit, timeoutMs = 5000): Promise<T | null> {
  const r = await safeFetch(url, { ...init, headers: { ...JSON_HEADERS, ...(init?.headers ?? {}) } }, timeoutMs);
  if (!r) return null;
  try { return await r.json() as T; } catch { return null; }
}
async function safeText(url: string, init?: RequestInit, timeoutMs = 5000): Promise<string | null> {
  const r = await safeFetch(url, { ...init, headers: { ...COMMON_HEADERS, ...(init?.headers ?? {}) } }, timeoutMs);
  if (!r) return null;
  try { return await r.text(); } catch { return null; }
}

// =====================================================================
// Types
// =====================================================================

export type RepLevel = 'city' | 'county' | 'state' | 'state-leg' | 'federal';

export interface Rep {
  level: RepLevel;
  office: string;            // e.g. "Mayor", "Council Member, District 2", "U.S. Senator"
  name: string;              // resolved name (or '' when only an official-link is known)
  party?: string;            // 'D' | 'R' | 'NP' | 'I'
  district?: string;         // 'CA-10', 'AD-15', 'SD-7', 'BOS Dist 5' etc.
  url?: string;              // official member/office page
  phone?: string;
  email?: string;
  photoUrl?: string;
  notes?: string;            // term-end, role context, etc.
}

export interface RepsPayload {
  scrapedAt: string;
  city: Rep[];
  county: Rep[];
  state: Rep[];              // statewide constitutional officers
  stateLegislature: Rep[];   // assembly + state senate members
  federal: Rep[];
  diag: Record<string, string>;
}

// =====================================================================
// FEDERAL — Congress.gov
// =====================================================================

// CA-10 (Martinez) and the 2 CA Senators. These bioguide IDs are stable
// regardless of who holds the seat — when a member changes, Congress.gov
// returns the new occupant under the same {state, district} query, but
// we need bioguide IDs to call /member/{id} for photo/contact details.
// To stay automatic, we resolve current members via:
//   GET /v3/member?currentMember=True&stateCode=CA&limit=100
// then pick the senators + CA-10 house rep.

interface CongressMember {
  bioguideId?: string;
  name?: string;
  partyName?: string;
  state?: string;
  district?: number;
  url?: string;
  depiction?: { imageUrl?: string };
  terms?: { item?: Array<{ chamber?: string; startYear?: number; endYear?: number }> };
}
interface CongressMembersResp { members?: CongressMember[] }
interface CongressMemberDetailResp {
  member?: {
    directOrderName?: string;
    firstName?: string; lastName?: string;
    state?: string; district?: number;
    partyHistory?: Array<{ partyAbbreviation?: string; partyName?: string }>;
    addressInformation?: { phoneNumber?: string; officeAddress?: string };
    depiction?: { imageUrl?: string };
    officialWebsiteUrl?: string;
  };
}

async function federalReps(diag: Record<string, string>): Promise<Rep[]> {
  if (!CONGRESS_KEY) { diag.federal = 'GOV_API_TOKEN missing'; return []; }
  const listUrl =
    `https://api.congress.gov/v3/member?api_key=${CONGRESS_KEY}&format=json&currentMember=True&stateCode=CA&limit=100`;
  const list = await safeJson<CongressMembersResp>(listUrl);
  const members = list?.members ?? [];
  diag.federalRaw = `${members.length} CA members returned`;
  if (members.length === 0) { diag.federal = 'empty member list'; return []; }

  // Identify each member's CURRENT chamber (last term in the list).
  // This correctly handles senators who previously served in the House
  // (e.g., Schiff) — only the latest term decides what they are today.
  const targets = members.filter((m) => {
    const terms = m.terms?.item ?? [];
    if (terms.length === 0) return false;
    const lastChamber = (terms[terms.length - 1].chamber ?? '').toLowerCase();
    const isHouseNow  = lastChamber.includes('house');
    const isSenateNow = lastChamber.includes('senate');
    const district = Number(m.district);
    if (isSenateNow) return true;
    if (isHouseNow && district === US_HOUSE_DISTRICT) return true;
    return false;
  });
  diag.federalFiltered = `${targets.length} after district filter (want CA-${US_HOUSE_DISTRICT} + 2 sens)`;

  const enriched = await Promise.all(targets.map(async (m): Promise<Rep | null> => {
    if (!m.bioguideId) return null;
    const det = await safeJson<CongressMemberDetailResp>(
      `https://api.congress.gov/v3/member/${m.bioguideId}?api_key=${CONGRESS_KEY}&format=json`,
    );
    const mem = det?.member;
    const party = mem?.partyHistory?.[mem.partyHistory.length - 1]?.partyAbbreviation
              ?? mem?.partyHistory?.[0]?.partyAbbreviation
              ?? (m.partyName?.[0] ?? '');
    const isSenate = m.terms?.item?.some((t) => /senate/i.test(t.chamber ?? ''));
    const office = isSenate ? 'U.S. Senator' : 'U.S. Representative';
    const district = isSenate ? 'CA' : `CA-${m.district ?? '?'}`;
    return {
      level: 'federal',
      office,
      name: mem?.directOrderName ?? m.name ?? '',
      party,
      district,
      url: mem?.officialWebsiteUrl ?? `https://www.congress.gov/member/${m.bioguideId}`,
      phone: mem?.addressInformation?.phoneNumber,
      photoUrl: mem?.depiction?.imageUrl ?? m.depiction?.imageUrl,
    };
  }));
  const out = enriched.filter((r): r is Rep => r !== null);
  // Sort: Senators first, then House.
  out.sort((a, b) => {
    const rank = (r: Rep) => /senator/i.test(r.office) ? 0 : 1;
    return rank(a) - rank(b);
  });
  return out;
}

// =====================================================================
// STATE LEGISLATURE — OpenStates
// =====================================================================

interface OsPerson {
  id?: string;
  name?: string;
  party?: string;
  current_role?: {
    title?: string;          // 'Assembly Member' | 'Senator'
    org_classification?: string;   // 'lower' | 'upper'
    district?: string;
    division_id?: string;
  };
  jurisdiction?: { name?: string };
  image?: string;
  email?: string;
  links?: Array<{ url?: string; note?: string }>;
  offices?: Array<{ classification?: string; voice?: string; address?: string }>;
}
interface OsListResp { results?: OsPerson[] }

async function stateLegislature(diag: Record<string, string>): Promise<Rep[]> {
  if (!OPENSTATES_KEY) { diag.stateLeg = 'OPENSTATES_API_KEY missing'; return []; }
  // Query the two specific chambers by district. `org_classification`
  // values are 'upper' (Senate) / 'lower' (Assembly).
  const headers = { 'X-API-Key': OPENSTATES_KEY };
  const senateUrl   = `https://v3.openstates.org/people?jurisdiction=ca&org_classification=upper&district=${CA_SENATE_DISTRICT}&per_page=5`;
  const assemblyUrl = `https://v3.openstates.org/people?jurisdiction=ca&org_classification=lower&district=${CA_ASSEMBLY_DISTRICT}&per_page=5`;
  const [senJ, asmJ] = await Promise.all([
    safeJson<OsListResp>(senateUrl,   { headers }),
    safeJson<OsListResp>(assemblyUrl, { headers }),
  ]);
  const people = [...(senJ?.results ?? []), ...(asmJ?.results ?? [])];
  if (!people.length) diag.stateLeg = 'no legislators returned for SD-9 / AD-15';
  return people.map<Rep>((p): Rep => {
    const cls = p.current_role?.org_classification;
    const district = p.current_role?.district ?? '';
    const officeTag = cls === 'lower' ? 'Assembly Member' : cls === 'upper' ? 'State Senator' : (p.current_role?.title ?? 'State Legislator');
    const districtTag = cls === 'lower' ? `AD-${district}` : cls === 'upper' ? `SD-${district}` : district;
    const officialLink = p.links?.find((l) => /official|home/i.test(l.note ?? ''))?.url
      ?? p.links?.[0]?.url
      ?? `https://openstates.org/person/${p.id}`;
    return {
      level: 'state-leg',
      office: officeTag,
      name: p.name ?? '',
      party: p.party?.[0],
      district: districtTag,
      url: officialLink,
      email: p.email,
      phone: p.offices?.[0]?.voice,
      photoUrl: p.image,
    };
  });
}

// =====================================================================
// STATEWIDE CA OFFICERS — per-office scrape
// =====================================================================
//
// Each constitutional officer publishes their name in a stable spot on
// their own .gov homepage. We grab the page, extract a name via a
// per-site regex, and fall back to a link-only row when extraction
// fails. Update the OFFICES list when a constitutional office is added.

interface StateOfficeCfg {
  office: string;
  url: string;
  // First capture group must be the officeholder name.
  nameRe: RegExp;
}
// Only the Governor — other statewide constitutional officers are
// out of scope per the requested rep list. Add back here later if
// scope expands.
const STATE_OFFICES: StateOfficeCfg[] = [
  { office: 'Governor',
    url: 'https://www.gov.ca.gov/',
    nameRe: /Governor\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
];

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
}
function stripTags(s: string): string { return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '); }

async function statewideOfficers(diag: Record<string, string>): Promise<Rep[]> {
  const out = await Promise.all(STATE_OFFICES.map(async (o): Promise<Rep> => {
    const html = await safeText(o.url);
    let name = '';
    if (html) {
      const text = decodeEntities(stripTags(html));
      const m = text.match(o.nameRe);
      if (m) name = m[1].trim();
      else diag[`state:${o.office}`] = 'name not parsed';
    } else {
      diag[`state:${o.office}`] = 'fetch failed';
    }
    return { level: 'state', office: o.office, name, url: o.url };
  }));
  return out;
}

// =====================================================================
// COUNTY — Contra Costa BOS
// =====================================================================
//
// Martinez sits in District 5. The county BOS page lists all five
// supervisors with name + district. The site uses the CivicPlus CMS;
// the index page is at /Board-of-Supervisors (path slug may vary).

async function countyReps(diag: Record<string, string>): Promise<Rep[]> {
  // Race the official CCC pages + Ballotpedia in parallel. Whichever
  // returns first with a parseable name wins. Ballotpedia is the most
  // reliable since CivicPlus .gov sites often 403 cloud egress.
  const ccPages = [
    'https://www.contracosta.ca.gov/Board-of-Supervisors',
    'https://www.contracosta.ca.gov/4818/Board-of-Supervisors',
    'https://www.contracosta.ca.gov/3179/Board-of-Supervisors',
    'https://www.contracosta.ca.gov/418/Board-of-Supervisors',
  ];
  const ballotpediaUrl = 'https://ballotpedia.org/Contra_Costa_County,_California';
  const fetches = await Promise.all([
    ...ccPages.map((u) => safeText(u)),
    safeText(ballotpediaUrl),
  ]);
  const ballotHtml = fetches[fetches.length - 1];
  // Try official county pages first (district 1-5 mention is a sanity tag).
  let html: string | null = null;
  let usedUrl = ccPages[0];
  for (let i = 0; i < ccPages.length; i++) {
    const h = fetches[i];
    if (h && /district\s*[1-5]/i.test(h)) { html = h; usedUrl = ccPages[i]; break; }
  }
  // Pull a name from the official page.
  let name = '';
  if (html) {
    const text = decodeEntities(stripTags(html));
    const start = text.search(new RegExp(`District\\s+${COUNTY_BOS_DISTRICT}\\b`, 'i'));
    if (start >= 0) {
      const after = text.slice(start, start + 400);
      const m = after.match(/District\s+\d\s+(Supervisor\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
      if (m) name = m[2].trim();
    }
  }
  // Fallback to Ballotpedia — they list supervisors in a standard format:
  //   "District 5: <a href="/Federal_Glover">Federal Glover</a>"
  // or a table row with the district number followed by the name.
  if (!name && ballotHtml) {
    const text = decodeEntities(stripTags(ballotHtml));
    const m = text.match(new RegExp(`District\\s+${COUNTY_BOS_DISTRICT}\\b[^A-Za-z]{0,40}([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})`));
    if (m) {
      name = m[1].trim();
      usedUrl = ballotpediaUrl;
      diag.countySource = 'ballotpedia';
    }
  }
  if (!name) diag.county = 'no source resolved District 5 name';
  return [{
    level: 'county',
    office: `Supervisor, District ${COUNTY_BOS_DISTRICT} (Martinez)`,
    name,
    district: `BOS Dist ${COUNTY_BOS_DISTRICT}`,
    url: usedUrl,
  }];
}

// =====================================================================
// CITY — Martinez Mayor + Council
// =====================================================================

async function cityReps(diag: Record<string, string>): Promise<Rep[]> {
  // Same fallback strategy as countyReps: race official + Ballotpedia.
  const ofMartinez = [
    'https://www.cityofmartinez.org/government/mayor-city-council',
    'https://www.cityofmartinez.org/government/mayor-and-city-council',
    'https://www.cityofmartinez.org/government',
  ];
  const ballotpediaUrl = 'https://ballotpedia.org/Martinez,_California';
  const fetches = await Promise.all([
    ...ofMartinez.map((u) => safeText(u)),
    safeText(ballotpediaUrl),
  ]);
  const ballotHtml = fetches[fetches.length - 1];
  let html: string | null = null;
  let usedUrl = ofMartinez[0];
  for (let i = 0; i < ofMartinez.length; i++) {
    const h = fetches[i];
    if (h && /city\s*council/i.test(h)) { html = h; usedUrl = ofMartinez[i]; break; }
  }
  // If official site failed, prefer Ballotpedia as the primary text source.
  if (!html && ballotHtml) {
    html = ballotHtml;
    usedUrl = ballotpediaUrl;
    diag.citySource = 'ballotpedia';
  }
  if (!html) {
    diag.city = 'no council page resolved';
    return [{ level: 'city', office: 'Mayor + Council', name: '',
      url: 'https://www.cityofmartinez.org/government' }];
  }
  const text = decodeEntities(stripTags(html));
  // Mayor: "Mayor <First Last>". Council members: "Council Member ... <Name>"
  // or "District N <Name>" or "<Name>, Vice Mayor".
  const reps: Rep[] = [];
  const mayorM = text.match(/Mayor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
  if (mayorM) {
    reps.push({ level: 'city', office: 'Mayor', name: mayorM[1].trim(), url: usedUrl });
  }
  // Council districts 1..4. Some seats may be at-large; we just look for
  // each district label.
  for (let d = 1; d <= 4; d++) {
    const m = text.match(new RegExp(`District\\s+${d}\\b[^A-Z]{0,40}([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})`));
    if (m) {
      reps.push({
        level: 'city',
        office: `Council Member, District ${d}`,
        name: m[1].trim(),
        district: `District ${d}`,
        url: usedUrl,
      });
    }
  }
  if (reps.length === 0) {
    diag.city = 'page fetched but no roster parsed';
    return [{ level: 'city', office: 'Mayor + Council', name: '', url: usedUrl }];
  }
  return reps;
}

// =====================================================================
// Top-level builder
// =====================================================================

export async function fetchReps(): Promise<RepsPayload> {
  const diag: Record<string, string> = {};
  const [federal, state, stateLegislature_, county, city] = await Promise.all([
    federalReps(diag).catch((e) => { diag.federal = String(e); return []; }),
    statewideOfficers(diag).catch((e) => { diag.state = String(e); return []; }),
    stateLegislature(diag).catch((e) => { diag.stateLeg = String(e); return []; }),
    countyReps(diag).catch((e) => { diag.county = String(e); return []; }),
    cityReps(diag).catch((e) => { diag.city = String(e); return []; }),
  ]);
  return {
    scrapedAt: new Date().toISOString(),
    city,
    county,
    state,
    stateLegislature: stateLegislature_,
    federal,
    diag,
  };
}
