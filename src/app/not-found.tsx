import Link from 'next/link';
import type { Metadata } from 'next';

// Root not-found boundary. Renders for any URL that matches no route, and for
// any `notFound()` call in a segment without a closer not-found.tsx of its own.
// `/u/[handle]` has its own (see src/app/u/[handle]/not-found.tsx) and keeps
// precedence there — that one is deliberately worded to be indistinguishable
// between a missing profile and a private one, so do not merge the two.
//
// Header and Footer are mounted by the root layout, so this file owns only
// <main>.
export const metadata: Metadata = {
  title: 'Page not found — GitAll',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="max-w-6xl mx-auto px-4 pt-16 pb-12 text-center">
      <p
        className="font-mono-data text-sm mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        404
      </p>
      <h1
        className="text-4xl font-bold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Page not found
      </h1>
      <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
        That URL doesn&apos;t exist on GitAll. It may have moved, or the link
        may have been mistyped.
      </p>
      <Link
        href="/"
        className="whoami-btn inline-block px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
      >
        Go to GitAll
      </Link>
    </main>
  );
}
