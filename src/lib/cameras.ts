// Caltrans traffic cameras shown in the info column. Images are hotlinked
// JPEGs that Caltrans refreshes every ~5 minutes. To add a camera, find its
// TV id in the Caltrans CCTV list (cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json)
// and copy its currentImageURL.

export interface TrafficCam {
  id: string;
  name: string;
  img: string;
}

export const TRAFFIC_CAMS: TrafficCam[] = [
  {
    id: 'TV798',
    name: 'I-680 N at Sewage Plant Rd (Martinez)',
    img: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv798i680atsewageplantrd/tv798i680atsewageplantrd.jpg',
  },
];
