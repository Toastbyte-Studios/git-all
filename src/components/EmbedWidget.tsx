'use client';

import { useEffect, useRef, useState } from 'react';

// Always generate embed snippets against the canonical production domain.
// Embed URLs get copied into READMEs permanently, so never derive this from
// window.location.origin — preview deployments and the typo-catcher domains
// (git-all.com / git-all.app, which only redirect here) must not leak into
// user snippets. See issue #96 / #41.
const SITE_URL = 'https://gitall.app';

function buildEmbedUrl(
  github: string,
  gitlab: string,
  bitbucket: string,
  gitea: string,
  instance: string,
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

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

interface CopyButtonProps {
  text: string;
}

function CopyButton({ text }: CopyButtonProps) {
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

interface SnippetRowProps {
  label: string;
  value: string;
}

function SnippetRow({ label, value }: SnippetRowProps) {
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
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export function EmbedWidget() {
  const [github, setGithub] = useState('');
  const [gitlab, setGitlab] = useState('');
  const [bitbucket, setBitbucket] = useState('');
  const [gitea, setGitea] = useState('');
  const [instance, setInstance] = useState('');
  const [showGitea, setShowGitea] = useState(false);

  const embedUrl = buildEmbedUrl(github, gitlab, bitbucket, gitea, instance);

  // Wrap the image in a link back to the site. Links *inside* the SVG are
  // not clickable on GitHub — camo-proxied images are sandboxed — so the
  // click-through has to live in the snippet, making the whole heatmap a
  // link to GitAll.
  const markdownSnippet = embedUrl
    ? `[![GitAll contributions](${embedUrl})](${SITE_URL})`
    : null;

  const htmlSnippet = embedUrl
    ? `<a href="${SITE_URL}"><img src="${embedUrl}" alt="Contribution heatmap" /></a>`
    : null;

  const inputStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  } as const;

  return (
    <div
      className="rounded-lg p-5 space-y-5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Username inputs */}
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
            placeholder="octocat"
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
            placeholder="johndoe"
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
            placeholder="jdoe"
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
                placeholder="myuser"
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
                <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
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
      {embedUrl && markdownSnippet && htmlSnippet ? (
        <div className="space-y-4 pt-1">
          <div
            className="h-px"
            style={{ backgroundColor: 'var(--border)' }}
            aria-hidden="true"
          />

          <SnippetRow
            label="Markdown (GitHub README)"
            value={markdownSnippet}
          />
          <SnippetRow label="HTML" value={htmlSnippet} />

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Includes a subtle &ldquo;Powered by GitAll&rdquo; watermark, and
            the heatmap links back to gitall.app. Refreshes daily via
            Cloudflare edge cache.
          </p>
        </div>
      ) : (
        <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
          Enter at least one username above to generate your embed snippet.
        </p>
      )}
    </div>
  );
}
