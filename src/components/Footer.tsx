import Link from 'next/link';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

/**
 * Site-wide footer, rendered from the root layout so every route carries the
 * privacy link — including `/u/[handle]`, which publishes a person's name and
 * avatar and therefore has the strongest claim to one.
 *
 * Fully static: no session read, no client hooks. That matters because
 * `/u/[handle]` is edge-cached (see `headers()` in next.config.ts), and a
 * footer that varied per viewer would undermine that.
 */
export function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-4 mt-auto pt-16 pb-8 text-center">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        <Link
          href="/privacy"
          className="hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Privacy
        </Link>
        {' · '}
        Built by{' '}
        <a
          href="https://toastbyte.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Toastbyte Studios
        </a>
      </p>
      {APP_VERSION && (
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          v{APP_VERSION}
        </p>
      )}
    </footer>
  );
}
