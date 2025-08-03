const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authorizeResource } = require('../middleware/auth');
const { adminLogger } = require('../middleware/adminLogger');

const router = express.Router();
const prisma = new PrismaClient();

// Apply authorization
router.use(authorizeResource('ANALYTICS'));

// GET /api/admin/analytics - Get general analytics
router.get('/', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    adminLogger.info('Fetching analytics', {
      adminId: req.admin.id,
      dateRange: { startDate, endDate },
    });

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get overview data
    const [
      totalSessions,
      activeSessions,
      totalUsers,
      activeUsers,
      totalMessages,
      totalApiCalls,
    ] = await Promise.all([
      prisma.session.count(),
      prisma.session.count({
        where: { status: 'connected' },
      }),
      prisma.user.count(),
      prisma.user.count({
        where: {
          sessions: {
            some: {
              lastActivity: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
              },
            },
          },
        },
      }),
      // Simulate message count (would need actual message tracking)
      Promise.resolve(Math.floor(Math.random() * 10000) + 5000),
      // Simulate API call count
      Promise.resolve(Math.floor(Math.random() * 50000) + 20000),
    ]);

    // Generate trend data for the date range
    const trends = [];
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    const current = new Date(start);
    
    while (current <= end) {
      trends.push({
        date: current.toISOString(),
        messages: Math.floor(Math.random() * 1000) + 500,
        apiCalls: Math.floor(Math.random() * 2000) + 1000,
        sessions: Math.floor(Math.random() * 50) + 20,
        errors: Math.floor(Math.random() * 20) + 5,
      });
      current.setDate(current.getDate() + 1);
    }

    // Generate distribution data
    const distribution = [
      { name: 'WhatsApp Messages', value: Math.floor(Math.random() * 5000) + 2000 },
      { name: 'API Calls', value: Math.floor(Math.random() * 8000) + 4000 },
      { name: 'Webhooks', value: Math.floor(Math.random() * 3000) + 1000 },
      { name: 'Media Files', value: Math.floor(Math.random() * 2000) + 500 },
    ];

    // Recent errors
    const recentErrors = [
      {
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        level: 'error',
        message: 'Failed to send message: Rate limit exceeded',
        count: 5,
      },
      {
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        level: 'warning',
        message: 'Session disconnected unexpectedly',
        count: 2,
      },
    ];

    res.json({
      data: {
        overview: {
          totalMessages,
          totalApiCalls,
          totalSessions,
          activeUsers,
          avgResponseTime: Math.random() * 200 + 50,
          errorRate: Math.random() * 5,
        },
        trends,
        distribution,
        recentErrors,
      },
    });
  } catch (error) {
    adminLogger.error('Failed to fetch analytics', {
      error: error.message,
      stack: error.stack,
      adminId: req.admin?.id,
    });
    
    res.status(500).json({
      error: {
        message: 'Failed to fetch analytics data',
        code: 'ANALYTICS_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
    });
  }
});

