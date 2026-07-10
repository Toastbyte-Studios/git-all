import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');

describe('global selection styling', () => {
  it('scopes user-select suppression to chrome while preserving copyable content', () => {
    expect(css).toMatch(
      /:where\([\s\S]*header,[\s\S]*\.heatmap,[\s\S]*\[data-ui-chrome\][\s\S]*\)\s*\{/,
    );
    expect(css).toContain('-webkit-user-select: none;');
    expect(css).toContain('user-select: none;');
    expect(css).toMatch(
      /:where\(input, textarea, code, pre, \[data-selectable\]\)\s*\{/,
    );
    expect(css).toContain('-webkit-user-select: text;');
    expect(css).toContain('user-select: text;');
    expect(css).toContain('embed snippets (#41)');
    expect(css).toContain('share URLs (#61)');
  });
});
