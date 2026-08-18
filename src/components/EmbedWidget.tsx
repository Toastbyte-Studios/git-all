'use client';

import { useEffect, useRef, useState } from 'react';
import { trackClientEvent } from '@/lib/analytics-client';
import { ANALYTICS_EVENTS } from '@/lib/analytics-events';
import type { EmbedTheme } from '@/lib/embed-svg';
import { generatePlaceholderNames } from '@/lib/placeholder-names';

// Always generate embed snippets against the canonical production domain.
// Embed URLs get copied into READMEs permanently, so never derive this from
// window.location.origin — preview deployments and the typo-catcher domains
// (git-all.com / git-all.app, which only redirect here) must not leak into
// user snippets. See issue #96 / #41.
const SITE_URL = 'https://gitall.app';

// UTM params appended to the link wrapping the heatmap image. Standard UTM
// lets GA4 attribute click-throughs automatically as "embed / referral" without
// any custom configuration.
const UTM_SUFFIX = '?utm_source=embed&utm_medium=referral&utm_campaign=heatmap';
const REFERRAL_URL = `${SITE_URL}${UTM_SUFFIX}`;

// Server-rendered placeholders. These are deliberately static so the markup is
// deterministic; random names are swapped in after mount (see below) to avoid a
// hydration mismatch. Order: GitHub, GitLab, Bitbucket, Gitea/Forgejo.
const DEFAULT_PLACEHOLDERS = ['user-1', 'user-2', 'user-3', 'user-4'];

// Long enough that typing a username is one request rather than one per
// keystroke. Each distinct URL is a real fetch of the embed endpoint.
const PREVIEW_DEBOUNCE_MS = 600;

const THEME_OPTIONS: { value: EmbedTheme; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: "Follows the reader's system theme" },
  { value: 'light', label: 'Light', hint: 'Always the light palette' },
  { value: 'dark', label: 'Dark', hint: 'Always the dark palette' },
];

/**
 * `auto` is the server-side default, so it is deliberately left out of the URL:
 * the shortest snippet is the one most people should copy. Pinning is for
 * readers whose host page does not follow the OS — GitHub most of all, where
 * the theme is an account setting.
 */
function themeParam(theme: EmbedTheme): string {
  return theme === 'auto' ? '' : `theme=${theme}`;
}

