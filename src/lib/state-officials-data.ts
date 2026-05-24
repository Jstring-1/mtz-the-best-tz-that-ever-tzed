// Static registry of California state-level officeholders surfaced in
// the Reps popup. The earlier Ballotpedia scrape kept failing — easier
// to hand-maintain a list that changes only when someone is sworn in.
//
// Two groups:
//   - constitutional: the 10 statewide elected offices
//   - cabinet: governor's appointed cabinet members
//
// Both render in the Reps popup's "California — Statewide officers"
// section. Edit/update entries as appointments change.

import type { Rep } from './reps';

interface StateOfficial {
  office: string;
  name: string;
  party?: string;            // 'D' | 'R' | 'NP' | 'I'
  dateAssumed?: string;
  url?: string;              // canonical office homepage
  photoFile?: string;        // basename in /public/img/, e.g. "newsom.jpg"
  group: 'constitutional' | 'cabinet';
}

const OFFICIALS: StateOfficial[] = [
  // --- Constitutional officers (elected, statewide) ---
  { office: 'Governor',                       name: 'Gavin Newsom',      party: 'D', dateAssumed: 'January 7, 2019',
    url: 'https://www.gov.ca.gov/', photoFile: 'newsom.jpg', group: 'constitutional' },
  { office: 'Lieutenant Governor',            name: 'Eleni Kounalakis',  party: 'D', dateAssumed: '2019',
    url: 'https://ltg.ca.gov/', group: 'constitutional' },
  { office: 'Attorney General',               name: 'Rob Bonta',         party: 'D', dateAssumed: 'April 23, 2021',
    url: 'https://oag.ca.gov/', group: 'constitutional' },
  { office: 'Secretary of State',             name: 'Shirley Weber',     party: 'D', dateAssumed: 'January 29, 2021',
    url: 'https://www.sos.ca.gov/', group: 'constitutional' },
  { office: 'Controller',                     name: 'Malia Cohen',       party: 'D', dateAssumed: 'January 2, 2023',
    url: 'https://www.sco.ca.gov/', group: 'constitutional' },
  { office: 'Treasurer',                      name: 'Fiona Ma',          party: 'D', dateAssumed: 'January 7, 2019',
    url: 'https://www.treasurer.ca.gov/', group: 'constitutional' },
  { office: 'Insurance Commissioner',         name: 'Ricardo Lara',      party: 'D', dateAssumed: 'January 7, 2019',
    url: 'https://www.insurance.ca.gov/', group: 'constitutional' },
  { office: 'Supt. of Public Instruction',    name: 'Tony Thurmond',     party: 'NP', dateAssumed: 'January 1, 2019',
    url: 'https://www.cde.ca.gov/', group: 'constitutional' },
  { office: 'State Auditor',                  name: 'Grant Parks',       party: 'NP', dateAssumed: 'January 16, 2023',
    url: 'https://www.auditor.ca.gov/', group: 'constitutional' },
  { office: 'Sec. for Natural Resources',     name: 'Wade Crowfoot',     party: 'NP', dateAssumed: '2019',
    url: 'https://resources.ca.gov/', photoFile: 'Secretary-Wade-Crowfoot.png', group: 'constitutional' },

  // --- Governor's cabinet (appointed) ---
  { office: 'Sec., Business, Consumer Svcs & Housing Agency',
    name: 'Tomiquia Moss',
    url: 'https://www.bcsh.ca.gov/', photoFile: 't.moss-cabinet.png', group: 'cabinet' },
  { office: 'Sec., Corrections and Rehabilitation',
    name: 'Jeffrey Macomber',
    url: 'https://www.cdcr.ca.gov/', photoFile: 'Secretart-Jeffrey-Macomber.png', group: 'cabinet' },
  { office: 'Exec. Director, State Board of Education',
    name: 'Brooks Allen',
    url: 'https://www.cde.ca.gov/be/', photoFile: 'Executive-Director-Brooks-Allen.jpeg', group: 'cabinet' },
  { office: 'Sec., Environmental Protection Agency',
    name: 'Yana Garcia',
    url: 'https://calepa.ca.gov/', photoFile: 'Secretary-Yana-Garcia.png', group: 'cabinet' },
  { office: 'Director, Department of Finance',
    name: 'Joe Stephenshaw',
    url: 'https://dof.ca.gov/', photoFile: 'Director-Joe-Stephenshaw.png', group: 'cabinet' },
  { office: 'Sec., Food and Agriculture',
    name: 'Karen Ross',
    url: 'https://www.cdfa.ca.gov/', photoFile: 'Secretary-Karen-Ross.png', group: 'cabinet' },
  { office: 'Sec., Government Operations Agency',
    name: 'Nick Maduros',
    url: 'https://www.govops.ca.gov/',
    photoFile: 'Nick-Maduros-6653_Edited_Cropped_2018_Final-scaled-1.jpg', group: 'cabinet' },
  { office: 'Director, GO-Biz (Business & Economic Development)',
    name: 'Dee Dee Myers',
    url: 'https://business.ca.gov/', photoFile: 'Director-Dee-Dee-Myers.png', group: 'cabinet' },
  { office: 'Director, Office of Emergency Services',
    name: 'Nancy Ward',
    url: 'https://www.caloes.ca.gov/', photoFile: 'Director-Nancy-Ward.png', group: 'cabinet' },
  { office: 'Director, Office of Planning and Research',
    name: 'Samuel Assefa',
    url: 'https://opr.ca.gov/', photoFile: 'Director-Samuel-Assefa.png', group: 'cabinet' },
  { office: 'Sec., Office of Tribal Affairs',
    name: 'Christina Snider-Ashtari',
    url: 'https://tribalaffairs.ca.gov/', photoFile: 'Secretary-Christina-Snider-Ashtari.png', group: 'cabinet' },
  { office: 'Sec., Health and Human Services Agency',
    name: 'Kim Johnson',
    url: 'https://www.chhs.ca.gov/', photoFile: 'OFFICIAL_K.Johnson-Web.jpg', group: 'cabinet' },
  { office: 'Sec., Labor and Workforce Development Agency',
    name: 'Stewart Knox',
    url: 'https://www.labor.ca.gov/', photoFile: 'Secretary-Stewart-Knox.png', group: 'cabinet' },
  { office: 'Adjutant General, Military Department',
    name: 'Matthew Beevers',
    url: 'https://www.calguard.ca.gov/', photoFile: 'Adjutant-General-Matthew-Beevers.png', group: 'cabinet' },
  { office: 'Sec., Natural Resources Agency',
    name: 'Wade Crowfoot',
    url: 'https://resources.ca.gov/', photoFile: 'Secretary-Wade-Crowfoot.png', group: 'cabinet' },
  { office: 'Sec., State Transportation Agency',
    name: 'Toks Omishakin',
    url: 'https://calsta.ca.gov/', photoFile: 'Secretary-Toks-Omishakin.png', group: 'cabinet' },
  { office: 'Sec., Department of Veterans Affairs',
    name: 'Lindsey Sin',
    url: 'https://www.calvet.ca.gov/', photoFile: 'Secretary-Lindsey-Sin.png', group: 'cabinet' },
  { office: 'Chief Service Officer, California Volunteers',
    name: 'Josh Fryday',
    url: 'https://www.californiavolunteers.ca.gov/', photoFile: 'Chief-Service-Officer-Josh-Fryday.png', group: 'cabinet' },
];

// Export as Rep[] in the shape statewideOfficers() returns. Used to
// fully replace the Ballotpedia scrape. The dateAssumed gets surfaced
// as electedDate so the bio modal renders "Assumed office <date>".
export function staticStateOfficials(): Rep[] {
  return OFFICIALS.map((o) => ({
    level: 'state' as const,
    office: o.office,
    name: o.name,
    party: o.party,
    url: o.url,
    photoUrl: o.photoFile ? `/img/${o.photoFile}` : undefined,
    electedDate: o.dateAssumed,
    bioKey: o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  }));
}
