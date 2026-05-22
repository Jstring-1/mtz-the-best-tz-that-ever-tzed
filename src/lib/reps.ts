// Elected representatives for Martinez, all levels.
//
// Each tier has its own fetcher; the top-level builder calls them in
// parallel and emits a single typed payload. The /api/reps route serves
// the cached blob and the RepsDetail modal renders it.
//
// Sources (no static-name hardcoding except for stable URLs):
//   - Federal House + Senate    → Congress.gov (GOV_API_TOKEN)
//   - CA legislature            → OpenStates v3 geo-lookup at Martinez lat/lng
//   - Statewide CA constitutional officers → per-office .gov scrape
//   - CCC Board of Supervisors  → contracosta.ca.gov scrape
//   - Martinez Mayor + Council  → cityofmartinez.org scrape
//
// All scrapes are resilient: a section that fails parsing emits a single
// link-only row pointing at the canonical official page so the user
// always has something actionable.

const CONGRESS_KEY = process.env.GOV_API_TOKEN ?? '';
const OPENSTATES_KEY = process.env.OPENSTATES_API_KEY ?? '';

// Martinez approximate center — used for the OpenStates geo lookup.
const MARTINEZ_LAT = 38.0194;
const MARTINEZ_LNG = -122.1341;

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

async function safeFetch(url: string, init?: RequestInit, timeoutMs = 10000): Promise<Response | null> {
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

async function safeJson<T = unknown>(url: string, init?: RequestInit, timeoutMs = 10000): Promise<T | null> {
  const r = await safeFetch(url, { ...init, headers: { ...JSON_HEADERS, ...(init?.headers ?? {}) } }, timeoutMs);
  if (!r) return null;
  try { return await r.json() as T; } catch { return null; }
}
async function safeText(url: string, init?: RequestInit, timeoutMs = 10000): Promise<string | null> {
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
  if (members.length === 0) { diag.federal = 'empty member list'; return []; }

  // House CA-10 = Martinez. Senators have district === undefined.
  const targets = members.filter((m) => {
    const isHouse = m.terms?.item?.some((t) => /house/i.test(t.chamber ?? ''));
    const isSenate = m.terms?.item?.some((t) => /senate/i.test(t.chamber ?? ''));
    return (isHouse && m.district === 10) || isSenate;
  });

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
  // President & VP — anchored on the stable whitehouse.gov URL; name not
  // exposed by Congress.gov so we scrape just the title line.
  out.push(...await whiteHouse(diag));
  // Sort: President + VP first, then Senators, then House.
  out.sort((a, b) => {
    const rank = (r: Rep) => /president/i.test(r.office) ? 0
                          : /vice/i.test(r.office) ? 1
                          : /senator/i.test(r.office) ? 2 : 3;
    return rank(a) - rank(b);
  });
  return out;
}

async function whiteHouse(diag: Record<string, string>): Promise<Rep[]> {
  const html = await safeText('https://www.whitehouse.gov/administration/');
  if (!html) { diag.whiteHouse = 'fetch failed'; return [
    { level: 'federal', office: 'President', name: '', url: 'https://www.whitehouse.gov/administration/' },
    { level: 'federal', office: 'Vice President', name: '', url: 'https://www.whitehouse.gov/administration/' },
  ]; }
  // Headings on whitehouse.gov/administration: "President <Name>",
  // "Vice President <Name>", etc. Use a loose pattern.
  const presM = html.match(/President\s+([A-Z][\w.'\- ]{2,40})(?:<|,|\.)/);
  const vpM = html.match(/Vice\s+President\s+([A-Z][\w.'\- ]{2,40})(?:<|,|\.)/);
  return [
    { level: 'federal', office: 'President', name: presM?.[1]?.trim() ?? '', url: 'https://www.whitehouse.gov/administration/' },
    { level: 'federal', office: 'Vice President', name: vpM?.[1]?.trim() ?? '', url: 'https://www.whitehouse.gov/administration/' },
  ];
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
interface OsGeoResp { results?: OsPerson[] }

async function stateLegislature(diag: Record<string, string>): Promise<Rep[]> {
  if (!OPENSTATES_KEY) { diag.stateLeg = 'OPENSTATES_API_KEY missing'; return []; }
  const url = `https://v3.openstates.org/people.geo?lat=${MARTINEZ_LAT}&lng=${MARTINEZ_LNG}`;
  const j = await safeJson<OsGeoResp>(url, { headers: { 'X-API-Key': OPENSTATES_KEY } });
  const people = (j?.results ?? []).filter((p) => /California/i.test(p.jurisdiction?.name ?? ''));
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
const STATE_OFFICES: StateOfficeCfg[] = [
  { office: 'Governor',
    url: 'https://www.gov.ca.gov/',
    nameRe: /Governor\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
  { office: 'Lieutenant Governor',
    url: 'https://ltg.ca.gov/',
    nameRe: /Lieutenant\s+Governor\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
  { office: 'Attorney General',
    url: 'https://oag.ca.gov/',
    nameRe: /Attorney\s+General\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
  { office: 'Secretary of State',
    url: 'https://www.sos.ca.gov/',
    nameRe: /Secretary\s+of\s+State\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
  { office: 'State Controller',
    url: 'https://www.sco.ca.gov/',
    nameRe: /Controller\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
  { office: 'State Treasurer',
    url: 'https://www.treasurer.ca.gov/',
    nameRe: /Treasurer\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
  { office: 'Supt. of Public Instruction',
    url: 'https://www.cde.ca.gov/',
    nameRe: /Superintendent[^A-Z]{0,30}([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
  { office: 'Insurance Commissioner',
    url: 'https://www.insurance.ca.gov/',
    nameRe: /Insurance\s+Commissioner\s+([A-Z][\w.'\- ]{2,40})(?:\b|<|,|\.)/ },
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
  // Try a few known URL slugs — CCC has reorganized the site twice.
  const candidates = [
    'https://www.contracosta.ca.gov/Board-of-Supervisors',
    'https://www.contracosta.ca.gov/4818/Board-of-Supervisors',
    'https://www.contracosta.ca.gov/3179/Board-of-Supervisors',
    'https://www.contracosta.ca.gov/418/Board-of-Supervisors',
  ];
  let html: string | null = null;
  let usedUrl = candidates[0];
  for (const u of candidates) {
    const h = await safeText(u);
    if (h && /district\s*[1-5]/i.test(h)) { html = h; usedUrl = u; break; }
  }
  if (!html) { diag.county = 'no BOS page resolved'; return [
    { level: 'county', office: 'Supervisor, District 5 (Martinez)', name: '',
      url: 'https://www.contracosta.ca.gov/' },
  ]; }
  // Each supervisor block looks roughly like:
  //   <h3>District N</h3> <... >Name</...>
  // CivicPlus markup varies; extract via a loose regex over plaintext.
  const text = decodeEntities(stripTags(html));
  const reps: Rep[] = [];
  for (let dist = 1; dist <= 5; dist++) {
    // Pull the substring between "District N" and the next "District" or end.
    const start = text.search(new RegExp(`District\\s+${dist}\\b`, 'i'));
    if (start < 0) continue;
    const after = text.slice(start, start + 400);
    // First name-like token after the district label.
    const m = after.match(/District\s+\d\s+(Supervisor\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
    if (m) {
      reps.push({
        level: 'county',
        office: dist === 5 ? 'Supervisor, District 5 (Martinez)' : `Supervisor, District ${dist}`,
        name: m[2].trim(),
        district: `BOS Dist ${dist}`,
        url: usedUrl,
      });
    }
  }
  if (!reps.length) {
    diag.county = 'page fetched but no supervisors parsed';
    return [{ level: 'county', office: 'Supervisor, District 5 (Martinez)', name: '', url: usedUrl }];
  }
  return reps;
}

// =====================================================================
// CITY — Martinez Mayor + Council
// =====================================================================

async function cityReps(diag: Record<string, string>): Promise<Rep[]> {
  const candidates = [
    'https://www.cityofmartinez.org/government/mayor-city-council',
    'https://www.cityofmartinez.org/government/mayor-and-city-council',
    'https://www.cityofmartinez.org/government',
  ];
  let html: string | null = null;
  let usedUrl = candidates[0];
  for (const u of candidates) {
    const h = await safeText(u);
    if (h && /city\s*council/i.test(h)) { html = h; usedUrl = u; break; }
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
