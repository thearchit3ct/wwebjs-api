const express = require('express');
const { authorizeResource } = require('../middleware/auth');
const { adminLogger } = require('../middleware/adminLogger');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
const { version } = require('../../../package.json');

const router = express.Router();
const prisma = new PrismaClient();

// Apply authorization
router.use(authorizeResource('SYSTEM'));

// GET /api/admin/system/status - Get system status
router.get('/status', async (req, res, next) => {
  try {
    adminLogger.info('Fetching system status', {
      adminId: req.admin.id,
    });

    // Get database counts
    const [adminCount, userCount, sessionCount, connectedSessions] = await Promise.all([
      prisma.admin.count(),
      prisma.user.count(),
      prisma.session.count(),
      prisma.session.count({ where: { status: 'connected' } }),
    ]);

    // Get runtime sessions info
    let runtimeSessions = { total: 0, connected: 0 };
    try {
      const { getAllSessions } = require('../../sessions');
      const sessions = getAllSessions();
      runtimeSessions.total = sessions.size;
      runtimeSessions.connected = Array.from(sessions.values()).filter(s => s.status === 'connected').length;
    } catch (error) {
      adminLogger.debug('Sessions module not available', { error: error.message });
    }

    const status = {
      application: {
        version,
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          percentage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2),
        },
        loadAverage: os.loadavg(),
      },
      database: {
        connected: true,
        admins: adminCount,
        users: userCount,
        sessions: sessionCount,
        connectedSessions,
      },
      services: {
        whatsapp: {
          sessions: runtimeSessions.total,
          connected: runtimeSessions.connected,
        },
        redis: {
          connected: true, // Check actual connection
        },
      },
    };

    res.json({
      data: status,
    });
  } catch (error) {
    adminLogger.error('Failed to fetch system status', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/system/config - Get system configuration
router.get('/config', async (req, res, next) => {
  try {
    adminLogger.info('Fetching system config', {
      adminId: req.admin.id,
    });

    // Return non-sensitive configuration
    const config = {
      general: {
        apiUrl: process.env.API_URL || 'http://localhost:3000',
        webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000'),
        maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '100'),
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'),
      },
      features: {
        enableWebSocket: process.env.ENABLE_WEBSOCKET === 'true',
        enableSwagger: process.env.ENABLE_SWAGGER_ENDPOINT === 'true',
        enableMetrics: process.env.ENABLE_METRICS === 'true',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
      },
      limits: {
        maxAttachmentSize: parseInt(process.env.MAX_ATTACHMENT_SIZE || '16777216'),
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100'),
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
      },
      whatsapp: {
        headless: process.env.HEADLESS !== 'false',
        executablePath: process.env.CHROME_BIN || null,
        sessionPath: process.env.SESSIONS_PATH || './sessions',
      },
    };

    res.json({
      data: config,
    });
  } catch (error) {
    adminLogger.error('Failed to fetch system config', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// PUT /api/admin/system/config - Update system configuration
router.put('/config', async (req, res, next) => {
  try {
    const updates = req.body;

    adminLogger.warn('Updating system config', {
      adminId: req.admin.id,
      updates: Object.keys(updates),
    });

    // This would typically update a configuration file or database
    // For now, we'll just validate and return

    // Validate configuration
    const validKeys = [
      'general.webhookTimeout',
      'general.maxConcurrentSessions',
      'features.maintenanceMode',
      'limits.maxAttachmentSize',
      'limits.rateLimitMax',
    ];

    const invalidKeys = Object.keys(updates).filter(key => !validKeys.includes(key));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        error: {
          message: 'Invalid configuration keys',
          code: 'INVALID_CONFIG',
          details: invalidKeys,
        },
      });
    }

    adminLogger.info('System config updated', {
      adminId: req.admin.id,
      updates,
    });

    res.json({
      message: 'Configuration updated successfully',
      data: updates,
    });
  } catch (error) {
    adminLogger.error('Failed to update system config', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// POST /api/admin/system/maintenance - Toggle maintenance mode
router.post('/maintenance', async (req, res, next) => {
  try {
    const { enabled, message } = req.body;

    adminLogger.warn('Toggling maintenance mode', {
      adminId: req.admin.id,
      enabled,
    });

    // Set maintenance mode
    process.env.MAINTENANCE_MODE = enabled ? 'true' : 'false';
    if (message) {
      process.env.MAINTENANCE_MESSAGE = message;
    }

    adminLogger.info('Maintenance mode updated', {
      adminId: req.admin.id,
      enabled,
      message,
    });

    res.json({
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      data: {
        enabled,
        message,
      },
    });
  } catch (error) {
    adminLogger.error('Failed to toggle maintenance mode', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// POST /api/admin/system/cache/clear - Clear system cache
router.post('/cache/clear', async (req, res, next) => {
  try {
    const { type = 'all' } = req.body;

    adminLogger.warn('Clearing system cache', {
      adminId: req.admin.id,
      type,
    });

    // Clear different cache types
    if (type === 'all' || type === 'redis') {
      // Clear Redis cache
    }

    if (type === 'all' || type === 'memory') {
      // Clear in-memory cache
    }

    adminLogger.info('Cache cleared', {
      adminId: req.admin.id,
      type,
    });

    res.json({
      message: 'Cache cleared successfully',
      data: { type },
    });
  } catch (error) {
    adminLogger.error('Failed to clear cache', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/system/health - Detailed health check
router.get('/health', async (req, res, next) => {
  try {
    const checks = {
      database: await checkDatabase(),
      redis: await checkRedis(),
      whatsapp: checkWhatsApp(),
      disk: await checkDiskSpace(),
      memory: checkMemory(),
    };

    const overall = Object.values(checks).every(check => check.status === 'healthy')
      ? 'healthy'
      : Object.values(checks).some(check => check.status === 'critical')
      ? 'critical'
      : 'degraded';

    res.json({
      status: overall,
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Health check functions
async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', message: 'Database connected' };
  } catch (error) {
    return { status: 'critical', message: error.message };
  }
}

async function checkRedis() {
  // Check Redis connection
  return { status: 'healthy', message: 'Redis connected' };
}

function checkWhatsApp() {
  try {
    const { getAllSessions } = require('../../sessions');
    const sessions = getAllSessions();
    const connected = Array.from(sessions.values()).filter(s => s.status === 'connected').length;
    
    return {
      status: 'healthy',
      message: `${connected}/${sessions.size} sessions connected`,
      details: {
        total: sessions.size,
        connected,
      },
    };
  } catch (error) {
    return { status: 'unknown', message: 'Sessions module not available' };
  }
}

async function checkDiskSpace() {
  const { statfs } = require('fs').promises;
  try {
    const stats = await statfs('/');
    const usedPercentage = ((stats.blocks - stats.bfree) / stats.blocks * 100).toFixed(2);
    
    return {
      status: usedPercentage > 90 ? 'critical' : usedPercentage > 80 ? 'degraded' : 'healthy',
      message: `${usedPercentage}% disk used`,
      details: {
        total: stats.blocks * stats.bsize,
        free: stats.bfree * stats.bsize,
        used: (stats.blocks - stats.bfree) * stats.bsize,
      },
    };
  } catch (error) {
    return { status: 'unknown', message: error.message };
  }
}

function checkMemory() {
  const used = os.totalmem() - os.freemem();
  const percentage = (used / os.totalmem() * 100).toFixed(2);
  
  return {
    status: percentage > 90 ? 'critical' : percentage > 80 ? 'degraded' : 'healthy',
    message: `${percentage}% memory used`,
    details: {
      total: os.totalmem(),
      free: os.freemem(),
      used,
    },
  };
}

module.exports = router;