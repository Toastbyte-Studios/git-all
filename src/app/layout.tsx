import { AnalyticsConsentBanner } from '@/components/AnalyticsConsentBanner';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { FAQ_ITEMS } from '@/lib/faq';
import './globals.css';
import type { Metadata, Viewport } from 'next';
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
    apple: [{ url: '/favicon-32x32.png', type: 'image/png' }],
  },
};

/**
 * Theme colours are declared here rather than as hand-written `<meta>` tags so
 * that Next emits them into the head itself. See the note above the component
 * for why this file no longer renders a head element of its own.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
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

const cfWebAnalyticsToken =
  process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN?.trim();

/**
 * This layout no longer renders a `<head>` element of its own.
 *
 * Hand-writing head tags here worked, but it meant this file and the
 * `metadata`/`viewport` exports were two competing routes to the same place.
 * Next owns the head in the App Router, so everything now goes through the
 * exports above: `themeColor` moved into `viewport`, and the dead preconnects
 * to api.github.com and gitlab.com were dropped outright — the browser never
 * talks to either origin (contribution data is fetched server-side through
 * `/api/*`), so both were costing a connection setup for nothing.
 *
 * The inline scripts below sit in the body deliberately. The theme script is
 * the first node in the body, which is early enough to set `data-theme` before
 * any content paints — the only reason it needed to be in the head. The JSON-LD
 * and the analytics beacon are order-insensitive and sit at the end.
 *
 * Note: removing the head element does NOT by itself put the metadata tags in
 * the head. Next streams resolved metadata into the end of the body for
 * ordinary user agents; see the `htmlLimitedBots` note in next.config.ts.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col antialiased">
        {/* Must remain the first node in the body: it sets data-theme before
            anything below it paints, which is what avoids the theme flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Header />
        {children}
        <Footer />
        <AnalyticsConsentBanner />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {cfWebAnalyticsToken && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: cfWebAnalyticsToken })}
          />
        )}
      </body>
    </html>
  );
}
