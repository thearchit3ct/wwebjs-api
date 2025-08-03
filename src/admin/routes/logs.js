const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authorizeResource } = require('../middleware/auth');
const { adminLogger } = require('../middleware/adminLogger');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();
const prisma = new PrismaClient();

// Apply authorization
router.use(authorizeResource('LOGS'));

// GET /api/admin/logs/sources - Get available log sources
router.get('/sources', async (req, res, next) => {
  try {
    adminLogger.info('Fetching log sources', {
      adminId: req.admin.id,
    });

    // Get unique services from audit logs
    const auditLogSources = await prisma.adminAuditLog.findMany({
      select: { resource: true },
      distinct: ['resource'],
    });

    const sources = [
      { value: 'audit', label: 'Audit Logs', count: auditLogSources.length },
      { value: 'admin', label: 'Admin API', count: 0 },
      { value: 'session', label: 'Session Logs', count: 0 },
      { value: 'webhook', label: 'Webhook Logs', count: 0 },
      { value: 'system', label: 'System Logs', count: 0 },
    ];

    res.json({
      success: true,
      data: sources,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/logs - Get logs with filtering
router.get('/', async (req, res, next) => {
  try {
    const {
      level,
      service,
      startTime,
      endTime,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    adminLogger.info('Fetching logs', {
      adminId: req.admin.id,
      filters: { level, service, search },
    });

    // For database logs (audit logs)
    const where = {};
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { resource: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [auditLogs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          admin: {
            select: { email: true, name: true },
          },
        },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    res.json({
      data: auditLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    adminLogger.error('Failed to fetch logs', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/logs/audit - Get audit logs
router.get('/audit', async (req, res, next) => {
  try {
    const {
      adminId,
      resource,
      action,
      startTime,
      endTime,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};
    if (adminId) where.adminId = adminId;
    if (resource) where.resource = resource;
    if (action) where.action = { contains: action };
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { email: true, name: true, role: true } },
        },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    res.json({
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/logs/login - Get login logs
router.get('/login', async (req, res, next) => {
  try {
    const { adminId, success, startTime, endTime, page = 1, limit = 50 } = req.query;

    const where = {};
    if (adminId) where.adminId = adminId;
    if (success !== undefined) where.success = success === 'true';
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }

    const [logs, total] = await Promise.all([
      prisma.adminLoginLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { email: true, name: true } },
        },
      }),
      prisma.adminLoginLog.count({ where }),
    ]);

    res.json({
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/logs/system - Get system logs from files
router.get('/system', async (req, res, next) => {
  try {
    const { file = 'admin-api', date = new Date().toISOString().split('T')[0] } = req.query;

    adminLogger.info('Reading system logs', {
      adminId: req.admin.id,
      file,
      date,
    });

    const logPath = path.join(process.cwd(), 'logs', `${file}-${date}.log`);
    
    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const logs = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { message: line };
          }
        })
        .reverse(); // Most recent first

      res.json({
        data: logs.slice(0, 1000), // Limit to 1000 entries
        file: `${file}-${date}.log`,
        totalLines: logs.length,
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({
          error: {
            message: 'Log file not found',
            code: 'LOG_FILE_NOT_FOUND',
          },
        });
      }
      throw error;
    }
  } catch (error) {
    adminLogger.error('Failed to read system logs', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// GET /api/admin/logs/export - Export logs
router.get('/export', async (req, res, next) => {
  try {
    const { type = 'audit', format = 'json', startTime, endTime } = req.query;

    adminLogger.info('Exporting logs', {
      adminId: req.admin.id,
      type,
      format,
    });

    let data;
    switch (type) {
      case 'audit':
        data = await prisma.adminAuditLog.findMany({
          where: {
            createdAt: {
              gte: startTime ? new Date(startTime) : undefined,
              lte: endTime ? new Date(endTime) : undefined,
            },
          },
          include: {
            admin: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        break;
      case 'login':
        data = await prisma.adminLoginLog.findMany({
          where: {
            createdAt: {
              gte: startTime ? new Date(startTime) : undefined,
              lte: endTime ? new Date(endTime) : undefined,
            },
          },
          include: {
            admin: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        break;
      default:
        return res.status(400).json({
          error: {
            message: 'Invalid log type',
            code: 'INVALID_LOG_TYPE',
          },
        });
    }

    if (format === 'csv') {
      const csv = convertLogsToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-logs-${Date.now()}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-logs-${Date.now()}.json"`);
      res.json(data);
    }
  } catch (error) {
    adminLogger.error('Failed to export logs', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// DELETE /api/admin/logs/purge - Purge old logs
router.delete('/purge', async (req, res, next) => {
  try {
    const { type = 'all', olderThan = 30 } = req.body;

    adminLogger.warn('Purging logs', {
      adminId: req.admin.id,
      type,
      olderThan,
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThan);

    const deleteCounts = {};

    if (type === 'all' || type === 'audit') {
      const result = await prisma.adminAuditLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      });
      deleteCounts.audit = result.count;
    }

    if (type === 'all' || type === 'login') {
      const result = await prisma.adminLoginLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      });
      deleteCounts.login = result.count;
    }

    adminLogger.info('Logs purged', {
      adminId: req.admin.id,
      deleteCounts,
    });

    res.json({
      message: 'Logs purged successfully',
      data: deleteCounts,
    });
  } catch (error) {
    adminLogger.error('Failed to purge logs', {
      error: error.message,
      adminId: req.admin.id,
    });
    next(error);
  }
});

// Helper function to convert logs to CSV
function convertLogsToCSV(logs) {
  if (!logs || logs.length === 0) return 'No data';

  const headers = [
    'Timestamp',
    'Admin',
    'Action',
    'Resource',
    'Resource ID',
    'IP Address',
    'User Agent',
  ];

  const rows = logs.map(log => [
    log.createdAt.toISOString(),
    log.admin?.email || 'N/A',
    log.action || log.email || 'N/A',
    log.resource || (log.success !== undefined ? (log.success ? 'Success' : 'Failed') : 'N/A'),
    log.resourceId || 'N/A',
    log.ipAddress,
    log.userAgent,
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
}

module.exports = router;