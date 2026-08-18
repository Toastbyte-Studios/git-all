import { describe, expect, it } from 'vitest';
import { generateHeatmapSvg } from '../embed-svg';
import type { ContributionData } from '../types';

function makeCalendar(
  from: string,
  days: number,
): ContributionData['calendar'] {
  const result: ContributionData['calendar'] = [];
  const cursor = new Date(from + 'T00:00:00Z');
  for (let i = 0; i < days; i++) {
    const date = cursor.toISOString().slice(0, 10);
    result.push({ date, count: i % 5, level: i % 5 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

const SAMPLE_DATA: ContributionData = {
  platform: 'github',
  username: 'octocat',
  totalContributions: 42,
  dateRange: { from: '2025-01-01', to: '2025-01-07' },
  calendar: makeCalendar('2025-01-01', 7),
};

const PALETTE_THEMES = ['light', 'dark'] as const;
const LEVELS = [0, 1, 2, 3, 4];

/** Read the fill a class resolves to in the SVG's own stylesheet. */
function fillFor(svg: string, className: string): string {
  const rule = svg.match(
    new RegExp(`\\.${className}\\{fill:(#[0-9a-f]{6})\\}`),
  );
  if (!rule) throw new Error(`no rule found for .${className}`);
  return rule[1];
}

function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('generateHeatmapSvg', () => {
  it('returns a well-formed SVG string', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes width and height attributes', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).toMatch(/height="\d+"/);
  });

  it('includes a background rect', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toContain('<rect width=');
    expect(svg).toContain('rx="6"');
  });

  it('renders grid cells for each calendar day', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    // Each non-null day gets a <rect> with rx="2"
    const cellMatches = svg.match(/rx="2"/g);
    // 7 days in a single week; some may be null-padded — count actual rect cells
    expect(cellMatches).not.toBeNull();
    expect((cellMatches ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('includes month labels', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toContain('Jan');
  });

  it('includes day-of-week labels', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toContain('Mon');
    expect(svg).toContain('Wed');
    expect(svg).toContain('Fri');
  });

  it('includes the "Powered by GitAll" watermark', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toContain('Powered by GitAll');
  });

  it('includes the contribution count in the watermark', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toContain('42');
  });

  it('uses the siteUrl in the watermark link', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA, {
      siteUrl: 'https://example.com',
    });
    expect(svg).toContain('https://example.com');
  });

  it('uses dark theme colors by default', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    // Dark background
    expect(svg).toContain('#161b22');
  });

  it('uses light theme colors when requested', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA, { theme: 'light' });
    // Light background
    expect(svg).toContain('#f6f8fa');
    // Should NOT contain dark background
    expect(svg).not.toContain('#161b22');
  });

  it('scopes its stylesheet under a root class', () => {
    // Unscoped rules would leak if the SVG is pasted inline into a page.
    const svg = generateHeatmapSvg(SAMPLE_DATA);
    expect(svg).toContain('class="gitall-heatmap"');
    expect(svg).toContain('.gitall-heatmap .bg{');
  });

  it('carries both palettes when the theme is auto', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA, { theme: 'auto' });
    expect(svg).toContain('#f6f8fa');
    expect(svg).toContain('#161b22');
    expect(svg).toContain('@media (prefers-color-scheme:dark)');
  });

  it('falls back to the light palette in auto fill attributes', () => {
    // Renderers that ignore CSS entirely get the same palette as renderers
    // that honour CSS but not media queries.
    const svg = generateHeatmapSvg(SAMPLE_DATA, { theme: 'auto' });
    expect(svg).toContain('class="bg" fill="#f6f8fa"');
  });

  it('emits no media query for a single-palette theme', () => {
    const dark = generateHeatmapSvg(SAMPLE_DATA, { theme: 'dark' });
    const light = generateHeatmapSvg(SAMPLE_DATA, { theme: 'light' });
    expect(dark).not.toContain('@media');
    expect(light).not.toContain('@media');
  });

  it.each(PALETTE_THEMES)(
    'gives the %s ramp five distinct, monotonic levels',
    (theme) => {
      const svg = generateHeatmapSvg(SAMPLE_DATA, { theme });
      const levels = LEVELS.map((level) => fillFor(svg, `l${level}`));
      expect(new Set(levels).size).toBe(5);

      // Light ramps darken as activity rises; dark ramps brighten. Either way
      // no two adjacent steps may sit at the same luminance, or the busiest
      // and quietest days become indistinguishable.
      const luminances = levels.map(relativeLuminance);
      for (let i = 1; i < luminances.length; i++) {
        if (theme === 'light') {
          expect(luminances[i]).toBeLessThan(luminances[i - 1]);
        } else {
          expect(luminances[i]).toBeGreaterThan(luminances[i - 1]);
        }
      }
    },
  );

  it.each(PALETTE_THEMES)('clears WCAG AA for every %s text color', (theme) => {
    const svg = generateHeatmapSvg(SAMPLE_DATA, { theme });
    const background = fillFor(svg, 'bg');
    // Month/day labels render at 9-10px, so AA normal text (4.5:1) applies
    // rather than the 3:1 large-text allowance.
    for (const className of ['mut', 'wm', 'wl']) {
      const ratio = contrastRatio(fillFor(svg, className), background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('escapes XML special characters in the siteUrl watermark link', () => {
    const svg = generateHeatmapSvg(SAMPLE_DATA, {
      siteUrl: 'https://example.com/?a=1&b=2&q=<script>',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
  });

  it('produces an SVG with a non-zero positive width and height for a full year', () => {
    const yearCalendar = makeCalendar('2024-01-01', 365);
    const data: ContributionData = {
      ...SAMPLE_DATA,
      totalContributions: 1000,
      dateRange: { from: '2024-01-01', to: '2024-12-31' },
      calendar: yearCalendar,
    };
    const svg = generateHeatmapSvg(data);
    const widthMatch = svg.match(/width="(\d+)"/);
    const heightMatch = svg.match(/height="(\d+)"/);
    expect(widthMatch).not.toBeNull();
    expect(heightMatch).not.toBeNull();
    const width = parseInt(widthMatch![1], 10);
    const height = parseInt(heightMatch![1], 10);
    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThan(50);
  });

  it('returns a valid SVG for an empty calendar', () => {
    const emptyData: ContributionData = {
      ...SAMPLE_DATA,
      totalContributions: 0,
      calendar: [],
    };
    const svg = generateHeatmapSvg(emptyData);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toMatch(/<\/svg>$/);
  });
});
