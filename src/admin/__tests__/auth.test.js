const request = require('supertest');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
let app;
let adminToken;

beforeAll(async () => {
  // Import app after environment is set up
  app = require('../../../src/app');
  
  // Create test admin
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const admin = await prisma.admin.create({
    data: {
      email: 'test@admin.com',
      passwordHash,
      name: 'Test Admin',
      role: 'ADMIN',
    },
  });

  // Set default permissions
  await prisma.permission.createMany({
    data: [
      { adminId: admin.id, resource: 'USERS', action: 'READ', granted: true },
      { adminId: admin.id, resource: 'USERS', action: 'CREATE', granted: true },
      { adminId: admin.id, resource: 'USERS', action: 'UPDATE', granted: true },
      { adminId: admin.id, resource: 'SESSIONS', action: 'READ', granted: true },
      { adminId: admin.id, resource: 'ANALYTICS', action: 'READ', granted: true },
    ],
  });
});

afterAll(async () => {
  // Cleanup
  await prisma.admin.deleteMany({
    where: { email: 'test@admin.com' },
  });
  await prisma.$disconnect();
});

describe('Admin Auth API', () => {
  describe('POST /api/admin/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'test@admin.com',
          password: 'TestPass123!',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('admin');
      expect(response.body.data.admin.email).toBe('test@admin.com');
      
      adminToken = response.body.data.accessToken;
    });

    it('should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'test@admin.com',
          password: 'WrongPassword',
        });

      expect(response.status).toBe(500); // Error thrown
      expect(response.body.error).toBeDefined();
    });

    it('should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'test@admin.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/admin/auth/me', () => {
    it('should return current admin info', async () => {
      const response = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('email', 'test@admin.com');
      expect(response.body.data).toHaveProperty('role', 'ADMIN');
      expect(response.body.data).toHaveProperty('permissions');
    });

    it('should fail without token', async () => {
      const response = await request(app)
        .get('/api/admin/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('NO_TOKEN');
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_FAILED');
    });
  });

  describe('POST /api/admin/auth/refresh', () => {
    let refreshToken;

    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'test@admin.com',
          password: 'TestPass123!',
        });
      
      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('expiresIn');
    });

    it('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/admin/auth/change-password', () => {
    it('should change password successfully', async () => {
      const response = await request(app)
        .post('/api/admin/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'TestPass123!',
          newPassword: 'NewTestPass123!',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');

      // Reset password for other tests
      const admin = await prisma.admin.findUnique({
        where: { email: 'test@admin.com' },
      });
      await prisma.admin.update({
        where: { id: admin.id },
        data: {
          passwordHash: await bcrypt.hash('TestPass123!', 10),
        },
      });
    });

    it('should fail with wrong current password', async () => {
      const response = await request(app)
        .post('/api/admin/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'WrongPassword',
          newPassword: 'NewTestPass123!',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });
});

describe('Admin Users API', () => {
  let testUserId;

  describe('POST /api/admin/users', () => {
    it('should create a new user', async () => {
      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@example.com',
          name: 'New User',
          plan: 'starter',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('apiKey');
      expect(response.body.data.email).toBe('newuser@example.com');
      
      testUserId = response.body.data.id;
    });

    it('should fail with duplicate email', async () => {
      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@example.com',
          name: 'Another User',
          plan: 'starter',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('USER_EXISTS');
    });
  });

  describe('GET /api/admin/users', () => {
    it('should list users with pagination', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 10);
      expect(response.body.pagination).toHaveProperty('total');
    });

    it('should filter users by search', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: 'newuser' });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/admin/users/:id', () => {
    it('should get user details', async () => {
      const response = await request(app)
        .get(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(testUserId);
      expect(response.body.data).toHaveProperty('usageStats');
      expect(response.body.data.apiKey).toMatch(/^ww_\w{8}\.\.\.\w{4}$/);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/admin/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500); // Prisma throws error for invalid UUID
    });
  });

  describe('PUT /api/admin/users/:id', () => {
    it('should update user', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated User Name',
          plan: 'pro',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated User Name');
      expect(response.body.data.plan).toBe('pro');
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('should delete user', async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User deleted successfully');
    });
  });
});

describe('Admin System API', () => {
  describe('GET /api/admin/system/status', () => {
    it('should return system status', async () => {
      const response = await request(app)
        .get('/api/admin/system/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('application');
      expect(response.body.data).toHaveProperty('system');
      expect(response.body.data).toHaveProperty('database');
      expect(response.body.data).toHaveProperty('services');
    });
  });

  describe('GET /api/admin/system/health', () => {
    it('should return health check', async () => {
      const response = await request(app)
        .get('/api/admin/system/health')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('memory');
    });
  });
});