import { INestApplication } from '@nestjs/common';

import { DataSource } from 'typeorm';

import request from 'supertest';

import { createTestApp } from './setup';

describe('Authentication API', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const result = await createTestApp();

    app = result.app;
    dataSource = result.dataSource;

    await dataSource.query('DELETE FROM audit_logs');
    await dataSource.query('DELETE FROM risk_reviews');
    await dataSource.query('DELETE FROM merchant_applications');
    await dataSource.query('DELETE FROM users');
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM audit_logs');
    await dataSource.query('DELETE FROM risk_reviews');
    await dataSource.query('DELETE FROM merchant_applications');
    await dataSource.query('DELETE FROM users');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a SALES user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'sales@example.com',
          password: 'StrongPassword123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          email: 'sales@example.com',
          role: 'SALES',
          firstName: 'John',
          lastName: 'Doe',
          isActive: true,
        }),
      );

      expect(response.body.id).toEqual(expect.any(String));

      expect(response.body.passwordHash).toBeUndefined();

      expect(response.body.password).toBeUndefined();
    });

    it('should lowercase the email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'John@Example.COM',
          password: 'StrongPassword123!',
        })
        .expect(201);

      expect(response.body.email).toBe('john@example.com');
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'StrongPassword123!',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'StrongPassword123!',
        })
        .expect(409);

      expect(response.body.message).toBe(
        'A user with this email already exists',
      );
    });

    it('should reject invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'StrongPassword123!',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });

    it('should reject a short password', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'john@example.com',
          password: '123',
        })
        .expect(400);
    });

    it('should reject unknown fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'john@example.com',
          password: 'StrongPassword123!',
          role: 'ADMIN',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'sales@example.com',
          password: 'StrongPassword123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(201);
    });

    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'sales@example.com',
          password: 'StrongPassword123!',
        })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));

      expect(response.body.accessToken.length).toBeGreaterThan(20);

      expect(response.body.tokenType).toBe('Bearer');

      expect(response.body.user).toEqual(
        expect.objectContaining({
          email: 'sales@example.com',
          role: 'SALES',
        }),
      );

      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('should reject an incorrect password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'sales@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('should reject an unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'unknown@example.com',
          password: 'StrongPassword123!',
        })
        .expect(401);
    });

    it('should reject invalid login payload', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'not-an-email',
          password: '123',
        })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'sales@example.com',
          password: 'StrongPassword123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'sales@example.com',
          password: 'StrongPassword123!',
        })
        .expect(201);

      accessToken = loginResponse.body.accessToken;
    });

    it('should return authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          email: 'sales@example.com',
          role: 'SALES',
          firstName: 'John',
          lastName: 'Doe',
        }),
      );

      expect(response.body.id).toEqual(expect.any(String));
    });

    it('should reject request without bearer token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should reject an invalid bearer token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should reject malformed authorization header', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Basic invalid-token')
        .expect(401);
    });
  });
});
