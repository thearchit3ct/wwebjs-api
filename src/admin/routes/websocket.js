const express = require('express');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { adminLogger } = require('../middleware/adminLogger');

const router = express.Router();
const wss = new WebSocketServer({ noServer: true });

// Store authenticated connections
const clients = new Map();

// Handle WebSocket connections
wss.on('connection', (ws, req, adminData) => {
  const clientId = adminData.id;
  clients.set(clientId, ws);
  
  adminLogger.info('WebSocket connection established', {
    adminId: adminData.id,
    email: adminData.email,
    role: adminData.role,
  });

  // Send initial connection success
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
  }));

  // Handle ping/pong for connection health
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      adminLogger.debug('WebSocket message received', {
        adminId: adminData.id,
        type: data.type,
      });

      // Handle different message types
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'subscribe':
          // Handle subscription to specific events
          if (data.channel) {
            ws.subscribedChannels = ws.subscribedChannels || new Set();
            ws.subscribedChannels.add(data.channel);
          }
          break;
        case 'unsubscribe':
          // Handle unsubscription
          if (data.channel && ws.subscribedChannels) {
            ws.subscribedChannels.delete(data.channel);
          }
          break;
      }
    } catch (error) {
      adminLogger.error('Invalid WebSocket message', {
        adminId: adminData.id,
        error: error.message,
      });
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    adminLogger.info('WebSocket connection closed', {
      adminId: adminData.id,
    });
  });

  ws.on('error', (error) => {
    adminLogger.error('WebSocket error', {
      adminId: adminData.id,
      error: error.message,
    });
  });
});

// Broadcast function for sending updates to all clients
function broadcast(type, data, channel = null) {
  const message = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString(),
  });

  clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      // If channel is specified, only send to subscribed clients
      if (!channel || (ws.subscribedChannels && ws.subscribedChannels.has(channel))) {
        ws.send(message);
      }
    }
  });
}

// Broadcast to specific admin
function sendToAdmin(adminId, type, data) {
  const ws = clients.get(adminId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString(),
    }));
  }
}

// Health check interval
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// HTTP endpoint for upgrade handling
router.get('/websocket', (req, res) => {
  res.status(426).json({
    error: {
      message: 'WebSocket upgrade required',
      code: 'UPGRADE_REQUIRED',
    },
  });
});

// Handle upgrade function for server.js
function handleUpgrade(request, socket, head) {
  // Extract token from query or header
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get('token') || request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, decoded);
    });
  } catch (error) {
    adminLogger.error('WebSocket authentication failed', { error: error.message });
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
}

module.exports = {
  router,
  handleUpgrade,
  broadcast,
  sendToAdmin,
};