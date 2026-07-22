import { getPublicHandlesForSitemap } from '@/lib/profiles';
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: 'https://gitall.app/',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: 'https://gitall.app/privacy',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  const handles = await getPublicHandlesForSitemap();
  const profileRoutes: MetadataRoute.Sitemap = handles.map(
    ({ handle, updatedAt }) => ({
      url: `https://gitall.app/u/${handle}`,
      lastModified: new Date(updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }),
  );

  return [...staticRoutes, ...profileRoutes];
}
