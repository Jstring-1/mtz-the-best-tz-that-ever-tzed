// Curated bios for elected reps where we have first-party material.
//
// City council bios live here as the primary source — the Wayback-Machine
// scrape of cityofmartinez.org gives us current names + districts but
// stale role assignments (Vice Mayor rotates) and no bio text. When a
// last-name match is found here, this overrides the scraped `office`
// and adds the bio + photo + dates the modal renders.
//
// Photos live in /public/img/<lastname>.jpg (lowercase). Add more
// entries (or higher tiers — supervisors, state, federal) as we go.

export interface RepBio {
  fullName: string;
  office: string;            // current role: "Mayor" / "Vice Mayor" / "Councilmember"
  district?: string;         // "District N" if applicable
  electedDate?: string;
  appointedDate?: string;
  termExpires?: string;
  email?: string;
  phone?: string;            // primary contact phone — shown as Call button
  photoFile?: string;        // basename in /public/img/, e.g. "zorn.jpg"
  bio: string;
}

// Keyed by lowercase last name (matches the photo filename stem). For
// hyphenated / multi-word last names, key on the final word.
export const REP_BIOS: Record<string, RepBio> = {
  zorn: {
    fullName: 'Brianne Zorn',
    office: 'Mayor',
    electedDate: 'November 2022',
    termExpires: 'December 2026',
    photoFile: 'zorn.jpg',
    bio:
      'Brianne was elected to the Martinez City Council as Councilmember for District 3 in November 2020, and as Mayor in November 2022. She grew up in the Seattle area and earned a BS in Botany, a BA in Anthropology, and a minor in Japanese from the University of Washington. She has worked in the non-profit sector and environmental consulting for 16 years. She is a professional wetland scientist, and her work experience includes botanical garden management, permitting and regulatory support, biological compliance monitoring, evaluation of environmental liability, sediment remediation, and wetland delineation and surveys. She is a mother and stepmother of three kids and is proud to call Martinez her home since 2015.',
  },
  howard: {
    fullName: 'Jay Howard',
    office: 'Councilmember',
    district: 'District 1',
    electedDate: 'November 2022',
    termExpires: 'December 2026',
    photoFile: 'howard.jpg',
    bio:
      'Jay was elected Councilmember in November 2022. He is the third generation of his family to be born and raised in the Alhambra Valley. Since 2014, Jay has been the Superintendent for G Swanson Construction. He is very active in the community where he serves as a board member for the Nor Cal Carpenters Regional Council, Union Local 152, Loaves and Fishes, the Historical Society, and serves as a delegate to the Carpenter\'s Regional Council (spanning 46 counties). Jay lives in Martinez with his lovely wife and two children. When he has some downtime, he is an avid hiker and enjoys extreme skiing.',
  },
  young: {
    fullName: 'Greg Young',
    office: 'Councilmember',
    district: 'District 2',
    electedDate: 'November 2024',
    termExpires: 'December 2028',
    photoFile: 'young.jpg',
    bio:
      'Greg and his family are proud to call Martinez their home since 2001. He is a graduate of the University of California at Berkeley where he earned his BA in Mass Communications. He also holds a Masters in Counseling Psychology from the University of San Francisco, and an Executive MBA from St. Mary\'s College in Moraga, CA. Greg currently serves as Senior Deputy Commissioner for the California Department of Financial Protection & Innovation where he has regulatory oversight for all state chartered financial institutions which include banks, credit unions, mortgage and escrow companies, payday lenders, and money transmitters.\n\nHe brings over 30 years experience working cross-organizationally within large public and private organizations with expertise banking, economic development, board governance, and non-profit management. Greg has served on several boards in his local community including Juvenile Hall Auxiliary, Boys and Girls Club of Contra Costa County, and DVC and Los Medanos Foundation Boards. He has also served on the Martinez Arts Commission, Martinez and Contra Costa County Library Commission, and Martinez Planning Commission.',
  },
  malhi: {
    fullName: 'Satinder S. Malhi',
    office: 'Vice Mayor',
    district: 'District 3',
    appointedDate: 'January 2023',
    electedDate: 'November 2024',
    termExpires: 'December 2028',
    photoFile: 'malhi.jpg',
    bio:
      'Satinder and his family have lived in Martinez for more than four decades where he attended both Martinez Junior High and Alhambra High School. He received his Bachelor\'s Degree in Politics/Legal Studies from the UC Santa Cruz and a Master\'s Degree in Public Administration from CSU East Bay. He is also a seasoned government and community relations professional with nearly twenty years of experience in the public sector, having served as an advisor to two University Presidents and four state legislators. He is the first Sikh-American and Asian-Pacific Islander member to serve on the Martinez City Council.',
  },
  mckillop: {
    fullName: 'Debbie McKillop',
    office: 'Councilmember',
    district: 'District 4',
    electedDate: 'November 2014',
    termExpires: 'December 2026',
    photoFile: 'mckillop.jpg',
    bio:
      'Debbie was elected to the Martinez City Council in 2014 and served as Vice Mayor in 2017, 2021, and 2024. A fifth-generation Martinez resident and graduate of Alhambra High School, Debbie is proud to serve the community she has long called home. She is a working professional, mother of twin daughters, and previously served as a 4-H community leader. Debbie brings more than 40 years of experience in forensic science. She serves as the Sheriff\'s Chief of Forensic Services, overseeing a nationally accredited crime laboratory that provides countywide forensic services to 24 law enforcement agencies and more than one million county residents.\n\nHer academic credentials include an Executive Master of Public Administration from Golden Gate University in San Francisco, bachelor\'s degrees in chemistry and environmental studies from the University of California, Santa Barbara, and a Certificate in Forensic Science Laboratory Management from the University of California, Davis. Outside of her professional and public service roles, Debbie enjoys hiking, playing bocce, and attending movies and live theater with her family.',
  },

  // CA State Senator — SD-9 (covers Martinez).
  grayson: {
    fullName: 'Tim Grayson',
    office: 'State Senator',
    district: 'SD-9',
    bio:
`Tim Grayson was previously elected to serve in the California Assembly in November 2016 and to represent the 15th Assembly District, which encompassed portions of Contra Costa County. He is the son of a Teamster father and his mother was a public transit worker. He is the first in his family to earn a college degree. In 2010, Grayson was elected to serve on the Concord City Council, winning reelection in 2014 and serving on the Council until his election to the Assembly. He also served as Concord's Mayor from 2014-2015.

As a co-founder of the Contra Costa Family Justice Center, Grayson has a long and proven history of advocating for victims of domestic violence, human trafficking, and child and elder abuse. Since his election to the Assembly, Grayson has secured $20 million in state funding for Family Justice Centers throughout California.

Championing the beliefs that higher education should be both accessible and affordable, then-Assemblymember Grayson authored laws to ensure that qualified California students are not denied admission at UC institutions in favor of less qualified out-of-state students (AB 1674) and to require greater transparency in UC cost reporting (AB 1655). Grayson also introduced legislation to bring $7 billion in funding for new higher education campus construction.

To help protect the state against boom and bust economic cycles, Grayson was at the forefront of creating a new budget reserve. He fought to create the Budget Deficit Savings Account and helped secure an initial deposit of $1.75 billion.

Grayson continues to serve as the Concord Police Department's Critical Response Chaplain, a position he has held since 2007. He also has maintained a license as a general building contractor since 1997.

A long-time East Bay resident, Tim lives in Concord where he raised his two kids with his wife of more than 35 years, Tammy.`,
  },

  // CA Assembly Member — AD-15 (covers Martinez). Last-name key drops
  // accents (findBio's [^a-z] filter), so "Ávila Farías" → "farias".
  farias: {
    fullName: 'Anamarie Ávila Farías',
    office: 'Assembly Member',
    district: 'AD-15',
    bio:
`Anamarie Ávila Farías proudly represents California's 15th Assembly District, which includes parts of Contra Costa County and the East Bay. A lifelong public servant and advocate for working families, Ávila Farías brings decades of experience in affordable housing, economic development, and educational equity to her role in the State Assembly.

As the granddaughter of Mexican immigrants who came to the United States through the Bracero Program, Ávila Farías's personal story reflects the resilience and contributions of immigrant communities. Raised by a single mother after her father's passing, she overcame significant socioeconomic challenges, inspiring her lifelong commitment to addressing poverty and inequities.

Ávila Farías's leadership spans local, county, and state levels. She made history in 2012 as the first Latina elected to the Martinez City Council and later served on the Contra Costa County Board of Education. Her accomplishments include launching affordable housing programs, championing accessory dwelling units (ADUs) for multi-generational housing, and creating green housing developments. She also spearheaded workforce initiatives, such as pre-apprenticeship programs for at-risk and incarcerated youth.

Appointed by both Governor Brown and Governor Newsom to the California Housing Finance Agency Board, Ávila Farías has been a leading voice for housing equity, creating programs like the Building Black Wealth campaign to increase Black homeownership and an ADU grant program to expand housing opportunities.

A proud third-generation Contra Costa County resident, Ávila Farías earned her bachelor's and master's degrees from the University of San Francisco, becoming one of the first in her family to earn an advanced degree. She lives in Martinez with her husband, an architect, and their two children.`,
  },

  // Contra Costa County — District 5 Supervisor.
  'scales-preston': {
    fullName: 'Shanelle Scales-Preston',
    office: 'Supervisor',
    district: 'District 5 (Martinez)',
    photoFile: 'preston.png',
    phone: '925-608-4200',
    email: 'bos5@bos.cccounty.us',
    bio:
      'District 5 Supervisor on the Contra Costa County Board of Supervisors, representing Martinez and surrounding communities.\n\n' +
      'Pittsburg Office\n' +
      '190 E 4th Street, Pittsburg, CA 94565\n' +
      'Phone: 925-608-4200  ·  Fax: 925-608-4209\n\n' +
      'Martinez Office\n' +
      '1025 Escobar Street, Martinez, CA 94553\n' +
      'Phone: 925-608-4200  ·  Fax: 925-608-4209',
  },
};