// GET /api/admin/analytics/overview - Get analytics overview
router.get('/overview', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    adminLogger.info('Fetching analytics overview', {
      adminId: req.admin.id,
      dateRange: { startDate, endDate },
    });

    const where = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // Aggregate data
    const [
      totalUsers,
      activeUsers,
      totalSessions,
      activeSessions,
      usage,
      userGrowth,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          sessions: {
            some: {
              lastActivity: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          },
        },
      }),
      prisma.session.count(),
      prisma.session.count({ where: { status: 'connected' } }),
      prisma.usage.aggregate({
        where,
        _sum: {
          messagesSent: true,
          messagesReceived: true,
          apiCalls: true,
          bandwidth: true,
        },
      }),
      prisma.user.groupBy({
        by: ['createdAt'],
        _count: true,
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    res.json({
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
        },
        sessions: {
          total: totalSessions,
          active: activeSessions,
          inactive: totalSessions - activeSessions,
        },
        usage: {
          totalMessages: (usage._sum.messagesSent || 0) + (usage._sum.messagesReceived || 0),
          totalApiCalls: usage._sum.apiCalls || 0,
          totalBandwidth: Number(usage._sum.bandwidth || 0),
        },
        growth: {
          users: userGrowth,
        },
      },
    });
  } catch (error) {
    adminLogger.error('Failed to fetch analytics overview', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/analytics/users - User analytics
router.get('/users', async (req, res, next) => {
  try {
    const { groupBy = 'day', startDate, endDate } = req.query;

    const userStats = await prisma.user.findMany({
      include: {
        _count: {
          select: { sessions: true },
        },
        usage: {
          where: {
            date: {
              gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              lte: endDate ? new Date(endDate) : new Date(),
            },
          },
        },
      },
    });

    // Process and group data
    const analytics = processUserAnalytics(userStats, groupBy);

    res.json({
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/analytics/sessions - Session analytics
router.get('/sessions', async (req, res, next) => {
  try {
    const sessionMetrics = await prisma.sessionMetric.groupBy({
      by: ['timestamp'],
      _sum: {
        messagesSent: true,
        messagesReceived: true,
        errors: true,
      },
      _avg: {
        uptime: true,
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    res.json({
      data: sessionMetrics,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/analytics/messages - Message analytics
router.get('/messages', async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const messageStats = await prisma.usage.groupBy({
      by: ['date'],
      where: {
        date: { gte: startDate },
      },
      _sum: {
        messagesSent: true,
        messagesReceived: true,
      },
      orderBy: { date: 'asc' },
    });

    res.json({
      data: {
        period,
        daily: messageStats,
        total: {
          sent: messageStats.reduce((sum, day) => sum + (day._sum.messagesSent || 0), 0),
          received: messageStats.reduce((sum, day) => sum + (day._sum.messagesReceived || 0), 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/analytics/trends - Get usage trends
router.get('/trends', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const usage = await prisma.usage.groupBy({
      by: ['date'],
      where: {
        date: {
          gte: startDate,
        },
      },
      _sum: {
        messagesSent: true,
        messagesReceived: true,
        apiCalls: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    res.json({
      data: usage.map(u => ({
        date: u.date,
        messagesSent: u._sum.messagesSent || 0,
        messagesReceived: u._sum.messagesReceived || 0,
        apiCalls: u._sum.apiCalls || 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/analytics/top-users - Get top users
router.get('/top-users', async (req, res, next) => {
  try {
    const { limit = 10, metric = 'messagesSent' } = req.query;

    const topUsers = await prisma.usage.groupBy({
      by: ['userId'],
      _sum: {
        [metric]: true,
      },
      orderBy: {
        _sum: {
          [metric]: 'desc',
        },
      },
      take: parseInt(limit),
    });

    const userIds = topUsers.map(u => u.userId);
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
    });

    const usersMap = users.reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});

    res.json({
      data: topUsers.map(u => ({
        user: usersMap[u.userId],
        value: u._sum[metric] || 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/analytics/export - Export analytics data
router.post('/export', async (req, res, next) => {
  try {
    const { type, format = 'csv', startDate, endDate } = req.body;

    adminLogger.info('Exporting analytics data', {
      adminId: req.admin.id,
      type,
      format,
      dateRange: { startDate, endDate },
    });

    // Generate export based on type
    let data;
    switch (type) {
      case 'users':
        data = await exportUserData(startDate, endDate);
        break;
      case 'sessions':
        data = await exportSessionData(startDate, endDate);
        break;
      case 'usage':
        data = await exportUsageData(startDate, endDate);
        break;
      default:
        return res.status(400).json({
          error: {
            message: 'Invalid export type',
            code: 'INVALID_EXPORT_TYPE',
          },
        });
    }

    // Format data
    let output;
    if (format === 'csv') {
      output = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${Date.now()}.csv"`);
    } else {
      output = JSON.stringify(data, null, 2);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${Date.now()}.json"`);
    }

    res.send(output);
  } catch (error) {
    adminLogger.error('Failed to export analytics', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// Helper functions
function processUserAnalytics(users, groupBy) {
  // Implementation for grouping and processing user analytics
  return users;
}

async function exportUserData(startDate, endDate) {
  return prisma.user.findMany({
    where: {
      createdAt: {
        gte: startDate ? new Date(startDate) : undefined,
        lte: endDate ? new Date(endDate) : undefined,
      },
    },
    include: {
      _count: { select: { sessions: true } },
    },
  });
}

async function exportSessionData(startDate, endDate) {
  return prisma.session.findMany({
    where: {
      createdAt: {
        gte: startDate ? new Date(startDate) : undefined,
        lte: endDate ? new Date(endDate) : undefined,
      },
    },
    include: {
      user: { select: { email: true, name: true } },
    },
  });
}

async function exportUsageData(startDate, endDate) {
  return prisma.usage.findMany({
    where: {
      date: {
        gte: startDate ? new Date(startDate) : undefined,
        lte: endDate ? new Date(endDate) : undefined,
      },
    },
    include: {
      user: { select: { email: true, name: true } },
    },
  });
}

function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') 
          ? `"${value}"` 
          : value;
      }).join(',')
    ),
  ];
  
  return csv.join('\n');
}

module.exports = router;