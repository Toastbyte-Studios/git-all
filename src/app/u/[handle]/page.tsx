import { notFound } from 'next/navigation';
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

  return {
    title: `${displayName} — GitAll`,
    description: `${displayName}'s verified contribution heatmap across ${profile.connections.length} platform(s) on GitAll.`,
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

  return <PublicProfileClient profile={profile} />;
}
