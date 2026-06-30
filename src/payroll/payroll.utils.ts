import { isValidPayPeriod, parsePayPeriod } from '../common/helpers/pay-period.helper';

export interface CsvRow {
  employeeId?: string;
  amount?: string;
  payPeriod?: string;
}

export interface RowValidationContext {
  tenantId: string;
  seenKeys: Set<string>;
  employeeExists: (employeeId: string) => Promise<boolean>;
  getEmployee?: (employeeId: string) => Promise<{
    _id: { toString: () => string };
    name: string;
    supervisorId: { toString: () => string };
  } | null>;
}

export interface RowValidationResult {
  valid: boolean;
  reason?: string;
  parsed?: {
    employeeId: string;
    amount: number;
    payPeriod: string;
    payPeriodSort: number;
  };
}

export { isValidPayPeriod };

export async function validateRow(
  row: CsvRow,
  context: RowValidationContext,
): Promise<RowValidationResult> {
  const employeeId = row.employeeId?.trim();
  const amountStr = row.amount?.trim();
  const payPeriodStr = row.payPeriod?.trim();

  if (!employeeId) {
    return { valid: false, reason: 'Missing employeeId' };
  }

  if (!amountStr) {
    return { valid: false, reason: 'Missing amount' };
  }

  if (!payPeriodStr) {
    return { valid: false, reason: 'Missing payPeriod' };
  }

  const amount = Number(amountStr);
  if (Number.isNaN(amount) || amount <= 0) {
    return { valid: false, reason: 'Invalid amount' };
  }

  const parsedPayPeriod = parsePayPeriod(payPeriodStr);
  if (!parsedPayPeriod) {
    return { valid: false, reason: 'Invalid payPeriod format' };
  }

  const duplicateKey = `${employeeId}:${parsedPayPeriod.canonical}`;
  if (context.seenKeys.has(duplicateKey)) {
    return { valid: false, reason: 'Duplicate row in batch' };
  }

  const exists = await context.employeeExists(employeeId);
  if (!exists) {
    return { valid: false, reason: 'Employee not found' };
  }

  context.seenKeys.add(duplicateKey);

  return {
    valid: true,
    parsed: {
      employeeId,
      amount,
      payPeriod: parsedPayPeriod.canonical,
      payPeriodSort: parsedPayPeriod.sortKey,
    },
  };
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: number }).code === 11000
  );
}

export function computeBatchStatus(batch: {
  pending: number;
  processing: number;
  retrying: number;
  deadLettered: number;
}): 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_FAILED' {
  if (batch.pending + batch.processing + batch.retrying > 0) {
    return 'PROCESSING';
  }
  return batch.deadLettered > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED';
}

/** True when the current attempt exhausts max retries (job should dead-letter, not retry). */
export function shouldDeadLetter(attemptsMade: number, maxAttempts: number): boolean {
  return attemptsMade >= maxAttempts;
}
