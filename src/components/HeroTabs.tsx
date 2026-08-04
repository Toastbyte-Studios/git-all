'use client';

import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

type HeroTabId = 'lookup' | 'embed';

const TABS: readonly { id: HeroTabId; label: string }[] = [
  { id: 'lookup', label: 'Look up' },
  { id: 'embed', label: 'Embed' },
];

interface HeroTabsProps {
  lookup: ReactNode;
  embed: ReactNode;
}

/**
 * Tabbed hero panel holding the two primary tools — the contribution lookup
 * and the embed snippet generator — in a single card so both sit above the
 * fold on desktop and mobile.
 *
 * Both panels stay mounted (hidden via the `hidden` attribute rather than
 * unmounted) so half-typed usernames survive a tab switch. `hidden` also
 * removes the inactive panel from the accessibility tree, so screen readers
 * and sequential focus only ever see the selected one.
 */
export function HeroTabs({ lookup, embed }: HeroTabsProps) {
  const baseId = useId();
  const [active, setActive] = useState<HeroTabId>('lookup');

  // The README links to gitall.app/#embed. That anchor used to scroll to a
  // standalone section; now that the embed generator lives in a tab, honour
  // the hash by selecting it instead of silently landing on Look up.
  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === '#embed') setActive('embed');
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  // Roving arrow-key navigation, per the WAI-ARIA tabs pattern.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();

    const current = TABS.findIndex((tab) => tab.id === active);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(current + offset + TABS.length) % TABS.length];

    setActive(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        role="tablist"
        aria-label="GitAll tools"
        onKeyDown={handleKeyDown}
        className="flex gap-1 px-2 pt-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {TABS.map(({ id, label }) => {
          const selected = active === id;
          return (
            <button
              key={id}
              id={`${baseId}-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(id)}
              className="px-4 py-2 text-sm font-medium rounded-t-md cursor-pointer transition-colors"
              style={{
                backgroundColor: 'transparent',
                color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                marginBottom: '-1px',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        <div
          id={`${baseId}-panel-lookup`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-lookup`}
          hidden={active !== 'lookup'}
        >
          {lookup}
        </div>
        <div
          id={`${baseId}-panel-embed`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-embed`}
          hidden={active !== 'embed'}
        >
          {embed}
        </div>
      </div>
    </div>
  );
}
