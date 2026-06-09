import { describe, it, expect } from 'vitest';
import {
  isContributionPeriod,
  getTodayUtc,
  formatUtcDate,
  parseDateInput,
  getContributionDateRange,
  normalizeCustomDateRange,
  normalizeRequestedContributionRange,
  isRangeWithinOneYear,
  getPeriodSelectionFromSearchParams,
  toStartOfDayIso,
  toExclusiveUpperBoundIso,
  DEFAULT_CONTRIBUTION_PERIOD,
  CONTRIBUTION_PERIOD_OPTIONS,
} from '../contribution-period';

// Fixed reference date for deterministic tests: 2024-06-15
const TODAY = new Date(Date.UTC(2024, 5, 15)); // June 15, 2024

describe('isContributionPeriod', () => {
  it('returns true for all valid period values', () => {
    for (const { value } of CONTRIBUTION_PERIOD_OPTIONS) {
      expect(isContributionPeriod(value)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isContributionPeriod('monthly')).toBe(false);
    expect(isContributionPeriod('quarterly')).toBe(false);
    expect(isContributionPeriod('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isContributionPeriod(null)).toBe(false);
  });
});

describe('getTodayUtc', () => {
  it('returns a Date with time zeroed to midnight UTC', () => {
    const today = getTodayUtc();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });
});

describe('formatUtcDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(formatUtcDate(new Date(Date.UTC(2024, 0, 1)))).toBe('2024-01-01');
    expect(formatUtcDate(new Date(Date.UTC(2023, 11, 31)))).toBe('2023-12-31');
  });

  it('zero-pads month and day', () => {
    expect(formatUtcDate(new Date(Date.UTC(2024, 2, 5)))).toBe('2024-03-05');
  });
});

describe('parseDateInput', () => {
  it('parses a valid YYYY-MM-DD string', () => {
    const result = parseDateInput('2024-06-15');
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBe(2024);
    expect(result!.getUTCMonth()).toBe(5);
    expect(result!.getUTCDate()).toBe(15);
  });

  it('returns null for null input', () => {
    expect(parseDateInput(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDateInput('')).toBeNull();
  });

  it('returns null for wrong format', () => {
    expect(parseDateInput('06/15/2024')).toBeNull();
    expect(parseDateInput('2024-6-15')).toBeNull();
    expect(parseDateInput('20240615')).toBeNull();
  });

  it('returns null for invalid calendar dates', () => {
    expect(parseDateInput('2024-02-30')).toBeNull();
    expect(parseDateInput('2024-13-01')).toBeNull();
    expect(parseDateInput('2024-00-01')).toBeNull();
  });

  it('handles leap day correctly', () => {
    expect(parseDateInput('2024-02-29')).not.toBeNull(); // 2024 is leap year
    expect(parseDateInput('2023-02-29')).toBeNull(); // 2023 is not
  });
});

describe('getContributionDateRange', () => {
  it('last-12-months: from is 1 year ago + 1 day, to is today', () => {
    const range = getContributionDateRange('last-12-months', TODAY);
    expect(range.from).toBe('2023-06-16'); // June 15 2023 + 1 day
    expect(range.to).toBe('2024-06-15');
  });

  it('ytd: from is Jan 1 of current year', () => {
    const range = getContributionDateRange('ytd', TODAY);
    expect(range.from).toBe('2024-01-01');
    expect(range.to).toBe('2024-06-15');
  });

  it('last-6-months: from is 6 calendar months ago', () => {
    const range = getContributionDateRange('last-6-months', TODAY);
    expect(range.from).toBe('2023-12-15');
    expect(range.to).toBe('2024-06-15');
  });

  it('last-3-months: from is 3 calendar months ago', () => {
    const range = getContributionDateRange('last-3-months', TODAY);
    expect(range.from).toBe('2024-03-15');
    expect(range.to).toBe('2024-06-15');
  });

  it('last-30-days: from is 29 days ago (30-day inclusive range)', () => {
    const range = getContributionDateRange('last-30-days', TODAY);
    expect(range.from).toBe('2024-05-17'); // June 15 - 29 days
    expect(range.to).toBe('2024-06-15');
  });

  it('last-year: full previous calendar year', () => {
    const range = getContributionDateRange('last-year', TODAY);
    expect(range.from).toBe('2023-01-01');
    expect(range.to).toBe('2023-12-31');
  });

  it('custom: throws an error', () => {
    expect(() => getContributionDateRange('custom', TODAY)).toThrow(
      'Custom ranges must be supplied explicitly.',
    );
  });

  it('last-6-months clamps to last day of month when source day does not exist', () => {
    // Aug 31 - 6 months = Feb 31 → clamp to Feb 28/29
    const aug31 = new Date(Date.UTC(2023, 7, 31));
    const range = getContributionDateRange('last-6-months', aug31);
    expect(range.from).toBe('2023-02-28');
  });

  it('last-3-months clamps for month-end edge case', () => {
    const may31 = new Date(Date.UTC(2024, 4, 31));
    const range = getContributionDateRange('last-3-months', may31);
    // Feb only has 29 days in 2024 (leap year)
    expect(range.from).toBe('2024-02-29');
  });
});

describe('normalizeCustomDateRange', () => {
  it('returns a valid range for valid inputs', () => {
    const range = normalizeCustomDateRange('2024-01-01', '2024-06-01');
    expect(range).toEqual({ from: '2024-01-01', to: '2024-06-01' });
  });

  it('returns null when from > to', () => {
    expect(normalizeCustomDateRange('2024-06-01', '2024-01-01')).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(normalizeCustomDateRange('not-a-date', '2024-06-01')).toBeNull();
    expect(normalizeCustomDateRange('2024-01-01', 'bad')).toBeNull();
  });

  it('returns null for null inputs', () => {
    expect(normalizeCustomDateRange(null, null)).toBeNull();
    expect(normalizeCustomDateRange('2024-01-01', null)).toBeNull();
  });

  it('allows same-day range (from === to)', () => {
    const range = normalizeCustomDateRange('2024-03-15', '2024-03-15');
    expect(range).toEqual({ from: '2024-03-15', to: '2024-03-15' });
  });
});

describe('isRangeWithinOneYear', () => {
  it('returns true for a range exactly under 1 year', () => {
    expect(isRangeWithinOneYear({ from: '2023-06-16', to: '2024-06-15' })).toBe(
      true,
    );
  });

  it('returns true for a short range', () => {
    expect(isRangeWithinOneYear({ from: '2024-01-01', to: '2024-01-31' })).toBe(
      true,
    );
  });

  it('returns false for a range spanning exactly 1 year (from not > toDate-1year)', () => {
    // from === toDate - 1 year → not strictly greater → false
    expect(isRangeWithinOneYear({ from: '2023-06-15', to: '2024-06-15' })).toBe(
      false,
    );
  });

  it('returns false for a range spanning more than 1 year', () => {
    expect(isRangeWithinOneYear({ from: '2022-01-01', to: '2024-06-15' })).toBe(
      false,
    );
  });

  it('returns false for invalid date strings', () => {
    expect(isRangeWithinOneYear({ from: 'bad', to: '2024-06-15' })).toBe(false);
  });
});

describe('normalizeRequestedContributionRange', () => {
  it('returns default range when both from and to are null', () => {
    const result = normalizeRequestedContributionRange(null, null, {
      today: TODAY,
    });
    expect(result).toEqual({ from: '2023-06-16', to: '2024-06-15' });
  });

  it('returns the custom range when valid and within 1 year', () => {
    const result = normalizeRequestedContributionRange(
      '2024-01-01',
      '2024-06-01',
      { today: TODAY },
    );
    expect(result).toEqual({ from: '2024-01-01', to: '2024-06-01' });
  });

  it('returns error for invalid date strings', () => {
    const result = normalizeRequestedContributionRange('bad', '2024-06-01', {
      today: TODAY,
    });
    expect(result).toHaveProperty('error');
  });

  it('returns error for range > 1 year', () => {
    const result = normalizeRequestedContributionRange(
      '2022-01-01',
      '2024-06-01',
      { today: TODAY },
    );
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/1 year/i);
  });

  it('uses custom error messages when provided', () => {
    const result = normalizeRequestedContributionRange('bad', null, {
      invalidRangeError: 'MY_INVALID',
    });
    expect((result as { error: string }).error).toBe('MY_INVALID');
  });

  it('uses custom rangeTooLargeError when provided', () => {
    const result = normalizeRequestedContributionRange(
      '2020-01-01',
      '2024-01-01',
      {
        rangeTooLargeError: 'TOO_LARGE',
      },
    );
    expect((result as { error: string }).error).toBe('TOO_LARGE');
  });
});

