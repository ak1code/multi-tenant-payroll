export enum UserRole {
  ADMIN = 'ADMIN',
  HR = 'HR',
  SUPERVISOR = 'SUPERVISOR',
}

export enum BatchStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIALLY_FAILED = 'PARTIALLY_FAILED',
}

export enum DisbursementStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  RETRYING = 'RETRYING',
  DEAD_LETTERED = 'DEAD_LETTERED',
  INVALID = 'INVALID',
}

export const PAYROLL_QUEUE = 'payroll-disbursement';

export const BCRYPT_SALT_ROUNDS = 12;
