'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_GITEA_INSTANCE_URL,
  GITEA_CUSTOM_INSTANCE_VALUE,
  GITEA_KNOWN_INSTANCES,
} from '@/lib/gitea';
import { generatePlaceholderName } from '@/lib/placeholder-names';
import type { UserEntry } from '@/lib/types';

const MAX_USERS = 10;

interface MultiUserFormProps {
  onSearch: (entries: UserEntry[]) => void;
  loading: boolean;
}

type EntryWithPlaceholder = UserEntry & { placeholder: string };

let _counter = 0;
function nextId(): string {
  return `entry-${++_counter}`;
}

function createEntry(
  platform: UserEntry['platform'] = 'github',
  username = '',
  placeholder = '',
): EntryWithPlaceholder {
  return {
    id: nextId(),
    platform,
    username,
    instanceUrl: platform === 'gitea' ? DEFAULT_GITEA_INSTANCE_URL : undefined,
    placeholder,
  };
}

export function MultiUserForm({ onSearch, loading }: MultiUserFormProps) {
  const initialEntry = useRef(createEntry());
  const [entries, setEntries] = useState<EntryWithPlaceholder[]>([
    initialEntry.current,
  ]);

  useEffect(() => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.placeholder
          ? entry
          : { ...entry, placeholder: generatePlaceholderName() },
      ),
    );
  }, []);

  const addEntry = () => {
    setEntries((prev) => {
      if (prev.length >= MAX_USERS) return prev;
      return [...prev, createEntry('github', '', generatePlaceholderName())];
    });
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<Omit<UserEntry, 'id'>>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = entries.filter((entry) => entry.username.trim());
    if (valid.length === 0) return;
    onSearch(valid);
  };

  const hasAny = entries.some((e) => e.username.trim());

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2 items-start">
            <select
              value={entry.platform}
              onChange={(e) =>
                updateEntry(
                  entry.id,
                  e.target.value === 'gitea'
                    ? {
                        platform: 'gitea',
                        instanceUrl:
                          entry.instanceUrl ?? DEFAULT_GITEA_INSTANCE_URL,
                      }
                    : {
                        platform: e.target.value as UserEntry['platform'],
                        instanceUrl: undefined,
                      },
                )
              }
              className="px-2 py-2 rounded-lg text-sm outline-none transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              aria-label="Platform"
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="bitbucket">Bitbucket</option>
              <option value="gitea">Gitea / Forgejo</option>
            </select>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={entry.username}
                onChange={(e) =>
                  updateEntry(entry.id, { username: e.target.value })
                }
                placeholder={entry.placeholder}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                aria-label="Username"
              />
              {entry.platform === 'gitea' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={
                      GITEA_KNOWN_INSTANCES.some(
                        (instance) => instance.url === entry.instanceUrl,
                      )
                        ? entry.instanceUrl
                        : GITEA_CUSTOM_INSTANCE_VALUE
                    }
                    onChange={(e) =>
                      updateEntry(entry.id, {
                        instanceUrl:
                          e.target.value === GITEA_CUSTOM_INSTANCE_VALUE
                            ? ''
                            : e.target.value,
                      })
                    }
                    className="px-2 py-2 rounded-lg text-sm outline-none transition-colors cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    aria-label="Gitea / Forgejo instance"
                  >
                    {GITEA_KNOWN_INSTANCES.map((instance) => (
                      <option key={instance.url} value={instance.url}>
                        {instance.label}
                      </option>
                    ))}
                    <option value={GITEA_CUSTOM_INSTANCE_VALUE}>
                      Custom URL
                    </option>
                  </select>
                  {(entry.instanceUrl === '' ||
                    !GITEA_KNOWN_INSTANCES.some(
                      (instance) => instance.url === entry.instanceUrl,
                    )) && (
                    <input
                      type="url"
                      value={entry.instanceUrl ?? ''}
                      onChange={(e) =>
                        updateEntry(entry.id, { instanceUrl: e.target.value })
                      }
                      placeholder="https://codeberg.org"
                      required={Boolean(entry.username.trim())}
                      className="px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      aria-label="Custom Gitea / Forgejo URL"
                    />
                  )}
                </div>
              )}
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="px-2 py-2 rounded-lg text-sm transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
                aria-label="Remove entry"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={addEntry}
          disabled={entries.length >= MAX_USERS}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          + Add user
        </button>
        <button
          type="submit"
          disabled={loading || !hasAny}
          className="px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg)',
          }}
        >
          {loading ? 'Loading\u2026' : 'Look up'}
        </button>
      </div>
    </form>
  );
}