function buildEmbedUrl(
  github: string,
  gitlab: string,
  bitbucket: string,
  gitea: string,
  instance: string,
  theme: EmbedTheme,
): string | null {
  const gh = github.trim();
  const gl = gitlab.trim();
  const bb = bitbucket.trim();
  const gt = gitea.trim();

  if (!gh && !gl && !bb && !gt) return null;

  // Primary username in the path (first non-empty, prefer GitHub)
  const primary = gh || gl || bb || gt;
  const base = `${SITE_URL}/embed/${encodeURIComponent(primary)}.svg`;
  const params = new URLSearchParams();

  if (gh) params.set('github', gh);
  if (gl) params.set('gitlab', gl);
  if (bb) params.set('bitbucket', bb);
  if (gt) {
    params.set('gitea', gt);
    if (instance.trim()) params.set('instance', instance.trim());
  }
  if (theme !== 'auto') params.set('theme', theme);

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

interface CopyButtonProps {
  text: string;
  onCopy?: () => void;
}

function CopyButton({ text, onCopy }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onCopy?.();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      // Clipboard API not available — silently ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
      style={{
        backgroundColor: copied
          ? 'rgba(45,212,191,0.15)'
          : 'var(--bg-elevated)',
        border: `1px solid ${copied ? 'rgba(45,212,191,0.4)' : 'var(--border)'}`,
        color: copied ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

interface ThemeSelectProps {
  value: EmbedTheme;
  onChange: (theme: EmbedTheme) => void;
}

function ThemeSelect({ value, onChange }: ThemeSelectProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        Theme
      </p>
      <div
        className="flex rounded-lg overflow-hidden text-xs"
        style={{ border: '1px solid var(--border)' }}
        role="group"
        aria-label="Embed theme"
      >
        {THEME_OPTIONS.map(({ value: option, label, hint }) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            title={hint}
            aria-pressed={value === option}
            className="flex-1 px-3 py-1.5 font-medium transition-colors cursor-pointer"
            style={{
              background:
                value === option ? 'var(--accent)' : 'var(--bg-surface)',
              color: value === option ? '#0d1117' : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface EmbedPreviewProps {
  url: string;
}

/**
 * Renders the real endpoint rather than a local reconstruction, so what the
 * user sees is exactly what a README will get — including the auto theme
 * following their own OS preference, which is the whole point of showing it.
 *
 * These requests land on /embed/* like any other impression. `trackEmbedServed`
 * drops same-host referers so the generator does not inflate `embed_served`.
 */
function EmbedPreview({ url }: EmbedPreviewProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    setStatus('loading');
    const timer = setTimeout(() => setLoadedUrl(url), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [url]);

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        Preview
      </p>
      <div
        className="flex items-center justify-center rounded px-3 py-4 overflow-x-auto"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          minHeight: '6rem',
        }}
      >
        {loadedUrl && (
          // Deliberately a plain img: this is an external SVG endpoint, and
          // next/image would proxy and rewrite a URL whose whole purpose is to
          // be reproduced verbatim in a README.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={loadedUrl}
            src={loadedUrl}
            alt="Preview of your contribution heatmap"
            className="max-w-full h-auto rounded"
            style={{ display: status === 'ready' ? 'block' : 'none' }}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
          />
        )}
        {status !== 'ready' && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {status === 'error'
              ? 'No heatmap for those usernames — check the spelling.'
              : 'Rendering preview…'}
          </p>
        )}
      </div>
    </div>
  );
}

interface SnippetRowProps {
  label: string;
  value: string;
  onCopy?: () => void;
}

function SnippetRow({ label, value, onCopy }: SnippetRowProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <div className="flex items-start gap-2">
        <code
          data-selectable
          className="flex-1 block text-xs rounded px-3 py-2 break-all"
          style={{
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontFamily:
              '"JetBrains Mono", ui-monospace, "Cascadia Code", monospace',
          }}
        >
          {value}
        </code>
        <CopyButton text={value} onCopy={onCopy} />
      </div>
    </div>
  );
}

interface EmbedWidgetProps {
  /** Handle of the signed-in user's public profile, if available. */
  handle?: string | null;
  /** Whether the signed-in user's profile is public. */
  isPublic?: boolean;
}

interface AuthSessionResponse {
  authenticated: boolean;
  profile?: {
    handle: string;
    isPublic: boolean;
  } | null;
}

export function EmbedWidget({ handle, isPublic }: EmbedWidgetProps = {}) {
  const [profileHandle, setProfileHandle] = useState(handle ?? null);
  const [profileIsPublic, setProfileIsPublic] = useState(isPublic ?? false);
  const [hasSelectedMode, setHasSelectedMode] = useState(false);
  const eligibleForHandleEmbed = Boolean(profileHandle && profileIsPublic);
  const [mode, setMode] = useState<'handle' | 'custom'>(
    eligibleForHandleEmbed ? 'handle' : 'custom',
  );
  const [placeholders, setPlaceholders] = useState(DEFAULT_PLACEHOLDERS);
  const [github, setGithub] = useState('');
  const [gitlab, setGitlab] = useState('');
  const [bitbucket, setBitbucket] = useState('');
  const [gitea, setGitea] = useState('');
  const [instance, setInstance] = useState('');
  const [showGitea, setShowGitea] = useState(false);
  const [theme, setTheme] = useState<EmbedTheme>('auto');

  useEffect(() => {
    setPlaceholders(generatePlaceholderNames(DEFAULT_PLACEHOLDERS.length));
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AuthSessionResponse | null) => {
        if (!isMounted || !data?.authenticated) {
          return;
        }
        setProfileHandle(data.profile?.handle ?? null);
        setProfileIsPublic(data.profile?.isPublic === true);
      })
      .catch(() => {
        // Session lookup failed — leave the widget in custom mode.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (eligibleForHandleEmbed) {
      if (!hasSelectedMode) {
        setMode('handle');
      }
      return;
    }

    if (mode === 'handle') {
      setMode('custom');
    }
  }, [eligibleForHandleEmbed, hasSelectedMode, mode]);

  // Handle-keyed embed URL — resolves live from the user's public profile.
  // The link target points at the profile page rather than the site home.
  const handleQuery = themeParam(theme);
  const handleEmbedUrl =
    eligibleForHandleEmbed && profileHandle
      ? `${SITE_URL}/embed/u/${encodeURIComponent(profileHandle)}.svg` +
        (handleQuery ? `?${handleQuery}` : '')
      : null;
  const handleReferralUrl = profileHandle
    ? `${SITE_URL}/u/${encodeURIComponent(profileHandle)}${UTM_SUFFIX}`
    : null;

  const customEmbedUrl = buildEmbedUrl(
    github,
    gitlab,
    bitbucket,
    gitea,
    instance,
    theme,
  );

  // Wrap the image in a link back to the site. Links *inside* the SVG are
  // not clickable on GitHub — camo-proxied images are sandboxed — so the
  // click-through has to live in the snippet, making the whole heatmap a
  // link to GitAll. UTM params let GA4 attribute click-throughs automatically
  // as "embed / referral" without any custom configuration.
  //
  // `embed_generated` carries a `source` param using the same 'handle' | 'slug'
  // vocabulary as `embed_served` (see trackEmbedServed in lib/embed-render.ts),
  // so copies and renders can be compared on one axis in GA4 rather than
  // needing two different breakdowns to answer the same question. `theme` is
  // reported on the same vocabulary for the same reason.
  const activeEmbedUrl = mode === 'handle' ? handleEmbedUrl : customEmbedUrl;
  const activeReferralUrl =
    mode === 'handle' && handleReferralUrl ? handleReferralUrl : REFERRAL_URL;

  const markdownSnippet = activeEmbedUrl
    ? `[![GitAll contributions](${activeEmbedUrl})](${activeReferralUrl})`
    : null;

  const htmlSnippet = activeEmbedUrl
    ? `<a href="${activeReferralUrl}"><img src="${activeEmbedUrl}" alt="Contribution heatmap" /></a>`
    : null;

  const platformCount = [github, gitlab, bitbucket, gitea].filter((v) =>
    v.trim(),
  ).length;

  const themeNote =
    theme === 'auto'
      ? "Colors follow each reader's light or dark mode."
      : `Colors are pinned to the ${theme} palette.`;

  const inputStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  } as const;

  // No card chrome of its own — the surrounding HeroTabs panel provides the
  // border and background.
  return (
    <div className="space-y-5">
      {/* Mode toggle — only visible to users eligible for a handle embed */}
      {eligibleForHandleEmbed && (
        <div
          className="flex rounded-lg overflow-hidden text-xs"
          style={{ border: '1px solid var(--border)' }}
        >
          <button
            type="button"
            onClick={() => {
              setHasSelectedMode(true);
              setMode('handle');
            }}
            aria-pressed={mode === 'handle'}
            className="flex-1 px-3 py-1.5 font-medium transition-colors cursor-pointer"
            style={{
              background:
                mode === 'handle' ? 'var(--accent)' : 'var(--bg-surface)',
              color: mode === 'handle' ? '#0d1117' : 'var(--text-secondary)',
            }}
          >
            My handle
          </button>
          <button
            type="button"
            onClick={() => {
              setHasSelectedMode(true);
              setMode('custom');
            }}
            aria-pressed={mode === 'custom'}
            className="flex-1 px-3 py-1.5 font-medium transition-colors cursor-pointer"
            style={{
              background:
                mode === 'custom' ? 'var(--accent)' : 'var(--bg-surface)',
              color: mode === 'custom' ? '#0d1117' : 'var(--text-secondary)',
            }}
          >
            Custom usernames
          </button>
        </div>
      )}

      {/* Handle-keyed form — shown to signed-in users with a public profile */}
      {mode === 'handle' && eligibleForHandleEmbed && profileHandle ? (
        <div className="space-y-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Your snippet is keyed to your profile handle{' '}
            <strong style={{ color: 'var(--accent)' }}>
              {SITE_URL}/u/{profileHandle}
            </strong>
            . It automatically picks up newly connected providers and survives
            username changes on any platform.
          </p>

          <div
            className="h-px"
            style={{ backgroundColor: 'var(--border)' }}
            aria-hidden="true"
          />

          <ThemeSelect value={theme} onChange={setTheme} />

          {activeEmbedUrl && <EmbedPreview url={activeEmbedUrl} />}

          <SnippetRow
            label="Markdown (GitHub README)"
            value={markdownSnippet ?? ''}
            onCopy={() =>
              trackClientEvent(ANALYTICS_EVENTS.embedGenerated, {
                snippet_type: 'markdown',
                platform_count: 0,
                source: 'handle',
                theme,
              })
            }
          />
          <SnippetRow
            label="HTML"
            value={htmlSnippet ?? ''}
            onCopy={() =>
              trackClientEvent(ANALYTICS_EVENTS.embedGenerated, {
                snippet_type: 'html',
                platform_count: 0,
                source: 'handle',
                theme,
              })
            }
          />

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Includes a subtle &ldquo;Powered by GitAll&rdquo; watermark, and the
            heatmap links to your profile. {themeNote} Refreshes hourly via
            Cloudflare edge cache.
          </p>
        </div>
      ) : (
        /* Custom username inputs */
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="embed-github"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                GitHub username
              </label>
              <input
                id="embed-github"
                type="text"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                placeholder={placeholders[0]}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                htmlFor="embed-gitlab"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                GitLab username
              </label>
              <input
                id="embed-gitlab"
                type="text"
                value={gitlab}
                onChange={(e) => setGitlab(e.target.value)}
                placeholder={placeholders[1]}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                htmlFor="embed-bitbucket"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Bitbucket workspace
              </label>
              <input
                id="embed-bitbucket"
                type="text"
                value={bitbucket}
                onChange={(e) => setBitbucket(e.target.value)}
                placeholder={placeholders[2]}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Gitea toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowGitea((v) => !v)}
              className="text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              {showGitea ? '− Hide Gitea/Forgejo' : '+ Add Gitea/Forgejo'}
            </button>

            {showGitea && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label
                    htmlFor="embed-gitea"
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Gitea/Forgejo username
                  </label>
                  <input
                    id="embed-gitea"
                    type="text"
                    value={gitea}
                    onChange={(e) => setGitea(e.target.value)}
                    placeholder={placeholders[3]}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    htmlFor="embed-instance"
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Instance URL{' '}
                    <span style={{ color: 'var(--text-muted)' }}>
                      (optional)
                    </span>
                  </label>
                  <input
                    id="embed-instance"
                    type="url"
                    value={instance}
                    onChange={(e) => setInstance(e.target.value)}
                    placeholder="https://codeberg.org"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Snippets */}
          {activeEmbedUrl && markdownSnippet && htmlSnippet ? (
            <div className="space-y-4 pt-1">
              <div
                className="h-px"
                style={{ backgroundColor: 'var(--border)' }}
                aria-hidden="true"
              />

              <ThemeSelect value={theme} onChange={setTheme} />

              <EmbedPreview url={activeEmbedUrl} />

              <SnippetRow
                label="Markdown (GitHub README)"
                value={markdownSnippet}
                onCopy={() =>
                  trackClientEvent(ANALYTICS_EVENTS.embedGenerated, {
                    snippet_type: 'markdown',
                    platform_count: platformCount,
                    source: 'slug',
                    theme,
                  })
                }
              />
              <SnippetRow
                label="HTML"
                value={htmlSnippet}
                onCopy={() =>
                  trackClientEvent(ANALYTICS_EVENTS.embedGenerated, {
                    snippet_type: 'html',
                    platform_count: platformCount,
                    source: 'slug',
                    theme,
                  })
                }
              />

              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Includes a subtle &ldquo;Powered by GitAll&rdquo; watermark, and
                the heatmap links back to gitall.app. {themeNote} Refreshes
                daily via Cloudflare edge cache.
              </p>
            </div>
          ) : (
            <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
              Enter at least one username above to generate your embed snippet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