// Look up a bio by full-name. Strips honorifics, then tries the last
// word (lowercased + non-letter-stripped) AND the hyphenated-last-name
// variant — e.g., "Shanelle Scales-Preston" tries "preston" first
// (last word after final space) then "scales-preston" (hyphen kept).
export function findBio(fullName: string): RepBio | null {
  const cleaned = fullName
    .replace(/\b(Mayor|Vice|Councilmember|Council\s+Member|Supervisor|Hon\.|Dr\.|Mr\.|Mrs\.|Ms\.)\b/gi, '')
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const lastRaw = tokens[tokens.length - 1];
  const candidates = [
    lastRaw.toLowerCase().replace(/[^a-z-]/g, ''),       // 'scales-preston'
    lastRaw.toLowerCase().replace(/[^a-z]/g, ''),        // 'scalespreston'
    lastRaw.toLowerCase().split('-').pop()!.replace(/[^a-z]/g, ''), // 'preston'
  ];
  for (const k of candidates) {
    if (REP_BIOS[k]) return REP_BIOS[k];
  }
  return null;
}

import type { Rep, RepLevel } from './reps';

// Convert a RepBio + its slug into a Rep object the RepBioModal can
// render. Used by CouncilDetail's top-strip (where we don't have the
// cron-cached Rep list available — we render directly from REP_BIOS).
export function bioToRep(slug: string, bio: RepBio, level: RepLevel = 'city', urlOverride?: string): Rep {
  return {
    level,
    name: bio.fullName,
    office: bio.office + (bio.district ? `, ${bio.district}` : ''),
    district: bio.district,
    photoUrl: bio.photoFile ? `/img/${bio.photoFile}` : undefined,
    email: bio.email,
    phone: bio.phone,
    url: urlOverride ?? 'https://www.cityofmartinez.org/government/mayor-and-city-council',
    bio: bio.bio,
    electedDate: bio.electedDate,
    appointedDate: bio.appointedDate,
    termExpires: bio.termExpires,
    bioKey: slug,
  };
}

// All council members in display order: Mayor first, then districts 1-4.
// Used by the council popup's top-strip.
export function councilOrdered(): Array<{ slug: string; bio: RepBio }> {
  const order = ['zorn', 'howard', 'young', 'malhi', 'mckillop'];
  return order
    .map((slug) => REP_BIOS[slug] ? { slug, bio: REP_BIOS[slug] } : null)
    .filter((x): x is { slug: string; bio: RepBio } => x !== null);
}
