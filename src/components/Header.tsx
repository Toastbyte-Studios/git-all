import Link from 'next/link';
import { GitAllLogo } from '@/components/GitAllLogo';
import { HeaderAvatars } from '@/components/HeaderAvatars';
import { HeaderNavAction } from '@/components/HeaderNavAction';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getAuthSession } from '@/lib/auth-session';

/**
 * Site header — brand logo on the left (links home), theme toggle and
 * connected-account avatar stack on the right. Mounted once in the root
 * layout so it appears on every page.
 */
export async function Header() {
  const session = await getAuthSession();
  const primaryConnection = session?.primary
    ? session.connections[session.primary]
    : undefined;

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
        <div className="flex items-center gap-2 sm:gap-3">
          <HeaderNavAction authenticated={Boolean(primaryConnection)} />
          <ThemeToggle />
          <HeaderAvatars session={session} />
        </div>
      </div>
    </header>
  );
}
