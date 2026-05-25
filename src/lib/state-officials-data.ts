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
  bio?: string;              // multi-paragraph biography (separate paragraphs with \n\n)
  group: 'constitutional' | 'cabinet';
}

// Multi-paragraph bios live in this map so the OFFICIALS list below
// stays readable. Keys are lowercased last names (or the name slug used
// by bioKey). Add a paragraph break with \n\n.
const BIOS: Record<string, string> = {
  newsom:
`Gavin Newsom is the 40th Governor of California.

Born in 1967 in San Francisco, Governor Newsom attended Redwood High School and later Santa Clara University. After college, Newsom started a retail wine shop that grew into the PlumpJack Group, which managed restaurants, hotels, and wineries across California.

Newsom's first job in politics was on the San Francisco Parking and Traffic Commission, and later on the San Francisco Board of Supervisors. In 2003, Newsom became the youngest elected Mayor of San Francisco in a century. He brought same-sex marriage to the forefront of the national conversation, directing the city-county clerk to issue marriage licenses to thousands of same-sex couples.

As he did in that historic moment, Governor Newsom has stood up for California's values time and time again. He is committed to serving all Californians, building a government that is more efficient, more effective, and more responsive to the needs of all who call this state home.

Governor Newsom is leading the fight for our fundamental freedoms and protecting California's unique spirit of innovation and entrepreneurship. From gun safety, reproductive rights, education and literacy, and climate action, California has enacted nation-leading policies under Governor Newsom.

Governor Newsom is married to filmmaker Jennifer Siebel Newsom, the First Partner of California. They have four children: Montana, Hunter, Brooklynn, and Dutch.`,

  kounalakis:
`Ambassador Eleni Kounalakis was sworn in as the 50th Lieutenant Governor of California by Governor Gavin Newsom on January 7th, 2019. She is the first woman elected Lt. Governor of California. A native Californian, she visited each of the state's 58 counties during her historic campaign. In addition to her duties as Lt. Governor, Kounalakis is California's Representative for International Affairs and Trade, appointed by Governor Gavin Newsom by executive order.

From 2010 to 2013, Kounalakis served as President Obama's Ambassador to the Republic of Hungary. Her highly acclaimed memoir, "Madam Ambassador, Three Years of Diplomacy, Dinner Parties and Democracy in Budapest" (The New Press, 2015), chronicles the onset of Hungary's democratic backsliding.

Governor Jerry Brown appointed Kounalakis to chair the California Advisory Council for International Trade and Investment in 2014. Prior to her public service, Kounalakis was president of one of California's most respected housing development firms, AKT Development, for 18 years.

Eleni Kounalakis graduated from Dartmouth College in 1989 and earned her MBA from U.C. Berkeley's Haas School of Business in 1992. She is married to Dr. Markos Kounalakis, and the couple has two sons, Neo and Eon.`,

  bonta:
`Rob Bonta is using his role as Attorney General of the State of California to make life better for everyone in the Golden State. Be it tackling crime, addressing the rising cost of living, or holding bad actors accountable when they harm Californians, Attorney General Bonta is committed to serving, protecting, and solving problems for the 39 million people who call California home.

Bonta's passion for justice and service was passed on to him by his parents, who served on the frontlines of some of America's most important social justice movements. Instilling in him the lessons they learned from the United Farm Workers, the civil rights movement, and the People Power Revolution in the Philippines, Bonta's parents lit a fire inside him to stand up for those who are taken advantage of or hurt.

Since becoming California's 34th Attorney General, Bonta has led California DOJ to take on some of the biggest challenges of our time — the lawlessness of the second Trump Administration, attacks on healthcare, deception peddled by Big Oil, and the state's housing crisis. As California's Chief Law Enforcement Officer, crime and public safety are Bonta's top priorities.

Before serving as Attorney General, Bonta spent more than eight years serving in the State Assembly, where he authored nation-leading legislation including the strongest tenant protection law in the nation, ending surprise medical bills, strengthening voting rights, banning for-profit private prisons, and protecting immigrants and workers.

Bonta was sworn in on April 23, 2021, becoming the first person of Filipino descent to serve as California Attorney General. Born in Quezon City, Philippines, Bonta immigrated to California with his family as an infant. He earned his Juris Doctor from Yale Law School. He is married to Mia Bonta, and they are the proud parents of three children, Reina, Iliana, and Andres.`,

  weber:
`Shirley Nash Weber, Ph.D., was nominated to serve as California Secretary of State by Governor Gavin Newsom on December 22, 2020 and sworn into office on January 29, 2021. Voters elected her for a full term on November 8, 2022. Dr. Weber is California's first Black Secretary of State and only the fifth African American to serve as a state constitutional officer in California's 175-year history.

Dr. Weber was born to sharecroppers in Hope, Arkansas during the segregationist Jim Crow era. Her father, who left Arkansas after being threatened by a lynch mob, did not have the opportunity to vote until he was in his 30s. Although her family moved to California when Dr. Weber was three years old, it was her family's experience in the Jim Crow South that has driven her activism and legislative work.

Dr. Weber attended the University of California, Los Angeles (UCLA), where she received her Bachelor's, Master's and Doctorate degrees by the age of 26. Prior to receiving her Doctorate, she became a professor at San Diego State University (SDSU) at the age of 23. She retired from the Department of Africana Studies after 40 years as a faculty member.

Before her appointment, Dr. Weber served four terms as an Assemblymember representing California's 79th Assembly District. From 2018-2020 she served as Chair of the California Legislative Black Caucus.

Secretary Weber is a mother of two adult children and three grandchildren. Her hobbies include reading and traveling.`,

  cohen:
`State Controller Malia M. Cohen was elected in November 2022, following her service on the California State Board of Equalization (BOE). She was elected to the BOE in November 2018 and was Chair in 2019 and 2022. As Controller, she continues to serve the Board as its fifth voting member.

As chief fiscal officer of the world's fifth-largest economy, Controller Cohen's primary responsibility is to account for and protect the state's financial resources. She also independently audits government agencies, safeguards property until claimed by rightful owners, and administers the payroll system for state government and California State University employees. She serves on 70 boards and commissions including CalPERS and CalSTRS, which have a combined portfolio of $750 billion.

Prior to being elected to the BOE, Controller Cohen served as President of the Board of Supervisors of the City and County of San Francisco. As a Supervisor, she chaired the Budget and Finance Committee and served as President of the San Francisco Employees' Retirement System (SFERS).

Controller Cohen was born and raised in San Francisco. She received her bachelor's degree in Political Science from Fisk University and a master's degree in Public Policy and Management from Carnegie Mellon University. She and her husband reside in San Francisco with their daughter.`,

  ma:
`Fiona Ma, CPA is California's 34th State Treasurer. She was first elected on November 6, 2018, with more votes (7,825,587) than any other candidate for treasurer in the state's history and reelected on November 8, 2022. She is the first woman of color and the first woman Certified Public Accountant (CPA) elected to the position.

The State Treasurer's Office provides financing for schools, roads, housing, recycling, hospitals, public facilities, and other infrastructure projects. California is the world's fourth-largest economy and Treasurer Ma is the state's primary banker. Her office processes about $3 trillion in banking transactions a year. She provides transparency and oversight for the government's investment portfolio averaging about $165 billion — a portion of which is beneficially owned by more than 2,300 local governments in California. She serves as agent of sale for all State bonds and is trustee of billions of dollars of state indebtedness.`,

  lara:
`Raised in East Los Angeles by immigrant parents, Commissioner Ricardo Lara made history in 2018 by becoming the first openly gay person elected to statewide office in California's history. Commissioner Lara previously served in the California Legislature, representing Assembly District 50 from 2010 to 2012 and Senate District 33 from 2012 to 2018. Commissioner Lara earned a BA in Journalism and Spanish with a minor in Chicano Studies from San Diego State University.`,

  thurmond:
`Tony Thurmond was sworn in as the twenty-eighth California State Superintendent of Public Instruction on January 7, 2019.

Superintendent Thurmond is an educator, social worker, and public school parent who has served Californians for more than 15 years in elected office. Previously, he served on the Richmond City Council, the West Contra Costa Unified School Board, and in the California State Assembly representing District 15.

Like many of California's public school students, Superintendent Thurmond came from humble beginnings. His mother was an immigrant from Panama who came to San Jose, California, to be a teacher. His father was a soldier who did not return to his family after the Vietnam War. After his mother died when he was six, Thurmond and his brother were raised by a cousin whom they had never met.

Public school education allowed him to attend Temple University, where he became student body president. He went on to earn dual master's degrees in law and social policy and social work (MSW) from Bryn Mawr College.

Much of Superintendent Thurmond's work has focused on improving services for foster youth and directing programs that provide job training to at-risk youth. He has 12 years of direct experience in education, teaching life skills classes, after-school programs, and career training.`,

  parks:
`Our mission is to provide objective evaluations and effective solutions that enhance the transparency, accountability, and performance of California government for the people it serves. We follow the highest standards to provide stakeholders with reliable answers to problems in California government.

State laws mandate our office be independent of the executive branch and legislative control. The California State Auditor is the only entity that has, by statute, full access to all records, accounts, correspondence, property, and other files of any publicly created entity, including state agencies, cities, counties, school districts, and special districts.

The California State Auditor's Office conducts all performance and policy evaluations in accordance with audit standards issued by the U.S. Comptroller General's Government Accountability Office (GAO).`,

  crowfoot:
`Wade Crowfoot serves as California's Natural Resources Secretary, leading efforts to conserve California's environment and natural resources. He has served as Secretary since 2019 and advises Governor Newsom as a member of his cabinet.

Secretary Crowfoot oversees an agency of over 25,000 employees spread across 26 departments, commissions, and conservancies. His agency is charged with stewarding California's forests and natural lands, rivers and water supplies, and coast and ocean.

Secretary Crowfoot is leading efforts to achieve Governor Newsom's commitment to conserve 30 percent of California's land and coastal waters by 2030. He oversees billions of dollars of public investment to protect people and natural places from climate change impacts.

Secretary Crowfoot has been on the frontlines of environmental leadership throughout his career. He served in Governor Jerry Brown's Administration as deputy cabinet secretary, led the non-profit Water Foundation, and spearheaded efforts to establish California's landmark climate change policies as West Coast regional director for the Environmental Defense Fund.

Wade grew up in Michigan and moved to California in the mid-1990s. He loves to camp with his wife and daughter and learn new things in the outdoors.`,

  moss:
`Tomiquia Moss was appointed by Governor Gavin Newsom to serve as the Secretary of the Business, Consumer Services and Housing Agency in November 2023 and was sworn in on February 13, 2024. As Secretary, Tomiquia leads and oversees 12 entities, including 40 boards and bureaus, collectively responsible for the preservation and expansion of safe, affordable housing, efforts to prevent and end homelessness, protect consumers, and safeguard Californians' civil rights.

Tomiquia brings more than 20 years of leadership experience in the nonprofit and public sectors with deep expertise in housing and homelessness, public policy, civil rights, and community development.

In 2019, Tomiquia founded All Home, a Bay Area organization advancing regional solutions to disrupt the cycles that perpetuate homelessness and poverty. Before founding All Home, Tomiquia served as the CEO of Hamilton Families, which offers emergency, transitional, and permanent housing services for families experiencing homelessness in San Francisco.

From 2014 to 2017, she served directly under the mayors of both San Francisco and Oakland, including as Chief of Staff for Oakland Mayor Libby Schaaf.`,

  macomber:
`Jeff Macomber was appointed CDCR Secretary by Governor Gavin Newsom on December 12, 2022. His career at CDCR has spanned nearly three decades, beginning as a Correctional Officer at Ironwood State Prison in 1993. Most recently, he served as Undersecretary of Operations from 2020 to 2022.

Secretary Macomber understands the importance of providing meaningful and diverse rehabilitative opportunities to the people in our care and to fostering a correctional system focused on the wellness and professional development of staff.

Secretary Macomber served in various roles at CDCR Headquarters from 1994 to 2004, then as Correctional Business Manager at Richard A. McGee Correctional Training Center. He was Chief of the Program Support Unit and Transportation Unit from 2004 to 2007, then started at California State Prison-Sacramento (SAC) where he served as Warden from 2013 to 2016.

When not working, Secretary Macomber enjoys tending to his vegetable garden, running, and hiking. He is married, has two children, and two cats.`,
};

