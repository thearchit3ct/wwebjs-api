const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authorizeResource } = require('../middleware/auth');
const { sessionValidationRules } = require('../middleware/validation');
const { adminLogger } = require('../middleware/adminLogger');
const wwebjsApiService = require('../services/wwebjsApiService');

const router = express.Router();
const prisma = new PrismaClient();

// Apply authorization
router.use(authorizeResource('SESSIONS'));

// GET /api/admin/sessions - List all sessions
router.get('/', sessionValidationRules.list, async (req, res, next) => {
  try {
    const { userId, status, page = 1, limit = 20 } = req.query;

    adminLogger.info('Fetching sessions list', {
      adminId: req.admin.id,
      filters: { userId, status },
    });

    // Build where clause
    const where = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    // Get sessions from database
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true, name: true },
          },
          metrics: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.session.count({ where }),
    ]);

    // Get runtime status from memory (if sessions module is available)
    let runtimeSessions = new Map();
    try {
      const { getAllSessions } = require('../../sessions');
      runtimeSessions = getAllSessions();
    } catch (error) {
      adminLogger.debug('Sessions module not available', { error: error.message });
    }

    // Merge database and runtime data
    const mergedSessions = sessions.map(session => {
      const runtime = runtimeSessions.get(session.sessionId);
      return {
        ...session,
        runtimeStatus: runtime ? {
          connected: runtime.client?.info?.pushname ? true : false,
          phoneNumber: runtime.client?.info?.wid?.user,
          qrCode: runtime.qrCode,
          uptime: runtime.startTime ? Date.now() - runtime.startTime : 0,
        } : null,
        latestMetrics: session.metrics[0] || null,
      };
    });

    res.json({
      data: mergedSessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    adminLogger.error('Failed to fetch sessions', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/sessions/:id - Get session details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.info('Fetching session details', {
      adminId: req.admin.id,
      sessionId: id,
    });

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        user: true,
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: 100, // Last 100 data points
        },
      },
    });

    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    // Get runtime info
    let runtime = null;
    try {
      const { getSession } = require('../../sessions');
      runtime = getSession(session.sessionId);
    } catch (error) {
      adminLogger.debug('Sessions module not available', { error: error.message });
    }

    res.json({
      data: {
        ...session,
        runtime: runtime ? {
          status: runtime.status,
          connected: runtime.client?.info?.pushname ? true : false,
          phoneNumber: runtime.client?.info?.wid?.user,
          uptime: runtime.startTime ? Date.now() - runtime.startTime : 0,
          qrCode: runtime.qrCode,
        } : null,
      },
    });
  } catch (error) {
    adminLogger.error('Failed to fetch session details', {
      error: error.message,
      adminId: req.admin.id,
      sessionId: req.params.id,
    });
    next(error);
  }
});

// POST /api/admin/sessions/:id/restart - Restart session
router.post('/:id/restart', async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.warn('Restarting session', {
      adminId: req.admin.id,
      sessionId: id,
    });

    const session = await prisma.session.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    try {
      // Get runtime session
      const { getSession, deleteSession, startSession } = require('../../sessions');
      const runtime = getSession(session.sessionId);
      
      if (runtime && runtime.client) {
        // Destroy current client
        await runtime.client.destroy();
      }

      // Delete from memory
      await deleteSession(session.sessionId);

      // Restart session
      await startSession(session.sessionId, {
        webhook: {
          url: session.webhookUrl,
          events: ['All'],
        },
      });

      adminLogger.info('Session restarted successfully', {
        adminId: req.admin.id,
        sessionId: id,
        userId: session.userId,
      });

      res.json({
        message: 'Session restarted successfully',
      });
    } catch (error) {
      adminLogger.error('Failed to restart session', {
        error: error.message,
        adminId: req.admin.id,
        sessionId: id,
      });
      
      // Fallback to status update
      await prisma.session.update({
        where: { id },
        data: { status: 'disconnected' },
      });

      res.json({
        message: 'Session marked for restart',
      });
    }
  } catch (error) {
    adminLogger.error('Failed to restart session', {
      error: error.message,
      adminId: req.admin.id,
      sessionId: req.params.id,
    });
    next(error);
  }
});

// POST /api/admin/sessions/:id/terminate - Force terminate session
router.post('/:id/terminate', async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.warn('Terminating session', {
      adminId: req.admin.id,
      sessionId: id,
    });

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    try {
      // Terminate runtime session
      const { deleteSession } = require('../../sessions');
      await deleteSession(session.sessionId);
    } catch (error) {
      adminLogger.debug('Sessions module not available', { error: error.message });
    }

    // Update database status
    await prisma.session.update({
      where: { id },
      data: { status: 'disconnected' },
    });

    adminLogger.info('Session terminated', {
      adminId: req.admin.id,
      sessionId: id,
    });

    res.json({
      message: 'Session terminated successfully',
    });
  } catch (error) {
    adminLogger.error('Failed to terminate session', {
      error: error.message,
      adminId: req.admin.id,
      sessionId: req.params.id,
    });
    next(error);
  }
});

