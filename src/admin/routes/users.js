const express = require('express');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { authorizeResource } = require('../middleware/auth');
const { userValidationRules } = require('../middleware/validation');
const { adminLogger } = require('../middleware/adminLogger');
const { metrics } = require('../utils/metrics');

const router = express.Router();
const prisma = new PrismaClient();

// Apply authorization for all user routes
router.use(authorizeResource('USERS'));

// GET /api/admin/users - List all users
router.get('/', userValidationRules.list, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      plan,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    adminLogger.info('Fetching users list', {
      adminId: req.admin.id,
      filters: { search, status, plan },
      pagination: { page, limit },
    });

    // Build where clause
    const where = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (plan) where.plan = plan;

    // Execute queries in parallel
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { sessions: true },
          },
          usage: {
            where: {
              date: new Date(new Date().toDateString()),
            },
            select: {
              messagesSent: true,
              apiCalls: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Format response
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      plan: user.plan,
      maxSessions: user.maxSessions,
      maxMessages: user.maxMessages,
      activeSessions: user._count.sessions,
      todayUsage: {
        messages: user.usage[0]?.messagesSent || 0,
        apiCalls: user.usage[0]?.apiCalls || 0,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    // Track metrics
    metrics.adminActions.inc({ action: 'list', resource: 'users' });

    res.json({
      data: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    adminLogger.error('Failed to fetch users', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/users/:id - Get single user details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.info('Fetching user details', {
      adminId: req.admin.id,
      userId: id,
    });

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        sessions: {
          select: {
            id: true,
            sessionId: true,
            name: true,
            status: true,
            phoneNumber: true,
            lastActivity: true,
          },
        },
        usage: {
          orderBy: { date: 'desc' },
          take: 30, // Last 30 days
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        },
      });
    }

    // Calculate usage statistics
    const usageStats = {
      totalMessages: user.usage.reduce((sum, u) => sum + u.messagesSent + u.messagesReceived, 0),
      totalApiCalls: user.usage.reduce((sum, u) => sum + u.apiCalls, 0),
      totalBandwidth: user.usage.reduce((sum, u) => sum + Number(u.bandwidth), 0),
      dailyAverage: {
        messages: Math.round(
          user.usage.reduce((sum, u) => sum + u.messagesSent, 0) / (user.usage.length || 1)
        ),
        apiCalls: Math.round(
          user.usage.reduce((sum, u) => sum + u.apiCalls, 0) / (user.usage.length || 1)
        ),
      },
    };

    metrics.adminActions.inc({ action: 'read', resource: 'users' });

    res.json({
      data: {
        ...user,
        usageStats,
        apiKey: user.apiKey.substring(0, 8) + '...' + user.apiKey.substring(user.apiKey.length - 4),
      },
    });
  } catch (error) {
    adminLogger.error('Failed to fetch user details', {
      error: error.message,
      adminId: req.admin.id,
      userId: req.params.id,
    });
    next(error);
  }
});

// POST /api/admin/users - Create new user
router.post('/', userValidationRules.create, async (req, res, next) => {
  try {
    const { email, name, plan = 'free', maxSessions, maxMessages } = req.body;

    adminLogger.info('Creating new user', {
      adminId: req.admin.id,
      email,
      plan,
    });

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({
        error: {
          message: 'User already exists',
          code: 'USER_EXISTS',
        },
      });
    }

    // Generate API key
    const apiKey = `ww_${crypto.randomBytes(32).toString('hex')}`;

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        apiKey,
        plan,
        maxSessions: maxSessions || (plan === 'free' ? 1 : plan === 'pro' ? 10 : 100),
        maxMessages: maxMessages || (plan === 'free' ? 1000 : plan === 'pro' ? 10000 : 100000),
      },
    });

    adminLogger.info('User created successfully', {
      adminId: req.admin.id,
      userId: user.id,
      email: user.email,
    });

    metrics.adminActions.inc({ action: 'create', resource: 'users' });

    res.status(201).json({
      message: 'User created successfully',
      data: user,
    });
  } catch (error) {
    adminLogger.error('Failed to create user', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/:id', userValidationRules.update, async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    adminLogger.info('Updating user', {
      adminId: req.admin.id,
      userId: id,
      updates: Object.keys(updates),
    });

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        },
      });
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updates,
    });

    adminLogger.info('User updated successfully', {
      adminId: req.admin.id,
      userId: user.id,
      changes: updates,
    });

    metrics.adminActions.inc({ action: 'update', resource: 'users' });

    res.json({
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    adminLogger.error('Failed to update user', {
      error: error.message,
      adminId: req.admin.id,
      userId: req.params.id,
    });
    next(error);
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.warn('Deleting user', {
      adminId: req.admin.id,
      userId: id,
    });

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { sessions: true } } },
    });

    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        },
      });
    }

    // Warn if user has active sessions
    if (user._count.sessions > 0) {
      adminLogger.warn('Deleting user with active sessions', {
        adminId: req.admin.id,
        userId: id,
        sessionCount: user._count.sessions,
      });
    }

    // Delete user (cascades to sessions, usage, etc.)
    await prisma.user.delete({ where: { id } });

    adminLogger.info('User deleted successfully', {
      adminId: req.admin.id,
      userId: id,
      email: user.email,
    });

    metrics.adminActions.inc({ action: 'delete', resource: 'users' });

    res.json({
      message: 'User deleted successfully',
    });
  } catch (error) {
    adminLogger.error('Failed to delete user', {
      error: error.message,
      adminId: req.admin.id,
      userId: req.params.id,
    });
    next(error);
  }
});

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.info('Resetting user password', {
      adminId: req.admin.id,
      userId: id,
    });

    // Implementation for password reset
    // This would typically send an email to the user

    res.json({
      message: 'Password reset email sent',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/:id/generate-api-key - Generate new API key
router.post('/:id/generate-api-key', async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.warn('Generating new API key', {
      adminId: req.admin.id,
      userId: id,
    });

    const newApiKey = `ww_${crypto.randomBytes(32).toString('hex')}`;

    const user = await prisma.user.update({
      where: { id },
      data: { apiKey: newApiKey },
    });

    adminLogger.info('API key regenerated', {
      adminId: req.admin.id,
      userId: id,
    });

    metrics.adminActions.inc({ action: 'execute', resource: 'users' });

    res.json({
      message: 'API key regenerated successfully',
      data: {
        apiKey: newApiKey,
      },
    });
  } catch (error) {
    adminLogger.error('Failed to generate API key', {
      error: error.message,
      adminId: req.admin.id,
      userId: req.params.id,
    });
    next(error);
  }
});

// GET /api/admin/users/:id/usage - Get user usage statistics
router.get('/:id/usage', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const where = { userId: id };
    if (startDate) where.date = { gte: new Date(startDate) };
    if (endDate) where.date = { ...where.date, lte: new Date(endDate) };

    const usage = await prisma.usage.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const aggregated = {
      totalMessages: usage.reduce((sum, u) => sum + u.messagesSent + u.messagesReceived, 0),
      totalApiCalls: usage.reduce((sum, u) => sum + u.apiCalls, 0),
      totalBandwidth: usage.reduce((sum, u) => sum + Number(u.bandwidth), 0),
      daily: usage,
    };

    res.json({
      data: aggregated,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;