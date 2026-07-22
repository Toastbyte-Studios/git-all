import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { getProfileByHandle } from '@/lib/profiles';

export const alt = 'GitAll profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PROVIDER_COLORS: Record<string, string> = {
  github: '#39d353',
  gitlab: '#fd9a28',
  bitbucket: '#2dd4bf',
};

interface OgImageProps {
  params: Promise<{ handle: string }>;
}

export default async function ProfileOgImage({ params }: OgImageProps) {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle);

  if (!profile || !profile.isPublic) {
    notFound();
  }

  const displayName = profile.displayName ?? `@${profile.handle}`;

  return new ImageResponse(
    <div
      style={{
        background: '#0d1117',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        gap: '0px',
      }}
    >
      {/* Provider dots */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '28px',
        }}
      >
        {profile.connections.map((conn) => (
          <div
            key={conn.provider}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: PROVIDER_COLORS[conn.provider] ?? '#8b949e',
            }}
          />
        ))}
      </div>

      {/* Display name */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: '#f0f6fc',
          letterSpacing: '-2px',
          lineHeight: 1.1,
          textAlign: 'center',
          maxWidth: 900,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayName}
      </div>

      {/* Handle */}
      <div
        style={{
          fontSize: 32,
          color: '#8b949e',
          marginTop: 12,
        }}
      >
        gitall.app/u/{profile.handle}
      </div>

      {/* GitAll wordmark */}
      <div
        style={{
          display: 'flex',
          fontSize: 28,
          fontWeight: 700,
          marginTop: 36,
          letterSpacing: '-1px',
        }}
      >
        <span style={{ color: '#f0f6fc' }}>Git</span>
        <span style={{ color: '#2dd4bf' }}>All</span>
      </div>
    </div>,
    { ...size },
  );
}
