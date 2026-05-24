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
};

// Look up a bio by full-name. Strips honorifics, lowercases the last
// word, and matches against the REP_BIOS keys. Returns null if no match.
export function findBio(fullName: string): RepBio | null {
  const cleaned = fullName.replace(/\b(Mayor|Vice|Councilmember|Council\s+Member|Hon\.|Dr\.|Mr\.|Mrs\.|Ms\.)\b/gi, '').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  return REP_BIOS[last] ?? null;
}
