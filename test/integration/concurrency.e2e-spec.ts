import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { seedE2EDatabase } from '../e2e-helpers';

describe('Concurrency (e2e)', () => {
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

  it('simultaneous duplicate upload → one 202 and one 409', async () => {
    const csv = Buffer.from(
      `employeeId,amount,payPeriod\nEMP002,7000,2025-7\nEMP003,8000,2025-7\n`,
    );

    const upload = () =>
      request(app.getHttpServer())
        .post('/payroll/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, `concurrency-${Date.now()}.csv`);

    const uniqueCsv = Buffer.from(
      `employeeId,amount,payPeriod\nEMP004,9000,2025-8\n`,
    );
    const fixedName = 'concurrency-race-test.csv';

    const raceUpload = () =>
      request(app.getHttpServer())
        .post('/payroll/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', uniqueCsv, fixedName);

    const [res1, res2] = await Promise.all([raceUpload(), raceUpload()]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([202, 409]);

    const successBody = res1.status === 202 ? res1.body : res2.body;
    const failBody = res1.status === 409 ? res1.body : res2.body;

    expect(successBody.batchId).toBeDefined();
    expect(failBody.message).toContain('Duplicate upload');
  });
});
