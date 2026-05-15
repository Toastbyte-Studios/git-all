'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContributionData } from '@/lib/types';

interface ContributionGridProps {
  data: ContributionData;
  colorKey: string;
}

const CELL_SIZE = 11;
const CELL_GAP = 2;
const TOTAL = CELL_SIZE + CELL_GAP;
const DAY_LABELS = ['Mon', 'Wed', 'Fri'];
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

const COLOR_KEY_PREFIX: Record<string, string> = {
  github: 'level',
  gitlab: 'gl-level',
  bitbucket: 'bb-level',
  gitea: 'gt-level',
  integrated: 'ga-level',
};

function getLevelColor(level: number, colorKey: string): string {
  const prefix = COLOR_KEY_PREFIX[colorKey] ?? 'level';
  return `var(--${prefix}-${level})`;
}

export function ContributionGrid({ data, colorKey }: ContributionGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
    // Use stable primitive fields instead of the object reference so the
    // effect doesn't re-fire on every render when the parent recreates the
    // ContributionData object (e.g. the integrated view's mergeAllContributions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.platform,
    data.username,
    data.totalContributions,
    data.dateRange.from,
    data.dateRange.to,
  ]);

  const { weeks, monthHeaders } = useMemo(() => {
    const calendar = data.calendar;
    if (calendar.length === 0) return { weeks: [], monthHeaders: [] };

    // Group days into weeks (columns), starting on Sunday
    const grouped: Array<Array<(typeof calendar)[0] | null>> = [];
    let currentWeek: Array<(typeof calendar)[0] | null> = [];

    const firstDate = new Date(calendar[0].date + 'T00:00:00');
    const startDay = firstDate.getDay(); // 0=Sun

    // Pad the first week
    for (let i = 0; i < startDay; i++) {
      currentWeek.push(null);
    }

    for (const day of calendar) {
      const d = new Date(day.date + 'T00:00:00');
      if (d.getDay() === 0 && currentWeek.length > 0) {
        grouped.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    }
    if (currentWeek.length > 0) {
      grouped.push(currentWeek);
    }

    // Build month headers
    const headers: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;
    for (let col = 0; col < grouped.length; col++) {
      const firstDay = grouped[col].find((d) => d !== null);
      if (firstDay) {
        const month = new Date(firstDay.date + 'T00:00:00').getMonth();
        if (month !== lastMonth) {
          headers.push({ label: MONTH_LABELS[month], col });
          lastMonth = month;
        }
      }
    }

    return { weeks: grouped, monthHeaders: headers };
  }, [data.calendar]);

  const svgWidth = weeks.length * TOTAL + 30;
  const svgHeight = 7 * TOTAL + 20;

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto rounded-lg p-4 w-fit max-w-full mx-auto"
      style={{ backgroundColor: 'var(--bg-surface)' }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="block"
      >
        {/* Month labels */}
        {monthHeaders.map((m, i) => (
          <text
            key={i}
            x={30 + m.col * TOTAL}
            y={10}
            fill="var(--text-muted)"
            fontSize={10}
          >
            {m.label}
          </text>
        ))}

        {/* Day labels */}
        {DAY_LABELS.map((label, i) => {
          const row = [1, 3, 5][i];
          return (
            <text
              key={label}
              x={0}
              y={20 + row * TOTAL + CELL_SIZE - 1}
              fill="var(--text-muted)"
              fontSize={9}
            >
              {label}
            </text>
          );
        })}

        {/* Grid cells */}
        {weeks.map((week, col) =>
          week.map((day, row) => {
            if (!day) return null;
            const x = 30 + col * TOTAL;
            const y = 18 + row * TOTAL;
            return (
              <rect
                key={day.date}
                x={x}
                y={y}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                fill={getLevelColor(day.level, colorKey)}
                className="transition-colors"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    text: `${day.count} contribution${day.count !== 1 ? 's' : ''} on ${day.date}`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          }),
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 rounded text-xs font-medium pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
