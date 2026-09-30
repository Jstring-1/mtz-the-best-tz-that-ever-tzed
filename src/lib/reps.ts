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

// Sentinel: last date the hand-maintained registries in
// state-officials-data.ts and reps-bios.ts were touched. Bump this
// whenever you edit either file. Live-sourced reps overwrite it with
// their own fetch timestamp; static-fallback reps carry it through so
// the modal can show "verified <date>" honestly.
export const STATIC_VERIFIED_AT = '2026-05-25';

// Today, as an ISO date (YYYY-MM-DD). Live-sourced reps stamp this
// so the modal shows a fresh "verified" line each cron run.
const nowIsoDate = () => new Date().toISOString().slice(0, 10);

// Wikipedia article titles for California's constitutional offices.
// Approach: one batched MediaWiki `action=query` request pulls all
// eight wikitexts, then we regex `|incumbent = [[Name]]` out of each
// infobox. Beats Wikidata for this use case — WD's P1308 claims for CA
// offices are riddled with stale (no-end-date) statements from decades
// ago, while the Wikipedia infoboxes are kept current by editors.
// Office strings intentionally mirror the static registry
// (state-officials-data.ts) so the canon()-based merge in
// statewideOfficers() dedupes cleanly rather than emitting parallel rows.
const CA_STATEWIDE_WP: Array<{ title: string; office: string; url: string }> = [
  { title: 'Governor of California',                                 office: 'Governor',                     url: 'https://www.gov.ca.gov/' },
  { title: 'Lieutenant Governor of California',                      office: 'Lieutenant Governor',          url: 'https://ltg.ca.gov/' },
  { title: 'California Attorney General',                            office: 'Attorney General',             url: 'https://oag.ca.gov/' },
  { title: 'Secretary of State of California',                       office: 'Secretary of State',           url: 'https://www.sos.ca.gov/' },
  { title: 'California State Controller',                            office: 'Controller',                   url: 'https://www.sco.ca.gov/' },
  { title: 'California State Treasurer',                             office: 'Treasurer',                    url: 'https://www.treasurer.ca.gov/' },
  { title: 'California Insurance Commissioner',                      office: 'Insurance Commissioner',       url: 'https://www.insurance.ca.gov/' },
  { title: 'California State Superintendent of Public Instruction',  office: 'Supt. of Public Instruction',  url: 'https://www.cde.ca.gov/' },
];

const GOV_CABINET_URL = 'https://www.gov.ca.gov/about/cabinet/';

