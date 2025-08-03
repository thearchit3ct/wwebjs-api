const app = require('./src/app')
const { baseWebhookURL, enableWebHook, enableWebSocket, autoStartSessions } = require('./src/config')
const { logger } = require('./src/logger')
const { handleUpgrade } = require('./src/websocket')
const { restoreSessions } = require('./src/sessions')

require('dotenv').config()

// Initialize OpenTelemetry if enabled
if (process.env.OTEL_ENABLED === 'true') {
  const { initTracing } = require('./src/tracing/otel')
  initTracing().catch(err => logger.error(err, 'Failed to initialize OpenTelemetry'))
}

// Start the server
const port = process.env.PORT || 3000

// Check if BASE_WEBHOOK_URL environment variable is available when WebHook is enabled
if (!baseWebhookURL && enableWebHook) {
  logger.error('BASE_WEBHOOK_URL environment variable is not set. Exiting...')
  process.exit(1) // Terminate the application with an error code
}

const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`Server running on 0.0.0.0:${port}`)
  logger.debug({ configuration: require('./src/config') }, 'Service configuration')
  if (autoStartSessions) {
    logger.info('Starting all sessions')
    restoreSessions()
  }
  
  // Start admin metrics service if admin routes are enabled
  if (process.env.DATABASE_URL) {
    const metricsService = require('./src/admin/services/metricsService')
    metricsService.start()
  }
  
  // WebSocket for admin dashboard is handled via the upgrade event below
})

if (enableWebSocket) {
  server.on('upgrade', (request, socket, head) => {
    // Check if it's an admin WebSocket request
    if (request.url.startsWith('/api/admin/websocket')) {
      const { handleUpgrade: adminHandleUpgrade } = require('./src/admin/routes/websocket')
      adminHandleUpgrade(request, socket, head)
    } else {
      handleUpgrade(request, socket, head)
    }
  })
}

// puppeteer uses subscriptions to SIGINT, SIGTERM, and SIGHUP to know when to close browser instances
// this disables the warnings when you starts more than 10 browser instances
process.setMaxListeners(0)

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...')
  
  // Stop admin metrics service if running
  if (process.env.DATABASE_URL) {
    const metricsService = require('./src/admin/services/metricsService')
    metricsService.stop()
  }
  
  // Shutdown OpenTelemetry if enabled
  if (process.env.OTEL_ENABLED === 'true') {
    const { shutdownTracing } = require('./src/tracing/otel')
    await shutdownTracing().catch(err => logger.error(err, 'Error shutting down OpenTelemetry'))
  }
  
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
