const { trace, context, SpanStatusCode } = require('@opentelemetry/api')
const { logger } = require('../logger')

// Create a tracer
const tracer = trace.getTracer('wwebjs-whatsapp', '1.0.0')

// WhatsApp operation tracing
class WhatsAppTracer {
  // Trace session operations
  static traceSessionOperation(operationName, sessionId, fn) {
    const span = tracer.startSpan(`whatsapp.session.${operationName}`, {
      attributes: {
        'session.id': sessionId,
        'session.operation': operationName,
        'component': 'whatsapp-web.js'
      }
    })

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.recordException(error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        })
        throw error
      } finally {
        span.end()
      }
    })
  }

  // Trace message operations
  static traceMessageOperation(operationName, sessionId, messageData, fn) {
    const span = tracer.startSpan(`whatsapp.message.${operationName}`, {
      attributes: {
        'session.id': sessionId,
        'message.operation': operationName,
        'message.type': messageData.type || 'text',
        'message.has_media': messageData.hasMedia || false,
        'message.direction': messageData.direction || 'outgoing',
        'component': 'whatsapp-web.js'
      }
    })

    if (messageData.to) {
      span.setAttribute('message.to', messageData.to)
    }
    if (messageData.chatId) {
      span.setAttribute('message.chat_id', messageData.chatId)
    }

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn()
        span.setStatus({ code: SpanStatusCode.OK })
        if (result?.id) {
          span.setAttribute('message.id', result.id._serialized)
        }
        return result
      } catch (error) {
        span.recordException(error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        })
        throw error
      } finally {
        span.end()
      }
    })
  }

  // Trace webhook operations
  static traceWebhookOperation(webhookUrl, eventType, sessionId, fn) {
    const span = tracer.startSpan('whatsapp.webhook.send', {
      attributes: {
        'webhook.url': webhookUrl,
        'webhook.event_type': eventType,
        'session.id': sessionId,
        'component': 'webhook'
      }
    })

    return context.with(trace.setSpan(context.active(), span), async () => {
      const startTime = Date.now()
      try {
        const result = await fn()
        const duration = Date.now() - startTime
        span.setAttribute('webhook.duration_ms', duration)
        span.setAttribute('webhook.success', true)
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        const duration = Date.now() - startTime
        span.setAttribute('webhook.duration_ms', duration)
        span.setAttribute('webhook.success', false)
        span.setAttribute('webhook.error_type', error.name)
        if (error.response) {
          span.setAttribute('webhook.response_status', error.response.status)
        }
        span.recordException(error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        })
        throw error
      } finally {
        span.end()
      }
    })
  }

  // Trace QR code generation
  static traceQRGeneration(sessionId, fn) {
    const span = tracer.startSpan('whatsapp.qr.generate', {
      attributes: {
        'session.id': sessionId,
        'auth.type': 'qr',
        'component': 'whatsapp-web.js'
      }
    })

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.recordException(error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        })
        throw error
      } finally {
        span.end()
      }
    })
  }

  // Trace media operations
  static traceMediaOperation(operationName, sessionId, mediaInfo, fn) {
    const span = tracer.startSpan(`whatsapp.media.${operationName}`, {
      attributes: {
        'session.id': sessionId,
        'media.operation': operationName,
        'media.mimetype': mediaInfo.mimetype || 'unknown',
        'media.size': mediaInfo.size || 0,
        'component': 'whatsapp-web.js'
      }
    })

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.recordException(error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        })
        throw error
      } finally {
        span.end()
      }
    })
  }

  // Create a child span for sub-operations
  static createChildSpan(name, attributes = {}) {
    return tracer.startSpan(name, {
      attributes: {
        ...attributes,
        'component': 'wwebjs-api'
      }
    })
  }
}

module.exports = WhatsAppTracer