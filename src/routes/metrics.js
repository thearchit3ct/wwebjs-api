const express = require('express')
const router = express.Router()
const { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } = require('prom-client')
const sessions = require('../sessions')

// Create a Registry
const register = new Registry()

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register })

// Custom metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
})

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register]
})

const activeSessionsGauge = new Gauge({
  name: 'wwebjs_active_sessions',
  help: 'Number of active WhatsApp sessions',
  registers: [register],
  collect() {
    // Update the gauge with the current number of sessions
    this.set(sessions.sessions.size)
  }
})

const sessionStartsTotal = new Counter({
  name: 'wwebjs_session_starts_total',
  help: 'Total number of session starts',
  labelNames: ['auth_type'],
  registers: [register]
})

const sessionFailuresTotal = new Counter({
  name: 'wwebjs_session_failures_total',
  help: 'Total number of session failures',
  labelNames: ['reason'],
  registers: [register]
})

const messagesProcessedTotal = new Counter({
  name: 'wwebjs_messages_processed_total',
  help: 'Total number of messages processed',
  labelNames: ['type', 'direction'],
  registers: [register]
})

const messageQueueSize = new Gauge({
  name: 'wwebjs_message_queue_size',
  help: 'Current size of the message processing queue',
  registers: [register]
})

const webhookRequestsTotal = new Counter({
  name: 'wwebjs_webhook_requests_total',
  help: 'Total number of webhook requests',
  labelNames: ['event_type'],
  registers: [register]
})

const webhookFailuresTotal = new Counter({
  name: 'wwebjs_webhook_failures_total',
  help: 'Total number of webhook failures',
  labelNames: ['event_type', 'status_code'],
  registers: [register]
})

// Middleware to track HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now()
  const route = req.route?.path || req.path
  
  // Intercept the response
  const originalSend = res.send
  res.send = function(data) {
    const duration = (Date.now() - start) / 1000
    
    // Record metrics
    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status: res.statusCode.toString()
    })
    
    httpRequestDuration.observe({
      method: req.method,
      route: route,
      status: res.statusCode.toString()
    }, duration)
    
    return originalSend.call(this, data)
  }
  
  next()
}

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType)
    const metrics = await register.metrics()
    res.end(metrics)
  } catch (err) {
    res.status(500).end(err)
  }
})

// Export metrics functions for use in other modules
module.exports = {
  router,
  metricsMiddleware,
  metrics: {
    sessionStartsTotal,
    sessionFailuresTotal,
    messagesProcessedTotal,
    messageQueueSize,
    webhookRequestsTotal,
    webhookFailuresTotal
  }
}