// Bundled EBRPD park-map PDFs — served same-origin from /public/img/
// so they can be embedded directly in <iframe> tags. Centralized here
// because both the (legacy) Parks popup and the consolidated Places
// popup link to these files.

export interface ParkMap {
  slug: string;
  label: string;
  file: string;
  note: string;
}

export const EBRPD_MAPS: ParkMap[] = [
  // District-wide EBRPD references
  { slug: 'district',     label: 'EBRPD — District Map',         file: '/img/eastbayparksdistrictmap.pdf',
    note: 'Overview map of all East Bay Regional Park District parks (21 pages).' },
  { slug: 'parksbycity',  label: 'EBRPD — Parks by City',        file: '/img/eastbayparksdistrictparksbycity.pdf',
    note: 'Per-city listing of every EBRPD park, with addresses and amenities (90 pages).' },
  { slug: 'wardmap',      label: 'EBRPD — Ward Map',             file: '/img/eastbayparkswardmap.pdf',
    note: 'EBRPD board-of-directors ward boundaries and member assignments (109 pages).' },
  { slug: 'ebrpd-carquinez-2019', label: 'EBRPD — Benicia/Martinez Bridge to Carquinez Strait (2019)',
    file: '/img/parks/eastbay-benicia-martinez-carquinez-2019.pdf',
    note: 'Regional parks reference covering the Benicia–Martinez Bridge to Carquinez Strait area (2019 edition).' },
  // Briones Regional Park
  { slug: 'briones-brochure', label: 'Briones — Park Brochure',  file: '/img/parks/briones-map-brochure.pdf',
    note: 'Official EBRPD brochure for Briones Regional Park.' },
  { slug: 'briones-trailmap', label: 'Briones — Trail Map',      file: '/img/parks/briones-trail-map.pdf',
    note: 'Full trail map for Briones Regional Park.' },
  { slug: 'briones-hike',     label: 'Briones — Hike Notes',     file: '/img/parks/briones-hike.pdf',
    note: 'Hike description / notes for Briones.' },
  // Carquinez Strait + Martinez Shoreline
  { slug: 'carquinez-loop',   label: 'Carquinez Strait — Scenic Loop Trail Map',
    file: '/img/parks/carquinez-strait-scenic-loop-trail-map.pdf',
    note: 'Scenic Loop trail map for Carquinez Strait Regional Shoreline.' },
  { slug: 'mtz-shoreline-hike', label: 'Martinez Shoreline — Hike Notes',
    file: '/img/parks/martinez-shoreline-hike.pdf',
    note: 'Hike description / notes for the Martinez Shoreline.' },
];

// External park-related resources — open in a new tab, not embedded.
export interface ParkExtLink { label: string; url: string }
export const PARK_EXT_LINKS: ParkExtLink[] = [
  { label: 'Interactive parks map (ArcGIS Experience)',
    url: 'https://experience.arcgis.com/experience/f48944466b004c26bd0e9524ae3f3323' },
];
