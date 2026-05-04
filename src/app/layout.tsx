import type { Metadata } from 'next';
import { Source_Code_Pro, Inter } from 'next/font/google';
import { getLocation } from '@/lib/location';
import Header from '@/components/Header';
import './globals.css';

const mono = Source_Code_Pro({ subsets: ['latin'], weight: ['200', '400', '600', '800'], variable: '--font-mono' });
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

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
        <Header />
        <main>{children}</main>
        <footer className="site-ftr">
          {loc.siteName} · {loc.name} · data refreshed via <a href="/admin">/admin</a>
        </footer>
      </body>
    </html>
  );
}
