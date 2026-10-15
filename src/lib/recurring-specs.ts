// Recurring open mics, jams and house nights around the Bay Area, taken from
// a community open-mic / jam list. These venues have no scrapeable calendar
// (most post on Facebook or not at all), so each is generated from its
// weekday rule. Review the list periodically — venues change nights.
//
//   dow   0 = Sunday … 6 = Saturday (an array means several days a week)
//   nth   which occurrence in the month (1–5); omit for every week
//   start / end   Pacific time [hour, minute]
//   local true → shows on the Local events tab, otherwise Regional

export interface RecurringSpec {
  key: string;
  title: string;
  venue: string;
  city: string;
  address?: string;
  dow: number[];
  nth?: number[];
  start: [number, number];
  end?: [number, number];
  desc: string;
  local?: boolean;
}

export const RECURRING_SPECS: RecurringSpec[] = [
  // ---- Sunday -------------------------------------------------------------
  { key: 'iam-swing', title: 'Western Swing Dance Lesson & Jam', venue: 'IAM Western Swing Society', city: 'Rancho Cordova',
    dow: [0], nth: [1], start: [12, 0], end: [16, 0],
    desc: 'Dance lesson at noon, then a jam in the back room until 4 PM.' },
  { key: 'moose-sunnyvale', title: 'Jam with the TCB Band', venue: 'Sunnyvale Moose Lodge', city: 'Sunnyvale', address: '922 Weddell Ct, Sunnyvale',
    dow: [0], nth: [2, 4], start: [14, 0], end: [18, 0],
    desc: 'Country, line and ballroom dancing; a second song if time permits. No outside refreshments; food and drinks reasonably priced.' },

  // ---- Monday -------------------------------------------------------------
  { key: 'vinnies-mon', title: 'Open Mic Jam with the Band', venue: "Vinnie's", city: 'Concord',
    dow: [1], start: [21, 0], end: [0, 30], desc: 'Hosted by Vince Lay & Joey Nunez.' },
  { key: 'macs-blue-monday', title: 'Blue Mondays — Piano Bar Blues Jam', venue: "Mac's 19 Broadway", city: 'Fairfax', address: '19 Broadway Blvd, Fairfax',
    dow: [1], start: [16, 30], desc: 'Piano bar blues jam with Mitch Woods.' },
  { key: 'macs-open-mic', title: "Derek Smith's Open Mic", venue: "Mac's 19 Broadway", city: 'Fairfax', address: '19 Broadway Blvd, Fairfax',
    dow: [1], start: [21, 30], desc: 'Open mic hosted by Derek Smith.' },
  { key: 'hayward-bistro-mon', title: 'Open Mic', venue: 'Hayward Bistro', city: 'Hayward',
    dow: [1], start: [19, 0], end: [21, 0], desc: 'Open mic night.' },
  { key: 'woodhams-mon', title: 'Jam Night', venue: 'Woodhams Lounge', city: 'Santa Clara',
    dow: [1], start: [20, 0], end: [23, 0], desc: 'Jam hosted by Jimmy Tone.' },
  { key: 'fuego-mon', title: 'Monday Jam', venue: 'Fuego', city: 'Sunnyvale',
    dow: [1], start: [20, 0], end: [23, 0], desc: 'Nicole Beard with Dennis Dove, Johnny Cats, Soubrand & Keith Milne.' },

  // ---- Tuesday ------------------------------------------------------------
  { key: 'starry-plough-tue', title: 'Open Mic Night', venue: 'Starry Plough', city: 'Berkeley', address: '3101 Shattuck Ave, Berkeley',
    dow: [2], start: [19, 30], desc: 'Sign up by 8 PM. One song or 5 minutes; order is by lottery.' },
  { key: 'rellik-tue', title: 'Open Mic', venue: 'Rellik', city: 'Benicia', local: true,
    dow: [2], start: [19, 30], desc: 'Runs until the last musician. Sign-ups at 7:30; 3 songs or 10 minutes. Hosted by Glenn Lowe.' },
  { key: 'hydro-grill-tue', title: 'Open Mic', venue: 'Hydro Grill', city: 'Calistoga',
    dow: [2], start: [18, 0], end: [21, 0], desc: 'Hosted by Randy Foisy.' },
  { key: 'the-note-tue', title: 'Jam Session', venue: 'The Note', city: 'Milpitas',
    dow: [2], start: [19, 0], end: [23, 0], desc: 'Weekly jam session.' },
  { key: 'catos-tue', title: 'Brewgrass Jam', venue: "Cato's Ale House", city: 'Oakland',
    dow: [2], start: [18, 30], desc: 'Bluegrass jam over beer.' },
  { key: 'antlers-tue', title: 'Blues Jam', venue: 'Antlers', city: 'Pinole',
    dow: [2], start: [19, 30], desc: 'Weekly blues jam.' },
  { key: 'hopmonk-sebastopol-tue', title: 'Open Mic', venue: 'HopMonk Sebastopol', city: 'Sebastopol',
    dow: [2], nth: [1], start: [18, 30], end: [21, 0], desc: '2 songs or 10 minutes. Sign-up is by email only through HopMonk; the list is full by 3:45.' },

  // ---- Wednesday ----------------------------------------------------------
  { key: 'lucca-songbird', title: 'Songbird Sessions — Singer-Songwriter Showcase', venue: 'Lucca Bar & Grill', city: 'Benicia', local: true,
    dow: [3], nth: [3], start: [18, 30], desc: 'Hosted by Ken Maffeo & Remi Moulder.' },
  { key: 'florence-bar-wed', title: 'Dave Moreno Jam', venue: 'Florence Bar', city: 'Fremont',
    dow: [3], start: [19, 0], desc: 'Weekly jam hosted by Dave Moreno.' },
  { key: 'hopmonk-novato-wed', title: 'Open Mic', venue: 'HopMonk Novato', city: 'Novato',
    dow: [3], start: [18, 0], desc: 'Sign-up at 6 PM with Dennis Haneda. 2 songs or 8 minutes; house drum set and keyboard.' },
  { key: 'cjs-wed', title: 'Jam Night & Live Band Karaoke', venue: "CJ's", city: 'Pleasant Hill',
    dow: [3], start: [20, 0], end: [23, 0], desc: 'With Brooks Lundy & friends.' },
  { key: 'club-fox-wed', title: 'Blues Jam', venue: 'Club Fox', city: 'Redwood City',
    dow: [3], start: [19, 0], end: [23, 0], desc: 'Weekly blues jam.' },
  { key: 'big-rock-wed', title: 'Open Mic', venue: 'Big Rock Deli', city: 'San Rafael',
    dow: [3], start: [17, 0], end: [20, 0], desc: 'Weekly open mic.' },
  { key: 'hopmonk-sonoma-wed', title: 'Open Mic', venue: 'HopMonk Tavern (Sonoma)', city: 'Sonoma',
    dow: [3], start: [20, 0], desc: 'Free open mic on the tavern stage, hosted by Matt.' },
  { key: 'townhouse-wed', title: 'Open Mic', venue: 'Town House', city: 'Vallejo', address: '401 Georgia St, Vallejo',
    dow: [3], start: [20, 0], end: [23, 0], desc: 'Hosted by Rich Adams.' },
  { key: 'larkey-park', title: 'Park Jam', venue: 'Larkey Park (near the pool)', city: 'Walnut Creek',
    dow: [3, 5], start: [11, 30], end: [13, 0], desc: 'Daytime jam near the pool.' },

  // ---- Thursday -----------------------------------------------------------
  { key: 'bruehol-thu', title: 'Irish Jam', venue: 'Bruehol', city: 'Benicia', address: '4828 East 2nd St, Benicia', local: true,
    dow: [4], nth: [2, 4], start: [16, 0], end: [19, 30], desc: 'Traditional Irish session.' },
  { key: 'norms-thu', title: 'Live Band Karaoke', venue: "Norm's Place", city: 'Danville',
    dow: [4], start: [20, 0], end: [23, 0], desc: "Brooks Lundy's live band karaoke." },
  { key: 'woods-vineyards', title: 'Sip and Sing — Piano Bar / Open Mic', venue: 'Woods Family Vineyards', city: 'Livermore',
    dow: [4], nth: [4], start: [15, 0], end: [18, 0], desc: 'Piano bar and open mic at the winery.' },
  { key: 'napa-elks-thu', title: 'Open Mic', venue: 'Napa Elks Lodge', city: 'Napa',
    dow: [4], start: [18, 30], end: [22, 0], desc: 'Sign-ups at 6 PM; 3 songs or 15 minutes. Sometimes preempted by sports.' },
  { key: 'club-fox-dead-jam', title: 'Grateful Dead Jam', venue: 'Club Fox', city: 'Redwood City',
    dow: [4], nth: [1, 3], start: [20, 0], desc: 'Hosted by Alex Jordan.' },
];
