/**
 * Pure server-side SVG generation for embeddable contribution heatmaps.
 *
 * All colors are hardcoded (no CSS custom properties) so the SVG is
 * self-contained and renders correctly when fetched by image proxies such as
 * GitHub's camo or embedded in third-party HTML pages.
 */

import type { ContributionData } from '@/lib/types';

export type EmbedTheme = 'dark' | 'light';

interface ThemeColors {
  bg: string;
  levels: [string, string, string, string, string];
  textMuted: string;
  watermarkText: string;
  watermarkLink: string;
  border: string;
}

const DARK_THEME: ThemeColors = {
  bg: '#161b22',
  levels: ['#21262d', '#064e3b', '#0d9488', '#2dd4bf', '#5eead4'],
  textMuted: '#484f58',
  watermarkText: '#8b949e',
  watermarkLink: '#2dd4bf',
  border: '#30363d',
};

const LIGHT_THEME: ThemeColors = {
  bg: '#f6f8fa',
  levels: ['#ebedf0', '#b2f0e8', '#2dd4bf', '#0d9488', '#0f766e'],
  textMuted: '#8b949e',
  watermarkText: '#656d76',
  watermarkLink: '#0d9488',
  border: '#d0d7de',
};

const CELL_SIZE = 11;
const CELL_GAP = 2;
const TOTAL = CELL_SIZE + CELL_GAP;
const PADDING_LEFT = 30;
const PADDING_TOP = 20;
const WATERMARK_HEIGHT = 18;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const DAY_ROW_INDICES = [1, 3, 5] as const;
const DAY_ROW_LABELS = ['Mon', 'Wed', 'Fri'];

type CalendarDay = ContributionData['calendar'][number];

interface Week {
  cells: Array<CalendarDay | null>;
}

function groupIntoWeeks(calendar: CalendarDay[]): Week[] {
  if (calendar.length === 0) return [];

  const weeks: Week[] = [];
  let currentCells: Array<CalendarDay | null> = [];

  const firstDate = new Date(calendar[0].date + 'T00:00:00');
  const startDay = firstDate.getDay(); // 0=Sun

  // Pad the first week so Sunday is always column 0
  for (let i = 0; i < startDay; i++) {
    currentCells.push(null);
  }

  for (const day of calendar) {
    const d = new Date(day.date + 'T00:00:00');
    if (d.getDay() === 0 && currentCells.length > 0) {
      weeks.push({ cells: currentCells });
      currentCells = [];
    }
    currentCells.push(day);
  }

  if (currentCells.length > 0) {
    weeks.push({ cells: currentCells });
  }

  return weeks;
}

function buildMonthHeaders(
  weeks: Week[],
): Array<{ label: string; col: number }> {
  const headers: Array<{ label: string; col: number }> = [];
  let lastMonth = -1;

  for (let col = 0; col < weeks.length; col++) {
    const firstDay = weeks[col].cells.find((d) => d !== null);
    if (firstDay) {
      const month = new Date(firstDay.date + 'T00:00:00').getMonth();
      if (month !== lastMonth) {
        headers.push({ label: MONTH_LABELS[month], col });
        lastMonth = month;
      }
    }
  }

  return headers;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface EmbedSvgOptions {
  theme?: EmbedTheme;
  /** Base URL for the "Powered by GitAll" watermark link, e.g. "https://gitall.app" */
  siteUrl?: string;
}

/**
 * Generate a standalone SVG contribution heatmap suitable for embedding in
 * READMEs, portfolio sites, and anywhere that accepts an `<img>` tag.
 */
export function generateHeatmapSvg(
  data: ContributionData,
  options: EmbedSvgOptions = {},
): string {
  const theme = options.theme === 'light' ? LIGHT_THEME : DARK_THEME;
  const siteUrl = options.siteUrl ?? 'https://gitall.app';

  const weeks = groupIntoWeeks(data.calendar);
  const monthHeaders = buildMonthHeaders(weeks);

  const gridWidth = weeks.length * TOTAL;
  const svgWidth = PADDING_LEFT + gridWidth;
  const gridHeight = 7 * TOTAL;
  const svgHeight = PADDING_TOP + gridHeight + WATERMARK_HEIGHT;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="Contribution heatmap">`,
  );

  // Background
  parts.push(
    `<rect width="${svgWidth}" height="${svgHeight}" rx="6" fill="${escapeXml(theme.bg)}"/>`,
  );

  // Month labels
  for (const m of monthHeaders) {
    const x = PADDING_LEFT + m.col * TOTAL;
    parts.push(
      `<text x="${x}" y="12" fill="${escapeXml(theme.textMuted)}" font-size="10" font-family="system-ui,-apple-system,sans-serif">${escapeXml(m.label)}</text>`,
    );
  }

  // Day labels (Mon, Wed, Fri)
  for (let i = 0; i < DAY_ROW_LABELS.length; i++) {
    const row = DAY_ROW_INDICES[i];
    const y = PADDING_TOP + row * TOTAL + CELL_SIZE - 1;
    parts.push(
      `<text x="0" y="${y}" fill="${escapeXml(theme.textMuted)}" font-size="9" font-family="system-ui,-apple-system,sans-serif">${DAY_ROW_LABELS[i]}</text>`,
    );
  }

  // Grid cells
  for (let col = 0; col < weeks.length; col++) {
    const week = weeks[col];
    for (let row = 0; row < week.cells.length; row++) {
      const day = week.cells[row];
      if (!day) continue;

      const x = PADDING_LEFT + col * TOTAL;
      const y = PADDING_TOP - 2 + row * TOTAL;
      const fill = theme.levels[day.level] ?? theme.levels[0];

      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${escapeXml(fill)}"/>`,
      );
    }
  }

  // Watermark: "Powered by GitAll" — rendered as plain text + a tspan link anchor
  // Note: SVG <a> links are not clickable when served via <img> tags, but the
  // text is still visible as a subtle attribution.
  const watermarkY = PADDING_TOP + gridHeight + WATERMARK_HEIGHT - 4;
  const totalLabel = `${data.totalContributions.toLocaleString()} contribution${data.totalContributions !== 1 ? 's' : ''} · `;
  parts.push(
    `<a href="${escapeXml(siteUrl)}" target="_blank" rel="noopener noreferrer">` +
      `<text x="${svgWidth - 4}" y="${watermarkY}" text-anchor="end" font-size="9" font-family="system-ui,-apple-system,sans-serif">` +
      `<tspan fill="${escapeXml(theme.watermarkText)}">${escapeXml(totalLabel)}</tspan>` +
      `<tspan fill="${escapeXml(theme.watermarkLink)}">Powered by GitAll</tspan>` +
      `</text>` +
      `</a>`,
  );

  parts.push('</svg>');

  return parts.join('');
}
