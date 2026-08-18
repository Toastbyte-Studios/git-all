/**
 * Pure server-side SVG generation for embeddable contribution heatmaps.
 *
 * All colors are hardcoded (no CSS custom properties inherited from the host
 * page) so the SVG is self-contained and renders correctly when fetched by
 * image proxies such as GitHub's camo or embedded in third-party HTML pages.
 *
 * Each palette value is emitted twice: once in an inline `<style>` block keyed
 * on class names, and once as a `fill` presentation attribute on the element
 * itself. CSS beats a presentation attribute wherever stylesheets are honoured,
 * which is what makes the `auto` theme possible — a single file carrying both
 * palettes, switched by `prefers-color-scheme`. The attributes remain as the
 * fallback for renderers that ignore stylesheets entirely (some SVG-to-raster
 * converters, feed readers, email clients).
 *
 * Rules are scoped under a root class rather than bare element selectors,
 * because these SVGs are sometimes pasted inline into an HTML document, where
 * an unscoped `.bg{}` would leak into the host page.
 *
 * LICENSING: the "Powered by GitAll" watermark rendered by this module is
 * subject to an additional attribution term under AGPL section 7(b). See
 * ADDITIONAL_TERMS.md at the repository root.
 */

import type { ContributionData } from '@/lib/types';

export type EmbedTheme = 'dark' | 'light' | 'auto';

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

/**
 * Palette written into the `fill` attributes, used only where CSS is ignored.
 *
 * `auto` falls back to light deliberately: light is also the base palette in
 * the generated stylesheet, so a renderer that honours CSS but not media
 * queries lands on the same colors as one that honours neither.
 */
const FALLBACK_COLORS: Record<EmbedTheme, ThemeColors> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
  auto: LIGHT_THEME,
};

const ROOT_CLASS = 'gitall-heatmap';

const CELL_SIZE = 11;
const CELL_GAP = 2;
const TOTAL = CELL_SIZE + CELL_GAP;
const PADDING_LEFT = 30;
const PADDING_TOP = 20;
const WATERMARK_HEIGHT = 18;
const MAX_LEVEL = 4;

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

/** Class-keyed fill rules for one palette, scoped under the root class. */
function paletteRules(colors: ThemeColors): string {
  const rules = [
    `.${ROOT_CLASS} .bg{fill:${colors.bg}}`,
    `.${ROOT_CLASS} .mut{fill:${colors.textMuted}}`,
    `.${ROOT_CLASS} .wm{fill:${colors.watermarkText}}`,
    `.${ROOT_CLASS} .wl{fill:${colors.watermarkLink}}`,
  ];

  colors.levels.forEach((color, level) => {
    rules.push(`.${ROOT_CLASS} .l${level}{fill:${color}}`);
  });

  return rules.join('');
}

/**
 * Inline stylesheet for the requested theme.
 *
 * `auto` emits the light palette followed by a `prefers-color-scheme: dark`
 * override. Both blocks have identical specificity, so the media block wins on
 * source order when it matches. Note that this follows the *operating system*
 * preference, not the host page's theme: a reader whose OS is dark but who has
 * forced a light theme on the embedding site will still get the dark palette.
 * `theme=light` and `theme=dark` remain available for that case.
 */
function buildStyleBlock(theme: EmbedTheme): string {
  if (theme !== 'auto') {
    const colors = theme === 'light' ? LIGHT_THEME : DARK_THEME;
    return `<style>${paletteRules(colors)}</style>`;
  }

  return (
    `<style>${paletteRules(LIGHT_THEME)}` +
    `@media (prefers-color-scheme:dark){${paletteRules(DARK_THEME)}}` +
    `</style>`
  );
}

function resolveLevel(level: number): number {
  return Number.isInteger(level) && level >= 0 && level <= MAX_LEVEL
    ? level
    : 0;
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
  const theme: EmbedTheme =
    options.theme === 'light' || options.theme === 'auto'
      ? options.theme
      : 'dark';
  const fallback = FALLBACK_COLORS[theme];
  const siteUrl = options.siteUrl ?? 'https://gitall.app';

  const weeks = groupIntoWeeks(data.calendar);
  const monthHeaders = buildMonthHeaders(weeks);

  const gridWidth = weeks.length * TOTAL;
  const svgWidth = PADDING_LEFT + gridWidth;
  const gridHeight = 7 * TOTAL;
  const svgHeight = PADDING_TOP + gridHeight + WATERMARK_HEIGHT;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" class="${ROOT_CLASS}" role="img" aria-label="Contribution heatmap">`,
  );

  parts.push(buildStyleBlock(theme));

  // Background
  parts.push(
    `<rect width="${svgWidth}" height="${svgHeight}" rx="6" class="bg" fill="${fallback.bg}"/>`,
  );

  // Month labels
  for (const m of monthHeaders) {
    const x = PADDING_LEFT + m.col * TOTAL;
    parts.push(
      `<text x="${x}" y="10" class="mut" fill="${fallback.textMuted}" font-size="10" font-family="system-ui,-apple-system,sans-serif">${escapeXml(m.label)}</text>`,
    );
  }

  // Day labels (Mon, Wed, Fri)
  for (let i = 0; i < DAY_ROW_LABELS.length; i++) {
    const row = DAY_ROW_INDICES[i];
    const y = PADDING_TOP + row * TOTAL + CELL_SIZE - 1;
    parts.push(
      `<text x="0" y="${y}" class="mut" fill="${fallback.textMuted}" font-size="9" font-family="system-ui,-apple-system,sans-serif">${DAY_ROW_LABELS[i]}</text>`,
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
      const level = resolveLevel(day.level);

      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" class="l${level}" fill="${fallback.levels[level]}"/>`,
      );
    }
  }

  // Watermark: "Powered by GitAll" — rendered as plain text + a tspan link anchor
  // Note: SVG <a> links are not clickable when served via <img> tags, but the
  // text is still visible as a subtle attribution.
  //
  // This attribution is a required term under AGPL section 7(b); see
  // ADDITIONAL_TERMS.md. Modified versions may repoint `siteUrl` but must not
  // remove or obscure it.
  const watermarkY = PADDING_TOP + gridHeight + WATERMARK_HEIGHT - 4;
  const totalLabel = `${data.totalContributions.toLocaleString()} contribution${data.totalContributions !== 1 ? 's' : ''} · `;
  parts.push(
    `<a href="${escapeXml(siteUrl)}" target="_blank" rel="noopener noreferrer">` +
      `<text x="${svgWidth - 4}" y="${watermarkY}" text-anchor="end" font-size="9" font-family="system-ui,-apple-system,sans-serif">` +
      `<tspan class="wm" fill="${fallback.watermarkText}">${escapeXml(totalLabel)}</tspan>` +
      `<tspan class="wl" fill="${fallback.watermarkLink}">Powered by GitAll</tspan>` +
      `</text>` +
      `</a>`,
  );

  parts.push('</svg>');

  return parts.join('');
}
