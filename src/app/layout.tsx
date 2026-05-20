import type { Metadata } from 'next';
import Script from 'next/script';
import { Source_Code_Pro, Inter } from 'next/font/google';
import { getLocation } from '@/lib/location';
import './globals.css';

const GA_ID = 'G-VR227N4QG6';
const mono = Source_Code_Pro({ subsets: ['latin'], weight: ['200', '400', '600', '800'], variable: '--font-mono' });
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const loc = getLocation();
  const siteUrl = (process.env.SITE_URL?.trim() || 'https://mtz.city').replace(/\/$/, '');
  const title = `${loc.siteName} — ${loc.name} weather, news & events`;
  const description =
    `Hyperlocal dashboard for ${loc.name}: live weather and air quality, local news, ` +
    `community & music events, adoptable pets, parks and places, and civic alerts — all on one page.`;
  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: `%s — ${loc.siteName}` },
    description,
    applicationName: loc.siteName,
    keywords: [
      loc.short, loc.name, `${loc.short} weather`, `${loc.short} news`,
      `${loc.short} events`, `${loc.short} things to do`, `${loc.short} CA`,
      'Contra Costa County', 'hyperlocal', 'community calendar', 'adoptable pets',
    ],
    category: 'news',
    alternates: { canonical: '/' },
    robots: {
      index: true, follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    openGraph: { type: 'website', siteName: loc.siteName, url: siteUrl, title, description, locale: 'en_US' },
    twitter: { card: 'summary', title, description },
  };
}

// Root layout: HTML shell, fonts, analytics. The main site's chrome
// (weather/forecast/gov strips + footer) lives in (main)/layout.tsx so
// alt routes like /gov can render bare.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
        {children}
      </body>
    </html>
  );
}
