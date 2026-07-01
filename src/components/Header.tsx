import Link from 'next/link';
import { GitAllLogo } from '@/components/GitAllLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Site header — brand logo on the left (links home) and the theme toggle on
 * the right. Mounted once in the root layout so it appears on every page.
 */
export function Header() {
  return (
    <header
      className="border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/"
          aria-label="GitAll home"
          className="inline-flex items-center rounded-md transition-opacity hover:opacity-80"
        >
          <GitAllLogo />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
