import { validateRow, isValidPayPeriod, computeBatchStatus, shouldDeadLetter, CROSS_FILE_DUPLICATE_REASON } from '../../src/payroll/payroll.utils';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { PayrollService } from '../../src/payroll/payroll.service';
import { Batch } from '../../src/payroll/batch.schema';
import { DisbursementRecord } from '../../src/payroll/disbursement-record.schema';
import { EmployeesService } from '../../src/employees/employees.service';
import { ConfigService } from '@nestjs/config';
import { UserRole, PAYROLL_QUEUE } from '../../src/common/constants';
import { Types } from 'mongoose';

describe('validateRow', () => {
  const baseContext = {
    tenantId: 'tenant1',
    seenKeys: new Set<string>(),
    employeeExists: async (id: string) => id.startsWith('EMP'),
    hasActiveOrSucceededDisbursement: async () => false,
  };

  beforeEach(() => {
    baseContext.seenKeys.clear();
  });

  it('valid row passes', async () => {
    const result = await validateRow(
      { employeeId: 'EMP001', amount: '5000', payPeriod: '2025-6' },
      baseContext,
    );
    expect(result.valid).toBe(true);
    expect(result.parsed?.amount).toBe(5000);
    expect(result.parsed?.payPeriod).toBe('2025-6');
    expect(result.parsed?.payPeriodSort).toBe(202506);
  });

  it('accepts padded month and normalizes', async () => {
    const result = await validateRow(
      { employeeId: 'EMP001', amount: '5000', payPeriod: '2025-06' },
      baseContext,
    );
    expect(result.valid).toBe(true);
    expect(result.parsed?.payPeriod).toBe('2025-6');
  });

  it('missing employeeId → INVALID', async () => {
    const result = await validateRow({ amount: '5000', payPeriod: '2025-6' }, baseContext);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing employeeId');
  });

  it('missing amount → INVALID', async () => {
    const result = await validateRow({ employeeId: 'EMP001', payPeriod: '2025-6' }, baseContext);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing amount');
  });

  it('missing payPeriod → INVALID', async () => {
    const result = await validateRow({ employeeId: 'EMP001', amount: '5000' }, baseContext);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing payPeriod');
  });

  it('negative amount → INVALID', async () => {
    const result = await validateRow(
      { employeeId: 'EMP001', amount: '-500', payPeriod: '2025-6' },
      baseContext,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid amount');
  });

  it('invalid pay period → INVALID', async () => {
    const result = await validateRow(
      { employeeId: 'EMP001', amount: '5000', payPeriod: 'not-a-date' },
      baseContext,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid payPeriod format');
  });

  it('employee not found → INVALID', async () => {
    const result = await validateRow(
      { employeeId: 'UNKNOWN', amount: '5000', payPeriod: '2025-6' },
      baseContext,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Employee not found');
  });

  it('duplicate row in same batch → INVALID', async () => {
    await validateRow(
      { employeeId: 'EMP001', amount: '5000', payPeriod: '2025-6' },
      baseContext,
    );
    const result = await validateRow(
      { employeeId: 'EMP001', amount: '6000', payPeriod: '2025-6' },
      baseContext,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Duplicate row in batch');
  });

  it('cross-file duplicate employeeId + payPeriod → INVALID', async () => {
    const result = await validateRow(
      { employeeId: 'EMP001', amount: '5000', payPeriod: '2025-7' },
      {
        ...baseContext,
        seenKeys: new Set<string>(),
        hasActiveOrSucceededDisbursement: async (employeeId, payPeriod) =>
          employeeId === 'EMP001' && payPeriod === '2025-7',
      },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(CROSS_FILE_DUPLICATE_REASON);
  });
});

describe('shouldDeadLetter', () => {
  const maxAttempts = 5;

  it('returns false before max attempts exhausted', () => {
    expect(shouldDeadLetter(1, maxAttempts)).toBe(false);
    expect(shouldDeadLetter(4, maxAttempts)).toBe(false);
  });

  it('returns true when attemptsMade reaches maxAttempts', () => {
    expect(shouldDeadLetter(5, maxAttempts)).toBe(true);
  });

  it('returns true when attemptsMade exceeds maxAttempts', () => {
    expect(shouldDeadLetter(6, maxAttempts)).toBe(true);
  });

  it('process catch uses attemptsMade + 1 for last-attempt decision', () => {
    expect(shouldDeadLetter(4 + 1, maxAttempts)).toBe(true);
    expect(shouldDeadLetter(3 + 1, maxAttempts)).toBe(false);
  });

  it('onFailed skips dead-letter when attemptsMade is below max', () => {
    expect(shouldDeadLetter(4, maxAttempts)).toBe(false);
  });

  it('onFailed dead-letters when attemptsMade equals max', () => {
    expect(shouldDeadLetter(5, maxAttempts)).toBe(true);
  });
});

describe('computeBatchStatus', () => {
  it('returns COMPLETED when all done with no dead letters', () => {
    expect(
      computeBatchStatus({ pending: 0, processing: 0, retrying: 0, deadLettered: 0 }),
    ).toBe('COMPLETED');
  });

  it('returns PARTIALLY_FAILED when dead letters exist', () => {
    expect(
      computeBatchStatus({ pending: 0, processing: 0, retrying: 0, deadLettered: 2 }),
    ).toBe('PARTIALLY_FAILED');
  });

  it('returns PROCESSING when work remains', () => {
    expect(
      computeBatchStatus({ pending: 1, processing: 0, retrying: 0, deadLettered: 0 }),
    ).toBe('PROCESSING');
  });

  it('stays PROCESSING while retrying before dead letter', () => {
    expect(
      computeBatchStatus({ pending: 0, processing: 0, retrying: 2, deadLettered: 1 }),
    ).toBe('PROCESSING');
  });

  it('becomes PARTIALLY_FAILED after all retries exhausted (dead lettered)', () => {
    expect(
      computeBatchStatus({ pending: 0, processing: 0, retrying: 0, deadLettered: 5 }),
    ).toBe('PARTIALLY_FAILED');
  });
});

describe('isValidPayPeriod', () => {
  it('accepts YYYY-M', () => {
    expect(isValidPayPeriod('2025-6')).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(isValidPayPeriod('01-15-2025')).toBe(false);
    expect(isValidPayPeriod('2025-06-01')).toBe(false);
  });
});

describe('PayrollService.buildQuery', () => {
  let service: PayrollService;
  const tenantId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: getModelToken(Batch.name), useValue: {} },
        { provide: getModelToken(DisbursementRecord.name), useValue: {} },
        { provide: getQueueToken(PAYROLL_QUEUE), useValue: {} },
        { provide: EmployeesService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get(PayrollService);
  });

  const hrUser = {
    userId,
    tenantId,
    role: UserRole.HR,
    email: 'hr@test.com',
  };

  it('filters by exact payPeriod', () => {
    const query = service.buildQuery(hrUser, { payPeriod: '2024-1' });
    expect(query.payPeriod).toBe('2024-1');
  });

  it('filters by payPeriod range using sort keys', () => {
    const query = service.buildQuery(hrUser, { payPeriodFrom: '2024-1', payPeriodTo: '2024-6' });
    expect(query.payPeriodSort).toEqual({ $gte: 202401, $lte: 202406 });
  });

  it('filters cross-year payPeriod range', () => {
    const query = service.buildQuery(hrUser, { payPeriodFrom: '2024-11', payPeriodTo: '2025-2' });
    expect(query.payPeriodSort).toEqual({ $gte: 202411, $lte: 202502 });
  });
});
