const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { adminLogger } = require('./adminLogger');

const prisma = new PrismaClient();

const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'No token provided',
          code: 'NO_TOKEN',
        },
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Get admin with permissions
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.id },
      include: {
        permissions: true,
        sessions: {
          where: {
            id: decoded.sessionId,
            expiresAt: { gt: new Date() },
          },
        },
      },
    });

    if (!admin || !admin.isActive || admin.sessions.length === 0) {
      return res.status(401).json({
        error: {
          message: 'Invalid token',
          code: 'INVALID_TOKEN',
        },
      });
    }

    // Update session last used
    await prisma.adminSession.update({
      where: { id: decoded.sessionId },
      data: { lastUsed: new Date() },
    });

    // Attach admin to request
    req.admin = admin;
    req.sessionId = decoded.sessionId;

    adminLogger.debug('Admin authenticated', {
      adminId: admin.id,
      role: admin.role,
    });

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          message: 'Token expired',
          code: 'TOKEN_EXPIRED',
        },
      });
    }

    adminLogger.error('Authentication failed', {
      error: error.message,
    });

    return res.status(401).json({
      error: {
        message: 'Authentication failed',
        code: 'AUTH_FAILED',
      },
    });
  }
};

const authorize = (resource, action) => {
  return async (req, res, next) => {
    const admin = req.admin;

    // Super admin has all permissions
    if (admin.role === 'SUPER_ADMIN') {
      return next();
    }

    // Check specific permission
    const hasPermission = admin.permissions.some(
      (p) => p.resource === resource && p.action === action && p.granted
    );

    if (!hasPermission) {
      adminLogger.warn('Authorization failed', {
        adminId: admin.id,
        resource,
        action,
        role: admin.role,
      });

      return res.status(403).json({
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: `${resource}:${action}`,
        },
      });
    }

    adminLogger.debug('Authorization successful', {
      adminId: admin.id,
      resource,
      action,
    });

    next();
  };
};

// Shorthand authorization middleware
const authorizeResource = (resource) => {
  return (req, res, next) => {
    const methodToAction = {
      GET: 'READ',
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };

    const action = methodToAction[req.method] || 'EXECUTE';
    return authorize(resource, action)(req, res, next);
  };
};

module.exports = {
  authenticate,
  authorize,
  authorizeResource,
};