import { describe, expect, it } from 'vitest';
import { addDays, assertDayString, compareDays, isDayString, localDay } from './days';

describe('isDayString', () => {
  it.each(['2026-09-27', '2026-01-01', '2026-12-31', '2024-02-29', '2000-02-29'])(
    'accepts the real day %s',
    (day) => {
      expect(isDayString(day)).toBe(true);
    },
  );

  it.each([
    ['a leap day in a normal year', '2023-02-29'],
    ['a leap day in a century year that is not a leap year', '2100-02-29'],
    ['February 30th', '2024-02-30'],
    ['April 31st', '2026-04-31'],
    ['month 13', '2026-13-01'],
    ['day 0', '2026-09-00'],
    ['no zero padding', '2026-9-27'],
    ['a full timestamp', '2026-09-27T00:00:00Z'],
    ['slashes', '2026/09/27'],
    ['an empty string', ''],
  ])('rejects %s', (_label, day) => {
    expect(isDayString(day)).toBe(false);
  });
});

describe('assertDayString', () => {
  it('passes quietly for a real day', () => {
    expect(() => {
      assertDayString('2026-09-27');
    }).not.toThrow();
  });

  it('throws a RangeError that names the bad value', () => {
    expect(() => {
      assertDayString('tomorrow');
    }).toThrow(new RangeError('Expected a day like "2026-09-27", got "tomorrow".'));
  });
});

describe('addDays', () => {
  it('adds and subtracts days', () => {
    expect(addDays('2026-09-27', 1)).toBe('2026-09-28');
    expect(addDays('2026-09-27', 6)).toBe('2026-10-03');
    expect(addDays('2026-09-27', -27)).toBe('2026-08-31');
    expect(addDays('2026-09-27', 0)).toBe('2026-09-27');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('lands on February 29th only in leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
  });

  it('counts a leap year as 366 days', () => {
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01');
    expect(addDays('2023-01-01', 365)).toBe('2024-01-01');
  });

  it('is not thrown off by daylight-saving changes', () => {
    // US clocks spring forward on 2026-03-08 and fall back on 2026-11-01. Local-time math
    // around those dates is where off-by-one-day bugs usually come from.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('rejects a bad day or a fractional count', () => {
    expect(() => addDays('2023-02-29', 1)).toThrow(RangeError);
    expect(() => addDays('2026-09-27', 1.5)).toThrow(
      new RangeError('Days to add must be a whole number, got 1.5.'),
    );
  });
});

describe('compareDays', () => {
  it('orders days from earliest to latest', () => {
    const days = ['2026-10-01', '2025-12-31', '2026-09-27', '2026-09-03'];

    expect(days.toSorted(compareDays)).toEqual([
      '2025-12-31',
      '2026-09-03',
      '2026-09-27',
      '2026-10-01',
    ]);
  });

  it('returns 0 for the same day', () => {
    expect(compareDays('2026-09-27', '2026-09-27')).toBe(0);
  });
});

describe('localDay', () => {
  it("uses the player's own timezone, so late-night practice counts for that evening", () => {
    // Built from local-time parts, so this holds in every timezone the tests might run in.
    expect(localDay(new Date(2026, 8, 27, 23, 59))).toBe('2026-09-27');
    expect(localDay(new Date(2026, 8, 28, 0, 0))).toBe('2026-09-28');
  });

  it('zero-pads months and days', () => {
    expect(localDay(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });

  it('handles leap days', () => {
    expect(localDay(new Date(2024, 1, 29, 8))).toBe('2024-02-29');
  });

  it('throws a RangeError for an invalid Date instead of returning "NaN-NaN-NaN"', () => {
    expect(() => localDay(new Date('not a date'))).toThrow(
      new RangeError('Expected a valid date, got an invalid Date.'),
    );
  });
});
