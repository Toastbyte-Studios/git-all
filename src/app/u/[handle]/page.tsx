import { notFound } from 'next/navigation';
import { getProfileByHandle } from '@/lib/profiles';
import { PublicProfileClient } from './PublicProfileClient';
import type { Metadata } from 'next';

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
