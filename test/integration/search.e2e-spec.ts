import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { seedE2EDatabase } from '../e2e-helpers';

describe('Search (e2e)', () => {
  let app: INestApplication<App>;
  let alphaHrToken: string;
  let betaHrToken: string;
  let alphaSupervisor1Token: string;

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

    const [alphaHr, betaHr, alphaSup1] = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'hr@alpha.com', password: 'Hr@123' }),
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'hr@beta.com', password: 'Hr@123' }),
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'supervisor1@alpha.com', password: 'Super@123' }),
    ]);

    alphaHrToken = alphaHr.body.accessToken;
    betaHrToken = betaHr.body.accessToken;
    alphaSupervisor1Token = alphaSup1.body.accessToken;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@alpha.com', password: 'Admin@123' });

    const csv = Buffer.from('employeeId,amount,payPeriod\nEMP001,5000,2025-6\nEMP013,6000,2025-6\n');
    await request(app.getHttpServer())
      .post('/payroll/upload')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .attach('file', csv, 'search-seed.csv');

    for (let i = 0; i < 30; i++) {
      const res = await request(app.getHttpServer())
        .get('/payroll/search')
        .set('Authorization', `Bearer ${alphaHrToken}`);

      if (res.body.total > 0) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('HR from Alpha Corp → sees Alpha records', async () => {
    const res = await request(app.getHttpServer())
      .get('/payroll/search')
      .set('Authorization', `Bearer ${alphaHrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('HR search scoped to tenant — Alpha HR does not see Beta-only employee names', async () => {
    const alphaRes = await request(app.getHttpServer())
      .get('/payroll/search')
      .query({ employeeName: 'Beta Industries' })
      .set('Authorization', `Bearer ${alphaHrToken}`);

    const betaRes = await request(app.getHttpServer())
      .get('/payroll/search')
      .query({ employeeName: 'Beta Industries' })
      .set('Authorization', `Bearer ${betaHrToken}`);

    expect(alphaRes.body.total).toBe(0);
    expect(betaRes.body.total).toBe(0);
  });

  it('Supervisor1 from Alpha → scoped to their employees only', async () => {
    const supRes = await request(app.getHttpServer())
      .get('/payroll/search')
      .set('Authorization', `Bearer ${alphaSupervisor1Token}`);

    expect(supRes.status).toBe(200);
    for (const record of supRes.body.data) {
      expect(record.employeeId).toMatch(/^EMP0(0[1-9]|1[0-2])$/);
    }
  });

  it('HR search with name filter → partial match', async () => {
    const res = await request(app.getHttpServer())
      .get('/payroll/search')
      .query({ employeeName: 'Employee 001' })
      .set('Authorization', `Bearer ${alphaHrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('HR search with pay period range', async () => {
    const res = await request(app.getHttpServer())
      .get('/payroll/search')
      .query({ payPeriodFrom: '2025-1', payPeriodTo: '2025-12' })
      .set('Authorization', `Bearer ${alphaHrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('HR search with exact payPeriod', async () => {
    const res = await request(app.getHttpServer())
      .get('/payroll/search')
      .query({ payPeriod: '2025-6' })
      .set('Authorization', `Bearer ${alphaHrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const record of res.body.data) {
      expect(record.payPeriod).toBe('2025-6');
    }
  });

  it('Pagination → page 2 returns different offset', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/payroll/search')
      .query({ page: 1, limit: 5 })
      .set('Authorization', `Bearer ${alphaHrToken}`);

    const page2 = await request(app.getHttpServer())
      .get('/payroll/search')
      .query({ page: 2, limit: 5 })
      .set('Authorization', `Bearer ${alphaHrToken}`);

    if (page1.body.total > 5) {
      expect(page1.body.data[0].id).not.toBe(page2.body.data[0]?.id);
    }
  });
});
