const { NodeSDK } = require('@opentelemetry/sdk-node')
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { logger } = require('../logger')

// OTLP endpoint configuration
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo:4318'
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'wwebjs-api'
const OTEL_SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0'
const OTEL_ENVIRONMENT = process.env.NODE_ENV || 'production'

// Resource configuration
const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: OTEL_SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: OTEL_ENVIRONMENT,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'wwebjs',
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'default'
  })
)

// Trace exporter
const traceExporter = new OTLPTraceExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  headers: {},
})

// Metric exporter - Prometheus format
const promExporter = new PrometheusExporter({
  port: 9464, // Different port from main metrics
  endpoint: '/otel-metrics',
  preventServerStart: true, // We'll use our existing Express server
}, () => {
  logger.info('OpenTelemetry Prometheus metrics server started')
})

// Metric exporter - OTLP format for Tempo
const otlpMetricExporter = new OTLPMetricExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  headers: {},
})

// Initialize SDK
const sdk = new NodeSDK({
  resource,
  spanProcessor: new BatchSpanProcessor(traceExporter),
  metricReader: new PeriodicExportingMetricReader({
    exporter: otlpMetricExporter,
    exportIntervalMillis: 10000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable fs instrumentation to reduce noise
      },
      '@opentelemetry/instrumentation-net': {
        enabled: false, // Disable net instrumentation to reduce noise
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: false, // Disable DNS instrumentation
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
        requestHook: (span, express) => {
          // Add custom attributes to spans
          span.setAttribute('http.route', express.req.route?.path || express.req.path)
          span.setAttribute('session.id', express.req.params?.sessionId || 'none')
        }
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        requestHook: (span, request) => {
          // Add custom attributes for outgoing HTTP requests
          if (request.path?.includes('webhook')) {
            span.setAttribute('webhook.enabled', true)
          }
        }
      },
      '@opentelemetry/instrumentation-winston': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pino': {
        enabled: true,
      }
    })
  ],
})

// Initialize tracing
const initTracing = async () => {
  try {
    await sdk.start()
    logger.info({
      endpoint: OTEL_EXPORTER_OTLP_ENDPOINT,
      service: OTEL_SERVICE_NAME,
      version: OTEL_SERVICE_VERSION
    }, 'OpenTelemetry tracing initialized')
  } catch (error) {
    logger.error(error, 'Failed to initialize OpenTelemetry tracing')
  }
}

// Graceful shutdown
const shutdownTracing = async () => {
  try {
    await sdk.shutdown()
    logger.info('OpenTelemetry tracing shut down successfully')
  } catch (error) {
    logger.error(error, 'Error shutting down OpenTelemetry tracing')
  }
}

// Custom span creation helper
const createSpan = (tracer, spanName, attributes = {}) => {
  const span = tracer.startSpan(spanName)
  Object.entries(attributes).forEach(([key, value]) => {
    span.setAttribute(key, value)
  })
  return span
}

// Export utilities
module.exports = {
  initTracing,
  shutdownTracing,
  createSpan,
  promExporter
}