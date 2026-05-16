import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.SITE_URL?.trim() || 'https://mtz.city').replace(/\/$/, '');

// Public, indexable routes (admin / api / overlay are intentionally
// excluded — see robots.ts).
const ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '/',        changeFrequency: 'hourly', priority: 1.0 },
  { path: '/events',  changeFrequency: 'daily',  priority: 0.8 },
  { path: '/news',    changeFrequency: 'hourly', priority: 0.8 },
  { path: '/places',  changeFrequency: 'weekly', priority: 0.6 },
  { path: '/weather', changeFrequency: 'hourly', priority: 0.7 },
  { path: '/info',    changeFrequency: 'weekly', priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