// Cloudflare browser-check headers. gov.ca.gov 403s a bare curl UA;
// this profile gets 200 → 301 → /about/cabinet/.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

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
  // Long-form bio + dates, populated from src/lib/reps-bios.ts when a
  // last-name match exists. The modal shows these in a nested popup.
  bio?: string;
  electedDate?: string;
  appointedDate?: string;
  termExpires?: string;
  bioKey?: string;           // lowercase last-name slug (e.g. 'zorn')
  // ISO date of when this specific rep was last confirmed against a
  // live upstream (Wikidata, Congress.gov, OpenStates, gov.ca.gov).
  // For hand-maintained static entries this holds the STATIC_VERIFIED_AT
  // sentinel date — the last time someone edited the registry file.
  verifiedAt?: string;
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
  // /v3/member?stateCode=CA was IGNORED upstream (returned ~100 senators
  // from every state). The correct endpoint shape uses the state code
  // as a PATH segment: /v3/member/CA. As an extra belt-and-suspenders
  // we also filter in code to m.state === 'California'.
  const listUrl =
    `https://api.congress.gov/v3/member/CA?api_key=${CONGRESS_KEY}&format=json&currentMember=True&limit=100`;
  const list = await safeJson<CongressMembersResp>(listUrl);
  const allMembers = list?.members ?? [];
  diag.federalRaw = `${allMembers.length} returned from /v3/member/CA`;
  // Defensive state filter: drop anything that isn't actually California.
  const members = allMembers.filter((m) => /^california$/i.test(m.state ?? ''));
  diag.federalCa = `${members.length} after California-state filter`;
  if (members.length === 0) { diag.federal = 'no CA members after filter'; return []; }

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
  diag.federalFiltered = `${targets.length} after chamber+district filter (want CA-${US_HOUSE_DISTRICT} + 2 sens)`;

  const enriched = await Promise.all(targets.map(async (m): Promise<Rep | null> => {
    if (!m.bioguideId) return null;
    const det = await safeJson<CongressMemberDetailResp>(
      `https://api.congress.gov/v3/member/${m.bioguideId}?api_key=${CONGRESS_KEY}&format=json`,
    );
    const mem = det?.member;
    const party = mem?.partyHistory?.[mem.partyHistory.length - 1]?.partyAbbreviation
              ?? mem?.partyHistory?.[0]?.partyAbbreviation
              ?? (m.partyName?.[0] ?? '');
    // Use the CURRENT chamber (last term), not "any historical term".
    const terms = m.terms?.item ?? [];
    const lastChamber = (terms[terms.length - 1]?.chamber ?? '').toLowerCase();
    const isSenateNow = lastChamber.includes('senate');
    const office = isSenateNow ? 'U.S. Senator' : 'U.S. Representative';
    // Display the actual state — every senator was showing as 'CA'
    // because this was hardcoded. Now reads m.state from the API.
    const stateAbbr = (mem?.state ?? m.state ?? 'CA').slice(0, 2).toUpperCase();
    const district = isSenateNow ? stateAbbr : `${stateAbbr}-${String(m.district ?? '?').padStart(2, '0')}`;
    return {
      level: 'federal',
      office,
      name: mem?.directOrderName ?? m.name ?? '',
      party,
      district,
      url: mem?.officialWebsiteUrl ?? `https://www.congress.gov/member/${m.bioguideId}`,
      phone: mem?.addressInformation?.phoneNumber,
      photoUrl: mem?.depiction?.imageUrl ?? m.depiction?.imageUrl,
      verifiedAt: nowIsoDate(),
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
  const { findBio } = await import('./reps-bios');
  return people.map<Rep>((p): Rep => {
    const cls = p.current_role?.org_classification;
    const district = p.current_role?.district ?? '';
    const officeTag = cls === 'lower' ? 'Assembly Member' : cls === 'upper' ? 'State Senator' : (p.current_role?.title ?? 'State Legislator');
    const districtTag = cls === 'lower' ? `AD-${district}` : cls === 'upper' ? `SD-${district}` : district;
    const officialLink = p.links?.find((l) => /official|home/i.test(l.note ?? ''))?.url
      ?? p.links?.[0]?.url
      ?? `https://openstates.org/person/${p.id}`;
    const base: Rep = {
      level: 'state-leg',
      office: officeTag,
      name: p.name ?? '',
      party: p.party?.[0],
      district: districtTag,
      url: officialLink,
      email: p.email,
      phone: p.offices?.[0]?.voice,
      photoUrl: p.image,
      verifiedAt: nowIsoDate(),
    };
    // Enrich with hand-curated bio if there's a last-name match in the
    // REP_BIOS registry (handles accents — findBio strips them).
    const bio = base.name ? findBio(base.name) : null;
    if (bio) {
      return {
        ...base,
        bio: bio.bio,
        electedDate: bio.electedDate ?? base.electedDate,
        photoUrl: bio.photoFile ? `/img/${bio.photoFile}` : base.photoUrl,
        bioKey: base.name.toLowerCase().split(/\s+/).pop()?.replace(/[^a-z]/g, '') ?? base.name.toLowerCase().replace(/[^a-z]/g, ''),
      };
    }
    return base;
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

// Ballotpedia's Contra Costa County page is still used as a fallback
// in countyReps() (Board of Supervisors section).
const BALLOTPEDIA_CCC_URL = 'https://ballotpedia.org/Contra_Costa_County,_California';

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
}
function stripTags(s: string): string { return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '); }

// Batched MediaWiki fetch for the CA_STATEWIDE_WP offices. Returns one
// Rep per Wikipedia article whose infobox has an `|incumbent = [[Name]]`
// line. Falls back to [] on any network/parse failure — statewideOfficers()
// merges what it got with the static registry.
interface WpPage {
  title?: string;
  revisions?: Array<{ slots?: { main?: { content?: string } } }>;
}
interface WpBatchResp { query?: { pages?: WpPage[] } }

// Strip Wikipedia markup fragments from an infobox value.
function stripWikitext(s: string): string {
  return (s || '')
    .replace(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g, '$1')  // [[Name]] or [[Slug|Display]]
    .replace(/'{2,}/g, '')                                // '' or '''
    .replace(/<ref[\s\S]*?<\/ref>/g, '')                  // <ref>…</ref>
    .replace(/\{\{[^}]*?\}\}/g, '')                       // {{template}}
    .replace(/<[^>]+>/g, '')                              // stray HTML
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull a top-level infobox field `| name = value` where value runs
// until the next line that begins with `|` or `}`. Returns '' if not
// present. Case-insensitive on field name.
function infoboxField(wikitext: string, name: string): string {
  const re = new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n]*?)(?=\\n\\||\\n})`, 'i');
  const m = wikitext.match(re);
  return m?.[1]?.trim() ?? '';
}

async function wikipediaStatewide(diag: Record<string, string>): Promise<Rep[]> {
  const titles = CA_STATEWIDE_WP.map((o) => o.title).join('|');
  const url = 'https://en.wikipedia.org/w/api.php?'
    + `action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&redirects=1`
    + `&titles=${encodeURIComponent(titles)}`;
  const j = await safeJson<WpBatchResp>(url, {
    headers: { 'User-Agent': 'mtz.city/1.0 (kylejester@gmail.com; reps refresh)' },
  }, 8000);
  const pages = j?.query?.pages ?? [];
  diag.wikipediaPages = `${pages.length}/${CA_STATEWIDE_WP.length} pages returned`;

  const today = nowIsoDate();
  const out: Rep[] = [];
  for (const p of pages) {
    const wt = p.revisions?.[0]?.slots?.main?.content ?? '';
    if (!wt || !p.title) continue;
    const name = stripWikitext(infoboxField(wt, 'incumbent'));
    if (!name) continue;
    // Match by (case-insensitive) title, allowing MediaWiki's redirect
    // resolution to have rewritten our request.
    const cfg = CA_STATEWIDE_WP.find(
      (o) => o.title.toLowerCase() === p.title!.toLowerCase(),
    );
    if (!cfg) continue;
    out.push({
      level: 'state',
      office: cfg.office,
      name,
      url: cfg.url,
      bioKey: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      verifiedAt: today,
    });
  }
  return out;
}

// Parse gov.ca.gov's cabinet card grid. Each cabinet member is a
// <li class="arrow-leaving-blue"> containing an <h2><a>Agency Name</a></h2>
// and a <p class="title">Title Firstname Lastname</p>, plus a headshot
// <img>. Returns one Rep per parsed card; empty list on any failure.
async function scrapeCabinetLive(diag: Record<string, string>): Promise<Rep[]> {
  const html = await safeText(GOV_CABINET_URL, { headers: BROWSER_HEADERS }, 8000);
  if (!html) { diag.cabinetLive = 'gov.ca.gov cabinet fetch failed'; return []; }
  const cardRe = /<li class="arrow-leaving-blue">([\s\S]*?)<\/li>/g;
  const today = nowIsoDate();
  const out: Rep[] = [];
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const card = m[1];
    const hrefM = card.match(/<h2[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const titleM = card.match(/<p class="title">([\s\S]*?)<\/p>/i);
    if (!hrefM || !titleM) continue;
    const agency = decodeEntities(stripTags(hrefM[2])).trim();
    const rawTitle = decodeEntities(stripTags(titleM[1])).trim();
    // "Secretary Rohit Chopra" → role="Secretary", name="Rohit Chopra".
    // Multi-word titles first so "Executive Director" matches before
    // "Director". Case-sensitive on the title so a lowercase suffix
    // never eats a capitalized first name.
    const tm = rawTitle.match(/^(Executive Director|Chief Service Officer|Adjutant General|Chairperson|Chair|Commissioner|Director|Secretary)\s+(.+)$/);
    const role = tm ? tm[1] : '';
    const name = (tm ? tm[2] : rawTitle).trim();
    if (!name) continue;
    // Trim leading "California " so the office string reads like the
    // static registry ("Sec., Department of Corrections", not
    // "Secretary California Department of Corrections and Rehabilitation").
    const agencyShort = agency.replace(/^California\s+/i, '');
    const office = role ? `${role}, ${agencyShort}` : agencyShort;
    const imgM = card.match(/<img[^>]+src="([^"]+)"/i);
    // Relative image srcs (/wp-content/...) need absolutizing before
    // mtz.city serves them.
    const imgRel = imgM?.[1] ?? '';
    const photoUrl = imgRel.startsWith('/') ? `https://www.gov.ca.gov${imgRel}` : (imgRel || undefined);
    out.push({
      level: 'state',
      office,
      name,
      url: hrefM[1],
      photoUrl,
      bioKey: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      verifiedAt: today,
    });
  }
  diag.cabinetLive = `${out.length} cabinet cards parsed from gov.ca.gov`;
  return out;
}

async function statewideOfficers(diag: Record<string, string>): Promise<Rep[]> {
  // Three-layer merge, freshest wins:
  //   1. Wikipedia infobox extract for 8 constitutional offices — the
  //      MediaWiki API returns all wikitexts in one batched request and
  //      the `|incumbent = [[Name]]` line is kept current by editors.
  //   2. gov.ca.gov/about/cabinet scrape for the ~18 cabinet secretaries.
  //   3. Hand-maintained registry in src/lib/state-officials-data.ts as
  //      the fallback backbone for anything the live sources missed
  //      (e.g. State Auditor, State Board of Equalization members).
  //
  // Merger dedupes by canonical office string. Live entries win on
  // name/party/url; static entries win on photoUrl + bio (curated
  // assets that the live sources don't publish).
  const { staticStateOfficials } = await import('./state-officials-data');
  // Stamp the registry-sentinel here (avoids circular import).
  const staticList: Rep[] = staticStateOfficials().map((r) => ({ ...r, verifiedAt: STATIC_VERIFIED_AT }));
  const [wp, cabinet] = await Promise.all([
    wikipediaStatewide(diag).catch((e) => { diag.wikipediaErr = String(e); return []; }),
    scrapeCabinetLive(diag).catch((e) => { diag.cabinetErr = String(e); return []; }),
  ]);

  const canon = (office: string) =>
    office.toLowerCase()
      .replace(/\bsecretary\b/g, 'sec')
      .replace(/\bdepartment\b/g, 'dept')
      .replace(/\bagency\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const byKey = new Map<string, Rep>();
  for (const r of staticList) byKey.set(canon(r.office), r);
  for (const r of [...wp, ...cabinet]) {
    const key = canon(r.office);
    const prior = byKey.get(key);
    // Merge: live values dominate, but keep static photo/bio when the
    // live scrape didn't publish one and the name matches (last-name).
    const sameName = prior && prior.name && r.name
      && prior.name.split(/\s+/).pop()?.toLowerCase() === r.name.split(/\s+/).pop()?.toLowerCase();
    byKey.set(key, sameName ? {
      ...prior,
      ...r,
      photoUrl: r.photoUrl ?? prior.photoUrl,
      bio:      r.bio      ?? prior.bio,
      party:    r.party    ?? prior.party,
    } : r);
  }
  const merged = [...byKey.values()];
  const liveCount = merged.filter((r) => r.verifiedAt === nowIsoDate()).length;
  diag.statewideRows = `${merged.length} total (${liveCount} live, ${merged.length - liveCount} from static registry)`;
  return merged;
}

// =====================================================================
// COUNTY — Contra Costa BOS
// =====================================================================
//
// Martinez sits in District 5. The county BOS page lists all five
// supervisors with name + district. The site uses the CivicPlus CMS;
// the index page is at /Board-of-Supervisors (path slug may vary).

// Pull a Title-Case person name from the FIRST internal-wiki anchor
// `<a href="/Page_Name" ...>Anchor Text</a>` that appears within a
// window of HTML after a label match. Ballotpedia (and Wikipedia)
// link every officeholder to their own page, so anchor text is a
// reliable name source. Skips obvious non-name pages.
function extractPersonAfterLabel(html: string, labelRe: RegExp, windowSize = 2000): string {
  const m = labelRe.exec(html);
  if (!m) return '';
  const start = m.index;
  const slice = html.slice(start, start + windowSize);
  // Internal-wiki anchors: href="/Some_Name" (not absolute, no colon
  // for namespaces like Category: / File:).
  const anchorRe = /<a\s[^>]*href=["']\/([A-Z][A-Za-z0-9._-]*(?:_[A-Z][A-Za-z0-9._-]*){1,4})["'][^>]*>([^<]+)<\/a>/g;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = anchorRe.exec(slice)) !== null) {
    const slug = aMatch[1];
    const txt = decodeEntities(aMatch[2]).trim();
    // Reject obvious non-names: places, parties, generic pages.
    if (/^(California|United_States|Republican|Democratic|City_Council|Mayor|Board_of_Supervisors|Contra_Costa|District_\d|Council|Government|Elected|Ballotpedia)/i.test(slug)) continue;
    if (/^(Click here|See also|Read more|External links?|Elections?|November|January)/i.test(txt)) continue;
    // Must look like a person name: 2-4 capitalized words.
    if (!/^[A-Z][a-z]+(?:\s+[A-Z][A-Za-z'\-.]+){1,3}$/.test(txt)) continue;
    return txt;
  }
  return '';
}

async function countyReps(diag: Record<string, string>): Promise<Rep[]> {
  // Static-first: Scales-Preston (D5) lives in REP_BIOS keyed
  // 'scales-preston'. If she's there, return her directly — no scrape
  // needed, no risk of a flaky upstream blanking out the section.
  const d5Url = 'https://www.contracosta.ca.gov/781/';
  const { REP_BIOS, bioToRep } = await import('./reps-bios');
  const staticD5 = REP_BIOS['scales-preston'];
  if (staticD5) {
    diag.countySource = 'static (scales-preston from REP_BIOS)';
    return [{ ...bioToRep('scales-preston', staticD5, 'county', d5Url), verifiedAt: STATIC_VERIFIED_AT }];
  }

  // Fallback (only if REP_BIOS lacks an entry) — scrape the .gov page.
  const [d5Html, ballotHtml] = await Promise.all([
    safeText(d5Url),
    safeText(BALLOTPEDIA_CCC_URL),
  ]);

  let name = '';
  let usedUrl = d5Url;

  if (d5Html) {
    // Extract from <h1>...</h1> first, then <title>...</title> as fallback.
    const h1 = d5Html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const titleTag = d5Html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const cand = [h1?.[1], titleTag?.[1]].filter(Boolean) as string[];
    for (const c of cand) {
      const text = decodeEntities(stripTags(c));
      const m = text.match(/Supervisor\s+([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){1,3})/);
      if (m) { name = m[1].trim(); diag.countySource = 'contracosta.ca.gov/781'; break; }
    }
  }

  // Ballotpedia fallback — find "Board of Supervisors" section, locate
  // the District 5 row, take the first person-link.
  if (!name && ballotHtml) {
    const sectionStart = ballotHtml.search(/<h2[^>]*>\s*(?:<span[^>]*>)?\s*Board\s+of\s+Supervisors/i);
    const sectionEnd = sectionStart >= 0 ? ballotHtml.indexOf('<h2', sectionStart + 10) : -1;
    const section = sectionStart >= 0
      ? ballotHtml.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : sectionStart + 8000)
      : ballotHtml;
    name = extractPersonAfterLabel(
      section,
      new RegExp(`District\\s+${COUNTY_BOS_DISTRICT}\\b`, 'i'),
    );
    if (name) { usedUrl = BALLOTPEDIA_CCC_URL; diag.countySource = 'ballotpedia'; }
  }

  if (!name) diag.county = 'contracosta.ca.gov/781 + Ballotpedia both failed';
  const base: Rep = {
    level: 'county',
    office: `Supervisor, District ${COUNTY_BOS_DISTRICT} (Martinez)`,
    name,
    district: `BOS Dist ${COUNTY_BOS_DISTRICT}`,
    url: usedUrl,
    // Only stamp fresh when a live source actually resolved a name;
    // an empty-name fallback row is a "we couldn't reach anyone" state.
    verifiedAt: name ? nowIsoDate() : undefined,
  };
  // Enrich from REP_BIOS if there's a match (same pattern as cityReps).
  if (name) {
    const { findBio } = await import('./reps-bios');
    const bio = findBio(name);
    if (bio) {
      const slug = bio.photoFile?.replace(/\.[^.]+$/, '')
        ?? bio.fullName.split(/\s+/).pop()!.toLowerCase().replace(/[^a-z-]/g, '');
      diag.countyBio = `enriched from registry (${slug})`;
      return [{
        ...base,
        name: bio.fullName,
        office: bio.office + (bio.district ? `, ${bio.district}` : ''),
        photoUrl: bio.photoFile ? `/img/${bio.photoFile}` : base.photoUrl,
        email: bio.email,
        phone: bio.phone ?? base.phone,
        bio: bio.bio,
        electedDate: bio.electedDate,
        appointedDate: bio.appointedDate,
        termExpires: bio.termExpires,
        bioKey: slug,
      }];
    }
  }
  return [base];
}

// =====================================================================
// CITY — Martinez Mayor + Council
// =====================================================================

// Pull a Title-Case 2-4-word name from a window of plain text after a
// label. Stricter than the anchor variant — for sites that don't use
// wiki anchors. Skips dates / generic phrases.
function extractNameNearLabelText(text: string, labelRe: RegExp, windowSize = 300): string {
  const m = labelRe.exec(text);
  if (!m) return '';
  const start = m.index + m[0].length;
  const slice = text.slice(start, start + windowSize);
  // Find Title-Case name patterns. Skip month names, common-word starts.
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][A-Za-z'\-.]+){1,3})\b/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(slice)) !== null) {
    const n = hit[1].trim();
    // Reject obvious non-names: months, generic words.
    if (/^(January|February|March|April|May|June|July|August|September|October|November|December|Elected|Appointed|Term|Office|District|Mayor|Council|Member|City|County|California|Contra|Costa|Read|Click|Last|First|Next|Previous|Vice|Pro Tem|Government|Phone|Email)\b/i.test(n)) continue;
    return n;
  }
  return '';
}

// cityofmartinez.org is hard-blocked by an Akamai WAF (UA spoofing
// isn't enough — they fingerprint TLS/headers). Instead we fetch the
// most recent Wayback Machine snapshot, which is never blocked.
//
// Wayback flow:
//   1. archive.org/wayback/available?url=X&timestamp=YYYYMMDD
//      → returns the closest snapshot URL.
//   2. web.archive.org/web/<ts>id_/<original-url>
//      → returns the snapshot HTML WITHOUT Wayback's viewer chrome.
//
// Council page HTML (verified):
//   <h2>Brianne Zorn, Mayor</h2>
//   <h2>Jay Howard, Vice Mayor<img ...></h2>
//   <strong>District 1<br></strong>   ← district label following each h2
const COUNCIL_PAGE_URL =
  'https://www.cityofmartinez.org/government/mayor-and-city-council';

interface WaybackAvailableResp {
  archived_snapshots?: { closest?: { url?: string; timestamp?: string; available?: boolean } };
}

async function fetchViaWayback(originalUrl: string, diag: Record<string, string>, key: string): Promise<{ html: string; ts: string } | null> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const lookupUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(originalUrl)}&timestamp=${today}`;
  const meta = await safeJson<WaybackAvailableResp>(lookupUrl);
  const closest = meta?.archived_snapshots?.closest;
  if (!closest?.available || !closest.timestamp) {
    diag[key] = 'no wayback snapshot available';
    return null;
  }
  // Use `id_` to fetch the raw page without Wayback's framing.
  const snapUrl = `https://web.archive.org/web/${closest.timestamp}id_/${originalUrl}`;
  const html = await safeText(snapUrl);
  if (!html) { diag[key] = `wayback snapshot fetch failed (ts=${closest.timestamp})`; return null; }
  return { html, ts: closest.timestamp };
}

async function cityReps(diag: Record<string, string>): Promise<Rep[]> {
  // Static-first: the council roster is hand-maintained in reps-bios.ts
  // (Mayor + 4 council members). That registry is the source of truth
  // for names, offices, photos, bios, contact info — no scraping. When
  // a seat changes, edit reps-bios.ts and bump REP_BIOS.
  const { councilOrdered, bioToRep } = await import('./reps-bios');
  const ordered = councilOrdered();
  if (ordered.length > 0) {
    diag.citySource = `static (${ordered.length} from REP_BIOS)`;
    return ordered.map(({ slug, bio }) => ({
      ...bioToRep(slug, bio, 'city', COUNCIL_PAGE_URL),
      verifiedAt: STATIC_VERIFIED_AT,
    }));
  }

  // Fallback path retained only in case REP_BIOS is empty — we'd never
  // hit this in practice. Below is the old Wayback scrape.
  const wb = await fetchViaWayback(COUNCIL_PAGE_URL, diag, 'cityWayback');
  if (!wb) {
    return [{ level: 'city', office: 'Mayor + Council', name: '', url: COUNCIL_PAGE_URL }];
  }
  diag.citySource = `wayback ${wb.ts}`;

  const html = wb.html;
  const reps: Rep[] = [];

  // Pull every <h2>...</h2> block, strip inner tags / &nbsp;, then parse
  // "Name, Office" using the comma as the natural separator. The trailing
  // <img> inside the h2 is stripped by stripTags.
  const h2Re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/g;
  const blocks: Array<{ name: string; office: string; idx: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = h2Re.exec(html)) !== null) {
    const text = decodeEntities(stripTags(m[1])).replace(/ /g, ' ').trim().replace(/,?\s*$/, '');
    const parsed = text.match(/^([A-Z][A-Za-z.\-' ]+?),\s*(Mayor|Vice Mayor|Councilmember|Council Member)\b/);
    if (!parsed) continue;
    blocks.push({ name: parsed[1].trim(), office: parsed[2].trim(), idx: m.index });
  }
  diag.cityBlocks = `${blocks.length} h2 blocks parsed`;

  // For each member, look ahead in the HTML for "District N" within ~1500
  // chars to attach a district number. The Mayor is at-large (no district).
  for (const b of blocks) {
    let district = '';
    const after = html.slice(b.idx, b.idx + 1500);
    const dm = after.match(/District\s+(\d)/i);
    if (dm) district = dm[1];

    const today = nowIsoDate();
    if (b.office === 'Mayor') {
      reps.push({ level: 'city', office: 'Mayor', name: b.name, url: COUNCIL_PAGE_URL, verifiedAt: today });
      continue;
    }
    if (b.office === 'Vice Mayor') {
      reps.push({
        level: 'city',
        office: district ? `Vice Mayor (District ${district})` : 'Vice Mayor',
        name: b.name,
        district: district ? `District ${district}` : undefined,
        url: COUNCIL_PAGE_URL,
        verifiedAt: today,
      });
      continue;
    }
    // Councilmember / Council Member
    reps.push({
      level: 'city',
      office: district ? `Council Member, District ${district}` : 'Council Member',
      name: b.name,
      district: district ? `District ${district}` : undefined,
      url: COUNCIL_PAGE_URL,
      verifiedAt: today,
    });
  }

  if (reps.length === 0) {
    diag.city = 'wayback snapshot fetched but no h2 name-office pairs matched';
    return [{ level: 'city', office: 'Mayor + Council', name: '', url: COUNCIL_PAGE_URL }];
  }

  // Enrich with first-party bio data when we have it. Bio is the
  // current source of truth for office/role (Vice Mayor rotates between
  // members, and our Wayback snapshot can be months stale), so let the
  // bio's office field override the scraped value when present.
  const { findBio } = await import('./reps-bios');
  const enriched = reps.map((r): Rep => {
    const bio = findBio(r.name);
    if (!bio) return r;
    const slug = bio.photoFile?.replace(/\.[^.]+$/, '');
    return {
      ...r,
      name: bio.fullName,                                   // canonical capitalization
      office: bio.office + (bio.district ? `, ${bio.district}` : ''),
      district: bio.district ?? r.district,
      photoUrl: bio.photoFile ? `/img/${bio.photoFile}` : r.photoUrl,
      email: bio.email ?? r.email,
      phone: bio.phone ?? r.phone,
      bio: bio.bio,
      electedDate: bio.electedDate,
      appointedDate: bio.appointedDate,
      termExpires: bio.termExpires,
      bioKey: slug,
    };
  });
  diag.cityBios = `${enriched.filter((r) => r.bio).length}/${enriched.length} enriched from registry`;
  return enriched;
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
