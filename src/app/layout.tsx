import type { Metadata } from 'next';
import { Source_Code_Pro, Inter } from 'next/font/google';
import { getLocation } from '@/lib/location';
import WeatherStrip from '@/components/WeatherStrip';
import HourlyStrip from '@/components/HourlyStrip';
import ForecastStrip from '@/components/ForecastStrip';
import './globals.css';

const mono = Source_Code_Pro({ subsets: ['latin'], weight: ['200', '400', '600', '800'], variable: '--font-mono' });
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

// Layout reads live cache for the top weather strip on every render.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const loc = getLocation();
  return {
    title: `${loc.siteName} — ${loc.name}`,
    description: `Hyperlocal weather, news, events, places, and civic info for ${loc.name}.`,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const loc = getLocation();
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body>
        <WeatherStrip />
        <section className="wx-row-2" aria-label="Hourly and 7-day forecast">
          <HourlyStrip />
          <span className="wx-sep" aria-hidden />
          <ForecastStrip />
        </section>
        <main>{children}</main>
        <footer className="site-ftr">
          {loc.siteName} · {loc.name}
        </footer>
      </body>
    </html>
  );
}
