'use client';

import { useEffect, useState } from 'react';
import { generatePlaceholderNames } from '@/lib/placeholder-names';

const DEFAULT_PLACEHOLDERS = ['user-1', 'user-2', 'user-3'];

interface SearchFormProps {
  onSearch: (
    githubUsername: string,
    gitlabUsername: string,
    bitbucketUsername: string,
    giteaUsername: string,
    giteaInstanceUrl: string,
  ) => void;
  loading: boolean;
}

export function SearchForm({ onSearch, loading }: SearchFormProps) {
  const [placeholders, setPlaceholders] = useState(DEFAULT_PLACEHOLDERS);
  const [github, setGithub] = useState('');
  const [gitlab, setGitlab] = useState('');
  const [bitbucket, setBitbucket] = useState('');

  useEffect(() => {
    setPlaceholders(generatePlaceholderNames(DEFAULT_PLACEHOLDERS.length));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(github, gitlab, bitbucket, '', '');
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex-1">
          <label
            htmlFor="github"
            className="block text-xs font-medium mb-1.5 md:min-h-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            GitHub username
          </label>
          <input
            id="github"
            type="text"
            value={github}
            onChange={(e) => setGithub(e.target.value)}
            placeholder={placeholders[0]}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="gitlab"
            className="block text-xs font-medium mb-1.5 md:min-h-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            GitLab username
          </label>
          <input
            id="gitlab"
            type="text"
            value={gitlab}
            onChange={(e) => setGitlab(e.target.value)}
            placeholder={placeholders[1]}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="bitbucket"
            className="block text-xs font-medium mb-1.5 md:min-h-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            Bitbucket workspace
            <span
              className="ml-1 md:ml-0 md:block font-normal"
              style={{ color: 'var(--text-tertiary, var(--text-secondary))' }}
              title="Find it in your profile URL: bitbucket.org/{workspace}"
            >
              (bitbucket.org/<em>workspace</em>)
            </span>
          </label>
          <input
            id="bitbucket"
            type="text"
            value={bitbucket}
            onChange={(e) => setBitbucket(e.target.value)}
            placeholder={placeholders[2]}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <div className="flex items-end">
          <button
            type="submit"
            disabled={
              loading || (!github.trim() && !gitlab.trim() && !bitbucket.trim())
            }
            className="w-full sm:w-auto px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
            }}
          >
            {loading ? 'Loading…' : 'Look up'}
          </button>
        </div>
      </div>
    </form>
  );
}
