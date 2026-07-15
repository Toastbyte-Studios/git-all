import Link from 'next/link';
import { GitAllLogo } from '@/components/GitAllLogo';
import { HeaderAvatars } from '@/components/HeaderAvatars';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Site header — brand logo on the left (links home), theme toggle and
 * connected-account avatar stack on the right. Mounted once in the root
 * layout so it appears on every page.
 */
export function Header() {
  return (
    <header
      className="sticky top-0 z-[60] border-b shadow-sm"
      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/"
          aria-label="GitAll home"
          className="inline-flex items-center rounded-md transition-opacity hover:opacity-80"
        >
          <GitAllLogo />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <HeaderAvatars />
        </div>
      </div>
    </header>
  );
}
