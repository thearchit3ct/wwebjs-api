require('./routes')
const express = require('express')
const cors = require('cors')
const { routes } = require('./routes')
const { maxAttachmentSize } = require('./config')

const app = express()

// Initialize Express app
app.disable('x-powered-by')

// Global CORS configuration for admin dashboard
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://95.216.147.29:3001',
    process.env.ADMIN_FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Request-ID']
}))

app.use(express.json({ limit: maxAttachmentSize + 1000000 }))
app.use(express.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }))

// Add metrics middleware before routes
try {
  const { metricsMiddleware, router: metricsRouter } = require('./routes/metrics')
  app.use(metricsMiddleware)
  app.use(metricsRouter)
} catch (error) {
  console.log('Metrics not available:', error.message)
}

// Mount main routes
app.use('/', routes)

// Mount admin routes
try {
  const adminRoutes = require('./admin/routes')
  app.use('/api/admin', adminRoutes)
} catch (error) {
  console.log('Admin routes not available:', error.message)
}

module.exports = app
