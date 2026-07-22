import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { trackServerEvent } from '@/lib/analytics-server';
import { getProfileByHandle } from '@/lib/profiles';
import { PublicProfileClient } from './PublicProfileClient';
import type { Metadata } from 'next';

// The edge Cache-Control header for this route is configured in next.config.ts
// (`headers()` → `/u/:handle`), which emits a real HTTP response header. Do not
// set caching via `generateMetadata().other` — that only renders a <meta> tag
// and has no effect on edge caching.

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle);

  if (!profile) {
    return { title: 'Profile not found — GitAll' };
  }

  const displayName = profile.displayName ?? `@${profile.handle}`;
  const canonicalUrl = `https://gitall.app/u/${profile.handle}`;

  if (!profile.isPublic) {
    return {
      title: `${displayName} — GitAll`,
      robots: { index: false, follow: false },
      alternates: { canonical: canonicalUrl },
    };
  }

  return {
    title: `${displayName} — GitAll`,
    description: `${displayName}'s verified contribution heatmap across ${profile.connections.length} platform(s) on GitAll.`,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${displayName} on GitAll`,
      description: `Verified contributions for ${displayName}`,
    },
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) {
    notFound();
  }

  // 308 redirect non-canonical handle forms (e.g. Jane_Doe → jane-doe).
  // The Cache-Control header in next.config.ts only applies to 200 responses,
  // so this redirect is unaffected by edge caching.
  if (handle !== profile.handle) {
    permanentRedirect(`/u/${profile.handle}`);
  }

  // Fire profile_view server-side — deliberate: the route is edge-cached
  // (s-maxage=900) and client-side events would be blocked by ad blockers for
  // much of this audience. Do not send the handle as an event param — it is a
  // direct identifier and must not go into GA4.
  const headersList = await headers();
  const requestForAnalytics = new NextRequest(
    `https://gitall.app/u/${handle}`,
    { headers: headersList },
  );
  trackServerEvent(requestForAnalytics, ANALYTICS_EVENTS.profileView, {
    has_display_name: profile.displayName !== null,
    connection_count: profile.connections.length,
  });

  return <PublicProfileClient profile={profile} />;
}
