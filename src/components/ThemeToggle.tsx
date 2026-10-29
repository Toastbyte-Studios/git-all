'use client';

import { useEffect, useState } from 'react';

type ThemeChoice = 'light' | 'dark' | 'system';

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

export function ThemeToggle() {
  /*
   * Start as null (uninitialized) so the apply effect is a no-op on the first
   * render. This prevents the two-effect race where the apply effect would run
   * with the default "system" value before the init effect has read the
   * persisted choice from localStorage.
   */
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  /* On mount, read the persisted choice (guarded against unavailable storage) */
  useEffect(() => {
    let stored: ThemeChoice = 'system';
    try {
      const raw = localStorage.getItem('theme');
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        stored = raw;
      }
    } catch {
      // localStorage unavailable — fall back to "system"
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(stored);
  }, []);

  /* Apply the choice to the DOM and persist it — skipped until initialized */
  useEffect(() => {
    if (choice === null) return;
    applyTheme(choice);
    try {
      localStorage.setItem('theme', choice);
    } catch {
      // localStorage unavailable — skip persistence
    }
  }, [choice]);

  const options: { value: ThemeChoice; label: string; title: string }[] = [
    { value: 'light', label: '☀️', title: 'Light' },
    { value: 'system', label: '⚙️', title: 'System' },
    { value: 'dark', label: '🌙', title: 'Dark' },
  ];

  /* Show "system" as selected while still reading from storage */
  const activeChoice = choice ?? 'system';

  return (
    <div
      className="flex gap-1 p-1 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
      role="group"
      aria-label="Theme selector"
    >
      {options.map(({ value, label, title }) => (
        <button
          key={value}
          onClick={() => setChoice(value)}
          title={title}
          aria-label={title}
          aria-pressed={activeChoice === value}
          className="px-2 py-1 text-sm rounded-md transition-colors cursor-pointer"
          style={{
            backgroundColor:
              activeChoice === value ? 'var(--bg-elevated)' : 'transparent',
            color:
              activeChoice === value
                ? 'var(--text-primary)'
                : 'var(--text-muted)',
            border:
              activeChoice === value
                ? '1px solid var(--border)'
                : '1px solid transparent',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
