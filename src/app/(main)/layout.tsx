import { getLocation } from '@/lib/location';
import WeatherStrip from '@/components/WeatherStrip';
import HourlyStrip from '@/components/HourlyStrip';
import ForecastStrip from '@/components/ForecastStrip';
import CivicStrip from '@/components/CivicStrip';
import FooterLinks from '@/components/FooterLinks';
import { BUILD_STAMP } from '@/lib/build-info';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Main-site layout: three fixed top strips (weather, hourly+forecast,
// civic indicators), a padded <main>, and the small footer. Used for
// every page except /gov (which renders bare without this chrome).
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
      <CivicStrip />
      <main>{children}</main>
      <footer className="site-ftr">
        <span className="ftr-left">{loc.siteName} · {loc.name}</span>
        <span className="ftr-right">
          <span className="ftr-build" title="Build timestamp (Pacific time)">{BUILD_STAMP}</span>
          <span className="ftr-sep" aria-hidden>·</span>
          <FooterLinks />
        </span>
      </footer>
    </>
  );
}
