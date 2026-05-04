'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/weather', label: 'Weather' },
  { href: '/events',  label: 'Events'  },
  { href: '/news',    label: 'News'    },
  { href: '/places',  label: 'Places'  },
  { href: '/info',    label: 'Info'    },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="site-nav">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={path === n.href || path.startsWith(`${n.href}/`) ? 'active' : ''}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
