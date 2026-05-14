export type ContributionPeriod =
  | 'last-12-months'
  | 'ytd'
  | 'last-6-months'
  | 'last-3-months'
  | 'last-30-days'
  | 'last-year'
  | 'custom';

export interface ContributionDateRange {
  from: string;
  to: string;
}

export const DEFAULT_CONTRIBUTION_PERIOD: ContributionPeriod = 'last-12-months';

export const CONTRIBUTION_PERIOD_OPTIONS: Array<{
  value: ContributionPeriod;
  label: string;
}> = [
  { value: 'last-12-months', label: 'Last 12 months' },
  { value: 'ytd', label: 'YTD' },
  { value: 'last-6-months', label: 'Last 6 months' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'last-year', label: 'Last year' },
  { value: 'custom', label: 'Custom' },
];

type SearchParamsLike = {
  get(name: string): string | null;
};

export function isContributionPeriod(
  value: string | null,
): value is ContributionPeriod {
  return CONTRIBUTION_PERIOD_OPTIONS.some((option) => option.value === value);
}

export function getTodayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseDateInput(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function addUtcDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function getDaysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcMonths(date: Date, amount: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + amount;
  const day = date.getUTCDate();
  const base = new Date(Date.UTC(year, month, 1));
  const maxDay = getDaysInUtcMonth(base.getUTCFullYear(), base.getUTCMonth());
  base.setUTCDate(Math.min(day, maxDay));
  return base;
}

function addUtcYears(date: Date, amount: number) {
  const year = date.getUTCFullYear() + amount;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const base = new Date(Date.UTC(year, month, 1));
  const maxDay = getDaysInUtcMonth(base.getUTCFullYear(), base.getUTCMonth());
  base.setUTCDate(Math.min(day, maxDay));
  return base;
}

export function getContributionDateRange(
  period: ContributionPeriod,
  today = getTodayUtc(),
): ContributionDateRange {
  // Calendar-based month/year presets preserve the same day-of-month when
  // possible and otherwise clamp to the last valid day in the target month.
  switch (period) {
    case 'ytd':
      return {
        from: formatUtcDate(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
        to: formatUtcDate(today),
      };
    case 'last-6-months':
      return {
        from: formatUtcDate(addUtcMonths(today, -6)),
        to: formatUtcDate(today),
      };
    case 'last-3-months':
      return {
        from: formatUtcDate(addUtcMonths(today, -3)),
        to: formatUtcDate(today),
      };
    case 'last-30-days':
      return {
        // Include today plus the preceding 29 days for a 30-day inclusive range.
        from: formatUtcDate(addUtcDays(today, -29)),
        to: formatUtcDate(today),
      };
    case 'last-year': {
      const lastYear = today.getUTCFullYear() - 1;
      return {
        from: formatUtcDate(new Date(Date.UTC(lastYear, 0, 1))),
        to: formatUtcDate(new Date(Date.UTC(lastYear, 11, 31))),
      };
    }
    case 'custom':
      throw new Error('Custom ranges must be supplied explicitly.');
    case 'last-12-months':
    default:
      return {
        from: formatUtcDate(addUtcYears(today, -1)),
        to: formatUtcDate(today),
      };
  }
}

export function normalizeCustomDateRange(
  from: string | null,
  to: string | null,
): ContributionDateRange | null {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);

  if (!fromDate || !toDate || fromDate > toDate) {
    return null;
  }

  return {
    from: formatUtcDate(fromDate),
    to: formatUtcDate(toDate),
  };
}

export function isRangeWithinOneYear(range: ContributionDateRange) {
  const fromDate = parseDateInput(range.from);
  const toDate = parseDateInput(range.to);

  if (!fromDate || !toDate || fromDate > toDate) {
    return false;
  }

  return fromDate >= addUtcYears(toDate, -1);
}

export function getPeriodSelectionFromSearchParams(
  searchParams: SearchParamsLike,
) {
  const customRange = normalizeCustomDateRange(
    searchParams.get('from'),
    searchParams.get('to'),
  );

  if (customRange) {
    return {
      period: 'custom' as ContributionPeriod,
      customFrom: customRange.from,
      customTo: customRange.to,
    };
  }

  const rawPeriod = searchParams.get('period');
  if (isContributionPeriod(rawPeriod) && rawPeriod !== 'custom') {
    return {
      period: rawPeriod,
      customFrom: '',
      customTo: '',
    };
  }

  return {
    period: DEFAULT_CONTRIBUTION_PERIOD,
    customFrom: '',
    customTo: '',
  };
}

export function toStartOfDayIso(date: string) {
  return `${date}T00:00:00.000Z`;
}
