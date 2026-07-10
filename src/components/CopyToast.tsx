'use client';

interface CopyToastProps {
  success: boolean;
  username: string;
}

export function CopyToast({ success, username }: CopyToastProps) {
  const announcement = success
    ? `Copied ${username} to clipboard`
    : 'Failed to copy username';

  return (
    <div
      className="copy-toast font-mono-data text-xs"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 50,
        padding: '0.55rem 0.7rem',
        borderRadius: '0.5rem',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
      }}
    >
      <span className="sr-only">{announcement}</span>
      <span aria-hidden="true">
        {success ? (
          <>
            copied <span style={{ color: 'var(--accent)' }}>✓</span> exit 0
          </>
        ) : (
          <>
            <span style={{ color: 'var(--error)' }}>✗</span> copy failed exit 1
          </>
        )}
      </span>
    </div>
  );
}
