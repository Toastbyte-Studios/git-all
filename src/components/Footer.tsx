import Link from 'next/link';
import { ConsentPreferencesButton } from '@/components/ConsentPreferencesButton';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

/**
 * Site-wide footer, rendered from the root layout so every route carries the
 * privacy link - including `/u/[handle]`, which publishes a person's name and
 * avatar and therefore has the strongest claim to one.
 *
 * Still safe for the edge cache that `/u/[handle]` relies on (see `headers()`
 * in next.config.ts): no session is read and nothing here varies per viewer.
 * `ConsentPreferencesButton` is a client component, but it renders the same
 * markup for everyone and reads no per-visitor state - keep it that way. A
 * footer that varied per viewer would undermine that cache.
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
        <ConsentPreferencesButton />
        {' \u00b7 '}
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