describe('getPeriodSelectionFromSearchParams', () => {
  function makeParams(pairs: Record<string, string>) {
    return {
      get: (key: string) => pairs[key] ?? null,
    };
  }

  it('returns custom period when valid from/to are present', () => {
    const result = getPeriodSelectionFromSearchParams(
      makeParams({ from: '2024-01-01', to: '2024-06-01' }),
    );
    expect(result.period).toBe('custom');
    expect(result.customFrom).toBe('2024-01-01');
    expect(result.customTo).toBe('2024-06-01');
  });

  it('returns named period when present and valid', () => {
    const result = getPeriodSelectionFromSearchParams(
      makeParams({ period: 'ytd' }),
    );
    expect(result.period).toBe('ytd');
    expect(result.customFrom).toBe('');
    expect(result.customTo).toBe('');
  });

  it('ignores "custom" as a period param (requires actual dates)', () => {
    const result = getPeriodSelectionFromSearchParams(
      makeParams({ period: 'custom' }),
    );
    expect(result.period).toBe(DEFAULT_CONTRIBUTION_PERIOD);
  });

  it('falls back to default when no relevant params', () => {
    const result = getPeriodSelectionFromSearchParams(makeParams({}));
    expect(result.period).toBe(DEFAULT_CONTRIBUTION_PERIOD);
    expect(result.customFrom).toBe('');
    expect(result.customTo).toBe('');
  });

  it('ignores invalid period string and falls back to default', () => {
    const result = getPeriodSelectionFromSearchParams(
      makeParams({ period: 'monthly' }),
    );
    expect(result.period).toBe(DEFAULT_CONTRIBUTION_PERIOD);
  });
});

describe('toStartOfDayIso', () => {
  it('appends T00:00:00.000Z to a date string', () => {
    expect(toStartOfDayIso('2024-06-15')).toBe('2024-06-15T00:00:00.000Z');
  });
});

describe('toExclusiveUpperBoundIso', () => {
  it('returns the start of the next day as ISO string', () => {
    const result = toExclusiveUpperBoundIso('2024-06-15');
    expect(result).toBe('2024-06-16T00:00:00.000Z');
  });

  it('handles month boundaries', () => {
    const result = toExclusiveUpperBoundIso('2024-01-31');
    expect(result).toBe('2024-02-01T00:00:00.000Z');
  });

  it('handles year boundaries', () => {
    const result = toExclusiveUpperBoundIso('2023-12-31');
    expect(result).toBe('2024-01-01T00:00:00.000Z');
  });

  it('handles leap day boundary', () => {
    const result = toExclusiveUpperBoundIso('2024-02-29');
    expect(result).toBe('2024-03-01T00:00:00.000Z');
  });
});
