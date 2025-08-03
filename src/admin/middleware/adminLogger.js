const { v4: uuidv4 } = require('uuid');

// Create a basic logger instance first
const createBasicLogger = () => {
  return {
    info: (message, metadata) => {
      console.log(`[INFO] ${message}`, metadata || '');
    },
    error: (message, metadata) => {
      console.error(`[ERROR] ${message}`, metadata || '');
    },
    warn: (message, metadata) => {
      console.warn(`[WARN] ${message}`, metadata || '');
    },
    debug: (message, metadata) => {
      console.debug(`[DEBUG] ${message}`, metadata || '');
    },
    logPerformance: (operation, duration, metadata) => {
      console.log(`[PERF] ${operation} took ${duration}ms`, metadata || '');
    },
    logDatabaseQuery: (queryData) => {
      console.log(`[DB] Query executed in ${queryData.duration}ms`, queryData);
    }
  };
};

const adminLogger = createBasicLogger();

// Request ID middleware
const requestIdMiddleware = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

// Admin action logging middleware
const logAdminAction = async (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  // Store request body for audit log
  req.auditData = {
    body: req.body,
    params: req.params,
    query: req.query,
  };

  // Log request
  adminLogger.info('Admin API Request', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userId: req.admin?.id,
    userEmail: req.admin?.email,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  // Intercept response
  const interceptResponse = (body) => {
    const responseTime = Date.now() - startTime;
    const logData = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      userId: req.admin?.id,
      userEmail: req.admin?.email,
    };

    if (res.statusCode >= 400) {
      adminLogger.error('Admin API Error Response', {
        ...logData,
        error: body,
      });
    } else {
      adminLogger.info('Admin API Response', logData);
    }

    // Log to audit trail for state-changing operations
    if (req.method !== 'GET' && req.admin) {
      createAuditLog(req, res, body);
    }
  };

  res.send = function(body) {
    interceptResponse(body);
    return originalSend.call(this, body);
  };

  res.json = function(body) {
    interceptResponse(body);
    return originalJson.call(this, body);
  };

  next();
};

// Create audit log entry
async function createAuditLog(req, res, responseBody) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const auditData = {
      adminId: req.admin.id,
      action: `${req.method} ${req.path}`,
      resource: extractResource(req.path),
      resourceId: req.params.id || extractResourceId(responseBody),
      changes: req.method === 'PUT' || req.method === 'PATCH' ? req.body : null,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    await prisma.adminAuditLog.create({ data: auditData });

    adminLogger.debug('Audit log created', {
      action: auditData.action,
      adminId: auditData.adminId,
    });
  } catch (error) {
    adminLogger.error('Failed to create audit log', { error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

// Helper functions
function extractResource(path) {
  const parts = path.split('/').filter(Boolean);
  return parts[2] || 'unknown'; // /api/admin/[resource]
}

function extractResourceId(responseBody) {
  if (typeof responseBody === 'object' && responseBody !== null) {
    return responseBody.id || responseBody.data?.id || null;
  }
  return null;
}

// Error logging middleware
const logError = (err, req, res, next) => {
  adminLogger.error('Admin API Error', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    userId: req.admin?.id,
    statusCode: err.statusCode || 500,
  });

  // Send error response
  res.status(err.statusCode || 500).json({
    error: {
      message: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR',
      requestId: req.requestId,
    },
  });
};

// Performance monitoring
const performanceMonitoring = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds

    adminLogger.logPerformance(`${req.method} ${req.path}`, duration, {
      statusCode: res.statusCode,
      userId: req.admin?.id,
    });

    // Log slow requests
    if (duration > 1000) {
      adminLogger.warn('Slow admin API request', {
        method: req.method,
        path: req.path,
        duration,
        userId: req.admin?.id,
      });
    }
  });

  next();
};

module.exports = {
  adminLogger,
  requestIdMiddleware,
  logAdminAction,
  logError,
  performanceMonitoring,
};