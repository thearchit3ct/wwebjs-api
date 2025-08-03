const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('pino')();

// Test endpoint to trigger notifications
router.post('/test', [
  body('type').isIn(['info', 'success', 'warning', 'error']).withMessage('Invalid notification type'),
  body('title').optional().isString().withMessage('Title must be a string'),
  body('message').notEmpty().withMessage('Message is required'),
  body('targetAdminId').optional().isString().withMessage('Target admin ID must be a string'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { type, title, message, targetAdminId } = req.body;

    const notification = {
      id: Date.now().toString(),
      type: type || 'info',
      title: title || `Test ${type} Notification`,
      message: message,
      timestamp: new Date().toISOString(),
    };

    // Try to use WebSocket if available
    const { broadcast, sendToAdmin } = require('../routes/websocket');
    
    if (targetAdminId) {
      sendToAdmin(targetAdminId, 'admin:notification', notification);
      logger.info(`Sent test notification to admin ${targetAdminId}`, notification);
    } else {
      broadcast('admin:notification', notification, 'admins');
      logger.info('Broadcast test notification to all admins', notification);
    }

    res.json({ 
      success: true, 
      notification,
      message: targetAdminId ? `Notification sent to admin ${targetAdminId}` : 'Notification broadcast to all admins'
    });
  } catch (error) {
    logger.error('Error sending test notification:', error);
    res.status(500).json({ 
      error: 'Failed to send notification',
      details: error.message 
    });
  }
});

// Trigger various WebSocket events for testing
router.post('/trigger-event', [
  body('event').notEmpty().withMessage('Event type is required'),
  body('data').optional().isObject().withMessage('Data must be an object'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { event, data } = req.body;
    const { broadcast } = require('../routes/websocket');

    // Define test events
    const testEvents = {
      'session:connected': {
        sessionId: 'test-session-1',
        sessionName: 'Test Session',
        status: 'connected',
        timestamp: new Date().toISOString(),
      },
      'session:disconnected': {
        sessionId: 'test-session-1',
        sessionName: 'Test Session',
        status: 'disconnected',
        timestamp: new Date().toISOString(),
      },
      'session:qr': {
        sessionId: 'test-session-1',
        sessionName: 'Test Session',
        status: 'qr',
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        timestamp: new Date().toISOString(),
      },
      'alert:high-error-rate': {
        message: 'High error rate detected: 15% in the last 5 minutes',
        severity: 'warning',
        errorRate: 15,
        timestamp: new Date().toISOString(),
      },
      'metrics:spike': {
        metric: 'cpu',
        value: 95,
        threshold: 80,
        message: 'CPU usage spike detected',
        timestamp: new Date().toISOString(),
      },
    };

    let eventData;
    if (event === 'custom') {
      eventData = data || {};
    } else if (testEvents[event]) {
      eventData = testEvents[event];
    } else {
      return res.status(400).json({ 
        error: 'Invalid event type',
        availableEvents: Object.keys(testEvents).concat(['custom']) 
      });
    }

    // Send event based on type
    switch (event) {
      case 'session:connected':
      case 'session:disconnected':
      case 'session:qr':
        broadcast('session:status', eventData, 'admins');
        break;
      case 'alert:high-error-rate':
        broadcast('alert:new', eventData, 'admins');
        break;
      case 'metrics:spike':
        broadcast('system:metrics', eventData, 'admins');
        break;
      case 'custom':
        broadcast(data.eventName || 'custom:event', eventData, 'admins');
        break;
    }

    logger.info(`Triggered test event: ${event}`, eventData);
    res.json({ 
      success: true, 
      event,
      data: eventData 
    });
  } catch (error) {
    logger.error('Error triggering test event:', error);
    res.status(500).json({ 
      error: 'Failed to trigger event',
      details: error.message 
    });
  }
});

module.exports = router;