const OFFICIALS: StateOfficial[] = [
  // --- Constitutional officers (elected, statewide) ---
  { office: 'Governor',                       name: 'Gavin Newsom',      party: 'D', dateAssumed: 'January 7, 2019',
    url: 'https://www.gov.ca.gov/', photoFile: 'newsom.jpg', group: 'constitutional' },
  { office: 'Lieutenant Governor',            name: 'Eleni Kounalakis',  party: 'D', dateAssumed: '2019',
    url: 'https://ltg.ca.gov/', photoFile: 'eleni-kounalakis.jpg', group: 'constitutional' },
  { office: 'Attorney General',               name: 'Rob Bonta',         party: 'D', dateAssumed: 'April 23, 2021',
    url: 'https://oag.ca.gov/', photoFile: 'ag-bonta-official-2.jpg', group: 'constitutional' },
  { office: 'Secretary of State',             name: 'Shirley Weber',     party: 'D', dateAssumed: 'January 29, 2021',
    url: 'https://www.sos.ca.gov/', photoFile: 'shirley-weber.jpg', group: 'constitutional' },
  { office: 'Controller',                     name: 'Malia Cohen',       party: 'D', dateAssumed: 'January 2, 2023',
    url: 'https://www.sco.ca.gov/', photoFile: 'controller_bio-mc-cohen.jpg', group: 'constitutional' },
  { office: 'Treasurer',                      name: 'Fiona Ma',          party: 'D', dateAssumed: 'January 7, 2019',
    url: 'https://www.treasurer.ca.gov/', photoFile: 'fiona-ma.png', group: 'constitutional' },
  { office: 'Insurance Commissioner',         name: 'Ricardo Lara',      party: 'D', dateAssumed: 'January 7, 2019',
    url: 'https://www.insurance.ca.gov/', photoFile: 'Commissioner-ricardo-lara.jpg', group: 'constitutional' },
  { office: 'Supt. of Public Instruction',    name: 'Tony Thurmond',     party: 'NP', dateAssumed: 'January 1, 2019',
    url: 'https://www.cde.ca.gov/', photoFile: 'tony-thurmond1.jpg', group: 'constitutional' },
  { office: 'State Auditor',                  name: 'Grant Parks',       party: 'NP', dateAssumed: 'January 16, 2023',
    url: 'https://www.auditor.ca.gov/', photoFile: 'Grant-Parks.jpg', group: 'constitutional' },
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

// Look up a bio by last name (lowercased + non-letters stripped).
function bioFor(fullName: string): string | undefined {
  const last = fullName.trim().split(/\s+/).pop() ?? '';
  const key = last.toLowerCase().replace(/[^a-z]/g, '');
  return BIOS[key];
}

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
    bio: o.bio ?? bioFor(o.name),
    bioKey: o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  }));
}
