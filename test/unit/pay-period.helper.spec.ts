import {
  comparePayPeriods,
  isValidPayPeriod,
  parsePayPeriod,
  toSortKey,
} from '../../src/common/helpers/pay-period.helper';

describe('pay-period.helper', () => {
  describe('parsePayPeriod', () => {
    it('parses unpadded month', () => {
      expect(parsePayPeriod('2024-1')).toEqual({
        year: 2024,
        month: 1,
        canonical: '2024-1',
        sortKey: 202401,
      });
    });

    it('parses padded month and normalizes to canonical', () => {
      expect(parsePayPeriod('2024-01')).toEqual({
        year: 2024,
        month: 1,
        canonical: '2024-1',
        sortKey: 202401,
      });
    });

    it('parses double-digit month', () => {
      expect(parsePayPeriod('2024-12')).toEqual({
        year: 2024,
        month: 12,
        canonical: '2024-12',
        sortKey: 202412,
      });
    });

    it('rejects invalid month', () => {
      expect(parsePayPeriod('2024-13')).toBeNull();
      expect(parsePayPeriod('2024-0')).toBeNull();
    });

    it('rejects date format', () => {
      expect(parsePayPeriod('2025-06-01')).toBeNull();
    });

    it('rejects non-date strings', () => {
      expect(parsePayPeriod('not-a-date')).toBeNull();
    });
  });

  describe('isValidPayPeriod', () => {
    it('accepts valid formats', () => {
      expect(isValidPayPeriod('2024-1')).toBe(true);
      expect(isValidPayPeriod('2024-12')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidPayPeriod('01-15-2025')).toBe(false);
    });
  });

  describe('toSortKey', () => {
    it('computes sort key', () => {
      expect(toSortKey(2024, 1)).toBe(202401);
      expect(toSortKey(2025, 2)).toBe(202502);
    });
  });

  describe('comparePayPeriods', () => {
    it('orders cross-year ranges correctly', () => {
      expect(comparePayPeriods('2024-11', '2025-2')).toBeLessThan(0);
      expect(comparePayPeriods('2025-2', '2024-11')).toBeGreaterThan(0);
    });
  });
});
