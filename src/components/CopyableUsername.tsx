'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

type CopyState = 'idle' | 'success' | 'error';

interface CopyableUsernameProps {
  username: string;
  className?: string;
  style?: CSSProperties;
  onCopyResult?: (result: { success: boolean; username: string }) => void;
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back below.
    }
  }

  if (
    typeof document === 'undefined' ||
    typeof document.execCommand !== 'function'
  ) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  const selection = document.getSelection();
  const selectedRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  if (selectedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(selectedRange);
  }

  return copied;
}

export function CopyableUsername({
  username,
  className,
  style,
  onCopyResult,
}: CopyableUsernameProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const handleCopy = async () => {
    const success = await copyTextWithFallback(username);
    setCopyState(success ? 'success' : 'error');
    onCopyResult?.({ success, username });

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      setCopyState('idle');
      resetTimerRef.current = null;
    }, 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`copy-username-btn ${className ?? ''}`.trim()}
      style={style}
      aria-label={`Copy username ${username} to clipboard`}
      data-copy-state={copyState}
    >
      <span>@{username}</span>
      <span className="copy-username-glyph" aria-hidden="true">
        {copyState === 'success' ? '✓' : copyState === 'error' ? '✗' : '⧉'}
      </span>
    </button>
  );
}
