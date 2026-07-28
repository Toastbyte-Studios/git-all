import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import { trackServerEvent } from '@/lib/analytics-server';
import { getAuthSession } from '@/lib/auth-session';
import {
  getProfileByHandle,
  getPublicProfileByHandle,
  toPublicProfile,
} from '@/lib/profiles';
import { PublicProfileClient } from './PublicProfileClient';
import type { Metadata } from 'next';

// The edge Cache-Control header for this route is configured in next.config.ts
// (`headers()` → `/u/:handle`), which emits a real HTTP response header. Do not
// set caching via `generateMetadata().other` — that only renders a <meta> tag
// and has no effect on edge caching.
//
// This route reads the session cookie so the owner can preview their own
// private profile, which means responses are NOT interchangeable between
// viewers. `Vary: Cookie` in next.config.ts is what keeps a shared cache from
// serving an owner's private view to an anonymous visitor — do not remove it
// without also removing the owner-preview branch below.

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;

  // Deliberately the public projection: a private profile and a non-existent
  // one must produce byte-identical metadata. Returning the display name, or
  // even a canonical URL, for a private handle would leak both the existence of
  // the account and its owner's name through the page title and OG tags.
  //
  // The owner previewing their own private profile sees this generic title too.
  // That is a deliberate trade: the alternative is branching on the session
  // here, which would put the display name into a response that a shared cache
  // could conceivably retain.
  const profile = await getPublicProfileByHandle(handle);

  if (!profile) {
    return {
      title: 'Profile not found — GitAll',
      robots: { index: false, follow: false },
    };
  }

  const displayName = profile.displayName ?? `@${profile.handle}`;
  const canonicalUrl = `https://gitall.app/u/${profile.handle}`;

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

  // The full record is needed here rather than the public projection: the owner
  // check compares against the internal user id, and the visibility gate needs
  // `isPublic`. Nothing from this object reaches the client except through
  // `toPublicProfile()` at the bottom of this function.
  const profile = await getProfileByHandle(handle);
  if (!profile) {
    notFound();
  }

  const session = await getAuthSession();
  const isOwner =
    session?.userId !== undefined && session.userId === profile.id;

  // 404, never 403. A 403 confirms the handle is taken, which discloses the
  // existence of an account for any guessable username.
  if (!profile.isPublic && !isOwner) {
    notFound();
  }

  const isOwnerPreview = !profile.isPublic;

  // 308 redirect non-canonical handle forms (e.g. Jane_Doe → jane-doe).
  // The Cache-Control header in next.config.ts only applies to 200 responses,
  // so this redirect is unaffected by edge caching.
  if (handle !== profile.handle) {
    permanentRedirect(`/u/${profile.handle}`);
  }

  // Fire profile_view server-side — deliberate: the route is edge-cached and
  // client-side events would be blocked by ad blockers for much of this
  // audience. Do not send the handle as an event param — it is a direct
  // identifier and must not go into GA4.
  //
  // Skipped for owner previews: an owner looking at their own unpublished page
  // is not a profile view, and counting it would inflate the metric with the
  // one person guaranteed to visit.
  if (!isOwnerPreview) {
    const headersList = await headers();
    const requestForAnalytics = new NextRequest(
      `https://gitall.app/u/${handle}`,
      { headers: headersList },
    );
    trackServerEvent(requestForAnalytics, ANALYTICS_EVENTS.profileView, {
      has_display_name: profile.displayName !== null,
      connection_count: profile.connections.length,
    });
  }

  return (
    <PublicProfileClient
      profile={toPublicProfile(profile)}
      ownerPreview={isOwnerPreview}
    />
  );
}
