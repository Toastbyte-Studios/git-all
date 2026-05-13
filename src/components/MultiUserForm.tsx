'use client';

import { useRef, useState } from 'react';
import type { UserEntry } from '@/lib/types';

const MAX_USERS = 10;

interface MultiUserFormProps {
  onSearch: (entries: UserEntry[]) => void;
  loading: boolean;
}

let _counter = 0;
function nextId(): string {
  return `entry-${++_counter}`;
}

function createEntry(
  platform: 'github' | 'gitlab' = 'github',
  username = '',
): UserEntry {
  return { id: nextId(), platform, username };
}

export function MultiUserForm({ onSearch, loading }: MultiUserFormProps) {
  const initialId = useRef(nextId());
  const [entries, setEntries] = useState<UserEntry[]>([
    { id: initialId.current, platform: 'github', username: '' },
  ]);

  const addEntry = () => {
    if (entries.length >= MAX_USERS) return;
    setEntries((prev) => [...prev, createEntry()]);
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
    const valid = entries.filter((e) => e.username.trim());
    if (valid.length === 0) return;
    onSearch(valid);
  };

  const hasAny = entries.some((e) => e.username.trim());

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2 items-center">
            <select
              value={entry.platform}
              onChange={(e) =>
                updateEntry(entry.id, {
                  platform: e.target.value as 'github' | 'gitlab',
                })
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
            </select>
            <input
              type="text"
              value={entry.username}
              onChange={(e) =>
                updateEntry(entry.id, { username: e.target.value })
              }
              placeholder={entry.platform === 'github' ? 'octocat' : 'johndoe'}
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              aria-label="Username"
            />
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
