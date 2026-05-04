import Link from 'next/link';
import { getLocation } from '@/lib/location';
import Nav from './Nav';

export default function Header() {
  const loc = getLocation();
  return (
    <header className="site-hdr">
      <Link href="/" className="site-logo">{loc.siteName}</Link>
      <Nav />
    </header>
  );
}
