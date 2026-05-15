import { FAQ_ITEMS } from '@/lib/faq';
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title:
    'GitAll — View GitHub, GitLab, Bitbucket & Gitea/Forgejo Contributions in One Place',
  description:
    'GitAll lets you see GitHub, GitLab, Bitbucket, and Gitea/Forgejo contribution graphs in one unified heatmap. Supports 4 platforms. Free, no login required.',
  metadataBase: new URL('https://gitall.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title:
      'GitAll — View GitHub, GitLab, Bitbucket & Gitea/Forgejo Contributions in One Place',
    description:
      'GitAll lets you see GitHub, GitLab, Bitbucket, and Gitea/Forgejo contribution graphs in one unified heatmap. Supports 4 platforms. Free, no login required.',
    url: 'https://gitall.app',
    siteName: 'GitAll',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title:
      'GitAll — View GitHub, GitLab, Bitbucket & Gitea/Forgejo Contributions in One Place',
    description:
      'GitAll lets you see GitHub, GitLab, Bitbucket, and Gitea/Forgejo contribution graphs in one unified heatmap. Supports 4 platforms. Free, no login required.',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/favicon-32x32.png', sizes: '180x180', type: 'image/png' }],
  },
};

/* Inline script injected before first paint to avoid flash of wrong theme */
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
    // 'system' or null → no attribute, CSS media query takes over
  } catch (e) {}
})();
`.trim();

const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'GitAll',
    url: 'https://gitall.app',
    description:
      'See GitHub, GitLab, Bitbucket, and Gitea/Forgejo contributions in one unified heatmap. Supports 4 platforms. Free, no login required.',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    creator: {
      '@type': 'Organization',
      name: 'Toastbyte Studios',
      url: 'https://toastbyte.studio',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <meta
          name="theme-color"
          content="#0d1117"
          media="(prefers-color-scheme: dark)"
        />
        <meta
          name="theme-color"
          content="#ffffff"
          media="(prefers-color-scheme: light)"
        />
        <link rel="preconnect" href="https://api.github.com" />
        <link rel="preconnect" href="https://gitlab.com" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
