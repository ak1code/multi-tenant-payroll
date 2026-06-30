import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { seedE2EDatabase } from '../e2e-helpers';
import * as disbursementMock from '../../src/payroll/mock/disbursement.mock';

describe('Upload flow (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    await seedE2EDatabase();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@alpha.com', password: 'Admin@123' });

    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /payroll/upload → returns 202 with batchId', async () => {
    const smallCsv = Buffer.from(
      'employeeId,amount,payPeriod\nEMP001,5000,2025-6\nEMP002,6000,2025-6\n',
    );

    const res = await request(app.getHttpServer())
      .post('/payroll/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', smallCsv, 'upload-accept-test.csv');

    expect(res.status).toBe(202);
    expect(res.body.batchId).toBeDefined();
    expect(res.body.message).toContain('processing started');
  });

  it('GET /payroll/batch/:batchId/status → eventually shows counts', async () => {
    const statusCsv = Buffer.from(
      `employeeId,amount,payPeriod\nEMP005,5500,2025-5\nEMP006,6500,2025-5\n`,
    );

    const uploadRes = await request(app.getHttpServer())
      .post('/payroll/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', statusCsv, 'status-test.csv');

    expect(uploadRes.status).toBe(202);
    const batchId = uploadRes.body.batchId;

    let completed = false;
    for (let i = 0; i < 90; i++) {
      const statusRes = await request(app.getHttpServer())
        .get(`/payroll/batch/${batchId}/status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.batchId).toBe(batchId);

      if (statusRes.body.status === 'COMPLETED' || statusRes.body.status === 'PARTIALLY_FAILED') {
        expect(
          statusRes.body.succeeded + statusRes.body.deadLettered + statusRes.body.invalid,
        ).toBeGreaterThan(0);
        completed = true;
        break;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    expect(completed).toBe(true);
  }, 120000);

  it('Uploading same file twice → 409 Conflict', async () => {
    const uniqueCsv = Buffer.from('employeeId,amount,payPeriod\nEMP001,5000,2025-6\n');

    const first = await request(app.getHttpServer())
      .post('/payroll/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', uniqueCsv, 'duplicate-test.csv');

    expect(first.status).toBe(202);

    const second = await request(app.getHttpServer())
      .post('/payroll/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', uniqueCsv, 'duplicate-test.csv');

    expect(second.status).toBe(409);
    expect(second.body.message).toContain('Duplicate upload');
  });

  it('invalid rows do not block valid rows from processing', async () => {
    const mixedCsv = Buffer.from(
      'employeeId,amount,payPeriod\n' +
      'EMP001,5000,2025-6\n' +
      ',1000,2025-6\n' +
      'EMP002,abc,2025-6\n' +
      'EMP003,6000,2025-6\n',
    );

    const uploadRes = await request(app.getHttpServer())
      .post('/payroll/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', mixedCsv, `mixed-valid-invalid-${Date.now()}.csv`);

    expect(uploadRes.status).toBe(202);
    const batchId = uploadRes.body.batchId;

    let settled = false;
    for (let i = 0; i < 90; i++) {
      const statusRes = await request(app.getHttpServer())
        .get(`/payroll/batch/${batchId}/status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statusRes.status).toBe(200);

      if (statusRes.body.status === 'COMPLETED' || statusRes.body.status === 'PARTIALLY_FAILED') {
        expect(statusRes.body.invalid).toBeGreaterThanOrEqual(2);
        expect(statusRes.body.succeeded).toBeGreaterThanOrEqual(1);
        settled = true;
        break;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    expect(settled).toBe(true);
  }, 120000);

  it('failed disbursement after max retries → dead-lettered and queryable via search', async () => {
    const spy = jest
      .spyOn(disbursementMock, 'mockDisbursementFunction')
      .mockRejectedValue(new Error('Disbursement failed for test'));

    try {
      const csv = Buffer.from('employeeId,amount,payPeriod\nEMP010,5000,2025-11\n');

      const uploadRes = await request(app.getHttpServer())
        .post('/payroll/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, `dead-letter-${Date.now()}.csv`);

      expect(uploadRes.status).toBe(202);
      const batchId = uploadRes.body.batchId;

      let deadLettered = false;
      for (let i = 0; i < 120; i++) {
        const statusRes = await request(app.getHttpServer())
          .get(`/payroll/batch/${batchId}/status`)
          .set('Authorization', `Bearer ${adminToken}`);

        if (statusRes.body.deadLettered >= 1) {
          deadLettered = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      expect(deadLettered).toBe(true);

      const searchRes = await request(app.getHttpServer())
        .get('/payroll/search')
        .query({ status: 'DEAD_LETTERED' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(searchRes.status).toBe(200);
      const deadLetter = searchRes.body.data.find(
        (r: { employeeId: string }) => r.employeeId === 'EMP010',
      );
      expect(deadLetter).toBeDefined();
      expect(deadLetter.failureReason).toContain('Disbursement failed for test');
    } finally {
      spy.mockRestore();
    }
  }, 180000);
});
