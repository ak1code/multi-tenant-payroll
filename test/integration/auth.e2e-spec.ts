import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { seedE2EDatabase } from '../e2e-helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login → returns access and refresh tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@alpha.com', password: 'Admin@123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('POST /auth/refresh → rotates tokens; old refresh token is rejected', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hr@alpha.com', password: 'Hr@123' });

    const originalRefreshToken = loginRes.body.refreshToken;

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: originalRefreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
    expect(refreshRes.body.refreshToken).not.toBe(originalRefreshToken);

    const reuseRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: originalRefreshToken });

    expect(reuseRes.status).toBe(401);
  });

  it('POST /auth/logout → invalidates refresh token server-side', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'supervisor1@alpha.com', password: 'Super@123' });

    const { accessToken, refreshToken } = loginRes.body;

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('Logged out');

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });
});
