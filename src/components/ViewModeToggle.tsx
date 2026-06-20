'use client';

import type { ViewMode } from '@/lib/types';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ viewMode, onChange }: ViewModeToggleProps) {
  return (
    <div
      className="flex gap-1 p-1 rounded-lg shrink-0"
      style={{ backgroundColor: 'var(--bg-surface)' }}
    >
      {(['side-by-side', 'integrated'] as ViewMode[]).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          aria-pressed={viewMode === mode}
          className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer"
          style={{
            backgroundColor:
              viewMode === mode ? 'var(--bg-elevated)' : 'transparent',
            color:
              viewMode === mode
                ? 'var(--text-primary)'
                : 'var(--text-secondary)',
          }}
        >
          {mode === 'side-by-side' ? 'Side by Side' : 'Integrated'}
        </button>
      ))}
    </div>
  );
}
