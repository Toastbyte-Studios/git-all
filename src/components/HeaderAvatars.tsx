import Image from 'next/image';
import Link from 'next/link';
import { getAuthSession } from '@/lib/auth-session';
import {
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  PROVIDER_RING,
} from '@/lib/provider-ui';

/**
 * Renders the connected-account avatar stack in the site header.
 * Reads the auth session server-side to avoid a client-side round-trip.
 */
export async function HeaderAvatars() {
  const session = await getAuthSession();

  if (!session?.primary || !session.connections) {
    return null;
  }

  const connected = PROVIDER_ORDER.filter((p) => session.connections[p]);
  if (connected.length === 0) return null;

  const stackOrder = [
    ...connected.filter((p) => p !== session.primary),
    ...connected.filter((p) => p === session.primary),
  ];

  const accountsLabel = connected
    .map((p) => `${PROVIDER_LABELS[p]} @${session.connections[p]!.username}`)
    .join(', ');

  return (
    <Link
      href="/whoami"
      aria-label={`Your profile — ${accountsLabel}`}
      className="flex shrink-0 items-center rounded-full transition-opacity hover:opacity-80"
    >
      {stackOrder.map((provider, index) => {
        const conn = session.connections[provider]!;
        return (
          <span
            key={provider}
            className="relative rounded-full"
            style={{
              marginLeft: index === 0 ? 0 : '-10px',
              padding: '2px',
              background: 'var(--bg)',
              zIndex:
                provider === session.primary
                  ? stackOrder.length + 1
                  : index + 1,
            }}
          >
            <Image
              src={conn.avatarUrl}
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              className="block rounded-full"
              style={{ border: `2px solid ${PROVIDER_RING[provider]}` }}
            />
          </span>
        );
      })}
    </Link>
  );
}