// GET /api/admin/sessions/:id/logs - Get session logs
router.get('/:id/logs', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { startTime, endTime, level } = req.query;

    adminLogger.info('Fetching session logs', {
      adminId: req.admin.id,
      sessionId: id,
      filters: { startTime, endTime, level },
    });

    // This would integrate with your logging system
    // For now, return mock data
    const logs = [
      {
        timestamp: new Date(),
        level: 'info',
        message: 'Session started',
        metadata: { sessionId: id },
      },
      // More logs...
    ];

    res.json({
      data: logs,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/sessions/:id/metrics - Get session metrics
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '1h' } = req.query;

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        metrics: {
          where: {
            timestamp: {
              gte: new Date(Date.now() - parsePeriod(period)),
            },
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    res.json({
      data: {
        sessionId: session.sessionId,
        period,
        metrics: session.metrics,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/sessions - Create a new session
router.post('/', sessionValidationRules.create, async (req, res, next) => {
  try {
    const { sessionId, userId, webhookUrl } = req.body;

    adminLogger.info('Creating new session', {
      adminId: req.admin.id,
      sessionId,
      userId,
    });

    // Check if session already exists
    const existingSession = await prisma.session.findFirst({
      where: { sessionId },
    });

    if (existingSession) {
      return res.status(409).json({
        error: {
          message: 'Session with this ID already exists',
          code: 'SESSION_EXISTS',
        },
      });
    }

    // Create session in database
    const session = await prisma.session.create({
      data: {
        sessionId,
        userId,
        name: sessionId, // Use sessionId as name for now
        webhookUrl,
        status: 'disconnected',
      },
    });

    try {
      // Start session in WWebJS
      const result = await wwebjsApiService.startSession(sessionId);
      
      // Update status
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'connecting' },
      });

      adminLogger.info('Session created and started', {
        adminId: req.admin.id,
        sessionId,
        result,
      });

      res.status(201).json({
        message: 'Session created successfully',
        data: {
          ...session,
          wwebjsResult: result,
        },
      });
    } catch (wwebjsError) {
      adminLogger.error('Failed to start session in WWebJS', {
        error: wwebjsError.message,
        sessionId,
      });

      res.status(201).json({
        message: 'Session created but not started',
        data: session,
        warning: 'Failed to start session in WWebJS: ' + wwebjsError.message,
      });
    }
  } catch (error) {
    adminLogger.error('Failed to create session', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/sessions/:id/qr - Get QR code for session
router.get('/:id/qr', async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    try {
      const qrData = await wwebjsApiService.getSessionQr(session.sessionId);
      res.json(qrData);
    } catch (error) {
      adminLogger.error('Failed to get QR code', {
        error: error.message,
        sessionId: session.sessionId,
      });
      res.status(503).json({
        error: {
          message: 'Failed to get QR code from WWebJS',
          code: 'WWEBJS_ERROR',
          details: error.message,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/sessions/:id/wwebjs-status - Get real-time status from WWebJS
router.get('/:id/wwebjs-status', async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    try {
      const status = await wwebjsApiService.getSessionStatus(session.sessionId);
      
      // Update database status if changed
      if (status.success && status.state) {
        const dbStatus = mapWwebjsStatusToDb(status.state);
        if (dbStatus !== session.status) {
          await prisma.session.update({
            where: { id },
            data: { status: dbStatus },
          });
        }
      }

      res.json({
        data: {
          sessionId: session.sessionId,
          wwebjsStatus: status,
          dbStatus: session.status,
        },
      });
    } catch (error) {
      adminLogger.error('Failed to get WWebJS status', {
        error: error.message,
        sessionId: session.sessionId,
      });
      res.status(503).json({
        error: {
          message: 'Failed to get status from WWebJS',
          code: 'WWEBJS_ERROR',
          details: error.message,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/sessions/:id/start - Start a session in WWebJS
router.post('/:id/start', async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    try {
      const result = await wwebjsApiService.startSession(session.sessionId);
      
      await prisma.session.update({
        where: { id },
        data: { status: 'connecting' },
      });

      res.json({
        message: 'Session start initiated',
        data: result,
      });
    } catch (error) {
      adminLogger.error('Failed to start session', {
        error: error.message,
        sessionId: session.sessionId,
      });
      res.status(503).json({
        error: {
          message: 'Failed to start session in WWebJS',
          code: 'WWEBJS_ERROR',
          details: error.message,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/sessions/:id/stop - Stop a session in WWebJS
router.post('/:id/stop', async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({
        error: {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        },
      });
    }

    try {
      const result = await wwebjsApiService.stopSession(session.sessionId);
      
      await prisma.session.update({
        where: { id },
        data: { status: 'disconnected' },
      });

      res.json({
        message: 'Session stopped',
        data: result,
      });
    } catch (error) {
      adminLogger.error('Failed to stop session', {
        error: error.message,
        sessionId: session.sessionId,
      });
      res.status(503).json({
        error: {
          message: 'Failed to stop session in WWebJS',
          code: 'WWEBJS_ERROR',
          details: error.message,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

// Helper function to map WWebJS status to database status
function mapWwebjsStatusToDb(wwebjsState) {
  const statusMap = {
    'CONFLICT': 'error',
    'CONNECTED': 'connected',
    'DEPRECATED_VERSION': 'error',
    'OPENING': 'connecting',
    'PAIRING': 'connecting',
    'UNPAIRED': 'disconnected',
    'UNPAIRED_IDLE': 'disconnected',
    'TIMEOUT': 'error',
  };
  return statusMap[wwebjsState] || 'disconnected';
}

// Helper function to parse period
function parsePeriod(period) {
  const units = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  const match = period.match(/^(\d+)([mhd])$/);
  if (!match) return 60 * 60 * 1000; // Default 1 hour
  return parseInt(match[1]) * units[match[2]];
}

module.exports = router;