import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.SITE_URL?.trim() || 'https://mtz.city').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Internal/operational routes — no SEO value, keep them out.
      disallow: ['/admin', '/api/', '/overlay'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
