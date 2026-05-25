// Static registry of Martinez parks. Replaces the Wayback-Machine-
// scraping in src/lib/scrape-parks.ts — the live cityofmartinez.org is
// Akamai-blocked and the data here changes maybe yearly, so a
// hand-maintained list is more reliable and zero-cost at cron time.
//
// As we collect more per-park content (description, amenities, images,
// hours), add it to the matching entry — ParksDetail renders whatever
// fields are populated.
//
// lat/lng were hand-geocoded for the ParksDetail map view. They're
// best-effort approximations of each park's centroid; tweak if a pin
// lands on the wrong block.

import type { Park } from './types';

export const MARTINEZ_PARKS: Park[] = [
  { id: 'alhambra-hills-open-space',
    name: 'Alhambra Hills Open Space',
    address: '5850 Alhambra Ave, Martinez, CA 94553',
    lat: 37.97734, lng: -122.10789,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/alhambra-hills-open-space' },

  { id: 'cappy-ricks-park',
    name: 'Cappy Ricks Park',
    address: 'Brown St. & Arreba St., Martinez, CA 94553',
    lat: 38.01360, lng: -122.12696,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/cappy-ricks-park' },

  { id: 'ferry-point-picnic-area',
    name: 'Ferry Point Picnic Area',
    address: 'North Court St., Martinez, CA 94553',
    lat: 38.02511, lng: -122.13892,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/ferry-point-picnic-area' },

  { id: 'foothills-park',
    name: 'Foothills Park',
    address: 'Alhambra Ave. & Chatswood Dr., Martinez, CA 94553',
    lat: 37.96468, lng: -122.09787,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/foothills-park' },

  { id: 'golden-hills-park',
    name: 'Golden Hills Park',
    address: 'Bernice Ln. & Blue Ridge Dr., Martinez, CA 94553',
    lat: 37.96211, lng: -122.10850,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/golden-hills-park' },

  { id: 'hidden-lakes-park',
    name: 'Hidden Lakes Park',
    address: 'Morello Ave. & Chilpancingo Pkwy., Martinez, CA 94553',
    lat: 37.97906, lng: -122.08899,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/hidden-lakes-park' },

  { id: 'hidden-valley-park',
    name: 'Hidden Valley Park',
    address: 'Redwood Dr. & Center Ave., Martinez, CA 94553',
    lat: 37.98245, lng: -122.09144,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/hidden-valley-park' },

  { id: 'highland-avenue-park',
    name: 'Highland Avenue Park',
    address: 'Merrithew Dr., Martinez, CA 94553',
    lat: 38.00750, lng: -122.09450,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/highland-avenue-park' },

  { id: 'holiday-highlands-park',
    name: 'Holiday Highlands Park',
    address: 'Fig Tree Lane, Martinez, CA 94553',
    lat: 37.99517, lng: -122.09580,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/holiday-highlands-park' },

  { id: 'john-muir-park',
    name: 'John Muir Park',
    address: 'Vista Way & Pine St., Martinez, CA 94553',
    lat: 37.99999, lng: -122.12157,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/john-muir-park' },

  { id: 'martinez-dog-park',
    name: 'Martinez Dog Park',
    address: '115 Tarantino Dr., Martinez, CA 94553',
    lat: 38.02443, lng: -122.13587,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/martinez-dog-park' },

  { id: 'morello-park',
    name: 'Morello Park',
    address: '1200 Morello Park Dr., Martinez, CA 94553',
    lat: 38.00062, lng: -122.10057,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/morello-park' },

  { id: 'mountain-view-park',
    name: 'Mountain View Park',
    address: '713 Parkway Dr., Martinez, CA 94553',
    lat: 38.00363, lng: -122.11498,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/mountain-view-park' },

  { id: 'nancy-boyd-park',
    name: 'Nancy Boyd Park',
    address: 'Pleasant Hill Rd. East & Church St., Martinez, CA 94553',
    lat: 37.98672, lng: -122.12228,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/nancy-boyd-park' },

  { id: 'pine-meadow-park',
    name: 'Pine Meadow Park',
    address: 'Pine Meadow Drive, Martinez, CA 94553',
    lat: 37.98692, lng: -122.10170,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/pine-meadow-park' },

  { id: 'plaza-ignacio-park',
    name: 'Plaza Ignacio Park',
    address: 'Alhambra Ave. & Henrietta St., Martinez, CA 94553',
    lat: 38.01354, lng: -122.13477,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/plaza-ignacio-park' },

  { id: 'rankin-park',
    name: 'Rankin Park',
    address: '100 Buckley St., Martinez, CA 94553',
    lat: 38.01622, lng: -122.14214,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/rankin-park' },

  { id: 'susana-street-park',
    name: 'Susana Street Park',
    address: 'Susana St. & Estudillo St., Martinez, CA 94553',
    lat: 38.01442, lng: -122.13354,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/susana-street-park' },

  { id: 'waterfront-park',
    name: 'Waterfront Park',
    address: '245 N. Court St., Martinez, CA 94553',
    lat: 38.02247, lng: -122.13625,
    url: 'https://www.cityofmartinez.org/departments/recreation/parks/waterfront-park' },
];
