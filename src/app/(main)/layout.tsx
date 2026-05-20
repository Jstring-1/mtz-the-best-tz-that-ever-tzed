import { getLocation } from '@/lib/location';
import WeatherStrip from '@/components/WeatherStrip';
import HourlyStrip from '@/components/HourlyStrip';
import ForecastStrip from '@/components/ForecastStrip';
import GovStrip from '@/components/GovStrip';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Main-site layout: the three fixed top strips, a padded <main>, and
// the small footer. Used for every page except /gov (which lives at
// the root and renders without this chrome).
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const loc = getLocation();
  return (
    <>
      <WeatherStrip />
      <section className="wx-row-2" aria-label="Hourly and 7-day forecast">
        <HourlyStrip />
        <span className="wx-sep" aria-hidden />
        <ForecastStrip />
      </section>
      <GovStrip />
      <main>{children}</main>
      <footer className="site-ftr">
        {loc.siteName} · {loc.name}
      </footer>
    </>
  );
}
