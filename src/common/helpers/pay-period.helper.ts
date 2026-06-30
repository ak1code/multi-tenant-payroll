export interface ParsedPayPeriod {
  year: number;
  month: number;
  canonical: string;
  sortKey: number;
}

const PAY_PERIOD_PATTERN = /^(\d{4})-(0?[1-9]|1[0-2])$/;

export function isValidPayPeriod(value: string): boolean {
  return parsePayPeriod(value) !== null;
}

export function parsePayPeriod(value: string): ParsedPayPeriod | null {
  const trimmed = value.trim();
  const match = PAY_PERIOD_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  return {
    year,
    month,
    canonical: `${year}-${month}`,
    sortKey: toSortKey(year, month),
  };
}

export function toSortKey(year: number, month: number): number {
  return year * 100 + month;
}

export function comparePayPeriods(a: string, b: string): number {
  const parsedA = parsePayPeriod(a);
  const parsedB = parsePayPeriod(b);
  if (!parsedA || !parsedB) {
    throw new Error('Invalid pay period for comparison');
  }
  return parsedA.sortKey - parsedB.sortKey;
}
