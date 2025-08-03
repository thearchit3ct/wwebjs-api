const { broadcast: adminBroadcast } = require('../routes/websocket');
const { logger } = require('../../logger');

// Broadcast session status updates to admin dashboard
function broadcastSessionUpdate(sessionId, status, data = {}) {
  try {
    adminBroadcast('session:statusUpdate', {
      sessionId,
      status,
      timestamp: new Date().toISOString(),
      ...data
    }, 'sessions');
    
    logger.debug('Broadcasted session update to admin dashboard', {
      sessionId,
      status
    });
  } catch (error) {
    logger.error('Failed to broadcast session update', {
      sessionId,
      status,
      error: error.message
    });
  }
}

// Broadcast system metrics to admin dashboard
function broadcastSystemMetrics(metrics) {
  try {
    adminBroadcast('system:metrics', metrics, 'dashboard');
    
    logger.debug('Broadcasted system metrics to admin dashboard');
  } catch (error) {
    logger.error('Failed to broadcast system metrics', {
      error: error.message
    });
  }
}

// Broadcast alert to admin dashboard
function broadcastAlert(alert) {
  try {
    adminBroadcast('alert:new', alert);
    
    logger.warn('Broadcasted alert to admin dashboard', {
      type: alert.type,
      severity: alert.severity
    });
  } catch (error) {
    logger.error('Failed to broadcast alert', {
      error: error.message
    });
  }
}

module.exports = {
  broadcastSessionUpdate,
  broadcastSystemMetrics,
  broadcastAlert
};