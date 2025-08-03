const client = require('prom-client');
const { adminLogger } = require('../middleware/adminLogger');

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'admin_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

const activeAdminSessions = new client.Gauge({
  name: 'admin_active_sessions',
  help: 'Number of active admin sessions',
});

const adminLoginAttempts = new client.Counter({
  name: 'admin_login_attempts_total',
  help: 'Total number of admin login attempts',
  labelNames: ['status'],
});

const adminActions = new client.Counter({
  name: 'admin_actions_total',
  help: 'Total number of admin actions',
  labelNames: ['action', 'resource'],
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(activeAdminSessions);
register.registerMetric(adminLoginAttempts);
register.registerMetric(adminActions);

// Metrics middleware
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });

  next();
};

// Export metrics endpoint
const metricsEndpoint = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    adminLogger.error('Error generating metrics', { error: error.message });
    res.status(500).end();
  }
};

module.exports = {
  register,
  metricsMiddleware,
  metricsEndpoint,
  metrics: {
    httpRequestDuration,
    activeAdminSessions,
    adminLoginAttempts,
    adminActions,
  },
};