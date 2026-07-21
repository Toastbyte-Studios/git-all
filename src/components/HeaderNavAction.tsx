'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function HeaderNavAction({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();

  let href: string | null = null;
  let label: string | null = null;
  let screenReaderSuffix = '';

  if (pathname === '/' && authenticated) {
    href = '/whoami';
    label = 'whoami';
    screenReaderSuffix = ' Open your profile';
  } else if (pathname === '/whoami' || pathname.startsWith('/u/')) {
    href = '/';
    label = 'cd ~';
    screenReaderSuffix = ' Go to homepage';
  }

  return (
    <div
      data-testid="header-nav-action-slot"
      className="flex w-20 shrink-0 justify-end"
    >
      {href && label ? (
        <Link
          href={href}
          className="whoami-btn inline-flex h-8 w-full items-center justify-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors"
        >
          <span className="font-mono-data">
            <span aria-hidden="true" style={{ opacity: 0.6 }}>
              ${' '}
            </span>
            {label}
          </span>
          <span className="sr-only">{screenReaderSuffix}</span>
        </Link>
      ) : (
        <span aria-hidden="true" className="h-8 w-full" />
      )}
    </div>
  );
}
