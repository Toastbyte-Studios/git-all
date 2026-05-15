import { Suspense } from 'react';
import { AuthStatus } from '@/components/AuthStatus';
import { ContributionExplorer } from '@/components/ContributionExplorer';
import { GitAllLogo } from '@/components/GitAllLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FAQ_ITEMS } from '@/lib/faq';

export default function Home() {
  return (
    <>
      <header className="max-w-6xl mx-auto px-4 pt-12 pb-0 text-center">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>
        <h1 className="flex justify-center mb-3">
          <GitAllLogo />
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          See GitHub, GitLab, Bitbucket, and Gitea/Forgejo contributions in one
          place.
        </p>
        <div className="mt-3 flex justify-center">
          <AuthStatus />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-12">
        <section aria-label="Contribution lookup tool" className="mt-10">
          <Suspense fallback={<ContributionExplorerFallback />}>
            <ContributionExplorer />
          </Suspense>
        </section>

        {/* ── About ─────────────────────────────────────────────── */}
        <section
          id="about"
          aria-labelledby="about-heading"
          className="mt-24 max-w-2xl mx-auto text-center"
        >
          <h2
            id="about-heading"
            className="text-lg font-semibold mb-3"
            style={{ color: 'var(--text-primary)' }}
          >
            What is GitAll?
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            GitAll is a free developer tool that aggregates your contribution
            graphs from GitHub, GitLab, Bitbucket, and Gitea/Forgejo into one
            unified heatmap. Enter your username on any supported platform and
            instantly see your combined git activity — no account needed.
          </p>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="mt-16 max-w-2xl mx-auto"
        >
          <h2
            id="how-heading"
            className="text-lg font-semibold mb-4 text-center"
            style={{ color: 'var(--text-primary)' }}
          >
            How it works
          </h2>
          <ol
            className="space-y-3 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <li className="flex gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--accent)',
                }}
              >
                1
              </span>
              <span>
                Enter your GitHub, GitLab, Bitbucket, and Gitea/Forgejo
                usernames in the search form above.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--accent)',
                }}
              >
                2
              </span>
              <span>
                GitAll fetches your public contribution data directly from each
                platform&apos;s API — no tokens or OAuth required.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--accent)',
                }}
              >
                3
              </span>
              <span>
                View your contributions side by side or as a single integrated
                cross-platform heatmap.
              </span>
            </li>
          </ol>
        </section>

        {/* ── Supported platforms ───────────────────────────────── */}
        <section
          id="platforms"
          aria-labelledby="platforms-heading"
          className="mt-16 max-w-2xl mx-auto"
        >
          <h2
            id="platforms-heading"
            className="text-lg font-semibold mb-4 text-center"
            style={{ color: 'var(--text-primary)' }}
          >
            Supported platforms
          </h2>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {[
              {
                name: 'GitHub',
                desc: "The world's largest code hosting platform",
                color: 'var(--gh-accent)',
              },
              {
                name: 'GitLab',
                desc: 'Self-hosted and cloud git repositories',
                color: 'var(--gl-accent)',
              },
              {
                name: 'Bitbucket',
                desc: "Atlassian's git collaboration platform",
                color: 'var(--bb-accent)',
              },
              {
                name: 'Gitea / Forgejo',
                desc: 'Lightweight self-hosted git servers',
                color: 'var(--gt-accent)',
              },
            ].map(({ name, desc, color }) => (
              <li
                key={name}
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <span className="font-medium block mb-0.5" style={{ color }}>
                  {name}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Why GitAll ────────────────────────────────────────── */}
        <section
          id="why-gitall"
          aria-labelledby="why-heading"
          className="mt-16 max-w-2xl mx-auto"
        >
          <h2
            id="why-heading"
            className="text-lg font-semibold mb-4 text-center"
            style={{ color: 'var(--text-primary)' }}
          >
            Why GitAll?
          </h2>
          <ul
            className="space-y-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {[
              'Your contribution history is scattered across multiple platforms with no unified view.',
              'Recruiters and engineering managers need a single picture of your activity — GitAll provides it instantly.',
              'No native UI shows contributions across GitHub, GitLab, Bitbucket, and Gitea/Forgejo at once.',
              'GitAll merges everything into one clean heatmap, completely free with no login required.',
            ].map((point) => (
              <li key={point} className="flex gap-2">
                <span style={{ color: 'var(--accent)' }} aria-hidden="true">
                  ✓
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section
          id="faq"
          aria-labelledby="faq-heading"
          className="mt-16 max-w-2xl mx-auto"
        >
          <h2
            id="faq-heading"
            className="text-lg font-semibold mb-4 text-center"
            style={{ color: 'var(--text-primary)' }}
          >
            Frequently Asked Questions
          </h2>
          <dl className="space-y-4">
            {FAQ_ITEMS.map(({ question, answer }) => (
              <div
                key={question}
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <dt
                  className="text-sm font-medium mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {question}
                </dt>
                <dd
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 mt-16 pb-8 text-center">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Built by{' '}
          <a
            href="https://toastbyte.studio"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-secondary)' }}
            className="hover:underline"
          >
            Toastbyte Studios
          </a>
        </p>
      </footer>
    </>
  );
}

function ContributionExplorerFallback() {
  return (
    <div
      className="max-w-2xl mx-auto rounded-lg p-4 text-sm"
      style={{
        backgroundColor: 'var(--bg-surface)',
        color: 'var(--text-secondary)',
      }}
    >
      Loading contribution explorer…
    </div>
  );
}
