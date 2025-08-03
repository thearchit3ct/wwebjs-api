const { body, param, query, validationResult } = require('express-validator');
const { adminLogger } = require('./adminLogger');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn('Validation failed', {
      errors: errors.array(),
      path: req.path,
      method: req.method,
    });

    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      },
    });
  }
  next();
};

// Admin validation rules
const adminValidationRules = {
  register: [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number and special character'),
    body('name').notEmpty().trim(),
    body('role').optional().isIn(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'VIEWER']),
    handleValidationErrors,
  ],

  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    handleValidationErrors,
  ],

  updateAdmin: [
    param('id').isUUID(),
    body('email').optional().isEmail().normalizeEmail(),
    body('name').optional().notEmpty().trim(),
    body('role').optional().isIn(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'VIEWER']),
    body('isActive').optional().isBoolean(),
    handleValidationErrors,
  ],

  changePassword: [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
    handleValidationErrors,
  ],
};

// User validation rules
const userValidationRules = {
  create: [
    body('email').isEmail().normalizeEmail(),
    body('name').notEmpty().trim(),
    body('plan').optional().isIn(['free', 'starter', 'pro', 'enterprise']),
    body('maxSessions').optional().isInt({ min: 1, max: 100 }),
    body('maxMessages').optional().isInt({ min: 100 }),
    handleValidationErrors,
  ],

  update: [
    param('id').isUUID(),
    body('email').optional().isEmail().normalizeEmail(),
    body('name').optional().notEmpty().trim(),
    body('status').optional().isIn(['active', 'suspended', 'deleted']),
    body('plan').optional().isIn(['free', 'starter', 'pro', 'enterprise']),
    body('maxSessions').optional().isInt({ min: 1, max: 100 }),
    body('maxMessages').optional().isInt({ min: 100 }),
    handleValidationErrors,
  ],

  list: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().trim(),
    query('status').optional().isIn(['active', 'suspended', 'deleted']),
    query('plan').optional().isIn(['free', 'starter', 'pro', 'enterprise']),
    query('sortBy').optional().isIn(['createdAt', 'email', 'name', 'lastLogin']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    handleValidationErrors,
  ],
};

// Session validation rules
const sessionValidationRules = {
  list: [
    query('userId').optional().isUUID(),
    query('status').optional().isIn(['connected', 'connecting', 'disconnected', 'qr_pending']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    handleValidationErrors,
  ],

  create: [
    body('sessionId').notEmpty().matches(/^[a-zA-Z0-9_-]+$/).withMessage('Session ID must be alphanumeric with hyphens or underscores'),
    body('userId').notEmpty().matches(/^[a-zA-Z0-9]+$/).withMessage('Valid user ID is required'),
    body('name').optional().trim(),
    body('webhookUrl').optional().isURL().withMessage('Webhook URL must be a valid URL'),
    handleValidationErrors,
  ],

  action: [
    param('id').isUUID(),
    body('action').isIn(['start', 'stop', 'restart', 'delete']),
    handleValidationErrors,
  ],
};

module.exports = {
  adminValidationRules,
  userValidationRules,
  sessionValidationRules,
  handleValidationErrors,
};