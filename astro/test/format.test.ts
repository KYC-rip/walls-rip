import { describe, expect, it } from 'vitest';
import {
  dataMatches,
  durationMatches,
  formatData,
  formatDays,
  formatUsd,
  parseDataFilter,
  parseDurationFilter,
} from '../src/lib/data';

describe('formatData', () => {
  it('shows sub-1GB plans in MB', () => {
    expect(formatData(0.09765625)).toBe('98MB');
    expect(formatData(0.5)).toBe('500MB');
  });

  it('keeps whole GB integral and rounds fractional GB', () => {
    expect(formatData(1)).toBe('1GB');
    expect(formatData(20)).toBe('20GB');
    expect(formatData(1.5)).toBe('1.5GB');
  });

  it('never renders NaN', () => {
    expect(formatData(Number.NaN)).toBe('');
  });
});

describe('formatDays / formatUsd', () => {
  it('uses the singular for one day', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(7)).toBe('7 days');
  });

  it('formats prices to cents and dashes missing values', () => {
    expect(formatUsd(1)).toBe('$1.00');
    expect(formatUsd(0.5)).toBe('$0.50');
    expect(formatUsd(null)).toBe('—');
  });
});

describe('filters', () => {
  it('parses known filters and falls back to all', () => {
    expect(parseDataFilter('20plus')).toBe('20plus');
    expect(parseDataFilter('nonsense')).toBe('all');
    expect(parseDataFilter(null)).toBe('all');
    expect(parseDurationFilter('le7')).toBe('le7');
    expect(parseDurationFilter('')).toBe('all');
  });

  it('matches data bands without gaps', () => {
    expect(dataMatches('lt1', 0.5)).toBe(true);
    expect(dataMatches('lt1', 1)).toBe(false);
    expect(dataMatches('1to5', 5)).toBe(true);
    expect(dataMatches('5to20', 5)).toBe(false);
    expect(dataMatches('5to20', 20)).toBe(true);
    expect(dataMatches('20plus', 20.5)).toBe(true);
  });

  it('matches duration bands without gaps', () => {
    expect(durationMatches('le7', 7)).toBe(true);
    expect(durationMatches('le7', 8)).toBe(false);
    expect(durationMatches('8to15', 8)).toBe(true);
    expect(durationMatches('16to30', 30)).toBe(true);
    expect(durationMatches('gt30', 31)).toBe(true);
  });
});
