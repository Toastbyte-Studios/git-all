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

  it('escapes XML in username and data', () => {
    const xssData: ContributionData = {
      ...SAMPLE_DATA,
      username: '<script>alert("xss")</script>',
    };
    const svg = generateHeatmapSvg(xssData);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert("xss")');
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
