const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const {
  adminLogger,
  requestIdMiddleware,
  logAdminAction,
  logError,
  performanceMonitoring,
} = require('../middleware/adminLogger');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Security middleware
router.use(helmet());
router.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.ADMIN_FRONTEND_URL || 'http://localhost:3001',
      'http://95.216.147.29:3001',
      'http://localhost:3001'
    ];
    
    // Allow requests with no origin (like mobile apps)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for now
    }
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

router.use('/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // stricter limit for login
  message: 'Too many login attempts',
}));

router.use(limiter);

// Logging middleware
router.use(requestIdMiddleware);
router.use(performanceMonitoring);
router.use(logAdminAction);

// Health check (no auth required)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Auth routes (no auth required)
router.use('/auth', require('./auth'));

// Protected routes
router.use(authenticate);
router.use('/users', require('./users'));
router.use('/sessions', require('./sessions'));
router.use('/system', require('./system'));
router.use('/analytics', require('./analytics'));
router.use('/logs', require('./logs'));
router.use('/settings', require('./settings'));
router.use('/roles', require('./roles'));
router.use('/permissions', require('./permissions'));
router.use('/notifications', require('./notifications'));

// WebSocket route
const { router: websocketRouter } = require('./websocket');
router.use('/', websocketRouter);

// Error handling
router.use(logError);

// 404 handler
router.use((req, res) => {
  adminLogger.warn('404 Not Found', {
    path: req.path,
    method: req.method,
  });
  
  res.status(404).json({
    error: {
      message: 'Not found',
      code: 'NOT_FOUND',
    },
  });
});

module.exports = router;